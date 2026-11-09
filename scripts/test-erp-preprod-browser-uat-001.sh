#!/usr/bin/env bash
# Opt-in enterprise-screen acceptance. Only resources created here may be stopped.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"
run="erp-uat001-$(date +%s)-$$"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/erp-uat001.XXXXXX")"
evidence="${UAT_EVIDENCE_DIR:-$scratch/evidence}"
mkdir -p "$evidence"
pg="$run-pg"; storage="$run-s3"; browser="$run-browser"; tiles="$run-tiles"
cleanup(){
  for kind in browser tiles s3 pg; do
    id="$(cat "$evidence/$kind-container.txt" 2>/dev/null || true)"
    if [[ "$id" =~ ^[a-f0-9]{64}$ ]]; then
      "$docker_bin" stop "$id" >/dev/null 2>&1 || true
      "$docker_bin" inspect --format '{{.State.Status}}' "$id" >> "$evidence/cleanup-readback.log" 2>&1 || true
    fi
  done
}
trap cleanup EXIT
mark(){ printf '%s\t%s\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$evidence/runner-phases.tsv"; }
mark start
export OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh NODE_ENV=test
export NODE_OPTIONS="--require=$repo/backend/test/no-local-env.cjs"
export CFDI_ENABLED=false FISCAL_PROVIDER=NONE SWAGGER_ENABLED=false APP_TIMEZONE=America/Mexico_City
export RATE_LIMIT_GLOBAL_MAX=100000 RATE_LIMIT_LOGIN_ACCOUNT_MAX=200 RATE_LIMIT_LOGIN_IP_MAX=500
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export JWT_ACCESS_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=7d
export AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800 AUTH_SESSION_IDLE_TTL_SECONDS=86400 AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS=300
export OBJECT_STORAGE_ACCESS_KEY_ID=uat001disposable OBJECT_STORAGE_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
export OBJECT_STORAGE_BUCKET=rem003-evidence OBJECT_STORAGE_FORCE_PATH_STYLE=true
export PHOTON_URL=http://127.0.0.1:1 OSRM_URL=http://127.0.0.1:1 VROOM_URL=http://127.0.0.1:1
password="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$pg" --label task=erp-preprod-browser-uat-001 --tmpfs /var/lib/postgresql/data:rw \
  -e POSTGRES_USER=uat -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=pollos_rem003_e2e -p 127.0.0.1::5432 postgis/postgis:16-3.5 > "$evidence/pg-container.txt"
"$docker_bin" run --rm -d --name "$storage" --label task=erp-preprod-browser-uat-001 --tmpfs /data:rw \
  -e MINIO_ROOT_USER="$OBJECT_STORAGE_ACCESS_KEY_ID" -e MINIO_ROOT_PASSWORD="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  -p 127.0.0.1::9000 docker.io/pgsty/silo:RELEASE.2026-10-18T00-00-00Z@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7 server /data > "$evidence/s3-container.txt"
export DATABASE_URL="postgresql://uat:$password@127.0.0.1:$("$docker_bin" port "$pg" 5432/tcp | awk -F: '{print $NF}')/pollos_rem003_e2e"
export E2E_DATABASE_URL="$DATABASE_URL" E2E_DATABASE_DISPOSABLE=true
export OBJECT_STORAGE_ENDPOINT="http://127.0.0.1:$("$docker_bin" port "$storage" 9000/tcp | awk -F: '{print $NF}')"
export OBJECT_STORAGE_PUBLIC_ENDPOINT="$OBJECT_STORAGE_ENDPOINT"
for n in $(seq 1 60); do
  if "$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U uat >/dev/null 2>&1 && curl --fail --silent "$OBJECT_STORAGE_ENDPOINT/minio/health/live" >/dev/null; then break; fi
  sleep 1
done
"$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U uat >/dev/null
curl --fail --silent "$OBJECT_STORAGE_ENDPOINT/minio/health/live" >/dev/null
mark database-storage-ready
rendering="$repo/.map-data/rendering"
test -s "$rendering/mexico.pmtiles"
test -d "$rendering/fonts"
"$docker_bin" run --rm -d --name "$tiles" --label task=erp-preprod-browser-uat-001 \
 -v "$rendering:/data/rendering:ro" -v "$rendering/fonts:/data/fonts:ro" \
 -v "$repo/docker/maps/styles:/data/styles:ro" -v "$repo/docker/maps/tileserver/config.json:/data/config.json:ro" \
 -p 127.0.0.1::8080 maptiler/tileserver-gl:v5.6.0 --config /data/config.json --port 8080 --public_url /maps/ > "$evidence/tiles-container.txt"
export VITE_DEV_MAP_PROXY_TARGET="http://127.0.0.1:$("$docker_bin" port "$tiles" 8080/tcp | awk -F: '{print $NF}')"
export VITE_MAP_STYLE_URL=/maps/styles/operations/style.json
export UAT_TILES_URL="$VITE_DEV_MAP_PROXY_TARGET"
for n in $(seq 1 60); do
 if curl --fail --silent "$VITE_DEV_MAP_PROXY_TARGET/styles/operations/style.json" >/dev/null; then break; fi
 sleep 1
done
curl --fail --silent "$VITE_DEV_MAP_PROXY_TARGET/styles/operations/style.json" >/dev/null
mark tiles-ready
# Copy only Git-known source. No recursive dependency, dotenv or credential reads.
python3 - "$repo" "$scratch" "$evidence/executed-source.json" <<'PY'
from pathlib import Path
import subprocess,sys,shutil,hashlib,json
r,t=map(Path,sys.argv[1:3])
manifest=[]
names=subprocess.check_output(['git','-C',str(r),'ls-files','-z','--cached','--others','--exclude-standard']).decode().split('\0')
for name in sorted(set(names)-{''}):
 p=Path(name)
 if any(x in p.parts for x in ('node_modules','dist','.git','coverage','build','.next','secrets','.credentials','.aws','.ssh')):continue
 if p.name.startswith('.env') or p.suffix in ('.key','.pem') or p.name=='credentials.json':continue
 source=r/p
 if source.is_file():
  dest=t/p;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,dest)
  manifest.append({'path':name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'mode':oct(source.stat().st_mode & 0o777)})
