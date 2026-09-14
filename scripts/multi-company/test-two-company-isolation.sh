#!/usr/bin/env bash
set -Eeuo pipefail

# Disposable acceptance harness: two isolated production Compose projects,
# each using its own PostgreSQL/PostGIS, SeaweedFS volume, secrets and backend.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
BACKEND_IMAGE="${MTE_BACKEND_IMAGE:-pollos-backend:mte-isolation}"
UNUSED_IMAGE="ghcr.io/example/mte-isolation-unused@sha256:0000000000000000000000000000000000000000000000000000000000000000"
export OPENSSL_CONF="${OPENSSL_CONF:-/dev/null}"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required for the MTE-005 disposable isolation gate." >&2
  exit 1
fi
if ! docker image inspect "$BACKEND_IMAGE" >/dev/null 2>&1; then
  echo "Backend image is missing; build docker/backend/Dockerfile and set MTE_BACKEND_IMAGE." >&2
  exit 1
fi

random_hex() {
  OPENSSL_CONF=/dev/null node -e \
    'process.stdout.write(require("node:crypto").randomBytes(Number(process.argv[1])).toString("hex"))' \
    "$1"
}

RUN_ID="ci$(date -u +%Y%m%d%H%M%S)$(random_hex 4)"
PROJECT_A="mte-a-$RUN_ID"
PROJECT_B="mte-b-$RUN_ID"
ADMIN_EMAIL="mte-admin-$RUN_ID@example.test"
BOOTSTRAP_PASSWORD_A="$(random_hex 32)"
BOOTSTRAP_PASSWORD_B="$(random_hex 32)"
ADMIN_PASSWORD_A="$(random_hex 32)"
ADMIN_PASSWORD_B="$(random_hex 32)"
DRIVER_PASSWORD="$(random_hex 32)"
POSTGRES_PASSWORD_A="$(random_hex 32)"
POSTGRES_PASSWORD_B="$(random_hex 32)"
JWT_ACCESS_SECRET_A="$(random_hex 48)"
JWT_ACCESS_SECRET_B="$(random_hex 48)"
JWT_REFRESH_SECRET_A="$(random_hex 48)"
JWT_REFRESH_SECRET_B="$(random_hex 48)"
OBJECT_STORAGE_ACCESS_KEY_ID_A="$(random_hex 24)"
OBJECT_STORAGE_ACCESS_KEY_ID_B="$(random_hex 24)"
OBJECT_STORAGE_SECRET_ACCESS_KEY_A="$(random_hex 48)"
OBJECT_STORAGE_SECRET_ACCESS_KEY_B="$(random_hex 48)"
CEDIS_CODE_A="mte-$RUN_ID-a-cedis"
CEDIS_CODE_B="mte-$RUN_ID-b-cedis"
LOCATION_CODE_A="mte-$RUN_ID-a-branch"
LOCATION_CODE_B="mte-$RUN_ID-b-branch"
OBJECT_STORAGE_BUCKET_A="mte-isolation-a-$RUN_ID"
OBJECT_STORAGE_BUCKET_B="mte-isolation-b-$RUN_ID"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/mte-isolation.XXXXXX")"
chmod 700 "$TMP_DIR"
ENV_A="$TMP_DIR/tenant-a.env"
ENV_B="$TMP_DIR/tenant-b.env"
PG_A_CONTAINER=''
PG_B_CONTAINER=''
STORAGE_A_CONTAINER=''
STORAGE_B_CONTAINER=''
BACKEND_A_CONTAINER=''
BACKEND_B_CONTAINER=''

mask_value() {
  if [[ "${GITHUB_ACTIONS:-}" == 'true' ]]; then
    printf '::add-mask::%s\n' "$1"
  fi
}

