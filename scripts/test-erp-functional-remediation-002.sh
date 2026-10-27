#!/usr/bin/env bash
# Disposable PostgreSQL/PostGIS and object storage; never uses a caller database.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"; fi
run="erp-rem002-$(date +%s)-$$"
pg="$run-pg"; storage="$run-storage"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/erp-rem002.XXXXXX")"
cleanup() {
  "$docker_bin" stop "$pg" "$storage" "${browser:-$run-unused}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
export npm_config_script_shell=/bin/sh
export RATE_LIMIT_GLOBAL_MAX=5000 RATE_LIMIT_LOGIN_ACCOUNT_MAX=100 RATE_LIMIT_LOGIN_IP_MAX=200
export NODE_ENV=test CFDI_ENABLED=false FISCAL_PROVIDER=NONE SWAGGER_ENABLED=false
export OPENSSL_CONF=/dev/null APP_TIMEZONE=America/Mexico_City
export NODE_OPTIONS="--require=$repo/backend/test/no-local-env.cjs"
export JWT_ACCESS_EXPIRES_IN=15m JWT_REFRESH_EXPIRES_IN=7d
export AUTH_SESSION_ABSOLUTE_TTL_SECONDS=604800 AUTH_SESSION_IDLE_TTL_SECONDS=86400 AUTH_SESSION_LAST_USED_AT_UPDATE_THRESHOLD_SECONDS=300
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export OBJECT_STORAGE_ACCESS_KEY_ID="p1disposable"
export OBJECT_STORAGE_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
export OBJECT_STORAGE_BUCKET=rem002-evidence OBJECT_STORAGE_FORCE_PATH_STYLE=true
export OSRM_URL=http://127.0.0.1:1 PHOTON_URL=http://127.0.0.1:1 VROOM_URL=http://127.0.0.1:1
password="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$pg" --label task=erp-functional-remediation-002 \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_USER=p1test \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=pollos_rem002_e2e \
  -p 127.0.0.1::5432 postgis/postgis:16-3.5 >/dev/null
"$docker_bin" run --rm -d --name "$storage" --label task=erp-functional-remediation-002 \
  --tmpfs /data:rw -e MINIO_ROOT_USER="$OBJECT_STORAGE_ACCESS_KEY_ID" \
  -e MINIO_ROOT_PASSWORD="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  -p 127.0.0.1::9000 docker.io/pgsty/silo:RELEASE.2026-10-18T00-00-00Z@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7 server /data >/dev/null
pg_port="$("$docker_bin" port "$pg" 5432/tcp | awk -F: '{print $NF}')"
s3_port="$("$docker_bin" port "$storage" 9000/tcp | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://p1test:$password@127.0.0.1:$pg_port/pollos_rem002_e2e"
export E2E_DATABASE_URL="$DATABASE_URL" E2E_DATABASE_DISPOSABLE=true
export OBJECT_STORAGE_ENDPOINT="http://127.0.0.1:$s3_port"
export OBJECT_STORAGE_PUBLIC_ENDPOINT="$OBJECT_STORAGE_ENDPOINT"
for n in $(seq 1 40); do
  if "$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U p1test -d pollos_rem002_e2e >/dev/null; then break; fi
  sleep 1
done
cd "$repo"
npm --prefix backend --script-shell=/bin/sh exec -- prisma migrate deploy --schema backend/prisma/schema.prisma >"$scratch/migrations.log" 2>&1 || { code=$?; echo "Migration command failed, exit=$code (see $scratch/migrations.log)"; tail -40 "$scratch/migrations.log"; exit "$code"; }
"$docker_bin" exec "$pg" createdb -U p1test pollos_rem002_e2e_other
export E2E_SECOND_DATABASE_URL="${DATABASE_URL%/*}/pollos_rem002_e2e_other"
DATABASE_URL="$E2E_SECOND_DATABASE_URL" npm --prefix backend --script-shell=/bin/sh exec -- prisma migrate deploy --schema backend/prisma/schema.prisma >"$scratch/migrations-other.log" 2>&1 || { code=$?; echo "Second migration command failed, exit=$code"; tail -40 "$scratch/migrations-other.log"; exit "$code"; }
echo "Disposable schema migrated; migration log: $scratch/migrations.log"
extra_tests=(test/erp-functional-remediation-002.e2e-spec.ts)
if [ "${REM002_BROWSER:-false}" = true ]; then
  image='mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
  "$docker_bin" image inspect "$image" >/dev/null
  browser="$run-browser"
  ws_path="$(openssl rand -hex 24)"
  "$docker_bin" run --rm -d --name "$browser" --label task=erp-functional-remediation-002 --init --user pwuser --shm-size=1g \
    -e HOME=/home/pwuser -e NPM_CONFIG_USERCONFIG=/dev/null -p 127.0.0.1::3000 "$image" \
    npx -y playwright@1.63.0 run-server --port 3000 --host 0.0.0.0 --path "/$ws_path" --max-clients 1 >/dev/null
  browser_port="$("$docker_bin" port "$browser" 3000/tcp | awk -F: '{print $NF}')"
  export REM002_BROWSER_WS="ws://127.0.0.1:$browser_port/$ws_path"
  export REM002_FRONTEND_DIST="$scratch/frontend" REM002_EVIDENCE_DIR="$scratch/browser-evidence"
  NODE_ENV=production VITE_APP_TIMEZONE=America/Mexico_City VITE_API_BASE_URL=/api npm --prefix frontend --script-shell=/bin/sh run build -- --outDir "$REM002_FRONTEND_DIST" --emptyOutDir >"$scratch/frontend-build.log" 2>&1 || { tail -40 "$scratch/frontend-build.log"; exit 1; }
  extra_tests+=(test/erp-functional-remediation-002.browser.e2e-spec.ts)
fi

npm --prefix backend --script-shell=/bin/sh run test:e2e:functional -- --runInBand --runTestsByPath "${extra_tests[@]}" "$@"
