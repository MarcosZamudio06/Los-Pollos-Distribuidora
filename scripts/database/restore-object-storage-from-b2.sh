#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=postgres-backup-common.sh
source "$SCRIPT_DIR/postgres-backup-common.sh"

BACKUP_DOCKER_BIN=${BACKUP_DOCKER_BIN:-docker}
BACKUP_UPLOAD_IMAGE=${BACKUP_UPLOAD_IMAGE:-amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7}
BACKUP_UPLOAD_NETWORK=${BACKUP_UPLOAD_NETWORK:-}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT%/}

COMPANY_SLUG=${COMPANY_SLUG:-${TENANT_SLUG:-}}
RESTORE_OBJECT_STORAGE_MANIFEST_FILE=${RESTORE_OBJECT_STORAGE_MANIFEST_FILE:-}
RESTORE_OBJECT_STORAGE_MANIFEST_KEY=${RESTORE_OBJECT_STORAGE_MANIFEST_KEY:-}
RESTORE_OBJECT_STORAGE_CHECKSUM_FILE=${RESTORE_OBJECT_STORAGE_CHECKSUM_FILE:-}
RESTORE_OBJECT_STORAGE_TARGET_BUCKET=${RESTORE_OBJECT_STORAGE_TARGET_BUCKET:-}
RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE=${RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE:-false}
RESTORE_REQUIRE_STORAGE_REFERENCE_CHECK=${RESTORE_REQUIRE_STORAGE_REFERENCE_CHECK:-false}
RESTORE_OBJECT_STORAGE_REFERENCE_RESULT_FILE=${RESTORE_OBJECT_STORAGE_REFERENCE_RESULT_FILE:-}
RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE=${RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE:-}
RESTORE_OBJECT_STORAGE_RESTORED_AT_FILE=${RESTORE_OBJECT_STORAGE_RESTORED_AT_FILE:-}
RESTORE_RECOVERY_SET_MANIFEST_FILE=${RESTORE_RECOVERY_SET_MANIFEST_FILE:-}
RESTORE_DATABASE_NAME=${RESTORE_DATABASE_NAME:-}
RESTORE_PRODUCTION_DATABASE_NAME=${RESTORE_PRODUCTION_DATABASE_NAME:-${BACKUP_POSTGRES_DATABASE:-}}
BACKUP_POSTGRES_USER=${BACKUP_POSTGRES_USER:-${POSTGRES_USER:-postgres}}
BACKUP_POSTGRES_PASSWORD=${BACKUP_POSTGRES_PASSWORD:-${POSTGRES_PASSWORD:-}}
OBJECT_STORAGE_ENDPOINT=${OBJECT_STORAGE_ENDPOINT:-}
OBJECT_STORAGE_REGION=${OBJECT_STORAGE_REGION:-us-east-1}
RESTORE_OBJECT_STORAGE_ACCESS_KEY_ID=${RESTORE_OBJECT_STORAGE_ACCESS_KEY_ID:-${OBJECT_STORAGE_ACCESS_KEY_ID:-}}
RESTORE_OBJECT_STORAGE_SECRET_ACCESS_KEY=${RESTORE_OBJECT_STORAGE_SECRET_ACCESS_KEY:-${OBJECT_STORAGE_SECRET_ACCESS_KEY:-}}
RESTORE_OBJECT_STORAGE_LOCAL_DIR=${RESTORE_OBJECT_STORAGE_LOCAL_DIR:-/var/tmp/pollos-distribuidor/object-storage-restore}

backup_require_env COMPANY_SLUG BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET \
  BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY BACKUP_UPLOAD_NETWORK \
  RESTORE_OBJECT_STORAGE_TARGET_BUCKET OBJECT_STORAGE_ENDPOINT \
  RESTORE_OBJECT_STORAGE_ACCESS_KEY_ID RESTORE_OBJECT_STORAGE_SECRET_ACCESS_KEY
if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ||
  "$RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE" != true ||
  ! "$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" =~ ^mte-restore-[a-z0-9]+(-[a-z0-9]+)*$ ||
  ! "$OBJECT_STORAGE_ENDPOINT" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]]; then
  echo "Restore requires a company-scoped disposable Object Storage target." >&2
  exit 2
