#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
MAP_REFRESH_ID="${MAP_REFRESH_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
MAP_REFRESH_ROOT="${MAP_REFRESH_ROOT:-${MAP_DATA_DIR}/refreshes/${MAP_REFRESH_ID}}"
MAP_REFRESH_CANDIDATE_ROOT="${MAP_REFRESH_CANDIDATE_ROOT:-${MAP_REFRESH_ROOT}/candidates}"
MAP_REFRESH_MANIFEST="${MAP_REFRESH_MANIFEST:-${MAP_REFRESH_ROOT}/refresh.json}"
MAP_REFRESH_CANDIDATE_ONLY=1
MAP_REFRESH_BACKEND_HEALTH_URL="${MAP_REFRESH_BACKEND_HEALTH_URL:-${MAP_PUBLIC_BASE_URL:-http://127.0.0.1:${FRONTEND_PORT:-3000}}/api/health/ready}"
MAP_REFRESH_BACKEND_MONITOR_INTERVAL_SECONDS="${MAP_REFRESH_BACKEND_MONITOR_INTERVAL_SECONDS:-2}"
MAP_REFRESH_SKIP_FINAL_SMOKES="${MAP_REFRESH_SKIP_FINAL_SMOKES:-0}"
source "${SCRIPT_DIR}/map-preprocessing-common.sh"

cd "${REPO_ROOT}"

REFRESH_MONITOR_PID=""
REFRESH_MONITOR_STOP_FILE=""
REFRESH_EXIT_STATUS=0

map_epoch_millis() {
  printf '%s000\n' "$(date +%s)"
}

map_refresh_status_value() {
  python3 - "${1}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    print(json.load(handle).get("status", ""))
PY
}

map_backend_ready() {
  curl --fail --silent --show-error --max-time 10 \
    "${MAP_REFRESH_BACKEND_HEALTH_URL}" >/dev/null
}

map_backend_monitor_start() {
  command -v curl >/dev/null 2>&1 || {
    echo "curl is required to monitor backend availability during GIS refresh." >&2
    return 1
  }
  REFRESH_MONITOR_STOP_FILE="${MAP_REFRESH_ROOT}/backend-monitor.stop"
  local log_file="${MAP_REFRESH_ROOT}/backend-availability.log"
  rm -f "${REFRESH_MONITOR_STOP_FILE}"
  : >"${log_file}"
  (
    while [[ ! -f "${REFRESH_MONITOR_STOP_FILE}" ]]; do
      if curl --fail --silent --show-error --max-time 10 \
        "${MAP_REFRESH_BACKEND_HEALTH_URL}" >/dev/null 2>&1; then
        printf '%s OK\n' "$(date +%s)" >>"${log_file}"
      else
        printf '%s FAIL\n' "$(date +%s)" >>"${log_file}"
      fi
      sleep "${MAP_REFRESH_BACKEND_MONITOR_INTERVAL_SECONDS}"
    done
  ) &
  REFRESH_MONITOR_PID=$!
}

map_backend_monitor_stop() {
  [[ -n "${REFRESH_MONITOR_STOP_FILE}" ]] || return 0
  touch "${REFRESH_MONITOR_STOP_FILE}"
  if [[ -n "${REFRESH_MONITOR_PID}" ]]; then
    wait "${REFRESH_MONITOR_PID}" 2>/dev/null || true
  fi
  REFRESH_MONITOR_PID=""
}

map_backend_monitor_downtime_seconds() {
  local log_file="${MAP_REFRESH_ROOT}/backend-availability.log"
  [[ -f "${log_file}" ]] || {
    printf 'unknown\n'
    return 0
  }
  awk '
    $2 == "FAIL" && start == "" { start = $1 }
    $2 == "OK" && start != "" { total += $1 - start; start = "" }
    END { if (start != "") print "unknown"; else print total + 0 }
  ' "${log_file}"
}

