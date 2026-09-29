#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=postgres-backup-common.sh
source "$ROOT/scripts/database/postgres-backup-common.sh"
COMPOSE_FILE="$ROOT/scripts/database/dr-disposable.compose.yml"
REPLACEMENT_COMPOSE_FILE="$ROOT/scripts/database/dr-replacement.compose.yml"
DOCKER=${BACKUP_DOCKER_BIN:-docker}
PROJECT="dr$(date -u +%Y%m%d%H%M%S)$$"
REPLACEMENT_PROJECT="${PROJECT}-replacement"
[[ "$PROJECT" =~ ^dr[0-9]{14}[0-9]+$ ]] || exit 2
WORK=$(mktemp -d "${TMPDIR:-/tmp}/dr-runtime.XXXXXX")
EVIDENCE_DIR=${DR_EVIDENCE_DIR:-$WORK/evidence}
mkdir -p "$EVIDENCE_DIR"
RECOVERY_CREATE_RESULT_DIR="$WORK/recovery-results"
primary_result_dir="$RECOVERY_CREATE_RESULT_DIR/primary"
broken_result_dir="$RECOVERY_CREATE_RESULT_DIR/broken-reference"
mkdir -p "$primary_result_dir" "$broken_result_dir"
started=0

single_json_result() {
  local directory=$1
  local -a result_files=("$directory"/*.json)
  if (( ${#result_files[@]} != 1 )) || [[ ! -f "${result_files[0]}" ]]; then
    echo "Expected exactly one JSON result in $directory." >&2
    return 1
  fi
  printf '%s\n' "${result_files[0]}"
}

compose() { "$DOCKER" compose --project-name "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
replacement_compose() { "$DOCKER" compose --project-name "$REPLACEMENT_PROJECT" --env-file "$WORK/replacement-compose.env" -f "$REPLACEMENT_COMPOSE_FILE" "$@"; }
pg() { compose exec -T postgres "$@"; }
wait_for_host_postgres() {
  python3 - "$1" <<'PY'
import socket
import sys
import time

port = int(sys.argv[1])
deadline = time.monotonic() + 75
while (remaining := deadline - time.monotonic()) > 0:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=min(1, remaining)):
            sys.exit(0)
    except OSError:
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(0.25, remaining))
sys.exit(1)
PY
}
aws_source() {
  AWS_ACCESS_KEY_ID=dr-source-access AWS_SECRET_ACCESS_KEY=dr-source-secret \
    AWS_DEFAULT_REGION=us-east-1 AWS_EC2_METADATA_DISABLED=true \
    backup_aws_cli_run_dir "$WORK" rw "${PROJECT}_app_network" '' "$@"
}
aws_backup() {
  AWS_ACCESS_KEY_ID=dr-backup-access AWS_SECRET_ACCESS_KEY=dr-backup-secret \
    AWS_DEFAULT_REGION=us-east-1 AWS_EC2_METADATA_DISABLED=true \
    backup_aws_cli_run_dir "$WORK" rw "${PROJECT}_app_network" '' "$@"
}
aws_replacement() {
  AWS_ACCESS_KEY_ID=dr-replacement-access AWS_SECRET_ACCESS_KEY=dr-replacement-secret \
    AWS_DEFAULT_REGION=us-east-1 AWS_EC2_METADATA_DISABLED=true \
    backup_aws_cli_run_dir "$WORK" rw "${REPLACEMENT_PROJECT}_app_network" '' "$@"
}
cleanup() {
  local exit_status=$?
  local test_status=passed cleanup_status=not_run targets_removed=false
  local project containers networks
  trap - EXIT
  if (( exit_status != 0 )); then
    test_status=failed
  fi
  if (( started == 1 )); then
    cleanup_status=passed
    targets_removed=true
    if ! replacement_compose down --volumes --remove-orphans >/dev/null; then
      echo 'Disposable replacement Compose cleanup failed.' >&2
      cleanup_status=failed
    fi
    if ! compose down --volumes --remove-orphans >/dev/null; then
      echo 'Disposable DR Compose cleanup failed.' >&2
      cleanup_status=failed
    fi
    for project in "$PROJECT" "$REPLACEMENT_PROJECT"; do
      if ! containers=$("$DOCKER" ps -aq --filter "label=com.docker.compose.project=$project"); then
        echo "Disposable containers could not be verified for $project." >&2
        cleanup_status=failed
        targets_removed=false
      elif [[ -n "$containers" ]]; then
        echo "Disposable containers still exist for $project." >&2
        cleanup_status=failed
        targets_removed=false
      fi
      if ! networks=$("$DOCKER" network ls -q --filter "label=com.docker.compose.project=$project"); then
        echo "Disposable networks could not be verified for $project." >&2
        cleanup_status=failed
        targets_removed=false
      elif [[ -n "$networks" ]]; then
        echo "Disposable networks still exist for $project." >&2
        cleanup_status=failed
        targets_removed=false
      fi
    done
    if [[ "$cleanup_status" == failed && "$exit_status" == 0 ]]; then
      exit_status=1
    fi
  fi
  printf '{"test_status":"%s","cleanup_status":"%s","project":"%s","targets_removed":%s}\n' \
    "$test_status" "$cleanup_status" "$PROJECT" "$targets_removed" > "$EVIDENCE_DIR/cleanup.json"
  if [[ -z "${DR_EVIDENCE_DIR:-}" ]]; then
    rm -rf -- "$WORK"
  fi
  exit "$exit_status"
}
trap cleanup EXIT

command -v "$DOCKER" >/dev/null || { echo 'Docker is required for real DR E2E.' >&2; exit 2; }
command -v npm >/dev/null || { echo 'npm is required for Prisma migrations.' >&2; exit 2; }
export OPENSSL_CONF=/dev/null
export BACKUP_DOCKER_BIN="$DOCKER"
export BACKUP_COMPOSE_FILE="$COMPOSE_FILE"
export BACKUP_COMPOSE_PROJECT_NAME="$PROJECT"
export BACKUP_UPLOAD_NETWORK="${PROJECT}_app_network"
export BACKUP_UPLOAD_IMAGE='amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7'
export BACKUP_COMPOSE_ENV_FILE="$WORK/compose.env"
: > "$BACKUP_COMPOSE_ENV_FILE"
printf 'RECOVERY_TARGET_ROLE=replacement\nRECOVERY_COMPANY_SLUG=dr-fixture\nRECOVERY_HOST_REF=dr-replacement-host\n' \
  > "$WORK/replacement-compose.env"
export COMPANY_SLUG=dr-fixture
export BACKUP_POSTGRES_DATABASE=dr_fixture BACKUP_POSTGRES_USER=postgres
export BACKUP_POSTGRES_PASSWORD=dr-disposable-only
export BACKUP_LOCAL_DIR="$WORK/backup-local" BACKUP_RESULT_DIR="$WORK/backup-results"
export COMPANY_RECOVERY_LOCAL_DIR="$WORK/recovery-local"
export BACKUP_S3_ENDPOINT=http://backup-storage:8333 BACKUP_S3_REGION=us-east-1
export BACKUP_S3_BUCKET=dr-backup-bucket
export BACKUP_S3_ACCESS_KEY_ID=dr-backup-access BACKUP_S3_SECRET_ACCESS_KEY=dr-backup-secret
export BACKUP_ALLOW_INSECURE_ENDPOINT=true
export OBJECT_STORAGE_ENDPOINT=http://object-storage:8333 OBJECT_STORAGE_REGION=us-east-1
export OBJECT_STORAGE_BUCKET=dr-source-bucket OBJECT_STORAGE_SERVICE=object-storage
export OBJECT_STORAGE_ACCESS_KEY_ID=dr-source-access OBJECT_STORAGE_SECRET_ACCESS_KEY=dr-source-secret
export BACKUP_BACKEND_IMAGE_DIGEST="example.invalid/backend@sha256:$(printf '%064d' 0)"
export BACKUP_FRONTEND_IMAGE_DIGEST="example.invalid/frontend@sha256:$(printf '%064d' 0)"
export BACKUP_MIN_FREE_BYTES=1 OBJECT_STORAGE_MIN_FREE_BYTES=1 RESTORE_MIN_FREE_BYTES=1
export BACKUP_RETENTION_DAILY=1 BACKUP_RETENTION_WEEKLY=0 BACKUP_RETENTION_MONTHLY=0

started=1
compose up -d --wait --wait-timeout 180
replacement_compose up -d --wait --wait-timeout 180
port=$(compose port postgres 5432 | sed -E 's/^.*:([0-9]+)$/\1/')
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'Disposable PostgreSQL port was not published.' >&2; exit 1; }
if ! wait_for_host_postgres "$port"; then
  echo 'Disposable PostgreSQL published port was not reachable within 75 seconds.' >&2
  compose ps || true
  compose port postgres 5432 || true
  compose logs --tail=100 postgres || true
  exit 1
fi
DATABASE_URL="postgresql://postgres:dr-disposable-only@127.0.0.1:$port/dr_fixture" \
  npm --prefix "$ROOT/backend" exec -- prisma migrate deploy \
    --schema "$ROOT/backend/prisma/schema.prisma"

printf 'disposable-delivery-evidence\n' > "$WORK/evidence.txt"
printf '%%PDF-1.4\n%% disposable fixture, not a tax document\n' > "$WORK/fiscal.pdf"
evidence_sha=$(shasum -a 256 "$WORK/evidence.txt" | cut -d ' ' -f 1)
fiscal_sha=$(shasum -a 256 "$WORK/fiscal.pdf" | cut -d ' ' -f 1)
evidence_size=$(wc -c < "$WORK/evidence.txt" | tr -d ' ')
fiscal_size=$(wc -c < "$WORK/fiscal.pdf" | tr -d ' ')
aws_source s3 cp /backup/evidence.txt s3://dr-source-bucket/evidence/dr-evidence.txt \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" --content-type text/plain --only-show-errors
aws_source s3 cp /backup/fiscal.pdf s3://dr-source-bucket/fiscal/dr-fixture.pdf \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" --content-type application/pdf --only-show-errors
pg psql -U postgres -d dr_fixture -v ON_ERROR_STOP=1 \
  -v evidence_sha="$evidence_sha" -v evidence_size="$evidence_size" \
  -v fiscal_sha="$fiscal_sha" -v fiscal_size="$fiscal_size" \
  < "$ROOT/scripts/database/dr-disposable-seed.sql"

COMPANY_RECOVERY_RESULT_DIR="$primary_result_dir" \
  bash "$ROOT/scripts/database/create-company-recovery-set.sh"
create_result=$(single_json_result "$primary_result_dir")
recovery_key=$(node - "$create_result" <<'NODE'
const result = require(process.argv[2]);
if (result.status !== 'validated' || !result.recovery_set_key || !result.recovery_point.write_barrier_at) process.exit(1);
process.stdout.write(result.recovery_set_key);
NODE
)
export RESTORE_RECOVERY_SET_KEY="$recovery_key"
export RESTORE_DATABASE_NAME=dr_fixture_restore_drill RESTORE_PRODUCTION_DATABASE_NAME=dr_fixture
export RESTORE_LOCAL_DIR="$WORK/restore-local"
cat > "$WORK/assert-restored.sql" <<'SQL'
DO $$ BEGIN
  IF (SELECT count(*) FROM "DeliveryEvidence" WHERE id = 'dr-evidence' AND "storageKey" = 'evidence/dr-evidence.txt') <> 1
    OR (SELECT count(*) FROM "FiscalArtifact" WHERE id = 'dr-fiscal-artifact' AND status = 'AVAILABLE') <> 1
    OR (SELECT count(*) FROM "Sale" WHERE id = 'dr-sale' AND total = 1) <> 1
    OR (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL) < 1
    OR (SELECT count(*) FROM pg_extension WHERE extname = 'postgis') <> 1 THEN
    RAISE EXCEPTION 'DR fixture data, migration history, or PostGIS did not survive';
  END IF;
END $$;
SQL
export RESTORE_DRILL_ASSERT_SQL_FILE="$WORK/assert-restored.sql"
restore_started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
COMPANY_RECOVERY_RESULT_DIR="$WORK/restore-results" \
  bash "$ROOT/scripts/database/restore-company-recovery-set.sh"
restore_result=$(single_json_result "$WORK/restore-results")
node - "$restore_result" <<'NODE'
const result = require(process.argv[2]);
if (result.status !== 'passed' || result.disposable_targets_cleanup !== 'cleaned') process.exit(1);
for (const name of ['recovery_set_identity', 'recovery_set_archives', 'postgresql', 'postgis', 'object_storage_restore', 'delivery_evidence', 'fiscal_artifacts', 'storage_reference_integrity']) {
  if (result.checks[name]?.status !== 'passed') throw new Error(`DR check failed: ${name}`);
}
NODE

assert_no_restore_target() {
  [[ "$(pg psql -U postgres -d postgres -Atqc "SELECT count(*) FROM pg_database WHERE datname = 'dr_fixture_restore_drill'")" == 0 ]]
}
assert_no_restore_target

export RESTORE_PRODUCTION_BUCKET=dr-source-bucket
export RESTORE_PRODUCTION_S3_ENDPOINT="$OBJECT_STORAGE_ENDPOINT"
export RESTORE_PRODUCTION_COMPOSE_PROJECT="$PROJECT"
export RESTORE_ORIGINAL_HOST_REF=dr-original-host
export RESTORE_REPLACEMENT_HOST_REF=dr-replacement-host
export RESTORE_REPLACEMENT_COMPOSE_PROJECT="$REPLACEMENT_PROJECT"
export RESTORE_REPLACEMENT_COMPOSE_FILE="$REPLACEMENT_COMPOSE_FILE"
export RESTORE_REPLACEMENT_COMPOSE_ENV_FILE="$WORK/replacement-compose.env"
export RESTORE_REPLACEMENT_NETWORK="${REPLACEMENT_PROJECT}_app_network"
export RESTORE_REPLACEMENT_DATABASE_NAME=dr_fixture_replacement
export RESTORE_REPLACEMENT_POSTGRES_SERVICE=postgres
export RESTORE_REPLACEMENT_POSTGRES_USER=postgres
export RESTORE_REPLACEMENT_POSTGRES_PASSWORD=dr-replacement-only
export RESTORE_REPLACEMENT_S3_ENDPOINT=http://replacement-storage:8333
export RESTORE_REPLACEMENT_S3_REGION=us-east-1
export RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID=dr-replacement-access
export RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY=dr-replacement-secret
export RESTORE_ALLOW_INSECURE_TARGET_ENDPOINT=true
export RESTORE_INCIDENT_REF=DR-FIXTURE-009
export RESTORE_INCIDENT_DECLARED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export RESTORE_REPLACEMENT_BUCKET="mte-replacement-dr-fixture-$(date -u +%Y%m%d%H%M%S)-$$"
export RESTORE_LOCAL_DIR="$WORK/replacement-local"
aws_backup s3 cp "s3://dr-backup-bucket/$recovery_key" /backup/replacement-set.json \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
export RESTORE_APPROVED_BACKEND_DIGEST="$(node - "$WORK/replacement-set.json" <<'NODE'
process.stdout.write(require(process.argv[2]).release_digests.backend);
NODE
)"
export RESTORE_APPROVED_FRONTEND_DIGEST="$(node - "$WORK/replacement-set.json" <<'NODE'
process.stdout.write(require(process.argv[2]).release_digests.frontend);
NODE
)"
export RESTORE_APPROVED_SCHEMA_SHA256="$(node - "$WORK/replacement-set.json" <<'NODE'
process.stdout.write(require(process.argv[2]).schema_state.sha256);
NODE
)"
cat > "$WORK/replacement-smoke.sh" <<'SH'
#!/bin/sh
set -eu
"$BACKUP_DOCKER_BIN" compose --project-name "$RESTORE_REPLACEMENT_COMPOSE_PROJECT" \
  --env-file "$RESTORE_REPLACEMENT_COMPOSE_ENV_FILE" -f "$RESTORE_REPLACEMENT_COMPOSE_FILE" \
  exec -T postgres psql -U postgres -d "$RESTORE_REPLACEMENT_DATABASE_NAME" -Atqc \
  "SELECT count(*) FROM \"Sale\" WHERE id = 'dr-sale' AND total = 1" | grep -Fxq 1
SH
chmod 700 "$WORK/replacement-smoke.sh"
export RESTORE_HEALTH_SMOKE_SCRIPT="$WORK/replacement-smoke.sh"
export RESTORE_HEALTH_SMOKE_SHA256="$(shasum -a 256 "$WORK/replacement-smoke.sh" | cut -d ' ' -f 1)"
cat > "$WORK/replacement-traffic-closed.sh" <<'SH'
#!/bin/sh
set -eu
if "$BACKUP_DOCKER_BIN" compose --project-name "$RESTORE_REPLACEMENT_COMPOSE_PROJECT" \
  --env-file "$RESTORE_REPLACEMENT_COMPOSE_ENV_FILE" -f "$RESTORE_REPLACEMENT_COMPOSE_FILE" \
  ps --status running --services | grep -Eq '^(backend|frontend|caddy)$'; then
  exit 1
fi
SH
chmod 700 "$WORK/replacement-traffic-closed.sh"
export RESTORE_TRAFFIC_CLOSED_SCRIPT="$WORK/replacement-traffic-closed.sh"
export RESTORE_TRAFFIC_CLOSED_SHA256="$(shasum -a 256 "$WORK/replacement-traffic-closed.sh" | cut -d ' ' -f 1)"
export RESTORE_CONFIRMATION="RESTORE:$COMPANY_SLUG:$RESTORE_INCIDENT_REF:$RESTORE_REPLACEMENT_COMPOSE_PROJECT"

assert_replacement_absent() {
  [[ "$(replacement_compose exec -T postgres psql -U postgres -d postgres -Atqc \
    "SELECT count(*) FROM pg_database WHERE datname = '$RESTORE_REPLACEMENT_DATABASE_NAME'")" == 0 ]]
}
assert_replacement_rejected() {
  if RESTORE_RECOVERY_SET_KEY="$recovery_key" \
     bash "$ROOT/scripts/database/restore-company-production-replacement.sh" --apply \
    >"$WORK/replacement-rejected.out" 2>"$WORK/replacement-rejected.err"; then
    echo 'Unsafe replacement restore was accepted.' >&2
    exit 1
  fi
  assert_replacement_absent
}

# A default invocation is a real preflight, never an import.
RESTORE_RECOVERY_SET_KEY="$recovery_key" \
  bash "$ROOT/scripts/database/restore-company-production-replacement.sh" \
  > "$WORK/replacement-preflight.out"
grep -Fxq 'PREFLIGHT_PASSED_NO_MUTATION: confirmation and --apply are required to restore.' \
  "$WORK/replacement-preflight.out"
assert_replacement_absent
COMPANY_SLUG=other-company assert_replacement_rejected
RESTORE_REPLACEMENT_DATABASE_NAME=dr_fixture assert_replacement_rejected
RESTORE_REPLACEMENT_BUCKET=dr-source-bucket assert_replacement_rejected
RESTORE_CONFIRMATION=invalid assert_replacement_rejected
RESTORE_APPROVED_SCHEMA_SHA256="$(printf '%064d' 0)" assert_replacement_rejected
RESTORE_REPLACEMENT_S3_ENDPOINT="$RESTORE_PRODUCTION_S3_ENDPOINT" assert_replacement_rejected
existing_replacement_bucket=mte-replacement-dr-fixture-20260101000000-999
aws_replacement s3api create-bucket --bucket "$existing_replacement_bucket" \
  --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" >/dev/null
printf 'preserve existing replacement bucket\n' > "$WORK/replacement-existing-marker.txt"
aws_replacement s3 cp /backup/replacement-existing-marker.txt \
  "s3://$existing_replacement_bucket/marker.txt" \
  --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" --only-show-errors
RESTORE_REPLACEMENT_BUCKET="$existing_replacement_bucket" assert_replacement_rejected
aws_replacement s3 cp "s3://$existing_replacement_bucket/marker.txt" \
  /backup/replacement-existing-readback.txt \
  --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" --only-show-errors
cmp "$WORK/replacement-existing-marker.txt" "$WORK/replacement-existing-readback.txt"

# Corrupt a manifest and a component independently, then restore the originals.
aws_backup s3 cp "s3://dr-backup-bucket/$recovery_key.sha256" /backup/valid-replacement-set.sha256 \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
printf 'bad checksum\n' > "$WORK/replacement-corrupt"
aws_backup s3 cp /backup/replacement-corrupt "s3://dr-backup-bucket/$recovery_key.sha256" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
assert_replacement_rejected
aws_backup s3 cp /backup/valid-replacement-set.sha256 "s3://dr-backup-bucket/$recovery_key.sha256" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors

replacement_postgres_key=$(node - "$WORK/replacement-set.json" <<'NODE'
process.stdout.write(require(process.argv[2]).postgresql.key);
NODE
)
aws_backup s3 cp "s3://dr-backup-bucket/$replacement_postgres_key" /backup/valid-replacement.dump \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
aws_backup s3 cp /backup/replacement-corrupt "s3://dr-backup-bucket/$replacement_postgres_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
assert_replacement_rejected
aws_backup s3 cp /backup/valid-replacement.dump "s3://dr-backup-bucket/$replacement_postgres_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
replacement_object_key=$(node - "$WORK/replacement-set.json" <<'NODE'
process.stdout.write(require(process.argv[2]).object_storage.key);
NODE
)
aws_backup s3 cp "s3://dr-backup-bucket/$replacement_object_key" /backup/valid-replacement-objects.tar.gz \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
aws_backup s3 cp /backup/replacement-corrupt "s3://dr-backup-bucket/$replacement_object_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
assert_replacement_rejected
aws_backup s3 cp /backup/valid-replacement-objects.tar.gz "s3://dr-backup-bucket/$replacement_object_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors

replacement_result="$WORK/replacement-ready.json"
RESTORE_RECOVERY_SET_KEY="$recovery_key" RESTORE_RESULT_FILE="$replacement_result" \
  bash "$ROOT/scripts/database/restore-company-production-replacement.sh" --apply
node - "$replacement_result" <<'NODE'
const result = require(process.argv[2]);
if (result.status !== 'READY_FOR_CUTOVER' || result.cross_reference_status !== 'passed' ||
  result.migration_schema_status !== 'passed' || result.release_compatibility_status !== 'passed' ||
  result.traffic_cutover_performed !== false || result.rpo_observed_seconds < 0 ||
  result.rto_partial_to_ready_seconds < 0) process.exit(1);
NODE
cp "$replacement_result" "$EVIDENCE_DIR/replacement-ready.json"
[[ "$(replacement_compose exec -T postgres psql -U postgres -d postgres -Atqc \
  "SELECT count(*) FROM pg_database WHERE datname = 'dr_fixture_replacement'")" == 1 ]]
[[ "$(pg psql -U postgres -d dr_fixture -Atqc \
  "SELECT count(*) FROM \"DeliveryEvidence\" WHERE id = 'dr-evidence' AND \"storageKey\" = 'evidence/dr-evidence.txt'")" == 1 ]]
aws_source s3 cp s3://dr-source-bucket/evidence/dr-evidence.txt /backup/source-preserved.txt \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" --only-show-errors
cmp "$WORK/evidence.txt" "$WORK/source-preserved.txt"
if RESTORE_RECOVERY_SET_KEY="$recovery_key" \
   bash "$ROOT/scripts/database/restore-company-production-replacement.sh" --apply \
  >"$WORK/existing-replacement.out" 2>"$WORK/existing-replacement.err"; then
  echo 'Existing replacement database was accepted.' >&2
  exit 1
fi
restored_bucket=$(node - "$restore_result" <<'NODE'
process.stdout.write(require(process.argv[2]).restore_object_storage_bucket);
NODE
)
if aws_source s3api head-bucket --bucket "$restored_bucket" \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" >/dev/null 2>&1; then
  echo 'Disposable restored bucket survived the drill cleanup.' >&2
  exit 1
fi
assert_rejected() {
  if COMPANY_RECOVERY_RESULT_DIR="$WORK/restore-results" \
     bash "$ROOT/scripts/database/restore-company-recovery-set.sh" >/dev/null 2>"$WORK/rejected.log"; then
    echo 'Corrupt or mismatched recovery set was accepted.' >&2
    exit 1
  fi
  assert_no_restore_target
  if aws_source s3api list-buckets --endpoint-url "$OBJECT_STORAGE_ENDPOINT" \
    --query 'Buckets[].Name' --output text | grep -Eq 'mte-restore-dr-fixture-'; then
    echo 'Rejected recovery left a partial Object Storage target.' >&2
    exit 1
  fi
}

postgres_key=$(node - "$create_result" <<'NODE'
process.stdout.write(require(process.argv[2]).postgresql.key);
NODE
)
object_key=$(node - "$create_result" <<'NODE'
process.stdout.write(require(process.argv[2]).object_storage.key);
NODE
)
aws_backup s3 cp "s3://dr-backup-bucket/$postgres_key" /backup/valid.dump \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
aws_backup s3 cp "s3://dr-backup-bucket/$object_key" /backup/valid.tar.gz \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
aws_backup s3 cp "s3://dr-backup-bucket/$recovery_key.sha256" /backup/valid-set.sha256 \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
printf 'corrupt dump\n' > "$WORK/corrupt"
aws_backup s3 cp /backup/corrupt "s3://dr-backup-bucket/$postgres_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
assert_rejected
aws_backup s3 cp /backup/valid.dump "s3://dr-backup-bucket/$postgres_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
aws_backup s3 cp /backup/corrupt "s3://dr-backup-bucket/$object_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
assert_rejected
aws_backup s3 cp /backup/valid.tar.gz "s3://dr-backup-bucket/$object_key" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
aws_backup s3 cp /backup/corrupt "s3://dr-backup-bucket/$recovery_key.sha256" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
assert_rejected
aws_backup s3 cp /backup/valid-set.sha256 "s3://dr-backup-bucket/$recovery_key.sha256" \
  --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
COMPANY_SLUG=other-company assert_rejected

# A bucket whose name looks disposable but already exists is never overwritten.
existing_bucket=mte-restore-dr-fixture-20260101000000-999
aws_source s3 mb "s3://$existing_bucket" --endpoint-url "$OBJECT_STORAGE_ENDPOINT" >/dev/null
aws_backup s3 cp "s3://dr-backup-bucket/${object_key}.manifest.json" \
  /backup/object.manifest.json --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
aws_backup s3 cp "s3://dr-backup-bucket/${object_key}.manifest.json.sha256" \
  /backup/object.manifest.json.sha256 --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors
if RESTORE_OBJECT_STORAGE_MANIFEST_FILE="$WORK/object.manifest.json" \
   RESTORE_OBJECT_STORAGE_CHECKSUM_FILE="$WORK/object.manifest.json.sha256" \
   RESTORE_OBJECT_STORAGE_TARGET_BUCKET="$existing_bucket" \
   RESTORE_OBJECT_STORAGE_TARGET_DISPOSABLE=true \
   bash "$ROOT/scripts/database/restore-object-storage-from-b2.sh" >/dev/null 2>"$WORK/existing-bucket.log"; then
  echo 'Existing bucket was accepted as a disposable restore target.' >&2
  exit 1
fi
aws_source s3api head-bucket --bucket "$existing_bucket" \
  --endpoint-url "$OBJECT_STORAGE_ENDPOINT" >/dev/null
assert_no_restore_target

# A failed final smoke cannot issue READY_FOR_CUTOVER after otherwise valid data checks.
# Keep this before the second same-day recovery set: retention may remove the first set.
printf '#!/bin/sh\nexit 1\n' > "$WORK/failing-smoke.sh"
chmod 700 "$WORK/failing-smoke.sh"
smoke_bucket="mte-replacement-dr-fixture-$(date -u +%Y%m%d%H%M%S)-$(( $$ + 2 ))"
if RESTORE_RECOVERY_SET_KEY="$recovery_key" \
   RESTORE_HEALTH_SMOKE_SCRIPT="$WORK/failing-smoke.sh" \
   RESTORE_HEALTH_SMOKE_SHA256="$(shasum -a 256 "$WORK/failing-smoke.sh" | cut -d ' ' -f 1)" \
   RESTORE_REPLACEMENT_DATABASE_NAME=dr_fixture_smoke_replacement \
   RESTORE_REPLACEMENT_BUCKET="$smoke_bucket" \
   RESTORE_RESULT_FILE="$WORK/smoke-failed.json" \
   bash "$ROOT/scripts/database/restore-company-production-replacement.sh" --apply \
   >"$WORK/smoke-failed.out" 2>"$WORK/smoke-failed.err"; then
  echo 'Failed smoke was accepted for cutover.' >&2
  exit 1
fi
node - "$WORK/smoke-failed.json" <<'NODE'
const result = require(process.argv[2]);
if (result.status !== 'FAILED' || result.failure_stage !== 'health_smoke' ||
  result.health_smoke_status !== 'failed' || result.cross_reference_status !== 'passed' ||
  result.postgres_restore_status !== 'passed' || result.object_storage_restore_status !== 'passed' ||
  result.migration_schema_status !== 'passed' || result.traffic_cutover_performed !== false) process.exit(1);
NODE
cp "$WORK/smoke-failed.json" "$EVIDENCE_DIR/replacement-smoke-failed.json"

# A self-consistent recovery set can still contain a broken DB-to-object reference.
# Change only the disposable fixture while capturing it, then restore the source row.
unset RESTORE_RECOVERY_SET_KEY
export BACKUP_RETENTION_DAILY=2
pg psql -U postgres -d dr_fixture -v ON_ERROR_STOP=1 -c \
  "UPDATE \"DeliveryEvidence\" SET \"storageKey\" = 'evidence/missing.txt' WHERE id = 'dr-evidence'" >/dev/null
COMPANY_RECOVERY_RESULT_DIR="$broken_result_dir" \
  bash "$ROOT/scripts/database/create-company-recovery-set.sh"
pg psql -U postgres -d dr_fixture -v ON_ERROR_STOP=1 -c \
  "UPDATE \"DeliveryEvidence\" SET \"storageKey\" = 'evidence/dr-evidence.txt' WHERE id = 'dr-evidence'" >/dev/null
bad_create_result=$(single_json_result "$broken_result_dir")
bad_recovery_key=$(node - "$bad_create_result" <<'NODE'
const result = require(process.argv[2]);
if (result.status !== 'validated' || !result.recovery_set_key) process.exit(1);
process.stdout.write(result.recovery_set_key);
NODE
)
[[ -n "$bad_recovery_key" && "$bad_recovery_key" != "$recovery_key" ]] || {
  echo 'Broken-reference recovery key is missing or matches the primary set.' >&2
  exit 1
}
export RESTORE_INCIDENT_DECLARED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
bad_bucket="mte-replacement-dr-fixture-$(date -u +%Y%m%d%H%M%S)-$(( $$ + 1 ))"
reference_exit_status=0
if RESTORE_RECOVERY_SET_KEY="$bad_recovery_key" \
   RESTORE_REPLACEMENT_DATABASE_NAME=dr_fixture_reference_replacement \
   RESTORE_REPLACEMENT_BUCKET="$bad_bucket" \
   RESTORE_RESULT_FILE="$WORK/reference-failed.json" \
   bash "$ROOT/scripts/database/restore-company-production-replacement.sh" --apply \
   >"$WORK/reference-failed.out" 2>"$WORK/reference-failed.err"; then
  :
else
  reference_exit_status=$?
fi
python3 - "$WORK/reference-failed.out" "$WORK/reference-failed.err" "$EVIDENCE_DIR" <<'PY'
import os
from pathlib import Path
import sys

secrets = [os.environ.get(name, "") for name in (
    "BACKUP_POSTGRES_PASSWORD", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY",
    "OBJECT_STORAGE_ACCESS_KEY_ID", "OBJECT_STORAGE_SECRET_ACCESS_KEY",
    "RESTORE_REPLACEMENT_POSTGRES_PASSWORD", "RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID",
    "RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY",
)]
for source in map(Path, sys.argv[1:3]):
    diagnostic = source.read_text(encoding="utf-8", errors="replace")
    for secret in secrets:
        if secret:
            diagnostic = diagnostic.replace(secret, "[REDACTED]")
    (Path(sys.argv[3]) / f"replacement-{source.name}").write_text(diagnostic, encoding="utf-8")
PY
if [[ -f "$WORK/reference-failed.json" ]]; then
  cp "$WORK/reference-failed.json" "$EVIDENCE_DIR/replacement-reference-failed.json"
else
  echo 'Broken-reference replacement result is missing; see captured diagnostics.' >&2
  exit 1
fi
if (( reference_exit_status == 0 )); then
  echo 'Broken storage reference was accepted for cutover.' >&2
  exit 1
fi
node - "$WORK/reference-failed.json" <<'NODE'
const result = require(process.argv[2]);
if (result.status !== 'FAILED' || result.failure_stage !== 'storage_reference_verification' ||
  result.postgres_restore_status !== 'passed' || result.object_storage_restore_status !== 'passed' ||
  result.migration_schema_status !== 'passed' || result.cross_reference_status !== 'failed' ||
  result.traffic_cutover_performed !== false) process.exit(1);
NODE
[[ "$(replacement_compose exec -T postgres psql -U postgres -d postgres -Atqc \
  "SELECT count(*) FROM pg_database WHERE datname = 'dr_fixture_reference_replacement'")" == 1 ]]
aws_replacement s3api head-bucket --bucket "$bad_bucket" \
  --endpoint-url "$RESTORE_REPLACEMENT_S3_ENDPOINT" >/dev/null
[[ "$(pg psql -U postgres -d dr_fixture -Atqc \
  "SELECT count(*) FROM \"DeliveryEvidence\" WHERE id = 'dr-evidence' AND \"storageKey\" = 'evidence/dr-evidence.txt'")" == 1 ]]

python3 - "$create_result" "$restore_result" "$restore_started_at" "$replacement_result" "$EVIDENCE_DIR/dr-runtime.json" <<'PY'
import datetime
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    backup = json.load(stream)
with open(sys.argv[2], encoding="utf-8") as stream:
    restore = json.load(stream)
with open(sys.argv[4], encoding="utf-8") as stream:
    replacement = json.load(stream)
def instant(value):
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
point = backup["recovery_point"]
barrier = instant(point["write_barrier_at"])
finish = instant(restore["finished_at"])
payload = {
    "status": "passed",
    "write_barrier_at": point["write_barrier_at"],
    "recovery_set_finished_at": backup["finished_at"],
    "restore_started_at": sys.argv[3],
    "postgres_restore_finished_at": restore["postgres_restore_finished_at"],
    "object_storage_restore_finished_at": restore["object_storage_restore_finished_at"],
    "cross_reference_finished_at": restore["cross_reference_finished_at"],
    "recovery_finished_at": restore["finished_at"],
    "quiesce_seconds": (barrier - instant(point["quiesce_requested_at"])).total_seconds(),
    "backup_seconds": (instant(backup["finished_at"]) - barrier).total_seconds(),
    "exercise_rto_seconds": (finish - instant(sys.argv[3])).total_seconds(),
    "rpo_24h_margin_seconds": 86400 - (finish - barrier).total_seconds(),
    "corruption_cases_rejected": ["postgres_dump", "object_archive", "manifest_checksum", "company_slug"],
    "existing_bucket_preserved": True,
    "replacement_status": replacement["status"],
    "replacement_rpo_observed_seconds": replacement["rpo_observed_seconds"],
    "replacement_rto_partial_to_ready_seconds": replacement["rto_partial_to_ready_seconds"],
    "replacement_original_targets_preserved": True,
}
if payload["rpo_24h_margin_seconds"] <= 0:
    raise SystemExit("Fixture exceeded the 24h RPO")
with open(sys.argv[5], "w", encoding="utf-8") as stream:
    json.dump(payload, stream, sort_keys=True)
    stream.write("\n")
print(json.dumps(payload, sort_keys=True))
PY
