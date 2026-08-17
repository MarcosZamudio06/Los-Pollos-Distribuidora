#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maps-provenance-safety.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

export MAP_DATA_DIR="${TMP_DIR}/data"
export MAP_REPO_ROOT="${REPO_ROOT}"
export MAP_ENVIRONMENT=development
export MAP_MIN_FREE_GB=0
export MAP_RESERVED_HOST_GB=0
export MAP_RESERVED_POSTGRES_GB=0
export MAP_RESERVED_PERCENT=0
export MAP_STAGING_SAFETY_FACTOR=1
export MAP_MAX_HISTORY_VERSIONS=1
mkdir -p "${MAP_DATA_DIR}"
source "${SCRIPT_DIR}/map-preprocessing-common.sh"
map_validate_data_dir

printf '%s\n' source-v1 >"${TMP_DIR}/source-v1.bin"
sha_v1="$(map_sha256_file "${TMP_DIR}/source-v1.bin")"
source_url="file://${TMP_DIR}/source-v1.bin"

map_plan_source fixture fixture-v1 "${source_url}" "${sha_v1}" artifact.bin 0
[[ "${MAP_SOURCE_CACHE_VALID}" == 0 ]] || fail "first source plan unexpectedly reused cache"
map_disk_preflight fixture "${MAP_SOURCE_SIZE_BYTES}" "${MAP_SOURCE_SIZE_BYTES}" \
  "${MAP_SOURCE_SIZE_BYTES}" 0 >/dev/null
map_fetch_planned_source
[[ -s "${MAP_SOURCE_PATH}" ]] || fail "source was not cached"
first_cache="${MAP_SOURCE_PATH}"

map_plan_source fixture fixture-v1 "${source_url}" "${sha_v1}" artifact.bin 0
[[ "${MAP_SOURCE_CACHE_VALID}" == 1 ]] || fail "same URL/version/hash did not reuse cache"
[[ "${MAP_SOURCE_PATH}" == "${first_cache}" ]] || fail "same identity changed cache path"

cp "${TMP_DIR}/source-v1.bin" "${TMP_DIR}/source-url-2.bin"
map_plan_source fixture fixture-v1 "file://${TMP_DIR}/source-url-2.bin" "${sha_v1}" artifact.bin 0
[[ "${MAP_SOURCE_PATH}" != "${first_cache}" ]] || fail "URL change reused old source cache"
[[ "${MAP_SOURCE_CACHE_VALID}" == 0 ]] || fail "URL change incorrectly reused cache"

map_plan_source fixture fixture-v2 "${source_url}" "${sha_v1}" artifact.bin 0
[[ "${MAP_SOURCE_PATH}" != "${first_cache}" ]] || fail "version change reused old source cache"

printf '%s\n' source-v2 >"${TMP_DIR}/source-v2.bin"
sha_v2="$(map_sha256_file "${TMP_DIR}/source-v2.bin")"
map_plan_source fixture fixture-v1 "file://${TMP_DIR}/source-v2.bin" "${sha_v2}" artifact.bin 0
[[ "${MAP_SOURCE_PATH}" != "${first_cache}" ]] || fail "checksum change reused old source cache"

set +e
map_plan_source fixture fixture-v1 "${source_url}" \
  0000000000000000000000000000000000000000000000000000000000000000 artifact.bin 0 >/dev/null 2>&1
plan_status=$?
set -e
[[ "${plan_status}" -eq 0 ]] || fail "checksum mismatch was rejected before the safe download test"
set +e
map_disk_preflight fixture 1 1 1 0 >/dev/null 2>&1
disk_status=$?
set -e
[[ "${disk_status}" -eq 0 ]] || fail "small fixture preflight unexpectedly failed"
set +e
map_fetch_planned_source >/dev/null 2>&1
fetch_status=$?
set -e
[[ "${fetch_status}" -ne 0 ]] || fail "incorrect checksum was accepted"

export MAP_ENVIRONMENT=production
set +e
map_require_provenance_inputs fixture latest https://example.test/latest '' >/dev/null 2>&1
latest_status=$?
set -e
[[ "${latest_status}" -ne 0 ]] || fail "latest without checksum was accepted in production"
export MAP_ENVIRONMENT=development

mkdir -p "${MAP_DATA_DIR}/active"
printf '%s\n' active >"${MAP_DATA_DIR}/active/active-marker"
set +e
map_disk_preflight fixture 999999999999999 999999999999999 999999999999999 0 >/dev/null 2>&1
preflight_status=$?
set -e
[[ "${preflight_status}" -ne 0 ]] || fail "insufficient-space preflight unexpectedly passed"
grep -Fq active "${MAP_DATA_DIR}/active/active-marker" || fail "failed preflight touched active data"

candidate="${MAP_DATA_DIR}/.fixture-candidate"
mkdir -p "${candidate}"
printf '%s\n' candidate >"${candidate}/artifact.txt"
map_write_component_manifest "${candidate}/manifest.json" fixture fixture-v1 \
  "${source_url}" "${sha_v1}" Fixture v1 fixture-image artifact.txt
fingerprint="$(map_identity_fingerprint fixture fixture-v1 "${source_url}" "${sha_v1}")"
map_promote_component fixture "${MAP_DATA_DIR}/active" "${candidate}" "${fingerprint}"
[[ -f "${MAP_DATA_DIR}/active/artifact.txt" ]] || fail "candidate was not promoted"
[[ -f "${MAP_DATA_DIR}/active.previous/active-marker" ]] || fail "active rollback was not preserved"

failed_candidate="${MAP_DATA_DIR}/.failed-candidate"
mkdir -p "${failed_candidate}"
set +e
map_promote_component fixture "${MAP_DATA_DIR}/active" "${failed_candidate}" "${fingerprint}" >/dev/null 2>&1
promotion_status=$?
set -e
[[ "${promotion_status}" -ne 0 ]] || fail "invalid candidate was promoted"
[[ -f "${MAP_DATA_DIR}/active/artifact.txt" ]] || fail "failed promotion changed active data"

echo "PASS: GIS storage provenance, cache identity, disk preflight, and rollback safety"