map_compose_restart_service() {
  local service="$1"
  docker compose up -d --no-deps --force-recreate "${service}" >/dev/null
}

map_compose_health_status() {
  local service="$1"
  local container_id
  container_id="$(docker compose ps -q "${service}")"
  [[ -n "${container_id}" ]] || return 1
  docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' \
    "${container_id}"
}

map_wait_compose_healthy() {
  local service="$1"
  local attempts=0 status
  while (( attempts < 90 )); do
    status="$(map_compose_health_status "${service}" 2>/dev/null || true)"
    if [[ "${status}" == "healthy" || "${status}" == "running" ]]; then
      return 0
    fi
    if [[ "${status}" == "unhealthy" || "${status}" == "exited" || "${status}" == "dead" ]]; then
      return 1
    fi
    attempts=$((attempts + 1))
    sleep 2
  done
  return 1
}

map_smoke_active_component() {
  local component="$1"
  case "${component}" in
    osrm)
      docker compose exec -T osrm curl --fail --silent --show-error --max-time 10 \
        'http://127.0.0.1:5000/route/v1/driving/-96.1342,19.1738;-96.1150,19.1050?overview=false' \
        | grep -q '"code":"Ok"'
      ;;
    photon)
      docker compose exec -T photon curl --fail --silent --show-error --max-time 10 \
        'http://127.0.0.1:2322/api?q=Veracruz&limit=1' | grep -q '"features"'
      ;;
    rendering)
      docker compose exec -T tileserver node -e \
        "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
      ;;
    *)
      echo "Unknown GIS component smoke: ${component}" >&2
      return 1
      ;;
  esac
}

map_service_for_component() {
  case "$1" in
    photon) printf 'photon\n' ;;
    osrm) printf 'osrm\n' ;;
    rendering) printf 'tileserver\n' ;;
    *) return 1 ;;
  esac
}

