#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=postgres-backup-common.sh
source "$SCRIPT_DIR/postgres-backup-common.sh"

apply=false
case "${1:-}" in
  '') ;;
  --apply) apply=true ;;
  *) echo 'Usage: restore-company-production-replacement.sh [--apply]' >&2; exit 2 ;;
esac

COMPANY_SLUG=${COMPANY_SLUG:-}
RESTORE_RECOVERY_SET_KEY=${RESTORE_RECOVERY_SET_KEY:-}
RESTORE_PRODUCTION_DATABASE_NAME=${RESTORE_PRODUCTION_DATABASE_NAME:-}
RESTORE_REPLACEMENT_DATABASE_NAME=${RESTORE_REPLACEMENT_DATABASE_NAME:-}
RESTORE_PRODUCTION_BUCKET=${RESTORE_PRODUCTION_BUCKET:-}
RESTORE_REPLACEMENT_BUCKET=${RESTORE_REPLACEMENT_BUCKET:-}
RESTORE_PRODUCTION_COMPOSE_PROJECT=${RESTORE_PRODUCTION_COMPOSE_PROJECT:-}
RESTORE_REPLACEMENT_COMPOSE_PROJECT=${RESTORE_REPLACEMENT_COMPOSE_PROJECT:-}
RESTORE_ORIGINAL_HOST_REF=${RESTORE_ORIGINAL_HOST_REF:-}
RESTORE_REPLACEMENT_HOST_REF=${RESTORE_REPLACEMENT_HOST_REF:-}
RESTORE_REPLACEMENT_COMPOSE_FILE=${RESTORE_REPLACEMENT_COMPOSE_FILE:-}
RESTORE_REPLACEMENT_COMPOSE_ENV_FILE=${RESTORE_REPLACEMENT_COMPOSE_ENV_FILE:-}
RESTORE_REPLACEMENT_NETWORK=${RESTORE_REPLACEMENT_NETWORK:-}
RESTORE_REPLACEMENT_POSTGRES_SERVICE=${RESTORE_REPLACEMENT_POSTGRES_SERVICE:-postgres}
RESTORE_REPLACEMENT_POSTGRES_USER=${RESTORE_REPLACEMENT_POSTGRES_USER:-postgres}
RESTORE_REPLACEMENT_POSTGRES_PASSWORD=${RESTORE_REPLACEMENT_POSTGRES_PASSWORD:-}
RESTORE_REPLACEMENT_S3_ENDPOINT=${RESTORE_REPLACEMENT_S3_ENDPOINT:-}
RESTORE_REPLACEMENT_S3_REGION=${RESTORE_REPLACEMENT_S3_REGION:-}
RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID=${RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID:-}
RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY=${RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY:-}
RESTORE_PRODUCTION_S3_ENDPOINT=${RESTORE_PRODUCTION_S3_ENDPOINT:-}
RESTORE_REPLACEMENT_S3_ENDPOINT=${RESTORE_REPLACEMENT_S3_ENDPOINT%/}
RESTORE_PRODUCTION_S3_ENDPOINT=${RESTORE_PRODUCTION_S3_ENDPOINT%/}
RESTORE_INCIDENT_REF=${RESTORE_INCIDENT_REF:-}
RESTORE_INCIDENT_DECLARED_AT=${RESTORE_INCIDENT_DECLARED_AT:-}
RESTORE_APPROVED_BACKEND_DIGEST=${RESTORE_APPROVED_BACKEND_DIGEST:-}
RESTORE_APPROVED_FRONTEND_DIGEST=${RESTORE_APPROVED_FRONTEND_DIGEST:-}
RESTORE_APPROVED_SCHEMA_SHA256=${RESTORE_APPROVED_SCHEMA_SHA256:-}
RESTORE_CONFIRMATION=${RESTORE_CONFIRMATION:-}
RESTORE_HEALTH_SMOKE_SCRIPT=${RESTORE_HEALTH_SMOKE_SCRIPT:-}
RESTORE_HEALTH_SMOKE_SHA256=${RESTORE_HEALTH_SMOKE_SHA256:-}
RESTORE_TRAFFIC_CLOSED_SCRIPT=${RESTORE_TRAFFIC_CLOSED_SCRIPT:-}
RESTORE_TRAFFIC_CLOSED_SHA256=${RESTORE_TRAFFIC_CLOSED_SHA256:-}
RESTORE_LOCAL_DIR=${RESTORE_LOCAL_DIR:-/var/tmp/pollos-distribuidor/production-replacement}
BACKUP_DOCKER_BIN=${BACKUP_DOCKER_BIN:-docker}
BACKUP_UPLOAD_IMAGE=${BACKUP_UPLOAD_IMAGE:-amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7}
BACKUP_UPLOAD_NETWORK=${BACKUP_UPLOAD_NETWORK:-}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}