for secret in \
  "$BOOTSTRAP_PASSWORD_A" "$BOOTSTRAP_PASSWORD_B" \
  "$ADMIN_PASSWORD_A" "$ADMIN_PASSWORD_B" "$DRIVER_PASSWORD" \
  "$POSTGRES_PASSWORD_A" "$POSTGRES_PASSWORD_B" \
  "$JWT_ACCESS_SECRET_A" "$JWT_ACCESS_SECRET_B" \
  "$JWT_REFRESH_SECRET_A" "$JWT_REFRESH_SECRET_B" \
  "$OBJECT_STORAGE_ACCESS_KEY_ID_A" "$OBJECT_STORAGE_ACCESS_KEY_ID_B" \
  "$OBJECT_STORAGE_SECRET_ACCESS_KEY_A" "$OBJECT_STORAGE_SECRET_ACCESS_KEY_B"; do
  mask_value "$secret"
done

if [[ "$POSTGRES_PASSWORD_A" == "$POSTGRES_PASSWORD_B" ||
  "$JWT_ACCESS_SECRET_A" == "$JWT_ACCESS_SECRET_B" ||
  "$JWT_REFRESH_SECRET_A" == "$JWT_REFRESH_SECRET_B" ||
  "$OBJECT_STORAGE_ACCESS_KEY_ID_A" == "$OBJECT_STORAGE_ACCESS_KEY_ID_B" ||
  "$OBJECT_STORAGE_SECRET_ACCESS_KEY_A" == "$OBJECT_STORAGE_SECRET_ACCESS_KEY_B" ||
  "$JWT_ACCESS_SECRET_A" == "$JWT_REFRESH_SECRET_A" ||
  "$JWT_ACCESS_SECRET_B" == "$JWT_REFRESH_SECRET_B" ]]; then
  echo "Disposable tenant credential generation did not produce unique values." >&2
  exit 1
fi

REDACT_VALUES=(
  "$BOOTSTRAP_PASSWORD_A" "$BOOTSTRAP_PASSWORD_B"
  "$ADMIN_PASSWORD_A" "$ADMIN_PASSWORD_B" "$DRIVER_PASSWORD"
  "$POSTGRES_PASSWORD_A" "$POSTGRES_PASSWORD_B"
  "$JWT_ACCESS_SECRET_A" "$JWT_ACCESS_SECRET_B"
  "$JWT_REFRESH_SECRET_A" "$JWT_REFRESH_SECRET_B"
  "$OBJECT_STORAGE_ACCESS_KEY_ID_A" "$OBJECT_STORAGE_ACCESS_KEY_ID_B"
  "$OBJECT_STORAGE_SECRET_ACCESS_KEY_A" "$OBJECT_STORAGE_SECRET_ACCESS_KEY_B"
)

redact_file() {
  local content secret
  content="$(cat "$1")"
  for secret in "${REDACT_VALUES[@]}"; do
    content="${content//"$secret"/[REDACTED]}"
  done
  printf '%s\n' "$content"
}

run_logged() {
  local label="$1"
  shift
  local output="$TMP_DIR/command.log"
  if "$@" >"$output" 2>&1; then
    redact_file "$output"
    return 0
  fi
  echo "FAILED: $label" >&2
  redact_file "$output" >&2
  return 1
}

compose() {
  local project="$1"
  local env_file="$2"
  shift 2
  docker compose \
    --project-name "$project" \
    --env-file "$env_file" \
    --file "$COMPOSE_FILE" \
    "$@"
}

start_service() {
  local project="$1"
  local env_file="$2"
  local service="$3"
  local container_port="$4"
  local output="$TMP_DIR/start-$project-$service.log"
  local container_id

  if ! compose "$project" "$env_file" run \
    --detach \
    --no-deps \
    --publish "127.0.0.1::${container_port}" \
    "$service" >"$output" 2>&1; then
    echo "FAILED: start $project/$service" >&2
    redact_file "$output" >&2
    return 1
  fi

  container_id="$(tail -n 1 "$output" | tr -d '\r[:space:]')"
  if [[ ! "$container_id" =~ ^[0-9a-f]{12,64}$ ]]; then
    echo "Compose did not return a container identity for $project/$service." >&2
    return 1
  fi
  printf '%s' "$container_id"
}

