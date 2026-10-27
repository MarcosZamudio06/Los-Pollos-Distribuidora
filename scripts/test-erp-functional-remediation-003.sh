#!/usr/bin/env bash
# Opt-in real integration corpus. Own resources only; never uses the caller's database.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
  docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"
fi
source "$repo/scripts/erp-ci-gis.sh"
run="erp-rem003-$(date +%s)-$$"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/erp-rem003.XXXXXX")"
pg="$run-pg"; storage="$run-s3"; browser=''; osrm=''; photon=''; vroom=''; network=''; photon_volume=''
GIS_DIAG_DIR="$scratch/diagnostics"
cleanup() {
  result=$?
  if [ -n "$photon" ]; then gis_capture "$photon" photon; fi
  if [ -n "$osrm" ]; then gis_capture "$osrm" osrm; fi
  if [ -n "$vroom" ]; then gis_capture "$vroom" vroom; fi
  if [ -n "${REM003_CI_EVIDENCE_DIR:-}" ]; then
    python3 "$repo/scripts/export-rem003-diagnostics.py" "$scratch" "$REM003_CI_EVIDENCE_DIR" || true
  fi
  "$docker_bin" logs "$pg" >"$scratch/postgres.log" 2>&1 || true
  for container in "$pg" "$storage" "$browser" "$osrm" "$photon" "$vroom"; do
    [ -z "$container" ] || "$docker_bin" stop "$container" >/dev/null 2>&1 || true
  done
  for container in "$photon" "$osrm" "$vroom"; do
    [ -z "$container" ] || "$docker_bin" rm -f "$container" >/dev/null 2>&1 || true
  done
  [ -z "$photon_volume" ] || "$docker_bin" volume rm "$photon_volume" >/dev/null 2>&1 || true
  [ -z "$network" ] || "$docker_bin" network rm "$network" >/dev/null 2>&1 || true
  return "$result"
}
trap cleanup EXIT
echo "Disposable remediation003 scratch: $scratch"
export OPENSSL_CONF=/dev/null NODE_ENV=test npm_config_script_shell=/bin/sh
export NODE_OPTIONS="--require=$repo/backend/test/no-local-env.cjs"
export CFDI_ENABLED=false FISCAL_PROVIDER=NONE SWAGGER_ENABLED=false APP_TIMEZONE=America/Mexico_City
export RATE_LIMIT_GLOBAL_MAX=100000 RATE_LIMIT_LOGIN_ACCOUNT_MAX=200 RATE_LIMIT_LOGIN_IP_MAX=500
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export JWT_ACCESS_EXPIRES_IN=2h JWT_REFRESH_EXPIRES_IN=7d
export AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800 AUTH_SESSION_IDLE_TTL_SECONDS=86400 AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS=300
export OBJECT_STORAGE_ACCESS_KEY_ID=rem003test OBJECT_STORAGE_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
export OBJECT_STORAGE_BUCKET=rem003-evidence OBJECT_STORAGE_FORCE_PATH_STYLE=true
export PHOTON_URL=http://127.0.0.1:1 OSRM_URL=http://127.0.0.1:1 VROOM_URL=http://127.0.0.1:1
export REM003_EVIDENCE_DIR="$scratch/evidence"
password="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$pg" --label task=erp-functional-remediation-003 \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_USER=rem003 -e POSTGRES_PASSWORD="$password" \
  -e POSTGRES_DB=pollos_rem003_e2e -p 127.0.0.1::5432 postgis/postgis:16-3.5 >/dev/null
"$docker_bin" run --rm -d --name "$storage" --label task=erp-functional-remediation-003 \
  --tmpfs /data:rw -e MINIO_ROOT_USER="$OBJECT_STORAGE_ACCESS_KEY_ID" -e MINIO_ROOT_PASSWORD="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  -p 127.0.0.1::9000 docker.io/pgsty/silo:RELEASE.2026-10-18T00-00-00Z@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7 server /data >/dev/null
