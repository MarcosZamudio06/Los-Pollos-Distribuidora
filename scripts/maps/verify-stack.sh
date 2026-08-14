#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"
PUBLIC_BASE_URL="${MAP_PUBLIC_BASE_URL:-http://127.0.0.1:${FRONTEND_PORT:-3000}}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL%/}"

docker compose --profile maps exec -T postgres \
  psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-pollo_distribucion}" -Atc \
  "SELECT default_version FROM pg_available_extensions WHERE name = 'postgis';" \
  | grep -Eq '^[0-9]+\.[0-9]+'

docker compose --profile maps exec -T photon \
  curl --fail --silent http://127.0.0.1:2322/status >/dev/null

docker compose --profile maps exec -T osrm \
  curl --fail --silent \
  'http://127.0.0.1:5000/nearest/v1/driving/-96.1342,19.1738?number=1' >/dev/null

docker compose --profile maps exec -T vroom \
  curl --fail --silent http://127.0.0.1:3000/health >/dev/null

# This is intentionally a host request. The rendering smoke must traverse the
# browser-facing frontend Nginx proxy instead of probing TileServer directly.
curl --fail --silent --show-error \
  "${PUBLIC_BASE_URL}/maps/health" \
  >/dev/null

"${SCRIPT_DIR}/verify-rendering.sh"

echo "PostGIS, Photon, OSRM, TileServer GL, and frontend /maps proxy checks passed."