Path(sys.argv[3]).write_text(json.dumps(manifest,indent=2))
PY
if [ -n "${UAT_FREEZE_MANIFEST:-}" ]; then
 python3 - "$UAT_FREEZE_MANIFEST" "$evidence/executed-source.json" <<'PYFREEZE'
from pathlib import Path
import json,sys
expected=json.loads(Path(sys.argv[1]).read_text())['files']
actual=json.loads(Path(sys.argv[2]).read_text())
if expected != actual:raise SystemExit('Frozen source mismatch: refusing execution')
PYFREEZE
fi
printf 'Scratch: %s\n' "$scratch" | tee "$evidence/scratch.txt"
for package in backend frontend; do
 (cd "$scratch/$package" && npm --script-shell=/bin/sh ci --ignore-scripts --no-audit --no-fund) > "$evidence/$package-install.log" 2>&1
done
mark packages-installed
(cd "$scratch/backend" && npm exec -- prisma generate --schema prisma/schema.prisma) > "$evidence/prisma-generate.log" 2>&1
(cd "$scratch/backend" && npm exec -- prisma migrate deploy --schema prisma/schema.prisma) > "$evidence/migrations.log" 2>&1
mark migrations-ready
image='mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
path="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$browser" --label task=erp-preprod-browser-uat-001 --init --user pwuser --shm-size=1g \
 -e HOME=/home/pwuser -e NPM_CONFIG_USERCONFIG=/dev/null -p 127.0.0.1::3000 "$image" \
 npx -y playwright@1.63.0 run-server --port 3000 --host 0.0.0.0 --path "/$path" --max-clients 1 > "$evidence/browser-container.txt"
