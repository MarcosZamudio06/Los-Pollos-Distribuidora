#!/usr/bin/env python3
"""Explicit regression probe of the OLD Unix-socket bootstrap race.

Never imported by the normal harness. Uses new synthetic owned resources only.
"""
import argparse
import json
import time
from lab import Lab


class ProbeComplete(Exception):
    pass


class LegacyProbe(Lab):
    def waitsql(self, name, seconds=90):
        deadline=time.monotonic()+seconds
        while time.monotonic()<deadline:
            code,_=self.cmd('exec','-u','postgres',name,'pg_isready','-U','postgres',ok=False)
            if code==0:return
            time.sleep(.5)
        raise TimeoutError('LEGACY_READINESS_TIMEOUT')

    def sql(self, name, sql):
        return self.cmd('exec','-u','postgres',name,'psql','-XAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-c',sql)[1].strip()

    def create_schema(self, name):
        self.stage='legacy_combined_schema_payload'
        self.sql(name,"CREATE TABLE sentinels(id text primary key); CREATE TABLE assets(id int primary key, object jsonb not null); CREATE TABLE payload AS SELECT i, string_agg(md5(random()::text),'') AS data FROM generate_series(1,"+str(self.rows)+") i CROSS JOIN generate_series(1,32) j GROUP BY i;")

    def load_payload(self, name):
        raise ProbeComplete()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',required=True)
    args=parser.parse_args()
    lab=LegacyProbe(args.output,32768)
    try:
        lab.run()
    except ProbeComplete:
        lab.result.update(status='NOT_REPRODUCED')
    except Exception as e:
        lab.result.update(status='OTHER_FAILURE',failure=lab.sanitize(str(e)),failed_stage=lab.stage)
        if 'terminating connection due to administrator command' in (lab.root/'commands.jsonl').read_text():
            lab.result['status']='REPRODUCED_ADMINISTRATOR_TERMINATION'
    finally:
        try:lab.diagnostics('legacy-pre-cleanup')
        finally:
            lab.cleanup()
            (lab.root/'result.json').write_text(json.dumps(lab.result,indent=2)+'\n')
    if lab.result['status']!='REPRODUCED_ADMINISTRATOR_TERMINATION' or lab.result['cleanup']!='PASSED':
        raise SystemExit(1)


if __name__=='__main__':main()
