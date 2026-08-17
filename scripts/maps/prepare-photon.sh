#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
MAP_DOCKER_PLATFORM="${MAP_DOCKER_PLATFORM:-linux/amd64}"
PHOTON_DATA_URL="${PHOTON_DATA_URL:-https://download1.graphhopper.com/public/north-america/mexico/photon-db-mexico-1.0-latest.tar.bz2}"
PHOTON_DATASET_VERSION="${PHOTON_DATASET_VERSION:-photon-mexico-1.0}"
PHOTON_DATA_SHA256="${PHOTON_DATA_SHA256:-}"
PHOTON_SOURCE_SIZE_BYTES="${PHOTON_SOURCE_SIZE_BYTES:-0}"
PHOTON_CANDIDATE_SIZE_BYTES="${PHOTON_CANDIDATE_SIZE_BYTES:-0}"
PHOTON_PREP_IMAGE="${PHOTON_PREP_IMAGE:-alpine:3.21@sha256:48b0309ca019d89d40f670aa1bc06e426dc0931948452e8491e3d65087abc07d}"
PHOTON_VERSION="${PHOTON_VERSION:-1.2.1}"
TARGET_DIR="${MAP_DATA_DIR}/photon"
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

if ! map_is_refresh_candidate_mode && service_is_running photon; then
  echo "Photon is running. Stop the service before replacing its bind-mounted dataset." >&2
  exit 1
fi

for command in curl docker python3; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required to prepare Photon data." >&2
    exit 1
  fi
done
map_require_docker
map_require_python

active_bytes="$(map_dir_size_bytes "${TARGET_DIR}")"
map_plan_source photon "${PHOTON_DATASET_VERSION}" "${PHOTON_DATA_URL}" \
  "${PHOTON_DATA_SHA256}" photon.tar.bz2 "${PHOTON_SOURCE_SIZE_BYTES}"
candidate_bytes="$(map_component_candidate_bytes "${PHOTON_CANDIDATE_SIZE_BYTES}" "${MAP_SOURCE_SIZE_BYTES}" "${active_bytes}")"
map_disk_preflight photon "${MAP_SOURCE_SIZE_BYTES}" "$((MAP_SOURCE_SIZE_BYTES + candidate_bytes))" \
  "${candidate_bytes}" "${active_bytes}"
map_fetch_planned_source

map_prepare_staging_dir photon .photon-staging
cp "${MAP_SOURCE_PATH}" "${STAGING_DIR}/photon.tar.bz2"

echo "Extracting Photon dataset with ${PHOTON_PREP_IMAGE}..."
map_docker_run_limited --platform "${MAP_DOCKER_PLATFORM}" \
  --user "$(id -u):$(id -g)" -v "${STAGING_DIR}:/data" \
  "${PHOTON_PREP_IMAGE}" sh -c 'tar -xjf /data/photon.tar.bz2 -C /data'
rm -f "${STAGING_DIR}/photon.tar.bz2"

if [[ ! -d "${STAGING_DIR}/photon_data" ]]; then
  echo "The Photon archive did not contain photon_data/." >&2
  exit 1
fi

map_write_component_manifest "${STAGING_DIR}/manifest.json" photon \
  "${PHOTON_DATASET_VERSION}" "${PHOTON_DATA_URL}" "${PHOTON_DATA_SHA256}" \
  Photon "${PHOTON_VERSION}" "${PHOTON_PREP_IMAGE}" photon_data
printf '%s\n' \
  "component=photon" \
  "datasetVersion=${PHOTON_DATASET_VERSION}" \
  "source=${PHOTON_DATA_URL}" \
  "sha256=${PHOTON_DATA_SHA256}" \
  "preparedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  >"${STAGING_DIR}/DATA_VERSION"

map_validate_python_manifest "${STAGING_DIR}/manifest.json" "${STAGING_DIR}" \
  photon "${PHOTON_DATASET_VERSION}" "${PHOTON_DATA_URL}" \
  "${PHOTON_DATA_SHA256}" photon_data
fingerprint="${MAP_SOURCE_IDENTITY}"
if map_is_refresh_candidate_mode; then
  map_record_candidate photon "${STAGING_DIR}" "${fingerprint}"
else
  map_promote_component photon "${TARGET_DIR}" "${STAGING_DIR}" "${fingerprint}"
fi
STAGING_DIR=""
map_release_preprocessing_lock
trap - EXIT

if map_is_refresh_candidate_mode; then
  echo "Photon candidate is ready at ${MAP_REFRESH_CANDIDATE_ROOT}/photon; provenance=${fingerprint}."
else
  echo "Photon data is ready at ${TARGET_DIR}; provenance=${fingerprint}."
fi
