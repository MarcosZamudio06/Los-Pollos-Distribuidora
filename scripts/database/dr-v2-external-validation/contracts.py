"""Fail-closed external-test preparation; no provisioning or production adapters."""
import datetime as dt
import ipaddress
import json
import math
import platform
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urlsplit


class Blocked(Exception):
    """Safe reason code only; never interpolate provider/credential exceptions."""


def require(ok, code='CONFIGURATION_REJECTED'):
    if not ok:raise Blocked(code)


def utc(value):
    try:
        t=dt.datetime.fromisoformat(value.replace('Z','+00:00'))
        require(t.tzinfo is not None and t.utcoffset()==dt.timedelta(0),'UTC_REQUIRED')
        return t
    except (ValueError,TypeError,AttributeError):raise Blocked('UTC_REQUIRED') from None


def number(value, minimum=0, maximum=2**63):
    require(type(value) in (int,float) and math.isfinite(value) and minimum<=value<=maximum)
    return value


def fields(value, expected):
    require(isinstance(value,dict) and set(value)==set(expected))


def token(value):
    require(isinstance(value,str) and re.fullmatch(r'[a-z0-9][a-z0-9-]{2,79}',value) is not None)
    return value


def public_endpoint(value):
    require(isinstance(value,str))
    u=urlsplit(value)
    require(u.scheme=='https' and u.hostname and not u.username and not u.password and
            u.path in ('','/') and not u.query and not u.fragment and u.port in (None,443),'TLS_ENDPOINT_REJECTED')
    host=u.hostname.lower()
    require('.' in host and not host.endswith(('.local','.localhost','.invalid','.test','.example','.internal')) and host!='localhost','TLS_ENDPOINT_REJECTED')
    try:ipaddress.ip_address(host)
    except ValueError:pass
    else:raise Blocked('IP_ENDPOINT_REJECTED')
    require(re.fullmatch(r'[a-z0-9.-]+',host) is not None,'TLS_ENDPOINT_REJECTED')
    return host


