#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"${SCRIPT_DIR}/prepare-photon.sh"
"${SCRIPT_DIR}/prepare-osrm.sh"

echo "All map datasets are ready. Start them with: docker compose --profile maps up -d postgres photon osrm vroom"
