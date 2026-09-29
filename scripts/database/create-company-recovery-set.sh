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
COMPANY_RECOVERY_BACKEND_SERVICE=${COMPANY_RECOVERY_BACKEND_SERVICE:-backend}
OBJECT_STORAGE_SERVICE=${OBJECT_STORAGE_SERVICE:-object-storage}
COMPANY_RECOVERY_STOP_TIMEOUT_SECONDS=${COMPANY_RECOVERY_STOP_TIMEOUT_SECONDS:-120}
COMPANY_RECOVERY_START_TIMEOUT_SECONDS=${COMPANY_RECOVERY_START_TIMEOUT_SECONDS:-120}
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
BACKUP_RETENTION_DAILY=${BACKUP_RETENTION_DAILY:-14}
BACKUP_RETENTION_WEEKLY=${BACKUP_RETENTION_WEEKLY:-8}
BACKUP_RETENTION_MONTHLY=${BACKUP_RETENTION_MONTHLY:-6}
BACKUP_FAILED_KEEP_COUNT=${BACKUP_FAILED_KEEP_COUNT:-1}

if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Company recovery identity or database name is invalid." >&2
  exit 2
fi

mkdir -p "$COMPANY_RECOVERY_RESULT_DIR" "$COMPANY_RECOVERY_LOCAL_DIR"
run_suffix="$$-$RANDOM"
started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
result_file="$COMPANY_RECOVERY_RESULT_DIR/$(date -u +%Y-%m-%dT%H-%M-%SZ)-$run_suffix.json"
recovery_stage=preflight
failure_stage=
cleanup_stage=not-required
postgres_component_status=not-started
object_storage_component_status=not-started
backend_state_before=unknown
backend_restoration=pending
quiesce_requested_at=
write_barrier_at=
capture_started_at=
capture_finished_at=
write_barrier_released_at=
writes_resumed_at=
recovery_key=
recovery_checksum_key=
recovery_timestamp=
postgres_key=
postgres_size=
postgres_sha=
postgres_manifest_sha=
object_key=
object_size=
object_sha=
object_manifest_sha=
retention_status=not-started
result_written=0
backend_was_running=0
backend_needs_resume=0
work_dir=

write_result() {
  local status=$1
  local finished_at
  finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  python3 - "$result_file" "$status" "$COMPANY_SLUG" "$started_at" \
    "$finished_at" "${failure_stage:-$recovery_stage}" "$cleanup_stage" \
    "$retention_status" \
    "$postgres_component_status" "$object_storage_component_status" \
    "$backend_state_before" "$backend_restoration" "$quiesce_requested_at" \
    "$write_barrier_at" "$capture_started_at" "$capture_finished_at" \
    "$write_barrier_released_at" "$writes_resumed_at" "$recovery_key" \
    "$recovery_checksum_key" "$recovery_timestamp" "$postgres_key" \
    "${postgres_manifest_key:-}" "$postgres_size" "$postgres_sha" \
    "$postgres_manifest_sha" "$object_key" "${object_manifest_key:-}" \
    "$object_size" "$object_sha" "$object_manifest_sha" <<'PY'
import json
import os
import sys

(path, status, company, started, finished, failure_stage, cleanup_stage,
 retention_status,
 postgres_status, object_status, backend_before, backend_restoration,
 quiesce_requested, write_barrier, capture_started, capture_finished,
 barrier_released, writes_resumed, recovery_key, recovery_checksum_key,
 recovery_timestamp, postgres_key, postgres_manifest_key, postgres_size,
 postgres_sha, postgres_manifest_sha, object_key, object_manifest_key,
 object_size, object_sha, object_manifest_sha) = sys.argv[1:]
payload = {
    "status": status,
    "company_slug": company,
    "started_at": started,
    "finished_at": finished,
    "failure_stage": failure_stage if status == "failed" else None,
    "cleanup_stage": cleanup_stage,
    "retention": {"status": retention_status},
    "components": {"postgresql": postgres_status, "object_storage": object_status},
    "backend_state_before": backend_before,
    "backend_restoration": backend_restoration,
    "recovery_point": {
        "method": "backend-quiesce",
        "quiesce_requested_at": quiesce_requested or None,
        "write_barrier_at": write_barrier or None,
        "capture_started_at": capture_started or None,
        "capture_finished_at": capture_finished or None,
        "write_barrier_released_at": barrier_released or None,
        "writes_resumed_at": writes_resumed or None,
    },
    "recovery_set_key": recovery_key or None,
}
if status == "validated":
    payload.update({
        "created_at": recovery_timestamp,
        "recovery_set_checksum_key": recovery_checksum_key,
        "postgresql": {
            "key": postgres_key,
            "manifest_key": postgres_manifest_key,
            "size_bytes": int(postgres_size),
            "sha256": postgres_sha,
            "manifest_sha256": postgres_manifest_sha,
        },
        "object_storage": {
            "key": object_key,
            "manifest_key": object_manifest_key,
            "size_bytes": int(object_size),
            "sha256": object_sha,
            "manifest_sha256": object_manifest_sha,
        },
    })
temporary = path + ".tmp"
descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, sort_keys=True)
    handle.write("\n")
