#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gis-zero-downtime-refresh.XXXXXX")"
trap 'rm -rf "${TMP_DIR}"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

DATA_DIR="${TMP_DIR}/map-data"
SOURCE_DIR="${TMP_DIR}/sources"
BIN_DIR="${TMP_DIR}/bin"
mkdir -p "${DATA_DIR}" "${SOURCE_DIR}" "${BIN_DIR}"

printf '%s\n' 'candidate-v2' >"${SOURCE_DIR}/photon-v2.tar.bz2"
printf '%s\n' 'candidate-v2' >"${SOURCE_DIR}/mexico-v2.osm.pbf"
printf '%s\n' 'font-v2' >"${SOURCE_DIR}/fonts-v2.zip"

mkdir -p \
  "${DATA_DIR}/photon/photon_data" \
  "${DATA_DIR}/osrm" \
  "${DATA_DIR}/rendering/fonts/Noto Sans Regular"
printf '%s\n' active-v1 >"${DATA_DIR}/photon/photon_data/marker"
printf '%s\n' active-v1 >"${DATA_DIR}/osrm/mexico-latest.osrm.properties"
printf '%s\n' active-v1 >"${DATA_DIR}/osrm/mexico-latest.osrm.partition"
printf '%s\n' active-v1 >"${DATA_DIR}/osrm/mexico-latest.osrm.cells"
printf '%s\n' active-v1 >"${DATA_DIR}/rendering/mexico.pmtiles"
printf '%s\n' active-v1 >"${DATA_DIR}/rendering/fonts/Noto Sans Regular/0-255.pbf"

cat >"${BIN_DIR}/curl" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
output=""
url=""
for ((index = 1; index <= $#; index++)); do
  argument="${!index}"
  case "${argument}" in
    --output|-o)
      next=$((index + 1))
      output="${!next}"
      ;;
    file://*|http://*|https://*)
      url="${argument}"
      ;;
  esac
done
if [[ -n "${output}" && "${url}" == file://* ]]; then
  cp "${url#file://}" "${output}"
fi
printf '%s\n' "${url}" >>"${GIS_FIXTURE_CURL_LOG}"
exit 0
STUB
chmod +x "${BIN_DIR}/curl"

cat >"${BIN_DIR}/docker" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"${GIS_FIXTURE_DOCKER_LOG}"

if [[ "${1:-}" == "compose" ]]; then
  shift
  case "${1:-}" in
    up)
      service="${@: -1}"
      if [[ "${service}" == "${GIS_FIXTURE_FAIL_ONCE_SERVICE:-}" && ! -f "${GIS_FIXTURE_FAIL_MARKER}" ]]; then
        touch "${GIS_FIXTURE_FAIL_MARKER}"
        exit 1
      fi
      exit 0
      ;;
    ps)
      if [[ "${2:-}" == "-q" ]]; then
        printf 'fixture-%s\n' "${3}"
      else
        printf '%s\n' 'backend photon osrm vroom tileserver'
      fi
      exit 0
      ;;
    exec)
      if [[ "$*" == *" osrm "* || "$*" == *" osrm curl"* ]]; then
        printf '%s\n' '{"code":"Ok","features":[]}'
      elif [[ "$*" == *" photon "* || "$*" == *" photon curl"* ]]; then
        printf '%s\n' '{"features":[]}'
      fi
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
fi

if [[ "${1:-}" == "inspect" ]]; then
  printf 'healthy\n'
  exit 0
fi

if [[ "${1:-}" == "run" ]]; then
  staging=""
  for ((index = 1; index <= $#; index++)); do
    argument="${!index}"
    if [[ "${argument}" == "-v" ]]; then
      next=$((index + 1))
      volume="${!next}"
      if [[ "${volume}" == *:/data ]]; then
        staging="${volume%:/data}"
      fi
    fi
  done
  [[ -n "${staging}" ]] || exit 2
  sleep 1
  source_value=""
  if [[ -f "${staging}/photon.tar.bz2" ]]; then
    source_value="$(cat "${staging}/photon.tar.bz2")"
    mkdir -p "${staging}/photon_data"
    printf '%s\n' "${source_value}" >"${staging}/photon_data/marker"
  elif [[ -f "${staging}/mexico-latest.osm.pbf" ]]; then
    source_value="$(cat "${staging}/mexico-latest.osm.pbf")"
  elif [[ -f "${staging}/mexico.osm.pbf" ]]; then
    source_value="$(cat "${staging}/mexico.osm.pbf")"
  fi
  for argument in "$@"; do
    case "${argument}" in
      osrm-extract)
        printf '%s\n' "${source_value}" >"${staging}/mexico-latest.osrm.properties"
        ;;
      osrm-partition)
        printf '%s\n' "${source_value}" >"${staging}/mexico-latest.osrm.partition"
        printf '%s\n' "${source_value}" >"${staging}/mexico-latest.osrm.cells"
        ;;
      --output=/data/mexico.pmtiles)
        printf '%s\n' "${source_value}" >"${staging}/mexico.pmtiles"
        ;;
    esac
  done
  exit 0
