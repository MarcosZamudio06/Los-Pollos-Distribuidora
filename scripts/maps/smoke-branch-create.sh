#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:${FRONTEND_PORT:-3000}}"
BASE_URL="${BASE_URL%/}"
SMOKE_ENV="${SMOKE_ENV:-}"
SMOKE_CLEANUP="${SMOKE_CLEANUP:-true}"
SMOKE_ALLOW_REMOTE="${SMOKE_ALLOW_REMOTE:-false}"

if [[ "${SMOKE_DISPOSABLE:-}" != "true" ]]; then
  echo "branch-create smoke refuses to run without SMOKE_DISPOSABLE=true" >&2
  exit 1
fi

case "${SMOKE_ENV}" in
  dev|test|disposable) ;;
  *)
    echo "branch-create smoke requires SMOKE_ENV=dev, test, or disposable" >&2
    exit 1
    ;;
esac

case "${SMOKE_CLEANUP}" in
  true|false) ;;
  *)
    echo "SMOKE_CLEANUP must be true or false" >&2
    exit 1
    ;;
esac

case "${SMOKE_ALLOW_REMOTE}" in
  true|false) ;;
  *)
    echo "SMOKE_ALLOW_REMOTE must be true or false" >&2
    exit 1
    ;;
esac

: "${SMOKE_ADMIN_EMAIL:?SMOKE_ADMIN_EMAIL is required}"
: "${SMOKE_ADMIN_PASSWORD:?SMOKE_ADMIN_PASSWORD is required}"

for command in curl python3; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required for branch-create smoke" >&2
    exit 1
  fi
done

BASE_HOST="$(python3 - "${BASE_URL}" <<'PY'
from urllib.parse import urlparse
import sys

parsed = urlparse(sys.argv[1])
if parsed.scheme not in {"http", "https"} or not parsed.hostname:
    raise SystemExit("SMOKE_BASE_URL must be an HTTP(S) URL")
if parsed.username or parsed.password or parsed.query or parsed.fragment:
    raise SystemExit("SMOKE_BASE_URL must not contain credentials, query, or fragment")
print(parsed.hostname)
PY
)"

LOWER_HOST="${BASE_HOST,,}"
if [[ "${LOWER_HOST}" == *prod* || "${LOWER_HOST}" == *production* || "${LOWER_HOST}" == *live* ]]; then
  echo "branch-create smoke refuses production-like hosts" >&2
  exit 1
fi

case "${LOWER_HOST}" in
  localhost|127.0.0.1|::1) ;;
  *)
    if [[ "${SMOKE_ALLOW_REMOTE}" != "true" ]]; then
      echo "Non-local branch-create smoke requires explicit SMOKE_ALLOW_REMOTE=true" >&2
      exit 1
    fi
    ;;
esac

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

request() {
  local method="$1"
  local path="$2"
  local output="$3"
  local body="${4:-}"
  local status

  if [[ -n "${body}" ]]; then
    if ! status="$(curl --silent --show-error --location --max-time 30 \
      --request "${method}" \
      --header "Content-Type: application/json" \
      --header "Authorization: Bearer ${ACCESS_TOKEN:-}" \
      --data "${body}" \
      --output "${output}" \
      --write-out '%{http_code}' \
      "${BASE_URL}${path}")"; then
      echo "HTTP ${method} ${path} failed before receiving a response" >&2
      return 1
    fi
  else
    if ! status="$(curl --silent --show-error --location --max-time 30 \
      --request "${method}" \
      --header "Authorization: Bearer ${ACCESS_TOKEN:-}" \
      --output "${output}" \
      --write-out '%{http_code}' \
      "${BASE_URL}${path}")"; then
      echo "HTTP ${method} ${path} failed before receiving a response" >&2
      return 1
    fi
  fi

  printf '%s' "${status}"
}

require_status() {
  local actual="$1"
  local expected="$2"
  local path="$3"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "branch-create smoke: ${path} returned HTTP ${actual}; expected ${expected}" >&2
    exit 1
  fi
}

json_field() {
  local file="$1"
  local path="$2"
  python3 - "${file}" "${path}" <<'PY'
import json
import sys

value = json.loads(open(sys.argv[1], encoding="utf-8").read())
for part in sys.argv[2].split('.'):
    if not isinstance(value, dict) or part not in value:
        raise SystemExit(f"missing JSON field: {sys.argv[2]}")
    value = value[part]
if value is None:
    raise SystemExit(f"null JSON field: {sys.argv[2]}")
if isinstance(value, (dict, list)):
    print(json.dumps(value, ensure_ascii=False))
else:
    print(value)
PY
}

HEALTH_BODY="${TMP_DIR}/health.json"
HEALTH_STATUS="$(request GET /api/health/ready "${HEALTH_BODY}")"
require_status "${HEALTH_STATUS}" 200 "/api/health/ready"

LOGIN_BODY="${TMP_DIR}/login.json"
LOGIN_PAYLOAD="$(python3 - <<'PY'
import json
import os
print(json.dumps({
    "email": os.environ["SMOKE_ADMIN_EMAIL"],
    "password": os.environ["SMOKE_ADMIN_PASSWORD"],
}))
PY
)"
LOGIN_STATUS="$(request POST /api/auth/login "${LOGIN_BODY}" "${LOGIN_PAYLOAD}")"
require_status "${LOGIN_STATUS}" 200 "/api/auth/login"
ACCESS_TOKEN="$(json_field "${LOGIN_BODY}" data.accessToken)"

