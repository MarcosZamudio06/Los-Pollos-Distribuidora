#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

company_slug=${1:-}
deploy_root=${2:-}
backend_digest=${3:-}
frontend_digest=${4:-}
previous_backend_digest=${5:-}
previous_frontend_digest=${6:-}
previous_schema_compatible=${7:-false}
change_reference=${8:-}

if [[ ! "$company_slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ||
  ! "$deploy_root" =~ ^/[A-Za-z0-9_./-]+$ || "$deploy_root" == *".."* ||
  "$previous_schema_compatible" != true ||
  ! "$change_reference" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$ ]]; then
  echo "Invalid company deployment request." >&2
  exit 2
fi

validate_digest() {
  [[ "$1" =~ ^[a-z0-9.-]+(/[a-z0-9._-]+)+@sha256:[a-f0-9]{64}$ ]]
}
for image in "$backend_digest" "$frontend_digest" \
  "$previous_backend_digest" "$previous_frontend_digest"; do
  if ! validate_digest "$image"; then
    echo "All candidate and rollback images must use immutable digests." >&2
    exit 2
  fi
done
if [[ "${backend_digest%@*}" != "${previous_backend_digest%@*}" ||
  "${frontend_digest%@*}" != "${previous_frontend_digest%@*}" ]]; then
  echo "Candidate and rollback digests must refer to the same image repositories." >&2
  exit 2
fi

compose_file="$deploy_root/docker-compose.production.yml"
env_file="$deploy_root/.env.production"
if [[ ! -f "$compose_file" || -L "$compose_file" ||
  ! -f "$env_file" || -L "$env_file" ]]; then
  echo "The selected tenant deployment files are unavailable." >&2
  exit 2
fi

read_single_value() {
  local key=$1
  local file=$2
  local values
  values=$(awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1) }' "$file")
  if [[ $(printf '%s\n' "$values" | awk 'NF { count++ } END { print count + 0 }') -ne 1 ]]; then
    echo "Tenant deployment configuration has a missing or duplicate image value." >&2
    return 1
  fi
  printf '%s' "$values" | sed -e 's/^"//' -e 's/"$//'
}

if [[ "$(read_single_value BACKEND_IMAGE "$env_file")" != "$previous_backend_digest" ||
  "$(read_single_value FRONTEND_IMAGE "$env_file")" != "$previous_frontend_digest" ]]; then
  echo "The requested rollback digest is not the currently recorded tenant release." >&2
  exit 2
fi
if [[ "$(read_single_value TENANT_SLUG "$env_file")" != "$company_slug" ]]; then
  echo "The selected deployment directory does not belong to the requested company." >&2
  exit 2
fi

project_name="tenant-${company_slug}"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/deploy-company-${company_slug}.XXXXXX")
chmod 700 "$work_dir"
candidate_env="$work_dir/.env.production"
rollback_env="$work_dir/.env.production.rollback"
candidate_container=''
candidate_port=''
environment_replaced=0

cleanup() {
  local status=$?
  if [[ -n "$candidate_container" ]]; then
    docker rm -f "$candidate_container" >/dev/null 2>&1 || true
  fi
  if (( environment_replaced == 1 )); then
    rm -f -- "$rollback_env"
  fi
  rm -rf -- "$work_dir"
  exit "$status"
}
trap cleanup EXIT

compose() {
  local backend_image=$1
  local frontend_image=$2
  shift 2
  BACKEND_IMAGE="$backend_image" FRONTEND_IMAGE="$frontend_image" \
    docker compose --project-name "$project_name" \
      --env-file "$env_file" --file "$compose_file" "$@"
}

write_candidate_env() {
  local source=$1
  local destination=$2
  local backend_image=$3
  local frontend_image=$4
  awk -F= -v backend="$backend_image" -v frontend="$frontend_image" '
    BEGIN { backend_count = 0; frontend_count = 0 }
    $1 == "BACKEND_IMAGE" { print "BACKEND_IMAGE=" backend; backend_count++; next }
    $1 == "FRONTEND_IMAGE" { print "FRONTEND_IMAGE=" frontend; frontend_count++; next }
    { print }
    END { if (backend_count != 1 || frontend_count != 1) exit 3 }
  ' "$source" > "$destination"
  chmod 600 "$destination"
}

