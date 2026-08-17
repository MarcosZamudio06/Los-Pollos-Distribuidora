#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
MAP_DOCKER_PLATFORM="${MAP_DOCKER_PLATFORM:-linux/amd64}"
RENDERING_PBF_URL="${RENDERING_PBF_URL:-https://download.geofabrik.de/north-america/mexico-260812.osm.pbf}"
RENDERING_DATASET_VERSION="${RENDERING_DATASET_VERSION:-mexico-260812}"
RENDERING_PBF_SHA256="${RENDERING_PBF_SHA256:-}"
RENDERING_SOURCE_SIZE_BYTES="${RENDERING_SOURCE_SIZE_BYTES:-0}"
RENDERING_CANDIDATE_SIZE_BYTES="${RENDERING_CANDIDATE_SIZE_BYTES:-0}"
PLANETILER_IMAGE="${PLANETILER_IMAGE:-ghcr.io/onthegomap/planetiler:0.10.2@sha256:cf32202dbc001a9ab4bc11534b642b13de3798179817da8558e567a3d13dd403}"
PLANETILER_VERSION="${PLANETILER_VERSION:-v0.10.2}"
STYLE_REVISION="osm-bright-563b249f7ae71528b1f1e327cb9c019d0dda4c50"
FONT_DATASET_VERSION="${FONT_DATASET_VERSION:-openmaptiles-fonts-v2.0}"
FONT_URL="${OPENMAPTILES_FONT_URL:-https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-open-sans.zip}"
FONT_SHA256="${OPENMAPTILES_FONT_SHA256:-}"
FONT_SOURCE_SIZE_BYTES="${FONT_SOURCE_SIZE_BYTES:-0}"
FONT_CANDIDATE_SIZE_BYTES="${FONT_CANDIDATE_SIZE_BYTES:-0}"
FONT_REVISION="${FONT_DATASET_VERSION}"
RENDERING_DIR="${MAP_DATA_DIR}/rendering"
MANIFEST="${RENDERING_DIR}/manifest.json"
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

if ! map_is_refresh_candidate_mode && service_is_running tileserver; then
  echo "TileServer GL is running. Stop the service before activating the rendering dataset." >&2
  exit 1
fi

for command in curl docker python3 unzip; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required to prepare rendering data." >&2
    exit 1
  fi
done
map_require_docker
map_require_python

map_require_provenance_inputs rendering "${RENDERING_DATASET_VERSION}" \
  "${RENDERING_PBF_URL}" "${RENDERING_PBF_SHA256}"
map_require_provenance_inputs rendering-fonts "${FONT_DATASET_VERSION}" \
  "${FONT_URL}" "${FONT_SHA256}"

active_matches=false
if [[ -s "${RENDERING_DIR}/mexico.pmtiles" && -d "${RENDERING_DIR}/fonts" && -f "${MANIFEST}" ]]; then
  if map_validate_python_manifest "${MANIFEST}" "${RENDERING_DIR}" \
    rendering "${RENDERING_DATASET_VERSION}" "${RENDERING_PBF_URL}" \
    "${RENDERING_PBF_SHA256}" mexico.pmtiles fonts >/dev/null 2>&1 && \
    python3 - "${MANIFEST}" "${FONT_URL}" "${FONT_DATASET_VERSION}" "${FONT_SHA256}" \
      "${PLANETILER_VERSION}" "${STYLE_REVISION}" "${FONT_REVISION}" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
expected = {
    "fontSourceUrl": sys.argv[2],
    "fontDatasetVersion": sys.argv[3],
    "fontSha256": sys.argv[4],
    "generatorVersion": sys.argv[5],
    "styleRevision": sys.argv[6],
    "fontRevision": sys.argv[7],
}
raise SystemExit(0 if all(manifest.get(key) == value for key, value in expected.items()) else 1)
PY
  then
    active_matches=true
  fi
fi

if [[ "${active_matches}" == true ]]; then
  echo "Rendering dataset provenance matches; safely reusing ${RENDERING_DIR}."
  exit 0
fi

active_bytes="$(map_dir_size_bytes "${RENDERING_DIR}")"
map_plan_source rendering "${RENDERING_DATASET_VERSION}" "${RENDERING_PBF_URL}" \
  "${RENDERING_PBF_SHA256}" mexico.osm.pbf "${RENDERING_SOURCE_SIZE_BYTES}"
candidate_bytes="$(map_component_candidate_bytes "${RENDERING_CANDIDATE_SIZE_BYTES}" "${MAP_SOURCE_SIZE_BYTES}" "${active_bytes}")"
map_disk_preflight rendering "${MAP_SOURCE_SIZE_BYTES}" "$((MAP_SOURCE_SIZE_BYTES + candidate_bytes + active_bytes))" \
  "${candidate_bytes}" "${active_bytes}"
map_fetch_planned_source
RENDERING_SOURCE_PATH="${MAP_SOURCE_PATH}"

map_prepare_staging_dir rendering .rendering-staging
if [[ -d "${RENDERING_DIR}" ]]; then
  cp -a "${RENDERING_DIR}/." "${STAGING_DIR}/"
