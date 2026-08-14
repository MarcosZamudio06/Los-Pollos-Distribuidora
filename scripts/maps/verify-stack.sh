#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"
PUBLIC_BASE_URL="${MAP_PUBLIC_BASE_URL:-http://127.0.0.1:${FRONTEND_PORT:-3000}}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

run_http_healthcheck() {
  local service="$1"
  local failure_message="$2"
  shift 2

  if ! "$@"; then
    echo "${failure_message}" >&2
    exit 1
  fi
}

if ! docker compose --profile maps exec -T postgres \
  psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-pollo_distribucion}" -Atc \
  "SELECT default_version FROM pg_available_extensions WHERE name = 'postgis';" \
  | grep -Eq '^[0-9]+\.[0-9]+'; then
  echo "PostGIS health check failed." >&2
  exit 1
fi

run_http_healthcheck "Photon" "Photon health check failed." \
  docker compose --profile maps exec -T photon \
  curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:2322/status >/dev/null

run_http_healthcheck "OSRM" "OSRM health check failed." \
  docker compose --profile maps exec -T osrm \
  curl --fail --silent --show-error --max-time 10 \
  'http://127.0.0.1:5000/nearest/v1/driving/-96.1342,19.1738?number=1' >/dev/null

run_http_healthcheck "VROOM" "VROOM health check failed." \
  docker compose --profile maps exec -T vroom \
  curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:3000/health >/dev/null

# This is intentionally a host request. The rendering smoke must traverse the
# browser-facing frontend Nginx proxy instead of probing TileServer directly.
run_http_healthcheck "Frontend /maps" "Frontend /maps health check failed." \
  curl --fail --silent --show-error --max-time 10 \
  "${PUBLIC_BASE_URL}/maps/health" \
  >/dev/null

if ! "${SCRIPT_DIR}/verify-rendering.sh"; then
  echo "TileServer GL rendering health check failed." >&2
  exit 1
fi

echo "PostGIS, Photon, OSRM, TileServer GL, and frontend /maps proxy checks passed."
