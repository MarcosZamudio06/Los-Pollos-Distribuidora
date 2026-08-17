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
environment_example = root / ".env.example"
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
environment_example_text = environment_example.read_text(encoding="utf-8")
preprocessing_common_text = (root / "scripts/maps/map-preprocessing-common.sh").read_text(encoding="utf-8")
prepare_rendering_text = (root / "scripts/maps/prepare-rendering.sh").read_text(encoding="utf-8")
refresh_text = (root / "scripts/maps/refresh-monthly.sh").read_text(encoding="utf-8")
candidate_validator_text = (root / "scripts/maps/validate-candidates.sh").read_text(encoding="utf-8")

def service_block(compose_text, service):
    return re.search(
        rf"(?ms)^  {re.escape(service)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:|\Z)",
        compose_text,
    )

required_production_services = (
    "postgres",
    "object-storage",
    "migrate",
    "bootstrap",
    "backend",
    "photon",
    "osrm",
    "vroom",
    "tileserver",
    "frontend",
)
production_blocks = {}
for service in required_production_services:
    block = service_block(production_compose_text, service)
    if not block:
        fail(f"production Compose has no {service} service")
    production_blocks[service] = block.group(0)
    if "app_network" not in block.group(1):
        fail(f"production {service} must use app_network")

for service in required_production_services:
    if service not in ("frontend", "object-storage") and re.search(r"(?m)^\s+ports:", production_blocks[service]):
        fail(f"production {service} must not publish a host port")

for service in ("postgres", "object-storage", "photon", "osrm", "vroom", "tileserver", "backend"):
    if "\n    healthcheck:\n" not in production_blocks[service]:
        fail(f"production {service} must define a healthcheck")

if len(re.findall(r"(?m)^    ports:\n", production_compose_text)) != 2:
    fail("production Compose must publish only the frontend and Object Storage loopback ports")
if '      - "127.0.0.1:${FRONTEND_PORT:-3000}:3000"' not in production_blocks["frontend"]:
    fail("production frontend must bind only to 127.0.0.1")
if '      - "127.0.0.1:8333:8333"' not in production_blocks["object-storage"]:
    fail("production Object Storage must bind port 8333 only to 127.0.0.1")
if "FRONTEND_BIND_ADDRESS" in production_compose_text:
    fail("production frontend host binding must not be overrideable")
for service in ("photon", "osrm", "tileserver"):
    if "${MAP_DATA_DIR:?MAP_DATA_DIR is required for production}" not in production_blocks[service]:
        fail(f"production {service} must use the required persistent MAP_DATA_DIR")
if "${MAP_DATA_DIR:-./.map-data}" in production_compose_text:
    fail("production Compose must not fall back to checkout-local map data")
for marker in (
    "PHOTON_DATASET_VERSION=",
    "PHOTON_DATA_SHA256=",
    "OSRM_DATASET_VERSION=",
    "OSRM_PBF_SHA256=",
    "RENDERING_DATASET_VERSION=",
    "RENDERING_PBF_SHA256=",
    "FONT_DATASET_VERSION=",
    "OPENMAPTILES_FONT_SHA256=",
):
    if marker not in environment_example_text:
        fail(f".env.example is missing GIS provenance variable: {marker}")
for marker in (
    "map_plan_source",
    "map_disk_preflight",
    "map_promote_component",
    "map_is_refresh_candidate_mode",
    "manifest.json",
):
    if marker not in prepare_rendering_text:
        fail(f"rendering preparation is missing provenance/disk guard: {marker}")
for marker in (
    "sources/${component}/${MAP_SOURCE_IDENTITY}",
    "MAP_RESERVED_POSTGRES_GB",
    "MAP_RESERVED_HOST_GB",
    "map_cleanup_history",
    "MAP_REFRESH_CANDIDATE_ROOT",
    "map_rollback_component_transactional",
):
    if marker not in preprocessing_common_text:
        fail(f"common GIS safety contract is missing: {marker}")
for marker in (
    "MAP_REFRESH_CANDIDATE_ONLY=1",
    '"${SCRIPT_DIR}/validate-candidates.sh"',
    "map_promote_component_transactional",
    "map_backend_monitor_start",
    "map_refresh_manifest_status",
):
    if marker not in refresh_text:
        fail(f"refresh is missing zero-downtime transaction guard: {marker}")
