#!/usr/bin/env bash
# Opt-in real integration corpus. Own resources only; never uses the caller's database.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
  docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"
fi
source "$repo/scripts/erp-ci-gis.sh"
run="erp-rem004-$(date +%s)-$$"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/erp-rem004.XXXXXX")"
pg="$run-pg"; storage="$run-s3"; browser=''; osrm=''; photon=''; vroom=''; network=''; pg_b=''; storage_b=''; photon_volume=''; tiles=''
GIS_DIAG_DIR="$scratch/diagnostics"
cleanup() {
  result=$?
  for role in photon osrm vroom; do
    case "$role" in photon) name="$photon";; osrm) name="$osrm";; vroom) name="$vroom";; esac
    [ -z "$name" ] || gis_capture "$name" "$role"
  done
  if [ -n "${REM003_CI_EVIDENCE_DIR:-}" ]; then
    python3 "$repo/scripts/export-rem003-diagnostics.py" "$scratch" "$REM003_CI_EVIDENCE_DIR/rem004" || true
  fi
  "$docker_bin" logs "$pg" >"$scratch/postgres.log" 2>&1 || true
  for container in "$pg" "$storage" "$browser" "$osrm" "$photon" "$vroom" "$pg_b" "$storage_b" "$tiles"; do
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
echo "Disposable remediation004 scratch: $scratch"
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
"$docker_bin" run --rm -d --name "$pg" --label task=erp-functional-remediation-004 \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_USER=rem003 -e POSTGRES_PASSWORD="$password" \
  -e POSTGRES_DB=pollos_rem003_e2e -p 127.0.0.1::5432 postgis/postgis:16-3.5 >/dev/null
"$docker_bin" run --rm -d --name "$storage" --label task=erp-functional-remediation-004 \
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

pg_b="$run-pg-b"; storage_b="$run-s3-b"
password_b="$(openssl rand -hex 24)"
export REM004_SILO_ACCESS_KEY=rem004silob REM004_SILO_STORAGE_SECRET="$(openssl rand -hex 24)"
export REM004_SILO_JWT_ACCESS_SECRET="$(openssl rand -hex 32)" REM004_SILO_JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
"$docker_bin" run --rm -d --name "$pg_b" --label task=erp-functional-remediation-004 --tmpfs /var/lib/postgresql/data:rw \
 -e POSTGRES_USER=rem003 -e POSTGRES_PASSWORD="$password_b" -e POSTGRES_DB=pollos_rem003_e2e -p 127.0.0.1::5432 postgis/postgis:16-3.5 >/dev/null
"$docker_bin" run --rm -d --name "$storage_b" --label task=erp-functional-remediation-004 --tmpfs /data:rw \
 -e MINIO_ROOT_USER="$REM004_SILO_ACCESS_KEY" -e MINIO_ROOT_PASSWORD="$REM004_SILO_STORAGE_SECRET" -p 127.0.0.1::9000 docker.io/pgsty/silo:RELEASE.2026-10-18T00-00-00Z@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7 server /data >/dev/null
export REM004_SILO_DATABASE_URL="postgresql://rem003:$password_b@127.0.0.1:$("$docker_bin" port "$pg_b" 5432/tcp | awk -F: '{print $NF}')/pollos_rem003_e2e"
export REM004_SILO_STORAGE_URL="http://127.0.0.1:$("$docker_bin" port "$storage_b" 9000/tcp | awk -F: '{print $NF}')"
for n in $(seq 1 60); do
 if "$docker_bin" exec "$pg_b" pg_isready -h 127.0.0.1 -U rem003 >/dev/null 2>&1 && curl --fail --silent "$REM004_SILO_STORAGE_URL/minio/health/live" >/dev/null; then break; fi
 sleep 1
