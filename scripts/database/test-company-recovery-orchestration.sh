#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
SCRIPT="$ROOT/scripts/database/create-company-recovery-set.sh"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/company-recovery-test.XXXXXX")
trap 'rm -rf -- "$TEST_ROOT"' EXIT
mkdir -p "$TEST_ROOT/bin"

cat > "$TEST_ROOT/bin/flock" <<'MOCK_FLOCK'
#!/usr/bin/env bash
exit 0
MOCK_FLOCK

cat > "$TEST_ROOT/bin/df" <<'MOCK_DF'
#!/usr/bin/env bash
set -euo pipefail
available_kib=$((${FAKE_AVAILABLE_BYTES:-107374182400} / 1024))
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
printf 'fake 104857600 0 %s 0%% /tmp\n' "$available_kib"
MOCK_DF

cat > "$TEST_ROOT/bin/docker" <<'MOCK_DOCKER'
#!/usr/bin/env bash
set -euo pipefail
record() { printf '%s|%s\n' "$COMPANY_SLUG" "$1" >> "$FAKE_LOG"; }
contains() { local want=$1; shift; for arg in "$@"; do [[ "$arg" == "$want" ]] && return 0; done; return 1; }

if [[ "$1" == inspect ]]; then
  template=${3:-}
  target=${4:-}
  case "$target" in fake-postgres-container) service=postgres;; fake-object-storage-container) service=object-storage;; *) service=backend;; esac
  record "health-$service"
  if [[ "$template" == *Health.Status* ]]; then
    [[ "${FAKE_FAIL:-}" != "${service}-health" ]] || { echo unhealthy; exit 1; }
    echo healthy
  else echo 0; fi
  exit 0
fi

if [[ "$1" == compose ]]; then
  action=
  for arg in "$@"; do case "$arg" in ps|exec|stop|start) action=$arg;; esac; done
  case "$action" in
    ps)
      service=
      for arg in "$@"; do case "$arg" in postgres|object-storage|backend) service=$arg;; esac; done
      if contains -q "$@"; then [[ -n "$service" ]] && echo "fake-$service-container"
      elif contains --services "$@"; then
        printf 'postgres\nobject-storage\n'
        [[ "$(cat "$FAKE_STATE")" == running ]] && echo backend
      fi
      exit 0;;
    stop)
      record backend-stop
      [[ "${FAKE_FAIL:-}" != stop ]] || exit 31
      echo stopped > "$FAKE_STATE"; exit 0;;
    start)
      record backend-start
      if [[ "${FAKE_FAIL:-}" == start ]]; then exit 32; fi
      if [[ "${FAKE_FAIL:-}" == start-once && ! -f "$FAKE_STATE.start-failed" ]]; then
        touch "$FAKE_STATE.start-failed"
        exit 32
      fi
      echo running > "$FAKE_STATE"; exit 0;;
    exec)
      command=
      for arg in "$@"; do case "$arg" in pg_isready|pg_dump|pg_restore|psql) command=$arg;; esac; done
      record "compose-$command"
      case "$command" in
        pg_isready) [[ "${FAKE_FAIL:-}" != postgres-ready ]];;
        pg_dump) [[ "${FAKE_FAIL:-}" != postgres ]] || exit 34; printf 'postgres-dump-%s' "$COMPANY_SLUG";;
        psql) echo '[{"migration_name":"20260913000000_fixture","checksum":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","finished_at":"2026-09-13T12:00:00.000Z"}]';;
      esac
      exit 0;;
  esac
fi

