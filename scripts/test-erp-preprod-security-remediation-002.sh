#!/usr/bin/env bash
# Source-only disposable acceptance; no Audit dependency and no workstation dotenv.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
evidence="${SECURITY_EVIDENCE_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/erp-sec002-evidence.XXXXXX")}"
mkdir -p "$evidence"
export OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh NODE_OPTIONS="--require=$repo/backend/test/no-local-env.cjs"
docker_bin="${DOCKER_BIN:-docker}"
browser="erp-sec002-browser-$(date +%s)-$$"
cleanup(){ "$docker_bin" stop "$browser" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# A separate frontend copy is needed before the database runner launches Chromium.
web="$(mktemp -d "${TMPDIR:-/tmp}/erp-sec002-web.XXXXXX")"
python3 - "$repo" "$web" <<'PY'
from pathlib import Path
import sys,shutil
r,t=map(Path,sys.argv[1:])
for base in ['frontend/src','frontend/e2e','shared']:
 for p in (r/base).rglob('*'):
  if p.is_file() and p.suffix in ('.ts','.tsx','.html','.css','.svg','.json') and not any(x in p.parts for x in ('node_modules','dist','.git','coverage','secrets')):
   q=t/p.relative_to(r);q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,q)
for n in ['package.json','package-lock.json','vite.config.ts','tsconfig.json','tsconfig.app.json','tsconfig.node.json','eslint.config.js','index.html']:
 p=r/'frontend'/n
 if p.exists():shutil.copyfile(p,t/'frontend'/n)
PY
(cd "$web/frontend" && npm --script-shell=/bin/sh ci --ignore-scripts --no-audit --no-fund) > "$evidence/frontend-install.log" 2>&1
if [ "${SECURITY_BROWSER:-true}" = true ]; then
 image='mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
 "$docker_bin" image inspect "$image" >/dev/null
 path="$(openssl rand -hex 24)"
 "$docker_bin" run --rm -d --name "$browser" --label task=erp-preprod-security-remediation-002 --init --user pwuser --shm-size=1g -e HOME=/home/pwuser -e NPM_CONFIG_USERCONFIG=/dev/null -p 127.0.0.1::3000 "$image" npx -y playwright@1.63.0 run-server --port 3000 --host 0.0.0.0 --path "/$path" --max-clients 1 > "$evidence/browser-container.txt"
 port="$("$docker_bin" port "$browser" 3000/tcp | awk -F: '{print $NF}')"
 export SECURITY_BROWSER_WS="ws://127.0.0.1:$port/$path" SECURITY_BROWSER_FRONTEND="$web/frontend"
else
 printf 'Chromium NOT_RUN: explicitly disabled by caller\n' > "$evidence/browser-status.txt"
fi
printf 'Frontend copy: %s\n' "$web/frontend"
# This must succeed before any downstream checks. Original 48 assertions remain.
SECURITY_EVIDENCE_DIR="$evidence/database" bash "$repo/scripts/test-erp-preprod-security-remediation-001.sh" | tee "$evidence/database-runner.log"
scratch="$(sed -n 's/^Scratch: //p' "$evidence/database-runner.log" | tail -1)"
[ -n "$scratch" ]
(cd "$web/frontend" && npm test -- src/lib/__tests__/realtimePagesRecovery.test.tsx src/lib/__tests__/realtimeRecovery.test.ts src/features/fleet/__tests__/fleetHooks.test.tsx src/lib/__tests__/fleetSocket.test.ts) > "$evidence/frontend-tests.log" 2>&1
printf 'Frontend copy: %s\nBackend copy: %s\nEvidence: %s\n' "$web/frontend" "$scratch/backend" "$evidence"
