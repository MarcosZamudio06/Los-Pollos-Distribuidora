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
from urllib.parse import urlsplit
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
REMOTE_AWS_CLI_IMAGE = (
    "amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7"
)


class MonitorError(Exception):
    """A sanitized operational error suitable for a structured report."""


class RemoteObjectMissing(Exception):
    """A required remote backup object is confirmed absent."""


class RemoteCheckFailure(Exception):
    """A remote backup check failed without exposing command diagnostics."""


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
    backup_rpo_hours = parse_int("BACKUP_RPO_HOURS", 24, 1)
    backup_rpo_warning_lead_hours = parse_int(
        "MONITOR_BACKUP_RPO_WARNING_LEAD_HOURS", 3, 1
    )
    backup_schedule_max_age_minutes = parse_int(
        "MONITOR_BACKUP_SCHEDULE_MAX_AGE_MINUTES", 1231, 1
    )
    if backup_rpo_warning_lead_hours >= backup_rpo_hours:
        raise MonitorError(
            "MONITOR_BACKUP_RPO_WARNING_LEAD_HOURS must be below BACKUP_RPO_HOURS"
        )
    backup_warning_age_minutes = max(
        backup_schedule_max_age_minutes,
        (backup_rpo_hours - backup_rpo_warning_lead_hours) * 60,
    )
    if backup_warning_age_minutes >= backup_rpo_hours * 60:
        raise MonitorError(
            "the backup schedule envelope must be shorter than BACKUP_RPO_HOURS"
        )
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
        "backupRpoHours": backup_rpo_hours,
        "backupRpoWarningLeadHours": backup_rpo_warning_lead_hours,
        "backupWarningAgeMinutes": backup_warning_age_minutes,
        "backupFailedKeepCount": parse_int("BACKUP_FAILED_KEEP_COUNT", 1, 1),
        "backupFailedWarnCount": parse_int(
            "MONITOR_BACKUP_FAILED_WARN_COUNT", 3, 1
        ),
        "backupFailedWindowDays": parse_int(
            "MONITOR_BACKUP_FAILED_WINDOW_DAYS", 7, 1
        ),
        "backupMinFreeBytes": max(
            parse_int("BACKUP_MIN_FREE_BYTES", 1_073_741_824, 1),
            parse_int("OBJECT_STORAGE_MIN_FREE_BYTES", 1_073_741_824, 1),
        ),
        "backupDiskWarnMultiplier": parse_int(
            "MONITOR_BACKUP_DISK_WARN_MULTIPLIER", 2, 2
        ),
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


def remote_s3_config() -> dict[str, Any]:
    required = (
        "MONITOR_BACKUP_S3_ENDPOINT",
        "MONITOR_BACKUP_S3_REGION",
        "MONITOR_BACKUP_S3_BUCKET",
        "MONITOR_BACKUP_S3_ACCESS_KEY_ID",
        "MONITOR_BACKUP_S3_SECRET_ACCESS_KEY",
    )
    values = {name: os.getenv(name, "").strip() for name in required}
    missing = next((name for name, value in values.items() if not value), None)
    if missing:
        raise MonitorError(f"{missing} is required for remote recovery monitoring")

    endpoint = values["MONITOR_BACKUP_S3_ENDPOINT"].rstrip("/")
    try:
        parsed = urlsplit(endpoint)
        parsed.port
    except ValueError as error:
        raise MonitorError("MONITOR_BACKUP_S3_ENDPOINT is invalid") from error
    insecure_fixture = os.getenv(
        "MONITOR_BACKUP_REMOTE_ALLOW_INSECURE_ENDPOINT", "false"
    ).strip()
    if insecure_fixture not in {"true", "false"}:
        raise MonitorError(
            "MONITOR_BACKUP_REMOTE_ALLOW_INSECURE_ENDPOINT must be true or false"
        )
    if (
        not parsed.hostname
        or not re.fullmatch(r"[A-Za-z0-9.-]+", parsed.hostname)
        or parsed.username
        or parsed.password
        or parsed.path not in {"", "/"}
        or parsed.query
        or parsed.fragment
    ):
        raise MonitorError("MONITOR_BACKUP_S3_ENDPOINT is invalid")
    if not re.fullmatch(
        r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", values["MONITOR_BACKUP_S3_BUCKET"]
    ):
        raise MonitorError("MONITOR_BACKUP_S3_BUCKET is invalid")
    if not re.fullmatch(
        r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", values["MONITOR_BACKUP_S3_REGION"]
    ):
        raise MonitorError("MONITOR_BACKUP_S3_REGION is invalid")

    timeout = parse_int("MONITOR_BACKUP_REMOTE_TIMEOUT_SECONDS", 6, 1)
    if timeout > 8:
        raise MonitorError("MONITOR_BACKUP_REMOTE_TIMEOUT_SECONDS must not exceed 8")
    network = os.getenv("MONITOR_BACKUP_AWS_NETWORK", "").strip()
    if network and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", network):
        raise MonitorError("MONITOR_BACKUP_AWS_NETWORK is invalid")
    if parsed.scheme != "https" and not (
        parsed.scheme == "http"
        and insecure_fixture == "true"
        and parsed.hostname == "backup-storage"
        and bool(network)
    ):
        raise MonitorError("MONITOR_BACKUP_S3_ENDPOINT must use HTTPS")

    return {
        "endpoint": endpoint,
        "region": values["MONITOR_BACKUP_S3_REGION"],
        "bucket": values["MONITOR_BACKUP_S3_BUCKET"],
        "accessKeyId": values["MONITOR_BACKUP_S3_ACCESS_KEY_ID"],
        "secretAccessKey": values["MONITOR_BACKUP_S3_SECRET_ACCESS_KEY"],
        "timeout": timeout,
        "network": network,
    }


