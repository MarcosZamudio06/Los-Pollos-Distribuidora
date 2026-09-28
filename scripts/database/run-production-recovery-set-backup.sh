#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)

RECOVERY_BACKUP_MODE=${RECOVERY_BACKUP_MODE:-}
RECOVERY_BACKUP_LOCK_FILE=${RECOVERY_BACKUP_LOCK_FILE:-/run/lock/pollos-distribuidor-recovery-set-backup.lock}
BACKUP_RPO_HOURS=${BACKUP_RPO_HOURS:-}
readonly RECOVERY_BACKUP_MIN_RPO_HOURS=21

require_values() {
  local name
  for name in "$@"; do
    if [[ -z "${!name:-}" ]]; then
      printf 'Required recovery backup configuration is missing: %s\n' "$name" >&2
      return 2
    fi
  done
}

validate_positive_integer() {
  local name=$1
  local value=$2
  if [[ ! "$value" =~ ^[0-9]+$ || "$value" -lt 1 ]]; then
    printf 'Recovery backup configuration must be a positive integer: %s\n' "$name" >&2
    return 2
  fi
}

require_absolute_path() {
  local name=$1
  local value=$2
  if [[ "$value" != /* ]]; then
    printf 'Recovery backup configuration must be an absolute path: %s\n' "$name" >&2
    return 2
  fi
}

require_values RECOVERY_BACKUP_MODE BACKUP_RPO_HOURS
validate_positive_integer BACKUP_RPO_HOURS "$BACKUP_RPO_HOURS"
validate_positive_integer RECOVERY_BACKUP_MIN_RPO_HOURS "$RECOVERY_BACKUP_MIN_RPO_HOURS"
if (( BACKUP_RPO_HOURS < RECOVERY_BACKUP_MIN_RPO_HOURS )); then
  printf 'Configured BACKUP_RPO_HOURS is below the installed recovery timer/runtime envelope.\n' >&2
  exit 2
fi

for dependency in flock node python3; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    printf 'Required host recovery backup dependency is unavailable: %s\n' "$dependency" >&2
    exit 2
  fi
done

require_absolute_path RECOVERY_BACKUP_LOCK_FILE "$RECOVERY_BACKUP_LOCK_FILE"
mkdir -p -- "$(dirname -- "$RECOVERY_BACKUP_LOCK_FILE")"
exec 9>"$RECOVERY_BACKUP_LOCK_FILE"
if ! flock -n 9; then
  printf 'A production recovery-set backup is already running.\n' >&2
  exit 75
fi

run_single_company_backup() {
  require_values COMPANY_SLUG BACKUP_COMPOSE_ENV_FILE
  if [[ ! "$COMPANY_SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    printf 'Single-company recovery identity is invalid.\n' >&2
    return 2
  fi
  if [[ ! -r "$BACKUP_COMPOSE_ENV_FILE" ]]; then
    printf 'Single-company Compose environment file is unavailable.\n' >&2
    return 2
  fi

  BACKUP_COMPOSE_FILE=${BACKUP_COMPOSE_FILE:-$REPOSITORY_ROOT/docker-compose.production.yml}
  BACKUP_COMPOSE_PROJECT_NAME=${BACKUP_COMPOSE_PROJECT_NAME:-pollos-distribuidor}
  BACKUP_POSTGRES_DATABASE=${BACKUP_POSTGRES_DATABASE:-${POSTGRES_DB:-}}
  BACKUP_POSTGRES_USER=${BACKUP_POSTGRES_USER:-${POSTGRES_USER:-postgres}}
  BACKUP_POSTGRES_PASSWORD=${BACKUP_POSTGRES_PASSWORD:-${POSTGRES_PASSWORD:-}}
  BACKUP_UPLOAD_NETWORK=${BACKUP_UPLOAD_NETWORK:-${BACKUP_COMPOSE_PROJECT_NAME}_app_network}
  BACKUP_LOCAL_DIR=${BACKUP_LOCAL_DIR:-/var/lib/pollos-distribuidor/postgres-backups}
  BACKUP_RESULT_DIR=${BACKUP_RESULT_DIR:-$BACKUP_LOCAL_DIR/results}
  COMPANY_RECOVERY_RESULT_DIR=${COMPANY_RECOVERY_RESULT_DIR:-$BACKUP_RESULT_DIR/company-recovery}
  COMPANY_RECOVERY_LOCAL_DIR=${COMPANY_RECOVERY_LOCAL_DIR:-$BACKUP_LOCAL_DIR/company-recovery-sets}

  export BACKUP_COMPOSE_FILE BACKUP_COMPOSE_ENV_FILE BACKUP_COMPOSE_PROJECT_NAME
  export BACKUP_POSTGRES_DATABASE BACKUP_POSTGRES_USER BACKUP_POSTGRES_PASSWORD
  export BACKUP_UPLOAD_NETWORK BACKUP_LOCAL_DIR BACKUP_RESULT_DIR
  export COMPANY_RECOVERY_RESULT_DIR COMPANY_RECOVERY_LOCAL_DIR
  bash "$SCRIPT_DIR/create-company-recovery-set.sh"
}

run_multi_company_backup() {
  require_values TENANTCTL_MANIFEST_PATH TENANTCTL_LOCAL_DEPLOYMENT_HOST_REF \
    TENANTCTL_ENV_DIR TENANTCTL_RESOLVER_PATH \
    TENANTCTL_OPERATOR TENANTCTL_BACKUP_APPROVAL_REF TENANTCTL_AUDIT_LOG
  require_absolute_path TENANTCTL_MANIFEST_PATH "$TENANTCTL_MANIFEST_PATH"
  require_absolute_path TENANTCTL_ENV_DIR "$TENANTCTL_ENV_DIR"
  require_absolute_path TENANTCTL_RESOLVER_PATH "$TENANTCTL_RESOLVER_PATH"
  require_absolute_path TENANTCTL_AUDIT_LOG "$TENANTCTL_AUDIT_LOG"
  if [[ ! -r "$TENANTCTL_MANIFEST_PATH" || ! -d "$TENANTCTL_ENV_DIR" || ! -x "$TENANTCTL_RESOLVER_PATH" ]]; then
    printf 'Multi-company recovery backup configuration is unavailable.\n' >&2
    return 2
  fi
  if [[ ! "$TENANTCTL_BACKUP_APPROVAL_REF" =~ ^[A-Z][A-Z0-9]{1,9}-[0-9]{1,12}$ ]]; then
    printf 'Scheduled multi-company backup requires an approved audit/change reference.\n' >&2
    return 2
  fi

  TENANTCTL_BACKUP_TIMEOUT_SECONDS=${TENANTCTL_BACKUP_TIMEOUT_SECONDS:-1800}
  validate_positive_integer TENANTCTL_BACKUP_TIMEOUT_SECONDS "$TENANTCTL_BACKUP_TIMEOUT_SECONDS"
  if (( TENANTCTL_BACKUP_TIMEOUT_SECONDS > 86400 )); then
    printf 'Tenant backup timeout exceeds the supported maximum.\n' >&2
    return 2
  fi

  local manifest_validator="$SCRIPT_DIR/../multi-company/validate-company-manifest.mjs"
  local selected_companies
  selected_companies=$(node --input-type=module - "$TENANTCTL_MANIFEST_PATH" "$manifest_validator" "$TENANTCTL_LOCAL_DEPLOYMENT_HOST_REF" <<'NODE'
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const manifestPath = process.argv[2];
const validatorPath = process.argv[3];
const localDeploymentHostRef = process.argv[4];
const { validateCompanyManifest } = await import(pathToFileURL(validatorPath).href);
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch {
  console.error("Multi-company recovery backup manifest could not be read.");
  process.exit(2);
}
if (validateCompanyManifest(manifest).length > 0) {
  console.error("Multi-company recovery backup manifest failed validation.");
  process.exit(2);
}
const companies = manifest.companies.filter(
  (company) => company.environment === "production"
    && company.status === "active"
    && company.deploymentHostRef === localDeploymentHostRef,
);
if (companies.length === 0) {
  console.error("No active production company is assigned to this recovery backup host.");
  process.exit(2);
}
if (companies.length !== 1) {
  console.error("More than one active production company is assigned to this recovery backup host.");
  process.exit(2);
}
process.stdout.write(companies.map((company) => company.slug).join("\n") + "\n");
NODE
)

  local tenantctl_script="$SCRIPT_DIR/../multi-company/tenantctl.mjs"
  local company_slug
  local failed=0
  while IFS= read -r company_slug; do
    [[ -n "$company_slug" ]] || continue
    printf 'Starting coordinated recovery-set backup for configured production company.\n'
    if ! node "$tenantctl_script" backup \
      --manifest "$TENANTCTL_MANIFEST_PATH" \
      --company "$company_slug" \
      --env-dir "$TENANTCTL_ENV_DIR" \
      --resolver "$TENANTCTL_RESOLVER_PATH" \
      --timeout-seconds "$TENANTCTL_BACKUP_TIMEOUT_SECONDS" \
      --apply --reason "$TENANTCTL_BACKUP_APPROVAL_REF" --confirm \
      --operator "$TENANTCTL_OPERATOR" --audit-log "$TENANTCTL_AUDIT_LOG"; then
      failed=1
    fi
  done <<< "$selected_companies"

  return "$failed"
}

case "$RECOVERY_BACKUP_MODE" in
  single-company)
    run_single_company_backup
    ;;
  multi-company)
    run_multi_company_backup
    ;;
  *)
    printf 'RECOVERY_BACKUP_MODE must be single-company or multi-company.\n' >&2
    exit 2
    ;;
esac
