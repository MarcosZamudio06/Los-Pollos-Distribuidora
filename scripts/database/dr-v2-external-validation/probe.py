"""Explicit approved READ-ONLY external S3 probe. Never provisions or deletes."""
import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
from pathlib import Path
import signal
import time
from contracts import Blocked, require, utc, load_config


def authenticate_catalog(raw, key, c):
    try:
        require(len(key)>=32,'CATALOG_KEY_REQUIRED')
        v=json.loads(raw);p=v['payload']
        actual=hmac.new(key,json.dumps(p,sort_keys=True,separators=(',',':')).encode(),hashlib.sha256).hexdigest()
        require(hmac.compare_digest(v['signature'],actual),'CATALOG_AUTHENTICATION_FAILED')
        require(p['company']==c['company'] and p['run_id']==c['run_id'],'COMPANY_OR_RUN_MISMATCH')
        require(isinstance(p['entries'],list) and len(p['entries'])<=100000,'CATALOG_ENTRIES_REQUIRED')
        return p
    except (KeyError,ValueError,TypeError):raise Blocked('CATALOG_AUTHENTICATION_FAILED') from None


def stream(client, bucket, key, version, budget, expected=None):
    r=client.get_object(Bucket=bucket,Key=key,VersionId=version)
    sha=hashlib.sha256();size=0;parts=[]
    try:
        while True:
            b=r['Body'].read(65536)
            if not b:break
            size+=len(b);require(size<=budget,'PROBE_BUDGET_EXCEEDED');sha.update(b)
            if expected is None:
                require(size<=4*1024*1024,'CATALOG_TOO_LARGE');parts.append(b)
        if expected:
            require(size==expected['size'] and hmac.compare_digest(sha.hexdigest(),expected['sha256']) and
                    r['ContentType']==expected['mime'],'OBJECT_INTEGRITY_FAILED')
        return b''.join(parts) if expected is None else size
    finally:r['Body'].close()


def retained(client, bucket, key, version, days):
    r=client.get_object_retention(Bucket=bucket,Key=key,VersionId=version)['Retention']
    # Governance alone is insufficient: bypass permissions require separate denial tests.
    require(r['Mode']=='COMPLIANCE','COMPLIANCE_RETENTION_REQUIRED')
    until=r['RetainUntilDate']
    if isinstance(until,str):until=utc(until)
    require(until.tzinfo is not None and until>=dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=days),'VERSION_RETENTION_TOO_SHORT')


def probe(c, client, key):
    s=c['storage'];cat=c['catalog'];start=time.monotonic()
    for name in ('vault','objects','catalog'):
        require(client.get_bucket_versioning(Bucket=s[name+'_bucket']).get('Status')=='Enabled','VERSIONING_REQUIRED')
    raw=stream(client,s['catalog_bucket'],cat['key'],cat['version_id'],4*1024*1024)
    require(hashlib.sha256(raw).hexdigest()==cat['sha256'],'CATALOG_CHECKSUM_FAILED')
    p=authenticate_catalog(raw,key,c)
    require(bool(p['entries']),'CATALOG_ENTRIES_REQUIRED')
    require(len(raw)<=c['limits']['max_probe_bytes'],'PROBE_BUDGET_EXCEEDED')
    retained(client,s['catalog_bucket'],cat['key'],cat['version_id'],s['retention_days'])
    total=len(raw)
    for entry in p['entries']:
        require(set(entry)=={'bucket','key','version_id','size','sha256','mime'},'CATALOG_ENTRY_INVALID')
        require(entry['bucket'] in ('vault','objects') and isinstance(entry['key'],str) and
                entry['key'].startswith(c['prefix']) and '..' not in entry['key'],'COMPANY_PREFIX_REQUIRED')
        require(isinstance(entry['version_id'],str) and bool(entry['version_id']),'EXACT_VERSION_REQUIRED')
        require(type(entry['size']) is int and entry['size']>0 and isinstance(entry['sha256'],str) and
                len(entry['sha256'])==64 and isinstance(entry['mime'],str),'CATALOG_ENTRY_INVALID')
        bucket=s[entry['bucket']+'_bucket']
        require(total+entry['size']<=c['limits']['max_probe_bytes'],'PROBE_BUDGET_EXCEEDED')
        total+=stream(client,bucket,entry['key'],entry['version_id'],entry['size'],entry)
        retained(client,bucket,entry['key'],entry['version_id'],s['retention_days'])
    return {'status':'READ_ONLY_PROBE_PASSED_NOT_DR_ACCEPTANCE','objects_read':len(p['entries']),
            'bytes_read':total,'seconds':time.monotonic()-start,'company':c['company'],'run_id':c['run_id'],
            'writes_performed':False,'production_authorized':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True);parser.add_argument('--audited-sha',required=True)
    parser.add_argument('--output',required=True);parser.add_argument('--approved-read-only-probe',action='store_true')
    a=parser.parse_args();result={'status':'BLOCKED_EXTERNAL_INFRASTRUCTURE','writes_performed':False,'production_authorized':False}
    try:
        require(a.approved_read_only_probe,'EXPLICIT_PROBE_APPROVAL_REQUIRED')
        c=load_config(a.config,a.audited_sha)
        # Containers have no Docker socket: the workflow checks native daemon separately.
        import platform
        require(platform.system()=='Linux' and platform.machine()=='x86_64','NATIVE_AMD64_REQUIRED')
        import boto3
        from botocore.config import Config
        require(boto3.__version__==c['toolchain']['boto3'],'SDK_VERSION_MISMATCH')
        names=('DR2_RESTORE_ACCESS_KEY_ID','DR2_RESTORE_SECRET_ACCESS_KEY','DR2_CATALOG_HMAC_KEY')
        require(all(os.environ.get(n) for n in names),'ENVIRONMENT_CREDENTIALS_REQUIRED')
        def timeout(signum,frame):raise Blocked('PROBE_TIME_BUDGET_EXCEEDED')
        signal.signal(signal.SIGALRM,timeout)
        signal.alarm(int(c['limits']['total_seconds']))
        client=boto3.client('s3',endpoint_url=c['storage']['endpoint'],region_name=c['storage']['region'],verify=True,
                            aws_access_key_id=os.environ[names[0]],aws_secret_access_key=os.environ[names[1]],
                            aws_session_token=os.environ.get('DR2_RESTORE_SESSION_TOKEN') or None,
                            config=Config(connect_timeout=10,read_timeout=30,retries={'max_attempts':0},s3={'addressing_style':'path'}))
        result=probe(c,client,os.environ[names[2]].encode())
    except Blocked as e:result['reason']=str(e)
    except Exception:result.update(status='BLOCKED_EXTERNAL_INFRASTRUCTURE',reason='EXTERNAL_PROBE_FAILED_NO_SECRET_OUTPUT')
    finally:
        if hasattr(signal,'SIGALRM'):signal.alarm(0)
    target=Path(a.output)
    with target.open('x') as f:json.dump(result,f,indent=2);f.write('\n')
    target.chmod(0o600)
    return 0 if result['status']=='READ_ONLY_PROBE_PASSED_NOT_DR_ACCEPTANCE' else 2


if __name__=='__main__':raise SystemExit(main())
