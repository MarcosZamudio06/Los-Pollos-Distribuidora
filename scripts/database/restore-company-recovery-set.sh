#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=postgres-backup-common.sh
source "$SCRIPT_DIR/postgres-backup-common.sh"

COMPANY_SLUG=${COMPANY_SLUG:-${TENANT_SLUG:-}}
RESTORE_RECOVERY_SET_KEY=${RESTORE_RECOVERY_SET_KEY:-}
RESTORE_DATABASE_NAME=${RESTORE_DATABASE_NAME:-}
RESTORE_PRODUCTION_DATABASE_NAME=${RESTORE_PRODUCTION_DATABASE_NAME:-${BACKUP_POSTGRES_DATABASE:-}}
BACKUP_DOCKER_BIN=${BACKUP_DOCKER_BIN:-docker}
BACKUP_UPLOAD_IMAGE=${BACKUP_UPLOAD_IMAGE:-amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7}
BACKUP_UPLOAD_NETWORK=${BACKUP_UPLOAD_NETWORK:-}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT%/}
BACKUP_LOCAL_DIR=${BACKUP_LOCAL_DIR:-/var/lib/pollos-distribuidor/postgres-backups}
RESTORE_LOCAL_DIR=${RESTORE_LOCAL_DIR:-/var/tmp/pollos-distribuidor/company-recovery-restore}
BACKUP_COMPOSE_FILE=${BACKUP_COMPOSE_FILE:-docker-compose.production.yml}
BACKUP_COMPOSE_PROJECT_NAME=${BACKUP_COMPOSE_PROJECT_NAME:-}
BACKUP_COMPOSE_ENV_FILE=${BACKUP_COMPOSE_ENV_FILE:-}
BACKUP_POSTGRES_SERVICE=${BACKUP_POSTGRES_SERVICE:-postgres}
BACKUP_POSTGRES_USER=${BACKUP_POSTGRES_USER:-postgres}
BACKUP_POSTGRES_DATABASE=${BACKUP_POSTGRES_DATABASE:-}
BACKUP_POSTGRES_PASSWORD=${BACKUP_POSTGRES_PASSWORD:-}
OBJECT_STORAGE_ENDPOINT=${OBJECT_STORAGE_ENDPOINT:-http://object-storage:8333}
OBJECT_STORAGE_BUCKET=${OBJECT_STORAGE_BUCKET:-}
OBJECT_STORAGE_ACCESS_KEY_ID=${OBJECT_STORAGE_ACCESS_KEY_ID:-}
OBJECT_STORAGE_SECRET_ACCESS_KEY=${OBJECT_STORAGE_SECRET_ACCESS_KEY:-}
OBJECT_STORAGE_REGION=${OBJECT_STORAGE_REGION:-us-east-1}
RESTORE_OBJECT_STORAGE_LOCAL_DIR=${RESTORE_OBJECT_STORAGE_LOCAL_DIR:-$RESTORE_LOCAL_DIR/object-storage}

backup_require_env COMPANY_SLUG RESTORE_RECOVERY_SET_KEY RESTORE_DATABASE_NAME \
  BACKUP_COMPOSE_ENV_FILE BACKUP_COMPOSE_FILE BACKUP_S3_ENDPOINT BACKUP_S3_REGION \
  BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY \
  BACKUP_POSTGRES_DATABASE BACKUP_POSTGRES_PASSWORD BACKUP_UPLOAD_NETWORK \
  OBJECT_STORAGE_BUCKET OBJECT_STORAGE_ACCESS_KEY_ID OBJECT_STORAGE_SECRET_ACCESS_KEY
if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ||
  "$RESTORE_DATABASE_NAME" == "$BACKUP_POSTGRES_DATABASE" ||
  "$RESTORE_DATABASE_NAME" != *_restore_drill ||
  "$RESTORE_PRODUCTION_DATABASE_NAME" != "$BACKUP_POSTGRES_DATABASE" ||
  "$RESTORE_RECOVERY_SET_KEY" != recovery-sets/"$COMPANY_SLUG"/*\.manifest.json ]]; then
  echo "Company recovery restore requires a tenant-matched temporary database target." >&2
  exit 2
fi
backup_validate_s3_env
mkdir -p "$RESTORE_LOCAL_DIR" "$RESTORE_OBJECT_STORAGE_LOCAL_DIR"
work_dir=$(mktemp -d "$RESTORE_LOCAL_DIR/.tmp.XXXXXX")
chmod 700 "$work_dir"
recovery_manifest="$work_dir/company-recovery.manifest.json"
recovery_checksum="$work_dir/company-recovery.manifest.json.sha256"
postgres_manifest="$work_dir/postgres.manifest.json"
postgres_dump="$work_dir/postgres.dump"
object_manifest="$work_dir/object-storage.manifest.json"
object_checksum="$work_dir/object-storage.manifest.json.sha256"
object_archive="$work_dir/object-storage.tar.gz"
restore_timestamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
restore_run_suffix="$$-$RANDOM"
target_object_bucket="mte-restore-$COMPANY_SLUG-$(date -u +%Y%m%d%H%M%S)-$$"
result_dir=${COMPANY_RECOVERY_RESULT_DIR:-$RESTORE_LOCAL_DIR/results}
mkdir -p "$result_dir"
result_file="$result_dir/$restore_timestamp-$restore_run_suffix.json"
restore_status=failed
restore_stage=identity-check
target_cleanup_state=not_created
result_written=0
postgres_key=unavailable
object_key=unavailable
recovery_set_identity_status=not_run
recovery_set_archives_status=not_run
postgres_restore_status=not_run
object_restore_status=not_run
postgres_restore_attempted=0
object_restore_attempted=0
postgres_restore_finished_at=
object_storage_restore_finished_at=
cross_reference_finished_at=
postgres_target_marker="$work_dir/postgres-target-created"
storage_reference_result="$work_dir/storage-reference-checks.json"
object_storage_restored_at_file="$work_dir/object-storage-restored-at"
object_storage_cleanup_result="$work_dir/object-storage-cleanup.json"

write_rehearsal_result() {
  python3 - "$result_file" "$COMPANY_SLUG" "$RESTORE_RECOVERY_SET_KEY" \
    "$RESTORE_DATABASE_NAME" "$target_object_bucket" "$restore_timestamp" \
    "$restore_status" "$restore_stage" "$target_cleanup_state" "$postgres_key" "$object_key" \
    "$recovery_set_identity_status" "$recovery_set_archives_status" \
    "$postgres_restore_status" "$object_restore_status" "$storage_reference_result" \
    "$postgres_restore_finished_at" "$object_storage_restore_finished_at" \
    "$cross_reference_finished_at" <<'PY'
import json
import sys
from datetime import datetime, timezone

(path, company, set_key, database, object_bucket, created_at, status,
 failure_stage, cleanup_state, postgres_key, object_key, identity_status,
 archives_status, postgres_status, object_status, reference_result_path,
 postgres_finished, object_finished, references_finished) = sys.argv[1:]

reference_result = {}
try:
    with open(reference_result_path, encoding="utf-8") as handle:
        reference_result = json.load(handle)
    reference_checks = reference_result.get("checks", {})
except (OSError, json.JSONDecodeError, AttributeError):
    reference_checks = {}

not_run = {"status": "not_run"}
payload = {
    "status": status,
    "company_slug": company,
    "recovery_set_key": set_key,
    "restore_database": database,
    "restore_object_storage_bucket": object_bucket,
    "created_at": created_at,
    "finished_at": datetime.now(timezone.utc).isoformat(),
    "postgres_restore_finished_at": postgres_finished or None,
    "object_storage_restore_finished_at": object_finished or None,
    "cross_reference_finished_at": references_finished or None,
    "failure_stage": failure_stage if status == "failed" else None,
    "disposable_targets_cleanup": cleanup_state,
    "postgresql_key": postgres_key,
    "object_storage_key": object_key,
    "storage_reference_failure_codes": reference_result.get("failure_codes", []),
    "checks": {
        "recovery_set_identity": {"status": identity_status},
        "recovery_set_archives": {"status": archives_status},
        "postgresql": {"status": postgres_status},
        "postgis": {"status": postgres_status},
        "object_storage_restore": {"status": object_status},
        "company_branding": reference_checks.get("company_branding", not_run),
        "delivery_evidence": reference_checks.get("delivery_evidence", not_run),
        "fiscal_artifacts": reference_checks.get("fiscal_artifacts", not_run),
        "storage_reference_integrity": reference_checks.get("storage_reference_integrity", not_run),
    },
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, sort_keys=True)
    handle.write("\n")
PY
  chmod 600 "$result_file"
  result_written=1
}

cleanup() {
  local status=$?
  local database_cleanup_state=not-created
  local object_cleanup_state=not-created
  local marker_database=

  if [[ -f "$postgres_target_marker" && ! -L "$postgres_target_marker" ]]; then
    marker_database=$(cat "$postgres_target_marker")
    if [[ "$marker_database" == "$RESTORE_DATABASE_NAME" &&
      "$RESTORE_DATABASE_NAME" != "$RESTORE_PRODUCTION_DATABASE_NAME" &&
      "$RESTORE_DATABASE_NAME" == *_restore_drill ]]; then
      if backup_compose_pg dropdb --if-exists --username="$BACKUP_POSTGRES_USER" \
        "$RESTORE_DATABASE_NAME" >/dev/null; then
        database_cleanup_state=cleaned
        rm -f -- "$postgres_target_marker"
      else
        database_cleanup_state=failed
        status=1
      fi
    else
      database_cleanup_state=failed
      status=1
    fi
  elif (( postgres_restore_attempted == 1 )); then
    database_cleanup_state=$(python3 - "$work_dir/postgres-results" "$RESTORE_DATABASE_NAME" <<'PY'
import json
import pathlib
import sys

directory = pathlib.Path(sys.argv[1])
database = sys.argv[2]
records = []
for path in sorted(directory.glob("*.json")) if directory.is_dir() else []:
    try:
        with path.open(encoding="utf-8") as handle:
            record = json.load(handle)
        if record.get("database") == database:
            records.append(record)
    except (OSError, json.JSONDecodeError):
        continue
cleanup = records[-1].get("cleanup") if records else "unknown"
print(cleanup)
PY
)
    case "$database_cleanup_state" in
      passed) database_cleanup_state=cleaned ;;
      not-created) ;;
      *) database_cleanup_state=unknown; status=1 ;;
    esac
  fi

  if [[ -f "$object_storage_cleanup_result" && ! -L "$object_storage_cleanup_result" ]]; then
    object_cleanup_state=$(python3 - "$object_storage_cleanup_result" <<'PY'
import json
import sys

try:
    with open(sys.argv[1], encoding="utf-8") as handle:
        value = json.load(handle).get("status", "unknown")
except (OSError, json.JSONDecodeError, AttributeError):
    value = "unknown"
print(value)
PY
)
  elif (( object_restore_attempted == 1 )); then
    object_cleanup_state=unknown
  fi

  if [[ "$object_cleanup_state" == failed || "$object_cleanup_state" == unknown ]]; then
    status=1
  fi

  if [[ "$database_cleanup_state" == failed || "$database_cleanup_state" == unknown ||
    "$object_cleanup_state" == failed || "$object_cleanup_state" == unknown ]]; then
    target_cleanup_state=failed
  elif [[ "$database_cleanup_state" == cleaned || "$object_cleanup_state" == cleaned ]]; then
    target_cleanup_state=cleaned
  elif [[ "$database_cleanup_state" == not-created && "$object_cleanup_state" == not-created ]]; then
    target_cleanup_state=not_created
  fi

  if (( status != 0 )) && [[ "$restore_status" == passed ]]; then
    restore_status=failed
    restore_stage=disposable-target-cleanup
  elif (( status != 0 )) && [[ "$restore_stage" == completed ]]; then
    restore_stage=disposable-target-cleanup
  fi

  if (( result_written == 0 )); then
    if ! write_rehearsal_result; then
      echo "Company restore rehearsal failure evidence could not be recorded." >&2
      status=1
    else
      result_written=1
    fi
  fi
  if (( status == 0 )) && [[ "$restore_status" == passed ]]; then
    printf 'Company restore rehearsal passed for %s using %s.\n' \
      "$RESTORE_DATABASE_NAME" "$RESTORE_RECOVERY_SET_KEY"
  fi
  rm -rf -- "$work_dir"
  exit "$status"
}
trap cleanup EXIT

backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$RESTORE_RECOVERY_SET_KEY" \
  /backup/company-recovery.manifest.json --endpoint-url "$BACKUP_S3_ENDPOINT" \
  --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$RESTORE_RECOVERY_SET_KEY.sha256" \
  /backup/company-recovery.manifest.json.sha256 --endpoint-url "$BACKUP_S3_ENDPOINT" \
  --only-show-errors >/dev/null

# Reject a set for another company before downloading component archives or
# creating a disposable database/bucket.
recovery_set_identity_status=failed
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-identity \
  --manifest "$recovery_manifest" --checksum "$recovery_checksum" \
  --expected-company "$COMPANY_SLUG" >/dev/null
recovery_set_identity_status=passed
manifest_values=$(node - "$recovery_manifest" <<'NODE'
const { readFileSync } = require("node:fs");
const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
process.stdout.write([
  manifest.postgresql.database,
  manifest.postgresql.key,
  manifest.postgresql.manifest_key,
  manifest.object_storage.key,
  manifest.object_storage.manifest_key,
].join("\t"));
NODE
)
IFS=$'\t' read -r source_database postgres_key postgres_manifest_key object_key object_manifest_key <<< "$manifest_values"
if [[ "$source_database" != "$BACKUP_POSTGRES_DATABASE" ]]; then
  echo "Recovery set database identity does not match the selected company's database." >&2
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
restore_stage=component-validation
recovery_set_archives_status=failed
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify \
  --manifest "$recovery_manifest" --checksum "$recovery_checksum" \
  --expected-company "$COMPANY_SLUG" \
  --postgres-manifest "$postgres_manifest" --object-manifest "$object_manifest" \
  --postgres "$postgres_dump" --object-storage "$object_archive" >/dev/null
recovery_set_archives_status=passed

# Both targets are unique, disposable, and validated before their first mutation.
restore_stage=postgresql-restore
target_cleanup_state=unknown
export RESTORE_DATABASE_NAME RESTORE_PRODUCTION_DATABASE_NAME
export RESTORE_DEFER_TARGET_CLEANUP=true
export RESTORE_TARGET_CREATED_MARKER_FILE="$postgres_target_marker"
export RESTORE_BACKUP_KEY="$postgres_key"
export RESTORE_LOCAL_DIR="$work_dir/postgres-restore"
export RESTORE_RESULT_DIR="$work_dir/postgres-results"
export BACKUP_DOCKER_BIN BACKUP_COMPOSE_FILE BACKUP_COMPOSE_PROJECT_NAME \
  BACKUP_COMPOSE_ENV_FILE BACKUP_POSTGRES_SERVICE BACKUP_POSTGRES_USER \
  BACKUP_POSTGRES_PASSWORD BACKUP_POSTGRES_DATABASE BACKUP_UPLOAD_IMAGE \
  BACKUP_UPLOAD_NETWORK OBJECT_STORAGE_ENDPOINT OBJECT_STORAGE_BUCKET \
  OBJECT_STORAGE_ACCESS_KEY_ID OBJECT_STORAGE_SECRET_ACCESS_KEY OBJECT_STORAGE_REGION
postgres_restore_status=failed
postgres_restore_attempted=1
bash "$SCRIPT_DIR/restore-postgres-from-b2.sh" >/dev/null
postgres_restore_status=passed
postgres_restore_finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [[ -n "${RESTORE_DRILL_ASSERT_SQL_FILE:-}" ]]; then
  if [[ "$(basename -- "$BACKUP_COMPOSE_FILE")" != dr-disposable.compose.yml ||
    ! "$BACKUP_COMPOSE_PROJECT_NAME" =~ ^dr[0-9]{14}[0-9]+$ ||
    ! -f "$RESTORE_DRILL_ASSERT_SQL_FILE" || -L "$RESTORE_DRILL_ASSERT_SQL_FILE" ]]; then
    echo 'Restore drill assertion SQL is only allowed in the disposable DR harness.' >&2
    exit 2
  fi
  backup_compose_pg psql --username="$BACKUP_POSTGRES_USER" \
    --dbname="$RESTORE_DATABASE_NAME" --no-psqlrc --set ON_ERROR_STOP=1 \
    < "$RESTORE_DRILL_ASSERT_SQL_FILE" >/dev/null
fi

restore_stage=object-storage-restore
export RESTORE_OBJECT_STORAGE_MANIFEST_FILE="$object_manifest"
export RESTORE_OBJECT_STORAGE_CHECKSUM_FILE="$object_checksum"
export RESTORE_OBJECT_STORAGE_TARGET_BUCKET="$target_object_bucket"
export RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE=true
export RESTORE_OBJECT_STORAGE_LOCAL_DIR="$work_dir/object-restore"
export RESTORE_REQUIRE_STORAGE_REFERENCE_CHECK=true
export RESTORE_OBJECT_STORAGE_REFERENCE_RESULT_FILE="$storage_reference_result"
export RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE="$object_storage_cleanup_result"
export RESTORE_OBJECT_STORAGE_RESTORED_AT_FILE="$object_storage_restored_at_file"
export RESTORE_RECOVERY_SET_MANIFEST_FILE="$recovery_manifest"
object_restore_status=failed
object_restore_attempted=1
bash "$SCRIPT_DIR/restore-object-storage-from-b2.sh" >/dev/null
object_restore_status=passed
object_storage_restore_finished_at=$(cat "$object_storage_restored_at_file")
cross_reference_finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
restore_status=passed
restore_stage=completed
