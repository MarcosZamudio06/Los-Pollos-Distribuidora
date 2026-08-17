#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
MAP_DOCKER_PLATFORM="${MAP_DOCKER_PLATFORM:-linux/amd64}"
OSM_PBF_URL="${OSM_PBF_URL:-https://download.geofabrik.de/north-america/mexico-260812.osm.pbf}"
OSRM_DATASET_VERSION="${OSRM_DATASET_VERSION:-mexico-260812}"
OSRM_PBF_SHA256="${OSRM_PBF_SHA256:-}"
OSRM_SOURCE_SIZE_BYTES="${OSRM_SOURCE_SIZE_BYTES:-0}"
OSRM_CANDIDATE_SIZE_BYTES="${OSRM_CANDIDATE_SIZE_BYTES:-0}"
OSRM_IMAGE="${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:v5.27.1@sha256:855614a38f464b0558a2ad6eaa7cb8c139f39887da9b38b485ce453c6e6e6124}"
OSRM_VERSION="${OSRM_VERSION:-v5.27.1}"
TARGET_DIR="${MAP_DATA_DIR}/osrm"
source "${SCRIPT_DIR}/map-preprocessing-common.sh"

map_validate_data_dir
map_acquire_preprocessing_lock
cleanup() {
  if [[ -n "${STAGING_DIR:-}" ]]; then
    rm -rf -- "${STAGING_DIR}"
  fi
  map_release_preprocessing_lock
}
trap cleanup EXIT

service_is_running() {
  local service="$1"
  local running_services
  if ! command -v docker >/dev/null 2>&1; then
    return 1
  fi
  if ! running_services="$(cd "${REPO_ROOT}" && docker compose --profile maps ps --status running --services 2>/dev/null)"; then
    return 1
  fi
  grep -Fqx -- "${service}" <<<"${running_services}"
}

if ! map_is_refresh_candidate_mode && service_is_running osrm; then
  echo "OSRM is running. Stop the service before replacing its bind-mounted dataset." >&2
  exit 1
fi

for command in curl docker python3; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required to prepare OSRM data." >&2
    exit 1
  fi
done
map_require_docker
map_require_python

active_bytes="$(map_dir_size_bytes "${TARGET_DIR}")"
map_plan_source osrm "${OSRM_DATASET_VERSION}" "${OSM_PBF_URL}" \
  "${OSRM_PBF_SHA256}" mexico.osm.pbf "${OSRM_SOURCE_SIZE_BYTES}"
candidate_bytes="$(map_component_candidate_bytes "${OSRM_CANDIDATE_SIZE_BYTES}" "${MAP_SOURCE_SIZE_BYTES}" "${active_bytes}")"
map_disk_preflight osrm "${MAP_SOURCE_SIZE_BYTES}" "$((MAP_SOURCE_SIZE_BYTES + candidate_bytes))" \
  "${candidate_bytes}" "${active_bytes}"
map_fetch_planned_source

map_prepare_staging_dir osrm .osrm-staging
cp "${MAP_SOURCE_PATH}" "${STAGING_DIR}/mexico-latest.osm.pbf"

map_docker_run_limited --platform "${MAP_DOCKER_PLATFORM}" -v "${STAGING_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-extract -p /opt/car.lua /data/mexico-latest.osm.pbf
map_docker_run_limited --platform "${MAP_DOCKER_PLATFORM}" -v "${STAGING_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-partition /data/mexico-latest.osrm
map_docker_run_limited --platform "${MAP_DOCKER_PLATFORM}" -v "${STAGING_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-customize /data/mexico-latest.osrm

for artifact in \
  mexico-latest.osrm.properties \
  mexico-latest.osrm.partition \
  mexico-latest.osrm.cells; do
  if [[ ! -s "${STAGING_DIR}/${artifact}" ]]; then
    echo "OSRM preprocessing did not produce the expected artifact: ${artifact}" >&2
    exit 1
  fi
done
rm -f "${STAGING_DIR}/mexico-latest.osm.pbf"

map_write_component_manifest "${STAGING_DIR}/manifest.json" osrm \
  "${OSRM_DATASET_VERSION}" "${OSM_PBF_URL}" "${OSRM_PBF_SHA256}" \
  OSRM "${OSRM_VERSION}" "${OSRM_IMAGE}" \
  mexico-latest.osrm.properties mexico-latest.osrm.partition mexico-latest.osrm.cells
printf '%s\n' \
  "component=osrm" \
  "datasetVersion=${OSRM_DATASET_VERSION}" \
  "source=${OSM_PBF_URL}" \
  "sha256=${OSRM_PBF_SHA256}" \
  "image=${OSRM_IMAGE}" \
  "preparedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  >"${STAGING_DIR}/DATA_VERSION"

map_validate_python_manifest "${STAGING_DIR}/manifest.json" "${STAGING_DIR}" \
  osrm "${OSRM_DATASET_VERSION}" "${OSM_PBF_URL}" "${OSRM_PBF_SHA256}" \
  mexico-latest.osrm.properties mexico-latest.osrm.partition mexico-latest.osrm.cells
fingerprint="${MAP_SOURCE_IDENTITY}"
if map_is_refresh_candidate_mode; then
  map_record_candidate osrm "${STAGING_DIR}" "${fingerprint}"
else
  map_promote_component osrm "${TARGET_DIR}" "${STAGING_DIR}" "${fingerprint}"
fi
STAGING_DIR=""
map_release_preprocessing_lock
trap - EXIT

if map_is_refresh_candidate_mode; then
  echo "OSRM candidate is ready at ${MAP_REFRESH_CANDIDATE_ROOT}/osrm; provenance=${fingerprint}."
else
  echo "OSRM data is ready at ${TARGET_DIR}; provenance=${fingerprint}."
fi