pg_port="$("$docker_bin" port "$pg" 5432/tcp | awk -F: '{print $NF}')"
s3_port="$("$docker_bin" port "$storage" 9000/tcp | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://rem003:$password@127.0.0.1:$pg_port/pollos_rem003_e2e"
export E2E_DATABASE_URL="$DATABASE_URL" E2E_DATABASE_DISPOSABLE=true
export OBJECT_STORAGE_ENDPOINT="http://127.0.0.1:$s3_port" OBJECT_STORAGE_PUBLIC_ENDPOINT="http://127.0.0.1:$s3_port"
for n in $(seq 1 60); do
  if "$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U rem003 -d pollos_rem003_e2e >/dev/null 2>&1 && \
     curl --fail --silent "$OBJECT_STORAGE_ENDPOINT/minio/health/live" >/dev/null; then break; fi
  sleep 1
done
"$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U rem003 -d pollos_rem003_e2e
curl --fail --silent "$OBJECT_STORAGE_ENDPOINT/minio/health/live" >/dev/null
cd "$repo"
npm --prefix backend --script-shell=/bin/sh exec -- prisma migrate deploy --schema backend/prisma/schema.prisma >"$scratch/migrations.log" 2>&1 || {
  echo "Migration failed; inspect $scratch/migrations.log and $scratch/postgres.log"
  exit 1
}
if [ "${REM003_BROWSER:-false}" = true ]; then
  gis="${REM003_GIS_DIR:?Provide a prepared public Veracruz OSM/OSRM/Photon fixture bundle}"
  test -f "$gis/veracruz.osm" && test -f "$gis/veracruz.osrm.partition" && test -d "$gis/photon"
  osm_hash="$(openssl dgst -sha256 "$gis/veracruz.osm" | awk '{print substr($NF,1,12)}')"
  export MAP_DATA_VERSION="rem003-osm-$osm_hash"
  export MAP_DATA_PREPARED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # OpenSearch needs a writable index/lock. Copy to owned scratch; never mutate the source bundle.
  mkdir -p "$GIS_DIAG_DIR"
  photon_volume="$run-photon-data"
  "$docker_bin" volume create --label task=erp-functional-remediation-003 "$photon_volume" >/dev/null
  # Copy INSIDE Linux and own only this new volume with the image's UID/GID.
  # A host cp changes ownership to GitHub runner UID1001, making UID1000 fail.
  "$docker_bin" run --rm --user 0 --entrypoint sh -v "$gis/photon:/source:ro" -v "$photon_volume:/data" \
    pollos-distribuidor/photon:1.2.1 -ec 'test -d /source/photon_data; cp -R /source/. /data/; chown -R 1000:1000 /data; find /data -maxdepth 3 -type d -exec ls -ldn {} \;' >"$GIS_DIAG_DIR/photon-permissions.txt" 2>&1
  "$docker_bin" info --format '{"dockerMemoryBytes":{{.MemTotal}},"cpus":{{.NCPU}}}' >"$GIS_DIAG_DIR/host-memory.json"
  python3 - "$GIS_DIAG_DIR/host-memory.json" <<'PY_MEMORY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1]); data = json.loads(p.read_text())
data['hostMemAvailableBytes'] = None
mem = pathlib.Path('/proc/meminfo')
if mem.is_file():
    for line in mem.read_text().splitlines():
        if line.startswith('MemAvailable:'): data['hostMemAvailableBytes'] = int(line.split()[1]) * 1024