os.replace(temporary, path)
os.chmod(path, 0o600)
PY
  result_written=1
}

resume_backend() {
  if (( backend_needs_resume == 0 )); then
    if [[ -z "$write_barrier_released_at" ]]; then
      write_barrier_released_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    fi
    return 0
  fi

  backup_compose start "$COMPANY_RECOVERY_BACKEND_SERVICE" >/dev/null
  local attempts=0
  while (( attempts < COMPANY_RECOVERY_START_TIMEOUT_SECONDS )); do
    if backup_compose_service_health "$COMPANY_RECOVERY_BACKEND_SERVICE" >/dev/null 2>&1; then
      backend_needs_resume=0
      backend_restoration=restored
      writes_resumed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
      write_barrier_released_at=$writes_resumed_at
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done

  backend_restoration=failed
  printf 'Company ERP backend did not become healthy after recovery backup.\n' >&2
  return 1
}

cleanup() {
  local status=$?
  trap - EXIT
  trap '' HUP INT TERM
  if (( backend_needs_resume != 0 )); then
    cleanup_stage=resume-backend
    if ! resume_backend; then
      if (( status == 0 )); then
        status=1
        failure_stage=resume-backend
      fi
    fi
  fi
  if (( status != 0 )); then
    recovery_status=failed
    if [[ -z "$failure_stage" ]]; then
      failure_stage=$recovery_stage
    fi
    if ! write_result failed; then
      echo "Company recovery failure evidence could not be recorded." >&2
      status=1
    fi
  elif (( result_written == 0 )); then
    failure_stage=${failure_stage:-$recovery_stage}
    if ! write_result failed; then
      echo "Company recovery result evidence could not be recorded." >&2
      status=1
    else
      status=1
    fi
  fi
  if [[ -n "$work_dir" && -d "$work_dir" ]]; then
    rm -rf -- "$work_dir"
  fi
  exit "$status"
}

handle_interruption() {
  local exit_code=$1
  if [[ -z "$failure_stage" ]]; then
    failure_stage=$recovery_stage
  fi
  case "$recovery_stage" in
    postgres-backup) postgres_component_status=interrupted ;;
    object-storage-preflight|object-storage-space-preflight|object-storage-backup)
      object_storage_component_status=interrupted
      ;;
  esac
  recovery_stage=interrupted
  exit "$exit_code"
}

trap cleanup EXIT
trap 'handle_interruption 129' HUP
trap 'handle_interruption 130' INT
trap 'handle_interruption 143' TERM

backup_require_env COMPANY_SLUG BACKUP_POSTGRES_DATABASE BACKUP_COMPOSE_ENV_FILE \
  BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET \
  BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY \
  BACKUP_POSTGRES_PASSWORD OBJECT_STORAGE_BUCKET OBJECT_STORAGE_ACCESS_KEY_ID \
  OBJECT_STORAGE_SECRET_ACCESS_KEY
if [[ ! "$BACKUP_POSTGRES_DATABASE" =~ ^[A-Za-z0-9_]+$ ]]; then
  echo "Company recovery database name is invalid." >&2
  exit 2
fi
backup_validate_positive_integer COMPANY_RECOVERY_STOP_TIMEOUT_SECONDS "$COMPANY_RECOVERY_STOP_TIMEOUT_SECONDS"
backup_validate_positive_integer COMPANY_RECOVERY_START_TIMEOUT_SECONDS "$COMPANY_RECOVERY_START_TIMEOUT_SECONDS"
backup_validate_non_negative_integer BACKUP_RETENTION_DAILY "$BACKUP_RETENTION_DAILY"
backup_validate_non_negative_integer BACKUP_RETENTION_WEEKLY "$BACKUP_RETENTION_WEEKLY"
backup_validate_non_negative_integer BACKUP_RETENTION_MONTHLY "$BACKUP_RETENTION_MONTHLY"
backup_validate_positive_integer BACKUP_FAILED_KEEP_COUNT "$BACKUP_FAILED_KEEP_COUNT"
if [[ -z "$BACKUP_UPLOAD_NETWORK" && -n "${BACKUP_COMPOSE_PROJECT_NAME:-}" ]]; then
  BACKUP_UPLOAD_NETWORK="${BACKUP_COMPOSE_PROJECT_NAME}_app_network"
