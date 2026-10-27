#!/usr/bin/env bash
# Public, bounded Veracruz OSM fixture. No production DB or active GIS index.
set -euo pipefail
docker_bin="${DOCKER_BIN:-docker}"
if [ -x /Applications/Docker.app/Contents/Resources/bin/docker ]; then docker_bin="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"; fi
repo="$(cd "$(dirname "$0")/.." && pwd)"
export GIS_DIR="${1:?Usage: prepare-erp-ci-gis.sh EMPTY_DIRECTORY}"
mkdir -p "$GIS_DIR"
if [ -n "$(ls -A "$GIS_DIR")" ]; then echo 'GIS output must be empty' >&2; exit 1; fi
curl --fail --location --proto '=https' --tlsv1.2 --max-time 120 \
 'https://api.openstreetmap.org/api/0.6/map?bbox=-96.20,19.13,-96.12,19.19' --output "$GIS_DIR/veracruz.osm"
"$docker_bin" build -f "$repo/docker/maps/photon/Dockerfile" -t pollos-distribuidor/photon:1.2.1 "$repo"
python3 - <<'PY_GIS'
import os, json, pathlib, xml.etree.ElementTree as E
p = pathlib.Path(os.environ['GIS_DIR']); root = E.parse(p/'veracruz.osm').getroot()
nodes = {n.attrib['id']: (float(n.attrib['lon']), float(n.attrib['lat'])) for n in root.findall('node')}
places = []; seen = set()
for way in root.findall('way'):
    tags = {t.attrib['k']: t.attrib['v'] for t in way.findall('tag')}
    name = tags.get('name')
    points = [nodes[n.attrib['ref']] for n in way.findall('nd') if n.attrib['ref'] in nodes]
    if not name or not tags.get('highway') or not points or name in seen: continue
    seen.add(name)
    places.append({'place_id': 'W'+way.attrib['id'], 'object_type': 'W', 'object_id': int(way.attrib['id']),
        'osm_key': 'highway', 'osm_value': tags['highway'], 'address_type': 'street', 'importance': .5,
        'name': {'name': name}, 'country_code': 'MX', 'address': {'city': 'Veracruz', 'state': 'Veracruz',
        'country': 'México'}, 'centroid': points[len(points)//2]})
header = {'type': 'NominatimDumpFile', 'content': {'version': '0.1.0',
    'generator': 'erp-rem003-real-osm', 'features': {'has_addresslines': False}}}
(p/'photon.jsonl').write_text(json.dumps(header)+'\n'+'\n'.join(
    json.dumps({'type': 'Place', 'content': [x]}, ensure_ascii=False) for x in places)+'\n')
(p/'photon').mkdir(mode=0o777)
(p/'photon').chmod(0o777)
PY_GIS
importer="erp-rem003-import-$(date +%s)-$$"
mkdir -p "$GIS_DIR/diagnostics"
cleanup_import() {
  result=$?
  "$docker_bin" inspect "$importer" --format '{{json .State}}' >"$GIS_DIR/diagnostics/photon-import-state.json" 2>/dev/null || true
  if [ -n "${REM003_CI_EVIDENCE_DIR:-}" ]; then
    python3 "$repo/scripts/export-rem003-diagnostics.py" "$GIS_DIR" "$REM003_CI_EVIDENCE_DIR/preparation" || true
  fi
  "$docker_bin" rm -f "$importer" >/dev/null 2>&1 || true
  return "$result"
}
trap cleanup_import EXIT
for operation in extract partition customize; do
  if [ "$operation" = extract ]; then
    "$docker_bin" run --rm --platform linux/amd64 -v "$GIS_DIR:/data" \
      ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-extract -p /opt/car.lua /data/veracruz.osm
  else
    "$docker_bin" run --rm --platform linux/amd64 -v "$GIS_DIR:/data" \
      ghcr.io/project-osrm/osrm-backend:v5.27.1 "osrm-$operation" /data/veracruz.osrm
  fi
done
"$docker_bin" run --name "$importer" --label task=erp-functional-remediation-003 --memory=2g -e JAVA_TOOL_OPTIONS='-Xms256m -Xmx768m' \
  -v "$GIS_DIR/photon:/data" -v "$GIS_DIR/photon.jsonl:/import.jsonl:ro" \
  pollos-distribuidor/photon:1.2.1 java -jar /opt/photon/photon.jar import \
  -data-dir /data -import-file /import.jsonl -languages default,en,es >"$GIS_DIR/diagnostics/photon-import.log" 2>&1
"$docker_bin" run --rm --entrypoint sh -v "$GIS_DIR/photon:/data:ro" pollos-distribuidor/photon:1.2.1 \
 -ec 'test -d /data/photon_data/node_1/data; find /data -maxdepth 3 -type d -exec ls -ldn {} \;' >"$GIS_DIR/diagnostics/photon-import-permissions.txt"

python3 - <<'PY_HASH'
import hashlib, json, os, pathlib
p = pathlib.Path(os.environ['GIS_DIR'])
(p/'source.json').write_text(json.dumps({'source': 'https://api.openstreetmap.org/api/0.6/map?bbox=-96.20,19.13,-96.12,19.19', 'sha256': hashlib.sha256((p/'veracruz.osm').read_bytes()).hexdigest(), 'attribution': 'OpenStreetMap contributors (ODbL)', 'photonVersion': '1.2.1', 'photonJarSha256': '6ea66d598a3f6fc1b59b0f81ad4f8abee72ccdb9d3db03bc12008974cdebd58d'}))
PY_HASH