def run_remote_aws_cli(
    arguments: list[str], config: dict[str, Any]
) -> subprocess.CompletedProcess[str]:
    docker_bin = os.getenv("MONITOR_DOCKER_BIN", "docker")
    command = [
        docker_bin,
        "run",
        "--rm",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=16m",
        "-e",
        "AWS_ACCESS_KEY_ID",
        "-e",
        "AWS_SECRET_ACCESS_KEY",
        "-e",
        "AWS_DEFAULT_REGION",
        "-e",
        "AWS_EC2_METADATA_DISABLED",
        "-e",
        "AWS_MAX_ATTEMPTS",
        "-e",
        "HOME=/tmp",
    ]
    if config["network"]:
        command.extend(["--network", config["network"]])
    command.extend(
        [
            REMOTE_AWS_CLI_IMAGE,
            "--cli-connect-timeout",
            "2",
            "--cli-read-timeout",
            str(max(1, config["timeout"] - 2)),
            *arguments,
        ]
    )
    env = os.environ.copy()
    env.update(
        {
            "AWS_ACCESS_KEY_ID": config["accessKeyId"],
            "AWS_SECRET_ACCESS_KEY": config["secretAccessKey"],
            "AWS_DEFAULT_REGION": config["region"],
            "AWS_EC2_METADATA_DISABLED": "true",
            "AWS_MAX_ATTEMPTS": "1",
        }
    )
    try:
        return subprocess.run(
            command,
            check=False,
            capture_output=True,
            text=True,
            timeout=config["timeout"] + 1,
            env=env,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise RemoteCheckFailure() from error


def head_remote_object(key: str, config: dict[str, Any]) -> int:
    command = [
        "s3api",
        "head-object",
        "--bucket",
        config["bucket"],
        "--key",
        key,
        "--endpoint-url",
        config["endpoint"],
        "--region",
        config["region"],
        "--output",
        "json",
    ]
    completed = run_remote_aws_cli(command, config)
    if completed.returncode != 0:
        diagnostic = completed.stderr.lower()
        if "nosuchbucket" not in diagnostic and (
            "nosuchkey" in diagnostic
            or "notfound" in diagnostic
            or re.search(r"\b404\b", diagnostic)
            or "not found" in diagnostic
        ):
            raise RemoteObjectMissing()
        raise RemoteCheckFailure()
    try:
        payload = json.loads(completed.stdout)
        size = payload.get("ContentLength") if isinstance(payload, dict) else None
        if isinstance(size, bool) or not isinstance(size, int) or size < 0:
            raise ValueError("invalid remote size")
    except (json.JSONDecodeError, TypeError, ValueError, AttributeError) as error:
        raise RemoteCheckFailure() from error
    return size


def remote_component_manifest_key(component: dict[str, Any], kind: str) -> str:
    key = component.get("key")
    if not isinstance(key, str):
        raise RemoteCheckFailure()
    if kind == "postgresql" and key.endswith(".dump"):
        canonical_key = f"{key[:-5]}.manifest.json"
    elif kind == "object_storage" and key.endswith(".tar.gz"):
        canonical_key = f"{key}.manifest.json"
    else:
        raise RemoteCheckFailure()
    explicit = component.get("manifest_key")
    if isinstance(explicit, str) and explicit:
        if explicit != canonical_key:
            raise RemoteCheckFailure()
        return explicit
    return canonical_key


def verify_remote_recovery_set(
    payload: dict[str, Any], company: str, config: dict[str, Any]
) -> tuple[dict[str, Any], str | None]:
    checked_at = utc_now()
    postgres = payload["postgresql"]
    objects = payload["object_storage"]
    recovery_key = payload["recovery_set_key"]
    try:
        postgres_manifest_key = remote_component_manifest_key(postgres, "postgresql")
        object_manifest_key = remote_component_manifest_key(objects, "object_storage")
    except RemoteCheckFailure:
        return (
            {"status": "failed", "checkedAt": checked_at, "objectsChecked": 0, "reason": "check_failed"},
            "BACKUP_REMOTE_CHECK_FAILED",
        )
    expected = [
        (recovery_key, None),
        (payload["recovery_set_checksum_key"], None),
        (postgres["key"], postgres.get("size_bytes")),
        (postgres_manifest_key, None),
        (objects["key"], objects.get("size_bytes")),
        (object_manifest_key, None),
        (f"{object_manifest_key}.sha256", None),
    ]
    prefixes = (
        f"recovery-sets/{company}/",
        f"postgres/{company}/",
        f"object-storage/{company}/",
    )
    if any(
        not isinstance(key, str)
        or not key.startswith(prefixes)
        or ".." in key.split("/")
        for key, _ in expected
    ):
        return (
            {"status": "failed", "checkedAt": checked_at, "objectsChecked": 0, "reason": "check_failed"},
            "BACKUP_REMOTE_CHECK_FAILED",
        )

    checked = 0
    for key, expected_size in expected:
        try:
            remote_size = head_remote_object(key, config)
        except RemoteObjectMissing:
            return (
                {"status": "failed", "checkedAt": checked_at, "objectsChecked": checked + 1, "reason": "component_missing"},
                "BACKUP_REMOTE_COMPONENT_MISSING",
            )
        except RemoteCheckFailure:
            return (
                {"status": "failed", "checkedAt": checked_at, "objectsChecked": checked + 1, "reason": "check_failed"},
                "BACKUP_REMOTE_CHECK_FAILED",
            )
        checked += 1
        if expected_size is not None and remote_size != expected_size:
            return (
                {"status": "failed", "checkedAt": checked_at, "objectsChecked": checked, "reason": "size_mismatch"},
                "BACKUP_REMOTE_SIZE_MISMATCH",
            )
    return (
        {"status": "passed", "checkedAt": checked_at, "objectsChecked": checked},
        None,
    )


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


def sanitize_alerts(alerts: list[dict[str, str]]) -> list[dict[str, str]]:
    url_pattern = re.compile(r"(?i)\b(?:https?|s3|host)://[^\s,;]+")
    credential_pattern = re.compile(
        r"(?i)\b(?:endpoint|bucket|access[_-]?key(?:[_-]?id)?|secret(?:[_-]?access[_-]?key)?|password|token|credential)\s*[:=]\s*[^\s,;]+"
    )
    sanitized: list[dict[str, str]] = []
    for alert in alerts:
        severity = alert.get("severity", "warning")
        if severity not in {"critical", "warning", "info"}:
            severity = "warning"
        code = alert.get("code", "MONITOR_ALERT")
        if not re.fullmatch(r"[A-Z0-9_]{1,64}", code):
            code = "MONITOR_ALERT"
        message = alert.get("message", "monitor reported an operational condition")
        message = url_pattern.sub("[redacted]", str(message))
        message = credential_pattern.sub("[redacted]", message)
        sanitized.append(
            {"severity": severity, "code": code, "message": message[:240]}
        )
    return sanitized


def normalized_status(value: Any, allowed: set[str]) -> str:
    return value if isinstance(value, str) and value in allowed else "invalid"


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
        add_alert(alerts, severity, "DEPENDENCY_DOWN", "a configured application dependency is unavailable")
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
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.strptime(value, "%Y-%m-%dT%H-%M-%SZ").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


def read_json_attempts(
    directory: Path, timestamp_fields: tuple[str, ...]
) -> tuple[list[dict[str, Any]], int]:
    attempts: list[dict[str, Any]] = []
    result_count = 0
    try:
        candidates = list(directory.glob("*.json"))
    except OSError:
        return attempts, result_count
    for path in candidates:
        try:
            if path.is_symlink() or not path.is_file():
                continue
            modified_at = path.stat().st_mtime
        except OSError:
            continue
        result_count += 1
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            valid_json = isinstance(payload, dict)
        except (OSError, json.JSONDecodeError):
            payload = None
            valid_json = False
        event_timestamp = None
        if valid_json:
            for field in timestamp_fields:
                event_timestamp = parse_timestamp(payload.get(field))
                if event_timestamp is not None:
                    break
        attempts.append(
            {
                "path": path,
                "payload": payload if valid_json else None,
                "validJson": valid_json,
                "eventTimestamp": event_timestamp or modified_at,
                "modifiedAt": modified_at,
            }
        )
    attempts.sort(
        key=lambda item: (item["eventTimestamp"], item["path"].name), reverse=True
    )
    return attempts, result_count


def recovery_set_companies() -> tuple[str, Path, list[str]]:
    mode = os.getenv("MONITOR_RECOVERY_SET_MODE", "single-company").strip()
    configured_root = os.getenv("MONITOR_RECOVERY_SET_RESULT_ROOT", "").strip()
    if configured_root:
        root = Path(configured_root)
    else:
        root = Path("/var/lib/pollos-distribuidor")
    if not root.is_absolute():
        raise MonitorError("MONITOR_RECOVERY_SET_RESULT_ROOT must be absolute")

    if mode == "single-company":
        company = os.getenv("COMPANY_SLUG", "").strip()
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", company):
            raise MonitorError("COMPANY_SLUG is required for single-company recovery monitoring")
        return mode, root, [company]

    if mode != "multi-company":
        raise MonitorError("MONITOR_RECOVERY_SET_MODE must be single-company or multi-company")

    manifest_path = os.getenv("MONITOR_TENANT_MANIFEST_PATH", "").strip()
    if not manifest_path or not Path(manifest_path).is_absolute():
        raise MonitorError("MONITOR_TENANT_MANIFEST_PATH must be an absolute inventory path")
    local_deployment_host_ref = os.getenv("MONITOR_LOCAL_DEPLOYMENT_HOST_REF", "").strip()
    if not local_deployment_host_ref:
        raise MonitorError("MONITOR_LOCAL_DEPLOYMENT_HOST_REF is required for multi-company monitoring")
    try:
        manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise MonitorError("multi-company recovery inventory is unavailable or invalid") from error
    companies = manifest.get("companies") if isinstance(manifest, dict) else None
    if not isinstance(companies, list):
        raise MonitorError("multi-company recovery inventory is invalid")

    selected: list[str] = []
    seen: set[str] = set()
    for company in companies:
        if not isinstance(company, dict):
            raise MonitorError("multi-company recovery inventory is invalid")
        slug = company.get("slug")
        if not isinstance(slug, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise MonitorError("multi-company recovery inventory is invalid")
        host_ref = company.get("deploymentHostRef")
        if not isinstance(host_ref, str) or not host_ref:
            raise MonitorError("multi-company recovery inventory is invalid")
        if slug in seen:
            raise MonitorError("multi-company recovery inventory contains duplicate tenants")
        seen.add(slug)
        if (
            company.get("environment") == "production"
            and company.get("status") == "active"
            and host_ref == local_deployment_host_ref
        ):
            selected.append(slug)
    if len(selected) != 1:
        raise MonitorError("multi-company recovery inventory must have exactly one active production tenant for this host")
    return mode, root, selected


def recovery_set_result_directory(mode: str, root: Path, company: str) -> Path:
    if mode == "single-company":
        # Older host monitoring.env files may still name the former PostgreSQL
        # results directory. Only its dedicated recovery-set child is read.
        legacy_directory = os.getenv("MONITOR_BACKUP_RESULT_DIR", "").strip()
        if legacy_directory and not os.getenv("MONITOR_RECOVERY_SET_RESULT_ROOT", "").strip():
            legacy_path = Path(legacy_directory)
            if not legacy_path.is_absolute():
                raise MonitorError("legacy backup result path must be absolute")
            return legacy_path if legacy_path.name == "company-recovery" else legacy_path / "company-recovery"
        return root / "postgres-backups" / "results" / "company-recovery"
    return root / company / "postgres-backups" / "company-recovery"


def component_evidence_is_valid(
    component: Any, company: str, component_name: str
) -> bool:
    if not isinstance(component, dict):
        return False
    size_bytes = component.get("size_bytes")
    if not isinstance(size_bytes, int) or isinstance(size_bytes, bool) or size_bytes <= 0:
        return False
    for checksum_field in ("sha256", "manifest_sha256"):
        checksum = component.get(checksum_field)
        if not isinstance(checksum, str) or not re.fullmatch(
            r"[a-fA-F0-9]{64}", checksum
        ):
            return False
    key = component.get("key")
    if not isinstance(key, str):
        return False
    if component_name == "postgresql":
        pattern = rf"postgres/{re.escape(company)}/\d{{4}}/\d{{2}}/[^/]+\.dump"
    else:
        pattern = rf"object-storage/{re.escape(company)}/[^/]+\.tar\.gz"
    return re.fullmatch(pattern, key) is not None


def validate_recovery_set_result(payload: Any, company: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("company_slug") != company:
        return {"classification": "corrupt"}
    if payload.get("status") == "failed":
        backend_restoration = payload.get("backend_restoration")
        if backend_restoration in {"restored", "preexisting-stopped"}:
            cleanup_status = "passed"
        elif backend_restoration == "failed":
            cleanup_status = "failed"
        elif (
            payload.get("cleanup_stage") == "not-required"
            and payload.get("backend_state_before") == "unknown"
        ):
            cleanup_status = "not_required"
        else:
            cleanup_status = "unknown"
        retention = payload.get("retention")
        retention_state = retention.get("status") if isinstance(retention, dict) else "unknown"
        return {
            "classification": "failed",
            "cleanupStatus": cleanup_status,
            "retentionStatus": (
                "applied" if retention_state == "applied" else "failed" if retention_state == "failed" else "not_run"
            ),
        }
    if payload.get("status") != "validated":
        return {"classification": "corrupt"}

    components = payload.get("components")
    if not isinstance(components, dict):
        return {"classification": "partial"}
    postgres_status = components.get("postgresql")
    object_storage_status = components.get("object_storage")
    if postgres_status != "validated" or object_storage_status != "validated":
        return {
            "classification": "partial",
            "components": {
                "postgresql": postgres_status,
                "objectStorage": object_storage_status,
            },
        }

    recovery_point = payload.get("recovery_point")
    recovery_key = payload.get("recovery_set_key")
    finished_at = parse_timestamp(payload.get("finished_at"))
    started_at = parse_timestamp(payload.get("started_at"))
    checksum_key = payload.get("recovery_set_checksum_key")
    if (
        finished_at is None
        or started_at is None
        or not isinstance(recovery_key, str)
        or re.fullmatch(
            rf"recovery-sets/{re.escape(company)}/[^/]+\.manifest\.json",
            recovery_key,
        )
        is None
        or checksum_key != recovery_key + ".sha256"
        or not component_evidence_is_valid(payload.get("postgresql"), company, "postgresql")
        or not component_evidence_is_valid(
            payload.get("object_storage"), company, "object_storage"
        )
        or not isinstance(recovery_point, dict)
        or recovery_point.get("method") != "backend-quiesce"
    ):
        return {"classification": "corrupt"}

    point_fields = (
        "write_barrier_at",
        "capture_started_at",
        "capture_finished_at",
        "write_barrier_released_at",
    )
    point_timestamps = [parse_timestamp(recovery_point.get(field)) for field in point_fields]
    if (
        any(value is None for value in point_timestamps)
        or point_timestamps != sorted(point_timestamps)
        or started_at > point_timestamps[0]
        or point_timestamps[-1] > finished_at
    ):
        return {"classification": "corrupt"}

    retention = payload.get("retention")
    retention_status = retention.get("status") if isinstance(retention, dict) else "unknown"
    backend_restoration = payload.get("backend_restoration")
    cleanup_stage = payload.get("cleanup_stage")
    cleanup_status = (
        "passed"
        if cleanup_stage == "not-required"
        and backend_restoration in {"restored", "preexisting-stopped"}
        else "failed"
    )
    return {
        "classification": "validated",
        "finishedAt": finished_at,
        "recoveryPointAt": point_timestamps[0],
        "cleanupStatus": cleanup_status,
        "retentionStatus": "applied" if retention_status == "applied" else "failed",
        "components": {"postgresql": "validated", "objectStorage": "validated"},
        "checksumsAndManifests": "passed",
    }


def read_recovery_attempts(directory: Path, company: str) -> tuple[list[dict[str, Any]], int]:
    attempts, result_count = read_json_attempts(
        directory, ("finished_at", "started_at")
    )
    for attempt in attempts:
        attempt["evidence"] = (
            validate_recovery_set_result(attempt["payload"], company)
            if attempt["validJson"]
            else {"classification": "corrupt"}
        )
    return attempts, result_count


def collect_backup_state(alerts: list[dict[str, str]], limits: dict[str, int]) -> dict[str, Any]:
    try:
        mode, root, companies = recovery_set_companies()
    except MonitorError as error:
        add_alert(alerts, "critical", "BACKUP_CONFIG_INVALID", str(error))
        return {"status": "unknown", "validatedAt": None, "recoveryPointAt": None, "ageHours": None, "recoveryPointAgeHours": None, "resultCount": 0, "companies": {}}

    remote_config: dict[str, Any] | None
    try:
        remote_config = remote_s3_config()
    except MonitorError:
        remote_config = None
        add_alert(
            alerts,
            "critical",
            "BACKUP_REMOTE_CONFIG_INVALID",
            "read-only remote recovery monitoring is not configured correctly",
        )

    now = time.time()
    company_states: dict[str, dict[str, Any]] = {}
    result_count = 0
    validated_timestamps: list[float] = []
    recovery_point_timestamps: list[float] = []
    company_statuses: list[str] = []
    warning_age_minutes = limits["backupWarningAgeMinutes"]

    for company in companies:
        directory = recovery_set_result_directory(mode, root, company)
        attempts, company_result_count = read_recovery_attempts(directory, company)
        result_count += company_result_count
        if not attempts:
            company_states[company] = {
                "status": "missing",
                "latestAttemptStatus": "missing",
                "validatedAt": None,
                "recoveryPointAt": None,
                "ageHours": None,
                "recoveryPointAgeHours": None,
                "components": {"postgresql": "unknown", "objectStorage": "unknown"},
                "checksumsAndManifests": "unknown",
                "cleanupStatus": "unknown",
                "retentionStatus": "unknown",
                "remoteIntegrity": {
                    "status": "not_run",
                    "reason": "no_validated_recovery_set",
                },
            }
            company_statuses.append("missing")
            add_alert(
                alerts,
                "critical",
                "BACKUP_MISSING",
                "no complete validated recovery set is available for a configured company",
            )
            continue

        latest = attempts[0]
        payload = latest["payload"]
        latest_category = (
            latest["evidence"]["classification"]
            if latest["validJson"]
            else "corrupt"
        )
        successful_attempts = [
            attempt
            for attempt in attempts
            if attempt["validJson"]
            and attempt["evidence"].get("classification") == "validated"
        ]
        latest_validated = successful_attempts[0] if successful_attempts else None
        remote_integrity: dict[str, Any] = {
            "status": "not_run",
            "reason": "no_validated_recovery_set",
        }
        remote_failure_code: str | None = None
        remote_company_status: str | None = None
        if latest_validated is not None:
            if remote_config is None:
                remote_integrity = {
                    "status": "failed",
                    "checkedAt": utc_now(),
                    "objectsChecked": 0,
                    "reason": "config_invalid",
                }
                remote_company_status = "remote-check-failed"
            else:
                remote_integrity, remote_failure_code = verify_remote_recovery_set(
                    latest_validated["payload"], company, remote_config
                )
                if remote_failure_code == "BACKUP_REMOTE_COMPONENT_MISSING":
                    remote_company_status = "remote-invalid"
                elif remote_failure_code == "BACKUP_REMOTE_SIZE_MISMATCH":
                    remote_company_status = "remote-invalid"
                elif remote_failure_code is not None:
                    remote_company_status = "remote-check-failed"
            if remote_failure_code is not None:
                add_alert(
                    alerts,
                    "critical",
                    remote_failure_code,
                    "remote recovery-set components could not be confirmed",
                )
        validated_at = (
            latest_validated["evidence"].get("finishedAt")
            if latest_validated is not None
            else None
        )
        recovery_point_at = (
            latest_validated["evidence"].get("recoveryPointAt")
            if latest_validated is not None
            else None
        )
        age_hours = (
            max(0.0, (now - recovery_point_at) / 3600)
            if recovery_point_at is not None
            else None
        )
        point_status = "missing"
        if validated_at is not None:
            validated_timestamps.append(validated_at)
        if recovery_point_at is not None:
            recovery_point_timestamps.append(recovery_point_at)
            if age_hours >= limits["backupRpoHours"]:
                point_status = "stale"
                add_alert(
                    alerts,
                    "critical",
                    "BACKUP_STALE",
                    "a complete recovery set has reached or exceeded the configured RPO",
                )
            elif age_hours * 60 >= warning_age_minutes:
                point_status = "at-risk"
                add_alert(
                    alerts,
                    "warning",
                    "BACKUP_RPO_WARNING",
                    "the latest complete recovery set is within the configured warning lead of its RPO",
                )
            else:
                point_status = "fresh"
        elif latest_category not in {"failed", "corrupt", "partial"}:
            add_alert(
                alerts,
                "critical",
                "BACKUP_MISSING",
                "no complete validated recovery set is available for a configured company",
            )

        latest_attempt_status = latest_category
        latest_evidence = latest.get("evidence", {})
        cleanup_status = latest_evidence.get("cleanupStatus", "unknown")
        retention_status = latest_evidence.get("retentionStatus", "unknown")
        if latest_category == "failed":
            add_alert(
                alerts,
                "critical",
                "BACKUP_FAILED",
                "the latest complete recovery-set attempt failed",
            )
            if cleanup_status == "failed":
                latest_attempt_status = "cleanup-failed"
                add_alert(
                    alerts,
                    "critical",
                    "BACKUP_CLEANUP_FAILED",
                    "the failed backup did not restore the ERP to its prior operating state",
                )
            elif cleanup_status == "unknown":
                add_alert(
                    alerts,
                    "warning",
                    "BACKUP_CLEANUP_UNKNOWN",
                    "the failed backup did not record a definitive ERP cleanup state",
                )
            if (
                latest["evidence"].get("retentionStatus") == "failed"
                or payload.get("failure_stage") == "retention"
            ):
                latest_attempt_status = "retention-failed"
                add_alert(
                    alerts,
                    "critical",
                    "BACKUP_RETENTION_FAILED",
                    "the failed recovery-set attempt could not complete safe retention processing",
                )
        elif latest_category == "partial":
            add_alert(
                alerts,
                "critical",
                "BACKUP_RECOVERY_SET_PARTIAL",
                "the latest recovery-set result does not validate both required components",
            )
        elif latest_category == "corrupt":
            add_alert(
                alerts,
                "critical",
                "BACKUP_RESULT_CORRUPTED",
                "the latest recovery-set result or its checksum and manifest evidence is invalid",
            )

        if latest_category == "validated" and cleanup_status != "passed":
            latest_attempt_status = "cleanup-failed"
            add_alert(
                alerts,
                "critical",
                "BACKUP_CLEANUP_FAILED",
                "the recovery-set backup did not confirm restoration of the ERP operating state",
            )
        if latest_category == "validated" and retention_status != "applied":
            latest_attempt_status = "retention-failed"
            add_alert(
                alerts,
                "critical",
                "BACKUP_RETENTION_FAILED",
                "the complete recovery set did not confirm successful retention processing",
            )

        component_payload = payload.get("components", {}) if isinstance(payload, dict) else {}
        if not isinstance(component_payload, dict) and latest_validated is not None:
            component_payload = latest_validated["payload"].get("components", {})
        company_status = point_status
        if latest_attempt_status in {
            "failed",
            "partial",
            "corrupt",
            "cleanup-failed",
            "retention-failed",
        }:
            company_status = latest_attempt_status
        elif latest_category == "failed":
            company_status = "failed"
        elif latest_category in {"partial", "corrupt"}:
            company_status = latest_category
        company_states[company] = {
            "status": company_status,
            "latestAttemptStatus": latest_attempt_status,
            "validatedAt": (
                datetime.fromtimestamp(validated_at, timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
                if validated_at is not None
                else None
            ),
            "recoveryPointAt": (
                datetime.fromtimestamp(recovery_point_at, timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
                if recovery_point_at is not None
                else None
            ),
            "ageHours": round(age_hours, 2) if age_hours is not None else None,
            "recoveryPointAgeHours": round(age_hours, 2) if age_hours is not None else None,
            "components": {
                "postgresql": normalized_status(
                    component_payload.get("postgresql", "unknown"),
                    {"validated", "failed", "interrupted", "in-progress", "not-started", "unknown"},
                ),
                "objectStorage": normalized_status(
                    component_payload.get("object_storage", "unknown"),
                    {"validated", "failed", "interrupted", "in-progress", "not-started", "unknown"},
                ),
            },
            "checksumsAndManifests": (
                latest_validated["evidence"].get("checksumsAndManifests", "unknown")
                if latest_validated is not None
                else "unknown"
            ),
            "cleanupStatus": cleanup_status,
            "retentionStatus": retention_status,
            "remoteIntegrity": remote_integrity,
        }
        if remote_company_status is not None:
            company_states[company]["status"] = remote_company_status
            company_status = remote_company_status
        company_statuses.append(company_status)

    status_priority = {
        "fresh": 0,
        "at-risk": 1,
        "unknown": 2,
        "missing": 3,
        "stale": 4,
        "partial": 5,
        "corrupt": 6,
        "cleanup-failed": 7,
        "retention-failed": 7,
        "failed": 8,
        "remote-invalid": 9,
        "remote-check-failed": 10,
    }
    status = (
        max(company_statuses, key=lambda value: status_priority.get(value, 8))
        if company_statuses
        else "unknown"
    )

    oldest_validated_at = min(validated_timestamps) if validated_timestamps else None
    oldest_recovery_point_at = (
        min(recovery_point_timestamps) if recovery_point_timestamps else None
    )
    oldest_age_hours = (
        max(0.0, (now - oldest_recovery_point_at) / 3600)
        if oldest_recovery_point_at is not None
        else None
    )
    return {
        "status": status,
        "validatedAt": datetime.fromtimestamp(oldest_validated_at, timezone.utc).isoformat().replace("+00:00", "Z") if oldest_validated_at else None,
        "recoveryPointAt": datetime.fromtimestamp(oldest_recovery_point_at, timezone.utc).isoformat().replace("+00:00", "Z") if oldest_recovery_point_at is not None else None,
        "ageHours": round(oldest_age_hours, 2) if oldest_age_hours is not None else None,
        "recoveryPointAgeHours": round(oldest_age_hours, 2) if oldest_age_hours is not None else None,
        "resultCount": result_count,
        "companies": company_states,
    }


def backup_local_directory(mode: str, root: Path, company: str) -> Path:
    configured = os.getenv("MONITOR_BACKUP_LOCAL_PATH", "").strip()
    if configured:
        if mode == "multi-company":
            if "{company}" not in configured:
                raise MonitorError(
                    "MONITOR_BACKUP_LOCAL_PATH must include {company} in multi-company mode"
                )
            configured = configured.replace("{company}", company)
        directory = Path(configured)
    elif mode == "single-company" and os.getenv("BACKUP_LOCAL_DIR", "").strip():
        directory = Path(os.getenv("BACKUP_LOCAL_DIR", "").strip())
    elif mode == "multi-company":
        directory = root / company / "postgres-backups"
    else:
        directory = root / "postgres-backups"
    if not directory.is_absolute():
        raise MonitorError("backup local directory must be an absolute path")
    return directory


def count_regular_files(directory: Path, pattern: str) -> int:
    try:
        candidates = list(directory.glob(pattern))
    except OSError:
        return 0
    count = 0
    for path in candidates:
        try:
            if path.is_file() and not path.is_symlink():
                count += 1
        except OSError:
            continue
    return count


def recent_failed_recovery_attempts(directory: Path, window_start: float) -> int:
    attempts, _ = read_json_attempts(directory, ("finished_at", "started_at"))
    return sum(
        1
        for attempt in attempts
        if attempt["validJson"]
        and attempt["eventTimestamp"] >= window_start
        and attempt["payload"].get("status") == "failed"
    )


def collect_backup_local_state(alerts: list[dict[str, str]]) -> dict[str, Any]:
    try:
        mode, root, companies = recovery_set_companies()
        limits = thresholds()
    except MonitorError as error:
        add_alert(alerts, "warning", "BACKUP_LOCAL_STORAGE_UNKNOWN", str(error))
        return {"status": "unknown", "companies": {}}

    now = time.time()
    window_start = now - limits["backupFailedWindowDays"] * 86_400
    company_states: dict[str, dict[str, Any]] = {}
    statuses: list[str] = []
    available_bytes: list[int] = []
    failed_artifacts = 0
    recent_failures = 0
    for company in companies:
        try:
            backup_directory = backup_local_directory(mode, root, company)
        except MonitorError as error:
            add_alert(alerts, "critical", "BACKUP_LOCAL_STORAGE_CONFIG_INVALID", str(error))
            company_states[company] = {"status": "unknown"}
            statuses.append("unknown")
            continue

        postgres_failure_directory = backup_directory / "failed"
        object_failure_directory = backup_directory / "object-storage" / "failed"
        postgres_failures = count_regular_files(
            postgres_failure_directory, "*.dump.failed"
        )
        object_failures = count_regular_files(
            object_failure_directory, "*.failure.json"
        )
        local_failed_artifacts = postgres_failures + object_failures
        failed_artifacts += local_failed_artifacts
        company_result_directory = recovery_set_result_directory(mode, root, company)
        recent_company_failures = recent_failed_recovery_attempts(
            company_result_directory, window_start
        )
        recent_failures += recent_company_failures

        probe_directory = backup_directory
        while not probe_directory.exists() and probe_directory != probe_directory.parent:
            probe_directory = probe_directory.parent
        try:
            if not probe_directory.is_dir() or probe_directory.is_symlink():
                raise OSError("backup storage directory is unavailable")
            free_bytes = shutil.disk_usage(probe_directory).free
        except OSError:
            add_alert(
                alerts,
                "warning",
                "BACKUP_LOCAL_STORAGE_UNKNOWN",
                "available local space for recovery backups could not be measured",
            )
            company_states[company] = {
                "status": "unknown",
                "freeBytes": None,
                "minimumFreeBytes": limits["backupMinFreeBytes"],
                "pathReady": backup_directory.is_dir(),
                "failedArtifacts": local_failed_artifacts,
                "recentFailedAttempts": recent_company_failures,
            }
            statuses.append("unknown")
            continue

        available_bytes.append(free_bytes)
        path_ready = backup_directory.is_dir() and not backup_directory.is_symlink()
        if free_bytes < limits["backupMinFreeBytes"]:
            local_status = "critical"
            add_alert(
                alerts,
                "critical",
                "BACKUP_LOCAL_DISK_LOW",
                "available local space is below the minimum required for recovery backups",
            )
        elif free_bytes < (
            limits["backupMinFreeBytes"] * limits["backupDiskWarnMultiplier"]
        ):
            local_status = "warning"
            add_alert(
                alerts,
                "warning",
                "BACKUP_LOCAL_DISK_LOW",
                "available local space is approaching the minimum required for recovery backups",
            )
        else:
            local_status = "ok"

        if not path_ready:
            if local_status == "ok":
                local_status = "warning"
            add_alert(
                alerts,
                "warning",
                "BACKUP_LOCAL_STORAGE_PATH_MISSING",
                "the configured local recovery-backup directory is not present",
            )

        if (
            postgres_failures > limits["backupFailedKeepCount"]
            or object_failures > limits["backupFailedKeepCount"]
        ):
            if local_status == "ok":
                local_status = "warning"
            add_alert(
                alerts,
                "warning",
                "BACKUP_FAILED_ARTIFACTS_ACCUMULATING",
                "local failed-backup evidence exceeds its configured retention bound",
            )

        if recent_company_failures >= limits["backupFailedWarnCount"]:
            if local_status == "ok":
                local_status = "warning"
            add_alert(
                alerts,
                "warning",
                "BACKUP_FAILURES_REPEATED",
                "recovery-set backup failures reached the configured monitoring threshold",
            )

        company_states[company] = {
            "status": local_status,
            "freeBytes": free_bytes,
            "minimumFreeBytes": limits["backupMinFreeBytes"],
            "pathReady": path_ready,
            "failedArtifacts": local_failed_artifacts,
            "recentFailedAttempts": recent_company_failures,
        }
        statuses.append(local_status)

    status_priority = {"ok": 0, "warning": 1, "unknown": 2, "critical": 3}
    status = (
        max(statuses, key=lambda value: status_priority.get(value, 3))
        if statuses
        else "unknown"
    )
    return {
        "status": status,
        "freeBytes": min(available_bytes) if available_bytes else None,
        "minimumFreeBytes": limits["backupMinFreeBytes"],
        "failedArtifacts": failed_artifacts,
        "recentFailedAttempts": recent_failures,
        "companies": company_states,
    }


def restore_result_directory(mode: str, root: Path, company: str) -> Path:
    configured = os.getenv("MONITOR_RESTORE_RESULT_DIR", "").strip()
    if mode == "multi-company":
        if "{company}" in configured:
            directory = Path(configured.replace("{company}", company))
        elif configured:
            raise MonitorError(
                "MONITOR_RESTORE_RESULT_DIR must include {company} in multi-company mode"
            )
        else:
            directory = root / company / "postgres-backups" / "restore-drills"
    elif configured:
        directory = Path(configured)
    else:
        directory = root / "postgres-backups" / "restore-drills"
    if not directory.is_absolute():
        raise MonitorError("restore result directory must be an absolute path")
    return directory


RESTORE_CHECKS = (
    "recovery_set_identity",
    "recovery_set_archives",
    "postgresql",
    "postgis",
    "object_storage_restore",
    "company_branding",
    "delivery_evidence",
    "fiscal_artifacts",
    "storage_reference_integrity",
)


def validate_restore_result(payload: Any, company: str) -> dict[str, Any]:
    if not isinstance(payload, dict) or payload.get("company_slug") != company:
        return {"classification": "corrupt"}
    created_at = parse_timestamp(payload.get("created_at") or payload.get("recorded_at"))
    recovery_key = payload.get("recovery_set_key")
    if (
        created_at is None
        or payload.get("status") not in {"passed", "failed"}
        or not isinstance(recovery_key, str)
        or re.fullmatch(
            rf"recovery-sets/{re.escape(company)}/[^/]+\.manifest\.json",
            recovery_key,
        )
        is None
    ):
        return {"classification": "corrupt"}

    cleanup_status = payload.get("disposable_targets_cleanup")
    restore_database = payload.get("restore_database")
    restore_bucket = payload.get("restore_object_storage_bucket")
    checks = payload.get("checks")
    checks_valid = isinstance(checks, dict) and all(
        isinstance(checks.get(name), dict)
        and checks[name].get("status") == "passed"
        for name in RESTORE_CHECKS
    )
    identity_valid = (
        isinstance(restore_database, str)
        and restore_database.endswith("_restore_drill")
        and isinstance(restore_bucket, str)
        and restore_bucket.startswith(f"mte-restore-{company}-")
    )
    if not identity_valid:
        return {"classification": "corrupt"}
    if (
        payload.get("status") != "passed"
        or cleanup_status != "cleaned"
        or not checks_valid
    ):
        return {
            "classification": "failed",
            "createdAt": created_at,
            "cleanupStatus": cleanup_status if cleanup_status in {"cleaned", "failed", "not_created"} else "unknown",
            "checks": {
                name: (
                    checks[name].get("status", "unknown")
                    if isinstance(checks, dict) and isinstance(checks.get(name), dict)
                    else "not_run"
                )
                for name in RESTORE_CHECKS
            },
        }
    return {
        "classification": "passed",
        "createdAt": created_at,
        "cleanupStatus": "cleaned",
        "checks": {name: "passed" for name in RESTORE_CHECKS},
        "checksumsAndManifests": "passed",
        "storageReferenceIntegrity": "passed",
        "postgresql": "passed",
        "objectStorage": "passed",
    }


def collect_restore_state(alerts: list[dict[str, str]], limits: dict[str, int]) -> dict[str, Any]:
    try:
        mode, root, companies = recovery_set_companies()
    except MonitorError as error:
        add_alert(alerts, "critical", "RESTORE_DRILL_CONFIG_INVALID", str(error))
        return {"status": "unknown", "recordedAt": None, "companies": {}}

    now = time.time()
    company_states: dict[str, dict[str, Any]] = {}
    statuses: list[str] = []
    recorded_timestamps: list[float] = []
    for company in companies:
        try:
            directory = restore_result_directory(mode, root, company)
        except MonitorError as error:
            add_alert(alerts, "critical", "RESTORE_DRILL_CONFIG_INVALID", str(error))
            company_states[company] = {
                "status": "unknown",
                "latestAttemptStatus": "unknown",
                "recordedAt": None,
                "ageDays": None,
                "cleanupStatus": "unknown",
            }
            statuses.append("missing")
            continue
        attempts, _ = read_json_attempts(
            directory, ("created_at", "recorded_at", "recordedAt")
        )
        if not attempts:
            company_states[company] = {
                "status": "missing",
                "latestAttemptStatus": "missing",
                "recordedAt": None,
                "ageDays": None,
                "cleanupStatus": "unknown",
            }
            statuses.append("missing")
            add_alert(
                alerts,
                "warning",
                "RESTORE_DRILL_MISSING",
                "no complete recovery-set restore drill is available for a configured company",
            )
            continue

        latest = attempts[0]
        latest_detail = (
            validate_restore_result(latest["payload"], company)
            if latest["validJson"]
            else {"classification": "corrupt"}
        )
        passed_attempts = []
        for attempt in attempts:
            if not attempt["validJson"]:
                continue
            detail = validate_restore_result(attempt["payload"], company)
            if detail.get("classification") == "passed":
                passed_attempts.append((attempt, detail))
        last_pass = passed_attempts[0][1] if passed_attempts else None
        last_pass_timestamp = last_pass.get("createdAt") if last_pass else None
        age_days = (
            max(0.0, (now - last_pass_timestamp) / 86_400)
            if last_pass_timestamp is not None
            else None
        )
        if last_pass_timestamp is not None:
            recorded_timestamps.append(last_pass_timestamp)

        latest_status = latest_detail.get("classification", "corrupt")
        cleanup_status = latest_detail.get("cleanupStatus", "unknown")
        if latest_status == "corrupt":
            status = "corrupt"
            add_alert(
                alerts,
                "critical",
                "RESTORE_DRILL_RESULT_CORRUPTED",
                "the latest restore-drill result or its recovery identity is invalid",
            )
        elif latest_status == "failed":
            status = "failed"
            add_alert(
                alerts,
                "critical",
                "RESTORE_DRILL_FAILED",
                "the latest complete recovery-set restore drill did not pass all checks and cleanup",
            )
            if cleanup_status != "cleaned":
                add_alert(
                    alerts,
                    "critical",
                    "RESTORE_DRILL_CLEANUP_FAILED",
                    "the latest restore drill did not confirm disposable-target cleanup",
                )
        elif last_pass_timestamp is None:
            status = "missing"
            add_alert(
                alerts,
                "warning",
                "RESTORE_DRILL_MISSING",
                "no complete recovery-set restore drill is available for a configured company",
            )
        elif age_days > limits["restoreDrillMaxAgeDays"]:
            status = "stale"
            add_alert(
                alerts,
                "warning",
                "RESTORE_DRILL_STALE",
                "the latest complete recovery-set restore drill is older than its configured limit",
            )
        else:
            status = "passed"
            cleanup_status = "cleaned"

        latest_checks = latest_detail.get("checks", {})
        if latest_status in {"passed", "failed"}:
            checksums_and_manifests = (
                "passed"
                if latest_checks.get("recovery_set_identity") == "passed"
                and latest_checks.get("recovery_set_archives") == "passed"
                else "failed"
            )
            storage_reference_integrity = normalized_status(
                latest_checks.get("storage_reference_integrity", "unknown"),
                {"passed", "failed", "not_run", "unknown"},
            )
        else:
            checksums_and_manifests = "unknown"
            storage_reference_integrity = "unknown"
        company_states[company] = {
            "status": status,
            "latestAttemptStatus": latest_status,
            "recordedAt": (
                datetime.fromtimestamp(last_pass_timestamp, timezone.utc)
                .isoformat()
                .replace("+00:00", "Z")
                if last_pass_timestamp is not None
                else None
            ),
            "ageDays": round(age_days, 2) if age_days is not None else None,
            "cleanupStatus": cleanup_status,
            "checksumsAndManifests": checksums_and_manifests,
            "storageReferenceIntegrity": storage_reference_integrity,
            "components": {
                "postgresql": normalized_status(
                    latest_checks.get("postgresql", "unknown"),
                    {"passed", "failed", "not_run", "unknown"},
                ),
                "objectStorage": normalized_status(
                    latest_checks.get("object_storage_restore", "unknown"),
                    {"passed", "failed", "not_run", "unknown"},
                ),
            },
        }
        statuses.append(status)

    status_priority = {
        "passed": 0,
        "stale": 1,
        "missing": 2,
        "failed": 3,
        "corrupt": 4,
    }
    status = (
        max(statuses, key=lambda value: status_priority.get(value, 4))
        if statuses
        else "unknown"
    )
    newest_timestamp = min(recorded_timestamps) if recorded_timestamps else None
    cleanup_values = [item.get("cleanupStatus", "unknown") for item in company_states.values()]
    cleanup_status = (
        "failed"
        if "failed" in cleanup_values
        else "cleaned"
        if cleanup_values and all(value == "cleaned" for value in cleanup_values)
        else "unknown"
    )
    checksums_status = (
        "passed"
        if company_states
        and all(item.get("checksumsAndManifests") == "passed" for item in company_states.values())
        else "failed"
        if any(item.get("checksumsAndManifests") == "failed" for item in company_states.values())
        else "unknown"
    )
    reference_status = (
        "passed"
        if company_states
        and all(item.get("storageReferenceIntegrity") == "passed" for item in company_states.values())
        else "failed"
        if any(item.get("storageReferenceIntegrity") == "failed" for item in company_states.values())
        else "unknown"
    )
    component_statuses = {
        name: (
            "passed"
            if company_states
            and all(item.get("components", {}).get(name) == "passed" for item in company_states.values())
            else "failed"
            if any(item.get("components", {}).get(name) == "failed" for item in company_states.values())
            else "unknown"
        )
        for name in ("postgresql", "objectStorage")
    }
    return {
        "status": status,
        "recordedAt": (
            datetime.fromtimestamp(newest_timestamp, timezone.utc)
            .isoformat()
            .replace("+00:00", "Z")
            if newest_timestamp is not None
            else None
        ),
        "ageDays": (
            round(max(0.0, (now - newest_timestamp) / 86_400), 2)
            if newest_timestamp is not None
            else None
        ),
        "cleanupStatus": cleanup_status,
        "checksumsAndManifests": checksums_status,
        "storageReferenceIntegrity": reference_status,
        "components": component_statuses,
        "companies": company_states,
    }


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
    alerts[:] = sanitize_alerts(alerts)
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
        backup["localStorage"] = collect_backup_local_state(alerts)
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
    alerts[:] = sanitize_alerts(alerts)
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
