#!/usr/bin/env bash
# Small real OpenMapTiles cartography from the SAME public OSM extract as routing.
set -euo pipefail
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"; fi
repo="$(cd "$(dirname "$0")/.." && pwd)"
gis="${1:?Public GIS directory}"
output="${2:?Empty rendering directory}"
mkdir -p "$output"
if [ -n "$(ls -A "$output")" ]; then echo 'Rendering output must be empty' >&2; exit 1; fi
# Conversion is isolated on Linux too; no host-wide package installation.
"$docker_bin" run --rm --memory=512m -v "$gis:/input:ro" -v "$output:/output" ubuntu:24.04 \
 bash -ec 'apt-get update -qq && apt-get install -y -qq --no-install-recommends osmium-tool && osmium cat /input/veracruz.osm -o /output/veracruz.osm.pbf'
"$docker_bin" run --rm --memory=4g -e JAVA_TOOL_OPTIONS=-Xmx3g -v "$output:/data" \
 ghcr.io/onthegomap/planetiler:0.10.2@sha256:cf32202dbc001a9ab4bc11534b642b13de3798179817da8558e567a3d13dd403 \
 --profile=openmaptiles --download --osm-path=/data/veracruz.osm.pbf \
 --output=/data/mexico.pmtiles --bounds=-96.20,19.13,-96.12,19.19 --maxzoom=14
curl --fail --location --proto '=https' --tlsv1.2 --max-time 120 \
 https://github.com/openmaptiles/fonts/releases/download/v2.0/noto-open-sans.zip -o "$output/fonts.zip"
mkdir "$output/fonts"
unzip -q "$output/fonts.zip" -d "$output/fonts"
test -s "$output/fonts/Noto Sans Regular/0-255.pbf"
test -s "$output/mexico.pmtiles"
cp "$gis/source.json" "$output/source.json"

# Fail before browser startup if the public extract cannot satisfy the REAL style.
# Do not remove style layers or invent features to make a small fixture pass.
python3 - "$output/mexico.pmtiles" "$repo/docker/maps/styles/operations/style.json" <<'PY_LAYERS'
import gzip, json, pathlib, struct, sys
archive = pathlib.Path(sys.argv[1])
with archive.open('rb') as handle:
    header = handle.read(127)
    if header[:8] != b'PMTiles\x03':
        raise SystemExit('Expected generated PMTiles v3')
    offset, length = struct.unpack_from('<QQ', header, 24)
    if length > 16_000_000 or offset + length > archive.stat().st_size:
        raise SystemExit('Invalid generated PMTiles metadata bounds')
    handle.seek(offset)
    metadata = json.loads(gzip.decompress(handle.read(length)))
style = json.loads(pathlib.Path(sys.argv[2]).read_text())
required = {layer['source-layer'] for layer in style['layers'] if layer.get('source') == 'openmaptiles'}
available = {layer['id'] for layer in metadata['vector_layers']}
missing = sorted(required - available)
if missing:
    raise SystemExit('Public map fixture lacks required style layers: ' + ', '.join(missing))
print('Real cartography style schema verified: ' + ', '.join(sorted(required)))
PY_LAYERS
