#!/usr/bin/env bash
# Own PostgreSQL only; no developer dotenv or caller database is ever consumed.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"; fi
run="erp-standard-$(date +%s)-$$"
pg="$run-pg"
cleanup() { "$docker_bin" stop "$pg" "${storage:-$run-unused-s3}" "${browser:-$run-unused-browser}" >/dev/null 2>&1 || true; }
trap cleanup EXIT
export OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh NODE_ENV=test
export NODE_OPTIONS="--require=$repo/backend/test/no-local-env.cjs"
export CFDI_ENABLED=false FISCAL_PROVIDER=NONE SWAGGER_ENABLED=false
export JWT_ACCESS_SECRET="$(openssl rand -hex 32)" JWT_REFRESH_SECRET="$(openssl rand -hex 32)"
export PHOTON_URL=http://127.0.0.1:1 OSRM_URL=http://127.0.0.1:1 VROOM_URL=http://127.0.0.1:1
database=pollos_e2e
if [ "${ERP_CI_BROWSER:-false}" = true ]; then database=pollos_browser_e2e; fi
password="$(openssl rand -hex 24)"
"$docker_bin" run --rm -d --name "$pg" --label task=erp-release-ci-001 --tmpfs /var/lib/postgresql/data:rw \
  -e POSTGRES_USER=standard -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB="$database" \
  -p 127.0.0.1::5432 postgis/postgis:16-3.5 >/dev/null
port="$("$docker_bin" port "$pg" 5432/tcp | awk -F: '{print $NF}')"
export DATABASE_URL="postgresql://standard:$password@127.0.0.1:$port/$database"
export E2E_DATABASE_URL="$DATABASE_URL" E2E_DATABASE_DISPOSABLE=true
for n in $(seq 1 60); do
  if "$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U standard -d "$database" >/dev/null 2>&1; then break; fi
  sleep 1
done
"$docker_bin" exec "$pg" pg_isready -h 127.0.0.1 -U standard -d "$database"
cd "$repo"
npm --prefix backend exec -- prisma migrate deploy --schema backend/prisma/schema.prisma
npm --prefix backend exec -- prisma migrate status --schema backend/prisma/schema.prisma
if [ "${ERP_CI_BROWSER:-false}" = true ]; then
  # A real Linux Chromium process; Nest/Vite and all money/inventory writes use
  # this runner's loopback-only disposable PostgreSQL and S3.
  storage="$run-s3"; browser="$run-browser"
  export OBJECT_STORAGE_ACCESS_KEY_ID=cibrowsertest OBJECT_STORAGE_SECRET_ACCESS_KEY="$(openssl rand -hex 24)"
  export OBJECT_STORAGE_BUCKET=ci-browser-evidence OBJECT_STORAGE_FORCE_PATH_STYLE=true
  "$docker_bin" run --rm -d --name "$storage" --label task=erp-release-ci-001 --tmpfs /data:rw \
    -e MINIO_ROOT_USER="$OBJECT_STORAGE_ACCESS_KEY_ID" -e MINIO_ROOT_PASSWORD="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
    -p 127.0.0.1::9000 minio/minio:latest server /data >/dev/null
  export OBJECT_STORAGE_ENDPOINT="http://127.0.0.1:$("$docker_bin" port "$storage" 9000/tcp | awk -F: '{print $NF}')"
  export OBJECT_STORAGE_PUBLIC_ENDPOINT="$OBJECT_STORAGE_ENDPOINT"
  image='mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27'
  ws_path="$(openssl rand -hex 24)"
  "$docker_bin" run --rm -d --name "$browser" --label task=erp-release-ci-001 --init --user pwuser --shm-size=1g \
    -e HOME=/home/pwuser -e NPM_CONFIG_USERCONFIG=/dev/null -p 127.0.0.1::3000 "$image" \
    npx -y playwright@1.63.0 run-server --port 3000 --host 0.0.0.0 --path "/$ws_path" --max-clients 1 >/dev/null
  export E2E_BROWSER_WS="ws://127.0.0.1:$("$docker_bin" port "$browser" 3000/tcp | awk -F: '{print $NF}')/$ws_path"
  for n in $(seq 1 60); do
    if curl --fail --silent "$OBJECT_STORAGE_ENDPOINT/minio/health/live" >/dev/null && "$docker_bin" logs "$browser" 2>&1 | grep -q Listening; then break; fi
    sleep 1
  done
  (
    cd "$repo/backend"
    node <<'JS_BUCKET'
const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');
const client = new S3Client({
  endpoint: process.env.OBJECT_STORAGE_ENDPOINT, region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID, secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY },
});
client.send(new CreateBucketCommand({ Bucket: process.env.OBJECT_STORAGE_BUCKET }))
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => client.destroy());
JS_BUCKET
  )
  export E2E_ADMIN_PASSWORD="$(openssl rand -hex 24)"
  for pass in 1 2; do
    export E2E_RUN_ID="$run-$pass" E2E_ADMIN_EMAIL="browser-$run-$pass@example.test"
    npm --prefix backend run browser:prepare
    npm run frontend:test:e2e:browser -- "$@"
  done
else
  npm --prefix backend run test:e2e -- --runInBand "$@"
fi