host_port() {
  local container="$1"
  local container_port="$2"
  local published
  published="$(docker port "$container" "$container_port/tcp" | tail -n 1)"
  published="${published##*:}"
  if [[ ! "$published" =~ ^[0-9]+$ ]]; then
    echo "Could not resolve the loopback port for a disposable service." >&2
    return 1
  fi
  printf '%s' "$published"
}

wait_healthy() {
  local container="$1"
  local label="$2"
  local timeout_seconds="$3"
  local status running
  for ((attempt = 0; attempt < timeout_seconds; attempt++)); do
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "$container" 2>/dev/null || true)"
    if [[ "$status" == 'healthy' ]]; then
      return 0
    fi
    running="$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || true)"
    if [[ "$running" != 'true' ]]; then
      echo "FAILED: $label exited before readiness." >&2
      docker logs "$container" 2>&1 | while IFS= read -r line; do
        local secret
        for secret in "${REDACT_VALUES[@]}"; do
          line="${line//"$secret"/[REDACTED]}"
        done
        printf '%s\n' "$line" >&2
      done
      return 1
    fi
    sleep 1
  done
  echo "FAILED: timeout waiting for $label readiness." >&2
  return 1
}

set_env_value() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local next="$env_file.next"
  awk -v key="$key" 'index($0, key "=") != 1 { print }' "$env_file" >"$next"
  printf '%s=%s\n' "$key" "$value" >>"$next"
  chmod 600 "$next"
  mv "$next" "$env_file"
}

postgres_query() {
  local container="$1"
  local sql="$2"
  docker exec "$container" psql -X -A -t -v ON_ERROR_STOP=1 \
    -U postgres -d mte_isolation -c "$sql"
}

check_postgres_sentinel() {
  local result
  result="$(postgres_query "$PG_B_CONTAINER" \
    "SELECT COUNT(*)::text || '|' || COALESCE((SELECT \"value\" FROM public.mte005_migration_sentinel WHERE id = 1), 'missing') || '|' || (to_regclass('public.\"_prisma_migrations\"') IS NULL)::text FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")"
  [[ "$result" == '1|untouched|true' ]]
}

snapshot_tenant_b() {
  local sql
  sql="$(cat <<SQL
SELECT json_build_object(
  'admin', (SELECT json_build_object('email', "email", 'name', "name", 'controlNumber', "controlNumber", 'mustChangePassword', "mustChangePassword") FROM "User" WHERE "email" = '$ADMIN_EMAIL'),
  'locations', (SELECT json_agg(json_build_object('code', "code", 'name', "name", 'parentId', "parentId", 'type', "type") ORDER BY "code") FROM "OperationalLocation" WHERE "code" IN ('$CEDIS_CODE_B', '$LOCATION_CODE_B')),
  'roles', (SELECT json_agg(json_build_object('name', "name", 'description', "description") ORDER BY "name") FROM "Role"),
  'users', (SELECT COUNT(*) FROM "User")
)::text;
SQL
)"
  postgres_query "$PG_B_CONTAINER" "$sql"
}

