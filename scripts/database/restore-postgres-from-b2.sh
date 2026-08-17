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
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT%/}

RESTORE_DATABASE_URL=${RESTORE_DATABASE_URL:-}
RESTORE_DATABASE_NAME=${RESTORE_DATABASE_NAME:-}
RESTORE_PRODUCTION_DATABASE_NAME=${RESTORE_PRODUCTION_DATABASE_NAME:-$BACKUP_POSTGRES_DATABASE}
RESTORE_BACKUP_KEY=${RESTORE_BACKUP_KEY:-}
RESTORE_LOCAL_DIR=${RESTORE_LOCAL_DIR:-/var/tmp/pollos-distribuidor/postgres-restore}
RESTORE_FAILURE_DIR=${RESTORE_FAILURE_DIR:-$RESTORE_LOCAL_DIR/failed}
RESTORE_RESULT_DIR=${RESTORE_RESULT_DIR:-/var/lib/pollos-distribuidor/postgres-backups/restore-drills}
RESTORE_MIN_FREE_BYTES=${RESTORE_MIN_FREE_BYTES:-1073741824}

temp_dir=
dump_file=
manifest_file=
result_file=
restore_timestamp=$(date -u +%Y-%m-%dT%H-%M-%SZ)
target_created=0
result_status=failed
cleanup_status=not-created

write_result() {
  local failure_stage=${1:-none}
  local written_at

  written_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  cat > "$result_file" <<EOF
{
  "status": "$result_status",
  "backup_key": "$RESTORE_BACKUP_KEY",
  "database": "$RESTORE_DATABASE_NAME",
  "production_database": "$RESTORE_PRODUCTION_DATABASE_NAME",
  "created_at": "$restore_timestamp",
  "recorded_at": "$written_at",
  "cleanup": "$cleanup_status",
  "failure_stage": "$failure_stage"
}
EOF
}

preserve_failed_restore() {
  local source_file=${1:-}
  local preserved_file

  if [[ -z "$source_file" || ! -s "$source_file" ]]; then
    return 0
  fi

  mkdir -p "$RESTORE_FAILURE_DIR" 2>/dev/null || return 0
  preserved_file="$RESTORE_FAILURE_DIR/${restore_timestamp}.dump.failed"
  cp -- "$source_file" "$preserved_file" 2>/dev/null || true
  find "$RESTORE_FAILURE_DIR" -maxdepth 1 -type f -name '*.dump.failed' \
    -not -name "$(basename -- "$preserved_file")" -delete 2>/dev/null || true
}

drop_restore_database() {
  if (( target_created == 0 )); then
    return 0
  fi

  # This guard is repeated immediately before dropdb so no cleanup path can
  # ever turn a restore drill into a production database drop.
  if [[ "$RESTORE_DATABASE_NAME" == "$RESTORE_PRODUCTION_DATABASE_NAME" || "$RESTORE_DATABASE_NAME" != *_restore_drill ]]; then
    printf '%s\n' 'Refusing to drop a database that is not an isolated _restore_drill database.' >&2
    return 1
  fi

  if backup_compose_pg dropdb --if-exists --username="$BACKUP_POSTGRES_USER" "$RESTORE_DATABASE_NAME"; then
    target_created=0
    return 0
  fi

  return 1
}

