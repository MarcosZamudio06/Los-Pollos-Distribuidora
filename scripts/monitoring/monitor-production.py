#!/usr/bin/env python3
"""Run a bounded health and resource check for the production single-host stack."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


LONG_LIVED_SERVICES = (
    "postgres",
    "backend",
    "frontend",
    "object-storage",
    "photon",
    "osrm",
    "vroom",
    "tileserver",
)
BYTE_SUFFIXES = {
    "b": 1,
    "kb": 1024,
    "kib": 1024,
    "mb": 1024**2,
    "mib": 1024**2,
    "gb": 1024**3,
    "gib": 1024**3,
    "tb": 1024**4,
    "tib": 1024**4,
}
COMPONENTS = ("photon", "osrm", "rendering")


class MonitorError(Exception):
    """A sanitized operational error suitable for a structured report."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_int(name: str, default: int, minimum: int = 0) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as error:
        raise MonitorError(f"{name} must be an integer") from error
    if value < minimum:
        raise MonitorError(f"{name} must be at least {minimum}")
    return value


def parse_percent(name: str, default: int) -> int:
    value = parse_int(name, default)
    if value > 100:
        raise MonitorError(f"{name} must be between 0 and 100")
    return value


def thresholds() -> dict[str, int]:
    values = {
        "diskWarn": parse_percent("MONITOR_DISK_WARN_PERCENT", 80),
        "diskCritical": parse_percent("MONITOR_DISK_CRITICAL_PERCENT", 90),
        "inodeWarn": parse_percent("MONITOR_INODE_WARN_PERCENT", 80),
        "inodeCritical": parse_percent("MONITOR_INODE_CRITICAL_PERCENT", 90),
        "memoryWarn": parse_percent("MONITOR_MEMORY_WARN_PERCENT", 85),
        "memoryCritical": parse_percent("MONITOR_MEMORY_CRITICAL_PERCENT", 95),
        "cpuWarn": parse_percent("MONITOR_CPU_WARN_PERCENT", 85),
        "cpuWarnDurationSeconds": parse_int(
            "MONITOR_CPU_WARN_DURATION_SECONDS", 900, 1
        ),
        "restartWarnCount": parse_int("MONITOR_RESTART_WARN_COUNT", 3),
        "backupMaxAgeHours": parse_int("MONITOR_BACKUP_MAX_AGE_HOURS", 24, 1),
        "restoreDrillMaxAgeDays": parse_int(
            "MONITOR_RESTORE_DRILL_MAX_AGE_DAYS", 35, 1
        ),
        "gisMaxAgeDays": parse_int("MONITOR_GIS_MAX_AGE_DAYS", 31, 1),
        "httpTimeoutSeconds": parse_int("MONITOR_HTTP_TIMEOUT_SECONDS", 5, 1),
        "webhookTimeoutSeconds": parse_int(
            "MONITOR_ALERT_WEBHOOK_TIMEOUT_SECONDS", 3, 1
        ),
    }
    if values["diskCritical"] < values["diskWarn"]:
        raise MonitorError("MONITOR_DISK_CRITICAL_PERCENT must not be below warning")
    if values["inodeCritical"] < values["inodeWarn"]:
        raise MonitorError("MONITOR_INODE_CRITICAL_PERCENT must not be below warning")
    if values["memoryCritical"] < values["memoryWarn"]:
        raise MonitorError(
            "MONITOR_MEMORY_CRITICAL_PERCENT must not be below warning"
        )
    return values