fi
backup_require_env BACKUP_UPLOAD_NETWORK
backup_validate_s3_env

recovery_stage=company-lock
lock_file="$COMPANY_RECOVERY_LOCAL_DIR/.$COMPANY_SLUG.lock"
exec 9>"$lock_file"
if ! flock -n 9; then
  echo "A recovery operation is already active for this company." >&2
  exit 75
fi

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

work_dir=$(mktemp -d "$COMPANY_RECOVERY_LOCAL_DIR/.tmp.XXXXXX")
chmod 700 "$work_dir"
db_results="$work_dir/database-results"
object_results="$work_dir/object-results"
mkdir -m 700 "$db_results" "$object_results"
schema_state="$work_dir/schema-state.json"
postgres_manifest="$work_dir/postgres.manifest.json"
postgres_dump="$work_dir/postgres.dump"
object_manifest="$work_dir/object-storage.manifest.json"
object_manifest_checksum="$work_dir/object-storage.manifest.json.sha256"
object_archive="$work_dir/object-storage.tar.gz"
recovery_manifest="$work_dir/company-recovery.manifest.json"
recovery_checksum="$work_dir/company-recovery.manifest.json.sha256"
recovery_point_file="$work_dir/recovery-point.json"

export COMPANY_SLUG TENANT_SLUG="$COMPANY_SLUG"
export BACKUP_RESULT_DIR="$db_results"
export OBJECT_STORAGE_RESULT_DIR="$object_results"
export OBJECT_STORAGE_BACKUP_LOCAL_DIR="$BACKUP_LOCAL_DIR/object-storage"
export BACKUP_UPLOAD_NETWORK
export BACKUP_RETENTION_DISABLED=true
export BACKUP_RECOVERY_SET_MODE=true
export BACKUP_RETENTION_DAILY BACKUP_RETENTION_WEEKLY BACKUP_RETENTION_MONTHLY
export BACKUP_FAILED_KEEP_COUNT
export BACKUP_POSTGRES_DATABASE BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET
export BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY BACKUP_POSTGRES_PASSWORD
export BACKUP_COMPOSE_FILE BACKUP_POSTGRES_SERVICE BACKUP_POSTGRES_USER BACKUP_DOCKER_BIN
export OBJECT_STORAGE_BUCKET OBJECT_STORAGE_ENDPOINT OBJECT_STORAGE_ACCESS_KEY_ID
export OBJECT_STORAGE_SECRET_ACCESS_KEY OBJECT_STORAGE_REGION
export OBJECT_STORAGE_SERVICE COMPANY_RECOVERY_BACKEND_SERVICE

recovery_stage=preflight
backup_compose_service_health "$BACKUP_POSTGRES_SERVICE"
backup_compose_pg pg_isready -U "$BACKUP_POSTGRES_USER" -d "$BACKUP_POSTGRES_DATABASE" >/dev/null
backup_assert_object_storage_ready
recovery_stage=object-storage-space-preflight
bash "$SCRIPT_DIR/preflight-object-storage-backup-space.sh" \
  "$OBJECT_STORAGE_BACKUP_LOCAL_DIR" \
  "${OBJECT_STORAGE_MIN_FREE_BYTES:-1073741824}" \
  "$BACKUP_UPLOAD_NETWORK" "$BACKUP_UPLOAD_IMAGE" "$BACKUP_DOCKER_BIN"
recovery_stage=preflight
running_services=$(backup_compose ps --status running --services)
if printf '%s\n' "$running_services" | grep -Fxq "$COMPANY_RECOVERY_BACKEND_SERVICE"; then
  backup_compose_service_health "$COMPANY_RECOVERY_BACKEND_SERVICE"
  backend_was_running=1
  backend_state_before=running
  backend_restoration=pending
  backend_container=$(backup_compose ps -q "$COMPANY_RECOVERY_BACKEND_SERVICE")
else
  backend_state_before=stopped
  backend_restoration=preexisting-stopped
fi

