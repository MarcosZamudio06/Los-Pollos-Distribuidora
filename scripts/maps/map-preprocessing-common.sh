#!/usr/bin/env bash

MAP_PREPROCESS_MEMORY_LIMIT="${MAP_PREPROCESS_MEMORY_LIMIT:-4g}"
MAP_PREPROCESS_CPUS="${MAP_PREPROCESS_CPUS:-2}"
MAP_PREPROCESS_LOCK_HELD="${MAP_PREPROCESS_LOCK_HELD:-0}"
MAP_PREPROCESS_LOCK_OWNER=0
MAP_MIN_FREE_GB="${MAP_MIN_FREE_GB:-8}"
MAP_RESERVED_HOST_GB="${MAP_RESERVED_HOST_GB:-4}"
MAP_RESERVED_POSTGRES_GB="${MAP_RESERVED_POSTGRES_GB:-4}"
MAP_RESERVED_PERCENT="${MAP_RESERVED_PERCENT:-10}"
MAP_STAGING_SAFETY_FACTOR="${MAP_STAGING_SAFETY_FACTOR:-1.25}"
MAP_MAX_HISTORY_VERSIONS="${MAP_MAX_HISTORY_VERSIONS:-2}"
MAP_PREFLIGHT_HEAD_TIMEOUT_SECONDS="${MAP_PREFLIGHT_HEAD_TIMEOUT_SECONDS:-30}"
MAP_REPO_ROOT="${MAP_REPO_ROOT:-${REPO_ROOT:-$(cd "${SCRIPT_DIR}/../.." && pwd)}}"
MAP_PROVENANCE_TOOL="${MAP_PROVENANCE_TOOL:-${SCRIPT_DIR}/map-provenance.py}"
MAP_REFRESH_TOOL="${MAP_REFRESH_TOOL:-${SCRIPT_DIR}/map-refresh.py}"
MAP_REFRESH_CANDIDATE_ONLY="${MAP_REFRESH_CANDIDATE_ONLY:-0}"
MAP_REFRESH_ID="${MAP_REFRESH_ID:-}"
MAP_REFRESH_ROOT="${MAP_REFRESH_ROOT:-}"
MAP_REFRESH_CANDIDATE_ROOT="${MAP_REFRESH_CANDIDATE_ROOT:-}"

map_is_production() {
  [[ "${MAP_ENVIRONMENT:-}" == "production" ]] ||
    [[ "${COMPOSE_FILE:-}" == *docker-compose.production.yml* ]]
}

