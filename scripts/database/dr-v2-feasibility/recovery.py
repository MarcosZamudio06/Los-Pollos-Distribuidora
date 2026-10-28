#!/usr/bin/env python3
"""Instrumented synthetic recovery and seven causal fault scenarios, lab only."""
import argparse
import copy
import datetime
import hashlib
import hmac
import inspect
import json
import re
from pathlib import Path
import time
import uuid
from lab import Lab, IMAGE, authenticate, canonical, validate_bytes


class Rejection(Exception):
    def __init__(self, code, stage, evidence):
        self.code, self.stage, self.evidence = code, stage, evidence
        super().__init__(code)


def accept_negative(error, code, stage, injected):
    if (not isinstance(error, Rejection) or error.code != code or
            error.stage != stage or not injected or not error.evidence):
        raise RuntimeError('NEGATIVE_NOT_PROVEN_AT_INJECTION')
    return True


def validate_relative_path(value):
    if (not isinstance(value,str) or not value or value.startswith('/') or
            any(x in ('','.','..') for x in value.split('/'))):
        raise ValueError('UNSAFE_REPOSITORY_PATH')
    return value


def restore_arguments(catalog):
    return ('--set='+catalog['backup_label'],'--type=time','--target='+catalog['target_time'],
            '--target-timeline=1','--target-action=pause','restore')


def native_wal_timing(log):
    samples=re.findall(r'archive-get command end: completed successfully \((\d+)ms\)',log)
    return {'reported_ms':sum(map(int,samples)) if samples else None,
            'status':'AVAILABLE' if samples else 'NOT_AVAILABLE', 'samples':len(samples)}


S3_CODE = inspect.getsource(validate_bytes) + inspect.getsource(validate_relative_path) + r'''
import boto3,sys,json,hashlib,time
from pathlib import Path
from botocore.config import Config
from botocore.exceptions import ClientError,EndpointConnectionError,ConnectTimeoutError,ReadTimeoutError,ConnectionClosedError
p=json.load(sys.stdin)
c=boto3.client('s3',endpoint_url='https://s3:9000',verify=False,aws_access_key_id=p['access'],aws_secret_access_key=p['secret'],region_name='us-east-1',config=Config(retries={'max_attempts':0},connect_timeout=3,read_timeout=5))
try:
 if p['op']=='materialize':
  files=[];total=0;t=time.monotonic();wal_bytes=0;wal_seconds=0;backup_seconds=0
  for page in c.get_paginator('list_objects_v2').paginate(Bucket='labrepo',Prefix='lab/'):
   for o in page.get('Contents',[]):
    key=o['Key'];rel=validate_relative_path(key[len('lab/'):]);dest=Path('/repo')/rel
    begin=time.monotonic();b=c.get_object(Bucket='labrepo',Key=key)['Body'].read();elapsed=time.monotonic()-begin
    if rel.startswith('archive/'):wal_bytes+=len(b);wal_seconds+=elapsed
    else:backup_seconds+=elapsed
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
    files.append({'key':key,'path':rel,'size':len(b),'sha256':hashlib.sha256(b).hexdigest()});total+=len(b)
  out={'files':files,'bytes':total,'wal_bytes':wal_bytes,'wal_get_seconds':wal_seconds,'backup_get_seconds':backup_seconds,'native_seconds':time.monotonic()-t}
 elif p['op']=='probe':
  b=c.get_object(Bucket='labrepo',Key=p['entry']['key'])['Body'].read()
  validate_bytes(b,{**p['entry'],'mime':'binary'},'binary');out={'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)}
 elif p['op']=='object':
  o=p['object'];r=c.get_object(Bucket='labobjects',Key=o['key'],VersionId=o['version']);b=r['Body'].read()
  validate_bytes(b,o,r['ContentType'])
  dst=Path('/objects')/hashlib.sha256(o['version'].encode()).hexdigest();dst.parent.mkdir(exist_ok=True);dst.write_bytes(b)
  out={'path':str(dst),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b),'version':o['version']}
 elif p['op']=='delete_version':
  o=p['object'];c.delete_object(Bucket='labobjects',Key=o['key'],VersionId=o['version']);out={'deleted_version':o['version']}
 else:raise ValueError('UNKNOWN_OPERATION')
 print(json.dumps({'ok':True,**out}))
except ClientError as e:print(json.dumps({'ok':False,'native_code':e.response['Error']['Code']}))
except (EndpointConnectionError,ConnectTimeoutError,ReadTimeoutError,ConnectionClosedError) as e:print(json.dumps({'ok':False,'native_code':type(e).__name__}))
except ValueError as e:print(json.dumps({'ok':False,'native_code':str(e)}))
'''


