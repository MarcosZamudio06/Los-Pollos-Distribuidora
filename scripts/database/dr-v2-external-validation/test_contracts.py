"""Offline contracts only: no cloud, Docker, business data or live credentials."""
import copy
import datetime as dt
import hashlib
import hmac
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from contracts import Blocked, validate_config, pgbackrest_config, native_host
from metrics import PHASES, validate_measurement, validate_negative, p95
from probe import probe, authenticate_catalog
from environment_gate import validate_environment, REQUIRED_SECRETS
from custody import checked_file


def config():
    c=json.loads(Path(__file__).with_name('config.example.json').read_text())
    c['audited_sha']='a'*40
    c['approval']={'approved':True,'reference':'approval-test-only',
                   'expires_at':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(hours=1)).isoformat()}
    for n in c['images']:c['images'][n]='ghcr.io/test/'+n+'@sha256:'+hashlib.sha256(n.encode()).hexdigest()
    c['storage']['endpoint']='https://s3.us-west-004.backblazeb2.com'
    return c


def measurement():
    return {'schema':'dr2-measurement/v1','run_id':'dr2-ext-contract-001','company':'lab-company-a',
            'observer_clock_id':'independent-observer-1','clock_error_seconds':0.1,
            'incident_utc':'2026-10-28T00:10:00Z','frontier_utc':'2026-10-28T00:06:00Z',
            'incident_monotonic_ns':1000000000,'service_monotonic_ns':601000000000,
            'service_utc':'2026-10-28T00:20:00Z',
            'source_host':'source-1','target_host':'target-2','source_loss_verified':True,
            'traffic_cutover_performed':False,'public_traffic_open':False,
            'authenticated_external_receipts':True,
            'phases':[{'phase':p,'status':'PASS','seconds':1.0,'evidence_sha256':hashlib.sha256(p.encode()).hexdigest()}
                      for p in PHASES]}