def run_command(args: list[str], timeout: int | float = 15) -> str:
    try:
        completed = subprocess.run(
            args,
            check=False,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise MonitorError("monitor command unavailable or timed out") from error
    if completed.returncode != 0:
        raise MonitorError("monitor command returned a failure")
    return completed.stdout


def compose_prefix() -> list[str]:
    docker_bin = os.getenv("MONITOR_DOCKER_BIN", "docker")
    compose_file = os.getenv(
        "MONITOR_COMPOSE_FILE", "docker-compose.production.yml"
    )
    command = [docker_bin, "compose"]
    project = os.getenv("MONITOR_COMPOSE_PROJECT_NAME", "").strip()
    if project:
        command.extend(["-p", project])
    command.extend(["-f", compose_file])
    return command


def add_alert(
    alerts: list[dict[str, str]], severity: str, code: str, message: str
) -> None:
    alerts.append({"severity": severity, "code": code, "message": message})


def compose_container_id(service: str) -> str | None:
    output = run_command([*compose_prefix(), "ps", "-q", service])
    first_line = output.strip().splitlines()
    return first_line[0].strip() if first_line and first_line[0].strip() else None


def inspect_container(container_id: str) -> dict[str, Any]:
    output = run_command(
        [os.getenv("MONITOR_DOCKER_BIN", "docker"), "inspect", container_id]
    )
    payload = json.loads(output)
    if not isinstance(payload, list) or not payload or not isinstance(payload[0], dict):
        raise MonitorError("docker inspect returned an invalid payload")
    return payload[0]


def collect_containers(alerts: list[dict[str, str]]) -> tuple[dict[str, Any], list[str]]:
    containers: dict[str, Any] = {}
    ids: list[str] = []
    for service in LONG_LIVED_SERVICES:
        try:
            container_id = compose_container_id(service)
            if not container_id:
                containers[service] = {"status": "missing", "health": "missing"}
                add_alert(alerts, "critical", "CONTAINER_MISSING", f"{service} container is missing")
                continue
            inspected = inspect_container(container_id)
            state = inspected.get("State", {})
            health = state.get("Health", {}).get("Status", "not-configured")
            status = state.get("Status", "unknown")
            restart_count = int(inspected.get("RestartCount", 0) or 0)
            oom_killed = bool(state.get("OOMKilled", False))
            containers[service] = {
                "status": status,
                "health": health,
                "restartCount": restart_count,
                "oomKilled": oom_killed,
            }
            ids.append(container_id)
            if status != "running":
                add_alert(
                    alerts,
                    "critical",
                    "CONTAINER_NOT_RUNNING",
                    f"{service} container status is {status}",
                )
            if health == "unhealthy":
                add_alert(
                    alerts,
                    "critical",
                    "CONTAINER_UNHEALTHY",
                    f"{service} container is unhealthy",
                )
            if health == "not-configured":
                add_alert(
                    alerts,
                    "warning",
                    "CONTAINER_HEALTHCHECK_MISSING",
                    f"{service} container has no healthcheck",
                )
            if oom_killed:
                add_alert(
                    alerts,
                    "critical",
                    "CONTAINER_OOM_KILLED",
                    f"{service} container was OOM-killed",
                )
            if restart_count >= parse_int("MONITOR_RESTART_WARN_COUNT", 3):
                add_alert(
                    alerts,
                    "warning",
                    "CONTAINER_RESTARTS",
                    f"{service} restart count is {restart_count}",
                )
        except (MonitorError, ValueError, json.JSONDecodeError):
            containers[service] = {"status": "unknown", "health": "unknown"}
            add_alert(
                alerts,
                "critical",
                "CONTAINER_INSPECT_FAILED",
                f"{service} container state could not be inspected",
            )
    return containers, ids


def parse_number(value: str) -> float | None:
    match = re.search(r"-?[0-9]+(?:\.[0-9]+)?", value)
    return float(match.group(0)) if match else None


def parse_bytes(value: str) -> int | None:
    normalized = value.strip().replace(" ", "").lower()
    match = re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)([a-z]*)", normalized)
    if not match:
        return None
    suffix = match.group(2) or "b"
    multiplier = BYTE_SUFFIXES.get(suffix)
    if multiplier is None:
        return None
    return int(float(match.group(1)) * multiplier)