fi

if [[ "${1:-}" == "rm" || "${1:-}" == "logs" ]]; then
  exit 0
fi
exit 0
STUB
chmod +x "${BIN_DIR}/docker"

export GIS_FIXTURE_CURL_LOG="${TMP_DIR}/curl.log"
export GIS_FIXTURE_DOCKER_LOG="${TMP_DIR}/docker.log"
export GIS_FIXTURE_FAIL_MARKER="${TMP_DIR}/fail-once"
export PATH="${BIN_DIR}:${PATH}"
export MAP_ENVIRONMENT=development
export MAP_DATA_DIR="${DATA_DIR}"
export MAP_REPO_ROOT="${REPO_ROOT}"
export MAP_MIN_FREE_GB=0
export MAP_RESERVED_HOST_GB=0
export MAP_RESERVED_POSTGRES_GB=0
export MAP_RESERVED_PERCENT=0
export MAP_STAGING_SAFETY_FACTOR=1
export MAP_MAX_HISTORY_VERSIONS=2
export MAP_REFRESH_SOURCE_SIZE_BYTES=32
export MAP_REFRESH_SKIP_RUNTIME_SMOKES=1
export MAP_REFRESH_SKIP_FINAL_SMOKES=1
export MAP_REFRESH_BACKEND_HEALTH_URL=http://fixture/api/health/ready
export MAP_REFRESH_BACKEND_MONITOR_INTERVAL_SECONDS=1
export MAP_REFRESH_KEEP_FAILED=1
export PHOTON_DATASET_VERSION=photon-v2
export PHOTON_DATA_URL="file://${SOURCE_DIR}/photon-v2.tar.bz2"
export PHOTON_DATA_SHA256="$(sha256_file "${SOURCE_DIR}/photon-v2.tar.bz2")"
export PHOTON_SOURCE_SIZE_BYTES="$(wc -c <"${SOURCE_DIR}/photon-v2.tar.bz2" | tr -d ' ')"
export OSM_PBF_URL="file://${SOURCE_DIR}/mexico-v2.osm.pbf"
export OSRM_DATASET_VERSION=mexico-v2
export OSRM_PBF_SHA256="$(sha256_file "${SOURCE_DIR}/mexico-v2.osm.pbf")"
export OSRM_SOURCE_SIZE_BYTES="$(wc -c <"${SOURCE_DIR}/mexico-v2.osm.pbf" | tr -d ' ')"
export RENDERING_PBF_URL="file://${SOURCE_DIR}/mexico-v2.osm.pbf"
export RENDERING_DATASET_VERSION=mexico-v2
export RENDERING_PBF_SHA256="${OSRM_PBF_SHA256}"
export RENDERING_SOURCE_SIZE_BYTES="${OSRM_SOURCE_SIZE_BYTES}"
export OPENMAPTILES_FONT_URL="file://${SOURCE_DIR}/fonts-v2.zip"
export FONT_DATASET_VERSION=fonts-v2
export OPENMAPTILES_FONT_SHA256="$(sha256_file "${SOURCE_DIR}/fonts-v2.zip")"
export FONT_SOURCE_SIZE_BYTES="$(wc -c <"${SOURCE_DIR}/fonts-v2.zip" | tr -d ' ')"

MAP_REFRESH_ID=fixture-v2 bash "${SCRIPT_DIR}/refresh-monthly.sh"
grep -Fq 'http://fixture/api/health/ready' "${GIS_FIXTURE_CURL_LOG}" || fail 'backend readiness was not checked'
if grep -Eq 'compose (stop|down)' "${GIS_FIXTURE_DOCKER_LOG}"; then
  fail 'refresh stopped or tore down a service during preparation'
fi
grep -Fq candidate-v2 "${DATA_DIR}/photon/photon_data/marker" || fail 'Photon v2 was not promoted'
grep -Fq candidate-v2 "${DATA_DIR}/osrm/mexico-latest.osrm.properties" || fail 'OSRM v2 was not promoted'
grep -Fq candidate-v2 "${DATA_DIR}/rendering/mexico.pmtiles" || fail 'rendering v2 was not promoted'
grep -Fq active-v1 "${DATA_DIR}/photon.previous/photon_data/marker" || fail 'Photon v1 rollback was not retained'