if [[ "$1" == run ]]; then
  shift; mount=
  while (($#)); do
    case "$1" in
      -v) mount=$2; shift 2;;
      -e|--network) shift 2;;
      --rm) shift;;
      fake/aws-cli) shift; break;;
      *) shift;;
    esac
  done
  root=${mount%%:/backup:*}; cmd=$1; sub=$2
  if [[ "$cmd $sub" == 's3api head-bucket' ]]; then
    record object-head-bucket
    [[ "${FAKE_FAIL:-}" != object-head ]] || exit 38
    if [[ "${FAKE_FAIL:-}" == object-head-late ]] &&
      [[ $(grep -Fc "$COMPANY_SLUG|object-head-bucket" "$FAKE_LOG") -ge 2 ]]; then exit 38; fi
    exit
  fi
  if [[ "$cmd $sub" == 's3api list-objects-v2' ]]; then
    bucket= prefix= previous=
    for arg in "$@"; do
      [[ "$previous" != --bucket ]] || bucket=$arg
      [[ "$previous" != --prefix ]] || prefix=$arg
      previous=$arg
    done
    if [[ "$bucket" == "$OBJECT_STORAGE_BUCKET" && -z "$prefix" ]]; then
      record object-size-inventory
      [[ "${FAKE_FAIL:-}" != source-list ]] || exit 42
      printf '%s\n' "${FAKE_OBJECT_STORAGE_SOURCE_SIZES:-1024}"
      exit 0
    fi
    record retention-list
    [[ "${FAKE_FAIL:-}" != retention-list ]] || exit 42
    python3 - "$FAKE_S3_ROOT/remote/$bucket" "$prefix" <<'PY'
import json, os, sys
root, prefix = sys.argv[1:]
contents = []
if os.path.isdir(root):
    for directory, _, names in os.walk(root):
        for name in names:
            path = os.path.join(directory, name)
            key = os.path.relpath(path, root).replace(os.sep, "/")
            if key.startswith(prefix):
                contents.append({"Key": key, "Size": os.path.getsize(path)})