configuration_failure() {
  local exit_code=$?
  trap - EXIT
  if (( exit_code != 0 )) && [[ "$apply" == true ]]; then
    if [[ "$RESTORE_LOCAL_DIR" != / && ! -L "$RESTORE_LOCAL_DIR" ]] &&
      mkdir -p "$RESTORE_LOCAL_DIR"; then
      python3 - "$RESTORE_LOCAL_DIR/failed-configuration-$(date -u +%Y%m%dT%H%M%SZ)-$$.json" \
        "$COMPANY_SLUG" "$RESTORE_RECOVERY_SET_KEY" "$RESTORE_INCIDENT_REF" \
        "$RESTORE_REPLACEMENT_DATABASE_NAME" "$RESTORE_REPLACEMENT_BUCKET" <<'PY'
import json
import sys
with open(sys.argv[1], 'x', encoding='utf-8') as handle:
    json.dump({'company':sys.argv[2] or None,'recovery_set_key':sys.argv[3] or None,
      'incident_change_ref':sys.argv[4] or None,'replacement_database':sys.argv[5] or None,
      'replacement_object_storage_bucket':sys.argv[6] or None,
      'source_recovery_timestamp':None,'postgres_restore_started_at':None,
      'postgres_restore_finished_at':None,'object_storage_restore_started_at':None,
      'object_storage_restore_finished_at':None,'verification_started_at':None,
      'verification_finished_at':None,'cross_reference_status':'not_run',
      'migration_schema_status':'not_run','release_compatibility_status':'not_run',
      'postgres_restore_status':'not_run','object_storage_restore_status':'not_run',
      'health_smoke_status':'not_run','traffic_closed_status':'not_run',
      'rpo_observed_seconds':None,'rto_partial_to_ready_seconds':None,
      'status':'FAILED','failure_stage':'configuration',
      'traffic_cutover_performed':False}, handle, sort_keys=True)
    handle.write('\n')
PY
    fi
  fi
  exit "$exit_code"
}
trap configuration_failure EXIT

backup_require_env COMPANY_SLUG RESTORE_RECOVERY_SET_KEY RESTORE_PRODUCTION_DATABASE_NAME \
  RESTORE_REPLACEMENT_DATABASE_NAME RESTORE_PRODUCTION_BUCKET RESTORE_REPLACEMENT_BUCKET \
  RESTORE_PRODUCTION_COMPOSE_PROJECT RESTORE_REPLACEMENT_COMPOSE_PROJECT \
  RESTORE_ORIGINAL_HOST_REF RESTORE_REPLACEMENT_HOST_REF \
  RESTORE_REPLACEMENT_COMPOSE_FILE RESTORE_REPLACEMENT_COMPOSE_ENV_FILE \
  RESTORE_REPLACEMENT_NETWORK RESTORE_REPLACEMENT_POSTGRES_PASSWORD \
  RESTORE_REPLACEMENT_S3_ENDPOINT RESTORE_REPLACEMENT_S3_REGION \
  RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY \
  RESTORE_PRODUCTION_S3_ENDPOINT RESTORE_INCIDENT_REF RESTORE_INCIDENT_DECLARED_AT \
  RESTORE_APPROVED_BACKEND_DIGEST RESTORE_APPROVED_FRONTEND_DIGEST \
  RESTORE_APPROVED_SCHEMA_SHA256 RESTORE_HEALTH_SMOKE_SCRIPT RESTORE_HEALTH_SMOKE_SHA256 \
  RESTORE_TRAFFIC_CLOSED_SCRIPT RESTORE_TRAFFIC_CLOSED_SHA256
backup_require_env BACKUP_S3_ENDPOINT BACKUP_S3_REGION BACKUP_S3_BUCKET \
  BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY
backup_validate_s3_env
disposable_fixture=false
if [[ "$RESTORE_REPLACEMENT_COMPOSE_PROJECT" =~ ^dr[0-9]{14}[0-9]+-replacement$ &&
  "$(basename -- "$RESTORE_REPLACEMENT_COMPOSE_FILE")" == dr-replacement.compose.yml ]]; then
  disposable_fixture=true
