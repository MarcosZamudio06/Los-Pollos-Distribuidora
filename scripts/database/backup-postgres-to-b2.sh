#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=postgres-backup-common.sh
source "$SCRIPT_DIR/postgres-backup-common.sh"

BACKUP_STAGE=startup
BACKUP_DOCKER_BIN=${BACKUP_DOCKER_BIN:-docker}
BACKUP_COMPOSE_FILE=${BACKUP_COMPOSE_FILE:-docker-compose.production.yml}
BACKUP_POSTGRES_SERVICE=${BACKUP_POSTGRES_SERVICE:-postgres}
BACKUP_POSTGRES_USER=${BACKUP_POSTGRES_USER:-${POSTGRES_USER:-postgres}}
BACKUP_POSTGRES_DATABASE=${BACKUP_POSTGRES_DATABASE:-${POSTGRES_DB:-pollo_distribucion}}
BACKUP_POSTGRES_PASSWORD=${BACKUP_POSTGRES_PASSWORD:-${POSTGRES_PASSWORD:-}}
BACKUP_UPLOAD_IMAGE=${BACKUP_UPLOAD_IMAGE:-amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7}
BACKUP_LOCAL_DIR=${BACKUP_LOCAL_DIR:-/var/lib/pollos-distribuidor/postgres-backups}
BACKUP_FAILURE_DIR=${BACKUP_FAILURE_DIR:-$BACKUP_LOCAL_DIR/failed}
BACKUP_RESULT_DIR=${BACKUP_RESULT_DIR:-$BACKUP_LOCAL_DIR/results}
BACKUP_MIN_FREE_BYTES=${BACKUP_MIN_FREE_BYTES:-1073741824}
BACKUP_FAILED_KEEP_COUNT=${BACKUP_FAILED_KEEP_COUNT:-1}
BACKUP_RETENTION_DAILY=${BACKUP_RETENTION_DAILY:-14}
BACKUP_RETENTION_WEEKLY=${BACKUP_RETENTION_WEEKLY:-8}
BACKUP_RETENTION_MONTHLY=${BACKUP_RETENTION_MONTHLY:-6}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT%/}

temp_dir=
dump_file=
manifest_file=
timestamp=

