#!/usr/bin/env python3
"""Disposable synthetic DR experiment. No production inputs or existing volumes."""
import argparse
import copy
import hashlib
import hmac
import inspect
import json
import os
import re
import datetime
from pathlib import Path
import secrets
import subprocess
import tempfile
import time
import uuid

IMAGE = 'erp-dr-v2-feasibility:pg16-pgbr260'
S3_IMAGE = 'pgsty/silo@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7'


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def authenticate(envelope, key, company='lab-company-a'):
    if not hmac.compare_digest(envelope['signature'], hmac.new(key, canonical(envelope['payload']), hashlib.sha256).hexdigest()):
        raise ValueError('CATALOG_AUTHENTICATION_FAILED')
    if envelope['payload']['company'] != company:
        raise ValueError('COMPANY_MISMATCH')
    return envelope['payload']


def validate_bytes(body, expected, mime):
    if (len(body) != expected['size'] or
            hashlib.sha256(body).hexdigest() != expected['sha256'] or
            mime != expected['mime']):
        raise ValueError('OBJECT_INTEGRITY_FAILED')


# Runs only in an owned helper container; downloads exact versions, not HEAD/ETag.
OBJECT_CODE = inspect.getsource(validate_bytes) + r'''
import boto3,sys,json,hashlib,time,random
from botocore.config import Config
p=json.load(sys.stdin)
c=boto3.client('s3',endpoint_url='https://s3:9000',verify=False,aws_access_key_id=p['access'],aws_secret_access_key=p['secret'],region_name='us-east-1',config=Config(retries={'max_attempts':0},connect_timeout=3,read_timeout=15))
if p['op']=='init':
 c.create_bucket(Bucket='labobjects',ObjectLockEnabledForBucket=True)
 c.put_bucket_versioning(Bucket='labobjects',VersioningConfiguration={'Status':'Enabled'})
 c.create_bucket(Bucket='labrepo')
 out=[]
 for n in [1,2]:
  b=random.Random(n).randbytes(p['object_mib']*1024*1024)
  t=time.monotonic(); v=c.put_object(Bucket='labobjects',Key='evidence',Body=b,ContentType='application/octet-stream')['VersionId']
  r=c.get_object(Bucket='labobjects',Key='evidence',VersionId=v);actual=r['Body'].read()
  assert actual==b
  out.append({'key':'evidence','version':v,'sha256':hashlib.sha256(b).hexdigest(),'size':len(b),'mime':r['ContentType'],'seconds':time.monotonic()-t})
 c.delete_object(Bucket='labobjects',Key='evidence')
 try:c.get_object(Bucket='labobjects',Key='evidence');raise RuntimeError('DELETE_NOT_EFFECTIVE')
 except c.exceptions.NoSuchKey:pass
 print(json.dumps(out))
elif p['op']=='get':
 o=p['object'];t=time.monotonic();r=c.get_object(Bucket='labobjects',Key=o['key'],VersionId=o['version']);b=r['Body'].read()
 validate_bytes(b,o,r['ContentType'])
 print(json.dumps({'bytes':len(b),'seconds':time.monotonic()-t,'sha256':hashlib.sha256(b).hexdigest()}))
elif p['op']=='wal':
 if p['action']=='remove':
  keys=[x['Key'] for page in c.get_paginator('list_objects_v2').paginate(Bucket='labrepo') for x in page.get('Contents',[]) if p['segment']+'-' in x['Key']]
  assert len(keys)==1,keys
  k=keys[0];b=c.get_object(Bucket='labrepo',Key=k)['Body'].read()
  c.put_object(Bucket='labobjects',Key='wal-quarantine',Body=b);c.delete_object(Bucket='labrepo',Key=k)
 else:
  k=p['key'];b=c.get_object(Bucket='labobjects',Key='wal-quarantine')['Body'].read();c.put_object(Bucket='labrepo',Key=k,Body=b)
 print(json.dumps({'key':k}))
'''


