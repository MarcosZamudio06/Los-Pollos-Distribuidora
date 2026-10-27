#!/usr/bin/env bash
# Disposable PostgreSQL/PostGIS and object storage; never uses a caller database.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"; fi
run="erp-p1-$(date +%s)-$$"
pg="$run-pg"; storage="$run-storage"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/erp-p1.XXXXXX")"
cleanup() {
  "$docker_bin" stop "$pg" "$storage" >/dev/null 2>&1 || true
}
trap cleanup EXIT
export NODE_ENV=test CFDI_ENABLED=false FISCAL_PROVIDER=NONE SWAGGER_ENABLED=false
export OPENSSL_CONF=/dev/null APP_TIMEZONE=America/Mexico_City
export NODE_OPTIONS="--require=$repo/backend/test/no-local-env.cjs"
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)"
export JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export OBJECT_STORAGE_ACCESS_KEY_ID="p1disposable"
export OBJECT_STORAGE_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
export OBJECT_STORAGE_BUCKET=p1-evidence OBJECT_STORAGE_FORCE_PATH_STYLE=true
export OSRM_URL=http://127.0.0.1:1 PHOTON_URL=http://127.0.0.1:1 VROOM_URL=http://127.0.0.1:1
password="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$pg" --label task=erp-functional-p1 \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_USER=p1test \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=pollos_p1_e2e \
  -p 127.0.0.1::5432 postgis/postgis:16-3.5 >/dev/null
"$docker_bin" run --rm -d --name "$storage" --label task=erp-functional-p1 \
  --tmpfs /data:rw -e MINIO_ROOT_USER="$OBJECT_STORAGE_ACCESS_KEY_ID" \
  -e MINIO_ROOT_PASSWORD="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  -p 127.0.0.1::9000 minio/minio:latest server /data >/dev/null
pg_port="$("$docker_bin" port "$pg" 5432/tcp | awk -F: '{print $NF}')"
s3_port="$("$docker_bin" port "$storage" 9000/tcp | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://p1test:$password@127.0.0.1:$pg_port/pollos_p1_e2e"
export E2E_DATABASE_URL="$DATABASE_URL" E2E_DATABASE_DISPOSABLE=true
export OBJECT_STORAGE_ENDPOINT="http://127.0.0.1:$s3_port"
export OBJECT_STORAGE_PUBLIC_ENDPOINT="$OBJECT_STORAGE_ENDPOINT"
for n in $(seq 1 40); do
  if "$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U p1test -d pollos_p1_e2e >/dev/null; then break; fi
  sleep 1
done
cd "$repo"
npm --prefix backend exec -- prisma migrate deploy --schema backend/prisma/schema.prisma >"$scratch/migrations.log" 2>&1 || { tail -40 "$scratch/migrations.log"; exit 1; }
"$docker_bin" exec "$pg" createdb -U p1test pollos_p1_e2e_other
export E2E_SECOND_DATABASE_URL="${DATABASE_URL%/*}/pollos_p1_e2e_other"
DATABASE_URL="$E2E_SECOND_DATABASE_URL" npm --prefix backend exec -- prisma migrate deploy --schema backend/prisma/schema.prisma >"$scratch/migrations-other.log" 2>&1 || { tail -40 "$scratch/migrations-other.log"; exit 1; }
echo "Disposable schema migrated; migration log: $scratch/migrations.log"
npm --prefix backend run test:e2e:functional -- --runInBand --runTestsByPath test/erp-functional-p1.e2e-spec.ts "$@"
