#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=postgres-backup-common.sh
source "$SCRIPT_DIR/postgres-backup-common.sh"

COMPANY_SLUG=${COMPANY_SLUG:-${TENANT_SLUG:-}}
BACKUP_POSTGRES_DATABASE=${BACKUP_POSTGRES_DATABASE:-${POSTGRES_DB:-}}
BACKUP_LOCAL_DIR=${BACKUP_LOCAL_DIR:-/var/lib/pollos-distribuidor/postgres-backups}
BACKUP_RESULT_DIR=${BACKUP_RESULT_DIR:-$BACKUP_LOCAL_DIR/results}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
BACKUP_COMPOSE_FILE=${BACKUP_COMPOSE_FILE:-docker-compose.production.yml}
BACKUP_POSTGRES_SERVICE=${BACKUP_POSTGRES_SERVICE:-postgres}
BACKUP_POSTGRES_USER=${BACKUP_POSTGRES_USER:-postgres}
BACKUP_UPLOAD_IMAGE=${BACKUP_UPLOAD_IMAGE:-amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7}
BACKUP_UPLOAD_NETWORK=${BACKUP_UPLOAD_NETWORK:-}
BACKUP_DOCKER_BIN=${BACKUP_DOCKER_BIN:-docker}
OBJECT_STORAGE_ENDPOINT=${OBJECT_STORAGE_ENDPOINT:-http://object-storage:8333}
OBJECT_STORAGE_BUCKET=${OBJECT_STORAGE_BUCKET:-}
OBJECT_STORAGE_ACCESS_KEY_ID=${OBJECT_STORAGE_ACCESS_KEY_ID:-}
OBJECT_STORAGE_SECRET_ACCESS_KEY=${OBJECT_STORAGE_SECRET_ACCESS_KEY:-}
OBJECT_STORAGE_REGION=${OBJECT_STORAGE_REGION:-us-east-1}
COMPANY_RECOVERY_RESULT_DIR=${COMPANY_RECOVERY_RESULT_DIR:-$BACKUP_RESULT_DIR/company-recovery}
COMPANY_RECOVERY_LOCAL_DIR=${COMPANY_RECOVERY_LOCAL_DIR:-$BACKUP_LOCAL_DIR/company-recovery-sets}

backup_require_env COMPANY_SLUG BACKUP_POSTGRES_DATABASE BACKUP_COMPOSE_ENV_FILE \
  BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET \
  BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY \
  BACKUP_POSTGRES_PASSWORD OBJECT_STORAGE_BUCKET OBJECT_STORAGE_ACCESS_KEY_ID \
  OBJECT_STORAGE_SECRET_ACCESS_KEY
if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ||
  ! "$BACKUP_POSTGRES_DATABASE" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Company recovery identity or database name is invalid." >&2
  exit 2
fi
if [[ -z "$BACKUP_UPLOAD_NETWORK" && -n "${BACKUP_COMPOSE_PROJECT_NAME:-}" ]]; then
  BACKUP_UPLOAD_NETWORK="${BACKUP_COMPOSE_PROJECT_NAME}_app_network"
fi
backup_require_env BACKUP_UPLOAD_NETWORK
backup_validate_s3_env

read_config_value() {
  local key=$1
  local file=$2
  local matches
  matches=$(awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1) }' "$file")
  local count
  count=$(printf '%s\n' "$matches" | awk 'NF { count++ } END { print count + 0 }')
  if [[ "$count" != 1 ]]; then
    echo "Tenant deployment config has a missing or duplicate $key." >&2
    return 1
  fi
  printf '%s' "$matches" | sed -e 's/^"//' -e 's/"$//'
}

BACKEND_IMAGE_DIGEST=${BACKUP_BACKEND_IMAGE_DIGEST:-$(read_config_value BACKEND_IMAGE "$BACKUP_COMPOSE_ENV_FILE")}
FRONTEND_IMAGE_DIGEST=${BACKUP_FRONTEND_IMAGE_DIGEST:-$(read_config_value FRONTEND_IMAGE "$BACKUP_COMPOSE_ENV_FILE")}
if [[ ! "$BACKEND_IMAGE_DIGEST" =~ ^[a-z0-9.-]+(/[a-z0-9._-]+)+@sha256:[a-f0-9]{64}$ ||
  ! "$FRONTEND_IMAGE_DIGEST" =~ ^[a-z0-9.-]+(/[a-z0-9._-]+)+@sha256:[a-f0-9]{64}$ ]]; then
  echo "Company recovery requires immutable backend and frontend release digests." >&2
  exit 2
fi