done
DATABASE_URL="$REM004_SILO_DATABASE_URL" E2E_DATABASE_URL="$REM004_SILO_DATABASE_URL" \
 npm --prefix backend --script-shell=/bin/sh exec -- prisma migrate deploy --schema backend/prisma/schema.prisma >"$scratch/migrations-b.log" 2>&1

  gis="${REM004_GIS_DIR:?Provide a prepared public Veracruz OSM/OSRM/Photon fixture bundle}"
  test -f "$gis/veracruz.osm" && test -f "$gis/veracruz.osrm.partition" && test -d "$gis/photon"
  export MAP_DATA_VERSION="rem004-public-veracruz"
  export MAP_DATA_PREPARED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  # OpenSearch needs a writable index/lock. Copy to owned scratch; never mutate the source bundle.
  mkdir -p "$GIS_DIAG_DIR"
  photon_volume="$run-photon-data"
  "$docker_bin" volume create --label task=erp-functional-remediation-004 "$photon_volume" >/dev/null
  "$docker_bin" run --rm --user 0 --entrypoint sh -v "$gis/photon:/source:ro" -v "$photon_volume:/data" \
    pollos-distribuidor/photon:1.2.1 -ec 'test -d /source/photon_data; cp -R /source/. /data/; chown -R 1000:1000 /data; find /data -maxdepth 3 -type d -exec ls -ldn {} \;' >"$GIS_DIAG_DIR/photon-permissions.txt" 2>&1
  network="$run-gis"; "$docker_bin" network create "$network" >/dev/null
  osrm="$run-osrm"; photon="$run-photon"; vroom="$run-vroom"
  "$docker_bin" run -d --name "$osrm" --label task=erp-functional-remediation-004 --platform linux/amd64 \
    --network "$network" --network-alias osrm -p 127.0.0.1::5000 -v "$gis:/data:ro" \
    ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-routed --algorithm mld /data/veracruz.osrm >/dev/null
  "$docker_bin" run -d --name "$photon" --label task=erp-functional-remediation-004 --network "$network" \
    --memory=1536m -e JAVA_TOOL_OPTIONS='-Xms256m -Xmx768m' -v "$photon_volume:/data" -p 127.0.0.1::2322 \
    pollos-distribuidor/photon:1.2.1 >/dev/null
  "$docker_bin" run -d --name "$vroom" --label task=erp-functional-remediation-004 --platform linux/amd64 \
    --network "$network" -e VROOM_ROUTER=osrm -p 127.0.0.1::3000 \
    -v "$repo/docker/maps/vroom/config.yml:/conf/config.yml:ro" ghcr.io/vroom-project/vroom-docker:v1.15.0 >/dev/null
  OSRM_URL="$(gis_url "$osrm" 5000 osrm)"
  PHOTON_URL="$(gis_url "$photon" 2322 photon)"
  VROOM_URL="$(gis_url "$vroom" 3000 vroom)"
  export OSRM_URL PHOTON_URL VROOM_URL
  gis_readiness 90

rendering="${REM004_RENDERING_DIR:-$repo/.map-data/rendering}"
test -s "$rendering/mexico.pmtiles"
test -d "$rendering/fonts"
browser="$run-browser"; tiles="$run-tiles"
"$docker_bin" run --rm -d --name "$tiles" --label task=erp-functional-remediation-004 \
 -v "$rendering:/data/rendering:ro" \
 -v "$rendering/fonts:/data/fonts:ro" \
 -v "$repo/docker/maps/styles:/data/styles:ro" \
 -v "$repo/docker/maps/tileserver/config.json:/data/config.json:ro" \
 -p 127.0.0.1::8080 maptiler/tileserver-gl:v5.6.0 --config /data/config.json --port 8080 --public_url /maps/ >/dev/null
REM004_TILES_URL="$(gis_url "$tiles" 8080 tiles)"
export REM004_TILES_URL
image='mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
ws_path="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$browser" --label task=erp-functional-remediation-004 --init --user pwuser --shm-size=1g \
 -e HOME=/home/pwuser -e NPM_CONFIG_USERCONFIG=/dev/null -p 127.0.0.1::3000 "$image" \
 npx -y playwright@1.63.0 run-server --port 3000 --host 0.0.0.0 --path "/$ws_path" --max-clients 2 >/dev/null
browser_url="$(gis_url "$browser" 3000 browser)"
export REM003_BROWSER_WS="${browser_url/http:/ws:}/$ws_path"
export REM003_FRONTEND_DIST="$scratch/frontend"
NODE_ENV=production VITE_APP_TIMEZONE=America/Mexico_City VITE_API_BASE_URL=/api VITE_MAP_STYLE_URL=/maps/styles/operations/style.json \
 npm --prefix frontend --script-shell=/bin/sh run build -- --outDir "$REM003_FRONTEND_DIST" --emptyOutDir >"$scratch/frontend-build.log" 2>&1
for n in $(seq 1 60); do
 if curl --fail --silent "$REM004_TILES_URL/styles/operations/style.json" >/dev/null && "$docker_bin" logs "$browser" 2>&1 | grep -q 'Listening'; then break; fi
 sleep 1
done
gis_readiness 90
cd "$repo/backend"
npm --script-shell=/bin/sh exec -- jest --config test/jest-rem004.json --runInBand "$@"
