#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=postgres-backup-common.sh
source "$SCRIPT_DIR/postgres-backup-common.sh"

COMPANY_SLUG=${COMPANY_SLUG:-${TENANT_SLUG:-}}
BACKUP_S3_ENDPOINT=${BACKUP_S3_ENDPOINT:-}
BACKUP_S3_REGION=${BACKUP_S3_REGION:-}
BACKUP_S3_BUCKET=${BACKUP_S3_BUCKET:-}
BACKUP_S3_ACCESS_KEY_ID=${BACKUP_S3_ACCESS_KEY_ID:-}
BACKUP_S3_SECRET_ACCESS_KEY=${BACKUP_S3_SECRET_ACCESS_KEY:-}
BACKUP_DOCKER_BIN=${BACKUP_DOCKER_BIN:-docker}
BACKUP_UPLOAD_IMAGE=${BACKUP_UPLOAD_IMAGE:-amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7}
BACKUP_RETENTION_DAILY=${BACKUP_RETENTION_DAILY:-14}
BACKUP_RETENTION_WEEKLY=${BACKUP_RETENTION_WEEKLY:-8}
BACKUP_RETENTION_MONTHLY=${BACKUP_RETENTION_MONTHLY:-6}

backup_require_env COMPANY_SLUG BACKUP_S3_ENDPOINT BACKUP_S3_REGION \
  BACKUP_S3_BUCKET BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY
if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  echo "Company recovery retention identity is invalid." >&2
  exit 2
fi
backup_validate_s3_env
backup_validate_non_negative_integer BACKUP_RETENTION_DAILY "$BACKUP_RETENTION_DAILY"
backup_validate_non_negative_integer BACKUP_RETENTION_WEEKLY "$BACKUP_RETENTION_WEEKLY"
backup_validate_non_negative_integer BACKUP_RETENTION_MONTHLY "$BACKUP_RETENTION_MONTHLY"