printf '%s\n' 'candidate-v3' >"${SOURCE_DIR}/photon-v3.tar.bz2"
printf '%s\n' 'candidate-v3' >"${SOURCE_DIR}/mexico-v3.osm.pbf"
export PHOTON_DATASET_VERSION=photon-v3
export PHOTON_DATA_URL="file://${SOURCE_DIR}/photon-v3.tar.bz2"
export PHOTON_DATA_SHA256="$(sha256_file "${SOURCE_DIR}/photon-v3.tar.bz2")"
export PHOTON_SOURCE_SIZE_BYTES="$(wc -c <"${SOURCE_DIR}/photon-v3.tar.bz2" | tr -d ' ')"
export OSM_PBF_URL="file://${SOURCE_DIR}/mexico-v3.osm.pbf"
export OSRM_DATASET_VERSION=mexico-v3
export OSRM_PBF_SHA256="$(sha256_file "${SOURCE_DIR}/mexico-v3.osm.pbf")"
export OSRM_SOURCE_SIZE_BYTES="$(wc -c <"${SOURCE_DIR}/mexico-v3.osm.pbf" | tr -d ' ')"
export RENDERING_PBF_URL="file://${SOURCE_DIR}/mexico-v3.osm.pbf"
export RENDERING_DATASET_VERSION=mexico-v3
export RENDERING_PBF_SHA256="${OSRM_PBF_SHA256}"
export RENDERING_SOURCE_SIZE_BYTES="${OSRM_SOURCE_SIZE_BYTES}"
export GIS_FIXTURE_FAIL_ONCE_SERVICE=photon
set +e
MAP_REFRESH_ID=fixture-v3 bash "${SCRIPT_DIR}/refresh-monthly.sh"
failure_status=$?
set -e
[[ "${failure_status}" -ne 0 ]] || fail 'v3 promotion failure unexpectedly passed'
grep -Fq candidate-v2 "${DATA_DIR}/photon/photon_data/marker" || fail 'Photon rollback did not restore v2'
grep -Fq candidate-v2 "${DATA_DIR}/osrm/mexico-latest.osrm.properties" || fail 'OSRM rollback did not restore v2'
grep -Fq candidate-v2 "${DATA_DIR}/rendering/mexico.pmtiles" || fail 'rendering rollback did not restore v2'
grep -Fq 'compose up -d --no-deps --force-recreate backend' "${GIS_FIXTURE_DOCKER_LOG}" && \
  fail 'backend was restarted during GIS promotion'
grep -Fq '"status": "ROLLED_BACK"' "${DATA_DIR}/refreshes/fixture-v3/refresh.json" || \
  fail 'refresh manifest did not record ROLLED_BACK'

mkdir -p "${DATA_DIR}/history/osrm" "${DATA_DIR}/refreshes/interrupted/promotions"
mv "${DATA_DIR}/osrm.previous" "${DATA_DIR}/history/osrm/manual-previous"
mv "${DATA_DIR}/osrm" "${DATA_DIR}/osrm.previous"
python3 "${SCRIPT_DIR}/map-refresh.py" init \
  --output "${DATA_DIR}/refreshes/interrupted/refresh.json" \
  --refresh-id interrupted
python3 "${SCRIPT_DIR}/map-refresh.py" set-status \
  --manifest "${DATA_DIR}/refreshes/interrupted/refresh.json" --status PROMOTING
printf '%s\n' \
  "component=osrm" \
  "target=${DATA_DIR}/osrm" \
  "previous=${DATA_DIR}/osrm.previous" \
  "previous_backup=${DATA_DIR}/history/osrm/manual-previous" \
  'fingerprint=interrupted' \
  'phase=ACTIVE_MOVED' \
  >"${DATA_DIR}/refreshes/interrupted/promotions/osrm.state"
set +e
MAP_REFRESH_ID=after-interrupted MAP_REFRESH_SOURCE_SIZE_BYTES=999999999999999999 \
  bash "${SCRIPT_DIR}/refresh-monthly.sh"
recovery_status=$?
set -e
[[ "${recovery_status}" -ne 0 ]] || fail 'interrupted recovery preflight unexpectedly started a new refresh'
grep -Fq candidate-v2 "${DATA_DIR}/osrm/mexico-latest.osrm.properties" || \
  fail 'interrupted promotion was not recovered to v2'
grep -Fq '"status": "ROLLED_BACK"' "${DATA_DIR}/refreshes/interrupted/refresh.json" || \
  fail 'interrupted refresh manifest did not record ROLLED_BACK'

echo 'PASS: GIS zero-downtime fixture refresh, backend continuity, promotion, failure, and rollback'