class RecoveryLab(Lab):
    def __init__(self, output, rows):
        super().__init__(output, rows)
        self.result.update(phases=[], scenarios={}, cache_state='HOST_CACHE_UNCONTROLLED', rows=rows)
        self.active_scenario='setup'
        self.allocations=[]
        self.postgres_targets=set()
        self.result['resource_operations']=[]
        self.result['cold_cache']={'status':'NOT_RUN','reason':'Flushing shared Docker VM/host caches would affect resources outside this run; repeated fresh PGDATA is not host-cold cache.'}

    def cmd(self, *args, **kwargs):
        start=time.monotonic()
        try:return super().cmd(*args,**kwargs)
        finally:
            if args[0]=='run' or args[:2] in [('network','create'),('volume','create')]:
                self.result['resource_operations'].append({'scenario':self.active_scenario,
                    'operation':args[0],'phase':'resource_preparation','seconds':time.monotonic()-start})

    def span(self, phase, fn, **extra):
        self.stage=phase
        record={'scenario':self.active_scenario,'phase':phase,
                'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),**extra}
        start=time.monotonic()
        try:
            value=fn();record['status']='PASS';return value
        except Rejection as e:
            record.update(status='REJECTED',reason=e.code);raise
        except Exception:
            self.result.setdefault('failure_origin',{'stage':phase,'scenario':self.active_scenario})
            record['status']='FAIL';raise
        finally:
            record['seconds']=time.monotonic()-start
            record['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
            self.result['phases'].append(record)

    def timed(self, name, fn):
        start=time.monotonic()
        try:return self.span(name,fn)
        finally:self.result['timings'][name]=time.monotonic()-start

    def helper_mounts(self):
        self.repovol=self.volume('materialized-repo')
        return ['-v',self.repovol+':/repo']

    def waitsql(self, name, seconds=90):
        return self.span('postgres_availability',lambda:super(RecoveryLab,self).waitsql(name,seconds))

    def obj(self, op, ok=True, **kwargs):
        return self.span('s3_availability_and_version_setup' if op=='init' else 'legacy_object_'+op,
                         lambda:super(RecoveryLab,self).obj(op,ok,**kwargs))

    def s3op(self, op, wrong_secret=False, **kwargs):
        secret=uuid.uuid4().hex if wrong_secret else self.secret
        payload={'access':self.access,'secret':secret,'op':op,**kwargs}
        code,out=self.cmd('exec','-i',self.helper,'python3','-c',S3_CODE,data=json.dumps(payload))
        value=json.loads(out)
        if not isinstance(value,dict) or 'ok' not in value:raise RuntimeError('INVALID_S3_HELPER_RESPONSE')
        return value

    def orphan_check(self, scenario=None):
        label='erp.dr2.scenario='+scenario if scenario else 'erp.dr2.lab='+self.prefix
        remaining={}
        for kind,args in [('containers',('ps','-aq')),('networks',('network','ls','-q')),('volumes',('volume','ls','-q'))]:
            _,out=self.cmd(*args,'--filter','label='+label,timeout=15)
            remaining[kind]=out.split()
        if any(remaining.values()):raise RuntimeError('OWNED_RESOURCE_ORPHANS')
        return remaining

    def new_target(self, token):
        name=self.prefix+'-'+token;volume=name+'-data'
        self.cmd('volume','create','--label','erp.dr2.lab='+self.prefix,'--label','erp.dr2.scenario='+token,volume)
        self.volumes.append(volume)
        self.names.append(name);self.allocations.append((token,name,volume));self.postgres_targets.add(name)
        self.cmd('run','-d','--name',name,'--label','erp.dr2.lab='+self.prefix,'--label','erp.dr2.scenario='+token,
                 '--network',self.net,'-v',volume+':/var/lib/postgresql/data','-v',self.repovol+':/repo:ro',
                 '-v',str(self.work/'restore.conf')+':/etc/pgbackrest/pgbackrest.conf:ro',
                 '--entrypoint','sleep',IMAGE,'infinity')
        self.cmd('exec',name,'chown','postgres:postgres','/var/lib/postgresql/data')
        return name

    def remove_target(self, token):
        for t,name,volume in list(self.allocations):
            if t!=token:continue
            self.diagnostics('scenario-'+token)
            for kind,identity,field in [('container',name,'.Config.Labels'),('volume',volume,'.Labels')]:
                args=('inspect',) if kind=='container' else ('volume','inspect')
                _,label=self.cmd(*args,'--format','{{index '+field+' "erp.dr2.lab"}}',identity)
                if label.strip()!=self.prefix:raise RuntimeError('TARGET_OWNERSHIP_MISMATCH')
                if kind=='container':self.cmd('rm','-f',identity);self.names.remove(identity);self.postgres_targets.discard(identity)
                else:self.cmd('volume','rm',identity);self.volumes.remove(identity)
            self.allocations.remove((t,name,volume))
        return self.orphan_check(token)

    def write_candidate(self, envelope, token):
        path=self.root/('candidate-'+token+'.json')
        path.write_text(json.dumps(envelope,indent=2)+'\n')
        return path

    def signed(self, payload):
        return {'payload':payload,'signature':hmac.new(self.signkey,canonical(payload),hashlib.sha256).hexdigest()}

    def probe_repository(self, wrong_secret=False):
        value=self.s3op('probe',entry=self.probe_entry,wrong_secret=wrong_secret)
        if not value['ok']:
            if value['native_code']=='SignatureDoesNotMatch':code='BAD_CREDENTIALS'
            elif value['native_code'] in ['EndpointConnectionError','ConnectTimeoutError','ReadTimeoutError','ConnectionClosedError']:code='REPOSITORY_UNAVAILABLE'
            else:raise RuntimeError('UNEXPECTED_REPOSITORY_FAILURE_'+value['native_code'])
            raise Rejection(code,'repository_probe',value)
        return value

    def object_check(self, obj):
        value=self.s3op('object',object=obj)
        if not value['ok']:
            codes={'NoSuchVersion':'MISSING_OBJECT','NoSuchKey':'MISSING_OBJECT','OBJECT_INTEGRITY_FAILED':'OBJECT_INTEGRITY'}
            if value['native_code'] not in codes:raise RuntimeError('UNEXPECTED_OBJECT_FAILURE_'+value['native_code'])
            raise Rejection(codes[value['native_code']],'object_preflight',value)
        return value

    def recover(self, candidate, token, wrong_secret=False):
        envelope=json.loads(candidate.read_text())
        try:catalog=authenticate(envelope,self.signkey)
        except ValueError as e:
            raise Rejection(str(e),'catalog_authentication',{'validator_error':str(e),'catalog_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest()})
        self.span('repository_probe',lambda:self.probe_repository(wrong_secret))
        downloaded=self.span('historical_s3_recovery',lambda:[self.object_check(o) for o in catalog['objects']])
        name=self.span('target_preparation',lambda:self.new_target(token))
        self.span('postgres_restore',lambda:self.pgbr(name,*restore_arguments(catalog)))
        def replay():
            code,_=self.cmd('exec','-u','postgres',name,'pg_ctl','-D','/var/lib/postgresql/data','-l','/tmp/recovery.log','start',ok=False)
            deadline=time.monotonic()+60
            while time.monotonic()<deadline:
                rc,out=self.cmd('exec','-u','postgres',name,'psql','-h','127.0.0.1','-XAt','-U','postgres','-c','SELECT pg_is_in_recovery(), pg_is_wal_replay_paused()',ok=False,timeout=5)
                if rc==0 and out.strip()=='t|t':
                    self.save_recovery_log(name,token)
                    return
                _,log=self.cmd('exec',name,'cat','/tmp/recovery.log')
                if 'recovery ended before configured recovery target was reached' in log:
                    status,_=self.cmd('exec','-u','postgres',name,'pg_ctl','-D','/var/lib/postgresql/data','status',ok=False)
                    _,control=self.cmd('exec','-u','postgres',name,'pg_controldata','/var/lib/postgresql/data')
                    if status==0 or 'in production' in control:raise RuntimeError('INCOMPLETE_TARGET_PROMOTED')
                    native=self.save_recovery_log(name,token)
                    raise Rejection('WAL_TARGET_UNREACHABLE','wal_replay',{'native_error':'recovery ended before configured recovery target was reached','pg_ctl_exit':status,'promoted':False,**native})
                if code:raise RuntimeError('POSTGRES_START_FAILED_WITHOUT_EXPECTED_WAL_ERROR')
                time.sleep(.25)
            raise RuntimeError('REPLAY_TIMEOUT_NOT_AN_EXPECTED_REJECTION')
        self.span('wal_replay',replay)
        def readback():
            if self.sql(name,"SELECT string_agg(id,',' ORDER BY id) FROM sentinels")!='before':raise RuntimeError('SENTINEL_MISMATCH')
            actual=json.loads(self.sql(name,'SELECT object FROM assets WHERE id=1'))
            if actual!=catalog['objects'][0]:raise RuntimeError('DB_VERSION_BINDING_MISMATCH')
            oracle=self.sql(name,"SELECT count(*)||'|'||sum(octet_length(data))||'|'||md5(string_agg(md5(data),'' ORDER BY i)) FROM payload")
            if oracle!=self.payload_oracle:raise RuntimeError('PAYLOAD_READBACK_MISMATCH')
            for item in downloaded:
                _,out=self.cmd('exec',self.helper,'sha256sum',item['path'])
                if out.split()[0]!=item['sha256']:raise RuntimeError('OBJECT_PERSISTED_READBACK_MISMATCH')
            if self.sql(name,'SELECT pg_is_in_recovery(), pg_is_wal_replay_paused()')!='t|t':raise RuntimeError('TARGET_PROMOTED')
            return {'accepted':True,'promoted':False,'payload_oracle':oracle,'objects':downloaded}
        return self.span('readback_integrity',readback)

    def save_recovery_log(self, name, token):
        _,log=self.cmd('exec',name,'cat','/tmp/recovery.log')
        text=self.sanitize(log)
        filename='recovery-'+token+'.log';(self.root/filename).write_text(text)
        self.result.setdefault('native_wal_get',[]).append({'scenario':self.active_scenario,**native_wal_timing(log),'log':filename,'scope':'subset of wal_replay, not an additive host phase'})
        return {'log':filename,'log_sha256':hashlib.sha256(text.encode()).hexdigest()}

    def materialize(self):
        value=self.s3op('materialize')
        if not value['ok'] or not value['files']:raise RuntimeError('MATERIALIZATION_FAILED')
        for f in value['files']:validate_relative_path(f['path'])
        return value

    def positive(self, envelope, label):
        self.active_scenario=label
        token=uuid.uuid4().hex[:12]
        candidate=self.write_candidate(envelope,token)
        start=time.monotonic()
        try:
            transfer=self.span('repository_materialization',self.materialize)
            if transfer['files']!=self.manifest['files']:raise RuntimeError('REPOSITORY_CHANGED')
            value=self.recover(candidate,token)
            value.update(status='PASS',materialized_bytes=transfer['bytes'],repository_transfer=transfer,
                         recovery_elapsed_seconds=time.monotonic()-start,new_pgdata=True,cache='HOST_CACHE_UNCONTROLLED')
            self.result['scenarios'][label]=value
        finally:
            self.span('scenario_cleanup',lambda:self.remove_target(token))

    def negative(self, key, expected_code, expected_stage, envelope, inject, repair=lambda:None, wrong_secret=False):
        self.active_scenario=key;token=uuid.uuid4().hex[:12]
        # A real healthy control must reach the repository AND exact required version.
        self.probe_repository();self.object_check(self.objects[0])
        candidate=self.write_candidate(copy.deepcopy(envelope),token)
        record={'status':'NOT_RUN','injected':False,'accepted':False}
        self.result['scenarios'][key]=record
        try:
            inject(candidate);record['injected']=True
            try:value=self.recover(candidate,token,wrong_secret=wrong_secret)
            except Rejection as e:
                accept_negative(e,expected_code,expected_stage,record['injected'])
                record.update(status='PASS',rejection=e.code,rejection_stage=e.stage,evidence=e.evidence,
                              promoted=False,target_created=any(t==token for t,_,_ in self.allocations))
            else:
                record.update(accepted=value.get('accepted'),promoted=value.get('promoted'))
                raise RuntimeError('INVALID_POINT_ACCEPTED')
        except Exception:
            record['status']='FAIL';raise
        finally:
            repair()
            record['orphan_check']=self.span('scenario_cleanup',lambda:self.remove_target(token))

    def run(self):
        self.span('resource_preparation_and_availability',self.prepare)
        self.payload_oracle=self.sql(self.source,"SELECT count(*)||'|'||sum(octet_length(data))||'|'||md5(string_agg(md5(data),'' ORDER BY i)) FROM payload")
        envelope=self.make_catalog()
        completed=self.result['backup_info'][0]['backup'][-1]
        if completed.get('error') is not False:raise RuntimeError('BACKUP_NOT_VALID')
        point=envelope['payload']
        def lsn(value):
            high,low=value.split('/');return (int(high,16)<<32)+int(low,16)
        if (datetime.datetime.fromisoformat(point['target_time']).timestamp()<=completed['timestamp']['stop'] or
                lsn(point['marker_lsn'])<=lsn(completed['lsn']['stop'])):
            raise RuntimeError('BACKUP_NOT_BEFORE_TARGET')
        point.update(backup_label=completed['label'],backup_stop_epoch=completed['timestamp']['stop'],backup_stop_lsn=completed['lsn']['stop'])
        self.span('physical_backup_validation',lambda:self.pgbr(self.source,'verify','--output=text'))
        self.diagnostics('before-source-loss')
        self.cmd('rm','-f',self.source);self.names.remove(self.source)
        v=self.prefix+'-source';self.cmd('volume','rm',v);self.volumes.remove(v)
        self.result['checks']['source_removed']=True
        self.active_scenario='snapshot'
        self.manifest=self.span('repository_materialization',self.materialize)
        self.probe_entry=next(f for f in self.manifest['files'] if f['path'].endswith('backup.manifest'))
        payload=envelope['payload'];payload['repository']=self.manifest;payload['payload_oracle']=self.payload_oracle
        envelope=self.signed(payload)
        # Separate native POSIX restore, no live S3 access hidden inside DB restore/replay.
        config=(self.work/'pgbackrest.conf').read_text()
        cipher=next(line for line in config.splitlines() if line.startswith('repo1-cipher-pass='))
        (self.work/'restore.conf').write_text('[global]\nrepo1-type=posix\nrepo1-path=/repo\nrepo1-cipher-type=aes-256-cbc\n'+cipher+'\narchive-async=n\nlog-path=/tmp\n[lab]\npg1-path=/var/lib/postgresql/data\n')
        self.positive(envelope,'positive-1')
        self.positive(envelope,'positive-2')
        segment=payload['segment']
        entry=next(f for f in self.manifest['files'] if f['path'].startswith('archive/') and segment+'-' in f['path'])
        path='/repo/'+entry['path']
        def remove_wal(candidate):self.cmd('exec',self.helper,'mv',path,'/tmp/quarantined-wal')
        def repair_wal():self.cmd('exec',self.helper,'mv','/tmp/quarantined-wal',path)
        self.negative('wal_missing','WAL_TARGET_UNREACHABLE','wal_replay',envelope,remove_wal,repair_wal)
        for field,value in [('sha256','0'*64),('size',1048577)]:
            def alter(candidate,field=field,value=value):
                body=copy.deepcopy(payload);body['objects'][0][field]=value
                candidate.write_text(json.dumps(self.signed(body)))
            self.negative('object_'+field,'OBJECT_INTEGRITY','object_preflight',envelope,alter)
        def tamper(candidate):
            body=json.loads(candidate.read_text());body['payload']['marker']='tampered';candidate.write_text(json.dumps(body))
        self.negative('catalog_altered','CATALOG_AUTHENTICATION_FAILED','catalog_authentication',envelope,tamper)
        def other_company(candidate):
            body=copy.deepcopy(payload);body['company']='lab-company-b';candidate.write_text(json.dumps(self.signed(body)))
        self.negative('cross_company','COMPANY_MISMATCH','catalog_authentication',envelope,other_company)
        self.negative('wrong_credentials','BAD_CREDENTIALS','repository_probe',envelope,lambda c:None,wrong_secret=True)
        def stop(candidate):self.cmd('stop',self.s3)
        def restart():
            self.cmd('start',self.s3)
            deadline=time.monotonic()+30
            while time.monotonic()<deadline:
                try:self.probe_repository();return
                except Rejection:time.sleep(.5)
            raise RuntimeError('REPOSITORY_DID_NOT_RECOVER')
        self.negative('repository_unavailable','REPOSITORY_UNAVAILABLE','repository_probe',envelope,stop,restart)
        # Delete the ACTUAL required provider version last: its ID cannot be recreated.
        def delete(candidate):
            v=self.s3op('delete_version',object=self.objects[0])
            if not v['ok'] or v['deleted_version']!=self.objects[0]['version']:raise RuntimeError('OBJECT_DELETION_NOT_CONFIRMED')
        self.negative('historical_object_missing','MISSING_OBJECT','object_preflight',envelope,delete)
        self.object_check(self.objects[1])
        self.result['status']='LAB_RECOVERY_AND_CAUSAL_REJECTIONS_PASSED'


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('--rows',type=int,choices=[1024,32768],required=True)
    args=parser.parse_args();lab=RecoveryLab(args.output,args.rows)
    try:lab.run()
    except Exception as e:
        origin=lab.result.get('failure_origin',lab.result.get('failed_command',{}))
        lab.result.update(status='FAIL',failed_stage=origin.get('stage',lab.stage),failure=lab.sanitize(str(e)))
    finally:
        try:lab.diagnostics('pre-cleanup')
        except Exception as e:lab.result['diagnostics_error']=type(e).__name__
        try:
            lab.span('cleanup',lab.cleanup)
            lab.result['orphan_check']=lab.span('orphan_verification',lab.orphan_check)
        except Exception as e:lab.result.update(cleanup='FAILED',cleanup_error=type(e).__name__)
        if lab.result.get('cleanup')!='PASSED':lab.result['status']='FAIL_CLEANUP'
        (lab.root/'result.json').write_text(json.dumps(lab.result,indent=2)+'\n')
    if lab.result['status']!='LAB_RECOVERY_AND_CAUSAL_REJECTIONS_PASSED':raise SystemExit(1)


if __name__=='__main__':main()
