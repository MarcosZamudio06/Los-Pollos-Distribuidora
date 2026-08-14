#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MAP_DATA_DIR="${MAP_DATA_DIR:-${REPO_ROOT}/.map-data}"
MAP_DOCKER_PLATFORM="${MAP_DOCKER_PLATFORM:-linux/amd64}"
OSM_PBF_URL="${OSM_PBF_URL:-https://download.geofabrik.de/north-america/mexico-260812.osm.pbf}"
OSM_PBF_SHA256="${OSM_PBF_SHA256:-}"
DATASET_VERSION="${MAP_DATA_VERSION:-mexico-260812}"
PLANETILER_IMAGE="${PLANETILER_IMAGE:-ghcr.io/onthegomap/planetiler:0.10.2}"
PLANETILER_VERSION="v0.10.2"
STYLE_REVISION="osm-bright-563b249f7ae71528b1f1e327cb9c019d0dda4c50"
FONT_REVISION="openmaptiles-fonts-v2.0"
FONT_URL="${OPENMAPTILES_FONT_URL:-https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-open-sans.zip}"
RENDERING_DIR="${MAP_DATA_DIR}/rendering"
SOURCE_DIR="${MAP_DATA_DIR}/sources"
MANIFEST="${RENDERING_DIR}/manifest.json"

if [[ -z "${MAP_DATA_DIR}" || "${MAP_DATA_DIR}" == "/" ]]; then
  echo "MAP_DATA_DIR must point to a dedicated non-root directory." >&2
  exit 1
fi

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

for command in curl docker python3 unzip; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "${command} is required to prepare rendering data." >&2
    exit 1
  fi
done

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file}" | awk '{print $1}'
    return
  fi
  echo "sha256sum or shasum is required to verify rendering data." >&2
  return 1
}

mkdir -p "${SOURCE_DIR}"
PBF_FILE="${SOURCE_DIR}/mexico.osm.pbf"

if [[ ! -s "${PBF_FILE}" ]]; then
  echo "Downloading the Geofabrik Mexico extract..."
  curl --fail --location --retry 3 "${OSM_PBF_URL}" --output "${PBF_FILE}.partial"
  mv "${PBF_FILE}.partial" "${PBF_FILE}"
fi

DATASET_SHA256="$(sha256_file "${PBF_FILE}")"
if [[ -n "${OSM_PBF_SHA256}" && "${DATASET_SHA256}" != "${OSM_PBF_SHA256}" ]]; then
  echo "OSM_PBF_SHA256 does not match the downloaded Geofabrik extract." >&2
  exit 1
fi

REUSE_ACTIVE_DATASET=false
if [[ -s "${RENDERING_DIR}/mexico.pmtiles" && -s "${MANIFEST}" ]] && \
  python3 - "${MANIFEST}" "${DATASET_SHA256}" "${DATASET_VERSION}" "${PLANETILER_VERSION}" "${STYLE_REVISION}" "${FONT_REVISION}" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
expected = {
    "datasetSha256": sys.argv[2],
    "datasetVersion": sys.argv[3],
    "generatorVersion": sys.argv[4],
    "styleRevision": sys.argv[5],
    "fontRevision": sys.argv[6],
}
raise SystemExit(0 if all(manifest.get(k) == v for k, v in expected.items()) else 1)
PY
then
  REUSE_ACTIVE_DATASET=true
  echo "Rendering dataset is already prepared; reusing ${RENDERING_DIR}."
fi

STAGING_DIR="$(mktemp -d "${MAP_DATA_DIR}/.rendering-staging.XXXXXX")"
trap 'rm -rf "${STAGING_DIR}"' EXIT
if [[ -d "${RENDERING_DIR}" ]]; then
  cp -a "${RENDERING_DIR}/." "${STAGING_DIR}/"
fi
mkdir -p "${STAGING_DIR}/fonts"

if [[ "${REUSE_ACTIVE_DATASET}" != true ]]; then
  cp "${PBF_FILE}" "${STAGING_DIR}/mexico.osm.pbf"
  echo "Generating OpenMapTiles PMTiles with ${PLANETILER_IMAGE}..."
docker run --rm --platform "${MAP_DOCKER_PLATFORM}" \
  -v "${STAGING_DIR}:/data" \
  "${PLANETILER_IMAGE}" \
  --profile=openmaptiles \
  --download \
  --osm-path=/data/mexico.osm.pbf \
  --output=/data/mexico.pmtiles \
  --forceƒ
  test -s "${STAGING_DIR}/mexico.pmtiles"
  rm -f "${STAGING_DIR}/mexico.osm.pbf"
fi

FONT_ARCHIVE="${SOURCE_DIR}/noto-open-sans-v2.0.zip"
if [[ ! -s "${STAGING_DIR}/fonts/Noto Sans Regular/0-255.pbf" ]]; then
  if [[ ! -s "${FONT_ARCHIVE}" ]]; then
    curl --fail --location --retry 3 "${FONT_URL}" --output "${FONT_ARCHIVE}.partial"
    mv "${FONT_ARCHIVE}.partial" "${FONT_ARCHIVE}"
  fi
  unzip -q -o "${FONT_ARCHIVE}" -d "${STAGING_DIR}/fonts"
fi

python3 - "${STAGING_DIR}/manifest.json" "${OSM_PBF_URL}" "${DATASET_VERSION}" "${DATASET_SHA256}" "${PLANETILER_IMAGE}" "${PLANETILER_VERSION}" "${STYLE_REVISION}" "${FONT_REVISION}" <<'PY'
import json
import sys
from datetime import datetime, timezone

manifest = {
    "datasetSource": sys.argv[2],
    "datasetVersion": sys.argv[3],
    "datasetSha256": sys.argv[4],
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "generator": "Planetiler",
    "generatorVersion": sys.argv[6],
    "generatorImage": sys.argv[5],
    "tileSchema": "OpenMapTiles v3.16",
    "styleName": "OSM Bright",
    "styleRevision": sys.argv[7],
    "renderer": "TileServer GL v5.6.0",
    "attribution": "© OpenMapTiles © OpenStreetMap contributors",
    "fontRevision": sys.argv[8],
    "output": "mexico.pmtiles",
}
with open(sys.argv[1], "w", encoding="utf-8") as handle:
    json.dump(manifest, handle, ensure_ascii=False, indent=2)
    handle.write("\n")
PY

if service_is_running tileserver; then
  echo "TileServer GL is running. Stop the service before activating the rendering dataset." >&2
  exit 1
fi

mkdir -p "${RENDERING_DIR}"
rm -rf "${RENDERING_DIR}/.next" \
  "${RENDERING_DIR}/mexico.pmtiles" \
  "${RENDERING_DIR}/manifest.json" \
  "${RENDERING_DIR}/fonts"
cp -a "${STAGING_DIR}/mexico.pmtiles" "${RENDERING_DIR}/mexico.pmtiles"
cp -a "${STAGING_DIR}/manifest.json" "${RENDERING_DIR}/manifest.json"
cp -a "${STAGING_DIR}/fonts" "${RENDERING_DIR}/fonts"
rm -rf "${STAGING_DIR}"
trap - EXIT

echo "Rendering data, style, and font inputs are ready under ${MAP_DATA_DIR}."