mkdir -p "$COMPANY_RECOVERY_RESULT_DIR" "$COMPANY_RECOVERY_LOCAL_DIR"
run_suffix="$$-$RANDOM"
work_dir=$(mktemp -d "$COMPANY_RECOVERY_LOCAL_DIR/.tmp.XXXXXX")
chmod 700 "$work_dir"
db_results="$work_dir/database-results"
object_results="$work_dir/object-results"
mkdir -m 700 "$db_results" "$object_results"
db_environment="$work_dir/database.env"
schema_state="$work_dir/schema-state.json"
postgres_manifest="$work_dir/postgres.manifest.json"
postgres_dump="$work_dir/postgres.dump"
object_manifest="$work_dir/object-storage.manifest.json"
object_manifest_checksum="$work_dir/object-storage.manifest.json.sha256"
object_archive="$work_dir/object-storage.tar.gz"
recovery_manifest="$work_dir/company-recovery.manifest.json"
recovery_checksum="$work_dir/company-recovery.manifest.json.sha256"
result_file="$COMPANY_RECOVERY_RESULT_DIR/$(date -u +%Y-%m-%dT%H-%M-%SZ)-$run_suffix.json"
cleanup() {
  local status=$?
  rm -rf -- "$work_dir"
  exit "$status"
}
trap cleanup EXIT

export COMPANY_SLUG TENANT_SLUG="$COMPANY_SLUG"
export BACKUP_RESULT_DIR="$db_results"
export OBJECT_STORAGE_RESULT_DIR="$object_results"
export OBJECT_STORAGE_BACKUP_LOCAL_DIR="$BACKUP_LOCAL_DIR/object-storage"
export BACKUP_UPLOAD_NETWORK
export BACKUP_RETENTION_DISABLED=true
export BACKUP_POSTGRES_DATABASE BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET
export BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY BACKUP_POSTGRES_PASSWORD
export BACKUP_COMPOSE_FILE BACKUP_POSTGRES_SERVICE BACKUP_POSTGRES_USER BACKUP_DOCKER_BIN
export OBJECT_STORAGE_BUCKET OBJECT_STORAGE_ENDPOINT OBJECT_STORAGE_ACCESS_KEY_ID
export OBJECT_STORAGE_SECRET_ACCESS_KEY OBJECT_STORAGE_REGION

