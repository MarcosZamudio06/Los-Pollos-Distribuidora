#!/usr/bin/env python3
import importlib.util
import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError


SCRIPT = Path(__file__).with_name("monitor-production.py")
SPEC = importlib.util.spec_from_file_location("monitor_production", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load monitor-production.py")
MONITOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MONITOR)


class ProductionMonitorTests(unittest.TestCase):
    def setUp(self):
        self.environment = os.environ.copy()

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self.environment)

    def test_disk_critical_threshold(self):
        class Usage:
            total = 100
            used = 95
            free = 5

        class Stat:
            f_files = 100
            f_ffree = 10

        alerts = []
        with patch.object(MONITOR.shutil, "disk_usage", return_value=Usage()), patch.object(
            MONITOR.os, "statvfs", return_value=Stat()
        ):
            MONITOR.collect_filesystem(alerts, MONITOR.thresholds())

        self.assertIn("DISK_CRITICAL", {item["code"] for item in alerts})

    def test_backup_stale_threshold(self):
        old_timestamp = (
            datetime.now(timezone.utc) - timedelta(hours=48)
        ).isoformat().replace("+00:00", "Z")
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "old.json").write_text(
                json.dumps({"status": "validated", "validated_at": old_timestamp}),
                encoding="utf-8",
            )
            os.environ["MONITOR_BACKUP_RESULT_DIR"] = directory
            os.environ["MONITOR_BACKUP_MAX_AGE_HOURS"] = "24"
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "stale")
        self.assertIn("BACKUP_STALE", {item["code"] for item in alerts})

    def test_gis_stale_threshold(self):
        old_timestamp = (
            datetime.now(timezone.utc) - timedelta(days=40)
        ).isoformat().replace("+00:00", "Z")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for component in MONITOR.COMPONENTS:
                component_root = root / component
                component_root.mkdir()
                (component_root / "artifact.bin").write_bytes(b"fixture")
                (component_root / "manifest.json").write_text(
                    json.dumps(
                        {
                            "schemaVersion": 1,
                            "component": component,
                            "datasetVersion": f"fixture-{component}-v1",
                            "sourceUrl": f"file:///fixture/{component}",
                            "sha256": "a" * 64,
                            "preparedAt": old_timestamp,
                            "artifactPaths": ["artifact.bin"],
                            "identity": {"fingerprint": "f" * 64},
                        }
                    ),
                    encoding="utf-8",
                )
            os.environ["MONITOR_MAP_DATA_DIR"] = directory
            os.environ["MONITOR_GIS_MAX_AGE_DAYS"] = "31"
            alerts = []

            result = MONITOR.collect_gis_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["components"]["photon"]["status"], "stale")
        self.assertEqual(
            len(
                [
                    item
                    for item in alerts
                    if item["code"] == "GIS_DATASET_STALE"
                ]
            ),
            3,
        )

    def test_container_oom_unhealthy_and_restart_alerts(self):
        alerts = []
        with patch.object(
            MONITOR,
            "compose_container_id",
            side_effect=lambda service: f"id-{service}",
        ), patch.object(
            MONITOR,
            "inspect_container",
            return_value={
                "State": {
                    "Status": "running",
                    "Health": {"Status": "unhealthy"},
                    "OOMKilled": True,
                },
                "RestartCount": 4,
            },
        ):
            MONITOR.collect_containers(alerts)

        codes = {item["code"] for item in alerts}
        self.assertIn("CONTAINER_UNHEALTHY", codes)
        self.assertIn("CONTAINER_OOM_KILLED", codes)
        self.assertIn("CONTAINER_RESTARTS", codes)

    def test_memory_threshold_and_webhook_failure_are_visible(self):
        alerts = []
        stats_payload = json.dumps(
            {
                "Name": "backend",
                "CPUPerc": "90.00%",
                "MemUsage": "950MiB / 1GiB",
                "MemPerc": "96.00%",
            }
        )
        with patch.object(MONITOR, "run_command", return_value=stats_payload):
            MONITOR.collect_stats(["backend-id"], alerts, MONITOR.thresholds())
        self.assertIn("CONTAINER_MEMORY_CRITICAL", {item["code"] for item in alerts})

        os.environ["MONITOR_ALERT_WEBHOOK_URL"] = "https://example.invalid/hook"
        with patch.object(MONITOR, "urlopen", side_effect=URLError("fixture")):
            result = MONITOR.send_webhook(
                {"status": "critical", "checkedAt": "fixture"},
                alerts,
                MONITOR.thresholds(),
            )
        self.assertEqual(result, "failed")
        self.assertIn("ALERT_WEBHOOK_FAILED", {item["code"] for item in alerts})


if __name__ == "__main__":
    unittest.main()