write_candidate_env "$env_file" "$candidate_env" "$backend_digest" "$frontend_digest"
cp -p -- "$env_file" "$rollback_env"

# This is a tenant-local migration canary using the immutable candidate backend.
BACKEND_IMAGE="$backend_digest" FRONTEND_IMAGE="$frontend_digest" \
  docker compose --project-name "$project_name" --env-file "$candidate_env" \
    --file "$compose_file" pull backend frontend migrate >/dev/null
BACKEND_IMAGE="$backend_digest" FRONTEND_IMAGE="$frontend_digest" \
  docker compose --project-name "$project_name" --env-file "$candidate_env" \
    --file "$compose_file" run --rm --no-deps migrate >/dev/null

# Start an isolated candidate backend on a loopback port and require its real ready endpoint.
candidate_container=$(BACKEND_IMAGE="$backend_digest" FRONTEND_IMAGE="$frontend_digest" \
  docker compose --project-name "$project_name" --env-file "$candidate_env" \
    --file "$compose_file" run --detach --no-deps \
    --publish 127.0.0.1::4000 backend | tail -n 1 | tr -d '\r[:space:]')
if [[ ! "$candidate_container" =~ ^[0-9a-f]{12,64}$ ]]; then
  echo "Tenant candidate canary did not return a container identity." >&2
  exit 1
fi
candidate_port=$(docker port "$candidate_container" 4000/tcp | tail -n 1)
candidate_port=${candidate_port##*:}
if [[ ! "$candidate_port" =~ ^[0-9]+$ ]]; then
  echo "Tenant candidate canary did not expose a loopback port." >&2
  exit 1
fi
canary_passed=0
for ((attempt = 0; attempt < 60; attempt++)); do
  if curl --fail --silent --show-error --max-time 2 \
    "http://127.0.0.1:$candidate_port/api/health/ready" >/dev/null 2>&1; then
    canary_passed=1
    break
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$candidate_container" 2>/dev/null || true)" != true ]]; then
    break
  fi
  sleep 1
done
if (( canary_passed != 1 )); then
  echo "Tenant candidate HTTP readiness canary failed; production images were not changed." >&2
  exit 1
fi
docker rm -f "$candidate_container" >/dev/null
candidate_container=''

# Promote only this company's image digests. On failure, restore the explicitly
# supplied compatible prior release for this same Compose project only.
cp -p -- "$env_file" "$rollback_env"
mv -f -- "$candidate_env" "$env_file"
environment_replaced=1
if compose "$backend_digest" "$frontend_digest" \
  up -d --no-build --pull never --wait backend frontend >/dev/null 2>&1; then
  rm -f -- "$rollback_env"
  environment_replaced=0
  printf 'DEPLOYED company=%s backend=%s frontend=%s change=%s at=%s\n' \
    "$company_slug" "$backend_digest" "$frontend_digest" "$change_reference" "$timestamp"
  exit 0
fi

restore_env="$work_dir/.env.production.restore"
cp -p -- "$rollback_env" "$restore_env"
chmod 600 "$restore_env"
mv -f -- "$restore_env" "$env_file"
if compose "$previous_backend_digest" "$previous_frontend_digest" \
  up -d --no-build --pull never --wait backend frontend >/dev/null 2>&1; then
  rm -f -- "$rollback_env"
  environment_replaced=0
  printf 'ROLLED_BACK company=%s backend=%s frontend=%s change=%s at=%s\n' \
    "$company_slug" "$previous_backend_digest" "$previous_frontend_digest" "$change_reference" "$timestamp" >&2
  exit 1
fi

echo "Tenant-scoped rollback failed for company $company_slug; inspect the deployment host." >&2
exit 2
