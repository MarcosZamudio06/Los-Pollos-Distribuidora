"""Read back actual Jest results and matrix identity, never fabricate a PASS."""
from pathlib import Path
import json, sys
root = Path(sys.argv[1])
code = int(sys.argv[2])
full = int(sys.argv[3]) == 0
catalog_path = root / 'scenario-catalog.json'
if not catalog_path.exists():
    (root / 'acceptance.json').write_text(json.dumps({'accepted': False, 'cause': 'SETUP_OR_COLLECTION_FAILED'}))
    raise SystemExit(1)
catalog = json.loads(catalog_path.read_text())
matrix = json.loads((root / 'scenario-matrix.json').read_text()) if (root / 'scenario-matrix.json').exists() else []
assertions = json.loads((root / 'jest-results.json').read_text())['testResults'][0]['assertionResults']
ids = [x['id'] for x in catalog]
if len(ids) != 29 or len(set(ids)) != 29: raise SystemExit('Original 29 scenario identity lost')
by_id = {x['id']: x for x in matrix}
if len(matrix) != len(by_id): raise SystemExit('Duplicated scenario execution')
readback = []
for item in catalog:
    matches = [x for x in assertions if x['title'].endswith('] ' + item['id'])]
    if len(matches) != 1: raise SystemExit('Scenario must have one Jest case')
    test = matches[0]
    row = by_id.get(item['id'])
    if not row:
        readback.append({**item, 'result': 'NOT_RUN' if test['status'] == 'pending' else 'BLOCKED', 'cause': 'EXPLICIT_SELECTOR' if test['status'] == 'pending' else 'SETUP_OR_LIFECYCLE_FAILED', 'jestStatus': test['status']})
    else:
        if row['result'] == 'PASS' and test['status'] != 'passed': raise SystemExit('Matrix/Jest PASS disagreement')
        readback.append({**item, 'result': row['result'], 'cause': row.get('cause'), 'jestStatus': test['status']})
accepted = code == 0 and len(matrix) == 29 and all(x['result'] == 'PASS' for x in readback) and all(x['status'] == 'passed' for x in assertions)
(root / 'acceptance.json').write_text(json.dumps({'fullRunRequested': full, 'accepted': accepted, 'jestExit': code, 'matrix': readback}, indent=2))
if full and not accepted:
    raise SystemExit(1)