fi
case "$RESTORE_REQUIRE_STORAGE_REFERENCE_CHECK" in
  true|false) ;;
  *) printf '%s\n' 'RESTORE_REQUIRE_STORAGE_REFERENCE_CHECK must be true or false.' >&2; exit 2 ;;
esac
if [[ "$RESTORE_REQUIRE_STORAGE_REFERENCE_CHECK" == true ]]; then
  backup_require_env RESTORE_DATABASE_NAME RESTORE_PRODUCTION_DATABASE_NAME \
    RESTORE_RECOVERY_SET_MANIFEST_FILE RESTORE_OBJECT_STORAGE_REFERENCE_RESULT_FILE \
    RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE BACKUP_COMPOSE_FILE BACKUP_POSTGRES_USER
  backup_validate_database_name RESTORE_DATABASE_NAME "$RESTORE_DATABASE_NAME"
  backup_validate_database_name RESTORE_PRODUCTION_DATABASE_NAME "$RESTORE_PRODUCTION_DATABASE_NAME"
  if [[ "$RESTORE_DATABASE_NAME" == "$RESTORE_PRODUCTION_DATABASE_NAME" ||
    "$RESTORE_DATABASE_NAME" == "$BACKUP_POSTGRES_DATABASE" ||
    "$RESTORE_DATABASE_NAME" != *_restore_drill ||
    ! "$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" =~ ^mte-restore-${COMPANY_SLUG}-[0-9]{14}-[0-9]+$ ||
    ! -f "$RESTORE_RECOVERY_SET_MANIFEST_FILE" || -L "$RESTORE_RECOVERY_SET_MANIFEST_FILE" ||
    -e "$RESTORE_OBJECT_STORAGE_REFERENCE_RESULT_FILE" || -L "$RESTORE_OBJECT_STORAGE_REFERENCE_RESULT_FILE" ||
    -e "$RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE" || -L "$RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE" ]]; then
    printf '%s\n' 'Cross-reference verification requires company-matched disposable restore targets.' >&2
    exit 2
  fi
fi
backup_validate_s3_env
mkdir -p "$RESTORE_OBJECT_STORAGE_LOCAL_DIR"
work_dir=$(mktemp -d "$RESTORE_OBJECT_STORAGE_LOCAL_DIR/.tmp.XXXXXX")
chmod 700 "$work_dir"
manifest_file="$RESTORE_OBJECT_STORAGE_MANIFEST_FILE"
checksum_file=${RESTORE_OBJECT_STORAGE_CHECKSUM_FILE:-$work_dir/object-manifest.sha256}
archive_file="$work_dir/object-storage.tar.gz"
created_target=0
target_cleanup_state=not-created

run_backup_aws() {
  backup_aws_cli_dir "$work_dir" rw "$@"
}

run_target_aws() {
  AWS_ACCESS_KEY_ID="$RESTORE_OBJECT_STORAGE_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$RESTORE_OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$OBJECT_STORAGE_REGION" \
  AWS_EC2_METADATA_DISABLED=true \
    "$BACKUP_DOCKER_BIN" run --rm --network "$BACKUP_UPLOAD_NETWORK" \
      -v "$work_dir:/backup:rw" \
      -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
      -e AWS_EC2_METADATA_DISABLED \
      "$BACKUP_UPLOAD_IMAGE" "$@"
}

run_target_aws_script() {
  AWS_ACCESS_KEY_ID="$RESTORE_OBJECT_STORAGE_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$RESTORE_OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$OBJECT_STORAGE_REGION" \
  AWS_EC2_METADATA_DISABLED=true \
    "$BACKUP_DOCKER_BIN" run --rm --network "$BACKUP_UPLOAD_NETWORK" \
      -v "$work_dir:/backup:rw" \
      -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
      -e AWS_EC2_METADATA_DISABLED --entrypoint /bin/sh \
      "$BACKUP_UPLOAD_IMAGE" "$@"
}

write_cleanup_result() {
  if [[ -z "$RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE" ]]; then
    return 0
  fi
  python3 - "$RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE" "$target_cleanup_state" <<'PY'
import json
import sys

with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump({"status": sys.argv[2]}, handle, sort_keys=True)
    handle.write("\n")
PY
  chmod 600 "$RESTORE_OBJECT_STORAGE_CLEANUP_RESULT_FILE"
}