fi
if [[ "$BACKUP_S3_ENDPOINT" == http://* && "$disposable_fixture" != true ]]; then
  echo 'HTTP backup endpoint is permitted only in the disposable DR fixture.' >&2
  exit 2
fi
backup_validate_database_name RESTORE_PRODUCTION_DATABASE_NAME "$RESTORE_PRODUCTION_DATABASE_NAME"
backup_validate_database_name RESTORE_REPLACEMENT_DATABASE_NAME "$RESTORE_REPLACEMENT_DATABASE_NAME"
backup_validate_database_name RESTORE_REPLACEMENT_POSTGRES_USER "$RESTORE_REPLACEMENT_POSTGRES_USER"

if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ||
  ! "$RESTORE_RECOVERY_SET_KEY" =~ ^recovery-sets/${COMPANY_SLUG}/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z-[0-9]+-[0-9]+\.manifest\.json$ ||
  "$RESTORE_REPLACEMENT_DATABASE_NAME" != *_replacement ||
  "$RESTORE_REPLACEMENT_DATABASE_NAME" == "$RESTORE_PRODUCTION_DATABASE_NAME" ||
  ! "$RESTORE_REPLACEMENT_BUCKET" =~ ^mte-replacement-${COMPANY_SLUG}-[0-9]{14}-[0-9]+$ ||
  "$RESTORE_REPLACEMENT_BUCKET" == "$RESTORE_PRODUCTION_BUCKET" ||
  "$RESTORE_REPLACEMENT_COMPOSE_PROJECT" == "$RESTORE_PRODUCTION_COMPOSE_PROJECT" ||
  "$RESTORE_REPLACEMENT_HOST_REF" == "$RESTORE_ORIGINAL_HOST_REF" ||
  ! "$RESTORE_REPLACEMENT_HOST_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$ ||
  ! "$RESTORE_REPLACEMENT_COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*-replacement$ ||
  "$RESTORE_REPLACEMENT_NETWORK" != "${RESTORE_REPLACEMENT_COMPOSE_PROJECT}_app_network" ||
  "$RESTORE_REPLACEMENT_S3_ENDPOINT" == "$RESTORE_PRODUCTION_S3_ENDPOINT" ||
  "$RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID" == "$BACKUP_S3_ACCESS_KEY_ID" ||
  ! "$RESTORE_INCIDENT_REF" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$ ||
  ! "$RESTORE_APPROVED_SCHEMA_SHA256" =~ ^[a-f0-9]{64}$ ||
  ! "$RESTORE_HEALTH_SMOKE_SHA256" =~ ^[a-f0-9]{64}$ ||
  ! "$RESTORE_TRAFFIC_CLOSED_SHA256" =~ ^[a-f0-9]{64}$ ||
  "$RESTORE_LOCAL_DIR" == / || -L "$RESTORE_LOCAL_DIR" ||
  ! -f "$RESTORE_REPLACEMENT_COMPOSE_FILE" || -L "$RESTORE_REPLACEMENT_COMPOSE_FILE" ||
  ! -f "$RESTORE_REPLACEMENT_COMPOSE_ENV_FILE" || -L "$RESTORE_REPLACEMENT_COMPOSE_ENV_FILE" ||
  ! -f "$RESTORE_HEALTH_SMOKE_SCRIPT" || -L "$RESTORE_HEALTH_SMOKE_SCRIPT" ||
  ! -x "$RESTORE_HEALTH_SMOKE_SCRIPT" ||
  ! -f "$RESTORE_TRAFFIC_CLOSED_SCRIPT" || -L "$RESTORE_TRAFFIC_CLOSED_SCRIPT" ||
  ! -x "$RESTORE_TRAFFIC_CLOSED_SCRIPT" ]]; then
  echo 'Replacement identity, isolation, release approval, or configuration is invalid.' >&2
  exit 2