on_exit() {
  local exit_code=$?
  local failure_stage=${BACKUP_STAGE:-unknown}

  if (( exit_code != 0 )); then
    result_status=failed
    cleanup_status=$([[ "$target_created" -eq 1 ]] && printf 'pending' || printf 'not-created')
    if [[ -n "$result_file" && -d "$(dirname -- "$result_file")" ]]; then
      write_result "$failure_stage" || true
    fi
  fi

  if (( target_created == 1 )); then
    if drop_restore_database; then
      cleanup_status=passed
    else
      cleanup_status=failed
      exit_code=1
    fi
    if [[ -n "$result_file" && -f "$result_file" ]]; then
      write_result "$failure_stage" || true
    fi
  fi

  if (( exit_code != 0 )); then
    preserve_failed_restore "$dump_file"
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
backup_validate_database_name RESTORE_PRODUCTION_DATABASE_NAME "$RESTORE_PRODUCTION_DATABASE_NAME"
backup_validate_positive_integer RESTORE_MIN_FREE_BYTES "$RESTORE_MIN_FREE_BYTES"

if [[ -n "$RESTORE_DATABASE_URL" ]]; then
  database_url_without_query=${RESTORE_DATABASE_URL%%\?*}
  database_name_from_url=${database_url_without_query##*/}
  if [[ -z "$database_name_from_url" ]]; then
    printf '%s\n' 'RESTORE_DATABASE_URL must contain a database name.' >&2
    exit 2
  fi
  if [[ -n "$RESTORE_DATABASE_NAME" && "$RESTORE_DATABASE_NAME" != "$database_name_from_url" ]]; then
    printf '%s\n' 'RESTORE_DATABASE_NAME and RESTORE_DATABASE_URL identify different databases.' >&2
    exit 2
  fi
  RESTORE_DATABASE_NAME=$database_name_from_url
fi

if [[ -z "$RESTORE_DATABASE_NAME" ]]; then
  printf '%s\n' 'RESTORE_DATABASE_NAME or RESTORE_DATABASE_URL is required.' >&2
  exit 2
fi

backup_validate_database_name RESTORE_DATABASE_NAME "$RESTORE_DATABASE_NAME"
if [[ "$RESTORE_DATABASE_NAME" == "$RESTORE_PRODUCTION_DATABASE_NAME" ]]; then
  printf '%s\n' 'Refusing to restore or drop the production database.' >&2
  exit 2
fi
if [[ "$RESTORE_DATABASE_NAME" != *_restore_drill ]]; then
  printf '%s\n' 'Restore drills require a database name ending in _restore_drill.' >&2
  exit 2
fi

if [[ -n "$RESTORE_BACKUP_KEY" && ! "$RESTORE_BACKUP_KEY" =~ ^postgres/[0-9]{4}/[0-9]{2}/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z\.dump$ ]]; then
  printf '%s\n' 'RESTORE_BACKUP_KEY is not a valid deterministic PostgreSQL backup key.' >&2
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

mkdir -p "$RESTORE_LOCAL_DIR" "$RESTORE_RESULT_DIR"
backup_check_disk_space "$RESTORE_LOCAL_DIR" "$RESTORE_MIN_FREE_BYTES"
result_file="$RESTORE_RESULT_DIR/$restore_timestamp.json"
temp_dir=$(mktemp -d "$RESTORE_LOCAL_DIR/.tmp.XXXXXX")
dump_file="$temp_dir/restore.dump"
manifest_file="$temp_dir/restore.manifest.json"
s3_endpoint_args=(--endpoint-url "$BACKUP_S3_ENDPOINT")

BACKUP_STAGE=compose-preflight
if ! backup_compose ps --status running --services | grep -Fxq "$BACKUP_POSTGRES_SERVICE"; then
  backup_die
fi
if ! backup_compose_pg pg_isready -U "$BACKUP_POSTGRES_USER" -d "$BACKUP_POSTGRES_DATABASE" >/dev/null; then
  backup_die
fi

BACKUP_STAGE=select-backup
if [[ -z "$RESTORE_BACKUP_KEY" ]]; then
  object_list="$temp_dir/object-list.json"
  backup_aws_cli_dir "$temp_dir" rw s3api list-objects-v2 \
    --bucket "$BACKUP_S3_BUCKET" \
    --prefix postgres/ \
    "${s3_endpoint_args[@]}" \
    --output json > "$object_list"
  if ! RESTORE_BACKUP_KEY=$(python3 "$SCRIPT_DIR/select-latest-postgres-backup.py" --input "$object_list"); then
    printf '%s\n' 'No non-empty PostgreSQL backup exists in the configured bucket.' >&2
    exit 1
  fi
fi

manifest_key="${RESTORE_BACKUP_KEY%.dump}.manifest.json"

BACKUP_STAGE=download-backup
backup_aws_cli_dir "$temp_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$RESTORE_BACKUP_KEY" \
  /backup/restore.dump \
  "${s3_endpoint_args[@]}" \
  --only-show-errors >/dev/null
backup_aws_cli_dir "$temp_dir" rw s3 cp \
  "s3://$BACKUP_S3_BUCKET/$manifest_key" \
  /backup/restore.manifest.json \
  "${s3_endpoint_args[@]}" \
  --only-show-errors >/dev/null

dump_size=$(backup_file_size "$dump_file")
if (( dump_size < 1 )); then
  printf '%s\n' 'Downloaded PostgreSQL backup is empty.' >&2
  exit 1
fi

manifest_values=$(python3 - "$manifest_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    payload = json.load(handle)

print("\t".join(
    [
        str(payload.get("key", "")),
        str(payload.get("size_bytes", "")),
        str(payload.get("sha256", "")),
        str(payload.get("database", "")),
    ]
))
PY
)
IFS=$'\t' read -r manifest_key_value manifest_size_value manifest_sha256_value manifest_database_value <<< "$manifest_values"
if [[ "$manifest_key_value" != "$RESTORE_BACKUP_KEY" || "$manifest_size_value" != "$dump_size" || ! "$manifest_sha256_value" =~ ^[0-9a-f]{64}$ || "$manifest_database_value" != "$BACKUP_POSTGRES_DATABASE" ]]; then
  printf '%s\n' 'Backup manifest does not match the downloaded PostgreSQL archive.' >&2
  exit 1
fi
if [[ "$(backup_sha256 "$dump_file")" != "$manifest_sha256_value" ]]; then
  printf '%s\n' 'Downloaded PostgreSQL backup failed checksum verification.' >&2
  exit 1
fi

if ! backup_compose_pg pg_restore --list < "$dump_file" >/dev/null; then
  printf '%s\n' 'Downloaded PostgreSQL backup is not a readable custom archive.' >&2
  exit 1
fi

BACKUP_STAGE=production-safety-check
production_exists=$(backup_compose_pg psql \
  --username="$BACKUP_POSTGRES_USER" \
  --dbname=postgres \
  --tuples-only \
  --no-align \
  --command="SELECT 1 FROM pg_database WHERE datname = '$RESTORE_PRODUCTION_DATABASE_NAME';" | tr -d '[:space:]')
if [[ "$production_exists" != "1" ]]; then
  printf '%s\n' 'Production database is not present; refusing to run a restore drill.' >&2
  exit 1
fi

existing_target=$(backup_compose_pg psql \
  --username="$BACKUP_POSTGRES_USER" \
  --dbname=postgres \
  --tuples-only \
  --no-align \
  --command="SELECT 1 FROM pg_database WHERE datname = '$RESTORE_DATABASE_NAME';" | tr -d '[:space:]')
if [[ "$existing_target" == "1" ]]; then
  printf '%s\n' 'Restore target already exists; refusing to overwrite it.' >&2
  exit 1
fi

BACKUP_STAGE=create-restore-database
backup_compose_pg createdb \
  --username="$BACKUP_POSTGRES_USER" \
  --template=template0 \
  "$RESTORE_DATABASE_NAME"
target_created=1

BACKUP_STAGE=restore-archive
if ! backup_compose_pg pg_restore \
  --username="$BACKUP_POSTGRES_USER" \
  --dbname="$RESTORE_DATABASE_NAME" \
  --no-owner \
  --no-acl \
  --exit-on-error < "$dump_file"; then
  backup_die
fi

BACKUP_STAGE=verify-restored-database
verify_database_url="postgresql://${BACKUP_POSTGRES_USER}@127.0.0.1:5432/${RESTORE_DATABASE_NAME}"
if [[ -n "$BACKUP_POSTGRES_PASSWORD" ]]; then
  if ! backup_compose exec -T \
    -e "RESTORE_DATABASE_URL=$verify_database_url" \
    -e "PGPASSWORD=$BACKUP_POSTGRES_PASSWORD" \
    "$BACKUP_POSTGRES_SERVICE" sh -s < "$SCRIPT_DIR/verify-restored-database.sh"; then
    backup_die
  fi
else
  if ! backup_compose exec -T \
    -e "RESTORE_DATABASE_URL=$verify_database_url" \
    "$BACKUP_POSTGRES_SERVICE" sh -s < "$SCRIPT_DIR/verify-restored-database.sh"; then
    backup_die
  fi
fi

BACKUP_STAGE=source-integrity-check
production_exists_after=$(backup_compose_pg psql \
  --username="$BACKUP_POSTGRES_USER" \
  --dbname=postgres \
  --tuples-only \
  --no-align \
  --command="SELECT 1 FROM pg_database WHERE datname = '$RESTORE_PRODUCTION_DATABASE_NAME';" | tr -d '[:space:]')
if [[ "$production_exists_after" != "1" ]]; then
  backup_die
fi

result_status=passed
cleanup_status=pending
write_result none

BACKUP_STAGE=cleanup-restore-database
if ! drop_restore_database; then
  printf '%s\n' 'Restore database cleanup failed; inspect the saved drill result before retrying.' >&2
  exit 1
fi
cleanup_status=passed
write_result none

printf 'Restore drill passed for %s using %s.\n' "$RESTORE_DATABASE_NAME" "$RESTORE_BACKUP_KEY"