p.write_text(json.dumps(data))
PY_MEMORY
  "$docker_bin" run --rm --entrypoint sh -v "$photon_volume:/data" pollos-distribuidor/photon:1.2.1 \
    -ec 'test -d /data/photon_data/node_1/data; test -w /data/photon_data/node_1/logs; find /data/photon_data/node_1/data -type f | wc -l' >"$GIS_DIAG_DIR/index-files.txt"
  printf '{"photonVersion":"1.2.1","jarSha256":"6ea66d598a3f6fc1b59b0f81ad4f8abee72ccdb9d3db03bc12008974cdebd58d","ownership":"1000:1000","sourceReadOnly":true}\n' >"$GIS_DIAG_DIR/index.json"
  network="$run-gis"; "$docker_bin" network create "$network" >/dev/null
  osrm="$run-osrm"; photon="$run-photon"; vroom="$run-vroom"
  "$docker_bin" run -d --name "$osrm" --label task=erp-functional-remediation-003 --platform linux/amd64 \
    --network "$network" --network-alias osrm -p 127.0.0.1::5000 -v "$gis:/data:ro" \
    ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-routed --algorithm mld /data/veracruz.osrm >/dev/null
  "$docker_bin" run -d --name "$photon" --label task=erp-functional-remediation-003 --network "$network" \
    --memory=1536m -e JAVA_TOOL_OPTIONS='-Xms256m -Xmx768m' -v "$photon_volume:/data" -p 127.0.0.1::2322 \
    pollos-distribuidor/photon:1.2.1 >/dev/null
  "$docker_bin" run -d --name "$vroom" --label task=erp-functional-remediation-003 --platform linux/amd64 \
    --network "$network" -e VROOM_ROUTER=osrm -p 127.0.0.1::3000 \
    -v "$repo/docker/maps/vroom/config.yml:/conf/config.yml:ro" ghcr.io/vroom-project/vroom-docker:v1.15.0 >/dev/null
  OSRM_URL="$(gis_url "$osrm" 5000 osrm)"
  PHOTON_URL="$(gis_url "$photon" 2322 photon)"
  VROOM_URL="$(gis_url "$vroom" 3000 vroom)"
  export OSRM_URL PHOTON_URL VROOM_URL
  gis_readiness 90
  browser="$run-browser"
  image='mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
  "$docker_bin" image inspect "$image" >/dev/null
  ws_path="$(openssl rand -hex 24)"
  "$docker_bin" run --rm -d --name "$browser" --label task=erp-functional-remediation-003 --init --user pwuser --shm-size=1g \
    -e HOME=/home/pwuser -e NPM_CONFIG_USERCONFIG=/dev/null -p 127.0.0.1::3000 "$image" \
    npx -y playwright@1.63.0 run-server --port 3000 --host 0.0.0.0 --path "/$ws_path" --max-clients 1 >/dev/null
  browser_url="$(gis_url "$browser" 3000 browser)"
  export REM003_BROWSER_WS="${browser_url/http:/ws:}/$ws_path"
  export REM003_FRONTEND_DIST="$scratch/frontend"
  # This journey verifies real planning, not cartographic Fleet acceptance. No style/layer replacement.
  NODE_ENV=production VITE_APP_TIMEZONE=America/Mexico_City VITE_API_BASE_URL=/api VITE_MAP_STYLE_URL=/maps/styles/operations/style.json \
    npm --prefix frontend --script-shell=/bin/sh run build -- --outDir "$REM003_FRONTEND_DIST" --emptyOutDir >"$scratch/frontend-build.log" 2>&1
fi
echo "Disposable remediation003 evidence: $scratch"
cd "$repo/backend"
npm --script-shell=/bin/sh exec -- ts-node scripts/forbid-focused-tests.ts
# Provider readiness precedes every real browser launch. The browser journey
# runs before the API corpus and the full resistance window, never after a known GIS failure.
if [ "${REM003_BROWSER:-false}" = true ]; then
  gis_readiness 90
  npm --script-shell=/bin/sh exec -- jest --config test/jest-rem003.json --runInBand --runTestsByPath test/erp-functional-remediation-003.browser.integration.ts "$@"
fi
npm --script-shell=/bin/sh exec -- jest --config test/jest-rem003.json --runInBand --runTestsByPath test/erp-functional-remediation-003.integration.ts "$@"
npm --script-shell=/bin/sh exec -- jest --config test/jest-rem003.json --runInBand --runTestsByPath test/erp-functional-remediation-003.recovery.integration.ts
suite_result=0
if [ -n "${REM003_RESISTANCE_SECONDS:-}" ]; then
  npm --script-shell=/bin/sh exec -- jest --config test/jest-rem003.json --runInBand --runTestsByPath test/erp-functional-remediation-003.resistance.integration.ts "$@" || suite_result=$?
  if [ -f "$REM003_EVIDENCE_DIR/resistance-final-data.json" ]; then
    npm --script-shell=/bin/sh exec -- jest --config test/jest-rem003.json --runInBand --runTestsByPath test/erp-functional-remediation-003.persistence.integration.ts || suite_result=1
  fi
fi
exit "$suite_result"