bash "$SCRIPT_DIR/backup-postgres-to-b2.sh" >/dev/null
set -- "$db_results"/*.json
[[ -f "$1" ]] || { echo "PostgreSQL backup result is missing." >&2; exit 1; }
pg_result=$1
bash "$SCRIPT_DIR/backup-object-storage-to-b2.sh" >/dev/null
set -- "$object_results"/*.json
[[ -f "$1" ]] || { echo "Object Storage backup result is missing." >&2; exit 1; }
object_result=$1

pg_values=$(node - "$pg_result" <<'NODE'
const { readFileSync } = require("node:fs");
const result = JSON.parse(readFileSync(process.argv[2], "utf8"));
process.stdout.write([result.key, result.manifest_key, result.size_bytes, result.sha256, result.created_at].join("\t"));
NODE
)
IFS=$'\t' read -r postgres_key postgres_manifest_key postgres_size postgres_sha postgres_created_at <<< "$pg_values"
object_values=$(node - "$object_result" <<'NODE'
const { readFileSync } = require("node:fs");
const result = JSON.parse(readFileSync(process.argv[2], "utf8"));
process.stdout.write([result.key, result.manifest_key, result.size_bytes, result.sha256, result.created_at, result.manifest_sha256].join("\t"));
NODE
)
IFS=$'\t' read -r object_key object_manifest_key object_size object_sha object_created_at object_manifest_sha_reported <<< "$object_values"

schema_sql=$(cat <<'SQL'
SELECT COALESCE(json_agg(json_build_object(
    'migration_name', migration_name,
    'checksum', checksum,
    'finished_at', finished_at
  ) ORDER BY migration_name)::text, '[]')
  FROM "_prisma_migrations"
 WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
SQL
)
backup_compose_pg psql -X -A -t -v ON_ERROR_STOP=1 \
  --username="$BACKUP_POSTGRES_USER" --dbname="$BACKUP_POSTGRES_DATABASE" \
  --command="$schema_sql" > "$schema_state"
if [[ ! -s "$schema_state" ]]; then
  echo "PostgreSQL schema state query returned no data." >&2
  exit 1
fi

backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$postgres_manifest_key" /backup/postgres.manifest.json \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$postgres_key" /backup/postgres.dump \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$object_manifest_key" /backup/object-storage.manifest.json \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$object_manifest_key.sha256" /backup/object-storage.manifest.json.sha256 \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$object_key" /backup/object-storage.tar.gz \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null

node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-object \
  --manifest "$object_manifest" --checksum "$object_manifest_checksum" \
  --expected-company "$COMPANY_SLUG" --archive "$object_archive" >/dev/null
postgres_manifest_sha=$(backup_sha256 "$postgres_manifest")
object_manifest_sha=$(backup_sha256 "$object_manifest")
if [[ "$object_manifest_sha" != "$object_manifest_sha_reported" ]]; then
  echo "Object Storage component manifest differs from its backup result." >&2
  exit 1
fi
node - "$postgres_manifest" "$pg_result" "$object_manifest" "$object_result" <<'NODE'
const { readFileSync } = require("node:fs");
const pg = JSON.parse(readFileSync(process.argv[2], "utf8"));
const pgResult = JSON.parse(readFileSync(process.argv[3], "utf8"));
const objects = JSON.parse(readFileSync(process.argv[4], "utf8"));
const objectResult = JSON.parse(readFileSync(process.argv[5], "utf8"));
if (pg.key !== pgResult.key || pg.manifest_key !== pgResult.manifest_key
    || pg.size_bytes !== pgResult.size_bytes || pg.sha256 !== pgResult.sha256
    || objects.key !== objectResult.key || objects.manifest_key !== objectResult.manifest_key
    || objects.size_bytes !== objectResult.size_bytes || objects.sha256 !== objectResult.sha256) {
  throw new Error("RECOVERY_SET_COMPONENT_RESULT_MISMATCH");
}
NODE
node "$SCRIPT_DIR/company-recovery-manifest.mjs" create \
  --company-slug "$COMPANY_SLUG" --database "$BACKUP_POSTGRES_DATABASE" \
  --backend-digest "$BACKEND_IMAGE_DIGEST" --frontend-digest "$FRONTEND_IMAGE_DIGEST" \
  --schema-state "$schema_state" --postgres-manifest "$postgres_manifest" \
  --object-manifest "$object_manifest" --manifest "$recovery_manifest" \
  --checksum "$recovery_checksum"
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify \
  --manifest "$recovery_manifest" --checksum "$recovery_checksum" \
  --expected-company "$COMPANY_SLUG" \
  --postgres-manifest "$postgres_manifest" --object-manifest "$object_manifest" \
  --postgres "$postgres_dump" --object-storage "$object_archive" >/dev/null
recovery_timestamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
recovery_key="recovery-sets/$COMPANY_SLUG/$recovery_timestamp-$run_suffix.manifest.json"
recovery_checksum_key="$recovery_key.sha256"
backup_aws_cli_dir "$work_dir" ro s3 cp \
  /backup/company-recovery.manifest.json "s3://$BACKUP_S3_BUCKET/$recovery_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --content-type application/json \
  --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" ro s3 cp \
  /backup/company-recovery.manifest.json.sha256 "s3://$BACKUP_S3_BUCKET/$recovery_checksum_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$recovery_key" /backup/company-recovery.remote.json \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$recovery_checksum_key" /backup/company-recovery.remote.sha256 \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-identity \
  --manifest "$work_dir/company-recovery.remote.json" \
  --checksum "$work_dir/company-recovery.remote.sha256" \
  --expected-company "$COMPANY_SLUG" >/dev/null

python3 - "$result_file" "$COMPANY_SLUG" "$recovery_key" "$recovery_checksum_key" \
  "$postgres_key" "$object_key" "$recovery_timestamp" "$postgres_size" "$postgres_sha" \
  "$object_size" "$object_sha" "$postgres_manifest_sha" "$object_manifest_sha" <<'PY'
import json
import sys

(path, company, set_key, set_checksum_key, db_key, object_key, created_at,
 db_size, db_sha, object_size, object_sha, db_manifest_sha, object_manifest_sha) = sys.argv[1:]
payload = {
    "status": "validated",
    "company_slug": company,
    "recovery_set_key": set_key,
    "recovery_set_checksum_key": set_checksum_key,
    "created_at": created_at,
    "postgresql": {"key": db_key, "size_bytes": int(db_size), "sha256": db_sha, "manifest_sha256": db_manifest_sha},
    "object_storage": {"key": object_key, "size_bytes": int(object_size), "sha256": object_sha, "manifest_sha256": object_manifest_sha},
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, sort_keys=True)
    handle.write("\n")
PY
chmod 600 "$result_file"
printf 'Company recovery set validated: %s\n' "$recovery_key"