map_validate_data_dir() {
  if [[ -z "${MAP_DATA_DIR:-}" || "${MAP_DATA_DIR}" == "/" ]]; then
    echo "MAP_DATA_DIR must point to a dedicated non-root directory." >&2
    return 1
  fi

  if map_is_production; then
    if [[ "${MAP_DATA_DIR}" != /* ]]; then
      echo "Production MAP_DATA_DIR must be an absolute path outside the checkout." >&2
      return 1
    fi
    if [[ ! -d "${MAP_DATA_DIR}" ]]; then
      echo "Production MAP_DATA_DIR must already exist; refusing to create it automatically: ${MAP_DATA_DIR}" >&2
      return 1
    fi
  elif [[ ! -d "${MAP_DATA_DIR}" ]]; then
    return 0
  fi

  local resolved
  resolved="$(cd -P "${MAP_DATA_DIR}" 2>/dev/null && pwd -P)" || {
    echo "MAP_DATA_DIR cannot be resolved: ${MAP_DATA_DIR}" >&2
    return 1
  }

  if [[ "${resolved}" == "/" ]]; then
    echo "MAP_DATA_DIR cannot be the filesystem root." >&2
    return 1
  fi

  if map_is_production; then
    case "${resolved}" in
      /tmp|/tmp/*|/private/tmp|/private/tmp/*)
        echo "Production MAP_DATA_DIR cannot use a temporary filesystem: ${resolved}" >&2
        return 1
        ;;
    esac
    case "${resolved}" in
      "${MAP_REPO_ROOT}"|"${MAP_REPO_ROOT}"/*)
        echo "Production MAP_DATA_DIR must be outside the repository checkout: ${resolved}" >&2
        return 1
        ;;
    esac
    if [[ ! -w "${resolved}" || ! -x "${resolved}" ]]; then
      echo "Production MAP_DATA_DIR must be writable and searchable by the deployment user: ${resolved}" >&2
      return 1
    fi
  fi

  MAP_DATA_DIR_RESOLVED="${resolved}"
  export MAP_DATA_DIR_RESOLVED
}

map_require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is required for bounded GIS preprocessing." >&2
    return 1
  fi
}

map_require_python() {
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required for GIS provenance manifests." >&2
    return 1
  fi
  if [[ ! -f "${MAP_PROVENANCE_TOOL}" ]]; then
    echo "GIS provenance helper is missing: ${MAP_PROVENANCE_TOOL}" >&2
    return 1
  fi
}

map_require_refresh_tool() {
  map_require_python
  if [[ ! -f "${MAP_REFRESH_TOOL}" ]]; then
    echo "GIS refresh manifest helper is missing: ${MAP_REFRESH_TOOL}" >&2
    return 1
  fi
}

map_is_refresh_candidate_mode() {
  [[ "${MAP_REFRESH_CANDIDATE_ONLY}" == "1" ]]
}

map_prepare_staging_dir() {
  local component="$1"
  local prefix="${2:-.map-staging}"

  if map_is_refresh_candidate_mode; then
    if [[ -z "${MAP_REFRESH_ID}" || -z "${MAP_REFRESH_CANDIDATE_ROOT}" ]]; then
      echo "Refresh candidate mode requires MAP_REFRESH_ID and MAP_REFRESH_CANDIDATE_ROOT." >&2
      return 1
    fi
    STAGING_DIR="${MAP_REFRESH_CANDIDATE_ROOT}/${component}"
    local target_dir="${MAP_DATA_DIR}/${component}"
    case "${STAGING_DIR}" in
      "${target_dir}"|"${target_dir}"/*)
        echo "Refresh candidate cannot be inside the active ${component} directory." >&2
        return 1
        ;;
    esac
    mkdir -p "${MAP_REFRESH_CANDIDATE_ROOT}"
    rm -rf -- "${STAGING_DIR}"
    mkdir -p "${STAGING_DIR}"
  else
    STAGING_DIR="$(mktemp -d "${MAP_DATA_DIR}/${prefix}.XXXXXX")"
  fi
  export STAGING_DIR
}

map_record_candidate() {
  local component="$1"
  local candidate_dir="$2"
  local fingerprint="$3"
  map_is_refresh_candidate_mode || return 0
  mkdir -p "${MAP_REFRESH_CANDIDATE_ROOT}"
  printf '%s\n' "${candidate_dir}" >"${MAP_REFRESH_CANDIDATE_ROOT}/${component}.path.partial"
  mv "${MAP_REFRESH_CANDIDATE_ROOT}/${component}.path.partial" \
    "${MAP_REFRESH_CANDIDATE_ROOT}/${component}.path"
  printf '%s\n' "${fingerprint}" >"${MAP_REFRESH_CANDIDATE_ROOT}/${component}.fingerprint.partial"
  mv "${MAP_REFRESH_CANDIDATE_ROOT}/${component}.fingerprint.partial" \
    "${MAP_REFRESH_CANDIDATE_ROOT}/${component}.fingerprint"
}

map_acquire_preprocessing_lock() {
  map_validate_data_dir
  if [[ ! -d "${MAP_DATA_DIR}" ]]; then
    mkdir -p "${MAP_DATA_DIR}"
    map_validate_data_dir
  fi

  if [[ "${MAP_PREPROCESS_LOCK_HELD}" == "1" ]]; then
    MAP_PREPROCESS_LOCK_OWNER=0
    return 0
  fi

  local lock_dir="${MAP_DATA_DIR}/.map-preprocessing.lock"
  if ! mkdir "${lock_dir}" 2>/dev/null; then
    echo "Another GIS preprocessing job already owns ${lock_dir}." >&2
    echo "Verify that no preparation process is running before removing the stale lock." >&2
    return 1
  fi

  printf '%s\n' "$$" >"${lock_dir}/pid"
  MAP_PREPROCESS_LOCK_DIR="${lock_dir}"
  MAP_PREPROCESS_LOCK_HELD=1
  MAP_PREPROCESS_LOCK_OWNER=1
  export MAP_PREPROCESS_LOCK_DIR MAP_PREPROCESS_LOCK_HELD
}

map_release_preprocessing_lock() {
  if [[ "${MAP_PREPROCESS_LOCK_OWNER:-0}" == "1" ]]; then
    rm -rf -- "${MAP_PREPROCESS_LOCK_DIR}"
    MAP_PREPROCESS_LOCK_OWNER=0
  fi
}

map_docker_run_limited() {
  map_require_docker
  docker run \
    --rm \
    --memory "${MAP_PREPROCESS_MEMORY_LIMIT}" \
    --cpus "${MAP_PREPROCESS_CPUS}" \
    "$@"
}

map_sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file}" | awk '{print $1}'
    return
  fi
  echo "sha256sum or shasum is required to verify GIS source data." >&2
  return 1
}

map_file_size_bytes() {
  local file="$1"
  if stat -c %s "${file}" >/dev/null 2>&1; then
    stat -c %s "${file}"
    return
  fi
  stat -f %z "${file}"
}

map_dir_size_bytes() {
  local directory="$1"
  if [[ ! -e "${directory}" ]]; then
    printf '0\n'
    return
  fi
  du -sk "${directory}" 2>/dev/null | awk '{printf "%.0f\n", $1 * 1024}'
}

map_gib_bytes() {
  awk -v value="$1" 'BEGIN { printf "%.0f\n", value * 1024 * 1024 * 1024 }'
}

map_scaled_bytes() {
  awk -v value="$1" -v factor="$2" 'BEGIN { printf "%.0f\n", value * factor }'
}

map_max_bytes() {
  if (( "$1" > "$2" )); then
    printf '%s\n' "$1"
  else
    printf '%s\n' "$2"
  fi
}

map_disk_preflight() {
  local component="$1"
  local source_bytes="$2"
  local staging_bytes="$3"
  local candidate_bytes="$4"
  local rollback_bytes="$5"

  map_validate_data_dir
  for value in "${source_bytes}" "${staging_bytes}" "${candidate_bytes}" "${rollback_bytes}"; do
    if [[ ! "${value}" =~ ^[0-9]+$ ]]; then
      echo "GIS disk preflight sizes must be non-negative byte counts: ${value}" >&2
      return 1
    fi
  done
  if [[ ! "${MAP_MIN_FREE_GB}" =~ ^[0-9]+([.][0-9]+)?$ ||
    ! "${MAP_RESERVED_HOST_GB}" =~ ^[0-9]+([.][0-9]+)?$ ||
    ! "${MAP_RESERVED_POSTGRES_GB}" =~ ^[0-9]+([.][0-9]+)?$ ||
    ! "${MAP_RESERVED_PERCENT}" =~ ^[0-9]+([.][0-9]+)?$ ||
    ! "${MAP_STAGING_SAFETY_FACTOR}" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
    echo "GIS disk preflight reserve and safety-factor variables must be numeric." >&2
    return 1
  fi
  if map_is_production && ([[ "${MAP_MIN_FREE_GB}" == "0" ]] ||
    [[ "${MAP_RESERVED_HOST_GB}" == "0" ]] ||
    [[ "${MAP_RESERVED_POSTGRES_GB}" == "0" ]] ||
    [[ "${MAP_RESERVED_PERCENT}" == "0" ]] ||
    [[ "${MAP_STAGING_SAFETY_FACTOR}" < "1" ]]); then
    echo "Production GIS disk preflight requires non-zero reserves and a safety factor >= 1." >&2
    return 1
  fi
  local total_kb available_kb
  total_kb="$(df -Pk "${MAP_DATA_DIR_RESOLVED}" | awk 'END {print $2}')"
  available_kb="$(df -Pk "${MAP_DATA_DIR_RESOLVED}" | awk 'END {print $4}')"
  if [[ ! "${total_kb}" =~ ^[0-9]+$ || ! "${available_kb}" =~ ^[0-9]+$ ]]; then
    echo "Unable to read portable df statistics for ${MAP_DATA_DIR_RESOLVED}." >&2
    return 1
  fi

  local total_bytes=$((total_kb * 1024))
  local free_bytes=$((available_kb * 1024))
  local host_reserved db_reserved minimum_reserved percent_reserved baseline_reserved
  host_reserved="$(map_gib_bytes "${MAP_RESERVED_HOST_GB}")"
  db_reserved="$(map_gib_bytes "${MAP_RESERVED_POSTGRES_GB}")"
  minimum_reserved="$(map_gib_bytes "${MAP_MIN_FREE_GB}")"
  percent_reserved="$(awk -v total="${total_bytes}" -v percent="${MAP_RESERVED_PERCENT}" 'BEGIN { printf "%.0f\n", total * percent / 100 }')"
  baseline_reserved="$(map_max_bytes "${minimum_reserved}" "${percent_reserved}")"

  local staging_with_safety required_bytes
  staging_with_safety="$(map_scaled_bytes "${staging_bytes}" "${MAP_STAGING_SAFETY_FACTOR}")"
  required_bytes=$((source_bytes + staging_with_safety + candidate_bytes + rollback_bytes + host_reserved + db_reserved + baseline_reserved))

  if (( free_bytes < required_bytes )); then
    echo "GIS disk preflight FAILED for ${component}." >&2
    printf 'required=%s GiB free=%s GiB source=%s GiB staging=%s GiB candidate=%s GiB rollback=%s GiB reserved=%s GiB\n' \
      "$(awk -v value="${required_bytes}" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')" \
      "$(awk -v value="${free_bytes}" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')" \
      "$(awk -v value="${source_bytes}" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')" \
      "$(awk -v value="${staging_with_safety}" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')" \
      "$(awk -v value="${candidate_bytes}" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')" \
      "$(awk -v value="${rollback_bytes}" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')" \
      "$(awk -v value="$((host_reserved + db_reserved + baseline_reserved))" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')" >&2
    return 1
  fi

  printf 'GIS disk preflight PASS for %s: required=%s GiB free=%s GiB.\n' \
    "${component}" \
    "$(awk -v value="${required_bytes}" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')" \
    "$(awk -v value="${free_bytes}" 'BEGIN {printf "%.2f", value / 1024 / 1024 / 1024}')"
}

map_remote_size_bytes() {
  local url="$1"
  local configured_size="${2:-0}"
  if [[ "${configured_size}" =~ ^[1-9][0-9]*$ ]]; then
    printf '%s\n' "${configured_size}"
    return
  fi
  if [[ ! "${configured_size}" =~ ^0$ ]]; then
    echo "Configured source size must be a positive byte count or 0: ${configured_size}" >&2
    return 1
  fi
  if [[ "${url}" == file://* ]]; then
    map_file_size_bytes "${url#file://}"
    return
  fi
  command -v curl >/dev/null 2>&1 || {
    echo "curl is required to determine remote GIS source size: ${url}" >&2
    return 1
  }
  local headers content_length
  headers="$(curl --fail --silent --show-error --location --head --retry 2 --max-time "${MAP_PREFLIGHT_HEAD_TIMEOUT_SECONDS}" "${url}" 2>/dev/null)" || {
    echo "Unable to determine remote GIS source size before download: ${url}" >&2
    return 1
  }
  content_length="$(awk 'tolower($1) == "content-length:" {gsub(/[^0-9]/, "", $2); value=$2} END {print value}' <<<"${headers}")"
  if [[ ! "${content_length}" =~ ^[1-9][0-9]*$ ]]; then
    echo "Remote GIS source did not expose a usable Content-Length; set its *_SOURCE_SIZE_BYTES explicitly: ${url}" >&2
    return 1
  fi
  printf '%s\n' "${content_length}"
}

map_require_provenance_inputs() {
  local component="$1"
  local dataset_version="$2"
  local source_url="$3"
  local sha256="$4"
  if [[ -z "${component}" || -z "${dataset_version}" || -z "${source_url}" ]]; then
    echo "${component:-GIS} provenance requires a dataset version and source URL." >&2
    return 1
  fi
  if [[ ! "${sha256}" =~ ^[0-9a-fA-F]{64}$ ]]; then
    echo "${component} promotion requires a valid 64-character SHA-256 checksum." >&2
    return 1
  fi
  if map_is_production && ([[ "${dataset_version}" == *latest* ]] || [[ "${source_url}" == *latest* ]]) && [[ -z "${sha256}" ]]; then
    echo "Production GIS sources named latest require an explicit SHA-256 checksum." >&2
    return 1
  fi
}

map_source_identity() {
  map_require_python
  local component="$1"
  local dataset_version="$2"
  local source_url="$3"
  local sha256="$4"
  local basename="$5"
  case "${basename}" in
    ""|/*|*/*|.|..)
      echo "GIS source basename must be a simple filename: ${basename}" >&2
      return 1
      ;;
  esac
  MAP_SOURCE_IDENTITY="$(python3 "${MAP_PROVENANCE_TOOL}" identity \
    --component "${component}" \
    --dataset-version "${dataset_version}" \
    --source-url "${source_url}" \
    --sha256 "${sha256}")"
  MAP_SOURCE_CACHE_DIR="${MAP_DATA_DIR}/sources/${component}/${MAP_SOURCE_IDENTITY}"
  MAP_SOURCE_PATH="${MAP_SOURCE_CACHE_DIR}/${basename}"
  MAP_SOURCE_MANIFEST="${MAP_SOURCE_CACHE_DIR}/manifest.json"
  MAP_SOURCE_COMPONENT="${component}"
  MAP_SOURCE_VERSION="${dataset_version}"
  MAP_SOURCE_URL="${source_url}"
  MAP_SOURCE_SHA256="$(printf '%s' "${sha256}" | tr '[:upper:]' '[:lower:]')"
  MAP_SOURCE_BASENAME="${basename}"
  export MAP_SOURCE_IDENTITY MAP_SOURCE_CACHE_DIR MAP_SOURCE_PATH MAP_SOURCE_MANIFEST \
    MAP_SOURCE_COMPONENT MAP_SOURCE_VERSION MAP_SOURCE_URL MAP_SOURCE_SHA256 MAP_SOURCE_BASENAME
}

map_source_cache_is_valid() {
  [[ -s "${MAP_SOURCE_PATH}" && -f "${MAP_SOURCE_MANIFEST}" ]] || return 1
  map_validate_python_manifest "${MAP_SOURCE_MANIFEST}" "${MAP_SOURCE_CACHE_DIR}" \
    "${MAP_SOURCE_COMPONENT}" "${MAP_SOURCE_VERSION}" "${MAP_SOURCE_URL}" \
    "${MAP_SOURCE_SHA256}" "${MAP_SOURCE_BASENAME}" >/dev/null 2>&1 || return 1
  [[ "$(map_sha256_file "${MAP_SOURCE_PATH}")" == "${MAP_SOURCE_SHA256}" ]]
}

map_plan_source() {
  local component="$1"
  local dataset_version="$2"
  local source_url="$3"
  local sha256="$4"
  local basename="$5"
  local configured_size="${6:-0}"

  map_require_provenance_inputs "${component}" "${dataset_version}" "${source_url}" "${sha256}"
  map_source_identity "${component}" "${dataset_version}" "${source_url}" "${sha256}" "${basename}"
  if map_source_cache_is_valid; then
    MAP_SOURCE_CACHE_VALID=1
    MAP_SOURCE_SIZE_BYTES="$(map_file_size_bytes "${MAP_SOURCE_PATH}")"
  else
    MAP_SOURCE_CACHE_VALID=0
    MAP_SOURCE_SIZE_BYTES="$(map_remote_size_bytes "${source_url}" "${configured_size}")"
  fi
  export MAP_SOURCE_CACHE_VALID MAP_SOURCE_SIZE_BYTES
}

map_fetch_planned_source() {
  if [[ "${MAP_SOURCE_CACHE_VALID}" == "1" ]]; then
    return 0
  fi
  command -v curl >/dev/null 2>&1 || {
    echo "curl is required to download ${MAP_SOURCE_COMPONENT} data." >&2
    return 1
  }
  mkdir -p "${MAP_SOURCE_CACHE_DIR}"
  local partial="${MAP_SOURCE_PATH}.partial"
  rm -f "${partial}"
  echo "Downloading ${MAP_SOURCE_COMPONENT} source ${MAP_SOURCE_VERSION}..."
  curl --fail --silent --show-error --location --retry 3 "${MAP_SOURCE_URL}" --output "${partial}"
  local actual
  actual="$(map_sha256_file "${partial}")"
  if [[ "${actual}" != "${MAP_SOURCE_SHA256}" ]]; then
    rm -f "${partial}"
    echo "${MAP_SOURCE_COMPONENT} source SHA-256 mismatch; active data was not touched." >&2
    return 1
  fi
  mv "${partial}" "${MAP_SOURCE_PATH}"
  map_write_python_manifest "${MAP_SOURCE_MANIFEST}" \
    "${MAP_SOURCE_COMPONENT}" "${MAP_SOURCE_VERSION}" "${MAP_SOURCE_URL}" \
    "${MAP_SOURCE_SHA256}" "${MAP_SOURCE_BASENAME}" \
    "Source download" "${MAP_SOURCE_VERSION}" "curl"
  MAP_SOURCE_CACHE_VALID=1
  export MAP_SOURCE_CACHE_VALID
}

map_validate_python_manifest() {
  local manifest="$1"
  local root="$2"
  local component="$3"
  local dataset_version="$4"
  local source_url="$5"
  local sha256="$6"
  shift 6
  local command=(python3 "${MAP_PROVENANCE_TOOL}" validate \
    --manifest "${manifest}" \
    --component "${component}" \
    --dataset-version "${dataset_version}" \
    --source-url "${source_url}" \
    --sha256 "${sha256}")
  local artifact
  for artifact in "$@"; do
    command+=(--artifact "${artifact}")
  done
  (cd "${root}" && "${command[@]}")
}

map_write_python_manifest() {
  local output="$1"
  local component="$2"
  local dataset_version="$3"
  local source_url="$4"
  local sha256="$5"
  local artifact="$6"
  local tool_name="$7"
  local tool_version="$8"
  local tool_image="$9"
  python3 "${MAP_PROVENANCE_TOOL}" write \
    --output "${output}" \
    --component "${component}" \
    --dataset-version "${dataset_version}" \
    --source-url "${source_url}" \
    --sha256 "${sha256}" \
    --prepared-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --artifact "${artifact}" \
    --tool-name "${tool_name}" \
    --tool-version "${tool_version}" \
    --tool-image "${tool_image}"
}

map_write_component_manifest() {
  local output="$1"
  local component="$2"
  local dataset_version="$3"
  local source_url="$4"
  local sha256="$5"
  local tool_name="$6"
  local tool_version="$7"
  local tool_image="$8"
  shift 8
  local arguments=(
    python3 "${MAP_PROVENANCE_TOOL}" write
    --output "${output}"
    --component "${component}"
    --dataset-version "${dataset_version}"
    --source-url "${source_url}"
    --sha256 "${sha256}"
    --prepared-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    --tool-name "${tool_name}"
    --tool-version "${tool_version}"
    --tool-image "${tool_image}"
  )
  local artifact
  for artifact in "$@"; do
    arguments+=(--artifact "${artifact}")
  done
  "${arguments[@]}"
}

map_refresh_manifest_init() {
  local manifest="$1"
  local refresh_id="$2"
  map_require_refresh_tool
  mkdir -p "$(dirname "${manifest}")"
  python3 "${MAP_REFRESH_TOOL}" init \
    --output "${manifest}" \
    --refresh-id "${refresh_id}" \
    --started-at "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

map_refresh_manifest_status() {
  local manifest="$1"
  local status="$2"
  local reason="${3:-}"
  map_require_refresh_tool
  local arguments=(python3 "${MAP_REFRESH_TOOL}" set-status --manifest "${manifest}" --status "${status}")
  if [[ -n "${reason}" ]]; then
    arguments+=(--reason "${reason}")
  fi
  "${arguments[@]}"
}

map_refresh_manifest_component() {
  local manifest="$1"
  local component="$2"
  local dataset_version="$3"
  local source_url="$4"
  local sha256="$5"
  local fingerprint_value="$6"
  local candidate_path="$7"
  map_require_refresh_tool
  python3 "${MAP_REFRESH_TOOL}" set-component \
    --manifest "${manifest}" \
    --component "${component}" \
    --dataset-version "${dataset_version}" \
    --source-url "${source_url}" \
    --sha256 "${sha256}" \
    --fingerprint "${fingerprint_value}" \
    --candidate-path "${candidate_path}"
}

map_refresh_manifest_promotion() {
  local manifest="$1"
  local component="$2"
  local service="$3"
  local state="$4"
  local duration_ms="$5"
  local health="$6"
  local smoke="$7"
  map_require_refresh_tool
  python3 "${MAP_REFRESH_TOOL}" set-promotion \
    --manifest "${manifest}" \
    --component "${component}" \
    --service "${service}" \
    --state "${state}" \
    --duration-ms "${duration_ms}" \
    --health "${health}" \
    --smoke "${smoke}"
}

map_refresh_manifest_metric() {
  local manifest="$1"
  local key="$2"
  local value="$3"
  map_require_refresh_tool
  python3 "${MAP_REFRESH_TOOL}" set-metric \
    --manifest "${manifest}" \
    --key "${key}" \
    --value "${value}"
}

map_refresh_manifest_validate() {
  local manifest="$1"
  shift
  map_require_refresh_tool
  local arguments=(python3 "${MAP_REFRESH_TOOL}" validate --manifest "${manifest}")
  local component
  for component in "$@"; do
    arguments+=(--component "${component}")
  done
  "${arguments[@]}"
}

map_identity_fingerprint() {
  python3 "${MAP_PROVENANCE_TOOL}" identity \
    --component "$1" \
    --dataset-version "$2" \
    --source-url "$3" \
    --sha256 "$4"
}

map_register_manifest() {
  local component="$1"
  local fingerprint="$2"
  local manifest="$3"
  local registry_dir="${MAP_DATA_DIR}/manifests/${component}"
  mkdir -p "${registry_dir}"
  cp "${manifest}" "${registry_dir}/${fingerprint}.json.partial"
  mv "${registry_dir}/${fingerprint}.json.partial" "${registry_dir}/${fingerprint}.json"
}

map_write_promotion_state() {
  local state_path="$1"
  local component="$2"
  local target_dir="$3"
  local previous_dir="$4"
  local previous_backup="$5"
  local fingerprint="$6"
  local phase="$7"
  {
    printf 'component=%s\n' "${component}"
    printf 'target=%s\n' "${target_dir}"
    printf 'previous=%s\n' "${previous_dir}"
    printf 'previous_backup=%s\n' "${previous_backup}"
    printf 'fingerprint=%s\n' "${fingerprint}"
    printf 'phase=%s\n' "${phase}"
  } >"${state_path}.partial"
  mv "${state_path}.partial" "${state_path}"
}

map_set_promotion_phase() {
  local state_path="$1"
  local phase="$2"
  local temporary="${state_path}.partial"
  awk -F= -v phase="${phase}" '
    BEGIN { updated = 0 }
    $1 == "phase" { print "phase=" phase; updated = 1; next }
    { print }
    END { if (!updated) print "phase=" phase }
  ' "${state_path}" >"${temporary}"
  mv "${temporary}" "${state_path}"
}

map_component_candidate_bytes() {
  local configured="$1"
  local source_bytes="$2"
  local rollback_bytes="$3"
  if [[ "${configured}" =~ ^[1-9][0-9]*$ ]]; then
    printf '%s\n' "${configured}"
    return
  fi
  if [[ ! "${configured}" =~ ^0$ ]]; then
    echo "Candidate size must be a positive byte count or 0: ${configured}" >&2
    return 1
  fi
  local base
  base="$(map_max_bytes "${source_bytes}" "${rollback_bytes}")"
  if (( base <= 0 )); then
    echo "Candidate size is unknown; configure the component *_CANDIDATE_SIZE_BYTES." >&2
    return 1
  fi
  printf '%s\n' "${base}"
}

map_cleanup_history() {
  local component="$1"
  local history_dir="${MAP_DATA_DIR}/history/${component}"
  local keep="${MAP_MAX_HISTORY_VERSIONS}"
  [[ -d "${history_dir}" ]] || return 0
  [[ "${keep}" =~ ^[1-9][0-9]*$ ]] || keep=1

  local count=0 entry
  while IFS= read -r entry; do
    [[ -n "${entry}" ]] || continue
    count=$((count + 1))
    if (( count > keep )); then
      rm -rf -- "${entry}"
    fi
  done < <(find "${history_dir}" -mindepth 1 -maxdepth 1 -type d -print | sort -r)
}

map_promote_component_transactional() {
  local component="$1"
  local target_dir="$2"
  local candidate_dir="$3"
  local fingerprint="$4"
  local refresh_root="${5:-}"
  local manifest_path="${candidate_dir}/manifest.json"
  local history_dir="${MAP_DATA_DIR}/history/${component}"
  local previous_dir="${target_dir}.previous"
  local timestamp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  local state_dir=""
  local state_path=""

  [[ -d "${candidate_dir}" ]] || {
    echo "Candidate directory is missing for ${component}: ${candidate_dir}" >&2
    return 1
  }
  [[ -f "${manifest_path}" ]] || {
    echo "Candidate manifest is missing for ${component}: ${manifest_path}" >&2
    return 1
  }

  mkdir -p "${history_dir}"
  local previous_backup=""
  if [[ -e "${previous_dir}" ]]; then
    previous_backup="${history_dir}/${timestamp}-previous"
  fi

  if [[ -n "${refresh_root}" ]]; then
    state_dir="${refresh_root}/promotions"
    state_path="${state_dir}/${component}.state"
    mkdir -p "${state_dir}"
    if [[ -e "${state_path}" || -e "${state_path}.partial" ]]; then
      echo "Promotion state already exists for ${component}: ${state_path}" >&2
      return 1
    fi
    # Persist the intent before moving active data. The next invocation can
    # recover even if the process dies between individual filesystem moves.
    map_write_promotion_state "${state_path}" "${component}" "${target_dir}" \
      "${previous_dir}" "${previous_backup}" "${fingerprint}" PREPARED
  fi

  if [[ -n "${previous_backup}" ]]; then
    if ! mv "${previous_dir}" "${previous_backup}"; then
      [[ -n "${refresh_root}" ]] && map_rollback_component_transactional "${component}" "${refresh_root}" || true
      return 1
    fi
    if [[ -n "${refresh_root}" ]] && ! map_set_promotion_phase "${state_path}" PREVIOUS_BACKED_UP; then
      map_rollback_component_transactional "${component}" "${refresh_root}" || true
      return 1
    fi
  fi

  if [[ -e "${target_dir}" ]]; then
    if ! mv "${target_dir}" "${previous_dir}"; then
      [[ -n "${refresh_root}" ]] && map_rollback_component_transactional "${component}" "${refresh_root}" || true
      return 1
    fi
    if [[ -n "${refresh_root}" ]] && ! map_set_promotion_phase "${state_path}" ACTIVE_MOVED; then
      map_rollback_component_transactional "${component}" "${refresh_root}" || true
      return 1
    fi
  fi

  if ! mv "${candidate_dir}" "${target_dir}"; then
    if [[ -n "${refresh_root}" ]]; then
      map_rollback_component_transactional "${component}" "${refresh_root}" || true
    else
      if [[ -e "${previous_dir}" ]]; then
        mv "${previous_dir}" "${target_dir}"
      fi
      if [[ -n "${previous_backup}" && -e "${previous_backup}" ]]; then
        mv "${previous_backup}" "${previous_dir}"
      fi
    fi
    echo "Could not promote ${component}; active and rollback data were restored." >&2
    return 1
  fi

  if [[ -n "${refresh_root}" ]] && ! map_set_promotion_phase "${state_path}" CANDIDATE_ACTIVE; then
    map_rollback_component_transactional "${component}" "${refresh_root}" || true
    echo "Could not persist ${component} promotion phase; active and rollback data were restored." >&2
    return 1
  fi

  if ! map_register_manifest "${component}" "${fingerprint}" "${target_dir}/manifest.json"; then
    if [[ -n "${refresh_root}" ]]; then
      map_rollback_component_transactional "${component}" "${refresh_root}" || true
    else
      if [[ -e "${target_dir}" ]]; then
        mv "${target_dir}" "${history_dir}/${timestamp}-failed"
      fi
      if [[ -e "${previous_dir}" ]]; then
        mv "${previous_dir}" "${target_dir}"
      fi
      if [[ -n "${previous_backup}" && -e "${previous_backup}" ]]; then
        mv "${previous_backup}" "${previous_dir}"
      fi
    fi
    echo "Could not register ${component} manifest; active and rollback data were restored." >&2
    return 1
  fi
}

map_promote_component() {
  local component="$1"
  local target_dir="$2"
  local candidate_dir="$3"
  local fingerprint="$4"
  map_promote_component_transactional "${component}" "${target_dir}" "${candidate_dir}" "${fingerprint}" || return $?
  map_cleanup_history "${component}"
}

map_promotion_state_value() {
  local state_path="$1"
  local key="$2"
  awk -F= -v expected="${key}" '$1 == expected {sub(/^[^=]*=/, ""); print; exit}' "${state_path}"
}

map_rollback_component_transactional() {
  local component="$1"
  local refresh_root="$2"
  local state_path="${refresh_root}/promotions/${component}.state"
  [[ -f "${state_path}" ]] || return 0

  local target_dir previous_dir previous_backup history_dir timestamp failed_dir phase
  target_dir="$(map_promotion_state_value "${state_path}" target)"
  previous_dir="$(map_promotion_state_value "${state_path}" previous)"
  previous_backup="$(map_promotion_state_value "${state_path}" previous_backup)"
  phase="$(map_promotion_state_value "${state_path}" phase)"
  phase="${phase:-CANDIDATE_ACTIVE}"
  [[ "${phase}" == "ROLLED_BACK" ]] && return 0
  history_dir="${MAP_DATA_DIR}/history/${component}"
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)-rollback-$$"
  failed_dir="${history_dir}/${timestamp}-failed"
  mkdir -p "${history_dir}"

  case "${phase}" in
    PREPARED|PREVIOUS_BACKED_UP)
      # If the process died after moving .previous, restore that move first.
      if [[ -n "${previous_backup}" && -e "${previous_backup}" && ! -e "${previous_dir}" ]]; then
        mv "${previous_backup}" "${previous_dir}"
      fi
      # If it died after moving active, restore active from .previous.
      if [[ ! -e "${target_dir}" && -e "${previous_dir}" ]]; then
        mv "${previous_dir}" "${target_dir}"
      fi
      # Keep the pre-existing rollback version in its canonical location after
      # restoring active from .previous.
      if [[ -n "${previous_backup}" && -e "${previous_backup}" && ! -e "${previous_dir}" ]]; then
        mv "${previous_backup}" "${previous_dir}"
      fi
      ;;
    ACTIVE_MOVED|CANDIDATE_ACTIVE)
      if [[ -e "${target_dir}" ]]; then
        mv "${target_dir}" "${failed_dir}"
      fi
      if [[ -e "${previous_dir}" ]]; then
        mv "${previous_dir}" "${target_dir}"
      fi
      if [[ -n "${previous_backup}" && -e "${previous_backup}" ]]; then
        mv "${previous_backup}" "${previous_dir}"
      fi
      ;;
    *)
      echo "Unknown promotion phase for ${component}: ${phase}" >&2
      return 1
      ;;
  esac

  if [[ ! -e "${target_dir}" ]]; then
    echo "Cannot rollback ${component}: active directory is missing." >&2
    return 1
  fi
  map_set_promotion_phase "${state_path}" ROLLED_BACK
  map_cleanup_history "${component}"
}

