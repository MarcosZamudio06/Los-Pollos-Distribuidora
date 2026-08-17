#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
source "${SCRIPT_DIR}/map-preprocessing-common.sh"

map_acquire_preprocessing_lock
cleanup() {
  map_release_preprocessing_lock
}
trap cleanup EXIT

if map_is_refresh_candidate_mode; then
  echo "Preparing GIS candidates side-by-side under ${MAP_REFRESH_CANDIDATE_ROOT}; active mounts remain untouched."
fi

"${SCRIPT_DIR}/prepare-photon.sh"
"${SCRIPT_DIR}/prepare-osrm.sh"
"${SCRIPT_DIR}/prepare-rendering.sh"

echo "All map datasets are ready. Start the map services with the Compose file selected by COMPOSE_FILE."