map_refresh_recover_incomplete() {
  local manifest status refresh_root component service state_path
  for manifest in "${MAP_DATA_DIR}"/refreshes/*/refresh.json; do
    [[ -f "${manifest}" ]] || continue
    refresh_root="$(dirname "${manifest}")"
    status="$(map_refresh_status_value "${manifest}" 2>/dev/null || true)"
    case "${status}" in
      PREPARING|VALIDATED)
        touch "${refresh_root}/backend-monitor.stop"
        map_refresh_manifest_status "${manifest}" FAILED \
          "Recovered incomplete candidate preparation before starting a new refresh."
        rm -rf -- "${refresh_root}/candidates"
        ;;
      PROMOTING)
        echo "Recovering interrupted GIS refresh in ${refresh_root}..." >&2
        touch "${refresh_root}/backend-monitor.stop"
        map_rollback_refresh "${refresh_root}"
        for state_path in "${refresh_root}/promotions/"*.state; do
          [[ -f "${state_path}" ]] || continue
          component="$(basename "${state_path}" .state)"
          service="$(map_service_for_component "${component}")"
          map_compose_restart_service "${service}"
          map_wait_compose_healthy "${service}"
          map_smoke_active_component "${component}"
        done
        map_refresh_manifest_status "${manifest}" ROLLED_BACK \
          "Recovered an interrupted promotion and restored the previous active datasets."
        map_remove_refresh_promotion_states "${refresh_root}"
        ;;
      *)
        :
        ;;
    esac
  done
}

map_refresh_rollback_and_restart() {
  local refresh_root="$1"
  local state_path component service
  map_rollback_refresh "${refresh_root}"
  for state_path in "${refresh_root}/promotions/"*.state; do
    [[ -f "${state_path}" ]] || continue
    component="$(basename "${state_path}" .state)"
    service="$(map_service_for_component "${component}")"
    map_compose_restart_service "${service}"
    map_wait_compose_healthy "${service}"
    map_smoke_active_component "${component}"
    map_refresh_manifest_promotion "${MAP_REFRESH_MANIFEST}" "${component}" \
      "${service}" ROLLED_BACK 0 healthy passed
  done
}

map_refresh_failure() {
  local status="$1"
  set +e
  map_backend_monitor_stop
  local manifest_status=""
  if [[ -f "${MAP_REFRESH_MANIFEST}" ]]; then
    manifest_status="$(map_refresh_status_value "${MAP_REFRESH_MANIFEST}" 2>/dev/null || true)"
  fi
  if [[ "${manifest_status}" == "PROMOTING" ]]; then
    if map_refresh_rollback_and_restart "${MAP_REFRESH_ROOT}"; then
      map_refresh_manifest_status "${MAP_REFRESH_MANIFEST}" ROLLED_BACK \
        "Refresh failed after promotion; all promoted components were rolled back."
      map_remove_refresh_promotion_states "${MAP_REFRESH_ROOT}"
    else
      map_refresh_manifest_status "${MAP_REFRESH_MANIFEST}" FAILED \
        "Refresh failed and automatic rollback validation requires operator intervention."
    fi
  elif [[ -f "${MAP_REFRESH_MANIFEST}" ]]; then
    map_refresh_manifest_status "${MAP_REFRESH_MANIFEST}" FAILED \
      "Refresh failed before promotion; active datasets were not changed."
  fi
  if [[ "${MAP_REFRESH_KEEP_FAILED:-0}" != "1" ]]; then
    rm -rf -- "${MAP_REFRESH_CANDIDATE_ROOT}" 2>/dev/null || true
  fi
  REFRESH_EXIT_STATUS="${status}"
}

cleanup() {
  local status=$?
  if (( status != 0 )); then
    map_refresh_failure "${status}"
    status="${REFRESH_EXIT_STATUS}"
  else
    map_backend_monitor_stop
  fi
  map_release_preprocessing_lock
  exit "${status}"
}

trap cleanup EXIT
trap 'exit 130' INT TERM

map_validate_data_dir
map_acquire_preprocessing_lock
map_refresh_recover_incomplete
map_refresh_disk_preflight
map_refresh_manifest_init "${MAP_REFRESH_MANIFEST}" "${MAP_REFRESH_ID}"
map_backend_ready
map_backend_monitor_start

PREPARATION_STARTED="$(map_epoch_millis)"
export MAP_REFRESH_CANDIDATE_ONLY MAP_REFRESH_ID MAP_REFRESH_ROOT MAP_REFRESH_CANDIDATE_ROOT
"${SCRIPT_DIR}/prepare-all.sh"
PREPARATION_FINISHED="$(map_epoch_millis)"
map_backend_ready
map_refresh_manifest_metric "${MAP_REFRESH_MANIFEST}" preparationDurationSeconds \
  "$(( (PREPARATION_FINISHED - PREPARATION_STARTED) / 1000 ))"

for component in photon osrm rendering; do
  case "${component}" in
    photon)
      dataset_version="${PHOTON_DATASET_VERSION:?PHOTON_DATASET_VERSION is required}"
      source_url="${PHOTON_DATA_URL:-https://download1.graphhopper.com/public/north-america/mexico/photon-db-mexico-1.0-latest.tar.bz2}"
      sha256="${PHOTON_DATA_SHA256:?PHOTON_DATA_SHA256 is required}"
      ;;
    osrm)
      dataset_version="${OSRM_DATASET_VERSION:?OSRM_DATASET_VERSION is required}"
      source_url="${OSM_PBF_URL:-https://download.geofabrik.de/north-america/mexico-260812.osm.pbf}"
      sha256="${OSRM_PBF_SHA256:?OSRM_PBF_SHA256 is required}"
      ;;
    rendering)
      dataset_version="${RENDERING_DATASET_VERSION:?RENDERING_DATASET_VERSION is required}"
      source_url="${RENDERING_PBF_URL:-https://download.geofabrik.de/north-america/mexico-260812.osm.pbf}"
      sha256="${RENDERING_PBF_SHA256:?RENDERING_PBF_SHA256 is required}"
      ;;
  esac
  candidate_path="${MAP_REFRESH_CANDIDATE_ROOT}/${component}"
  fingerprint="$(map_identity_fingerprint "${component}" "${dataset_version}" "${source_url}" "${sha256}")"
  map_refresh_manifest_component "${MAP_REFRESH_MANIFEST}" "${component}" \
    "${dataset_version}" "${source_url}" "${sha256}" "${fingerprint}" "${candidate_path}"
done

"${SCRIPT_DIR}/validate-candidates.sh"
map_refresh_manifest_status "${MAP_REFRESH_MANIFEST}" VALIDATED
map_backend_ready
map_refresh_manifest_status "${MAP_REFRESH_MANIFEST}" PROMOTING

PROMOTION_STARTED="$(map_epoch_millis)"
for component in osrm photon rendering; do
  service="$(map_service_for_component "${component}")"
  target_dir="${MAP_DATA_DIR}/${component}"
  candidate_dir="${MAP_REFRESH_CANDIDATE_ROOT}/${component}"
  fingerprint="$(cat "${MAP_REFRESH_CANDIDATE_ROOT}/${component}.fingerprint")"
  component_started="$(map_epoch_millis)"
  map_refresh_manifest_promotion "${MAP_REFRESH_MANIFEST}" "${component}" \
    "${service}" SWITCHING 0 pending pending
  map_promote_component_transactional "${component}" "${target_dir}" "${candidate_dir}" "${fingerprint}" \
    "${MAP_REFRESH_ROOT}"
  map_compose_restart_service "${service}"
  map_wait_compose_healthy "${service}"
  map_smoke_active_component "${component}"
  component_finished="$(map_epoch_millis)"
  map_refresh_manifest_promotion "${MAP_REFRESH_MANIFEST}" "${component}" \
    "${service}" ACTIVE "$((component_finished - component_started))" healthy passed
done
PROMOTION_FINISHED="$(map_epoch_millis)"
map_refresh_manifest_metric "${MAP_REFRESH_MANIFEST}" promotionDurationSeconds \
  "$(( (PROMOTION_FINISHED - PROMOTION_STARTED) / 1000 ))"

if [[ "${MAP_REFRESH_SKIP_FINAL_SMOKES}" == "1" ]]; then
  if map_is_production; then
    echo "Production refresh cannot skip final stack smokes." >&2
    exit 1
  fi
  echo "Final stack smokes skipped only for a non-production fixture."
else
  "${SCRIPT_DIR}/verify-stack.sh"
  "${SCRIPT_DIR}/smoke-route.sh"
fi

map_backend_ready
map_backend_monitor_stop
downtime="$(map_backend_monitor_downtime_seconds)"
map_refresh_manifest_metric "${MAP_REFRESH_MANIFEST}" backendDowntimeSeconds "${downtime}"
if [[ "${downtime}" == "unknown" ]]; then
  echo "Backend availability monitor observed an unfinished outage; refresh will not be marked ACTIVE." >&2
  exit 1
fi
map_refresh_manifest_validate "${MAP_REFRESH_MANIFEST}" photon osrm rendering
map_refresh_manifest_status "${MAP_REFRESH_MANIFEST}" ACTIVE
for component in photon osrm rendering; do
  map_finalize_component_promotion "${component}" "${MAP_REFRESH_ROOT}"
done
map_remove_refresh_promotion_states "${MAP_REFRESH_ROOT}"

map_release_preprocessing_lock
trap - EXIT

cat <<EOF
Monthly GIS refresh completed without backend preparation downtime.
refreshId=${MAP_REFRESH_ID}
manifest=${MAP_REFRESH_MANIFEST}
backendDowntimeSeconds=${downtime}
osrmVersion=${OSRM_DATASET_VERSION}
photonVersion=${PHOTON_DATASET_VERSION}
renderingVersion=${RENDERING_DATASET_VERSION}
EOF