def collect_stats(
    container_ids: list[str], alerts: list[dict[str, str]], limits: dict[str, int]
) -> dict[str, Any]:
    if not container_ids:
        return {}
    try:
        output = run_command(
            [
                os.getenv("MONITOR_DOCKER_BIN", "docker"),
                "stats",
                "--no-stream",
                "--format",
                "{{json .}}",
                *container_ids,
            ],
            timeout=limits["httpTimeoutSeconds"],
        )
    except MonitorError:
        add_alert(alerts, "warning", "DOCKER_STATS_FAILED", "Docker stats could not be collected")
        return {}

    stats: dict[str, Any] = {}
    for line in output.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        name = str(item.get("Name", "")).removeprefix("/")
        if not name:
            continue
        memory_usage = str(item.get("MemUsage", ""))
        usage_part = memory_usage.split("/", 1)[0].strip()
        memory_percent = parse_number(str(item.get("MemPerc", "")))
        cpu_percent = parse_number(str(item.get("CPUPerc", "")))
        stats[name] = {
            "cpuPercent": cpu_percent,
            "memoryPercent": memory_percent,
            "memoryUsageBytes": parse_bytes(usage_part),
            "memoryLimitBytes": parse_bytes(
                memory_usage.split("/", 1)[1].strip()
                if "/" in memory_usage
                else ""
            ),
        }
        if memory_percent is not None:
            if memory_percent >= limits["memoryCritical"]:
                add_alert(alerts, "critical", "CONTAINER_MEMORY_CRITICAL", f"{name} memory is {memory_percent:.1f}%")
            elif memory_percent >= limits["memoryWarn"]:
                add_alert(alerts, "warning", "CONTAINER_MEMORY_WARN", f"{name} memory is {memory_percent:.1f}%")
        if cpu_percent is not None and cpu_percent >= limits["cpuWarn"]:
            stats[name]["cpuWarnCandidate"] = True
    return stats


def read_memory() -> dict[str, Any]:
    values: dict[str, int] = {}
    meminfo = Path("/proc/meminfo")
    if meminfo.is_file():
        for line in meminfo.read_text(encoding="utf-8").splitlines():
            key, _, raw = line.partition(":")
            number = parse_number(raw)
            if number is not None:
                values[key] = int(number * 1024) if "kB" in raw else int(number)
    if not values:
        return {"status": "unknown"}
    total = values.get("MemTotal", 0)
    available = values.get("MemAvailable", values.get("MemFree", 0))
    used_percent = ((total - available) / total * 100) if total else None
    swap_total = values.get("SwapTotal", 0)
    swap_free = values.get("SwapFree", 0)
    swap_percent = ((swap_total - swap_free) / swap_total * 100) if swap_total else 0
    return {
        "status": "up",
        "usedPercent": round(used_percent, 2) if used_percent is not None else None,
        "swapUsedPercent": round(swap_percent, 2),
    }


def collect_filesystem(
    alerts: list[dict[str, str]], limits: dict[str, int]
) -> dict[str, Any]:
    path = Path(os.getenv("MONITOR_DISK_PATH", "/"))
    try:
        usage = shutil.disk_usage(path)
        used_percent = (usage.used / usage.total * 100) if usage.total else 0
        stat = os.statvfs(path)
        inode_total = stat.f_files
        inode_used = inode_total - stat.f_ffree
        inode_percent = inode_used / inode_total * 100 if inode_total else 0
    except OSError:
        add_alert(alerts, "critical", "FILESYSTEM_UNAVAILABLE", "monitored filesystem could not be read")
        return {"status": "unknown"}

    if used_percent >= limits["diskCritical"]:
        add_alert(alerts, "critical", "DISK_CRITICAL", f"filesystem usage is {used_percent:.1f}%")
    elif used_percent >= limits["diskWarn"]:
        add_alert(alerts, "warning", "DISK_WARN", f"filesystem usage is {used_percent:.1f}%")
    if inode_percent >= limits["inodeCritical"]:
        add_alert(alerts, "critical", "INODE_CRITICAL", f"inode usage is {inode_percent:.1f}%")
    elif inode_percent >= limits["inodeWarn"]:
        add_alert(alerts, "warning", "INODE_WARN", f"inode usage is {inode_percent:.1f}%")
    return {
        "status": "up",
        "usedPercent": round(used_percent, 2),
        "freeBytes": usage.free,
        "inodeUsedPercent": round(inode_percent, 2),
    }