fi
mkdir -p "${STAGING_DIR}/fonts"

cp "${RENDERING_SOURCE_PATH}" "${STAGING_DIR}/mexico.osm.pbf"
echo "Generating OpenMapTiles PMTiles with ${PLANETILER_IMAGE}..."
map_docker_run_limited --platform "${MAP_DOCKER_PLATFORM}" \
  -v "${STAGING_DIR}:/data" "${PLANETILER_IMAGE}" \
  --profile=openmaptiles --download --osm-path=/data/mexico.osm.pbf \
  --output=/data/mexico.pmtiles --force
test -s "${STAGING_DIR}/mexico.pmtiles"
rm -f "${STAGING_DIR}/mexico.osm.pbf"

map_plan_source rendering-fonts "${FONT_DATASET_VERSION}" "${FONT_URL}" \
  "${FONT_SHA256}" noto-open-sans.zip "${FONT_SOURCE_SIZE_BYTES}"
font_candidate_bytes="$(map_component_candidate_bytes "${FONT_CANDIDATE_SIZE_BYTES}" "${MAP_SOURCE_SIZE_BYTES}" "${active_bytes}")"
map_disk_preflight rendering-fonts "${MAP_SOURCE_SIZE_BYTES}" \
  "$((MAP_SOURCE_SIZE_BYTES + font_candidate_bytes + candidate_bytes + active_bytes))" \
  "${candidate_bytes}" "${active_bytes}"
map_fetch_planned_source
FONT_SOURCE_PATH="${MAP_SOURCE_PATH}"

if [[ ! -s "${STAGING_DIR}/fonts/Noto Sans Regular/0-255.pbf" ]]; then
  unzip -q -o "${FONT_SOURCE_PATH}" -d "${STAGING_DIR}/fonts"
fi
if [[ ! -s "${STAGING_DIR}/fonts/Noto Sans Regular/0-255.pbf" ]]; then
  echo "OpenMapTiles fonts did not contain the expected Noto Sans glyphs." >&2
  exit 1
fi

map_write_component_manifest "${STAGING_DIR}/manifest.json" rendering \
  "${RENDERING_DATASET_VERSION}" "${RENDERING_PBF_URL}" "${RENDERING_PBF_SHA256}" \
  Planetiler "${PLANETILER_VERSION}" "${PLANETILER_IMAGE}" mexico.pmtiles fonts
python3 - "${STAGING_DIR}/manifest.json" "${FONT_URL}" "${FONT_DATASET_VERSION}" \
  "${FONT_SHA256}" "${STYLE_REVISION}" "${FONT_REVISION}" <<'PY'
import json
import sys

path = sys.argv[1]
manifest = json.load(open(path, encoding="utf-8"))
manifest.update(
    {
        "datasetSource": manifest["sourceUrl"],
        "datasetSha256": manifest["sha256"],
        "generatedAt": manifest["preparedAt"],
        "generator": "Planetiler",
        "generatorVersion": manifest["tool"]["version"],
        "generatorImage": manifest["tool"]["image"],
        "tileSchema": "OpenMapTiles v3.16",
        "styleName": "OSM Bright",
        "styleRevision": sys.argv[5],
        "renderer": "TileServer GL v5.6.0",
        "attribution": "© OpenMapTiles © OpenStreetMap contributors",
        "fontRevision": sys.argv[6],
        "fontSourceUrl": sys.argv[2],
        "fontDatasetVersion": sys.argv[3],
        "fontSha256": sys.argv[4],
        "output": "mexico.pmtiles",
    }
)
with open(path, "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY

map_validate_python_manifest "${STAGING_DIR}/manifest.json" "${STAGING_DIR}" \
  rendering "${RENDERING_DATASET_VERSION}" "${RENDERING_PBF_URL}" \
  "${RENDERING_PBF_SHA256}" mexico.pmtiles fonts
python3 - "${STAGING_DIR}/manifest.json" "${FONT_URL}" "${FONT_DATASET_VERSION}" \
  "${FONT_SHA256}" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
expected = {
    "fontSourceUrl": sys.argv[2],
    "fontDatasetVersion": sys.argv[3],
    "fontSha256": sys.argv[4],
}
if any(manifest.get(key) != value for key, value in expected.items()):
    raise SystemExit("rendering manifest font provenance mismatch")
PY

fingerprint="$(map_identity_fingerprint rendering "${RENDERING_DATASET_VERSION}" "${RENDERING_PBF_URL}" "${RENDERING_PBF_SHA256}")"
if map_is_refresh_candidate_mode; then
  map_record_candidate rendering "${STAGING_DIR}" "${fingerprint}"
else
  map_promote_component rendering "${RENDERING_DIR}" "${STAGING_DIR}" "${fingerprint}"
fi
STAGING_DIR=""
map_release_preprocessing_lock
trap - EXIT

if map_is_refresh_candidate_mode; then
  echo "Rendering candidate is ready at ${MAP_REFRESH_CANDIDATE_ROOT}/rendering; provenance=${fingerprint}."
else
  echo "Rendering data, styles, and fonts are ready under ${RENDERING_DIR}."
fi