for marker in ("--network none", ":/data:ro", "Starting isolated Photon candidate smoke"):
    if marker not in candidate_validator_text:
        fail(f"candidate validation is missing isolated smoke guard: {marker}")

if "image: postgis/postgis:16-3.5-alpine" not in production_blocks["postgres"]:
    fail("production PostGIS image is missing")
if "postgres_data:/var/lib/postgresql/data" not in production_blocks["postgres"]:
    fail("production PostGIS volume is missing")
if "postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}@postgres:5432/${POSTGRES_DB:-pollo_distribucion}" not in production_compose_text:
    fail("production database URL must use the internal postgres DNS name")
for provider_url in (
    "OSRM_URL: http://osrm:5000",
    "PHOTON_URL: http://photon:2322",
    "VROOM_URL: http://vroom:3000",
    "MAP_TILES_URL: http://tileserver:8080",
):
    if provider_url not in production_blocks["backend"]:
        fail(f"production backend is missing {provider_url}")
if re.search(r"\$\{(?:DATABASE_URL|OSRM_URL|PHOTON_URL|VROOM_URL)", production_compose_text):
    fail("production Compose must not interpolate external database/provider URLs")
if "Managed PostgreSQL" in production_compose_text or "Managed Photon" in production_compose_text or "Managed OSRM" in production_compose_text or "Managed VROOM" in production_compose_text:
    fail("production Compose must not require managed provider services")
if "      postgres:\n        condition: service_healthy" not in production_blocks["backend"]:
    fail("production backend must wait for healthy PostGIS")
for dependency in ("photon", "osrm", "vroom", "tileserver"):
    if f"      {dependency}:\n        condition: service_healthy" in production_blocks["backend"]:
        fail(f"production backend must not gate core readiness on optional {dependency}")
if "      postgres:\n        condition: service_healthy" not in production_blocks["migrate"]:
    fail("production migration job must wait for healthy PostGIS")
if "      osrm:\n        condition: service_healthy" not in production_blocks["vroom"]:
    fail("production VROOM must wait for healthy OSRM")

tileserver_block = service_block(
    production_compose_text,
    "tileserver",
)
if not tileserver_block:
    fail("production Compose has no TileServer service")
if re.search(r"(?m)^\s+ports:", tileserver_block.group(0)):
    fail("production TileServer must not publish a host port")

frontend_text = frontend_dockerfile.read_text(encoding="utf-8")
vite_text = vite_config.read_text(encoding="utf-8")
if "location /maps/" not in frontend_text or "proxy_pass http://tileserver:8080/;" not in frontend_text:
    fail("frontend Nginx must proxy /maps/** to the private TileServer")
if 'proxy_cache_key "$maps_forwarded_proto://$http_host$request_uri";' not in frontend_text:
    fail("frontend Nginx map cache key must include the forwarded protocol and request host")
if 'map $uri $maps_browser_cache_control {' not in frontend_text:
    fail("frontend Nginx must define browser cache policy for host-dependent map metadata")
if '~^/maps/styles/[^/]+/style\\.json$ "no-store";' not in frontend_text:
    fail("frontend Nginx must not browser-cache host-dependent style metadata")
if '~^/maps/data/[^/]+\\.json$ "no-store";' not in frontend_text:
    fail("frontend Nginx must not browser-cache host-dependent TileJSON metadata")
if 'add_header Cache-Control $maps_browser_cache_control always;' not in frontend_text:
    fail("frontend Nginx must apply the map metadata browser cache policy")
if 'map $http_x_forwarded_proto $maps_forwarded_proto {' not in frontend_text:
    fail("frontend Nginx must define a forwarded-protocol fallback for map requests")
if 'default $http_x_forwarded_proto;' not in frontend_text or '  "" $scheme;' not in frontend_text:
    fail("frontend Nginx must preserve the reverse proxy protocol and fall back to its own scheme")
if 'proxy_set_header X-Forwarded-Proto $maps_forwarded_proto;' not in frontend_text:
    fail("frontend Nginx must forward the preserved protocol to TileServer")
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