write_tenant_env() {
  local tenant="$1"
  local env_file="$2"
  local postgres_password="$3"
  local jwt_access="$4"
  local jwt_refresh="$5"
  local storage_access="$6"
  local storage_secret="$7"
  local bootstrap_password="$8"
  local cedis_code="$9"
  local location_code="${10}"
  local tenant_name="Tenant $tenant"
  local map_dir="$TMP_DIR/maps-$tenant"
  local bucket_tenant
  local phone_suffix='1'
  bucket_tenant="$(printf '%s' "$tenant" | tr '[:upper:]' '[:lower:]')"
  if [[ "$tenant" == 'B' ]]; then phone_suffix='2'; fi
  mkdir -p "$map_dir"

  umask 077
  cat >"$env_file" <<EOF
BACKEND_IMAGE=$BACKEND_IMAGE
FRONTEND_IMAGE=$UNUSED_IMAGE
PHOTON_IMAGE=$UNUSED_IMAGE
OSRM_IMAGE=$UNUSED_IMAGE
TILESERVER_IMAGE=$UNUSED_IMAGE
MAP_DATA_DIR="$map_dir"
MAP_DATA_VERSION=mte-005-disposable
CORS_ORIGIN=https://erp-$tenant.example.test
TRUST_PROXY_HOPS=1
POSTGRES_DB=mte_isolation
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$postgres_password
JWT_ACCESS_SECRET=$jwt_access
JWT_REFRESH_SECRET=$jwt_refresh
OBJECT_STORAGE_ACCESS_KEY_ID=$storage_access
OBJECT_STORAGE_SECRET_ACCESS_KEY=$storage_secret
OBJECT_STORAGE_BUCKET=mte-isolation-$bucket_tenant-$RUN_ID
OBJECT_STORAGE_PUBLIC_ENDPOINT=http://127.0.0.1:1
OBJECT_STORAGE_FORCE_PATH_STYLE=true
SEED_ADMIN_PASSWORD=$bootstrap_password
SEED_ADMIN_NAME="$tenant_name Initial Administrator"
SEED_ADMIN_EMAIL=$ADMIN_EMAIL
SEED_ADMIN_CONTROL_NUMBER=mte-$RUN_ID-$tenant-admin
SEED_ADMIN_PHONE=+52000000000$phone_suffix
SEED_CEDIS_NAME="$tenant_name Distribution Center"
SEED_CEDIS_CODE=$cedis_code
SEED_LOCATION_NAME="$tenant_name Main Location"
SEED_LOCATION_CODE=$location_code
CFDI_ENABLED=false
FISCAL_PROVIDER=NONE
FISCAL_PROVIDER_ENVIRONMENT=SANDBOX
BACKEND_MEM_LIMIT=1g
BACKEND_NODE_MAX_OLD_SPACE_MB=768
POSTGRES_MEM_LIMIT=1g
OBJECT_STORAGE_MEM_LIMIT=512m
EOF
  chmod 600 "$env_file"
}