def collect_docker_disk(alerts: list[dict[str, str]], limits: dict[str, int]) -> dict[str, Any]:
    # Keep this command explicit so operators can correlate the report with `docker system df`.
    docker_disk_command = "docker system df"
    del docker_disk_command
    try:
        output = run_command(
            [os.getenv("MONITOR_DOCKER_BIN", "docker"), "system", "df"],
            timeout=limits["httpTimeoutSeconds"],
        )
    except MonitorError:
        add_alert(alerts, "warning", "DOCKER_DISK_FAILED", "Docker disk usage could not be collected")
        return {"status": "unknown"}
    return {"status": "up", "lineCount": len(output.splitlines())}


def http_check(url: str, timeout: int) -> dict[str, Any]:
    started = time.monotonic()
    request = Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            payload: Any = None
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                pass
            return {
                "status": "up" if 200 <= response.status < 300 else "down",
                "httpStatus": response.status,
                "latencyMs": round((time.monotonic() - started) * 1000, 2),
                "payload": payload,
            }
    except HTTPError as error:
        return {
            "status": "down",
            "httpStatus": error.code,
            "latencyMs": round((time.monotonic() - started) * 1000, 2),
        }
    except (URLError, TimeoutError, OSError, ValueError, json.JSONDecodeError):
        return {
            "status": "down",
            "latencyMs": round((time.monotonic() - started) * 1000, 2),
        }


def collect_http_health(alerts: list[dict[str, str]], limits: dict[str, int]) -> dict[str, Any]:
    base = os.getenv(
        "MONITOR_PUBLIC_BASE_URL",
        f"http://127.0.0.1:{os.getenv('FRONTEND_PORT', '3000')}",
    ).rstrip("/")
    endpoints = {
        "liveness": f"{base}/api/health/live",
        "readiness": f"{base}/api/health/ready",
        "dependencies": f"{base}/api/health/dependencies",
        "maps": f"{base}/maps/health",
    }
    results: dict[str, Any] = {}
    dependency_payload: dict[str, Any] = {}
    for name, url in endpoints.items():
        result = http_check(url, limits["httpTimeoutSeconds"])
        payload = result.pop("payload", None)
        results[name] = result
        if name == "dependencies" and isinstance(payload, dict):
            candidate = payload.get("data", payload)
            if isinstance(candidate, dict):
                dependency_payload = candidate
    if results["liveness"]["status"] != "up":
        add_alert(alerts, "critical", "BACKEND_LIVENESS_DOWN", "backend liveness is unavailable")
    if results["readiness"]["status"] != "up":
        add_alert(alerts, "critical", "BACKEND_READINESS_DOWN", "backend core readiness is unavailable")
    if results["maps"]["status"] != "up":
        add_alert(alerts, "warning", "MAP_GATEWAY_DOWN", "frontend map gateway is unavailable")
    dependencies = dependency_payload.get("dependencies", {})
    for name, value in dependencies.items() if isinstance(dependencies, dict) else []:
        if not isinstance(value, dict) or value.get("status") == "up":
            continue
        severity = "critical" if name == "database" else "warning"
        add_alert(alerts, severity, "DEPENDENCY_DOWN", f"{name} dependency is unavailable")
    results["dependencies"] = {
        **results["dependencies"],
        "status": dependency_payload.get("status", results["dependencies"]["status"]),
        "dependencies": {
            name: {
                key: value[key]
                for key in ("status", "latencyMs", "reason")
                if key in value
            }
            for name, value in dependencies.items()
            if isinstance(value, dict)
        },
    }
    return results


