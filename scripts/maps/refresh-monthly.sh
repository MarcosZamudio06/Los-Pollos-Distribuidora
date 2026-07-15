#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PREPARED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DATA_VERSION="${MAP_DATA_VERSION:-mexico-$(date -u +%Y-%m)}"

cd "${REPO_ROOT}"
"${SCRIPT_DIR}/prepare-all.sh"

MAP_DATA_VERSION="${DATA_VERSION}" MAP_DATA_PREPARED_AT="${PREPARED_AT}" \
  docker compose --profile maps up -d --force-recreate photon osrm vroom backend

"${SCRIPT_DIR}/verify-stack.sh"
"${SCRIPT_DIR}/smoke-route.sh"

cat <<EOF
Monthly map refresh completed.
Persist these deployment values in your secret/configuration manager:
MAP_DATA_VERSION=${DATA_VERSION}
MAP_DATA_PREPARED_AT=${PREPARED_AT}
EOF