class PreparationContracts(unittest.TestCase):
    def test_template_is_not_approval(self):
        with self.assertRaises(Blocked):validate_config(json.loads(Path(__file__).with_name('config.example.json').read_text()),'a'*40)

    def test_valid_configuration_and_tls_config_have_no_credentials(self):
        c=config();validate_config(c,'a'*40)
        s=pgbackrest_config(c)
        self.assertIn('repo1-storage-verify-tls=y',s)
        self.assertIn('archive-async=n',s)
        self.assertNotIn('key-secret=',s)
        self.assertNotIn('cipher-pass=',s)

    def test_wrong_sha_missing_digest_expired_approval_and_production_role_reject(self):
        for mutate in [lambda c:c.update(audited_sha='b'*40),lambda c:c['images'].update(database='postgres:16'),
                       lambda c:c['approval'].update(expires_at='2000-01-01T00:00:00Z'),
                       lambda c:c['hosts']['source'].update(role='production')]:
            c=config();mutate(c)
            with self.assertRaises(Blocked):validate_config(c,'a'*40)

    def test_insecure_local_endpoint_and_same_host_or_bucket_reject(self):
        for url in ['http://s3.us-west-004.backblazeb2.com','https://127.0.0.1','https://localhost',
                    'https://user:password@s3.cloud.com','https://s3.cloud.com/path','https://s3.local','https://10.0.0.1']:
            c=config();c['storage']['endpoint']=url
            with self.assertRaises(Blocked):validate_config(c,'a'*40)
        for change in ['same_host','same_domain','same_bucket','insecure_tls','short_retention','secret','budget']:
            c=config()
            if change=='same_host':c['hosts']['target']['ref']=c['hosts']['source']['ref']
            if change=='same_domain':c['hosts']['target']['failure_domain']=c['hosts']['source']['failure_domain']
            if change=='same_bucket':c['storage']['objects_bucket']=c['storage']['vault_bucket']
            if change=='insecure_tls':c['storage']['tls_verify']=False
            if change=='short_retention':c['storage']['retention_days']=35
            if change=='secret':c['storage']['secret_access_key']='not-a-real-secret'
            if change=='budget':c['limits']['disk_bytes']=1
            with self.assertRaises(Blocked):validate_config(c,'a'*40)

    def test_arm_or_non_linux_never_claims_native(self):
        with patch('contracts.platform.system',return_value='Darwin'),patch('contracts.platform.machine',return_value='arm64'):
            with self.assertRaisesRegex(Blocked,'NATIVE_AMD64_REQUIRED'):native_host()

    def test_integral_service_clock_not_pg_restore_only(self):
        m=measurement();r=validate_measurement(m)
        self.assertAlmostEqual(r['rpo_upper_seconds'],240.2)
        self.assertAlmostEqual(r['rto_upper_seconds'],600.2)
        for mutate in [lambda m:m.update(frontier_utc='2026-10-28T00:04:59Z'),
                       lambda m:m.update(service_monotonic_ns=3602000000000),
                       lambda m:m['phases'].pop(),lambda m:m.update(source_loss_verified=False),
                       lambda m:m.update(authenticated_external_receipts=False),
                       lambda m:m.update(public_traffic_open=True),lambda m:m.update(clock_error_seconds=float('nan'))]:
            m=measurement();mutate(m)
            with self.assertRaises(Blocked):validate_measurement(m)

    def test_negative_needs_specific_injected_cause_and_closed_traffic(self):
        v={'scenario':'missing_wal','injected':True,'healthy_control':True,'expected_stage':'wal_replay',
           'observed_stage':'wal_replay','expected_code':'WAL_TARGET_UNREACHABLE','observed_code':'WAL_TARGET_UNREACHABLE',
           'accepted':False,'promoted':False,'public_traffic_open':False,'evidence_sha256':'a'*64}
        validate_negative(v)
        for field,value in [('healthy_control',False),('observed_stage','setup'),('observed_code','GENERIC_EXCEPTION'),('promoted',True)]:
            with self.assertRaises(Blocked):validate_negative({**v,field:value})

    def test_small_samples_do_not_produce_p95(self):
        self.assertIsNone(p95([5,6]))
        self.assertEqual(p95(list(range(1,21))),19)

    def test_phase_recorder_retains_failed_phase_without_false_success(self):
        from metrics import PhaseRecorder
        recorder=PhaseRecorder('external-clock')
        with self.assertRaises(RuntimeError):
            with recorder.phase('wal_replay','a'*64):raise RuntimeError('synthetic injected failure')
        r=recorder.records[0]
        self.assertEqual(r['status'],'FAIL')
        self.assertGreaterEqual(r['end_monotonic_ns'],r['start_monotonic_ns'])
        self.assertIn('+00:00',r['started_at'])

    def test_catalog_authentication_is_not_only_checksum(self):
        p={'company':'lab-company-a','run_id':'dr2-ext-contract-001','entries':[]}
        key=b'x'*32
        raw=json.dumps({'payload':p,'signature':hmac.new(key,json.dumps(p,sort_keys=True,separators=(',',':')).encode(),hashlib.sha256).hexdigest()}).encode()
        self.assertEqual(authenticate_catalog(raw,key,config())['company'],'lab-company-a')
        with self.assertRaises(Blocked):authenticate_catalog(raw,b'y'*32,config())

    def test_environment_missing_review_or_secret_never_grants_probe(self):
        d={'name':'dr-v2-external-validation','can_admins_bypass':False,
           'deployment_branch_policy':{'protected_branches':True},
           'protection_rules':[{'type':'required_reviewers','prevent_self_review':True,'reviewers':[{'id':1}]}]}
        validate_environment(d,REQUIRED_SECRETS)
        for change in ['review','bypass','names','branch']:
            v=copy.deepcopy(d);names=set(REQUIRED_SECRETS)
            if change=='review':v['protection_rules']=[]
            if change=='bypass':v['can_admins_bypass']=True
            if change=='names':names.remove('DR2_RESTORE_SECRET_ACCESS_KEY')
            if change=='branch':v['deployment_branch_policy']=None
            with self.assertRaises(Blocked):validate_environment(v,names)

    def test_archive_refuses_changed_hash_symlink_and_escape(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'Audit').mkdir();f=root/'Audit/report.md';f.write_text('sanitized synthetic evidence')
            e={'path':'Audit/report.md','sha256':hashlib.sha256(f.read_bytes()).hexdigest()}
            self.assertEqual(checked_file(root,e),f)
            with self.assertRaises(Blocked):checked_file(root,{**e,'path':'Audit/../../x.md'})
            f.write_text('changed')
            with self.assertRaises(Blocked):checked_file(root,e)

    def test_reviewed_symbol_binds_sha_without_commit_self_hash(self):
        from contracts import load_config
        with tempfile.TemporaryDirectory() as d:
            c=config();c['audited_sha']='WORKFLOW_SHA';p=Path(d)/'config.json';p.write_text(json.dumps(c))
            self.assertEqual(load_config(p,'c'*40)['audited_sha'],'c'*40)
            self.assertIn('WORKFLOW_SHA',p.read_text())

    def test_cli_missing_approval_is_blocked_without_sdk_or_cloud(self):
        import subprocess,sys
        scripts=Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory() as d:
            for script,extra,output in [('prepare.py',[],Path(d)/'prepare'),('probe.py',[],Path(d)/'probe.json')]:
                result=subprocess.run([sys.executable,str(scripts/script),'--config',str(scripts/'config.example.json'),
                                       '--audited-sha','a'*40,'--output',str(output),*extra],capture_output=True,text=True)
                self.assertEqual(result.returncode,2)
                path=output/'preparation.json' if script=='prepare.py' else output
                self.assertEqual(json.loads(path.read_text())['status'],'BLOCKED_EXTERNAL_INFRASTRUCTURE')

    def test_downloaded_bytes_not_etag_are_integrity_proof(self):
        import io
        from probe import stream
        body=b'synthetic';expected={'size':len(body),'mime':'application/octet-stream','sha256':hashlib.sha256(body).hexdigest()}
        class Client:
            def get_object(self,**kw):return {'Body':io.BytesIO(body),'ContentType':'application/octet-stream','ETag':'irrelevant'}
        for bad in [{**expected,'size':1},{**expected,'sha256':'0'*64},{**expected,'mime':'image/png'}]:
            with self.assertRaisesRegex(Blocked,'OBJECT_INTEGRITY_FAILED'):stream(Client(),'bucket','key','version',100,bad)
        self.assertEqual(stream(Client(),'bucket','key','version',100,expected),len(body))

    def test_governance_or_short_version_retention_is_not_accepted(self):
        from probe import retained
        class Client:
            def __init__(self,mode,days):self.mode=mode;self.days=days
            def get_object_retention(self,**kw):return {'Retention':{'Mode':self.mode,'RetainUntilDate':dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=self.days)}}
        for mode,days in [('GOVERNANCE',60),('COMPLIANCE',34)]:
            with self.assertRaises(Blocked):retained(Client(mode,days),'bucket','key','version',47)

    def test_workflow_is_manual_exact_sha_no_external_deploy(self):
        w=(Path(__file__).resolve().parents[3]/'.github/workflows/dr-v2-external-validation.yml').read_text()
        for need in ['workflow_dispatch:','environment: dr-v2-external-validation','test "$GITHUB_SHA" = "$AUDITED_SHA"',
                     'persist-credentials: false','--approved-read-only-probe','if: always()','--cap-drop ALL']:
            self.assertIn(need,w)
        for forbidden in ['workflow_run:','pull_request:','self-hosted','--apply','verify=False','--insecure']:
            self.assertNotIn(forbidden,w)
        import re
        self.assertEqual(len(re.findall(r'uses: [^\n]+@[a-f0-9]{40}',w)),2)
        self.assertLess(w.index('Initialize independent blocked evidence'),w.index('uses: actions/checkout'))
        self.assertLess(w.index('environment_gate.py'),w.index('Read exact external versions'))

    def test_probe_sdk_surface_is_read_only_and_tls_is_explicit(self):
        import ast
        source=Path(__file__).with_name('probe.py').read_text();tree=ast.parse(source)
        calls={n.func.attr for n in ast.walk(tree) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute)}
        self.assertFalse(calls & {'put_object','delete_object','create_bucket','put_object_retention','put_bucket_lifecycle_configuration'})
        self.assertIn('verify=True',source)
        self.assertIn('PROBE_TIME_BUDGET_EXCEEDED',source)

    def test_probe_fetches_exact_version_checks_retention_and_never_mutates(self):
        c=config();body=b'synthetic';key=b'x'*32
        entry={'bucket':'objects','key':c['prefix']+'evidence','version_id':'version-1',
               'size':len(body),'sha256':hashlib.sha256(body).hexdigest(),'mime':'application/octet-stream'}
        payload={'company':c['company'],'run_id':c['run_id'],'entries':[entry]}
        raw=json.dumps({'payload':payload,'signature':hmac.new(key,json.dumps(payload,sort_keys=True,separators=(',',':')).encode(),hashlib.sha256).hexdigest()}).encode()
        c['catalog']['sha256']=hashlib.sha256(raw).hexdigest()
        class Body:
            def __init__(self,data):self.data=data
            def read(self,n=-1):b=self.data[:n] if n>=0 else self.data;self.data=self.data[len(b):];return b
            def close(self):pass
        class Client:
            def __init__(self):self.calls=[]
            def get_bucket_versioning(self,**kw):return {'Status':'Enabled'}
            def get_object(self,**kw):
                self.calls.append(kw)
                return {'Body':Body(raw if kw['Bucket']==c['storage']['catalog_bucket'] else body),'ContentType':'application/octet-stream'}
            def get_object_retention(self,**kw):
                return {'Retention':{'Mode':'COMPLIANCE','RetainUntilDate':dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=60)}}
        client=Client();r=probe(c,client,key)
        self.assertEqual(r['status'],'READ_ONLY_PROBE_PASSED_NOT_DR_ACCEPTANCE')
        self.assertEqual(client.calls[-1]['VersionId'],'version-1')
        c['catalog']['sha256']='0'*64
        with self.assertRaises(Blocked):probe(c,Client(),key)


if __name__=='__main__':unittest.main()