print(json.dumps({"Contents": sorted(contents, key=lambda item: item["Key"])}))
PY
    exit
  fi
  if [[ "$cmd $sub" == 's3 sync' && "${3:-}" == s3://* ]]; then
    record object-sync
    mkdir -p "$root/data/evidence"
    echo "object-$COMPANY_SLUG" > "$root/data/evidence/$COMPANY_SLUG.bin"
    [[ "${FAKE_FAIL:-}" != object-storage ]] || exit 36
    if [[ "${FAKE_FAIL:-}" == interrupted ]]; then kill -TERM "$PPID"; exit 0; fi
    if [[ "${FAKE_FAIL:-}" == parent-interrupted ]]; then
      while [[ ! -s "$FAKE_COORDINATOR_PID_FILE" ]]; do sleep 0.01; done
      coordinator_pid=$(cat "$FAKE_COORDINATOR_PID_FILE")
      kill -TERM "$coordinator_pid"
      exit 0
    fi
    exit 0
  fi
  if [[ "$cmd $sub" == 's3 cp' ]]; then
    source=$3; destination=$4; remote_root="$FAKE_S3_ROOT/remote"
    if [[ "${FAKE_FAIL:-}" == object-upload &&
      "$source" == /backup/objects.tar.gz && "$destination" == s3://*/object-storage/* ]]; then
      record object-upload-failed
      exit 39
    fi
    if [[ "$source" == /backup/* ]]; then
      local_file="$root/${source#/backup/}"; remote_file="$remote_root/${destination#s3://}"
      mkdir -p "$(dirname -- "$remote_file")"; cp "$local_file" "$remote_file"
    else
      remote_file="$remote_root/${source#s3://}"; local_file="$root/${destination#/backup/}"
      mkdir -p "$(dirname -- "$local_file")"; cp "$remote_file" "$local_file"
    fi
    record s3-copy; exit 0
  fi
  if [[ "$cmd $sub" == 's3 rm' ]]; then
    source=$3; remote_root="$FAKE_S3_ROOT/remote"
    remote_file="$remote_root/${source#s3://}"
    rm -f -- "$remote_file"
    record retention-delete; exit 0
  fi
  if [[ "$cmd $sub" == 's3api head-object' ]]; then
    bucket= key= previous=
    for arg in "$@"; do [[ "$previous" != --bucket ]] || bucket=$arg; [[ "$previous" != --key ]] || key=$arg; previous=$arg; done
    file="$FAKE_S3_ROOT/remote/$bucket/$key"; [[ -f "$file" ]]; wc -c < "$file" | tr -d '[:space:]'; exit 0
  fi
  exit 0
fi
exit 0
MOCK_DOCKER
chmod 700 "$TEST_ROOT/bin/flock" "$TEST_ROOT/bin/df" "$TEST_ROOT/bin/docker"

reset_case() {
  local company=$1
  CASE_ROOT="$TEST_ROOT/$company"
  mkdir -p "$CASE_ROOT/local/postgres/results" "$CASE_ROOT/local/company-results" "$CASE_ROOT/local/recovery-sets" "$CASE_ROOT/s3"
  echo running > "$CASE_ROOT/backend.state"
  printf 'BACKEND_IMAGE=ghcr.io/example/backend@sha256:%064d\nFRONTEND_IMAGE=ghcr.io/example/frontend@sha256:%064d\n' 1 2 > "$CASE_ROOT/compose.env"
  export COMPANY_SLUG="$company" BACKUP_DOCKER_BIN="$TEST_ROOT/bin/docker" BACKUP_UPLOAD_IMAGE=fake/aws-cli
  export BACKUP_UPLOAD_NETWORK="tenant-${company}_app_network" BACKUP_COMPOSE_PROJECT_NAME="tenant-${company}"
  export BACKUP_COMPOSE_FILE="$ROOT/docker-compose.production.yml" BACKUP_COMPOSE_ENV_FILE="$CASE_ROOT/compose.env"
  export BACKUP_POSTGRES_SERVICE=postgres BACKUP_POSTGRES_USER=postgres BACKUP_POSTGRES_DATABASE="tenant_${company//-/_}"
  export BACKUP_POSTGRES_PASSWORD=non-output-postgres-secret-marker
  export BACKUP_LOCAL_DIR="$CASE_ROOT/local/postgres" BACKUP_RESULT_DIR="$CASE_ROOT/local/postgres/results"
  export COMPANY_RECOVERY_RESULT_DIR="$CASE_ROOT/local/company-results" COMPANY_RECOVERY_LOCAL_DIR="$CASE_ROOT/local/recovery-sets"
  export BACKUP_S3_ENDPOINT=https://backup.example.test BACKUP_S3_REGION=us-east-1 BACKUP_S3_BUCKET="backup-$company"
  export BACKUP_S3_ACCESS_KEY_ID=non-output-backup-access-marker BACKUP_S3_SECRET_ACCESS_KEY=non-output-backup-secret-marker
  export BACKUP_MIN_FREE_BYTES=1 OBJECT_STORAGE_BUCKET="$company-objects" OBJECT_STORAGE_ENDPOINT=http://object-storage:8333
  export OBJECT_STORAGE_SERVICE=object-storage OBJECT_STORAGE_REGION=us-east-1
  export OBJECT_STORAGE_ACCESS_KEY_ID=non-output-object-access-marker OBJECT_STORAGE_SECRET_ACCESS_KEY=non-output-object-secret-marker
  export OBJECT_STORAGE_MIN_FREE_BYTES=1 FAKE_STATE="$CASE_ROOT/backend.state" FAKE_LOG="$CASE_ROOT/docker.log"
  export FAKE_S3_ROOT="$CASE_ROOT/s3" FAKE_FAIL="${2:-}" FAKE_AVAILABLE_BYTES=107374182400
  export FAKE_OBJECT_STORAGE_SOURCE_SIZES=1024 PATH="$TEST_ROOT/bin:$PATH"
}

assert_failure() {
  local expected=$1
  local report
  report=$(find "$COMPANY_RECOVERY_RESULT_DIR" -maxdepth 1 -name '*.json' -print | head -n 1)
  if [[ -z "$report" ]]; then
    cat "$CASE_ROOT/stderr" >&2
    echo "Missing recovery diagnostic result in $COMPANY_RECOVERY_RESULT_DIR." >&2
    exit 1
  fi
  python3 - "$report" "$COMPANY_SLUG" "$expected" <<'PY'
import json, sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
assert data["status"] == "failed" and data["company_slug"] == sys.argv[2], data
assert data["failure_stage"] == sys.argv[3], data
assert data["started_at"] and data["finished_at"], data
assert all(marker not in open(sys.argv[1], encoding="utf-8").read() for marker in [
    "non-output-postgres-secret-marker", "non-output-backup-secret-marker", "non-output-object-secret-marker"
]), data
PY
if grep -E 'non-output-(postgres|backup|object)-(access|secret)-marker' "$CASE_ROOT/stderr"; then echo 'Secret marker leaked to failure logs.' >&2; exit 1; fi
[[ "$(cat "$FAKE_STATE")" == running ]] || { echo 'Backend was not restored after failure.' >&2; exit 1; }
  [[ ! -d "$FAKE_S3_ROOT/remote/$BACKUP_S3_BUCKET/recovery-sets/$COMPANY_SLUG" ]] || { echo 'Incomplete recovery manifest was published.' >&2; exit 1; }
}

reset_case acme
if ! output=$(bash "$SCRIPT" 2>"$CASE_ROOT/stderr"); then cat "$CASE_ROOT/stderr" >&2; echo 'Expected normal recovery to pass.' >&2; exit 1; fi
[[ "$output" == *'Company recovery set validated:'* ]]
[[ "$output" != *non-output-* ]] || { echo 'Secret leaked to output.' >&2; exit 1; }
log=$(cat "$FAKE_LOG")
for event in backend-stop compose-pg_dump object-head-bucket object-sync backend-start; do
  [[ "$log" == *"acme|$event"* ]] || { echo "Missing event: $event" >&2; exit 1; }
done
stop_line=$(grep -n 'acme|backend-stop' "$FAKE_LOG" | head -n 1 | cut -d: -f1)
postgres_health_line=$(grep -n 'acme|health-postgres' "$FAKE_LOG" | head -n 1 | cut -d: -f1)
object_health_line=$(grep -n 'acme|health-object-storage' "$FAKE_LOG" | head -n 1 | cut -d: -f1)
backend_health_line=$(grep -n 'acme|health-backend' "$FAKE_LOG" | head -n 1 | cut -d: -f1)
first_head_line=$(grep -n 'acme|object-head-bucket' "$FAKE_LOG" | head -n 1 | cut -d: -f1)
dump_line=$(grep -n 'acme|compose-pg_dump' "$FAKE_LOG" | head -n 1 | cut -d: -f1)
second_head_line=$(grep -n 'acme|object-head-bucket' "$FAKE_LOG" | tail -n 1 | cut -d: -f1)
sync_line=$(grep -n 'acme|object-sync' "$FAKE_LOG" | head -n 1 | cut -d: -f1)
start_line=$(grep -n 'acme|backend-start' "$FAKE_LOG" | head -n 1 | cut -d: -f1)
[[ "$postgres_health_line" -lt "$stop_line" && "$object_health_line" -lt "$stop_line" &&
   "$backend_health_line" -lt "$stop_line" && "$first_head_line" -lt "$stop_line" &&
   "$stop_line" -lt "$dump_line" && "$dump_line" -lt "$second_head_line" &&
   "$second_head_line" -lt "$sync_line" && "$sync_line" -lt "$start_line" ]] || {
  echo 'Health checks, capture, or backend restoration occurred out of order.' >&2
  exit 1
}
[[ "$log" != *'postgres-stop'* && "$log" != *'object-storage-stop'* ]] || { echo 'A stateful service was stopped unnecessarily.' >&2; exit 1; }
[[ "$(cat "$FAKE_STATE")" == running ]]
report=$(find "$COMPANY_RECOVERY_RESULT_DIR" -maxdepth 1 -name '*.json' -print | head -n 1)
python3 - "$report" "$COMPANY_SLUG" "$FAKE_S3_ROOT" "$BACKUP_S3_BUCKET" <<'PY'
import datetime, json, os, sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
assert data["status"] == "validated" and data["company_slug"] == sys.argv[2], data
assert data["components"] == {"postgresql":"validated", "object_storage":"validated"}, data
assert data["postgresql"]["key"].startswith("postgres/"), data
assert data["postgresql"]["key"].startswith("postgres/" + sys.argv[2] + "/"), data
assert data["postgresql"]["size_bytes"] > 0 and len(data["postgresql"]["sha256"]) == 64, data
assert data["object_storage"]["key"].startswith("object-storage/" + sys.argv[2] + "/"), data
assert data["object_storage"]["size_bytes"] > 0 and len(data["object_storage"]["sha256"]) == 64, data
assert data["recovery_set_checksum_key"] == data["recovery_set_key"] + ".sha256", data
p=data["recovery_point"]
assert p["write_barrier_at"] <= p["capture_started_at"] <= p["capture_finished_at"] <= p["write_barrier_released_at"], p
path=os.path.join(sys.argv[3], "remote", sys.argv[4], data["recovery_set_key"])
manifest=json.load(open(path, encoding="utf-8"))
barrier = lambda value: datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
assert barrier(data["started_at"]) <= barrier(p["quiesce_requested_at"]) <= barrier(p["write_barrier_at"]), data
assert barrier(p["write_barrier_released_at"]) <= barrier(data["finished_at"]), data
assert p["write_barrier_released_at"] == p["writes_resumed_at"], p
assert manifest["company_slug"] == sys.argv[2] and barrier(manifest["recovery_point"]["write_barrier_at"]) == barrier(p["write_barrier_at"]), (manifest, data)
assert data["retention"]["status"] == "applied", data
assert manifest["object_storage"]["key"].startswith("object-storage/" + sys.argv[2] + "/"), manifest
postgres_component=os.path.join(sys.argv[3], "remote", sys.argv[4], manifest["postgresql"]["manifest_key"])
assert json.load(open(postgres_component, encoding="utf-8"))["company_slug"] == sys.argv[2], manifest
assert barrier(p["write_barrier_at"]) <= barrier(manifest["postgresql"]["created_at"]) <= barrier(p["capture_finished_at"]), manifest
assert barrier(p["write_barrier_at"]) <= barrier(manifest["object_storage"]["created_at"]) <= barrier(p["capture_finished_at"]), manifest
PY
if grep -R -E 'non-output-(postgres|backup|object)-(access|secret)-marker' "$CASE_ROOT/local/company-results" "$CASE_ROOT/s3/remote" "$CASE_ROOT/docker.log" "$CASE_ROOT/stderr"; then echo 'Secret marker leaked to result, manifest, or logs.' >&2; exit 1; fi
printf 'PASS: coherent success and operational-state restoration\n'

reset_case acme-pg postgres
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected PostgreSQL failure.' >&2; exit 1; fi
assert_failure postgres-backup
python3 - "$(find "$COMPANY_RECOVERY_RESULT_DIR" -maxdepth 1 -name '*.json' -print | head -n 1)" <<'PY'
import json, sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
assert data["components"]["postgresql"] == "failed" and data["components"]["object_storage"] == "not-started", data
PY
[[ "$(cat "$FAKE_LOG")" != *object-sync* ]]
printf 'PASS: PostgreSQL failure leaves no validated set and resumes ERP\n'

reset_case acme-objects object-storage
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected Object Storage failure.' >&2; exit 1; fi
assert_failure object-storage-backup
python3 - "$(find "$COMPANY_RECOVERY_RESULT_DIR" -maxdepth 1 -name '*.json' -print | head -n 1)" <<'PY'
import json, sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
assert data["components"]["postgresql"] == "validated" and data["components"]["object_storage"] == "failed", data
PY
printf 'PASS: Object Storage failure leaves no validated set and resumes ERP\n'

reset_case acme-interrupted interrupted
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected interrupted backup failure.' >&2; exit 1; fi
assert_failure object-storage-backup
printf 'PASS: interruption runs fail-safe cleanup\n'

reset_case acme-parent-interrupted parent-interrupted
export FAKE_COORDINATOR_PID_FILE="$CASE_ROOT/coordinator.pid"
bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr" &
coordinator_pid=$!
printf '%s\n' "$coordinator_pid" > "$FAKE_COORDINATOR_PID_FILE"
if wait "$coordinator_pid"; then echo 'Expected coordinator interruption to fail the backup.' >&2; exit 1; fi
assert_failure object-storage-backup
python3 - "$(find "$COMPANY_RECOVERY_RESULT_DIR" -maxdepth 1 -name '*.json' -print | head -n 1)" <<'PY'
import json, sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
assert data["components"]["object_storage"] == "interrupted", data
PY
printf 'PASS: coordinator signal trap records interruption and restores backend\n'

reset_case acme-health postgres-health
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected unhealthy PostgreSQL to stop the backup.' >&2; exit 1; fi
assert_failure preflight
[[ "$(cat "$FAKE_LOG")" != *backend-stop* ]] || { echo 'Unhealthy PostgreSQL unnecessarily stopped the ERP.' >&2; exit 1; }
printf 'PASS: unhealthy PostgreSQL fails before maintenance begins\n'

reset_case acme-backend-health backend-health
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected unhealthy backend to stop the backup.' >&2; exit 1; fi
assert_failure preflight
[[ "$(cat "$FAKE_LOG")" != *backend-stop* ]] || { echo 'Unhealthy backend unnecessarily entered maintenance.' >&2; exit 1; }
printf 'PASS: unhealthy backend fails before maintenance begins\n'

reset_case acme-storage-health object-storage-health
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected unhealthy Object Storage to stop the backup.' >&2; exit 1; fi
assert_failure preflight
[[ "$(cat "$FAKE_LOG")" != *backend-stop* ]] || { echo 'Unhealthy Object Storage unnecessarily entered maintenance.' >&2; exit 1; }
printf 'PASS: unhealthy Object Storage fails before maintenance begins\n'

reset_case acme-storage-bucket object-head
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected inaccessible Object Storage bucket to stop the backup.' >&2; exit 1; fi
assert_failure preflight
[[ "$(cat "$FAKE_LOG")" != *backend-stop* ]] || { echo 'Inaccessible Object Storage bucket unnecessarily entered maintenance.' >&2; exit 1; }
printf 'PASS: Object Storage bucket probe fails before maintenance begins\n'

reset_case acme-space
export FAKE_AVAILABLE_BYTES=2097152 FAKE_OBJECT_STORAGE_SOURCE_SIZES=104857600
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then
  echo 'Expected the Object Storage staging-space preflight to fail.' >&2
  exit 1
fi
assert_failure object-storage-space-preflight
[[ "$(cat "$FAKE_STATE")" == running ]]
[[ "$(cat "$FAKE_LOG")" != *backend-stop* ]] || { echo 'Insufficient disk space unnecessarily entered maintenance.' >&2; exit 1; }
[[ "$(cat "$FAKE_LOG")" != *object-sync* ]] || { echo 'Insufficient disk space started the bucket export.' >&2; exit 1; }
printf 'PASS: insufficient Object Storage staging space fails before quiesce or export\n'

reset_case acme-storage-late object-head-late
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected Object Storage to fail its second readiness check.' >&2; exit 1; fi
assert_failure object-storage-preflight
printf 'PASS: Object Storage is rechecked before its capture stage\n'

reset_case acme-quiesce-stop stop
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected backend quiesce failure.' >&2; exit 1; fi
assert_failure quiesce-backend
python3 - "$(find "$COMPANY_RECOVERY_RESULT_DIR" -maxdepth 1 -name '*.json' -print | head -n 1)" <<'PY'
import json, sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
assert data["backend_restoration"] == "restored", data
PY
printf 'PASS: backend stop failure invokes operational-state cleanup\n'

reset_case acme-start-retry start-once
if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then echo 'Expected first backend-start failure to keep the recovery run failed.' >&2; exit 1; fi
assert_failure resume-backend
python3 - "$(find "$COMPANY_RECOVERY_RESULT_DIR" -maxdepth 1 -name '*.json' -print | head -n 1)" <<'PY'
import json, sys
data=json.load(open(sys.argv[1], encoding="utf-8"))
assert data["backend_restoration"] == "restored", data
PY
printf 'PASS: cleanup retries backend restoration and records the failed stage\n'

reset_case acme-stopped
echo stopped > "$FAKE_STATE"
bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"
[[ "$(cat "$FAKE_STATE")" == stopped ]]
[[ "$(cat "$FAKE_LOG")" != *backend-stop* && "$(cat "$FAKE_LOG")" != *backend-start* ]]
printf 'PASS: pre-existing stopped backend remains stopped\n'

reset_case company-north
bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"
reset_case company-south
bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"
[[ -d "$TEST_ROOT/company-north/s3/remote/backup-company-north/recovery-sets/company-north" ]]
[[ -d "$TEST_ROOT/company-south/s3/remote/backup-company-south/recovery-sets/company-south" ]]
[[ ! -d "$TEST_ROOT/company-north/s3/remote/backup-company-north/recovery-sets/company-south" ]]
[[ ! -d "$TEST_ROOT/company-south/s3/remote/backup-company-south/recovery-sets/company-north" ]]
printf 'PASS: company storage and manifest namespaces remain isolated\n'

reset_case acme-object-failed object-upload
export BACKUP_FAILED_KEEP_COUNT=1
for attempt in 1 2 3; do
  if bash "$SCRIPT" >/dev/null 2>"$CASE_ROOT/stderr"; then
    echo 'Expected Object Storage upload failure.' >&2
    exit 1
  fi
done
failed_dir="$BACKUP_LOCAL_DIR/object-storage/failed"
[[ "$(find "$failed_dir" -maxdepth 1 -type f -name '*.failure.json' | wc -l | tr -d '[:space:]')" == 1 ]]
[[ "$(find "$failed_dir" -maxdepth 1 -type f -name '*.tar.gz.failed' | wc -l | tr -d '[:space:]')" == 1 ]]
python3 - "$failed_dir" "$COMPANY_SLUG" <<'PY'
import glob, json, os, sys
root, company = sys.argv[1:]
records = glob.glob(os.path.join(root, "*.failure.json"))
archives = glob.glob(os.path.join(root, "*.tar.gz.failed"))
assert len(records) == 1 and len(archives) == 1, (records, archives)
failure = json.load(open(records[0], encoding="utf-8"))
assert failure["company_slug"] == company, failure
assert failure["failure_stage"] == "upload-archive", failure
assert failure["archive_preserved"] is True and failure["started_at"] and failure["finished_at"], failure
assert os.stat(records[0]).st_mode & 0o777 == 0o600
PY
if grep -R -E 'non-output-(postgres|backup|object)-(access|secret)-marker' "$failed_dir"; then
  echo 'Secret marker leaked to local Object Storage failure evidence.' >&2
  exit 1
fi
printf 'PASS: failed Object Storage evidence remains bounded and diagnostic\n'