cleanup_project() {
  local project="$1"
  local env_file="$2"
  local container
  # Compose run containers are one-offs and are not necessarily removed by down.
  for container in $(docker ps -aq --filter "label=com.docker.compose.project=$project" 2>/dev/null || true); do
    docker rm --force "$container" >/dev/null 2>&1 || true
  done
  compose "$project" "$env_file" down --volumes --remove-orphans >/dev/null 2>&1 || true
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  set +e
  cleanup_project "$PROJECT_A" "$ENV_A"
  cleanup_project "$PROJECT_B" "$ENV_B"
  rm -rf "$TMP_DIR"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

write_tenant_env A "$ENV_A" \
  "$POSTGRES_PASSWORD_A" "$JWT_ACCESS_SECRET_A" "$JWT_REFRESH_SECRET_A" \
  "$OBJECT_STORAGE_ACCESS_KEY_ID_A" "$OBJECT_STORAGE_SECRET_ACCESS_KEY_A" \
  "$BOOTSTRAP_PASSWORD_A" "$CEDIS_CODE_A" "$LOCATION_CODE_A"
write_tenant_env B "$ENV_B" \
  "$POSTGRES_PASSWORD_B" "$JWT_ACCESS_SECRET_B" "$JWT_REFRESH_SECRET_B" \
  "$OBJECT_STORAGE_ACCESS_KEY_ID_B" "$OBJECT_STORAGE_SECRET_ACCESS_KEY_B" \
  "$BOOTSTRAP_PASSWORD_B" "$CEDIS_CODE_B" "$LOCATION_CODE_B"

run_logged "TENANT_A production Compose validation" compose "$PROJECT_A" "$ENV_A" config --quiet
run_logged "TENANT_B production Compose validation" compose "$PROJECT_B" "$ENV_B" config --quiet

echo "Starting isolated TENANT_A and TENANT_B PostgreSQL/PostGIS and Object Storage services."
PG_A_CONTAINER="$(start_service "$PROJECT_A" "$ENV_A" postgres 5432)"
PG_B_CONTAINER="$(start_service "$PROJECT_B" "$ENV_B" postgres 5432)"
STORAGE_A_CONTAINER="$(start_service "$PROJECT_A" "$ENV_A" object-storage 8333)"
STORAGE_B_CONTAINER="$(start_service "$PROJECT_B" "$ENV_B" object-storage 8333)"
[[ "$PG_A_CONTAINER" != "$PG_B_CONTAINER" && "$STORAGE_A_CONTAINER" != "$STORAGE_B_CONTAINER" ]]
wait_healthy "$PG_A_CONTAINER" 'TENANT_A PostgreSQL' 90
wait_healthy "$PG_B_CONTAINER" 'TENANT_B PostgreSQL' 90
wait_healthy "$STORAGE_A_CONTAINER" 'TENANT_A Object Storage' 120
wait_healthy "$STORAGE_B_CONTAINER" 'TENANT_B Object Storage' 120

PG_PORT_A="$(host_port "$PG_A_CONTAINER" 5432)"
PG_PORT_B="$(host_port "$PG_B_CONTAINER" 5432)"
STORAGE_PORT_A="$(host_port "$STORAGE_A_CONTAINER" 8333)"
STORAGE_PORT_B="$(host_port "$STORAGE_B_CONTAINER" 8333)"
set_env_value "$ENV_A" OBJECT_STORAGE_PUBLIC_ENDPOINT "http://127.0.0.1:$STORAGE_PORT_A"
set_env_value "$ENV_B" OBJECT_STORAGE_PUBLIC_ENDPOINT "http://127.0.0.1:$STORAGE_PORT_B"

# A private marker proves a migration against A leaves pre-existing B state alone.
run_logged "Create TENANT_B migration sentinel" docker exec "$PG_B_CONTAINER" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d mte_isolation \
  -c "CREATE TABLE public.mte005_migration_sentinel (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO public.mte005_migration_sentinel (id, value) VALUES (1, 'untouched');"
if ! check_postgres_sentinel; then
  echo "TENANT_B migration sentinel was not established." >&2
  exit 1
fi

echo "Running production migration on TENANT_A only."
run_logged "TENANT_A migrate" compose "$PROJECT_A" "$ENV_A" \
  --profile migration run --rm --no-deps migrate
if ! check_postgres_sentinel; then
  echo "FAIL: TENANT_A migrate changed the TENANT_B PostgreSQL sentinel."
  exit 1
fi
echo "PASS: migrate A leaves the independent PostgreSQL/PostGIS B sentinel and schema untouched."

echo "Applying the same production migrations to TENANT_B."
run_logged "TENANT_B migrate" compose "$PROJECT_B" "$ENV_B" \
  --profile migration run --rm --no-deps migrate

echo "Bootstrapping TENANT_B first and capturing its state."
run_logged "TENANT_B bootstrap" compose "$PROJECT_B" "$ENV_B" \
  --profile migration run --rm --no-deps bootstrap
BOOTSTRAP_B_BEFORE="$(snapshot_tenant_b)"
if [[ -z "$BOOTSTRAP_B_BEFORE" ]]; then
  echo "Could not capture TENANT_B bootstrap state." >&2
  exit 1
fi

echo "Running production bootstrap on TENANT_A only."
run_logged "TENANT_A bootstrap" compose "$PROJECT_A" "$ENV_A" \
  --profile migration run --rm --no-deps bootstrap
BOOTSTRAP_B_AFTER="$(snapshot_tenant_b)"
if [[ "$BOOTSTRAP_B_BEFORE" != "$BOOTSTRAP_B_AFTER" ]]; then
  echo "FAIL: TENANT_A bootstrap changed TENANT_B administrator, location, or role state."
  exit 1
fi
echo "PASS: bootstrap A leaves TENANT_B administrator, locations, roles, and user count unchanged."

echo "Starting two separate production backend containers from the same backend image."
BACKEND_A_CONTAINER="$(start_service "$PROJECT_A" "$ENV_A" backend 4000)"
BACKEND_B_CONTAINER="$(start_service "$PROJECT_B" "$ENV_B" backend 4000)"
[[ "$BACKEND_A_CONTAINER" != "$BACKEND_B_CONTAINER" ]]
wait_healthy "$BACKEND_A_CONTAINER" 'TENANT_A backend' 180
wait_healthy "$BACKEND_B_CONTAINER" 'TENANT_B backend' 180
BACKEND_PORT_A="$(host_port "$BACKEND_A_CONTAINER" 4000)"
BACKEND_PORT_B="$(host_port "$BACKEND_B_CONTAINER" 4000)"

MTE_TENANT_A_DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD_A}@127.0.0.1:${PG_PORT_A}/mte_isolation?sslmode=disable"
MTE_TENANT_B_DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD_B}@127.0.0.1:${PG_PORT_B}/mte_isolation?sslmode=disable"
mask_value "$MTE_TENANT_A_DATABASE_URL"
mask_value "$MTE_TENANT_B_DATABASE_URL"

