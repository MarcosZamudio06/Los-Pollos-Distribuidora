#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
MAP_REFRESH_ID="${MAP_REFRESH_ID:?MAP_REFRESH_ID is required for candidate validation}"
MAP_REFRESH_CANDIDATE_ROOT="${MAP_REFRESH_CANDIDATE_ROOT:?MAP_REFRESH_CANDIDATE_ROOT is required for candidate validation}"
MAP_CANDIDATE_HEALTH_ATTEMPTS="${MAP_CANDIDATE_HEALTH_ATTEMPTS:-180}"
source "${SCRIPT_DIR}/map-preprocessing-common.sh"

map_validate_data_dir
map_require_python

fail() {
  echo "GIS candidate validation failed: $*" >&2
  exit 1
}

[[ "${MAP_CANDIDATE_HEALTH_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]] \
  || fail "MAP_CANDIDATE_HEALTH_ATTEMPTS must be a positive integer"

candidate_dir() {
  local component="$1"
  local path="${MAP_REFRESH_CANDIDATE_ROOT}/${component}"
  [[ -d "${path}" ]] || fail "missing ${component} candidate: ${path}"
  printf '%s\n' "${path}"
}

validate_provenance() {
  local component="$1"
  local path="$2"
  shift 2
  map_validate_python_manifest "${path}/manifest.json" "${path}" "${component}" "$@"
}

photon_candidate="$(candidate_dir photon)"
osrm_candidate="$(candidate_dir osrm)"
rendering_candidate="$(candidate_dir rendering)"

validate_provenance photon "${photon_candidate}" \
  "${PHOTON_DATASET_VERSION:?PHOTON_DATASET_VERSION is required}" \
  "${PHOTON_DATA_URL:-https://download1.graphhopper.com/public/north-america/mexico/photon-db-mexico-1.0-latest.tar.bz2}" \
  "${PHOTON_DATA_SHA256:?PHOTON_DATA_SHA256 is required}" photon_data

validate_provenance osrm "${osrm_candidate}" \
  "${OSRM_DATASET_VERSION:?OSRM_DATASET_VERSION is required}" \
  "${OSM_PBF_URL:-https://download.geofabrik.de/north-america/mexico-260812.osm.pbf}" \
  "${OSRM_PBF_SHA256:?OSRM_PBF_SHA256 is required}" \
  mexico-latest.osrm.properties mexico-latest.osrm.partition mexico-latest.osrm.cells

validate_provenance rendering "${rendering_candidate}" \
  "${RENDERING_DATASET_VERSION:?RENDERING_DATASET_VERSION is required}" \
  "${RENDERING_PBF_URL:-https://download.geofabrik.de/north-america/mexico-260812.osm.pbf}" \
  "${RENDERING_PBF_SHA256:?RENDERING_PBF_SHA256 is required}" mexico.pmtiles fonts

python3 - "${rendering_candidate}/manifest.json" \
  "${OPENMAPTILES_FONT_URL:-https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-open-sans.zip}" \
  "${FONT_DATASET_VERSION:?FONT_DATASET_VERSION is required}" \
  "${OPENMAPTILES_FONT_SHA256:?OPENMAPTILES_FONT_SHA256 is required}" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
expected = {
    "fontSourceUrl": sys.argv[2],
    "fontDatasetVersion": sys.argv[3],
    "fontSha256": sys.argv[4].lower(),
}
for key, value in expected.items():
    if manifest.get(key) != value:
        raise SystemExit(f"rendering candidate manifest mismatch: {key}")
PY

if [[ "${MAP_REFRESH_SKIP_RUNTIME_SMOKES:-0}" == "1" ]]; then
  if map_is_production; then
    fail "production candidate validation cannot skip runtime smokes"
  fi
  echo "Candidate runtime smokes skipped only for a non-production fixture."
  exit 0
fi

map_require_docker
CANDIDATE_CONTAINERS=()
cleanup() {
  local container
  for container in "${CANDIDATE_CONTAINERS[@]:-}"; do
    docker rm -f "${container}" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

candidate_container_name() {
  local component="$1"
  local safe_id
  safe_id="${MAP_REFRESH_ID//[^a-zA-Z0-9_.-]/-}"
  printf 'gis-candidate-%s-%s' "${component}" "${safe_id}"
}

run_candidate_container() {
  local component="$1"
  local path="$2"
  shift 2
  local name
  name="$(candidate_container_name "${component}")"
  docker rm -f "${name}" >/dev/null 2>&1 || true
  docker run -d --name "${name}" --network none "$@" >/dev/null
  CANDIDATE_CONTAINERS+=("${name}")
  CANDIDATE_CONTAINER_NAME="${name}"
}

wait_candidate_command() {
  local name="$1"
  shift
  local attempts=0
  while (( attempts < MAP_CANDIDATE_HEALTH_ATTEMPTS )); do
    if docker exec "${name}" "$@" >/dev/null 2>&1; then
      return 0
    fi
    attempts=$((attempts + 1))
    sleep 1
  done
  docker logs --tail 40 "${name}" >&2 || true
  return 1
}

echo "Starting isolated OSRM candidate smoke..."
run_candidate_container osrm "${osrm_candidate}" \
  --memory "${OSRM_MEM_LIMIT:-5g}" \
  --cpus "${OSRM_CPUS:-1.5}" \
  -v "${osrm_candidate}:/data:ro" \
  "${OSRM_RUNTIME_IMAGE:-${OSRM_IMAGE:-pollos-distribuidor/osrm:${OSRM_VERSION:-v5.27.1}}}" \
  osrm-routed --algorithm mld /data/mexico-latest.osrm
osrm_name="${CANDIDATE_CONTAINER_NAME}"
wait_candidate_command "${osrm_name}" curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:5000/nearest/v1/driving/-96.1342,19.1738?number=1 || fail "OSRM candidate did not become healthy"
docker exec "${osrm_name}" sh -c \
  'curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:5000/route/v1/driving/-96.1342,19.1738;-96.1150,19.1050?overview=false" | grep -q "\"code\":\"Ok\""' \
  || fail "OSRM candidate route smoke failed"

echo "Starting isolated Photon candidate smoke..."
run_candidate_container photon "${photon_candidate}" \
  --memory "${PHOTON_MEM_LIMIT:-6g}" \
  --cpus "${PHOTON_CPUS:-1.5}" \
  --env "JAVA_TOOL_OPTIONS=-Xms${PHOTON_JAVA_XMS:-1g} -Xmx${PHOTON_JAVA_XMX:-4g}" \
  -v "${photon_candidate}:/data" \
  "${PHOTON_IMAGE:-pollos-distribuidor/photon:${PHOTON_VERSION:-1.2.1}}"
photon_name="${CANDIDATE_CONTAINER_NAME}"
wait_candidate_command "${photon_name}" curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:2322/status || fail "Photon candidate did not become healthy"
docker exec "${photon_name}" sh -c \
  'curl --fail --silent --show-error --max-time 10 "http://127.0.0.1:2322/api?q=Veracruz&limit=1" | grep -q "\"features\""' \
  || fail "Photon candidate geocoding smoke failed"

echo "Starting isolated TileServer candidate smoke..."
run_candidate_container rendering "${rendering_candidate}" \
  --memory "${TILESERVER_MEM_LIMIT:-1.5g}" \
  --cpus "${TILESERVER_CPUS:-0.5}" \
  -v "${rendering_candidate}:/data/rendering:ro" \
  -v "${rendering_candidate}/fonts:/data/fonts:ro" \
  -v "${REPO_ROOT}/docker/maps/tileserver/config.json:/data/config.json:ro" \
  -v "${REPO_ROOT}/docker/maps/styles:/data/styles:ro" \
  "${TILESERVER_IMAGE:-maptiler/tileserver-gl:v5.6.0@sha256:a4561a6d8a717909d5620bb43283e6dcfd76be1bfa8b9327847c516affe3d7fb}" \
  --config /data/config.json --bind 127.0.0.1 --port 8080 --public_url /maps/ --silent
tileserver_name="${CANDIDATE_CONTAINER_NAME}"
wait_candidate_command "${tileserver_name}" node -e \
  "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
  || fail "TileServer candidate did not become healthy"
wait_candidate_command "${tileserver_name}" node -e \
  "fetch('http://127.0.0.1:8080/styles/operations/style.json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
  || fail "TileServer candidate style smoke failed"

echo "PASS: candidate manifests, isolated OSRM route, Photon geocoding, and TileServer style smokes"