cleanup() {
  local status=$?
  if (( created_target == 1 )); then
    target_cleanup_state=cleaning
    if ! run_target_aws s3 rm "s3://$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" \
      --recursive --endpoint-url "$OBJECT_STORAGE_ENDPOINT" --only-show-errors >/dev/null 2>&1 ||
      ! run_target_aws s3 rb "s3://$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" \
        --endpoint-url "$OBJECT_STORAGE_ENDPOINT" >/dev/null 2>&1; then
      target_cleanup_state=failed
      echo "Disposable Object Storage cleanup failed for company $COMPANY_SLUG." >&2
      status=1
    else
      target_cleanup_state=cleaned
    fi
  fi
  if ! write_cleanup_result; then
    echo "Disposable Object Storage cleanup evidence could not be recorded." >&2
    status=1
  fi
  rm -rf -- "$work_dir"
  exit "$status"
}
trap cleanup EXIT

if [[ -z "$manifest_file" ]]; then
  if [[ -z "$RESTORE_OBJECT_STORAGE_MANIFEST_KEY" ]]; then
    echo "A recovery object manifest file or key is required." >&2
    exit 2
  fi
  manifest_file="$work_dir/object-storage.manifest.json"
  run_backup_aws s3 cp "s3://$BACKUP_S3_BUCKET/$RESTORE_OBJECT_STORAGE_MANIFEST_KEY" \
    /backup/object-storage.manifest.json --endpoint-url "$BACKUP_S3_ENDPOINT" \
    --only-show-errors >/dev/null
  run_backup_aws s3 cp \
    "s3://$BACKUP_S3_BUCKET/$RESTORE_OBJECT_STORAGE_MANIFEST_KEY.sha256" \
    /backup/object-manifest.sha256 --endpoint-url "$BACKUP_S3_ENDPOINT" \
    --only-show-errors >/dev/null
  checksum_file="$work_dir/object-manifest.sha256"
else
  if [[ ! -f "$manifest_file" || -L "$manifest_file" ]]; then
    echo "Object Storage component manifest is missing or unsafe." >&2
    exit 1
  fi
  if [[ -z "$checksum_file" || ! -f "$checksum_file" || -L "$checksum_file" ]]; then
    echo "Object Storage component manifest checksum is missing or unsafe." >&2
    exit 1
  fi
fi

node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-object \
  --manifest "$manifest_file" --checksum "$checksum_file" \
  --expected-company "$COMPANY_SLUG" >/dev/null
manifest_values=$(python3 - "$manifest_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
print("\t".join([str(data["key"]), str(data["manifest_key"]), str(data["source_bucket"])]))
PY
)
IFS=$'\t' read -r archive_key component_manifest_key source_bucket <<< "$manifest_values"
if [[ "$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" == "$source_bucket" ]]; then
  echo "Restore Object Storage target must differ from the source bucket." >&2
  exit 2
fi
run_backup_aws s3 cp "s3://$BACKUP_S3_BUCKET/$archive_key" \
  /backup/object-storage.tar.gz --endpoint-url "$BACKUP_S3_ENDPOINT" \
  --only-show-errors >/dev/null
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-object \
  --manifest "$manifest_file" --checksum "$checksum_file" \
  --expected-company "$COMPANY_SLUG" --archive "$archive_file" >/dev/null

python3 - "$archive_file" <<'PY'
import pathlib
import sys
import tarfile

archive = pathlib.Path(sys.argv[1])
with tarfile.open(archive, "r:gz") as tar:
    for member in tar.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if (path.is_absolute() or ".." in path.parts or member.issym()
                or member.islnk() or not (member.isdir() or member.isfile())):
            raise SystemExit("OBJECT_STORAGE_ARCHIVE_PATH_INVALID")
PY
mkdir -p "$work_dir/data" "$work_dir/verify"
tar -xzf "$archive_file" --no-same-owner --no-same-permissions -C "$work_dir/data"

bucket_list="$work_dir/buckets.json"
run_target_aws s3api list-buckets --endpoint-url "$OBJECT_STORAGE_ENDPOINT" \
  --output json > "$bucket_list"
bucket_exists=$(node - "$bucket_list" "$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" <<'NODE'
const { readFileSync } = require("node:fs");
const data = JSON.parse(readFileSync(process.argv[2], "utf8"));
process.stdout.write((data.Buckets ?? []).some((bucket) => bucket.Name === process.argv[3]) ? "yes" : "no");
NODE
)
if [[ "$bucket_exists" == "yes" ]]; then
  echo "Disposable Object Storage target bucket already exists." >&2
  exit 2
