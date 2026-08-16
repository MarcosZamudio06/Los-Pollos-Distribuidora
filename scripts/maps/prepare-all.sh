#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/prepare-photon.sh"
"${SCRIPT_DIR}/prepare-osrm.sh"
"${SCRIPT_DIR}/prepare-rendering.sh"

echo "All map datasets are ready. Start the map services with the Compose file selected by COMPOSE_FILE."