class Lab:
    def __init__(self, output, rows):
        self.root = Path(output).resolve()
        self.root.mkdir(mode=0o700, parents=True, exist_ok=False)
        self.prefix = 'erp-dr2-lab-' + uuid.uuid4().hex[:10]
        self.rows = rows
        self.access, self.secret = secrets.token_hex(12), secrets.token_hex(24)
        self.signkey = secrets.token_bytes(32)
        self.private=tempfile.TemporaryDirectory(prefix='erp-dr2-private-')
        self.work=Path(self.private.name)
        self.redactions=[self.access,self.secret,self.signkey.hex()]
        self.stage='preflight'
        self.net_created=False
        self.started=time.time()
        self.names, self.volumes = [], []
        self.result = {'status':'RUNNING','prefix':self.prefix,'timings':{},'checks':{},'negative':{},'limitations':['same Docker host; not off-host/cloud durability','self-signed TLS; server authentication bypassed in disposable lab only','no ERP service/GIS/cutover','no 35-day elapsed retention proof','HMAC test catalog, not production v2 implementation']}
        self.net = self.prefix + '-net'

    def sanitize(self, value):
        text=value.decode(errors='replace') if isinstance(value,bytes) else str(value or '')
        for secret in self.redactions+[self.access,self.secret]:
            text=text.replace(secret,'[REDACTED]')
        text=re.sub(r'-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----','[REDACTED_PRIVATE_KEY]',text,flags=re.S)
        text=re.sub(r'(?i)((?:password|cipher-pass|key-secret|access_key_id|secret_access_key)\s*[=:]\s*)[^\s,;]+',r'\1[REDACTED]',text)
        text=re.sub(r'(?i)(postgres(?:ql)?://)[^\s]+',r'\1[REDACTED]',text)
        # Docker Action embeds exec argv after a colon; retain event identity only.
        text=re.sub(r'(exec_(?:create|start)):.*?(?= signal=|$)',r'\1:[COMMAND_OMITTED]',text,flags=re.S)
        return text

    def command_summary(self, args):
        summary={'operation':args[0]}
        if args[0]=='exec':
            for program in ['psql','pg_isready','pgbackrest','pg_ctl','python3','cat','chown','sh']:
                if program in args:summary['program']=program;break
            if 'psql' in args and '-c' in args:
                summary['sql_sha256']=hashlib.sha256(args[-1].encode()).hexdigest()
        # Never persist raw argv, -e values, helper bodies or stdin credentials.
        return summary

    def cmd(self, *args, data=None, ok=True, timeout=300):
        start=time.monotonic()
        record={'stage':self.stage,'command':self.command_summary(args),'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'timeout_seconds':timeout}
        try:
            p=subprocess.run(['docker',*args],input=data,text=True,capture_output=True,timeout=timeout)
            code,stdout,stderr=p.returncode,p.stdout,p.stderr
            record['outcome']='EXIT'
        except subprocess.TimeoutExpired as e:
            code,stdout,stderr=124,e.stdout or '',e.stderr or ''
            record['outcome']='TIMEOUT'
        except OSError as e:
            code,stdout,stderr=127,'',type(e).__name__+': '+str(e)
            record['outcome']='LAUNCH_FAILED'
        if isinstance(stdout,bytes):stdout=stdout.decode(errors='replace')
        if isinstance(stderr,bytes):stderr=stderr.decode(errors='replace')
        record.update(exit_code=code,elapsed_seconds=time.monotonic()-start,stdout=self.sanitize(stdout)[-100000:],stderr=self.sanitize(stderr)[-100000:])
        with (self.root/'commands.jsonl').open('a') as f:f.write(json.dumps(record)+'\n')
        if ok and code:
            self.result['failed_command']=record
            raise RuntimeError(f'DOCKER_{args[0]}_{record["outcome"]}_exit_{code}; stage={self.stage}; see commands.jsonl')
        return code,stdout

    def create_schema(self, name):
        self.stage='schema_creation'
        self.timed(self.stage,lambda:self.sql(name,'CREATE TABLE sentinels(id text primary key); CREATE TABLE assets(id int primary key, object jsonb not null);'))
        self.result['checks']['schema_creation']=True

    def load_payload(self, name):
        self.stage='synthetic_payload_load'
        # Original full-size generator retained; no unproven OOM workaround.
        query="CREATE TABLE payload AS SELECT i, string_agg(md5(random()::text),'') AS data FROM generate_series(1,"+str(self.rows)+") i CROSS JOIN generate_series(1,32) j GROUP BY i;"
        self.timed(self.stage,lambda:self.sql(name,query))
        self.stage='synthetic_payload_verify'
        stats=self.sql(name,'SELECT count(*), min(octet_length(data)), max(octet_length(data)), sum(octet_length(data)) FROM payload')
        self.result['payload_statistics']=stats
        if stats!=f'{self.rows}|1024|1024|{self.rows*1024}':raise RuntimeError('PAYLOAD_VOLUME_MISMATCH')
        self.result['checks']['synthetic_payload_load']=True

    def diagnostics(self, reason):
        # Capture before destructive cleanup. Never full inspect / env / config files.
        previous=self.stage
        self.stage='diagnostics'
        d={'reason':reason,'failed_stage':previous,'captured_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'containers':{}}
        for name in list(self.names):
            if not name.startswith(self.prefix+'-'):continue
            c={}
            queries={
                'logs':('logs','--timestamps','--tail','300',name),
                'state':('inspect','--format','{{json .State}}',name),
                'limits':('inspect','--format','memory={{.HostConfig.Memory}} swap={{.HostConfig.MemorySwap}} nano_cpus={{.HostConfig.NanoCpus}} stop_signal={{.Config.StopSignal}} restarts={{.RestartCount}} image={{.Image}}',name),
                'stats':('stats','--no-stream','--format','{{json .}}',name),
                'events':('events','--since',str(int(self.started)),'--until',str(int(time.time())+1),'--filter','container='+name,'--format','{{.TimeNano}} {{.Action}} signal={{index .Actor.Attributes "signal"}} exitCode={{index .Actor.Attributes "exitCode"}}'),
            }
            if name.endswith(('-source','-restore')) or name in getattr(self,'postgres_targets',set()):
                queries['postgres_state']=('exec','-u','postgres',name,'psql','-h','127.0.0.1','-XAt','-U','postgres','-c',"SELECT pg_postmaster_start_time(), pg_is_in_recovery(); SHOW shared_buffers; SHOW work_mem; SHOW max_parallel_workers_per_gather;")
                queries['processes_cgroup']=('exec',name,'sh','-c',"ps -o pid,ppid,stat,comm; for f in /sys/fs/cgroup/memory.events /sys/fs/cgroup/memory.current /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.max; do if [ -r \"$f\" ]; then echo \"$f\"; cat \"$f\"; fi; done")
                queries['recovery_log']=('exec',name,'sh','-c','if [ -f /tmp/recovery.log ]; then tail -300 /tmp/recovery.log; fi')
            for kind,args in queries.items():
                try:
                    code,out=self.cmd(*args,ok=False,timeout=10)
                    c[kind]={'exit_code':code,'output':self.sanitize(out)[-100000:]}
                except Exception as e:c[kind]={'error_type':type(e).__name__}
            d['containers'][name]=c
        (self.root/('diagnostics-'+reason+'.json')).write_text(json.dumps(d,indent=2)+'\n')
        self.stage=previous

    def timed(self, name, fn):
        self.stage=name
        t=time.monotonic()
        try:return fn()
        finally:self.result['timings'][name]=time.monotonic()-t

    def sql(self, container, sql):
        return self.cmd('exec','-u','postgres',container,'psql','-h','127.0.0.1','-XAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',sql)[1].strip()

    def pgbr(self, container, *args, ok=True):
        return self.cmd('exec','-u','postgres',container,'pgbackrest','--stanza=lab',*args,ok=ok)

    def obj(self, op, ok=True, **kwargs):
        payload={'access':self.access,'secret':self.secret,'op':op,**kwargs}
        code,out=self.cmd('exec','-i',self.helper,'python3','-c',OBJECT_CODE,data=json.dumps(payload),ok=ok)
        return json.loads(out) if code==0 else {'exit':code}

    def waitsql(self, name, seconds=90):
        start=time.monotonic()
        while time.monotonic()-start<seconds:
            code,_=self.cmd('exec','-u','postgres',name,'pg_isready','-h','127.0.0.1','-d','postgres','-U','postgres',ok=False)
            if code==0:
                code,out=self.cmd('exec','-u','postgres',name,'psql','-h','127.0.0.1','-XAt','-U','postgres','-c','SELECT pg_is_in_recovery()',ok=False,timeout=10)
                if code==0 and out.strip()=='f':return
            time.sleep(.5)
        raise TimeoutError('POSTGRES_READINESS_TIMEOUT')

    def volume(self, suffix):
        name=self.prefix+'-'+suffix;self.cmd('volume','create','--label','erp.dr2.lab='+self.prefix,name);self.volumes.append(name);return name

    def startpg(self, suffix, volume):
        name=self.prefix+'-'+suffix
        self.names.append(name)
        self.cmd('run','-d','--name',name,'--label','erp.dr2.lab='+self.prefix,'--network',self.net,'-v',volume+':/var/lib/postgresql/data','-v',str(self.work/'pgbackrest.conf')+':/etc/pgbackrest/pgbackrest.conf:ro','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_INITDB_ARGS=--data-checksums',IMAGE,'postgres','-c','archive_mode=on','-c','archive_command=pgbackrest --stanza=lab archive-push %p','-c','archive_timeout=60s')
        self.waitsql(name);return name

    def prepare(self):
        self.result['docker']=self.cmd('version','--format','{{json .}}')[1]
        start=time.monotonic()
        self.cmd('network','create','--internal','--label','erp.dr2.lab='+self.prefix,self.net)
        self.net_created=True
        certdir=self.work/'certs';certdir.mkdir()
        self.cmd('run','--rm','--network','none','-v',str(certdir)+':/certs','--entrypoint','openssl',IMAGE,'req','-x509','-newkey','rsa:2048','-nodes','-keyout','/certs/private.key','-out','/certs/public.crt','-days','1','-subj','/CN=s3')
        sv=self.volume('s3')
        self.s3=self.prefix+'-s3';self.names.append(self.s3)
        self.cmd('run','-d','--name',self.s3,'--label','erp.dr2.lab='+self.prefix,'--network',self.net,'--network-alias','s3','-v',sv+':/data','-v',str(certdir)+':/certs:ro','-e','MINIO_ROOT_USER='+self.access,'-e','MINIO_ROOT_PASSWORD='+self.secret,S3_IMAGE,'server','/data','--certs-dir','/certs')
        helper_mounts=self.helper_mounts()
        self.helper=self.prefix+'-helper';self.names.append(self.helper)
        self.cmd('run','-d','--name',self.helper,'--label','erp.dr2.lab='+self.prefix,'--network',self.net,*helper_mounts,'--entrypoint','sleep',IMAGE,'infinity')
        # Config contains only random ephemeral test credentials; never version it.
        cipherpass=secrets.token_hex(32);self.redactions.append(cipherpass)
        cfg=f'''[global]\nrepo1-type=s3\nrepo1-path=/lab\nrepo1-s3-endpoint=s3\nrepo1-storage-port=9000\nrepo1-storage-verify-tls=n\nrepo1-storage-host=s3\nrepo1-s3-uri-style=path\nrepo1-s3-bucket=labrepo\nrepo1-s3-region=us-east-1\nrepo1-s3-key={self.access}\nrepo1-s3-key-secret={self.secret}\nrepo1-cipher-type=aes-256-cbc\nrepo1-cipher-pass={cipherpass}\nrepo1-retention-full=2\nexpire-auto=n\narchive-async=n\narchive-timeout=30\ncompress-type=zst\nprocess-max=2\nlog-level-console=info\nlog-path=/tmp\n[lab]\npg1-path=/var/lib/postgresql/data\n'''
        (self.work/'pgbackrest.conf').write_text(cfg);os.chmod(self.work/'pgbackrest.conf',0o644)
        # Bounded service readiness via authenticated operation (not fixed sleep).
        deadline=time.monotonic()+45
        while True:
            try:objects=self.obj('init',object_mib=1);break
            except RuntimeError:
                if time.monotonic()>deadline:raise
                time.sleep(.5)
        self.result['object_versions']=objects
        self.result['checks']['s3_initialization']=True
        self.stage='postgres_initialization'
        self.source=self.startpg('source',self.volume('source'))
        self.result['timings']['container_provisioning']=time.monotonic()-start
        self.result['checks']['postgres_initialization']=True
        self.stage='version_checks'
        self.result['versions']={'pgbackrest':self.cmd('exec',self.source,'pgbackrest','version')[1].strip(),'postgres_postgis':self.sql(self.source,'SELECT version(); CREATE EXTENSION IF NOT EXISTS postgis; SELECT postgis_full_version();'),'source_archive_sha256':self.cmd('exec',self.source,'cat','/pgbackrest-source.sha256')[1].strip()}
        self.create_schema(self.source)
        self.load_payload(self.source)
        self.objects=objects

    def helper_mounts(self):
        return []

    def make_catalog(self):
        objects=self.objects
        self.stage='stanza_creation'
        self.pgbr(self.source,'stanza-create');self.pgbr(self.source,'check')
        self.timed('physical_full_backup',lambda:self.pgbr(self.source,'--type=full','backup'))
        self.result['backup_info']=json.loads(self.pgbr(self.source,'--output=json','info')[1])
        self.result['db_bytes']=int(self.sql(self.source,"SELECT pg_database_size('postgres')"))
        obj=json.dumps(objects[0]).replace("'","''")
        self.sql(self.source,"INSERT INTO sentinels VALUES ('before'); INSERT INTO assets VALUES(1,'"+obj+"'::jsonb);")
        target=self.sql(self.source,'SELECT clock_timestamp()')
        marker=self.sql(self.source,"SELECT pg_create_restore_point('lab_point')")
        segment=self.sql(self.source,"SELECT pg_walfile_name('"+marker+"'::pg_lsn)")
        time.sleep(.2)
        self.sql(self.source,"INSERT INTO sentinels VALUES ('after'); UPDATE assets SET object='"+json.dumps(objects[1]).replace("'","''")+"'::jsonb WHERE id=1; UPDATE payload SET data=md5(data)||data;")
        self.timed('archive_flush_check',lambda:(self.sql(self.source,'SELECT pg_switch_wal()'),self.pgbr(self.source,'check')))
        catalog={'company':'lab-company-a','target_time':target,'marker_lsn':marker,'marker':'lab_point','segment':segment,'objects':[objects[0]]}
        envelope={'payload':catalog,'signature':hmac.new(self.signkey,canonical(catalog),hashlib.sha256).hexdigest()}
        (self.root/'catalog.json').write_text(json.dumps(envelope,indent=2))
        self.result['target']=catalog
        return envelope

    def run(self):
        self.prepare()
        envelope=self.make_catalog()
        objects=self.objects
        catalog=envelope['payload']
        target=catalog['target_time'];segment=catalog['segment']
        # Fail before mutation on authenticated identity errors.
        for kind,env,company in [('catalog_altered',copy.deepcopy(envelope),'lab-company-a'),('cross_company',envelope,'lab-company-b')]:
            if kind=='catalog_altered':env['payload']['target_time']='altered'
            try:authenticate(env,self.signkey,company);raise AssertionError('NEGATIVE_ACCEPTED')
            except ValueError:self.result['negative'][kind]='REJECTED'
        bad=copy.deepcopy(objects[0]);bad['sha256']='0'*64
        assert self.obj('get',ok=False,object=bad)['exit']!=0;self.result['negative']['wrong_hash']='REJECTED'
        bad=copy.deepcopy(objects[0]);bad['version']=str(uuid.uuid4())
        assert self.obj('get',ok=False,object=bad)['exit']!=0;self.result['negative']['missing_historical_object']='REJECTED'
        correct=self.secret;self.secret=secrets.token_hex(24)
        try:assert self.obj('get',ok=False,object=objects[0])['exit']!=0
        finally:self.secret=correct
        self.result['negative']['wrong_credentials']='REJECTED'
        # Source container and source volume removed; external-to-source copies remain.
        self.diagnostics('before-source-loss')
        self.stage='source_loss'
        self.cmd('rm','-f',self.source);self.names.remove(self.source)
        srcvol=self.prefix+'-source';self.cmd('volume','rm',srcvol);self.volumes.remove(srcvol)
        self.result['checks']['source_container_and_volume_removed']=True
        name=self.prefix+'-restore';self.names.append(name);vol=self.volume('restore')
        self.cmd('run','-d','--name',name,'--label','erp.dr2.lab='+self.prefix,'--network',self.net,'-v',vol+':/var/lib/postgresql/data','-v',str(self.work/'pgbackrest.conf')+':/etc/pgbackrest/pgbackrest.conf:ro','--entrypoint','sleep',IMAGE,'infinity')
        self.cmd('exec',name,'chown','postgres:postgres','/var/lib/postgresql/data')
        authenticate(envelope,self.signkey)
        self.timed('physical_restore_including_s3_transfer',lambda:self.pgbr(name,'--type=time','--target='+target,'--target-timeline=1','--target-action=pause','restore'))
        replay=time.monotonic()
        self.cmd('exec','-u','postgres',name,'pg_ctl','-D','/var/lib/postgresql/data','-l','/tmp/recovery.log','start')
        deadline=time.monotonic()+90
        while time.monotonic()<deadline:
            code,out=self.cmd('exec','-u','postgres',name,'psql','-h','127.0.0.1','-XAt','-U','postgres','-c','SELECT pg_is_wal_replay_paused()',ok=False)
            if code==0 and out.strip()=='t':break
            time.sleep(.25)
        else:raise TimeoutError('RECOVERY_TARGET_NOT_PAUSED')
        self.result['timings']['wal_replay_to_pause']=time.monotonic()-replay
        def validate():
            assert self.sql(name,'SELECT string_agg(id,\',\' ORDER BY id) FROM sentinels')=='before'
            ref=json.loads(self.sql(name,'SELECT object FROM assets WHERE id=1'))
            assert ref['version']==objects[0]['version']
            return [self.obj('get',object=o) for o in objects]
        self.result['historical_readbacks']=self.timed('objects_and_db_validation',validate)
        self.result['checks'].update(pitr_before_present_after_absent=True,db_object_reference_resolved=True,historical_versions_recovered=True)
        self.result['recovery_log']=self.cmd('exec',name,'cat','/tmp/recovery.log')[1]
        # Real missing-WAL failure in the owned repository, preserve bytes for repair.
        quarantined=self.obj('wal',segment=segment,action='remove')
        # Native archive-get requests exact required segment, must not fabricate it.
        code,_=self.pgbr(name,'archive-get',segment,'/tmp/missing-wal',ok=False)
        assert code!=0;self.result['negative']['missing_wal_archive_get']='REJECTED'
        self.obj('wal',segment='NONEXISTENT',action='restore',key=quarantined['key'])
        self.cmd('stop',self.s3)
        code,_=self.pgbr(name,'--io-timeout=3','--protocol-timeout=5','archive-get',segment,'/tmp/unavailable-wal',ok=False)
        assert code!=0;self.result['negative']['repository_unavailable']='REJECTED'
        self.cmd('start',self.s3)
        self.result['status']='MECHANICS_PASSED_NOT_PRODUCTION_ACCEPTANCE'

    def cleanup(self):
        self.stage='cleanup'
        errors=[]
        def remove(kind,name):
            if not name.startswith(self.prefix+'-'):
                errors.append({'resource':name,'reason':'OUTSIDE_RUN_PREFIX'});return
            try:
                inspect_args=('inspect',) if kind=='container' else (kind,'inspect')
                field='.Config.Labels' if kind=='container' else '.Labels'
                code,out=self.cmd(*inspect_args,'--format','{{index '+field+' "erp.dr2.lab"}}',name,ok=False,timeout=10)
                if code or out.strip()!=self.prefix:
                    errors.append({'resource':name,'reason':'OWNERSHIP_UNVERIFIED'});return
                args=('rm','-f',name) if kind=='container' else (kind,'rm',name)
                if self.cmd(*args,ok=False,timeout=30)[0]:errors.append({'resource':name,'reason':'REMOVE_FAILED'})
            except Exception as e:errors.append({'resource':name,'reason':type(e).__name__})
        for name in reversed(self.names):remove('container',name)
        for volume in self.volumes:remove('volume',volume)
        if self.net_created:remove('network',self.net)
        self.result['cleanup_errors']=errors
        self.result['cleanup']='PASSED' if not errors else 'FAILED'
        self.private.cleanup()



def main():
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);p.add_argument('--rows',type=int,default=32768);a=p.parse_args()
    if not 1024<=a.rows<=262144:raise SystemExit('rows outside bounded laboratory range')
    lab=Lab(a.output,a.rows)
    try:
        lab.run()
    except Exception as e:
        lab.result.update(status='FAILED',failure=lab.sanitize(str(e)),failed_stage=lab.stage)
    finally:
        try:lab.diagnostics('pre-cleanup')
        except Exception as e:lab.result['diagnostics_error']=type(e).__name__
        try:lab.cleanup()
        except Exception as e:lab.result.update(cleanup='FAILED',cleanup_error=type(e).__name__)
        if lab.result.get('cleanup')!='PASSED':lab.result['status']='FAILED_CLEANUP'
        (lab.root/'result.json').write_text(lab.sanitize(json.dumps(lab.result,indent=2))+'\n')
    if lab.result['status']!='MECHANICS_PASSED_NOT_PRODUCTION_ACCEPTANCE':raise SystemExit(1)


if __name__=='__main__':main()
