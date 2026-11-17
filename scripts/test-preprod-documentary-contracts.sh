#!/usr/bin/env bash
# Hermetic public-contract checks: never mount a workstation dotenv, HOME or .git.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/erp-public-contracts.XXXXXX")"
evidence="${HARDENING_EVIDENCE_DIR:-$work/evidence}"
mkdir -p "$evidence"
docker_bin="${DOCKER_BIN:-docker}"
name="erp-public-contracts-$(date +%s)-$$"
image="$name:checks"
cleanup() { "$docker_bin" stop "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
python3 - "$repo" "$work/source" <<'PY'
from pathlib import Path
import subprocess,sys,shutil,json
r,t=map(Path,sys.argv[1:]);t.mkdir(parents=True)
git=lambda *a:subprocess.check_output(['git','-C',str(r),*a])
paths=set((git('ls-files','-z')+git('ls-files','--others','--exclude-standard','-z')).decode().split('\0'))-{''}
copied=[]
for n in sorted(paths):
 p=Path(n)
 if any(x in p.parts for x in ('node_modules','dist','build','coverage','.git','Audit','pollos','landing','secrets','.credentials','.aws','.ssh','.next')):continue
 if p.name.startswith('.env') or p.name=='credentials.json' or p.suffix in ('.key','.pem'):continue
 if not (p.parts[0] in ('backend','frontend','shared','scripts','docker','.github','docs','specs') or len(p.parts)==1):continue
 if not (r/p).is_file():continue
 q=t/p;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(r/p,q);copied.append(n)
templates={}
for n in ('.env.example','.env.production.example'):
 # Only committed public templates; fail rather than silently reading a changed example.
 if subprocess.run(['git','-C',str(r),'diff','--quiet','HEAD','--',n]).returncode:
  raise SystemExit('Public template differs from HEAD; explicit template review is required')
 templates[n]=git('show','HEAD:'+n).decode()
(t/'public-contract-templates.json').write_text(json.dumps(templates)+'\n')
(t/'public-contract-paths.txt').write_bytes('\0'.join(copied+list(templates)).encode()+b'\0')
PY
"$docker_bin" build --platform linux/amd64 --label task=erp-preprod-candidate-hardening-001 \
  --target deps -f "$repo/docker/backend/Dockerfile" -t "$image" "$work/source" \
  > "$evidence/deps-image.log" 2>&1
# CI's release-preflight contract invokes Bash. Alpine's application base does
# not include it; install tools only in this disposable checking image.
printf 'FROM %s\nRUN apk add --no-cache bash git python3 curl\n' "$image" > "$work/checks.Dockerfile"
"$docker_bin" build --platform linux/amd64 --label task=erp-preprod-candidate-hardening-001 \
  -f "$work/checks.Dockerfile" -t "$image" "$work" \
  > "$evidence/check-tools-image.log" 2>&1
"$docker_bin" image inspect "$image" --format '{{.Id}}' > "$evidence/image-id.txt"
"$docker_bin" run --rm --platform linux/amd64 --name "$name" \
  --label task=erp-preprod-candidate-hardening-001 --network none \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 \
  --memory 4g --cpus 2 --tmpfs /work:rw,exec \
  --mount "type=bind,source=$work/source,target=/input,readonly" \
  -e JWT_ACCESS_SECRET=ci-access-secret-at-least-32-characters \
  -e JWT_REFRESH_SECRET=ci-refresh-secret-at-least-32-characters \
  -e NODE_ENV=test -e CFDI_ENABLED=false -e FISCAL_PROVIDER=NONE \
  -e FULL_COVERAGE="${HARDENING_FULL_COVERAGE:-false}" \
  "$image" sh -eu -c '
    cp -a /input/. /work/
    node -e '\''const fs=require("node:fs");const t=JSON.parse(fs.readFileSync("/work/public-contract-templates.json","utf8"));for(const n of [".env.example",".env.production.example"])fs.writeFileSync("/work/"+n,t[n]);'\''
    ln -s /app/backend/node_modules /work/backend/node_modules
    cd /work/backend
    npm exec -- prisma generate --schema prisma/schema.prisma
    status=0
    npm test -- --runInBand --runTestsByPath src/prisma/bootstrap-production.spec.ts src/prisma/production-health-monitoring.contract.spec.ts src/prisma/production-container-hardening.contract.spec.ts src/prisma/production-release.contract.spec.ts src/prisma/candidate-hardening.contract.spec.ts || status=1
    cd /work
    node scripts/forbid-exclusive-tests.mjs || status=1
    node --test scripts/release-ci.contract.test.mjs scripts/erp-ci-gis.contract.test.mjs scripts/validate-fiscal-assets.test.mjs || status=1
    node scripts/validate-fiscal-assets.mjs --files-from-stdin < public-contract-paths.txt || status=1
    if [ "$FULL_COVERAGE" = true ]; then
      npm --prefix backend run test:cov || status=1
    fi
    exit "$status"
  ' > "$evidence/contracts.log" 2>&1
printf 'Evidence: %s\nSource snapshot: %s\n' "$evidence" "$work/source"
