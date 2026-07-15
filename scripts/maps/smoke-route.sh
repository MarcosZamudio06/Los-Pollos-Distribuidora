#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"

# Controlled Veracruz -> Boca del Rio -> Alvarado -> Veracruz route.
response="$(docker compose --profile maps exec -T osrm curl --fail --silent \
  'http://127.0.0.1:5000/route/v1/driving/-96.1342,19.1738;-96.1150,19.1050;-95.7646,18.7797;-96.1342,19.1738?overview=full&geometries=geojson&steps=false')"

printf '%s' "${response}" | grep -q '"code":"Ok"'
printf '%s' "${response}" | grep -q '"geometry":{"coordinates"'
printf '%s' "${response}" | grep -q '"distance"'
printf '%s' "${response}" | grep -q '"duration"'

echo "Controlled Veracruz-Boca del Rio-Alvarado closed-route smoke test passed."