def parse_timestamp(value: Any) -> float | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def latest_json(directory: Path) -> tuple[Path | None, dict[str, Any] | None]:
    candidates = sorted(directory.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in candidates:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict):
            return path, payload
    return None, None


def collect_backup_state(alerts: list[dict[str, str]], limits: dict[str, int]) -> dict[str, Any]:
    del limits
    directory = Path(
        os.getenv(
            "MONITOR_BACKUP_RESULT_DIR",
            "/var/lib/pollos-distribuidor/postgres-backups/results",
        )
    )
    results = []
    for path in directory.glob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict):
            results.append(payload)
    valid = [item for item in results if item.get("status") == "validated"]
    valid.sort(key=lambda item: parse_timestamp(item.get("validated_at")) or 0, reverse=True)
    latest = valid[0] if valid else None
    last_success = parse_timestamp(latest.get("validated_at")) if latest else None
    age_hours = (time.time() - last_success) / 3600 if last_success else None
    if age_hours is None:
        add_alert(alerts, "critical", "BACKUP_MISSING", "no validated PostgreSQL backup result is available")
        status = "unknown"
    elif age_hours > parse_int("MONITOR_BACKUP_MAX_AGE_HOURS", 24, 1):
        add_alert(alerts, "critical", "BACKUP_STALE", f"latest validated PostgreSQL backup is {age_hours:.1f} hours old")
        status = "stale"
    else:
        status = "fresh"
    return {
        "status": status,
        "validatedAt": latest.get("validated_at") if latest else None,
        "ageHours": round(age_hours, 2) if age_hours is not None else None,
        "resultCount": len(results),
    }


def collect_restore_state(alerts: list[dict[str, str]], limits: dict[str, int]) -> dict[str, Any]:
    directory = Path(
        os.getenv(
            "MONITOR_RESTORE_RESULT_DIR",
            "/var/lib/pollos-distribuidor/postgres-backups/restore-drills",
        )
    )
    path, payload = latest_json(directory)
    if payload is None:
        add_alert(alerts, "warning", "RESTORE_DRILL_MISSING", "no PostgreSQL restore drill result is available")
        return {"status": "unknown", "recordedAt": None}
    recorded_at = payload.get("recorded_at")
    age_days = (time.time() - parse_timestamp(recorded_at)) / 86_400 if parse_timestamp(recorded_at) else None
    if payload.get("status") != "passed" or payload.get("cleanup") != "passed":
        add_alert(alerts, "critical", "RESTORE_DRILL_FAILED", "latest PostgreSQL restore drill did not pass")
        status = "failed"
    elif age_days is not None and age_days > limits["restoreDrillMaxAgeDays"]:
        add_alert(alerts, "warning", "RESTORE_DRILL_STALE", f"latest PostgreSQL restore drill is {age_days:.1f} days old")
        status = "stale"
    else:
        status = "passed"
    del path
    return {"status": status, "recordedAt": recorded_at, "ageDays": round(age_days, 2) if age_days is not None else None}


def validate_active_manifest(path: Path) -> tuple[str, dict[str, Any]]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "invalid", {}
    if not isinstance(payload, dict):
        return "invalid", {}
    required = ("schemaVersion", "component", "datasetVersion", "sourceUrl", "sha256", "preparedAt", "artifactPaths", "identity")
    if payload.get("schemaVersion") != 1 or any(not payload.get(key) for key in required):
        return "invalid", payload
    if not re.fullmatch(r"[0-9a-fA-F]{64}", str(payload.get("sha256"))):
        return "invalid", payload
    identity = payload.get("identity")
    if not isinstance(identity, dict) or identity.get("fingerprint") is None:
        return "invalid", payload
    root = path.parent.resolve()
    for artifact in payload.get("artifactPaths", []):
        if not isinstance(artifact, str):
            return "invalid", payload
        candidate = (root / artifact).resolve()
        if root not in candidate.parents and candidate != root:
            return "invalid", payload
        if not candidate.is_file() or candidate.stat().st_size == 0:
            return "invalid", payload
    return "valid", payload