if (( $# != 2 )); then
  echo "Company recovery retention requires a private work directory and the validated recovery-set key." >&2
  exit 2
fi
work_dir=$1
expected_recovery_set_key=$2
if [[ ! -d "$work_dir" || -L "$work_dir" ||
  "$expected_recovery_set_key" != "recovery-sets/$COMPANY_SLUG/"* ]]; then
  echo "Company recovery retention scope is invalid." >&2
  exit 2
fi

retention_dir="$work_dir/retention"
mkdir -m 700 -p "$retention_dir"

retention_fail() {
  printf 'Company recovery retention failed at %s.\n' "$1" >&2
  exit 1
}

list_objects() {
  local prefix=$1
  local destination=$2
  if ! backup_aws_cli_dir "$work_dir" ro s3api list-objects-v2 \
    --bucket "$BACKUP_S3_BUCKET" --prefix "$prefix" \
    --endpoint-url "$BACKUP_S3_ENDPOINT" --output json \
    > "$destination" 2>/dev/null; then
    retention_fail list
  fi
}

download_object() {
  local key=$1
  local destination=$2
  local relative=${destination#"$work_dir"/}
  if [[ "$relative" == "$destination" || "$relative" == *..* || "$relative" == /* ]]; then
    retention_fail input
  fi
  mkdir -p "$(dirname -- "$destination")"
  if ! backup_aws_cli_dir "$work_dir" rw s3 cp \
    "s3://$BACKUP_S3_BUCKET/$key" "/backup/$relative" \
    --endpoint-url "$BACKUP_S3_ENDPOINT" --only-show-errors \
    >/dev/null 2>&1; then
    retention_fail manifest-download
  fi
}

recovery_list="$retention_dir/recovery-sets.list.json"
list_objects "recovery-sets/" "$recovery_list"
recovery_keys_file="$retention_dir/recovery-set-keys.txt"
if ! node "$SCRIPT_DIR/company-recovery-retention.mjs" \
  list-keys --input "$recovery_list" --kind recovery-set \
  > "$recovery_keys_file" 2>/dev/null; then
  retention_fail recovery-set-list
fi
declare -a recovery_keys=()
while IFS= read -r key; do
  [[ -n "$key" ]] && recovery_keys+=("$key")
done < "$recovery_keys_file"
if ((${#recovery_keys[@]} == 0)); then
  retention_fail recovery-set-list-empty
fi

set_index=0
expected_recovery_found=0
for recovery_key in "${recovery_keys[@]}"; do
  set_company=$(printf '%s' "$recovery_key" | cut -d/ -f2)
  set_dir="$retention_dir/set-$set_index"
  mkdir -m 700 "$set_dir"
  printf '%s\n' "$recovery_key" > "$set_dir/recovery-key.txt"
  download_object "$recovery_key" "$set_dir/recovery.manifest.json"
  download_object "$recovery_key.sha256" "$set_dir/recovery.manifest.json.sha256"
  if ! node "$SCRIPT_DIR/company-recovery-manifest.mjs" verify-identity \
    --manifest "$set_dir/recovery.manifest.json" \
    --checksum "$set_dir/recovery.manifest.json.sha256" \
    --expected-company "$set_company" >/dev/null 2>&1; then
    retention_fail recovery-set-manifest
  fi
  if [[ "$recovery_key" == "$expected_recovery_set_key" ]]; then
    [[ "$set_company" == "$COMPANY_SLUG" ]] || retention_fail company-scope
    expected_recovery_found=1
  fi

  refs_file="$set_dir/component-keys.json"
  if ! node "$SCRIPT_DIR/company-recovery-retention.mjs" component-keys \
    --manifest "$set_dir/recovery.manifest.json" \
    --checksum "$set_dir/recovery.manifest.json.sha256" \
    --manifest-key "$recovery_key" --expected-company "$set_company" \
    > "$refs_file" 2>/dev/null; then
    retention_fail recovery-set-references
  fi
  IFS=$'\t' read -r postgres_manifest_key object_manifest_key < <(python3 - "$refs_file" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
print(f"{data['postgresManifest']}\t{data['objectManifest']}")
PY
)
  [[ -n "$postgres_manifest_key" && -n "$object_manifest_key" ]] || retention_fail recovery-set-references
  download_object "$postgres_manifest_key" "$set_dir/postgres.manifest.json"
  download_object "$object_manifest_key" "$set_dir/object-storage.manifest.json"
  download_object "$object_manifest_key.sha256" "$set_dir/object-storage.manifest.json.sha256"
  set_index=$((set_index + 1))
done
(( expected_recovery_found == 1 )) || retention_fail new-recovery-set-missing

postgres_component_list="$retention_dir/postgres-components.list.json"
object_component_list="$retention_dir/object-storage-components.list.json"
list_objects "postgres/$COMPANY_SLUG/" "$postgres_component_list"
list_objects "object-storage/$COMPANY_SLUG/" "$object_component_list"
postgres_keys_file="$retention_dir/postgres-component-keys.txt"
object_keys_file="$retention_dir/object-storage-component-keys.txt"
if ! node "$SCRIPT_DIR/company-recovery-retention.mjs" \
  list-keys --input "$postgres_component_list" --kind postgresql \
  --company-slug "$COMPANY_SLUG" > "$postgres_keys_file" 2>/dev/null; then
  retention_fail postgres-component-list
fi
if ! node "$SCRIPT_DIR/company-recovery-retention.mjs" \
  list-keys --input "$object_component_list" --kind object-storage \
  --company-slug "$COMPANY_SLUG" > "$object_keys_file" 2>/dev/null; then
  retention_fail object-storage-component-list
fi
declare -a component_manifest_keys=()
while IFS= read -r key; do
  [[ -n "$key" ]] && component_manifest_keys+=("$key")
done < "$postgres_keys_file"
while IFS= read -r key; do
  [[ -n "$key" ]] && component_manifest_keys+=("$key")
done < "$object_keys_file"

component_index=0
for component_key in "${component_manifest_keys[@]}"; do
  component_dir="$retention_dir/component-$component_index"
  mkdir -m 700 "$component_dir"
  printf '%s\n' "$component_key" > "$component_dir/manifest-key.txt"
  download_object "$component_key" "$component_dir/manifest.json"
  if [[ "$component_key" == object-storage/* ]]; then
    download_object "$component_key.sha256" "$component_dir/manifest.json.sha256"
  fi
  component_index=$((component_index + 1))
done

input_file="$retention_dir/retention-input.json"
plan_file="$retention_dir/retention-plan.json"
python3 - "$input_file" "$COMPANY_SLUG" "$expected_recovery_set_key" \
  "$BACKUP_RETENTION_DAILY" "$BACKUP_RETENTION_WEEKLY" \
  "$BACKUP_RETENTION_MONTHLY" "$retention_dir" <<'PY'
import glob
import json
import os
import sys

output, company, expected, daily, weekly, monthly, root = sys.argv[1:]
sets = []
for directory in sorted(glob.glob(os.path.join(root, "set-*"))):
    def read(name):
        with open(os.path.join(directory, name), encoding="utf-8") as handle:
            return handle.read()
    manifest_key = read("recovery-key.txt").strip()
    sets.append({
        "manifestKey": manifest_key,
        "checksumKey": f"{manifest_key}.sha256",
        "manifestRaw": read("recovery.manifest.json"),
        "checksumRaw": read("recovery.manifest.json.sha256"),
        "postgresManifestRaw": read("postgres.manifest.json"),
        "objectManifestRaw": read("object-storage.manifest.json"),
        "objectChecksumRaw": read("object-storage.manifest.json.sha256"),
    })

components = []
for directory in sorted(glob.glob(os.path.join(root, "component-*"))):
    with open(os.path.join(directory, "manifest-key.txt"), encoding="utf-8") as handle:
        manifest_key = handle.read().strip()
    with open(os.path.join(directory, "manifest.json"), encoding="utf-8") as handle:
        manifest_raw = handle.read()
    checksum_path = os.path.join(directory, "manifest.json.sha256")
    checksum_raw = None
    if os.path.exists(checksum_path):
        with open(checksum_path, encoding="utf-8") as handle:
            checksum_raw = handle.read()
    components.append({
        "kind": "object-storage" if manifest_key.startswith("object-storage/") else "postgresql",
        "manifestKey": manifest_key,
        "manifestRaw": manifest_raw,
        "checksumRaw": checksum_raw,
    })

payload = {
    "companySlug": company,
    "expectedRecoverySetKey": expected,
    "recoverySets": sets,
    "componentManifests": components,
    "daily": int(daily),
    "weekly": int(weekly),
    "monthly": int(monthly),
}
with open(output, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, sort_keys=True)
    handle.write("\n")
os.chmod(output, 0o600)
PY

if ! node "$SCRIPT_DIR/company-recovery-retention.mjs" plan \
  --input "$input_file" --output "$plan_file"; then
  retention_fail manifest-validation
fi

delete_actions="$retention_dir/delete-actions.tsv"
python3 - "$plan_file" "$delete_actions" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    plan = json.load(handle)
with open(sys.argv[2], "w", encoding="utf-8") as handle:
    for key in plan["deleteRecoverySetObjects"]:
        handle.write(f"recovery-set\t{key}\n")
    for key in plan["deleteComponentObjects"]:
        handle.write(f"component\t{key}\n")
PY

while IFS=$'\t' read -r kind key; do
  [[ -n "$key" ]] || continue
  case "$kind:$key" in
    recovery-set:recovery-sets/"$COMPANY_SLUG"/*) ;;
    component:postgres/"$COMPANY_SLUG"/*) ;;
    component:postgres/[0-9][0-9][0-9][0-9]/[0-9][0-9]/*) ;;
    component:object-storage/"$COMPANY_SLUG"/*) ;;
    *) retention_fail deletion-scope ;;
  esac
  if ! backup_aws_cli_dir "$work_dir" ro s3 rm \
    "s3://$BACKUP_S3_BUCKET/$key" --endpoint-url "$BACKUP_S3_ENDPOINT" \
    --only-show-errors >/dev/null 2>&1; then
    retention_fail deletion
  fi
done < "$delete_actions"

printf 'Company recovery-set retention applied for %s.\n' "$COMPANY_SLUG"
