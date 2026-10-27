#!/usr/bin/env bash
# Opt-in real integration corpus. Own resources only; never uses the caller's database.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
  docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"
fi
run="erp-rem004-$(date +%s)-$$"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/erp-rem004.XXXXXX")"
pg="$run-pg"; storage="$run-s3"; browser=''; osrm=''; photon=''; vroom=''; network=''; pg_b=''; storage_b=''
cleanup() {
  "$docker_bin" logs "$pg" >"$scratch/postgres.log" 2>&1 || true
  for container in "$pg" "$storage" "$browser" "$osrm" "$photon" "$vroom" "$pg_b" "$storage_b"; do
    [ -z "$container" ] || "$docker_bin" stop "$container" >/dev/null 2>&1 || true
  done
  [ -z "$network" ] || "$docker_bin" network rm "$network" >/dev/null 2>&1 || true
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
  -p 127.0.0.1::9000 minio/minio:latest server /data >/dev/null
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
 -e MINIO_ROOT_USER="$REM004_SILO_ACCESS_KEY" -e MINIO_ROOT_PASSWORD="$REM004_SILO_STORAGE_SECRET" -p 127.0.0.1::9000 minio/minio:latest server /data >/dev/null
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
  cp -R "$gis/photon" "$scratch/photon"
  network="$run-gis"; "$docker_bin" network create "$network" >/dev/null
  osrm="$run-osrm"; photon="$run-photon"; vroom="$run-vroom"
  "$docker_bin" run --rm -d --name "$osrm" --label task=erp-functional-remediation-004 --platform linux/amd64 \
    --network "$network" --network-alias osrm -p 127.0.0.1::5000 -v "$gis:/data:ro" \
    ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-routed --algorithm mld /data/veracruz.osrm >/dev/null
  "$docker_bin" run --rm -d --name "$photon" --label task=erp-functional-remediation-004 --network "$network" \
    --memory=1536m -e JAVA_TOOL_OPTIONS='-Xms256m -Xmx768m' -v "$scratch/photon:/data" -p 127.0.0.1::2322 \
    pollos-distribuidor/photon:1.2.1 >/dev/null
  "$docker_bin" run --rm -d --name "$vroom" --label task=erp-functional-remediation-004 --platform linux/amd64 \
    --network "$network" -e VROOM_ROUTER=osrm -p 127.0.0.1::3000 \
    -v "$repo/docker/maps/vroom/config.yml:/conf/config.yml:ro" ghcr.io/vroom-project/vroom-docker:v1.15.0 >/dev/null
  export OSRM_URL="http://127.0.0.1:$("$docker_bin" port "$osrm" 5000/tcp | awk -F: '{print $NF}')"
  export PHOTON_URL="http://127.0.0.1:$("$docker_bin" port "$photon" 2322/tcp | awk -F: '{print $NF}')"
  export VROOM_URL="http://127.0.0.1:$("$docker_bin" port "$vroom" 3000/tcp | awk -F: '{print $NF}')"
  for n in $(seq 1 90); do
    if curl --fail --silent "$PHOTON_URL/api/?q=Lobos&limit=1" >/dev/null && \
       curl --fail --silent "$VROOM_URL/health" >/dev/null && \
       curl --fail --silent "$OSRM_URL/nearest/v1/driving/-96.1233923,19.179094" >/dev/null; then break; fi
    sleep 1
  done

rendering="${REM004_RENDERING_DIR:-$repo/.map-data/rendering}"
test -s "$rendering/mexico.pmtiles"
test -d "$rendering/fonts"
browser="$run-browser"; tiles="$run-tiles"
trap '"$docker_bin" stop "$tiles" >/dev/null 2>&1 || true; cleanup' EXIT
"$docker_bin" run --rm -d --name "$tiles" --label task=erp-functional-remediation-004 \
 -v "$rendering:/data/rendering:ro" \
 -v "$rendering/fonts:/data/fonts:ro" \
 -v "$repo/docker/maps/styles:/data/styles:ro" \
 -v "$repo/docker/maps/tileserver/config.json:/data/config.json:ro" \
 -p 127.0.0.1::8080 maptiler/tileserver-gl:v5.6.0 --config /data/config.json --port 8080 --public_url /maps/ >/dev/null
export REM004_TILES_URL="http://127.0.0.1:$("$docker_bin" port "$tiles" 8080/tcp | awk -F: '{print $NF}')"
image='mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
ws_path="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$browser" --label task=erp-functional-remediation-004 --init --user pwuser --shm-size=1g \
 -e HOME=/home/pwuser -e NPM_CONFIG_USERCONFIG=/dev/null -p 127.0.0.1::3000 "$image" \
 npx -y playwright@1.63.0 run-server --port 3000 --host 0.0.0.0 --path "/$ws_path" --max-clients 2 >/dev/null
export REM003_BROWSER_WS="ws://127.0.0.1:$("$docker_bin" port "$browser" 3000/tcp | awk -F: '{print $NF}')/$ws_path"
export REM003_FRONTEND_DIST="$scratch/frontend"
NODE_ENV=production VITE_APP_TIMEZONE=America/Mexico_City VITE_API_BASE_URL=/api VITE_MAP_STYLE_URL=/maps/styles/operations/style.json \
 npm --prefix frontend --script-shell=/bin/sh run build -- --outDir "$REM003_FRONTEND_DIST" --emptyOutDir >"$scratch/frontend-build.log" 2>&1
for n in $(seq 1 60); do
 if curl --fail --silent "$REM004_TILES_URL/styles/operations/style.json" >/dev/null && "$docker_bin" logs "$browser" 2>&1 | grep -q 'Listening'; then break; fi
 sleep 1
done
cd "$repo/backend"
npm --script-shell=/bin/sh exec -- jest --config test/jest-rem004.json --runInBand "$@"