def collect_gis_state(alerts: list[dict[str, str]], limits: dict[str, int]) -> dict[str, Any]:
    root = Path(os.getenv("MONITOR_MAP_DATA_DIR", os.getenv("MAP_DATA_DIR", "/srv/pollos-distribuidor/maps")))
    components: dict[str, Any] = {}
    for component in COMPONENTS:
        manifest_path = root / component / "manifest.json"
        state, payload = validate_active_manifest(manifest_path)
        prepared_at = payload.get("preparedAt") if payload else None
        prepared_timestamp = parse_timestamp(prepared_at)
        age_days = (time.time() - prepared_timestamp) / 86_400 if prepared_timestamp else None
        if state != "valid":
            add_alert(alerts, "critical", "GIS_PROVENANCE_INVALID", f"active {component} provenance is invalid")
        elif age_days is not None and age_days > limits["gisMaxAgeDays"]:
            add_alert(alerts, "warning", "GIS_DATASET_STALE", f"active {component} dataset is {age_days:.1f} days old")
        components[component] = {
            "status": "stale" if state == "valid" and age_days is not None and age_days > limits["gisMaxAgeDays"] else state,
            "datasetVersion": payload.get("datasetVersion") if payload else None,
            "preparedAt": prepared_at,
            "ageDays": round(age_days, 2) if age_days is not None else None,
        }

    refreshes = sorted(
        root.glob("refreshes/*/refresh.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    latest_refresh: dict[str, Any] = {"status": "unknown"}
    if refreshes:
        try:
            refresh = json.loads(refreshes[0].read_text(encoding="utf-8"))
            if isinstance(refresh, dict):
                refresh_status = refresh.get("status", "unknown")
                latest_refresh = {
                    "status": refresh_status,
                    "refreshId": refresh.get("refreshId"),
                    "updatedAt": refresh.get("updatedAt"),
                }
                if refresh_status in {"FAILED", "ROLLED_BACK"}:
                    add_alert(alerts, "warning", "GIS_REFRESH_NOT_ACTIVE", f"latest GIS refresh status is {refresh_status}")
                elif refresh_status in {"PREPARING", "VALIDATED", "PROMOTING"}:
                    add_alert(alerts, "warning", "GIS_REFRESH_INCOMPLETE", f"latest GIS refresh remains {refresh_status}")
        except (OSError, json.JSONDecodeError):
            add_alert(alerts, "critical", "GIS_REFRESH_INVALID", "latest GIS refresh manifest is invalid")
    return {"status": "ok", "components": components, "latestRefresh": latest_refresh}


def update_cpu_state(
    stats: dict[str, Any], alerts: list[dict[str, str]], limits: dict[str, int]
) -> None:
    state_path = Path(
        os.getenv("MONITOR_STATE_FILE", "/var/lib/pollos-distribuidor/monitor/state.json")
    )
    try:
        state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.is_file() else {}
    except (OSError, json.JSONDecodeError):
        state = {}
    cpu_since = state.get("cpuWarnSince", {}) if isinstance(state, dict) else {}
    now = time.time()
    new_cpu_since: dict[str, float] = {}
    for name, item in stats.items():
        cpu = item.get("cpuPercent")
        if not isinstance(cpu, (int, float)) or cpu < limits["cpuWarn"]:
            continue
        started = float(cpu_since.get(name, now))
        new_cpu_since[name] = started
        if now - started >= limits["cpuWarnDurationSeconds"]:
            add_alert(alerts, "warning", "CONTAINER_CPU_SUSTAINED", f"{name} CPU stayed above the warning threshold")
    state = {"cpuWarnSince": new_cpu_since, "updatedAt": utc_now()}
    try:
        state_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = state_path.with_name(f"{state_path.name}.partial")
        temporary.write_text(json.dumps(state) + "\n", encoding="utf-8")
        os.replace(temporary, state_path)
    except OSError:
        add_alert(alerts, "warning", "MONITOR_STATE_UNWRITABLE", "monitor CPU duration state could not be persisted")


def send_webhook(report: dict[str, Any], alerts: list[dict[str, str]], limits: dict[str, int]) -> str:
    url = os.getenv("MONITOR_ALERT_WEBHOOK_URL", "").strip()
    if not url or not alerts:
        return "not-configured" if not url else "not-needed"
    body = json.dumps(
        {
            "status": report["status"],
            "checkedAt": report["checkedAt"],
            "alerts": alerts,
        }
    ).encode("utf-8")
    try:
        request = Request(
            url,
            data=body,
            method="POST",
            headers={"Content-Type": "application/json"},
        )
        with urlopen(request, timeout=limits["webhookTimeoutSeconds"]):
            return "sent"
    except (HTTPError, URLError, TimeoutError, OSError, ValueError):
        add_alert(alerts, "warning", "ALERT_WEBHOOK_FAILED", "alert webhook delivery failed")
        return "failed"


def collect_report() -> dict[str, Any]:
    alerts: list[dict[str, str]] = []
    try:
        limits = thresholds()
    except MonitorError as error:
        return {
            "schemaVersion": 1,
            "status": "critical",
            "checkedAt": utc_now(),
            "alerts": [
                {
                    "severity": "critical",
                    "code": "MONITOR_CONFIG_INVALID",
                    "message": str(error),
                }
            ],
            "containers": {},
            "resources": {},
            "endpoints": {},
            "backup": {},
            "restoreDrill": {},
            "gis": {},
            "webhook": "not-configured",
        }
    try:
        containers, container_ids = collect_containers(alerts)
        stats = collect_stats(container_ids, alerts, limits)
        update_cpu_state(stats, alerts, limits)
        resources = {
            "filesystem": collect_filesystem(alerts, limits),
            "memory": read_memory(),
            "docker": collect_docker_disk(alerts, limits),
            "containers": stats,
        }
        memory_used = resources["memory"].get("usedPercent")
        if isinstance(memory_used, (int, float)):
            if memory_used >= limits["memoryCritical"]:
                add_alert(alerts, "critical", "HOST_MEMORY_CRITICAL", f"host memory usage is {memory_used:.1f}%")
            elif memory_used >= limits["memoryWarn"]:
                add_alert(alerts, "warning", "HOST_MEMORY_WARN", f"host memory usage is {memory_used:.1f}%")
        endpoints = collect_http_health(alerts, limits)
        backup = collect_backup_state(alerts, limits)
        restore = collect_restore_state(alerts, limits)
        gis = collect_gis_state(alerts, limits)
    except MonitorError as error:
        add_alert(alerts, "critical", "MONITOR_CONFIG_OR_COMMAND", str(error))
        containers = {}
        resources = {}
        endpoints = {}
        backup = {}
        restore = {}
        gis = {}
    status = "critical" if any(item["severity"] == "critical" for item in alerts) else "warning" if alerts else "ok"
    report = {
        "schemaVersion": 1,
        "status": status,
        "checkedAt": utc_now(),
        "alerts": alerts,
        "containers": containers,
        "resources": resources,
        "endpoints": endpoints,
        "backup": backup,
        "restoreDrill": restore,
        "gis": gis,
    }
    report["webhook"] = send_webhook(report, alerts, limits)
    if report["webhook"] == "failed" and report["status"] == "ok":
        report["status"] = "warning"
    return report


def main() -> int:
    report = collect_report()
    print(json.dumps(report, ensure_ascii=False, sort_keys=True))
    return 0 if report["status"] == "ok" else 1


if __name__ == "__main__":
    sys.exit(main())