CEDIS_BODY="${TMP_DIR}/cedis.json"
CEDIS_STATUS="$(request GET '/api/locations?type=DISTRIBUTION_CENTER&isActive=true&page=1&limit=100' "${CEDIS_BODY}")"
require_status "${CEDIS_STATUS}" 200 "/api/locations"
CEDIS_ID="$(python3 - "${CEDIS_BODY}" <<'PY'
import json
import sys

payload = json.loads(open(sys.argv[1], encoding="utf-8").read())
items = payload.get("data", {}).get("items", [])
for item in items:
    if item.get("type") == "DISTRIBUTION_CENTER" and item.get("isActive") is True:
        print(item["id"])
        break
else:
    raise SystemExit("No active distribution center was returned")
PY
)"

SUFFIX="$(date -u +%Y%m%dT%H%M%SZ)-$(python3 -c 'import uuid; print(uuid.uuid4().hex[:10])')"
BRANCH_NAME="SMOKE-BRANCH-${SUFFIX}"
BRANCH_CODE="${BRANCH_NAME}"
BRANCH_PAYLOAD="$(python3 - "${BRANCH_NAME}" "${BRANCH_CODE}" "${CEDIS_ID}" <<'PY'
import json
import sys

print(json.dumps({
    "name": sys.argv[1],
    "code": sys.argv[2],
    "type": "BRANCH",
    "parentId": sys.argv[3],
    "address": "Veracruz, Veracruz",
    "latitude": 19.1738,
    "longitude": -96.1342,
}))
PY
)"

CREATE_BODY="${TMP_DIR}/created-branch.json"
CREATE_STATUS="$(request POST /api/locations "${CREATE_BODY}" "${BRANCH_PAYLOAD}")"
require_status "${CREATE_STATUS}" 201 "/api/locations"
BRANCH_ID="$(json_field "${CREATE_BODY}" data.id)"

cleanup_branch() {
  if [[ -z "${BRANCH_ID:-}" || "${SMOKE_CLEANUP}" != "true" ]]; then
    rm -rf "${TMP_DIR}"
    return 0
  fi

  local cleanup_body="${TMP_DIR}/cleanup.json"
  local cleanup_status
  cleanup_status="$(curl --silent --show-error --location --max-time 30 \
    --request PATCH \
    --header 'Content-Type: application/json' \
    --header "Authorization: Bearer ${ACCESS_TOKEN}" \
    --data '{"isActive":false}' \
    --output "${cleanup_body}" \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/locations/${BRANCH_ID}" || true)"
  if [[ "${cleanup_status}" == "200" ]]; then
    echo "Cleanup: deactivated branch ${BRANCH_ID}."
  else
    echo "Cleanup: could not deactivate branch ${BRANCH_ID} (HTTP ${cleanup_status:-unknown})." >&2
  fi
  rm -rf "${TMP_DIR}"
}
trap cleanup_branch EXIT

BRANCHES_BODY="${TMP_DIR}/branches.json"
BRANCHES_STATUS="$(request GET "/api/locations/${CEDIS_ID}/branches" "${BRANCHES_BODY}")"
require_status "${BRANCHES_STATUS}" 200 "/api/locations/${CEDIS_ID}/branches"

python3 - "${CREATE_BODY}" "${BRANCHES_BODY}" "${CEDIS_ID}" "${BRANCH_ID}" <<'PY'
import json
import sys

create = json.loads(open(sys.argv[1], encoding="utf-8").read()).get("data", {})
branches = json.loads(open(sys.argv[2], encoding="utf-8").read()).get("data", {}).get("items", [])
cedis_id = sys.argv[3]
branch_id = sys.argv[4]

def assert_location(location, label):
    if location.get("id") != branch_id:
        raise SystemExit(f"{label}: unexpected branch id")
    if location.get("type") != "BRANCH":
        raise SystemExit(f"{label}: type is not BRANCH")
    if location.get("parentId") != cedis_id:
        raise SystemExit(f"{label}: parentId does not match the selected CEDIS")
    if location.get("address") != "Veracruz, Veracruz":
        raise SystemExit(f"{label}: address was not preserved")
    if abs(float(location.get("latitude")) - 19.1738) > 1e-6:
        raise SystemExit(f"{label}: latitude was not preserved")
    if abs(float(location.get("longitude")) + 96.1342) > 1e-6:
        raise SystemExit(f"{label}: longitude was not preserved")

assert_location(create, "create response")
matches = [item for item in branches if item.get("id") == branch_id]
if len(matches) != 1:
    raise SystemExit("branch catalog does not contain exactly one new branch")
assert_location(matches[0], "branch catalog")
print("Branch relationship and location fields verified.")
PY

echo "Branch-create smoke PASS."
echo "CEDIS ID: ${CEDIS_ID}"
echo "Branch ID: ${BRANCH_ID}"
echo "Branch code: ${BRANCH_CODE}"
