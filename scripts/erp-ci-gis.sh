#!/usr/bin/env bash
# Sourced only by disposable test runners. Never inspect container environment.
gis_capture() {
  local name="$1" role="$2"
  mkdir -p "$GIS_DIAG_DIR"
  "$docker_bin" inspect "$name" --format '{{json .State}}' >"$GIS_DIAG_DIR/$role-state.json" 2>"$GIS_DIAG_DIR/$role-inspect.err" || true
  "$docker_bin" logs "$name" >"$GIS_DIAG_DIR/$role.log" 2>&1 || true
}

gis_running() {
  local name="$1" role="$2" running
  if ! running="$("$docker_bin" inspect "$name" --format '{{.State.Running}}')" || [ "$running" != true ]; then
    gis_capture "$name" "$role"
    echo "Required GIS provider $role exited; see retained diagnostics" >&2
    return 1
  fi
}

gis_url() {
  local name="$1" port="$2" role="$3" binding
  gis_running "$name" "$role" || return 1
  binding="$("$docker_bin" port "$name" "$port/tcp")" || return "$?"
  if [[ ! "$binding" =~ ^127\.0\.0\.1:([0-9]+)$ ]]; then
    echo "Invalid loopback binding for $role" >&2; return 1
  fi
  printf 'http://127.0.0.1:%s' "${BASH_REMATCH[1]}"
}

gis_readiness() {
  local timeout="$1" began=$SECONDS photon_ok=false osrm_ok=false vroom_ok=false code photon_code osrm_code vroom_code
  mkdir -p "$GIS_DIAG_DIR"
  while :; do
    gis_running "$photon" photon || return 1
    gis_running "$osrm" osrm || return 1
    gis_running "$vroom" vroom || return 1
    code="$(curl --silent --show-error --max-time 2 --connect-timeout 1 -o "$GIS_DIAG_DIR/photon-response.json" -w '%{http_code}' "$PHOTON_URL/api/?q=Lobos&limit=1")" || code=000
    photon_code="$code"
    photon_ok=false
    if [ "$code" = 200 ] && python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert len(d["features"]) > 0' "$GIS_DIAG_DIR/photon-response.json" 2>/dev/null; then photon_ok=true; fi
    code="$(curl --silent --show-error --max-time 2 --connect-timeout 1 -o "$GIS_DIAG_DIR/osrm-response.json" -w '%{http_code}' "$OSRM_URL/nearest/v1/driving/-96.1233923,19.179094")" || code=000
    osrm_code="$code"
    osrm_ok=false
    if [ "$code" = 200 ] && python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["code"] == "Ok" and d["waypoints"]' "$GIS_DIAG_DIR/osrm-response.json" 2>/dev/null; then osrm_ok=true; fi
    code="$(curl --silent --show-error --max-time 2 --connect-timeout 1 -o "$GIS_DIAG_DIR/vroom-response.json" -w '%{http_code}' "$VROOM_URL/health")" || code=000
    vroom_code="$code"
    vroom_ok=false; [ "$code" != 200 ] || vroom_ok=true
    printf '{"photon":%s,"osrm":%s,"vroom":%s,"elapsedSeconds":%s,"urls":{"photon":"%s/api/?q=Lobos&limit=1","osrm":"%s/nearest/v1/driving/-96.1233923,19.179094","vroom":"%s/health"},"http":{"photon":"%s","osrm":"%s","vroom":"%s"}}\n' "$photon_ok" "$osrm_ok" "$vroom_ok" "$((SECONDS-began))" "$PHOTON_URL" "$OSRM_URL" "$VROOM_URL" "$photon_code" "$osrm_code" "$vroom_code" >"$GIS_DIAG_DIR/readiness.json"
    if [ "$photon_ok:$osrm_ok:$vroom_ok" = true:true:true ]; then return 0; fi
    if [ "$((SECONDS-began))" -ge "$timeout" ]; then
      gis_capture "$photon" photon; gis_capture "$osrm" osrm; gis_capture "$vroom" vroom
      echo "GIS readiness deadline exceeded; Chromium will not start" >&2
      return 1
    fi
    sleep 1
  done
}
