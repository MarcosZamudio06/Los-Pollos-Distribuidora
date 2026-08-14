#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maps-live-mount-safety.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

run_expect_failure() {
  local name="$1"
  local expected_message="$2"
  shift 2

  set +e
  local output
  output="$("$@" 2>&1)"
  local status=$?
  set -e

  if [[ "${status}" -eq 0 ]]; then
    fail "${name} unexpectedly allowed a live dataset swap."
  fi
  if ! grep -Fq "${expected_message}" <<<"${output}"; then
    printf '%s\n' "${output}" >&2
    fail "${name} did not emit: ${expected_message}"
  fi
}

write_archive_curl_stub() {
  local path="$1"
  cat >"${path}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

output=""
while (($# > 0)); do
  case "$1" in
    --output)
      output="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -z "${output}" ]]; then
  exit 2
fi

if [[ "${output}" == *.md5 ]]; then
  printf '%s\n' 'fixture-md5' >"${output}"
else
  printf '%s\n' 'fixture-archive' >"${output}"
fi
STUB
  chmod +x "${path}"
}

write_md5_stub() {
  local path="$1"
  cat >"${path}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s  %s\n' 'fixture-md5' "${1}"
STUB
  chmod +x "${path}"
}

write_photon_tar_stub() {
  local path="$1"
  cat >"${path}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

destination=""
while (($# > 0)); do
  if [[ "$1" == "-C" ]]; then
    destination="$2"
    shift 2
  else
    shift
  fi
done

mkdir -p "${destination}/photon_data"
printf '%s\n' 'fixture' >"${destination}/photon_data/fixture"
STUB
  chmod +x "${path}"
}

write_photon_docker_stub() {
  local path="$1"
  cat >"${path}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "compose" ]]; then
  printf '%s\n' photon
fi
STUB
  chmod +x "${path}"
}

write_osrm_docker_stub() {
  local path="$1"
  cat >"${path}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "compose" ]]; then
  printf '%s\n' osrm
  exit 0
fi

if [[ "${1:-}" == "run" ]]; then
  staging_dir=""
  for argument in "$@"; do
    if [[ "${argument}" == *:/data ]]; then
      staging_dir="${argument%:/data}"
    fi
  done
  : "${staging_dir:?missing /data bind mount}"
  touch "${staging_dir}/mexico-latest.osrm.partition" "${staging_dir}/mexico-latest.osrm.cells"
fi
STUB
  chmod +x "${path}"
}

write_rendering_curl_stub() {
  local path="$1"
  cat >"${path}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo 'unexpected network access in rendering guard contract test' >&2
exit 99
STUB
  chmod +x "${path}"
}

write_rendering_docker_stub() {
  local path="$1"
  cat >"${path}" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "compose" ]]; then
  printf '%s\n' tileserver
  exit 0
fi

echo 'unexpected Planetiler invocation in rendering guard contract test' >&2
exit 99
STUB
  chmod +x "${path}"
}

assert_order() {
  local file="$1"
  local first_marker="$2"
  local second_marker="$3"
  local first_line second_line

  first_line="$(awk -v marker="${first_marker}" 'index($0, marker) { print NR; exit }' "${file}")"
  second_line="$(awk -v marker="${second_marker}" 'index($0, marker) { print NR; exit }' "${file}")"
  [[ -n "${first_line}" ]] || fail "missing marker in ${file}: ${first_marker}"
  [[ -n "${second_line}" ]] || fail "missing marker in ${file}: ${second_marker}"
  (( first_line < second_line )) || fail "${first_marker} must precede ${second_marker}"
}

assert_healthcheck_block() {
  local marker="$1"
  local service="$2"
  local block

  block="$(grep -A8 -F "${marker}" "${SCRIPT_DIR}/verify-stack.sh" || true)"
  grep -Fq -- '--fail' <<<"${block}" || fail "${service} healthcheck is missing --fail"
  grep -Fq -- '--silent' <<<"${block}" || fail "${service} healthcheck is missing --silent"
  grep -Fq -- '--show-error' <<<"${block}" || fail "${service} healthcheck is missing --show-error"
  grep -Fq -- '--max-time 10' <<<"${block}" || fail "${service} healthcheck is missing --max-time 10"
}

ORIGINAL_PATH="${PATH}"

photon_fixture="${TMP_DIR}/photon"
photon_bin="${photon_fixture}/bin"
photon_data="${photon_fixture}/data"
mkdir -p "${photon_bin}" "${photon_data}/photon"
printf '%s\n' active >"${photon_data}/photon/active-marker"
write_archive_curl_stub "${photon_bin}/curl"
write_md5_stub "${photon_bin}/md5sum"
write_photon_tar_stub "${photon_bin}/tar"
write_photon_docker_stub "${photon_bin}/docker"

run_expect_failure \
  "prepare-photon" \
  "Photon is running. Stop the service before replacing its bind-mounted dataset." \
  env \
  "PATH=${photon_bin}:${ORIGINAL_PATH}" \
  "MAP_DATA_DIR=${photon_data}" \
  PHOTON_DATA_URL=fixture \
  bash "${SCRIPT_DIR}/prepare-photon.sh"
grep -Fq active "${photon_data}/photon/active-marker" || fail "Photon active dataset changed"

osrm_fixture="${TMP_DIR}/osrm"
osrm_bin="${osrm_fixture}/bin"
osrm_data="${osrm_fixture}/data"
mkdir -p "${osrm_bin}" "${osrm_data}/osrm"
printf '%s\n' active >"${osrm_data}/osrm/active-marker"
write_archive_curl_stub "${osrm_bin}/curl"
write_md5_stub "${osrm_bin}/md5sum"
write_osrm_docker_stub "${osrm_bin}/docker"

run_expect_failure \
  "prepare-osrm" \
  "OSRM is running. Stop the service before replacing its bind-mounted dataset." \
  env \
  "PATH=${osrm_bin}:${ORIGINAL_PATH}" \
  "MAP_DATA_DIR=${osrm_data}" \
  OSM_PBF_URL=fixture \
  OSRM_IMAGE=fixture \
  bash "${SCRIPT_DIR}/prepare-osrm.sh"
grep -Fq active "${osrm_data}/osrm/active-marker" || fail "OSRM active dataset changed"

rendering_fixture="${TMP_DIR}/rendering"
rendering_bin="${rendering_fixture}/bin"
rendering_data="${rendering_fixture}/data"
rendering_active="${rendering_data}/rendering"
mkdir -p "${rendering_bin}" "${rendering_data}/sources" \
  "${rendering_active}/fonts/Noto Sans Regular"
printf '%s\n' source >"${rendering_data}/sources/mexico.osm.pbf"
printf '%s\n' active >"${rendering_active}/mexico.pmtiles"
printf '%s\n' font >"${rendering_active}/fonts/Noto Sans Regular/0-255.pbf"
dataset_sha256="$(if command -v sha256sum >/dev/null 2>&1; then sha256sum "${rendering_data}/sources/mexico.osm.pbf" | awk '{print $1}'; else shasum -a 256 "${rendering_data}/sources/mexico.osm.pbf" | awk '{print $1}'; fi)"
cat >"${rendering_active}/manifest.json" <<EOF
{
  "datasetSha256": "${dataset_sha256}",
  "datasetVersion": "fixture",
  "generatorVersion": "v0.10.2",
  "styleRevision": "osm-bright-563b249f7ae71528b1f1e327cb9c019d0dda4c50",
  "fontRevision": "openmaptiles-fonts-v2.0"
}
EOF
cp "${rendering_active}/manifest.json" "${rendering_fixture}/manifest.before"
write_rendering_curl_stub "${rendering_bin}/curl"
write_rendering_docker_stub "${rendering_bin}/docker"

run_expect_failure \
  "prepare-rendering" \
  "TileServer GL is running. Stop the service before activating the rendering dataset." \
  env \
  "PATH=${rendering_bin}:${ORIGINAL_PATH}" \
  "MAP_DATA_DIR=${rendering_data}" \
  MAP_DATA_VERSION=fixture \
  OSM_PBF_URL=fixture \
  PLANETILER_IMAGE=fixture \
  bash "${SCRIPT_DIR}/prepare-rendering.sh"
grep -Fq active "${rendering_active}/mexico.pmtiles" || fail "Rendering PMTiles changed"
cmp -s "${rendering_fixture}/manifest.before" "${rendering_active}/manifest.json" || fail "Rendering manifest changed"

refresh_script="${SCRIPT_DIR}/refresh-monthly.sh"
assert_order "${refresh_script}" \
  'docker compose --profile maps stop backend vroom photon osrm tileserver' \
  '"${SCRIPT_DIR}/prepare-all.sh"'
assert_order "${refresh_script}" \
  '"${SCRIPT_DIR}/prepare-all.sh"' \
  'docker compose --profile maps up -d --force-recreate photon osrm vroom tileserver backend'
stop_line="$(awk '/docker compose --profile maps stop backend vroom photon osrm tileserver/ { print; exit }' "${refresh_script}")"
[[ "${stop_line}" != *postgres* ]] || fail "refresh-monthly must not stop PostgreSQL"

assert_healthcheck_block 'exec -T photon' Photon
assert_healthcheck_block 'exec -T osrm' OSRM
assert_healthcheck_block 'exec -T vroom' VROOM
assert_healthcheck_block 'run_http_healthcheck "Frontend /maps"' 'Frontend /maps'
for message in \
  'Photon health check failed.' \
  'OSRM health check failed.' \
  'VROOM health check failed.' \
  'Frontend /maps health check failed.' \
  'TileServer GL rendering health check failed.'; do
  grep -Fq "${message}" "${SCRIPT_DIR}/verify-stack.sh" || fail "missing failure message: ${message}"
done

echo "PASS: map live-mount safety contracts"
