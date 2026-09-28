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
OBJECT_STORAGE_SERVICE=${OBJECT_STORAGE_SERVICE:-object-storage}
OBJECT_STORAGE_REGION=${OBJECT_STORAGE_REGION:-us-east-1}
OBJECT_STORAGE_ACCESS_KEY_ID=${OBJECT_STORAGE_ACCESS_KEY_ID:-}
OBJECT_STORAGE_SECRET_ACCESS_KEY=${OBJECT_STORAGE_SECRET_ACCESS_KEY:-}
OBJECT_STORAGE_BACKUP_LOCAL_DIR=${OBJECT_STORAGE_BACKUP_LOCAL_DIR:-${BACKUP_LOCAL_DIR:-/var/lib/pollos-distribuidor/object-storage-backups}}
OBJECT_STORAGE_FAILURE_DIR=${OBJECT_STORAGE_FAILURE_DIR:-$OBJECT_STORAGE_BACKUP_LOCAL_DIR/failed}
OBJECT_STORAGE_RESULT_DIR=${OBJECT_STORAGE_RESULT_DIR:-$OBJECT_STORAGE_BACKUP_LOCAL_DIR/results}
OBJECT_STORAGE_MIN_FREE_BYTES=${OBJECT_STORAGE_MIN_FREE_BYTES:-1073741824}
BACKUP_FAILED_KEEP_COUNT=${BACKUP_FAILED_KEEP_COUNT:-1}

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
backup_validate_positive_integer BACKUP_FAILED_KEEP_COUNT "$BACKUP_FAILED_KEEP_COUNT"
if [[ "$OBJECT_STORAGE_BACKUP_LOCAL_DIR" == "/" ||
  "$OBJECT_STORAGE_FAILURE_DIR" == "/" ||
  "$OBJECT_STORAGE_RESULT_DIR" == "/" ]]; then
  printf '%s\n' 'Object Storage backup directories cannot be filesystem root.' >&2
  exit 2
fi
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
OBJECT_STORAGE_STAGE=preflight

prune_failed_attempts() {
  local keep_count=$BACKUP_FAILED_KEEP_COUNT
  local -a failure_records=()
  local -a failure_archives=()
  local item
  local index
  if [[ ! "$keep_count" =~ ^[1-9][0-9]*$ ]]; then
    keep_count=1
  fi
  while IFS= read -r item; do failure_records+=("$item"); done < <(
    find "$OBJECT_STORAGE_FAILURE_DIR" -maxdepth 1 -type f \
      -name '*.failure.json' -print 2>/dev/null | sort -r
  )
  for ((index = keep_count; index < ${#failure_records[@]}; index++)); do
    rm -f -- "${failure_records[index]}" \
      "${failure_records[index]%.failure.json}.tar.gz.failed" 2>/dev/null || true
  done
  while IFS= read -r item; do failure_archives+=("$item"); done < <(
    find "$OBJECT_STORAGE_FAILURE_DIR" -maxdepth 1 -type f \
      -name '*.tar.gz.failed' -print 2>/dev/null | sort -r
  )
  for ((index = keep_count; index < ${#failure_archives[@]}; index++)); do
    rm -f -- "${failure_archives[index]}" 2>/dev/null || true
  done
}

cleanup() {
  local status=$?
  local finished_at
  local failure_record
  trap - EXIT
  if (( status != 0 )); then
    local preserved=0
    finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    if [[ -s "$archive_file" ]] &&
      cp -- "$archive_file" "$OBJECT_STORAGE_FAILURE_DIR/$timestamp-$run_suffix.tar.gz.failed" 2>/dev/null; then
      preserved=1
      chmod 600 "$OBJECT_STORAGE_FAILURE_DIR/$timestamp-$run_suffix.tar.gz.failed" 2>/dev/null || true
    fi
    failure_record="$OBJECT_STORAGE_FAILURE_DIR/$timestamp-$run_suffix.failure.json"
    python3 - "$OBJECT_STORAGE_FAILURE_DIR/$timestamp-$run_suffix.failure.json" \
      "$COMPANY_SLUG" "$timestamp" "$finished_at" "$OBJECT_STORAGE_STAGE" \
      "$status" "$preserved" <<'PY' 2>/dev/null || true
import json
import os
import sys

path, company, started, finished, stage, exit_code, archive_preserved = sys.argv[1:]
payload = {
    "company_slug": company,
    "started_at": started,
    "finished_at": finished,
    "failure_stage": stage,
    "exit_code": int(exit_code),
    "archive_preserved": archive_preserved == "1",
}
temporary = path + ".tmp"
descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, sort_keys=True)
    handle.write("\n")
os.replace(temporary, path)
os.chmod(path, 0o600)
PY
    rm -f -- "$failure_record.tmp" 2>/dev/null || true
    prune_failed_attempts
  fi
  if [[ -n "$stage_dir" && -d "$stage_dir" ]]; then
    rm -rf -- "$stage_dir"
  fi
  exit "$status"
}
trap cleanup EXIT

run_object_storage_aws() {
  backup_object_storage_cli_dir "$stage_dir" rw "$@"
}

backup_assert_object_storage_ready

OBJECT_STORAGE_STAGE=space-preflight
bash "$SCRIPT_DIR/preflight-object-storage-backup-space.sh" \
  "$OBJECT_STORAGE_BACKUP_LOCAL_DIR" "$OBJECT_STORAGE_MIN_FREE_BYTES" \
  "$BACKUP_UPLOAD_NETWORK" "$BACKUP_UPLOAD_IMAGE" "$BACKUP_DOCKER_BIN"

OBJECT_STORAGE_STAGE=export-objects
mkdir -p "$stage_dir/data"
run_object_storage_aws s3 sync "s3://$OBJECT_STORAGE_BUCKET" /backup/data \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" --only-show-errors
if find "$stage_dir/data" -type l -print -quit | grep -q .; then
  echo "Object Storage export contains an unsupported symbolic link." >&2
  exit 1
fi
OBJECT_STORAGE_STAGE=archive-objects
tar -czf "$archive_file" -C "$stage_dir/data" .
size_bytes=$(backup_file_size "$archive_file")
if [[ ! "$size_bytes" =~ ^[1-9][0-9]*$ ]]; then
  echo "Object Storage archive is empty or invalid." >&2
  exit 1
fi
sha256=$(backup_sha256 "$archive_file")
created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

OBJECT_STORAGE_STAGE=upload-archive
backup_aws_cli_dir "$stage_dir" ro s3 cp \
  /backup/objects.tar.gz "s3://$BACKUP_S3_BUCKET/$key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
OBJECT_STORAGE_STAGE=verify-remote-archive
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

OBJECT_STORAGE_STAGE=upload-component-manifests
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
OBJECT_STORAGE_STAGE=validated
printf 'Object Storage backup validated: %s\n' "$key"
