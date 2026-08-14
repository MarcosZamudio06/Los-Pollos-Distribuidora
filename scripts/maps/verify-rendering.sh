#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BASE_URL="${MAP_PUBLIC_BASE_URL:-http://127.0.0.1:${FRONTEND_PORT:-3000}}"
BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

fetch() {
  local path="$1"
  curl --fail --silent --show-error --location \
    --dump-header "${TMP_DIR}/headers" \
    "${BASE_URL}${path}" \
    --output "${TMP_DIR}/body"
  cat "${TMP_DIR}/headers" "${TMP_DIR}/body"
}

curl --fail --silent --show-error --max-time 10 "${BASE_URL}/maps/health" >/dev/null
fetch "/maps/styles/operations/style.json" > "${TMP_DIR}/style-response"

python3 - "${TMP_DIR}" "${BASE_URL}" <<'PY'
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote, urljoin
from urllib.request import Request, urlopen

tmp = Path(sys.argv[1])
base = sys.argv[2] + "/"
style = json.loads((tmp / "body").read_text(encoding="utf-8"))
if style.get("version") != 8:
    raise SystemExit("rendering smoke: style version must be 8")

sources = style.get("sources", {})
vector_sources = [source for source in sources.values() if source.get("type") == "vector"]
if not vector_sources:
    raise SystemExit("rendering smoke: style has no vector source")

serialized_style = json.dumps(style, ensure_ascii=False)
if "OpenMapTiles" not in serialized_style or "OpenStreetMap" not in serialized_style:
    raise SystemExit("rendering smoke: attribution is missing OpenMapTiles/OpenStreetMap")

forbidden = re.compile(r"photon|osrm|vroom|tileserver:8080|tile\.openstreetmap\.org", re.I)
if forbidden.search(serialized_style):
    raise SystemExit("rendering smoke: style contains an internal or public OSM runtime URL")

def get(path):
    url = urljoin(base, path.lstrip("/"))
    request = Request(url, headers={"Accept": "application/json,application/x-protobuf,*/*"})
    with urlopen(request, timeout=15) as response:
        body = response.read()
        headers = "\n".join(f"{k}: {v}" for k, v in response.headers.items())
        if forbidden.search(headers):
            raise SystemExit(f"rendering smoke: internal URL leaked in response headers for {path}")
        return response.status, headers, body

sprite = style.get("sprite")
if not isinstance(sprite, str):
    raise SystemExit("rendering smoke: style.sprite is missing")
for suffix in (".json", ".png", "@2x.json", "@2x.png"):
    status, _, body = get(sprite + suffix)
    if status != 200 or not body:
        raise SystemExit(f"rendering smoke: sprite resource failed: {sprite + suffix}")
    if suffix.endswith(".json") and forbidden.search(body.decode("utf-8")):
        raise SystemExit("rendering smoke: sprite metadata leaks an internal URL")

glyphs = style.get("glyphs")
if not isinstance(glyphs, str):
    raise SystemExit("rendering smoke: style.glyphs is missing")
fontstack = "Open Sans Regular"
for layer in style.get("layers", []):
    text_font = layer.get("layout", {}).get("text-font")
    if isinstance(text_font, list) and text_font and isinstance(text_font[0], str):
        fontstack = text_font[0]
        break
glyph_path = glyphs.replace("{fontstack}", quote(fontstack, safe="")).replace("{range}", "0-255")
status, _, body = get(glyph_path)
if status != 200 or not body:
    raise SystemExit(f"rendering smoke: glyph resource failed: {glyph_path}")

for source in vector_sources:
    tilejson_path = source.get("url")
    if not isinstance(tilejson_path, str):
        tiles = source.get("tiles")
        if not isinstance(tiles, list) or not tiles:
            raise SystemExit("rendering smoke: vector source has no TileJSON URL or tiles")
        continue
    status, _, body = get(tilejson_path)
    if status != 200:
        raise SystemExit(f"rendering smoke: TileJSON failed: {tilejson_path}")
    tilejson = json.loads(body.decode("utf-8"))
    if forbidden.search(json.dumps(tilejson, ensure_ascii=False)):
        raise SystemExit("rendering smoke: TileJSON leaks an internal or public OSM URL")
    tiles = tilejson.get("tiles")
    if not isinstance(tiles, list) or not tiles:
        raise SystemExit("rendering smoke: TileJSON has no tile template")
    tile_path = tiles[0].replace("{z}", "10").replace("{x}", "238").replace("{y}", "456")
    status, _, body = get(tile_path)
    if status != 200 or not body:
        raise SystemExit(f"rendering smoke: Veracruz representative tile failed: {tile_path}")

print("Rendering smoke passed: style, attribution, sprites, glyphs, TileJSON, tile, and URL isolation.")
PY
