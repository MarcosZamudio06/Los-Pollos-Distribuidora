#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
MAP_DOCKER_PLATFORM="${MAP_DOCKER_PLATFORM:-linux/amd64}"
OSM_PBF_URL="${OSM_PBF_URL:-https://download.geofabrik.de/north-america/mexico-latest.osm.pbf}"
OSRM_IMAGE="${OSRM_IMAGE:-ghcr.io/project-osrm/osrm-backend:v5.27.1}"
TARGET_DIR="${MAP_DATA_DIR}/osrm"

if [[ -z "${MAP_DATA_DIR}" || "${MAP_DATA_DIR}" == "/" ]]; then
  echo "MAP_DATA_DIR must point to a dedicated non-root directory." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to prepare OSRM data." >&2
  exit 1
fi

verify_md5() {
  local file="$1"
  local checksum_file="$2"
  local expected actual
  expected="$(awk '{print $1}' "${checksum_file}")"

  if command -v md5sum >/dev/null 2>&1; then
    actual="$(md5sum "${file}" | awk '{print $1}')"
  elif command -v md5 >/dev/null 2>&1; then
    actual="$(md5 -q "${file}")"
  else
    echo "Neither md5sum nor md5 is available." >&2
    return 1
  fi

  if [[ "${actual}" != "${expected}" ]]; then
    echo "OSM extract checksum mismatch." >&2
    return 1
  fi
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to prepare OSRM data." >&2
  exit 1
fi

mkdir -p "${MAP_DATA_DIR}"
STAGING_DIR="$(mktemp -d "${MAP_DATA_DIR}/.osrm-staging.XXXXXX")"
trap 'rm -rf "${STAGING_DIR}"' EXIT

PBF_FILE="${STAGING_DIR}/mexico-latest.osm.pbf"
CHECKSUM="${PBF_FILE}.md5"

echo "Downloading Mexico OpenStreetMap extract..."
curl --fail --location --retry 3 "${OSM_PBF_URL}" --output "${PBF_FILE}"
curl --fail --location --retry 3 "${OSM_PBF_URL}.md5" --output "${CHECKSUM}"
verify_md5 "${PBF_FILE}" "${CHECKSUM}"
rm -f "${CHECKSUM}"

docker run --rm --platform "${MAP_DOCKER_PLATFORM}" -v "${STAGING_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-extract -p /opt/car.lua /data/mexico-latest.osm.pbf
docker run --rm --platform "${MAP_DOCKER_PLATFORM}" -v "${STAGING_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-partition /data/mexico-latest.osrm
docker run --rm --platform "${MAP_DOCKER_PLATFORM}" -v "${STAGING_DIR}:/data" "${OSRM_IMAGE}" \
  osrm-customize /data/mexico-latest.osrm

if [[ ! -f "${STAGING_DIR}/mexico-latest.osrm.partition" || ! -f "${STAGING_DIR}/mexico-latest.osrm.cells" ]]; then
  echo "OSRM preprocessing did not produce the expected MLD artifacts." >&2
  exit 1
fi

rm -f "${PBF_FILE}"
printf '%s\n' \
  "source=${OSM_PBF_URL}" \
  "image=${OSRM_IMAGE}" \
  "preparedAt=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  > "${STAGING_DIR}/DATA_VERSION"

PREVIOUS_DIR="${TARGET_DIR}.previous"
rm -rf "${PREVIOUS_DIR}"
if [[ -d "${TARGET_DIR}" ]]; then
  mv "${TARGET_DIR}" "${PREVIOUS_DIR}"
fi
mv "${STAGING_DIR}" "${TARGET_DIR}"
rm -rf "${PREVIOUS_DIR}"
trap - EXIT

echo "OSRM data is ready at ${TARGET_DIR}."
