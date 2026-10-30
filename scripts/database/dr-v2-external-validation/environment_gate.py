"""Read only GitHub Environment metadata; fail if approval/secrets are unproven."""
import argparse
import json
import os
from pathlib import Path
import re
import urllib.request
from contracts import Blocked, require

ENVIRONMENT='dr-v2-external-validation'
REQUIRED_SECRETS={'DR2_RESTORE_ACCESS_KEY_ID','DR2_RESTORE_SECRET_ACCESS_KEY',
                  'DR2_CATALOG_HMAC_KEY','DR2_ENVIRONMENT_AUDIT_TOKEN'}


def validate_environment(data,names):
    require(data.get('name')==ENVIRONMENT,'ENVIRONMENT_MISMATCH')
    require(data.get('can_admins_bypass') is False,'ENVIRONMENT_BYPASS_NOT_DENIED')
    rules=[x for x in data.get('protection_rules',[]) if x.get('type')=='required_reviewers']
    require(any(x.get('reviewers') and x.get('prevent_self_review') is True for x in rules),'REQUIRED_REVIEWERS_NOT_CONFIGURED')
    require(REQUIRED_SECRETS<=set(names),'ENVIRONMENT_SECRETS_NOT_CONFIGURED')
    policy=data.get('deployment_branch_policy') or {}
    require(policy.get('protected_branches') is True,'PROTECTED_BRANCH_POLICY_REQUIRED')


def main():
    p=argparse.ArgumentParser();p.add_argument('--output',required=True);a=p.parse_args()
    result={'status':'BLOCKED_EXTERNAL_INFRASTRUCTURE'}
    try:
        repo=os.environ.get('GITHUB_REPOSITORY','');token=os.environ.get('DR2_ENVIRONMENT_AUDIT_TOKEN','')
        require(re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repo) and token,'ENVIRONMENT_METADATA_ACCESS_REQUIRED')
        def get(suffix):
            req=urllib.request.Request('https://api.github.com/repos/'+repo+'/environments/'+ENVIRONMENT+suffix,
                 headers={'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'})
            with urllib.request.urlopen(req,timeout=15) as response:return json.load(response)
        data=get('');names=[]
        for page in range(1,11):
            response=get('/secrets?per_page=100&page='+str(page));names.extend(x['name'] for x in response['secrets'])
            if len(names)>=response['total_count']:break
        else:raise Blocked('ENVIRONMENT_SECRET_METADATA_INCOMPLETE')
        validate_environment(data,names)
        result={'status':'ENVIRONMENT_POLICY_VERIFIED','environment':ENVIRONMENT,'secret_values_inspected':False,
                'session_token_environment_scoped':'DR2_RESTORE_SESSION_TOKEN' in names}
    except Blocked as e:result['reason']=str(e)
    except Exception:result['reason']='ENVIRONMENT_POLICY_UNVERIFIABLE'
    with Path(a.output).open('x') as f:json.dump(result,f,indent=2);f.write('\n')
    return 0 if result['status']=='ENVIRONMENT_POLICY_VERIFIED' else 2


if __name__=='__main__':raise SystemExit(main())
