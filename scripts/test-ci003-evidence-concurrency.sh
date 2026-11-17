#!/usr/bin/env bash
# Focused real PostgreSQL/S3 regression. No HTTP retry, resistance or production access.
set -Eeuo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then
  docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"
fi
export OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh
export NODE_OPTIONS="--require=$repo/backend/test/no-local-env.cjs"
cd "$repo/backend"
npm --offline --no exec -- jest --version
npm --offline --no exec -- node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const client = new PrismaClient();
if (!client.deliveryEvidence) throw new Error('Generate Prisma Client first');
void client.$disconnect();
NODE
cd "$repo"
run="ci003-$(date +%s)-$$-$(openssl rand -hex 8)"
pg="$run-pg"
storage="$run-storage"
cleanup() {
  local result="$1" failed=0 name id owner remaining
  trap - EXIT
  set +e
  for name in "$pg" "$storage"; do
    if ! id="$("$docker_bin" ps --all --quiet --filter "name=^/$name$")"; then
      echo "CI003 cleanup failed: cannot inspect resource=$name" >&2
      failed=1
      continue
    fi
    if [ -z "$id" ]; then
      echo "CI003 resource already absent: name=$name"
      continue
    fi
    if ! owner="$("$docker_bin" inspect --format '{{index .Config.Labels "ci003.owner"}}' "$id")" || [ "$owner" != "$run" ]; then
      echo "CI003 cleanup failed: ownership not verified resource=$name" >&2
      failed=1
      continue
    fi
    if ! "$docker_bin" stop --time 10 "$id" >/dev/null 2>&1; then
      echo "CI003 cleanup failed: stop resource=$name" >&2
      failed=1
    fi
    if ! "$docker_bin" rm --force "$id" >/dev/null 2>&1; then
      echo "CI003 cleanup failed: remove resource=$name" >&2
      failed=1
    fi
    if ! remaining="$("$docker_bin" ps --all --quiet --filter "id=$id")" || [ -n "$remaining" ]; then
      echo "CI003 cleanup failed: absence not verified resource=$name" >&2
      failed=1
    else
      echo "CI003 resource absent: name=$name id=$id"
    fi
  done
  if [ "$failed" -ne 0 ]; then
    echo "CI003 cleanup failed; command_exit=$result cleanup_exit=1" >&2
    if [ "$result" -eq 0 ]; then result=1; fi
  else
    echo "CI003 cleanup complete; command_exit=$result owned_resources_absent=true"
  fi
  exit "$result"
}
trap 'cleanup "$?"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
export NODE_ENV=test
export OBJECT_STORAGE_ACCESS_KEY_ID=ci003-disposable
OBJECT_STORAGE_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
export OBJECT_STORAGE_SECRET_ACCESS_KEY
export OBJECT_STORAGE_BUCKET="$run" OBJECT_STORAGE_FORCE_PATH_STYLE=true
password="$(openssl rand -hex 24)"
echo "CI003 disposable resources: run=$run postgres=$pg storage=$storage"
"$docker_bin" run -d --name "$pg" --label task=ci003-evidence-concurrency --label "ci003.owner=$run" \
  --tmpfs /var/lib/postgresql/data:rw -e POSTGRES_USER=ci003 \
  -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB=pollos_ci003_e2e \
  -p 127.0.0.1::5432 postgis/postgis:16-3.5 >/dev/null
"$docker_bin" run -d --name "$storage" --label task=ci003-evidence-concurrency --label "ci003.owner=$run" \
  --tmpfs /data:rw -e MINIO_ROOT_USER="$OBJECT_STORAGE_ACCESS_KEY_ID" \
  -e MINIO_ROOT_PASSWORD="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  -p 127.0.0.1::9000 docker.io/pgsty/silo:RELEASE.2026-10-18T00-00-00Z@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7 server /data >/dev/null
pg_port="$("$docker_bin" port "$pg" 5432/tcp | awk -F: '{print $NF}')"
s3_port="$("$docker_bin" port "$storage" 9000/tcp | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://ci003:$password@127.0.0.1:$pg_port/pollos_ci003_e2e"
export E2E_DATABASE_URL="$DATABASE_URL" E2E_DATABASE_DISPOSABLE=true
export OBJECT_STORAGE_ENDPOINT="http://127.0.0.1:$s3_port"
export OBJECT_STORAGE_PUBLIC_ENDPOINT="$OBJECT_STORAGE_ENDPOINT"
ready=false
for _ in $(seq 1 40); do
  if "$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U ci003 -d pollos_ci003_e2e >/dev/null 2>&1 &&
    curl --fail --silent --connect-timeout 1 --max-time 2 "$OBJECT_STORAGE_ENDPOINT/minio/health/ready" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done
if [ "$ready" != true ]; then echo 'Disposable PostgreSQL/S3 readiness failed' >&2; exit 1; fi
scratch="$(mktemp -d "${TMPDIR:-/tmp}/ci003-migrations.XXXXXX")"
npm --prefix backend exec -- prisma migrate deploy --schema backend/prisma/schema.prisma >"$scratch/migrations.log" 2>&1 || {
  echo "Disposable migration failed; inspect $scratch/migrations.log" >&2
  exit 1
}
npm --prefix backend test -- --config ./test/jest-ci003.json --runInBand "$@"
