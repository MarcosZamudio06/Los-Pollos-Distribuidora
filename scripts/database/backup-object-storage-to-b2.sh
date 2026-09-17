#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=postgres-backup-common.sh
source "$SCRIPT_DIR/postgres-backup-common.sh"

BACKUP_DOCKER_BIN=${BACKUP_DOCKER_BIN:-docker}
BACKUP_UPLOAD_IMAGE=${BACKUP_UPLOAD_IMAGE:-amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7}
BACKUP_UPLOAD_NETWORK=${BACKUP_UPLOAD_NETWORK:-${BACKUP_COMPOSE_PROJECT_NAME:-}_app_network}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT%/}

COMPANY_SLUG=${COMPANY_SLUG:-${TENANT_SLUG:-}}
OBJECT_STORAGE_BUCKET=${OBJECT_STORAGE_BUCKET:-}
OBJECT_STORAGE_ENDPOINT=${OBJECT_STORAGE_ENDPOINT:-}
OBJECT_STORAGE_REGION=${OBJECT_STORAGE_REGION:-us-east-1}
OBJECT_STORAGE_ACCESS_KEY_ID=${OBJECT_STORAGE_ACCESS_KEY_ID:-}
OBJECT_STORAGE_SECRET_ACCESS_KEY=${OBJECT_STORAGE_SECRET_ACCESS_KEY:-}
OBJECT_STORAGE_BACKUP_LOCAL_DIR=${OBJECT_STORAGE_BACKUP_LOCAL_DIR:-${BACKUP_LOCAL_DIR:-/var/lib/pollos-distribuidor/object-storage-backups}}
OBJECT_STORAGE_FAILURE_DIR=${OBJECT_STORAGE_FAILURE_DIR:-$OBJECT_STORAGE_BACKUP_LOCAL_DIR/failed}
OBJECT_STORAGE_RESULT_DIR=${OBJECT_STORAGE_RESULT_DIR:-$OBJECT_STORAGE_BACKUP_LOCAL_DIR/results}
OBJECT_STORAGE_MIN_FREE_BYTES=${OBJECT_STORAGE_MIN_FREE_BYTES:-1073741824}

backup_require_env COMPANY_SLUG OBJECT_STORAGE_BUCKET OBJECT_STORAGE_ENDPOINT \
  OBJECT_STORAGE_ACCESS_KEY_ID OBJECT_STORAGE_SECRET_ACCESS_KEY \
  BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET \
  BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY BACKUP_UPLOAD_NETWORK
if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "COMPANY_SLUG must be a lowercase DNS-safe slug." >&2
  exit 2
fi
if [[ "$OBJECT_STORAGE_BUCKET" == "$BACKUP_S3_BUCKET" ||
  ! "$OBJECT_STORAGE_BUCKET" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ||
  ! "$OBJECT_STORAGE_ENDPOINT" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]]; then
  echo "Object Storage source settings are invalid or overlap the backup bucket." >&2
  exit 2
fi
backup_validate_s3_env
backup_validate_positive_integer OBJECT_STORAGE_MIN_FREE_BYTES "$OBJECT_STORAGE_MIN_FREE_BYTES"
mkdir -p "$OBJECT_STORAGE_BACKUP_LOCAL_DIR" "$OBJECT_STORAGE_RESULT_DIR" "$OBJECT_STORAGE_FAILURE_DIR"
backup_check_disk_space "$OBJECT_STORAGE_BACKUP_LOCAL_DIR" "$OBJECT_STORAGE_MIN_FREE_BYTES"

timestamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
run_suffix="$$-$RANDOM"
key="object-storage/$COMPANY_SLUG/$timestamp-$run_suffix.tar.gz"
manifest_key="$key.manifest.json"
checksum_key="$manifest_key.sha256"
stage_dir=$(mktemp -d "$OBJECT_STORAGE_BACKUP_LOCAL_DIR/.tmp.XXXXXX")
chmod 700 "$stage_dir"
archive_file="$stage_dir/objects.tar.gz"
manifest_file="$stage_dir/objects.manifest.json"
checksum_file="$stage_dir/objects.manifest.json.sha256"
remote_copy="$stage_dir/objects.remote.tar.gz"

cleanup() {
  local status=$?
  if (( status != 0 )) && [[ -s "$archive_file" ]]; then
    cp -- "$archive_file" "$OBJECT_STORAGE_FAILURE_DIR/$timestamp-$run_suffix.tar.gz.failed" 2>/dev/null || true
  fi
  rm -rf -- "$stage_dir"
  exit "$status"
}
trap cleanup EXIT