fi
run_target_aws s3 mb "s3://$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" >/dev/null
created_target=1
run_target_aws s3 sync /backup/data "s3://$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" --only-show-errors
run_target_aws s3 sync "s3://$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" /backup/verify \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" --only-show-errors
if ! diff -r -- "$work_dir/data" "$work_dir/verify" >/dev/null; then
  echo "Restored disposable Object Storage contents do not match the recovery archive." >&2
  exit 1
fi

if [[ -n "$RESTORE_OBJECT_STORAGE_RESTORED_AT_FILE" ]]; then
  if [[ -e "$RESTORE_OBJECT_STORAGE_RESTORED_AT_FILE" || -L "$RESTORE_OBJECT_STORAGE_RESTORED_AT_FILE" ]]; then
    echo 'Object Storage restore timing target already exists.' >&2
    exit 2
  fi
  date -u +%Y-%m-%dT%H:%M:%SZ > "$RESTORE_OBJECT_STORAGE_RESTORED_AT_FILE"
fi

if [[ "$RESTORE_REQUIRE_STORAGE_REFERENCE_CHECK" == true ]]; then
  BACKUP_STAGE=storage-reference-query
  reference_rows="$work_dir/storage-reference-rows.json"
  reference_sql=$(cat <<'SQL'
SELECT json_build_object(
  'companyBranding', COALESCE((
    SELECT json_agg(json_build_object(
      'logoObjectKey', "logoObjectKey",
      'logoMimeType', "logoMimeType"
    ) ORDER BY "id")
    FROM "CompanyBranding"
    WHERE "logoObjectKey" IS NOT NULL
  ), '[]'::json),
  'deliveryEvidence', COALESCE((
    SELECT json_agg(json_build_object(
      'storageKey', "storageKey",
      'mimeType', "mimeType",
      'sha256', "sha256",
      'sizeBytes', "sizeBytes"
    ) ORDER BY "storageKey")
    FROM "DeliveryEvidence"
    WHERE "storageKey" IS NOT NULL
  ), '[]'::json),
  'fiscalArtifacts', COALESCE((
    SELECT json_agg(json_build_object(
      'storageKey', "storageKey",
      'mimeType', "mimeType",
      'sha256', "sha256",
      'byteSize', "byteSize"::text,
      'status', "status"
    ) ORDER BY "storageKey")
    FROM "FiscalArtifact"
    WHERE "status" = 'AVAILABLE'
  ), '[]'::json)
)::text;
SQL
)
  backup_compose_pg psql --username="$BACKUP_POSTGRES_USER" \
    --dbname="$RESTORE_DATABASE_NAME" --no-psqlrc --set ON_ERROR_STOP=1 \
    --tuples-only --no-align --quiet --command="$reference_sql" > "$reference_rows"

  BACKUP_STAGE=storage-reference-head
  mkdir -m 700 "$work_dir/reference-head"
  node "$SCRIPT_DIR/recovery-storage-reference-verifier.mjs" plan-head-checks \
    --references "$reference_rows" \
    --bucket "$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" \
    --endpoint "${OBJECT_STORAGE_ENDPOINT%/}" \
    --region "$OBJECT_STORAGE_REGION" \
    --script "$work_dir/head-reference-objects.sh" >/dev/null
  run_target_aws_script /backup/head-reference-objects.sh

  BACKUP_STAGE=storage-reference-verification
  node "$SCRIPT_DIR/recovery-storage-reference-verifier.mjs" verify \
    --expected-company "$COMPANY_SLUG" \
    --recovery-set "$RESTORE_RECOVERY_SET_MANIFEST_FILE" \
    --restore-database "$RESTORE_DATABASE_NAME" \
    --production-database "$RESTORE_PRODUCTION_DATABASE_NAME" \
    --target-bucket "$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" \
    --restored-objects-dir "$work_dir/verify" \
    --references "$reference_rows" \
    --head-directory "$work_dir/reference-head" \
    --result "$RESTORE_OBJECT_STORAGE_REFERENCE_RESULT_FILE"
fi

printf 'Object Storage restore rehearsal passed for company=%s target=%s source=%s\n' \
  "$COMPANY_SLUG" "$RESTORE_OBJECT_STORAGE_TARGET_BUCKET" "$archive_key"
