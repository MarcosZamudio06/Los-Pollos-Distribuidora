#!/usr/bin/env python3
"""Offline preparation runner, optionally checks local native host. No cloud writes."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import subprocess
from contracts import Blocked, native_host, pgbackrest_config, require, load_config
from metrics import PHASES

SCENARIOS=('host_loss','archive_network_interruption','missing_wal','missing_historical_version',
           'object_integrity','catalog_unauthenticated','wrong_credentials','cross_company',
           'partial_restore','service_start_failure')


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',required=True);parser.add_argument('--audited-sha',required=True)
    parser.add_argument('--output',required=True);parser.add_argument('--check-host',action='store_true')
    a=parser.parse_args();os.umask(0o077);out=Path(a.output);out.mkdir(parents=True,exist_ok=False)
    r={'task':'ERP-DR-V2-EXTERNAL-VALIDATION-001','status':'BLOCKED_EXTERNAL_INFRASTRUCTURE',
       'started_at':dt.datetime.now(dt.timezone.utc).isoformat(),'rpo_seconds':None,'rto_seconds':None,
       'production_authorized':False,'traffic_cutover_performed':False,
       'integrated_tests':{n:'BLOCKED_EXTERNAL_INFRASTRUCTURE' for n in SCENARIOS},
       'required_phases':list(PHASES)}
    try:
        c=load_config(a.config,a.audited_sha)
        head=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
        require(head==a.audited_sha,'CHECKOUT_SHA_MISMATCH')
        if a.check_host:r['coordinator_host']=native_host()
        (out/'pgbackrest.proposed.conf').write_text(pgbackrest_config(c))
        r.update(status='PREPARATION_VALIDATED_NOT_EXECUTED',config_sha256=hashlib.sha256(Path(a.config).read_bytes()).hexdigest(),
                 audited_sha=head,run_id=c['run_id'],company=c['company'],native_host_checked=a.check_host,
                 execution_blocker='APPROVED_HOST_AND_SERVICE_ADAPTERS_REQUIRED')
    except Blocked as e:r['reason']=str(e)
    except Exception:r['reason']='PREPARATION_INPUT_UNAVAILABLE'
    (out/'preparation.json').write_text(json.dumps(r,indent=2)+'\n')
    return 0 if r['status']=='PREPARATION_VALIDATED_NOT_EXECUTED' else 2


if __name__=='__main__':raise SystemExit(main())
