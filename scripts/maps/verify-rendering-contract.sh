#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

python3 - "${REPO_ROOT}" "${VITE_MAP_STYLE_URL:-/maps/styles/operations/style.json}" <<'PY'
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
style_url = sys.argv[2]
style_path = root / "docker/maps/styles/operations/style.json"
config_path = root / "docker/maps/tileserver/config.json"
notice_path = root / "docker/maps/licenses/NOTICE.md"
development_compose = root / "docker-compose.yml"
production_compose = root / "docker-compose.production.yml"
frontend_dockerfile = root / "docker/frontend/Dockerfile"
vite_config = root / "frontend/vite.config.ts"
frontend_package = root / "frontend/package.json"

def fail(message):
    raise SystemExit(f"map rendering contract: {message}")

try:
    style = json.loads(style_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError) as error:
    fail(f"style.json is not parseable: {error}")

try:
    tileserver = json.loads(config_path.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError) as error:
    fail(f"TileServer config.json is not parseable: {error}")

try:
    frontend_manifest = json.loads(frontend_package.read_text(encoding="utf-8"))
except (OSError, json.JSONDecodeError) as error:
    fail(f"frontend package.json is not parseable: {error}")

if style.get("version") != 8:
    fail("style version must be 8")

sources = style.get("sources")
if not isinstance(sources, dict):
    fail("style sources are missing")
source = sources.get("openmaptiles")
if not isinstance(source, dict) or source.get("type") != "vector":
    fail("openmaptiles source must be vector")
if source.get("url") != "/maps/data/mexico.json":
    fail("openmaptiles source must use the same-origin Mexico TileJSON path")
if source.get("attribution") != "© OpenMapTiles © OpenStreetMap contributors":
    fail("style attribution is missing or changed")

if style.get("sprite") != "{styleJsonFolder}/sprite":
    fail("style sprite must resolve beside its style.json through {styleJsonFolder}")
if style.get("glyphs") != "/maps/fonts/{fontstack}/{range}.pbf":
    fail("style glyph path must remain same-origin")

for filename in (
    "sprite.json",
    "sprite.png",
    "sprite@2x.json",
    "sprite@2x.png",
):
    path = root / "docker/maps/styles/operations" / filename
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"required sprite file is missing or empty: {filename}")
    if filename.endswith(".json"):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            fail(f"sprite metadata is not parseable: {filename}: {error}")

config_text = json.dumps(tileserver, ensure_ascii=False)
if tileserver.get("styles", {}).get("operations", {}).get("style") != "operations/style.json":
    fail("TileServer operations style mapping is missing")
if tileserver.get("data", {}).get("mexico", {}).get("pmtiles") != "mexico.pmtiles":
    fail("TileServer Mexico PMTiles mapping is missing")
if "© OpenMapTiles © OpenStreetMap contributors" not in config_text:
    fail("TileServer attribution is missing")

public_forbidden = re.compile(
    r"photon|osrm|vroom|tileserver:8080|tile\.openstreetmap\.org",
    re.IGNORECASE,
)
if public_forbidden.search(json.dumps(style, ensure_ascii=False)):
    fail("style contains a private provider, internal TileServer URL, or public OSM fallback")

if not style_url.startswith("/maps/"):
    fail("VITE_MAP_STYLE_URL must use the same-origin /maps/** path")
if public_forbidden.search(style_url):
    fail("VITE_MAP_STYLE_URL contains a forbidden provider URL")

production_compose_text = production_compose.read_text(encoding="utf-8")
tileserver_block = re.search(
    r"(?ms)^  tileserver:\n(.*?)(?=^  [A-Za-z0-9_-]+:|\Z)",
    production_compose_text,
)
if not tileserver_block:
    fail("production Compose has no TileServer service")
if re.search(r"(?m)^\s+ports:", tileserver_block.group(0)):
    fail("production TileServer must not publish a host port")

frontend_text = frontend_dockerfile.read_text(encoding="utf-8")
vite_text = vite_config.read_text(encoding="utf-8")
if "location /maps/" not in frontend_text or "proxy_pass http://tileserver:8080/;" not in frontend_text:
    fail("frontend Nginx must proxy /maps/** to the private TileServer")
if 'proxy_cache_key "$scheme://$http_host$request_uri";' not in frontend_text:
    fail("frontend Nginx map cache key must include the request host to avoid cross-origin style URLs")
if 'map $uri $maps_browser_cache_control {' not in frontend_text:
    fail("frontend Nginx must define browser cache policy for host-dependent map metadata")
if '~^/maps/styles/[^/]+/style\\.json$ "no-store";' not in frontend_text:
    fail("frontend Nginx must not browser-cache host-dependent style metadata")
if '~^/maps/data/[^/]+\\.json$ "no-store";' not in frontend_text:
    fail("frontend Nginx must not browser-cache host-dependent TileJSON metadata")
if 'add_header Cache-Control $maps_browser_cache_control always;' not in frontend_text:
    fail("frontend Nginx must apply the map metadata browser cache policy")
if "ENV VITE_API_BASE_URL=/api" not in frontend_text or "ARG VITE_API_URL" in frontend_text:
    fail("Docker frontend builds must pin the browser API to the same-origin /api proxy")
vite_maps_proxy = re.search(
    r'(?ms)"/maps":\s*\{(.*?)^\s*\},',
    vite_text,
)
if not vite_maps_proxy or "target: mapProxyTarget" not in vite_maps_proxy.group(1):
    fail("Vite development must proxy /maps/** to the browser-facing map gateway")
if "changeOrigin: false" not in vite_maps_proxy.group(1):
    fail("Vite /maps proxy must preserve the browser Host for same-origin TileServer URLs")
if frontend_manifest.get("scripts", {}).get("dev") != "vite --force":
    fail("frontend development must discard stale optimized dependencies before serving maps")

for compose_path in (development_compose, production_compose):
    compose_text = compose_path.read_text(encoding="utf-8")
    frontend_block = re.search(
        r"(?ms)^  frontend:\n(.*?)(?=^  [A-Za-z0-9_-]+:|\Z)",
        compose_text,
    )
    if not frontend_block:
        fail(f"{compose_path.name} has no frontend service")
    if "VITE_API_URL:" in frontend_block.group(0):
        fail(f"{compose_path.name} must not override the same-origin frontend API path")

required_notices = (
    "OpenStreetMap",
    "OpenMapTiles",
    "OSM Bright",
    "Planetiler",
    "TileServer GL",
    "OpenMapTiles fonts",
)
notice = notice_path.read_text(encoding="utf-8")
missing = [name for name in required_notices if name not in notice]
if missing:
    fail("required license notices are missing: " + ", ".join(missing))

print("Map rendering contract PASS: JSON, style/source, attribution, sprites, proxy, production isolation, and notices.")
PY