run_object_storage_aws() {
  AWS_ACCESS_KEY_ID="$OBJECT_STORAGE_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$OBJECT_STORAGE_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$OBJECT_STORAGE_REGION" \
  AWS_EC2_METADATA_DISABLED=true \
    "$BACKUP_DOCKER_BIN" run --rm --network "$BACKUP_UPLOAD_NETWORK" \
      -v "$stage_dir:/backup:rw" \
      -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
      -e AWS_EC2_METADATA_DISABLED \
      "$BACKUP_UPLOAD_IMAGE" "$@"
}

mkdir -p "$stage_dir/data"
run_object_storage_aws s3 sync "s3://$OBJECT_STORAGE_BUCKET" /backup/data \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" --only-show-errors
if find "$stage_dir/data" -type l -print -quit | grep -q .; then
  echo "Object Storage export contains an unsupported symbolic link." >&2
  exit 1
fi
tar -czf "$archive_file" -C "$stage_dir/data" .
size_bytes=$(backup_file_size "$archive_file")
if [[ ! "$size_bytes" =~ ^[1-9][0-9]*$ ]]; then
  echo "Object Storage archive is empty or invalid." >&2
  exit 1
fi
sha256=$(backup_sha256 "$archive_file")
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

backup_aws_cli_dir "$stage_dir" ro s3 cp \
  /backup/objects.tar.gz "s3://$BACKUP_S3_BUCKET/$key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
remote_size=$(backup_aws_cli_dir "$stage_dir" ro s3api head-object \
  --bucket "$BACKUP_S3_BUCKET" --key "$key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --query ContentLength --output text | tr -d '[:space:]')
if [[ "$remote_size" != "$size_bytes" ]]; then
  echo "Remote Object Storage archive size does not match the local archive." >&2
  exit 1
fi
backup_aws_cli_dir "$stage_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$key" /backup/objects.remote.tar.gz \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
if [[ "$(backup_file_size "$remote_copy")" != "$size_bytes" ||
  "$(backup_sha256 "$remote_copy")" != "$sha256" ]]; then
  echo "Downloaded Object Storage archive failed checksum verification." >&2
  exit 1
fi

python3 - "$manifest_file" "$COMPANY_SLUG" "$OBJECT_STORAGE_BUCKET" \
  "$key" "$manifest_key" "$created_at" "$size_bytes" "$sha256" <<'PY'
import json
import sys

path, company, bucket, key, manifest_key, created_at, size, checksum = sys.argv[1:]
payload = {
    "format": "company-object-storage-tar-v1",
    "company_slug": company,
    "source_bucket": bucket,
    "key": key,
    "manifest_key": manifest_key,
    "created_at": created_at,
    "size_bytes": int(size),
    "sha256": checksum,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, sort_keys=True, separators=(",", ":"))
    handle.write("\n")
PY
component_manifest_sha=$(backup_sha256 "$manifest_file")
printf '%s  %s\n' "$component_manifest_sha" "$(basename -- "$manifest_file")" > "$checksum_file"
backup_aws_cli_dir "$stage_dir" ro s3 cp \
  /backup/objects.manifest.json "s3://$BACKUP_S3_BUCKET/$manifest_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --content-type application/json \
  --only-show-errors >/dev/null
backup_aws_cli_dir "$stage_dir" ro s3 cp \
  /backup/objects.manifest.json.sha256 "s3://$BACKUP_S3_BUCKET/$checksum_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null

result_file="$OBJECT_STORAGE_RESULT_DIR/$timestamp-$run_suffix.json"
python3 - "$result_file" "$COMPANY_SLUG" "$key" "$manifest_key" \
  "$created_at" "$size_bytes" "$sha256" "$component_manifest_sha" <<'PY'
import json
import sys

path, company, key, manifest_key, created_at, size, checksum, manifest_checksum = sys.argv[1:]
payload = {
    "status": "validated",
    "company_slug": company,
    "key": key,
    "manifest_key": manifest_key,
    "created_at": created_at,
    "size_bytes": int(size),
    "sha256": checksum,
    "manifest_sha256": manifest_checksum,
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, sort_keys=True)
    handle.write("\n")
PY
chmod 600 "$result_file"
printf 'Object Storage backup validated: %s\n' "$key"
