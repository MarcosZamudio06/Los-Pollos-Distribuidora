#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
COMPOSE_FILE="$ROOT/scripts/database/dr-disposable.compose.yml"
DOCKER=${BACKUP_DOCKER_BIN:-docker}
PROJECT="dr$(date -u +%Y%m%d%H%M%S)$$"
[[ "$PROJECT" =~ ^dr[0-9]{14}[0-9]+$ ]] || exit 2
WORK=$(mktemp -d "${TMPDIR:-/tmp}/dr-runtime.XXXXXX")
EVIDENCE_DIR=${DR_EVIDENCE_DIR:-$WORK/evidence}
mkdir -p "$EVIDENCE_DIR"
started=0

compose() { "$DOCKER" compose --project-name "$PROJECT" -f "$COMPOSE_FILE" "$@"; }
pg() { compose exec -T postgres "$@"; }
aws_source() {
  AWS_ACCESS_KEY_ID=dr-source-access AWS_SECRET_ACCESS_KEY=dr-source-secret \
    AWS_DEFAULT_REGION=us-east-1 AWS_EC2_METADATA_DISABLED=true \
    "$DOCKER" run --rm --network "${PROJECT}_app_network" \
      -v "$WORK:/backup:rw" -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
      -e AWS_DEFAULT_REGION -e AWS_EC2_METADATA_DISABLED \
      "$BACKUP_UPLOAD_IMAGE" "$@"
}
aws_backup() {
  AWS_ACCESS_KEY_ID=dr-backup-access AWS_SECRET_ACCESS_KEY=dr-backup-secret \
    AWS_DEFAULT_REGION=us-east-1 AWS_EC2_METADATA_DISABLED=true \
    "$DOCKER" run --rm --network "${PROJECT}_app_network" \
      -v "$WORK:/backup:rw" -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
      -e AWS_DEFAULT_REGION -e AWS_EC2_METADATA_DISABLED \
      "$BACKUP_UPLOAD_IMAGE" "$@"
}
cleanup() {
  local status=$?
  trap - EXIT
  if (( started == 1 )); then
    if ! compose down --volumes --remove-orphans >/dev/null; then
      echo 'Disposable DR Compose cleanup failed.' >&2
      status=1
    fi
    if "$DOCKER" network inspect "${PROJECT}_app_network" >/dev/null 2>&1; then
      echo 'Disposable DR network still exists after cleanup.' >&2
      status=1
    fi
    if [[ -n "$("$DOCKER" ps -aq --filter "label=com.docker.compose.project=$PROJECT")" ]]; then
      echo 'Disposable DR containers still exist after cleanup.' >&2
      status=1
    fi
  fi
  printf '{"status":"%s","project":"%s","targets_removed":%s}\n' \
    "$([[ "$status" == 0 ]] && echo passed || echo failed)" "$PROJECT" \
    "$([[ "$status" == 0 ]] && echo true || echo false)" > "$EVIDENCE_DIR/cleanup.json"
  if [[ -z "${DR_EVIDENCE_DIR:-}" ]]; then
    rm -rf -- "$WORK"
  fi
  exit "$status"
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
export COMPANY_SLUG=dr-fixture
export BACKUP_POSTGRES_DATABASE=dr_fixture BACKUP_POSTGRES_USER=postgres
export BACKUP_POSTGRES_PASSWORD=dr-disposable-only
export BACKUP_LOCAL_DIR="$WORK/backup-local" BACKUP_RESULT_DIR="$WORK/backup-results"
export COMPANY_RECOVERY_RESULT_DIR="$WORK/recovery-results"
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
port=$(compose port postgres 5432 | sed -E 's/^.*:([0-9]+)$/\1/')
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'Disposable PostgreSQL port was not published.' >&2; exit 1; }
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

bash "$ROOT/scripts/database/create-company-recovery-set.sh"
create_result=$(find "$WORK/recovery-results" -maxdepth 1 -name '*.json' -type f -print -quit)
[[ -n "$create_result" ]] || { echo 'Recovery-set result missing.' >&2; exit 1; }
recovery_key=$(node - "$create_result" <<'NODE'
const result = require(process.argv[2]);
if (result.status !== 'validated' || !result.recovery_set_key || !result.recovery_point.write_barrier_at) process.exit(1);
process.stdout.write(result.recovery_set_key);
NODE
)
export RESTORE_RECOVERY_SET_KEY="$recovery_key"
export RESTORE_DATABASE_NAME=dr_fixture_restore_drill RESTORE_PRODUCTION_DATABASE_NAME=dr_fixture
export RESTORE_LOCAL_DIR="$WORK/restore-local" COMPANY_RECOVERY_RESULT_DIR="$WORK/restore-results"
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
bash "$ROOT/scripts/database/restore-company-recovery-set.sh"
restore_result=$(find "$WORK/restore-results" -maxdepth 1 -name '*.json' -type f -print -quit)
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
  if bash "$ROOT/scripts/database/restore-company-recovery-set.sh" >/dev/null 2>"$WORK/rejected.log"; then
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

python3 - "$create_result" "$restore_result" "$restore_started_at" "$EVIDENCE_DIR/dr-runtime.json" <<'PY'
import datetime
import json
import sys

with open(sys.argv[1], encoding="utf-8") as stream:
    backup = json.load(stream)
with open(sys.argv[2], encoding="utf-8") as stream:
    restore = json.load(stream)
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
}
if payload["rpo_24h_margin_seconds"] <= 0:
    raise SystemExit("Fixture exceeded the 24h RPO")
with open(sys.argv[4], "w", encoding="utf-8") as stream:
    json.dump(payload, stream, sort_keys=True)
    stream.write("\n")
print(json.dumps(payload, sort_keys=True))
PY
