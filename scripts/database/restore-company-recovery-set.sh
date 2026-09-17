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

write_rehearsal_result() {
  local status=$1
  python3 - "$result_file" "$COMPANY_SLUG" "$RESTORE_RECOVERY_SET_KEY" \
    "$RESTORE_DATABASE_NAME" "$target_object_bucket" "$restore_timestamp" \
    "$status" "$restore_stage" "$target_cleanup_state" "$postgres_key" "$object_key" <<'PY'
import json
import sys

(path, company, set_key, database, object_bucket, created_at, status,
 failure_stage, cleanup_state, postgres_key, object_key) = sys.argv[1:]
payload = {
    "status": status,
    "company_slug": company,
    "recovery_set_key": set_key,
    "restore_database": database,
    "restore_object_storage_bucket": object_bucket,
    "created_at": created_at,
    "failure_stage": failure_stage if status == "failed" else None,
    "disposable_targets_cleanup": cleanup_state,
    "postgresql_key": postgres_key,
    "object_storage_key": object_key,
    "checks": ["postgresql", "postgis", "delivery_evidence", "fiscal_artifacts", "object_storage_checksum"],
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
  if (( result_written == 0 )); then
    if ! write_rehearsal_result failed; then
      echo "Company restore rehearsal failure evidence could not be recorded." >&2
      status=1
    fi
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
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-identity \
  --manifest "$recovery_manifest" --checksum "$recovery_checksum" \
  --expected-company "$COMPANY_SLUG" >/dev/null
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
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify \
  --manifest "$recovery_manifest" --checksum "$recovery_checksum" \
  --expected-company "$COMPANY_SLUG" \
  --postgres-manifest "$postgres_manifest" --object-manifest "$object_manifest" \
  --postgres "$postgres_dump" --object-storage "$object_archive" >/dev/null

# Both targets are unique, disposable, and validated before their first mutation.
restore_stage=postgresql-restore
target_cleanup_state=unknown
export RESTORE_DATABASE_NAME RESTORE_PRODUCTION_DATABASE_NAME
export RESTORE_BACKUP_KEY="$postgres_key"
export RESTORE_LOCAL_DIR="$work_dir/postgres-restore"
export RESTORE_RESULT_DIR="$work_dir/postgres-results"
bash "$SCRIPT_DIR/restore-postgres-from-b2.sh" >/dev/null

restore_stage=object-storage-restore
export RESTORE_OBJECT_STORAGE_MANIFEST_FILE="$object_manifest"
export RESTORE_OBJECT_STORAGE_CHECKSUM_FILE="$object_checksum"
export RESTORE_OBJECT_STORAGE_TARGET_BUCKET="$target_object_bucket"
export RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE=true
export RESTORE_OBJECT_STORAGE_LOCAL_DIR="$work_dir/object-restore"
bash "$SCRIPT_DIR/restore-object-storage-from-b2.sh" >/dev/null
restore_status=passed
restore_stage=completed
target_cleanup_state=cleaned
write_rehearsal_result passed
printf 'Company restore rehearsal passed for %s using %s.\n' \
  "$RESTORE_DATABASE_NAME" "$RESTORE_RECOVERY_SET_KEY"
