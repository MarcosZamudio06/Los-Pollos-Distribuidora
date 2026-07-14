#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
PHOTON_DATA_URL="${PHOTON_DATA_URL:-https://download1.graphhopper.com/public/north-america/mexico/photon-db-mexico-1.0-latest.tar.bz2}"
TARGET_DIR="${MAP_DATA_DIR}/photon"

if [[ -z "${MAP_DATA_DIR}" || "${MAP_DATA_DIR}" == "/" ]]; then
  echo "MAP_DATA_DIR must point to a dedicated non-root directory." >&2
  exit 1
fi

for command in curl tar; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required to prepare Photon data." >&2
    exit 1
  fi
done

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
    echo "Photon archive checksum mismatch." >&2
    return 1
  fi
}

mkdir -p "${MAP_DATA_DIR}"
STAGING_DIR="$(mktemp -d "${MAP_DATA_DIR}/.photon-staging.XXXXXX")"
trap 'rm -rf "${STAGING_DIR}"' EXIT

ARCHIVE="${STAGING_DIR}/photon.tar.bz2"
CHECKSUM="${ARCHIVE}.md5"

echo "Downloading Photon Mexico dataset..."
curl --fail --location --retry 3 "${PHOTON_DATA_URL}" --output "${ARCHIVE}"
curl --fail --location --retry 3 "${PHOTON_DATA_URL}.md5" --output "${CHECKSUM}"
verify_md5 "${ARCHIVE}" "${CHECKSUM}"

tar -xjf "${ARCHIVE}" -C "${STAGING_DIR}"
rm -f "${ARCHIVE}" "${CHECKSUM}"

if [[ ! -d "${STAGING_DIR}/photon_data" ]]; then
  echo "The Photon archive did not contain photon_data/." >&2
  exit 1
fi

printf '%s\n' \
  "source=${PHOTON_DATA_URL}" \
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

echo "Photon data is ready at ${TARGET_DIR}."