recovery_stage=quiesce-backend
quiesce_requested_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if (( backend_was_running == 1 )); then
  # Mark before stop: Docker may stop the service but fail before acknowledging
  # it, so EXIT cleanup attempts an idempotent start in all cases.
  backend_needs_resume=1
  backup_compose stop --timeout "$COMPANY_RECOVERY_STOP_TIMEOUT_SECONDS" \
    "$COMPANY_RECOVERY_BACKEND_SERVICE" >/dev/null
  backend_exit_code=$("$BACKUP_DOCKER_BIN" inspect --format '{{.State.ExitCode}}' "$backend_container")
  if [[ "$backend_exit_code" != "0" ]]; then
    echo "Company ERP backend did not stop gracefully; refusing to capture a recovery point." >&2
    exit 1
  fi
  running_services=$(backup_compose ps --status running --services)
  if printf '%s\n' "$running_services" | grep -Fxq "$COMPANY_RECOVERY_BACKEND_SERVICE"; then
    echo "Company ERP backend is still running; refusing to capture a recovery point." >&2
    exit 1
  fi
fi
write_barrier_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
capture_started_at=$write_barrier_at

recovery_stage=postgres-backup
postgres_component_status=in-progress
if ! bash "$SCRIPT_DIR/backup-postgres-to-b2.sh" >/dev/null; then
  postgres_component_status=failed
  exit 1
fi
set -- "$db_results"/*.json
[[ -f "$1" ]] || { echo "PostgreSQL backup result is missing." >&2; exit 1; }
pg_result=$1
pg_result_status=$(node - "$pg_result" <<'NODE'
const { readFileSync } = require("node:fs");
const result = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (result.status !== "validated") throw new Error("RECOVERY_SET_POSTGRES_COMPONENT_NOT_VALIDATED");
process.stdout.write(result.status);
NODE
)
[[ "$pg_result_status" == validated ]] || { postgres_component_status=failed; exit 1; }
postgres_component_status=validated

recovery_stage=object-storage-preflight
backup_assert_object_storage_ready
recovery_stage=object-storage-backup
object_storage_component_status=in-progress
if ! bash "$SCRIPT_DIR/backup-object-storage-to-b2.sh" >/dev/null; then
  object_storage_component_status=failed
  exit 1
fi
set -- "$object_results"/*.json
[[ -f "$1" ]] || { echo "Object Storage backup result is missing." >&2; exit 1; }
object_result=$1
object_result_status=$(node - "$object_result" <<'NODE'
const { readFileSync } = require("node:fs");
const result = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (result.status !== "validated") throw new Error("RECOVERY_SET_OBJECT_COMPONENT_NOT_VALIDATED");
process.stdout.write(result.status);
NODE
)
[[ "$object_result_status" == validated ]] || { object_storage_component_status=failed; exit 1; }
object_storage_component_status=validated
capture_finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

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
recovery_stage=resume-backend
resume_backend

python3 - "$recovery_point_file" "$COMPANY_RECOVERY_BACKEND_SERVICE" \
  "$backend_was_running" "$quiesce_requested_at" "$write_barrier_at" \
  "$capture_started_at" "$capture_finished_at" "$write_barrier_released_at" \
  "$writes_resumed_at" <<'PY'
import json
import sys

(path, backend_service, backend_was_running, quiesce_requested, write_barrier,
 capture_started, capture_finished, barrier_released, writes_resumed) = sys.argv[1:]
payload = {
    "method": "backend-quiesce",
    "backend_service": backend_service,
    "backend_was_running": backend_was_running == "1",
    "quiesce_requested_at": quiesce_requested,
    "write_barrier_at": write_barrier,
    "capture_started_at": capture_started,
    "capture_finished_at": capture_finished,
    "write_barrier_released_at": barrier_released,
    "writes_resumed_at": writes_resumed or None,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, sort_keys=True)
    handle.write("\n")
PY

node "$SCRIPT_DIR/company-recovery-manifest.mjs" create \
  --company-slug "$COMPANY_SLUG" --database "$BACKUP_POSTGRES_DATABASE" \
  --backend-digest "$BACKEND_IMAGE_DIGEST" --frontend-digest "$FRONTEND_IMAGE_DIGEST" \
  --schema-state "$schema_state" --postgres-manifest "$postgres_manifest" \
  --recovery-point "$recovery_point_file" \
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

recovery_stage=retention
bash "$SCRIPT_DIR/apply-company-recovery-retention.sh" "$work_dir" "$recovery_key"
retention_status=applied
recovery_stage=record-result
write_result validated
printf 'Company recovery set validated: %s\n' "$recovery_key"