export UAT_BROWSER_WS="ws://127.0.0.1:$("$docker_bin" port "$browser" 3000/tcp | awk -F: '{print $NF}')/$path"
for n in $(seq 1 60); do
 if "$docker_bin" logs "$browser" 2>&1 | grep -q 'Listening on'; then break; fi
 sleep 1
done
"$docker_bin" logs "$browser" 2>&1 | grep -q 'Listening on'
mark browser-server-ready
export UAT_FRONTEND="$scratch/frontend" UAT_EVIDENCE_DIR="$evidence"
if [ "${UAT_DIAGNOSTICS:-false}" = true ]; then
 python3 "$repo/scripts/instrument-preprod-realtime.py" "$scratch" > "$evidence/instrumentation.json"
fi
# Observability is part of the frozen test apparatus, never the live ERP source.
python3 "$repo/scripts/instrument-preprod-pedidos.py" "$scratch" > "$evidence/pedidos-observer-transform.json"
if [ -n "${UAT_PEDIDOS_MUTANT:-}" ]; then
 if [ -n "${UAT_FREEZE_MANIFEST:-}" ]; then echo 'Mutant forbidden in acceptance' >&2; exit 1; fi
 python3 "$repo/scripts/perturb-preprod-pedidos.py" "$scratch" "$UAT_PEDIDOS_MUTANT" > "$evidence/pedidos-mutant-transform.json"
fi
export UAT_CEDIS_DIAGNOSTICS="${UAT_CEDIS_DIAGNOSTICS:-true}"
if [ "$UAT_CEDIS_DIAGNOSTICS" = true ]; then
 python3 "$repo/scripts/instrument-preprod-cedis.py" "$scratch" > "$evidence/cedis-observer-transform.json"
fi
export UAT_FRONTEND_MODE="${UAT_FRONTEND_MODE:-production}"
if [ "$UAT_FRONTEND_MODE" = production ]; then
 (cd "$scratch/frontend" && NODE_ENV=production npm run build) > "$evidence/frontend-production-build.log" 2>&1
fi
python3 - "$scratch" "$evidence/executed-source.json" "$evidence/observed-source.json" <<'PYOBS'
from pathlib import Path
import sys,json,hashlib
root=Path(sys.argv[1]);rows=json.loads(Path(sys.argv[2]).read_text())
for row in rows:row['sha256']=hashlib.sha256((root/row['path']).read_bytes()).hexdigest()
Path(sys.argv[3]).write_text(json.dumps({'files':rows,'sha256':hashlib.sha256(json.dumps(rows,sort_keys=True,separators=(',',':')).encode()).hexdigest()},indent=2))
PYOBS
if [ -n "${UAT_OBSERVED_FREEZE:-}" ]; then
 python3 - "$UAT_OBSERVED_FREEZE" "$evidence/observed-source.json" <<'PYVERIFY'
from pathlib import Path
import sys,json
assert json.loads(Path(sys.argv[1]).read_text())['files']==json.loads(Path(sys.argv[2]).read_text())['files'],'Observed source mismatch'
PYVERIFY
fi
mark frontend-built
export REM003_EVIDENCE_DIR="$evidence"
set +e
(cd "$scratch/backend" && npm exec -- jest --config '{"rootDir":".","testEnvironment":"node","testRegex":"preprod-browser-uat.integration.ts$","transform":{"^.+\\.(t|j)s$": ["ts-jest",{"tsconfig":"<rootDir>/tsconfig.json"}]}}' --runInBand --json --outputFile="$evidence/jest-results.json" "$@") > "$evidence/browser-uat.log" 2>&1
code=$?
set -e
mark jest-finished
python3 "$repo/scripts/verify-preprod-uat-results.py" "$evidence" "$code" "$#" || code=1
printf 'test_exit=%s\n' "$code" > "$evidence/result.txt"
tail -45 "$evidence/browser-uat.log"
printf 'Evidence: %s\nScratch: %s\n' "$evidence" "$scratch"
exit "$code"
