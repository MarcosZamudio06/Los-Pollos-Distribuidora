#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

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

echo "PostGIS, Photon, OSRM, and VROOM checks passed."