preserve_failed_dump() {
  local source_file=${1:-}
  local source_manifest=${2:-}
  local preserved_dump
  local preserved_manifest
  local -a old_files=()
  local index

  if [[ -z "$source_file" || ! -s "$source_file" ]]; then
    return 0
  fi

  mkdir -p "$BACKUP_FAILURE_DIR" 2>/dev/null || return 0
  preserved_dump="$BACKUP_FAILURE_DIR/${timestamp:-failed}.dump.failed"
  preserved_manifest="$BACKUP_FAILURE_DIR/${timestamp:-failed}.manifest.json.failed"
  cp -- "$source_file" "$preserved_dump" 2>/dev/null || true
  if [[ -n "$source_manifest" && -s "$source_manifest" ]]; then
    cp -- "$source_manifest" "$preserved_manifest" 2>/dev/null || true
  fi

  while IFS= read -r preserved_dump; do
    old_files+=("$preserved_dump")
  done < <(find "$BACKUP_FAILURE_DIR" -maxdepth 1 -type f -name '*.dump.failed' -print 2>/dev/null | sort -r)

  for ((index = BACKUP_FAILED_KEEP_COUNT; index < ${#old_files[@]}; index++)); do
    rm -f -- "${old_files[index]}" 2>/dev/null || true
    rm -f -- "${old_files[index]%.dump.failed}.manifest.json.failed" 2>/dev/null || true
  done
}

on_exit() {
  local exit_code=$?

  if (( exit_code != 0 )); then
    preserve_failed_dump "$dump_file" "$manifest_file"
  fi

  if [[ -n "$temp_dir" && -d "$temp_dir" ]]; then
    rm -rf -- "$temp_dir" 2>/dev/null || true
  fi

  exit "$exit_code"
}

trap on_exit EXIT

backup_require_env BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET \
  BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY
backup_validate_s3_env
backup_validate_database_name BACKUP_POSTGRES_USER "$BACKUP_POSTGRES_USER"
backup_validate_database_name BACKUP_POSTGRES_DATABASE "$BACKUP_POSTGRES_DATABASE"
backup_validate_positive_integer BACKUP_MIN_FREE_BYTES "$BACKUP_MIN_FREE_BYTES"
backup_validate_positive_integer BACKUP_FAILED_KEEP_COUNT "$BACKUP_FAILED_KEEP_COUNT"
backup_validate_non_negative_integer BACKUP_RETENTION_DAILY "$BACKUP_RETENTION_DAILY"
backup_validate_non_negative_integer BACKUP_RETENTION_WEEKLY "$BACKUP_RETENTION_WEEKLY"
backup_validate_non_negative_integer BACKUP_RETENTION_MONTHLY "$BACKUP_RETENTION_MONTHLY"

if [[ "$BACKUP_LOCAL_DIR" == "/" || "$BACKUP_FAILURE_DIR" == "/" || "$BACKUP_RESULT_DIR" == "/" ]]; then
  printf '%s\n' 'Backup directories cannot be filesystem root.' >&2
  exit 2
fi

if [[ ! -f "$BACKUP_COMPOSE_FILE" ]]; then
  printf 'Compose file not found: %s\n' "$BACKUP_COMPOSE_FILE" >&2
  exit 2
fi

if ! command -v "$BACKUP_DOCKER_BIN" >/dev/null 2>&1; then
  printf 'Docker executable not found: %s\n' "$BACKUP_DOCKER_BIN" >&2
  exit 2
fi

mkdir -p "$BACKUP_LOCAL_DIR" "$BACKUP_RESULT_DIR"
backup_check_disk_space "$BACKUP_LOCAL_DIR" "$BACKUP_MIN_FREE_BYTES"

BACKUP_STAGE=compose-preflight
if ! backup_compose ps --status running --services | grep -Fxq "$BACKUP_POSTGRES_SERVICE"; then
  backup_die
fi
if ! backup_compose_pg pg_isready -U "$BACKUP_POSTGRES_USER" -d "$BACKUP_POSTGRES_DATABASE" >/dev/null; then
  backup_die
fi

timestamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
year=${timestamp:0:4}
month=${timestamp:5:2}
key="postgres/$year/$month/$timestamp.dump"
manifest_key="${key%.dump}.manifest.json"

temp_dir=$(mktemp -d "$BACKUP_LOCAL_DIR/.tmp.XXXXXX")
dump_file="$temp_dir/$timestamp.dump"
manifest_file="$temp_dir/$timestamp.manifest.json"
dump_basename=$(basename -- "$dump_file")
manifest_basename=$(basename -- "$manifest_file")

BACKUP_STAGE=pg-dump
if ! backup_compose_pg pg_dump \
  --username="$BACKUP_POSTGRES_USER" \
  --dbname="$BACKUP_POSTGRES_DATABASE" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-acl > "$dump_file"; then
  backup_die
fi

dump_size=$(backup_file_size "$dump_file")
if (( dump_size < 1 )); then
  printf '%s\n' 'pg_dump produced an empty file.' >&2
  exit 1
fi

if ! backup_compose_pg pg_restore --list < "$dump_file" >/dev/null; then
  printf '%s\n' 'pg_dump output is not a readable PostgreSQL custom archive.' >&2
  exit 1
fi

dump_sha256=$(backup_sha256 "$dump_file")
cat > "$manifest_file" <<EOF
{
  "format": "postgresql-custom",
  "key": "$key",
  "created_at": "$timestamp",
  "database": "$BACKUP_POSTGRES_DATABASE",
  "size_bytes": $dump_size,
  "sha256": "$dump_sha256"
}
EOF

s3_endpoint_args=(--endpoint-url "$BACKUP_S3_ENDPOINT")

BACKUP_STAGE=upload-dump
backup_aws_cli_dir "$temp_dir" ro s3 cp \
  "/backup/$dump_basename" \
  "s3://$BACKUP_S3_BUCKET/$key" \
  "${s3_endpoint_args[@]}" \
  --only-show-errors >/dev/null

BACKUP_STAGE=upload-manifest
backup_aws_cli_dir "$temp_dir" ro s3 cp \
  "/backup/$manifest_basename" \
  "s3://$BACKUP_S3_BUCKET/$manifest_key" \
  "${s3_endpoint_args[@]}" \
  --content-type application/json \
  --only-show-errors >/dev/null

BACKUP_STAGE=verify-remote-object
remote_size=$(backup_aws_cli_dir "$temp_dir" ro s3api head-object \
  --bucket "$BACKUP_S3_BUCKET" \
  --key "$key" \
  "${s3_endpoint_args[@]}" \
  --query ContentLength \
  --output text | tr -d '[:space:]')
if [[ "$remote_size" != "$dump_size" ]]; then
  printf '%s\n' 'Remote PostgreSQL backup size does not match the local dump.' >&2
  exit 1
fi

manifest_size=$(backup_aws_cli_dir "$temp_dir" ro s3api head-object \
  --bucket "$BACKUP_S3_BUCKET" \
  --key "$manifest_key" \
  "${s3_endpoint_args[@]}" \
  --query ContentLength \
  --output text | tr -d '[:space:]')
if [[ ! "$manifest_size" =~ ^[1-9][0-9]*$ ]]; then
  printf '%s\n' 'Remote PostgreSQL backup manifest is empty or missing.' >&2
  exit 1
fi

BACKUP_STAGE=verify-remote-checksum
verified_file="$temp_dir/$timestamp.remote.dump"
backup_aws_cli_dir "$temp_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$key" \
  "/backup/$(basename -- "$verified_file")" \
  "${s3_endpoint_args[@]}" \
  --only-show-errors >/dev/null
verified_size=$(backup_file_size "$verified_file")
verified_sha256=$(backup_sha256 "$verified_file")
if [[ "$verified_size" != "$dump_size" || "$verified_sha256" != "$dump_sha256" ]]; then
  printf '%s\n' 'Downloaded remote PostgreSQL backup failed local checksum verification.' >&2
  exit 1
fi

BACKUP_STAGE=retention-list
object_list="$temp_dir/object-list.json"
backup_aws_cli_dir "$temp_dir" rw s3api list-objects-v2 \
  --bucket "$BACKUP_S3_BUCKET" \
  --prefix postgres/ \
  "${s3_endpoint_args[@]}" \
  --output json > "$object_list"

delete_list="$temp_dir/delete-list.txt"
python3 "$SCRIPT_DIR/select-postgres-backup-retention.py" \
  --input "$object_list" \
  --daily "$BACKUP_RETENTION_DAILY" \
  --weekly "$BACKUP_RETENTION_WEEKLY" \
  --monthly "$BACKUP_RETENTION_MONTHLY" > "$delete_list"

BACKUP_STAGE=retention-delete
while IFS= read -r old_key; do
  [[ -z "$old_key" ]] && continue
  if [[ "$old_key" == "$key" ]]; then
    printf '%s\n' 'Retention selector attempted to delete the newest valid backup.' >&2
    exit 1
  fi
  backup_aws_cli_dir "$temp_dir" ro s3 rm \
    "s3://$BACKUP_S3_BUCKET/$old_key" \
    "${s3_endpoint_args[@]}" \
    --only-show-errors >/dev/null
  backup_aws_cli_dir "$temp_dir" ro s3 rm \
    "s3://$BACKUP_S3_BUCKET/${old_key%.dump}.manifest.json" \
    "${s3_endpoint_args[@]}" \
    --only-show-errors >/dev/null
done < "$delete_list"

result_file="$BACKUP_RESULT_DIR/$timestamp.json"
validated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > "$result_file" <<EOF
{
  "status": "validated",
  "key": "$key",
  "manifest_key": "$manifest_key",
  "created_at": "$timestamp",
  "validated_at": "$validated_at",
  "size_bytes": $dump_size,
  "sha256": "$dump_sha256",
  "retention": "applied"
}
EOF

printf 'PostgreSQL backup validated: %s\n' "$key"
