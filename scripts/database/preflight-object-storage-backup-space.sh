#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=postgres-backup-common.sh
source "$SCRIPT_DIR/postgres-backup-common.sh"

OBJECT_STORAGE_BACKUP_LOCAL_DIR=${1:-${OBJECT_STORAGE_BACKUP_LOCAL_DIR:-/var/lib/pollos-distribuidor/object-storage-backups}}
OBJECT_STORAGE_MIN_FREE_BYTES=${2:-${OBJECT_STORAGE_MIN_FREE_BYTES:-1073741824}}
BACKUP_UPLOAD_NETWORK=${3:-${BACKUP_UPLOAD_NETWORK:-}}
BACKUP_UPLOAD_IMAGE=${4:-${BACKUP_UPLOAD_IMAGE:-amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7}}
BACKUP_DOCKER_BIN=${5:-${BACKUP_DOCKER_BIN:-docker}}
OBJECT_STORAGE_ENDPOINT=${OBJECT_STORAGE_ENDPOINT:-}
OBJECT_STORAGE_BUCKET=${OBJECT_STORAGE_BUCKET:-}
OBJECT_STORAGE_REGION=${OBJECT_STORAGE_REGION:-us-east-1}
OBJECT_STORAGE_ACCESS_KEY_ID=${OBJECT_STORAGE_ACCESS_KEY_ID:-}
OBJECT_STORAGE_SECRET_ACCESS_KEY=${OBJECT_STORAGE_SECRET_ACCESS_KEY:-}

backup_require_env OBJECT_STORAGE_ENDPOINT OBJECT_STORAGE_BUCKET \
  OBJECT_STORAGE_ACCESS_KEY_ID OBJECT_STORAGE_SECRET_ACCESS_KEY \
  BACKUP_UPLOAD_NETWORK
backup_validate_positive_integer OBJECT_STORAGE_MIN_FREE_BYTES \
  "$OBJECT_STORAGE_MIN_FREE_BYTES"
if [[ "$OBJECT_STORAGE_BACKUP_LOCAL_DIR" == "/" ||
  ! "$OBJECT_STORAGE_BUCKET" =~ ^[a-z0-9][a-z0-9.-]*[a-z0-9]$ ||
  ! "$OBJECT_STORAGE_ENDPOINT" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]]; then
  printf '%s\n' 'Object Storage space preflight configuration is invalid.' >&2
  exit 2
fi

mkdir -p -- "$OBJECT_STORAGE_BACKUP_LOCAL_DIR"
backup_check_disk_space "$OBJECT_STORAGE_BACKUP_LOCAL_DIR" \
  "$OBJECT_STORAGE_MIN_FREE_BYTES"
inventory_dir=$(mktemp -d "$OBJECT_STORAGE_BACKUP_LOCAL_DIR/.space-check.XXXXXX")
chmod 700 "$inventory_dir"
cleanup() {
  local status=$?
  trap - EXIT
  rm -rf -- "$inventory_dir"
  exit "$status"
}
trap cleanup EXIT

object_usage=$(backup_object_storage_cli_dir "$inventory_dir" ro \
  s3api list-objects-v2 --bucket "$OBJECT_STORAGE_BUCKET" \
  --endpoint-url "${OBJECT_STORAGE_ENDPOINT%/}" \
  --query 'Contents[].Size' --output text --no-cli-pager |
  python3 -c '
import re
import sys

total_bytes = 0
object_count = 0
for line in sys.stdin:
    for value in line.split():
        if value in {"None", "null"}:
            continue
        if re.fullmatch(r"[0-9]+", value) is None:
            print("Object Storage size inventory returned an invalid value.", file=sys.stderr)
            raise SystemExit(2)
        total_bytes += int(value)
        object_count += 1
print(f"{total_bytes}\t{object_count}")
')
IFS=$'\t' read -r source_bytes object_count <<< "$object_usage"
available_bytes=$(df -Pk "$OBJECT_STORAGE_BACKUP_LOCAL_DIR" |
  awk 'NR == 2 { printf "%.0f", $4 * 1024 }')
if [[ ! "$source_bytes" =~ ^[0-9]+$ || ! "$object_count" =~ ^[0-9]+$ ||
  ! "$available_bytes" =~ ^[0-9]+$ ]]; then
  printf '%s\n' 'Object Storage staging capacity could not be measured.' >&2
  exit 2
fi

if ! python3 - "$source_bytes" "$object_count" \
  "$OBJECT_STORAGE_MIN_FREE_BYTES" "$available_bytes" <<'PY'
import sys

source_bytes, object_count, minimum_free_bytes, available_bytes = map(int, sys.argv[1:])
# Reserve one percent for gzip expansion, 4 KiB per tar entry, and a fixed
# archive/header allowance. Peak scratch use is source + local archive + the
# downloaded archive used for end-to-end remote checksum verification.
archive_upper_bound = (
    source_bytes
    + (source_bytes + 99) // 100
    + object_count * 4096
    + 1024 * 1024
)
required_bytes = source_bytes + (2 * archive_upper_bound) + minimum_free_bytes
if available_bytes < required_bytes:
    print("Insufficient free local space for safe Object Storage backup staging.", file=sys.stderr)
    raise SystemExit(1)
PY
then
  exit 1
fi
