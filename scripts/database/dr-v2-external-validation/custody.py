"""Package explicitly inventoried sanitized historical audits; no uploads or Git writes."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import tarfile
from contracts import Blocked, require


def checked_file(root, entry):
    rel=entry['path'];p=Path(rel)
    require(not p.is_absolute() and '..' not in p.parts and p.parts[0]=='Audit','CUSTODY_PATH_REJECTED')
    require(p.suffix in ('.md','.json','.jsonl','.log'),'CUSTODY_TYPE_REJECTED')
    target=root/p
    require(not target.is_symlink() and target.resolve()==root.resolve()/p and target.is_file(),'CUSTODY_SOURCE_UNAVAILABLE')
    raw=target.read_bytes();require(hashlib.sha256(raw).hexdigest()==entry['sha256'],'CUSTODY_HASH_MISMATCH')
    s=raw.decode('utf-8')
    require(not re.search(r'-----BEGIN [^-]*PRIVATE KEY-----|postgres(?:ql)?://(?!\[REDACTED\])',s),'CUSTODY_PRIVACY_REJECTED')
    return target


def export_bundle(root,manifest,output):
    require(manifest['schema']=='dr2-audit-custody/v1','CUSTODY_MANIFEST_REJECTED')
    checked=[(e,checked_file(root,e)) for e in manifest['archive_files']]
    require(len({e['path'] for e,_ in checked})==len(checked),'CUSTODY_DUPLICATE_PATH')
    with tarfile.open(output,'x:gz') as archive:
        for entry,path in checked:archive.add(path,arcname=entry['path'],recursive=False)
    return {'status':'LOCAL_ARCHIVE_CREATED_EXTERNAL_CUSTODY_PENDING','files':len(checked),
            'sha256':hashlib.sha256(Path(output).read_bytes()).hexdigest(),'bytes':Path(output).stat().st_size}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',required=True);p.add_argument('--output',required=True)
    a=p.parse_args();root=Path(__file__).resolve().parents[3]
    try:
        result=export_bundle(root,json.loads(Path(a.manifest).read_text()),a.output)
        with Path(a.output+'.receipt.json').open('x') as f:json.dump(result,f,indent=2);f.write('\n')
        print(result['status']);return 0
    except (Blocked,OSError,ValueError,KeyError):print('CUSTODY_BLOCKED');return 2


if __name__=='__main__':raise SystemExit(main())