def validate_config(c, sha):
    try:
        fields(c,('schema','audited_sha','run_id','company','data_classification','approval','hosts','images',
                  'toolchain','limits','storage','prefix','catalog','profile','traffic_policy'))
        require(c['schema']=='dr2-external-preparation/v1')
        require(re.fullmatch(r'[a-f0-9]{40}',sha or '') and c['audited_sha']==sha,'EXACT_SHA_REQUIRED')
        token(c['company']);token(c['run_id']);require(c['run_id'].startswith('dr2-ext-'))
        require(c['data_classification']=='synthetic','SYNTHETIC_ONLY')
        require(c['prefix']=='dr-v2/'+c['company']+'/'+c['run_id']+'/','RUN_PREFIX_REQUIRED')
        a=c['approval'];fields(a,('approved','reference','expires_at'))
        require(a['approved'] is True,'APPROVAL_REQUIRED');token(a['reference'])
        require(utc(a['expires_at'])>dt.datetime.now(dt.timezone.utc),'APPROVAL_EXPIRED')
        fields(c['hosts'],('source','target','catalog'))
        for host in c['hosts'].values():
            fields(host,('ref','failure_domain','role'));token(host['ref']);token(host['failure_domain'])
            require(host['role']=='disposable-dr-test','TEST_HOST_REQUIRED')
        require(len({h['ref'] for h in c['hosts'].values()})==3 and
                len({h['failure_domain'] for h in c['hosts'].values()})==3,'INDEPENDENT_HOSTS_REQUIRED')
        fields(c['images'],('database','backend','frontend','gis','probe'))
        for image in c['images'].values():
            require(isinstance(image,str) and re.fullmatch(r'[a-z0-9.-]+(?::[0-9]+)?/[a-z0-9/._-]+@sha256:[a-f0-9]{64}',image) is not None,'IMAGE_DIGEST_REQUIRED')
            require(len(set(image.rsplit(':',1)[1]))>=8,'IMAGE_DIGEST_REQUIRED')
        fields(c['toolchain'],('postgres','postgis','pgbackrest','python','boto3'))
        require(c['toolchain']['postgres'].startswith('16.') and c['toolchain']['postgis'].startswith('3.5.') and
                c['toolchain']['pgbackrest']=='2.60.0','TOOLCHAIN_REJECTED')
        require(re.fullmatch(r'16\.\d+',c['toolchain']['postgres']) is not None,'EXACT_VERSION_REQUIRED')
        require(all(re.fullmatch(r'\d+\.\d+\.\d+',x) for k,x in c['toolchain'].items() if k!='postgres'),'EXACT_VERSION_REQUIRED')
        l=c['limits'];fields(l,('memory_bytes','disk_bytes','cpus','total_seconds','command_seconds','credential_ttl_seconds','max_probe_bytes'))
        number(l['memory_bytes'],2**30,512*2**30);number(l['disk_bytes'],2**30,100*2**40)
        number(l['cpus'],1,64);number(l['total_seconds'],3600,14400)
        number(l['command_seconds'],1,3600);number(l['credential_ttl_seconds'],60,3600)
        number(l['max_probe_bytes'],1,l['disk_bytes'])
        s=c['storage'];fields(s,('provider','endpoint','region','tls_verify','working_bucket','vault_bucket','objects_bucket',
                                'catalog_bucket','retention_days','recovery_days','max_full_gap_days','grace_days'))
        require(s['provider'] in ('b2','aws-s3','s3-compatible'))
        public_endpoint(s['endpoint']);require(s['tls_verify'] is True,'TLS_REQUIRED')
        require(re.fullmatch(r'[a-z0-9-]{2,40}',s['region'] or '') is not None)
        buckets=[s[k+'_bucket'] for k in ('working','vault','objects','catalog')]
        require(len(set(buckets))==4,'SEPARATE_BUCKETS_REQUIRED')
        for b in buckets:require(re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]',b or '') is not None)
        for n in ('retention_days','recovery_days','max_full_gap_days','grace_days'):number(s[n],0,3650)
        require(s['recovery_days']>=35 and s['max_full_gap_days']>=1 and s['grace_days']>=1 and
                s['retention_days']>=s['recovery_days']+s['max_full_gap_days']+s['grace_days'],'RETENTION_HORIZON_REJECTED')
        fields(c['catalog'],('key','version_id','sha256'))
        require(c['catalog']['key'].startswith(c['prefix']) and '..' not in c['catalog']['key'] and '\n' not in c['catalog']['key'])
        require(isinstance(c['catalog']['version_id'],str) and 0<len(c['catalog']['version_id'])<=1024)
        require(re.fullmatch(r'[a-f0-9]{64}',c['catalog']['sha256'] or '') is not None)
        p=c['profile'];fields(p,('name','kind','approval_ref','database_bytes','required_object_bytes','object_count','wal_bytes'))
        require(p['kind'] in ('hypothesis','approved-anonymized-measurements'))
        token(p['name'])
        if p['kind']=='approved-anonymized-measurements':token(p['approval_ref'])
        for k in ('database_bytes','required_object_bytes','object_count','wal_bytes'):number(p[k],1)
        # Repository materialization + PGDATA + scratch/readback + object hydration reserve.
        require(l['disk_bytes']>=3*p['database_bytes']+2*p['required_object_bytes']+2*p['wal_bytes'],'DISK_BUDGET_INSUFFICIENT')
        require(c['traffic_policy']=='closed-private-observer-only','TRAFFIC_POLICY_REJECTED')
    except (KeyError,TypeError,AttributeError,ValueError):raise Blocked('CONFIGURATION_REJECTED') from None
    return c


def load_config(path, sha):
    """Bind one declared symbol, avoiding an impossible commit-self-hash config."""
    c=json.loads(Path(path).read_text())
    if c.get('audited_sha')=='WORKFLOW_SHA':c['audited_sha']=sha
    return validate_config(c,sha)


def pgbackrest_config(c):
    """Secret-free rendering; inject restore/writer role and cipher via private env."""
    s=c['storage']
    return ('[global]\nrepo1-type=s3\nrepo1-path=/'+c['prefix'].rstrip('/')+'/repository\n'
            'repo1-s3-bucket='+s['working_bucket']+'\nrepo1-s3-endpoint='+public_endpoint(s['endpoint'])+
            '\nrepo1-s3-region='+s['region']+'\nrepo1-s3-uri-style=path\nrepo1-storage-verify-tls=y\n'
            'repo1-cipher-type=aes-256-cbc\ncompress-type=zst\narchive-async=n\n'
            'log-level-console=info\n[dr2]\npg1-path=/var/lib/postgresql/data\n')


def native_host():
    require(platform.system()=='Linux' and platform.machine() in ('x86_64','amd64'),'NATIVE_AMD64_REQUIRED')
    require(shutil.which('docker') is not None,'DOCKER_REQUIRED')
    try:
        p=subprocess.run(['docker','version','--format','{{.Server.Os}}/{{.Server.Arch}}'],
                         capture_output=True,text=True,timeout=10,check=True)
        require(p.stdout.strip()=='linux/amd64','NATIVE_DOCKER_AMD64_REQUIRED')
    except (OSError,subprocess.SubprocessError):raise Blocked('DOCKER_UNAVAILABLE') from None
    # Matching uname/daemon is necessary, not proof against nested emulation.
    return {'kernel':'Linux','architecture':'amd64','provider_native_attestation':'REQUIRED'}