export MTE_ISOLATION_RUN_ID="$RUN_ID"
export MTE_ADMIN_EMAIL="$ADMIN_EMAIL"
export MTE_DRIVER_PASSWORD="$DRIVER_PASSWORD"
export MTE_TENANT_A_DATABASE_URL
export MTE_TENANT_B_DATABASE_URL
export MTE_TENANT_A_API_URL="http://127.0.0.1:$BACKEND_PORT_A"
export MTE_TENANT_B_API_URL="http://127.0.0.1:$BACKEND_PORT_B"
export MTE_TENANT_A_OBJECT_STORAGE_URL="http://127.0.0.1:$STORAGE_PORT_A"
export MTE_TENANT_B_OBJECT_STORAGE_URL="http://127.0.0.1:$STORAGE_PORT_B"
export MTE_TENANT_A_OBJECT_STORAGE_BUCKET="$OBJECT_STORAGE_BUCKET_A"
export MTE_TENANT_B_OBJECT_STORAGE_BUCKET="$OBJECT_STORAGE_BUCKET_B"
export MTE_TENANT_A_OBJECT_STORAGE_ACCESS_KEY_ID="$OBJECT_STORAGE_ACCESS_KEY_ID_A"
export MTE_TENANT_B_OBJECT_STORAGE_ACCESS_KEY_ID="$OBJECT_STORAGE_ACCESS_KEY_ID_B"
export MTE_TENANT_A_OBJECT_STORAGE_SECRET_ACCESS_KEY="$OBJECT_STORAGE_SECRET_ACCESS_KEY_A"
export MTE_TENANT_B_OBJECT_STORAGE_SECRET_ACCESS_KEY="$OBJECT_STORAGE_SECRET_ACCESS_KEY_B"
export MTE_TENANT_A_BOOTSTRAP_PASSWORD="$BOOTSTRAP_PASSWORD_A"
export MTE_TENANT_B_BOOTSTRAP_PASSWORD="$BOOTSTRAP_PASSWORD_B"
export MTE_TENANT_A_ADMIN_PASSWORD="$ADMIN_PASSWORD_A"
export MTE_TENANT_B_ADMIN_PASSWORD="$ADMIN_PASSWORD_B"
export MTE_TENANT_A_CEDIS_CODE="$CEDIS_CODE_A"
export MTE_TENANT_B_CEDIS_CODE="$CEDIS_CODE_B"
export MTE_TENANT_A_LOCATION_CODE="$LOCATION_CODE_A"
export MTE_TENANT_B_LOCATION_CODE="$LOCATION_CODE_B"

echo "Running the MTE-005 real PostgreSQL and cross-data-plane contract suite."
run_logged "MTE-005 tenant isolation integration tests" \
  pnpm --dir "$ROOT_DIR/backend" \
  --config.verify-deps-before-run=false exec jest \
  --config test/jest-multi-company-isolation.json \
  --runInBand

echo "PASS: TENANT_A and TENANT_B use separate PostgreSQL/PostGIS clusters, Object Storage containers and backend processes."