map_finalize_component_promotion() {
  local component="$1"
  local refresh_root="$2"
  local state_path="${refresh_root}/promotions/${component}.state"
  [[ -f "${state_path}" ]] || return 0
  map_cleanup_history "${component}"
}

map_remove_refresh_promotion_states() {
  local refresh_root="$1"
  rm -f -- "${refresh_root}/promotions/"*.state
}

map_rollback_refresh() {
  local refresh_root="$1"
  local state_dir="${refresh_root}/promotions"
  [[ -d "${state_dir}" ]] || return 0

  local state_path component
  while IFS= read -r state_path; do
    [[ -n "${state_path}" ]] || continue
    component="$(basename "${state_path}" .state)"
    map_rollback_component_transactional "${component}" "${refresh_root}"
  done < <(find "${state_dir}" -type f -name '*.state' -print | sort -r)
}

map_refresh_disk_preflight() {
  map_validate_data_dir
  local source_total="${MAP_REFRESH_SOURCE_SIZE_BYTES:-0}"
  if [[ "${source_total}" == "0" ]]; then
    local photon_url="${PHOTON_DATA_URL:-https://download1.graphhopper.com/public/north-america/mexico/photon-db-mexico-1.0-latest.tar.bz2}"
    local osrm_url="${OSM_PBF_URL:-https://download.geofabrik.de/north-america/mexico-260812.osm.pbf}"
    local rendering_url="${RENDERING_PBF_URL:-${osrm_url}}"
    local font_url="${OPENMAPTILES_FONT_URL:-https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-open-sans.zip}"
    source_total=$(( \
      $(map_remote_size_bytes "${photon_url}" "${PHOTON_SOURCE_SIZE_BYTES:-0}") + \
      $(map_remote_size_bytes "${osrm_url}" "${OSRM_SOURCE_SIZE_BYTES:-0}") + \
      $(map_remote_size_bytes "${rendering_url}" "${RENDERING_SOURCE_SIZE_BYTES:-0}") + \
      $(map_remote_size_bytes "${font_url}" "${FONT_SOURCE_SIZE_BYTES:-0}") \
    ))
  fi
  if [[ ! "${source_total}" =~ ^[1-9][0-9]*$ ]]; then
    echo "MAP_REFRESH_SOURCE_SIZE_BYTES must be a positive byte count when refresh source sizes cannot be resolved." >&2
    return 1
  fi

  local active_total=0 directory
  for directory in photon osrm rendering; do
    active_total=$((active_total + $(map_dir_size_bytes "${MAP_DATA_DIR}/${directory}")))
  done
  local base_total
  base_total="$(map_max_bytes "${source_total}" "${active_total}")"
  map_disk_preflight "refresh" "${source_total}" "$((source_total + active_total))" "${base_total}" "${active_total}"
}