fi
if [[ "$RESTORE_REPLACEMENT_S3_ENDPOINT" != https://* ]]; then
  if [[ "${RESTORE_ALLOW_INSECURE_TARGET_ENDPOINT:-false}" != true ||
    "$disposable_fixture" != true ||
    "$RESTORE_REPLACEMENT_S3_ENDPOINT" != http://* ]]; then
    echo 'Replacement Object Storage requires HTTPS except in the disposable DR fixture.' >&2
    exit 2
  fi
fi
if [[ "$apply" == true && "$RESTORE_CONFIRMATION" != "RESTORE:$COMPANY_SLUG:$RESTORE_INCIDENT_REF:$RESTORE_REPLACEMENT_COMPOSE_PROJECT" ]]; then
  echo 'Explicit company, incident, and replacement-project confirmation is required for --apply.' >&2
  exit 2
fi
command -v "$BACKUP_DOCKER_BIN" >/dev/null
command -v node >/dev/null
command -v python3 >/dev/null
python3 - "$RESTORE_REPLACEMENT_COMPOSE_ENV_FILE" "$COMPANY_SLUG" "$RESTORE_REPLACEMENT_HOST_REF" <<'PY'
import sys
path, company, host = sys.argv[1:]
expected = {'RECOVERY_TARGET_ROLE': 'replacement', 'RECOVERY_COMPANY_SLUG': company,
            'RECOVERY_HOST_REF': host}
seen = {}
with open(path, encoding='utf-8') as handle:
    for line in handle:
        key, separator, value = line.strip().partition('=')
        if key in expected:
            if not separator or key in seen:
                raise SystemExit('Replacement Compose identity markers are ambiguous.')
            seen[key] = value
if seen != expected:
    raise SystemExit('Replacement Compose identity markers do not match the selected company and host.')
PY
if [[ "$(backup_sha256 "$RESTORE_HEALTH_SMOKE_SCRIPT")" != "$RESTORE_HEALTH_SMOKE_SHA256" ]]; then
  echo 'Approved health/smoke script fingerprint does not match.' >&2
  exit 2
fi
if [[ "$(backup_sha256 "$RESTORE_TRAFFIC_CLOSED_SCRIPT")" != "$RESTORE_TRAFFIC_CLOSED_SHA256" ]]; then
  echo 'Approved closed-traffic script fingerprint does not match.' >&2
  exit 2
fi
python3 - "$RESTORE_REPLACEMENT_S3_ENDPOINT" "$RESTORE_PRODUCTION_S3_ENDPOINT" <<'PY'
import sys
from urllib.parse import urlsplit
origins = []
for raw in sys.argv[1:]:
    value = urlsplit(raw)
    if value.scheme not in ('http', 'https') or not value.hostname or value.username or value.password or value.path or value.query or value.fragment:
        raise SystemExit('Object Storage endpoint identity is ambiguous.')
    origins.append((value.scheme, value.hostname.lower(), value.port or (443 if value.scheme == 'https' else 80)))
if origins[0] == origins[1]:
    raise SystemExit('Replacement Object Storage endpoint resolves to the declared original endpoint.')
PY

started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
stage=manifest_download
final_status=FAILED
postgres_start= postgres_end= object_start= object_end= verification_start= verification_end=
cross_reference_status=not_run migration_status=not_run release_status=not_run
postgres_status=not_run object_storage_status=not_run health_smoke_status=not_run
traffic_closed_status=not_run
work_dir= result_file= source_timestamp=
mkdir -p "$RESTORE_LOCAL_DIR"
work_dir=$(mktemp -d "$RESTORE_LOCAL_DIR/.tmp.XXXXXX")
result_file=${RESTORE_RESULT_FILE:-$RESTORE_LOCAL_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$.json}
if [[ -e "$result_file" || -L "$result_file" ]]; then
  echo 'Result file must not already exist.' >&2
  exit 2
fi

write_result() {
  local finished_at
  finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  python3 - "$result_file" "$COMPANY_SLUG" "$RESTORE_RECOVERY_SET_KEY" "$RESTORE_INCIDENT_REF" \
    "$source_timestamp" "$RESTORE_REPLACEMENT_DATABASE_NAME" "$RESTORE_REPLACEMENT_BUCKET" \
    "$started_at" "$finished_at" "$postgres_start" "$postgres_end" "$object_start" "$object_end" \
    "$verification_start" "$verification_end" "$cross_reference_status" "$migration_status" \
    "$release_status" "$final_status" "$stage" "$RESTORE_INCIDENT_DECLARED_AT" \
    "$postgres_status" "$object_storage_status" "$health_smoke_status" \
    "$traffic_closed_status" <<'PY'
import datetime as dt
import json
import sys

(path, company, key, incident, source, database, bucket, started, finished,
 pg_start, pg_end, obj_start, obj_end, verify_start, verify_end, cross,
 migrations, release, status, stage, declared, postgres_status, object_status,
 health_status, traffic_status) = sys.argv[1:]
def instant(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
def elapsed(later, earlier):
    try:
        return (instant(later) - instant(earlier)).total_seconds()
    except (ValueError, TypeError):
        return None
payload = {
    'company': company, 'recovery_set_key': key, 'incident_change_ref': incident,
    'source_recovery_timestamp': source or None,
    'replacement_database': database, 'replacement_object_storage_bucket': bucket,
    'restore_started_at': started, 'finished_at': finished,
    'postgres_restore_started_at': pg_start or None, 'postgres_restore_finished_at': pg_end or None,
    'object_storage_restore_started_at': obj_start or None, 'object_storage_restore_finished_at': obj_end or None,
    'verification_started_at': verify_start or None, 'verification_finished_at': verify_end or None,
    'cross_reference_status': cross, 'migration_schema_status': migrations,
    'release_compatibility_status': release, 'postgres_restore_status': postgres_status,
    'object_storage_restore_status': object_status, 'health_smoke_status': health_status,
    'traffic_closed_status': traffic_status, 'status': status,
    'failure_stage': stage if status == 'FAILED' else None,
    'rpo_observed_seconds': elapsed(declared, source) if source else None,
    'rto_partial_to_ready_seconds': elapsed(finished, declared) if status == 'READY_FOR_CUTOVER' else None,
    'traffic_cutover_performed': False,
}
with open(path, 'x', encoding='utf-8') as handle:
    json.dump(payload, handle, sort_keys=True)
    handle.write('\n')
PY
  chmod 600 "$result_file"
}
finish() {
  local exit_code=$?
  trap - EXIT
  if [[ "$apply" == true ]]; then
    if (( exit_code != 0 )); then
      final_status=FAILED
      if [[ "$(backup_sha256 "$RESTORE_TRAFFIC_CLOSED_SCRIPT")" == "$RESTORE_TRAFFIC_CLOSED_SHA256" ]] &&
        "$RESTORE_TRAFFIC_CLOSED_SCRIPT"; then
        traffic_closed_status=passed
      else
        traffic_closed_status=failed
      fi
    fi
    write_result || { echo 'Failed to write replacement recovery evidence.' >&2; exit_code=1; }
  fi
  [[ -z "$work_dir" ]] || rm -rf -- "$work_dir"
  exit "$exit_code"
}
trap finish EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

replacement_compose() {
  "$BACKUP_DOCKER_BIN" compose --project-name "$RESTORE_REPLACEMENT_COMPOSE_PROJECT" \
    --env-file "$RESTORE_REPLACEMENT_COMPOSE_ENV_FILE" -f "$RESTORE_REPLACEMENT_COMPOSE_FILE" "$@"
}
replacement_pg() {
  replacement_compose exec -T -e "PGPASSWORD=$RESTORE_REPLACEMENT_POSTGRES_PASSWORD" \
    "$RESTORE_REPLACEMENT_POSTGRES_SERVICE" "$@"
}
replacement_aws() {
  AWS_ACCESS_KEY_ID="$RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$RESTORE_REPLACEMENT_S3_REGION" AWS_EC2_METADATA_DISABLED=true \
    "$BACKUP_DOCKER_BIN" run --rm --network "$RESTORE_REPLACEMENT_NETWORK" \
      -v "$work_dir:/backup:rw" -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
      -e AWS_DEFAULT_REGION -e AWS_EC2_METADATA_DISABLED "$BACKUP_UPLOAD_IMAGE" "$@"
}
replacement_aws_script() {
  AWS_ACCESS_KEY_ID="$RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY" \
  AWS_DEFAULT_REGION="$RESTORE_REPLACEMENT_S3_REGION" AWS_EC2_METADATA_DISABLED=true \
    "$BACKUP_DOCKER_BIN" run --rm --network "$RESTORE_REPLACEMENT_NETWORK" \
      -v "$work_dir:/backup:rw" -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
      -e AWS_DEFAULT_REGION -e AWS_EC2_METADATA_DISABLED --entrypoint /bin/sh \
      "$BACKUP_UPLOAD_IMAGE" "$@"
}

backup_aws_cli_dir "$work_dir" rw s3 cp "s3://$BACKUP_S3_BUCKET/$RESTORE_RECOVERY_SET_KEY" \
  /backup/set.json --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp "s3://$BACKUP_S3_BUCKET/$RESTORE_RECOVERY_SET_KEY.sha256" \
  /backup/set.sha256 --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
stage=manifest_identity
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-identity --manifest "$work_dir/set.json" \
  --checksum "$work_dir/set.sha256" --expected-company "$COMPANY_SLUG" >/dev/null

stage=component_download
manifest_fields=()
while IFS= read -r field; do manifest_fields+=("$field"); done < <(node - "$work_dir/set.json" <<'NODE'
const set = require(process.argv[2]);
for (const value of [set.postgresql?.database, set.postgresql?.key, set.postgresql?.manifest_key,
  set.object_storage?.source_bucket, set.object_storage?.key, set.object_storage?.manifest_key,
  set.recovery_point?.write_barrier_at, set.release_digests?.backend,
  set.release_digests?.frontend, set.schema_state?.sha256]) console.log(value ?? '');
NODE
)
if [[ "${manifest_fields[0]}" != "$RESTORE_PRODUCTION_DATABASE_NAME" ||
  "${manifest_fields[3]}" != "$RESTORE_PRODUCTION_BUCKET" ]]; then
  echo 'Recovery set source database or bucket does not match declared production.' >&2
  exit 1
fi
source_timestamp=${manifest_fields[6]}
python3 - "$RESTORE_INCIDENT_DECLARED_AT" "$source_timestamp" <<'PY'
import datetime as dt
import sys
declared, source = [dt.datetime.fromisoformat(value.replace('Z', '+00:00')) for value in sys.argv[1:]]
if declared.tzinfo is None or source.tzinfo is None or declared < source:
    raise SystemExit('Incident timestamp must be timezone-aware and no earlier than the recovery point.')
PY
backup_aws_cli_dir "$work_dir" rw s3 cp "s3://$BACKUP_S3_BUCKET/${manifest_fields[2]}" \
  /backup/postgres-manifest.json --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp "s3://$BACKUP_S3_BUCKET/${manifest_fields[1]}" \
  /backup/postgres.dump --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp "s3://$BACKUP_S3_BUCKET/${manifest_fields[5]}" \
  /backup/object-manifest.json --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp "s3://$BACKUP_S3_BUCKET/${manifest_fields[5]}.sha256" \
  /backup/object-manifest.sha256 --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
backup_aws_cli_dir "$work_dir" rw s3 cp "s3://$BACKUP_S3_BUCKET/${manifest_fields[4]}" \
  /backup/objects.tar.gz --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors >/dev/null
stage=component_integrity
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify --manifest "$work_dir/set.json" \
  --checksum "$work_dir/set.sha256" --expected-company "$COMPANY_SLUG" \
  --postgres-manifest "$work_dir/postgres-manifest.json" \
  --object-manifest "$work_dir/object-manifest.json" --postgres "$work_dir/postgres.dump" \
  --object-storage "$work_dir/objects.tar.gz" >/dev/null
node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-object \
  --manifest "$work_dir/object-manifest.json" --checksum "$work_dir/object-manifest.sha256" \
  --expected-company "$COMPANY_SLUG" --archive "$work_dir/objects.tar.gz" >/dev/null

stage=release_schema_preflight
if [[ "${manifest_fields[7]}" != "$RESTORE_APPROVED_BACKEND_DIGEST" ||
  "${manifest_fields[8]}" != "$RESTORE_APPROVED_FRONTEND_DIGEST" ||
  "${manifest_fields[9]}" != "$RESTORE_APPROVED_SCHEMA_SHA256" ]]; then
  echo 'Recovery set is incompatible with the approved replacement release/schema.' >&2
  exit 1
fi
release_status=passed
python3 - "$work_dir/objects.tar.gz" "$work_dir/data" <<'PY'
import pathlib
import sys
import tarfile

target = pathlib.Path(sys.argv[2])
target.mkdir(mode=0o700)
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for member in archive.getmembers():
        path = pathlib.PurePosixPath(member.name)
        if (path.is_absolute() or '..' in path.parts or member.issym() or member.islnk()
                or not (member.isfile() or member.isdir())):
            raise SystemExit('OBJECT_STORAGE_ARCHIVE_PATH_INVALID')
    archive.extractall(target)
PY

stage=target_preflight
if ! replacement_compose ps --status running --services | grep -Fxq "$RESTORE_REPLACEMENT_POSTGRES_SERVICE"; then
  echo 'Replacement PostgreSQL is not running.' >&2; exit 1
fi
replacement_pg pg_isready -U "$RESTORE_REPLACEMENT_POSTGRES_USER" -d postgres >/dev/null
if [[ "$(replacement_pg psql -U "$RESTORE_REPLACEMENT_POSTGRES_USER" -d postgres -Atqc \
  "SELECT count(*) FROM pg_database WHERE datname = '$RESTORE_REPLACEMENT_DATABASE_NAME'")" != 0 ]]; then
  echo 'Replacement database already exists.' >&2; exit 1
fi
replacement_aws s3api list-buckets --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" \
  --output json > "$work_dir/buckets.json"
bucket_exists=$(node - "$work_dir/buckets.json" "$RESTORE_REPLACEMENT_BUCKET" <<'NODE'
const buckets = require(process.argv[2]).Buckets;
if (!Array.isArray(buckets)) process.exit(2);
process.stdout.write(buckets.some((bucket) => bucket.Name === process.argv[3]) ? 'yes' : 'no');
NODE
)
if [[ "$bucket_exists" == yes ]]; then echo 'Replacement bucket already exists.' >&2; exit 1; fi
replacement_pg pg_restore --list < "$work_dir/postgres.dump" >/dev/null
stage=traffic_closed_preflight
traffic_closed_status=failed
"$RESTORE_TRAFFIC_CLOSED_SCRIPT"
traffic_closed_status=passed

if [[ "$apply" != true ]]; then
  echo 'PREFLIGHT_PASSED_NO_MUTATION: confirmation and --apply are required to restore.'
  exit 0
fi

stage=postgres_restore
postgres_status=failed
postgres_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
replacement_pg createdb --username="$RESTORE_REPLACEMENT_POSTGRES_USER" \
  --template=template0 "$RESTORE_REPLACEMENT_DATABASE_NAME"
replacement_pg pg_restore --username="$RESTORE_REPLACEMENT_POSTGRES_USER" \
  --dbname="$RESTORE_REPLACEMENT_DATABASE_NAME" --no-owner --no-acl --exit-on-error \
  < "$work_dir/postgres.dump" >/dev/null
postgres_end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
postgres_status=passed

stage=object_storage_restore
object_storage_status=failed
object_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
replacement_aws s3api create-bucket --bucket "$RESTORE_REPLACEMENT_BUCKET" \
  --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" >/dev/null
replacement_aws s3 sync /backup/data "s3://$RESTORE_REPLACEMENT_BUCKET" \
  --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" --only-show-errors >/dev/null
mkdir -p "$work_dir/verify"
replacement_aws s3 sync "s3://$RESTORE_REPLACEMENT_BUCKET" /backup/verify \
  --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" --only-show-errors >/dev/null
diff -r -- "$work_dir/data" "$work_dir/verify" >/dev/null
object_end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
object_storage_status=passed

stage=database_verification
verification_start=$(date -u +%Y-%m-%dT%H:%M:%SZ)
verify_database_url="postgresql://${RESTORE_REPLACEMENT_POSTGRES_USER}@127.0.0.1:5432/${RESTORE_REPLACEMENT_DATABASE_NAME}"
replacement_compose exec -T -e "RESTORE_DATABASE_URL=$verify_database_url" \
  -e RESTORE_TARGET_CLASS=replacement -e "PGPASSWORD=$RESTORE_REPLACEMENT_POSTGRES_PASSWORD" \
  "$RESTORE_REPLACEMENT_POSTGRES_SERVICE" sh -s \
  < "$SCRIPT_DIR/verify-restored-database.sh" >/dev/null
stage=migration_schema_verification
migration_status=failed
replacement_pg psql -U "$RESTORE_REPLACEMENT_POSTGRES_USER" -d "$RESTORE_REPLACEMENT_DATABASE_NAME" \
  -Atqc 'SELECT COALESCE(json_agg(json_build_object('\''migration_name'\'',migration_name,'\''checksum'\'',checksum,'\''finished_at'\'',finished_at) ORDER BY migration_name)::text,'\''[]'\'') FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL' \
  > "$work_dir/restored-migrations.json"
node - "$work_dir/set.json" "$work_dir/restored-migrations.json" <<'NODE'
const fs = require('node:fs');
const set = require(process.argv[2]);
const actual = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const normalize = rows => rows.map(x => ({migration_name:x.migration_name,checksum:x.checksum,finished_at:new Date(x.finished_at).toISOString()})).sort((a,b)=>a.migration_name.localeCompare(b.migration_name));
if (JSON.stringify(normalize(actual)) !== JSON.stringify(normalize(set.schema_state.migrations))) process.exit(1);
NODE
migration_status=passed

stage=storage_reference_verification
cross_reference_status=failed
reference_sql=$(cat <<'SQL'
SELECT json_build_object(
  'companyBranding', COALESCE((SELECT json_agg(json_build_object('logoObjectKey', "logoObjectKey", 'logoMimeType', "logoMimeType") ORDER BY "id") FROM "CompanyBranding" WHERE "logoObjectKey" IS NOT NULL), '[]'::json),
  'deliveryEvidence', COALESCE((SELECT json_agg(json_build_object('storageKey', "storageKey", 'mimeType', "mimeType", 'sha256', "sha256", 'sizeBytes', "sizeBytes") ORDER BY "storageKey") FROM "DeliveryEvidence" WHERE "storageKey" IS NOT NULL), '[]'::json),
  'fiscalArtifacts', COALESCE((SELECT json_agg(json_build_object('storageKey', "storageKey", 'mimeType', "mimeType", 'sha256', "sha256", 'byteSize', "byteSize"::text, 'status', "status") ORDER BY "storageKey") FROM "FiscalArtifact" WHERE "status" = 'AVAILABLE'), '[]'::json)
)::text;
SQL
)
replacement_pg psql -U "$RESTORE_REPLACEMENT_POSTGRES_USER" -d "$RESTORE_REPLACEMENT_DATABASE_NAME" \
  --no-psqlrc -v ON_ERROR_STOP=1 -Atqc "$reference_sql" > "$work_dir/references.json"
mkdir -p "$work_dir/reference-head"
node "$SCRIPT_DIR/recovery-storage-reference-verifier.mjs" plan-head-checks \
  --references "$work_dir/references.json" --bucket "$RESTORE_REPLACEMENT_BUCKET" \
  --endpoint "$RESTORE_REPLACEMENT_S3_ENDPOINT" --region "$RESTORE_REPLACEMENT_S3_REGION" \
  --script "$work_dir/head-reference-objects.sh" >/dev/null
replacement_aws_script /backup/head-reference-objects.sh
node "$SCRIPT_DIR/recovery-storage-reference-verifier.mjs" verify \
  --target-mode replacement --expected-company "$COMPANY_SLUG" \
  --recovery-set "$work_dir/set.json" --restore-database "$RESTORE_REPLACEMENT_DATABASE_NAME" \
  --production-database "$RESTORE_PRODUCTION_DATABASE_NAME" --target-bucket "$RESTORE_REPLACEMENT_BUCKET" \
  --restored-objects-dir "$work_dir/verify" --references "$work_dir/references.json" \
  --head-directory "$work_dir/reference-head" --result "$work_dir/reference-result.json" >/dev/null
cross_reference_status=passed

stage=health_smoke
health_smoke_status=failed
replacement_pg pg_isready -U "$RESTORE_REPLACEMENT_POSTGRES_USER" -d "$RESTORE_REPLACEMENT_DATABASE_NAME" >/dev/null
replacement_aws s3api head-bucket --bucket "$RESTORE_REPLACEMENT_BUCKET" \
  --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" >/dev/null
if [[ "$(backup_sha256 "$RESTORE_HEALTH_SMOKE_SCRIPT")" != "$RESTORE_HEALTH_SMOKE_SHA256" ]]; then
  echo 'Health/smoke script changed after preflight.' >&2
  exit 1
fi
"$RESTORE_HEALTH_SMOKE_SCRIPT"
health_smoke_status=passed
stage=traffic_closed_final
traffic_closed_status=failed
if [[ "$(backup_sha256 "$RESTORE_TRAFFIC_CLOSED_SCRIPT")" != "$RESTORE_TRAFFIC_CLOSED_SHA256" ]]; then
  echo 'Closed-traffic script changed after preflight.' >&2
  exit 1
fi
"$RESTORE_TRAFFIC_CLOSED_SCRIPT"
traffic_closed_status=passed
verification_end=$(date -u +%Y-%m-%dT%H:%M:%SZ)
stage=ready_for_cutover
final_status=READY_FOR_CUTOVER
echo 'READY_FOR_CUTOVER: replacement targets passed validation; traffic remains unchanged.'
