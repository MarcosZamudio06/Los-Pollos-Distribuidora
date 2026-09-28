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
REPOSITORY_ROOT = SCRIPT.parents[2]
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

    @staticmethod
    def valid_recovery_result(company, finished_at, write_barrier_at=None):
        finished = datetime.fromtimestamp(finished_at, timezone.utc)
        barrier = (
            datetime.fromtimestamp(write_barrier_at, timezone.utc)
            if write_barrier_at is not None
            else finished - timedelta(minutes=19)
        )
        started = min(finished - timedelta(minutes=20), barrier - timedelta(minutes=1))
        capture_finished = finished - timedelta(minutes=1)
        recovery_key = (
            f"recovery-sets/{company}/2026-09-27T12-00-00Z-100-200.manifest.json"
        )
        return {
            "status": "validated",
            "company_slug": company,
            "started_at": started.isoformat().replace("+00:00", "Z"),
            "finished_at": finished.isoformat().replace("+00:00", "Z"),
            "cleanup_stage": "not-required",
            "retention": {"status": "applied"},
            "components": {"postgresql": "validated", "object_storage": "validated"},
            "backend_state_before": "running",
            "backend_restoration": "restored",
            "recovery_point": {
                "method": "backend-quiesce",
                "write_barrier_at": barrier.isoformat().replace("+00:00", "Z"),
                "capture_started_at": barrier.isoformat().replace("+00:00", "Z"),
                "capture_finished_at": capture_finished.isoformat().replace("+00:00", "Z"),
                "write_barrier_released_at": finished.isoformat().replace("+00:00", "Z"),
            },
            "recovery_set_key": recovery_key,
            "recovery_set_checksum_key": recovery_key + ".sha256",
            "postgresql": {
                "key": f"postgres/{company}/2026/09/2026-09-27T12-00-00Z-100-200.dump",
                "size_bytes": 2048,
                "sha256": "a" * 64,
                "manifest_sha256": "b" * 64,
            },
            "object_storage": {
                "key": f"object-storage/{company}/2026-09-27T12-00-00Z-100-200.tar.gz",
                "size_bytes": 4096,
                "sha256": "c" * 64,
                "manifest_sha256": "d" * 64,
            },
        }

    @staticmethod
    def valid_restore_result(company, created_at):
        restore_timestamp = datetime.fromtimestamp(created_at, timezone.utc).strftime(
            "%Y-%m-%dT%H-%M-%SZ"
        )
        return {
            "status": "passed",
            "company_slug": company,
            "recovery_set_key": f"recovery-sets/{company}/set.manifest.json",
            "restore_database": f"{company}_restore_drill",
            "restore_object_storage_bucket": f"mte-restore-{company}-fixture",
            "created_at": restore_timestamp,
            "disposable_targets_cleanup": "cleaned",
            "checks": {
                name: {"status": "passed"}
                for name in (
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
            },
        }

    @staticmethod
    def configure_single_company(root, company="company-north"):
        os.environ["COMPANY_SLUG"] = company
        os.environ["MONITOR_RECOVERY_SET_MODE"] = "single-company"
        os.environ["MONITOR_RECOVERY_SET_RESULT_ROOT"] = str(root)
        os.environ.pop("MONITOR_TENANT_MANIFEST_PATH", None)
        os.environ.pop("MONITOR_LOCAL_DEPLOYMENT_HOST_REF", None)
        os.environ.pop("MONITOR_BACKUP_LOCAL_PATH", None)

    @staticmethod
    def write_recovery_result(root, company, payload, filename="recovery.json"):
        directory = root / "postgres-backups" / "results" / "company-recovery"
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / filename
        path.write_text(json.dumps(payload), encoding="utf-8")
        return path

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
            root = Path(directory)
            manifest = root / "companies.json"
            manifest.write_text(
                json.dumps(
                    {
                        "companies": [
                            {
                                "slug": "company-north",
                                "environment": "production",
                                "status": "active",
                                "deploymentHostRef": "host://production/company-north",
                            }
                        ]
                    }
                ),
                encoding="utf-8",
            )
            result_directory = root / "company-north" / "postgres-backups" / "company-recovery"
            result_directory.mkdir(parents=True)
            Path(result_directory, "old.json").write_text(
                json.dumps(
                    self.valid_recovery_result(
                        "company-north",
                        datetime.fromisoformat(old_timestamp.replace("Z", "+00:00")).timestamp(),
                    )
                ),
                encoding="utf-8",
            )
            os.environ["MONITOR_RECOVERY_SET_MODE"] = "multi-company"
            os.environ["MONITOR_RECOVERY_SET_RESULT_ROOT"] = directory
            os.environ["MONITOR_TENANT_MANIFEST_PATH"] = str(manifest)
            os.environ["MONITOR_LOCAL_DEPLOYMENT_HOST_REF"] = "host://production/company-north"
            os.environ["BACKUP_RPO_HOURS"] = "24"
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "stale")
        self.assertIn("BACKUP_STALE", {item["code"] for item in alerts})
        self.assertEqual(result["companies"]["company-north"]["status"], "stale")

    def test_healthy_recovery_set_requires_and_reports_both_verified_components(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_single_company(root)
            self.write_recovery_result(
                root, "company-north", self.valid_recovery_result("company-north", now)
            )
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "fresh")
        self.assertEqual(result["companies"]["company-north"]["components"]["postgresql"], "validated")
        self.assertEqual(result["companies"]["company-north"]["components"]["objectStorage"], "validated")
        self.assertEqual(result["companies"]["company-north"]["checksumsAndManifests"], "passed")
        self.assertEqual(result["companies"]["company-north"]["cleanupStatus"], "passed")
        self.assertEqual(alerts, [])

    def test_backup_warns_before_rpo_and_becomes_critical_at_boundary(self):
        now = datetime.now(timezone.utc).timestamp()
        os.environ["BACKUP_RPO_HOURS"] = "24"
        os.environ["MONITOR_BACKUP_RPO_WARNING_LEAD_HOURS"] = "3"
        for age_hours, expected_status, expected_code in (
            (21, "at-risk", "BACKUP_RPO_WARNING"),
            (24, "stale", "BACKUP_STALE"),
        ):
            with self.subTest(age_hours=age_hours), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.configure_single_company(root)
                self.write_recovery_result(
                    root,
                    "company-north",
                    self.valid_recovery_result(
                        "company-north",
                        now - age_hours * 3600 + 8 * 3600,
                        write_barrier_at=now - age_hours * 3600,
                    ),
                )
                alerts = []
                with patch.object(MONITOR.time, "time", return_value=now):
                    result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

            self.assertEqual(result["status"], expected_status)
            self.assertIn(expected_code, {item["code"] for item in alerts})
            recovery_company = result["companies"]["company-north"]
            expected_recovery_point = datetime.fromtimestamp(
                now - age_hours * 3600, timezone.utc
            ).isoformat().replace("+00:00", "Z")
            self.assertEqual(recovery_company["recoveryPointAt"], expected_recovery_point)
            self.assertEqual(recovery_company["recoveryPointAgeHours"], age_hours)

    def test_backup_warning_respects_schedule_envelope_when_rpo_is_tight(self):
        now = datetime.now(timezone.utc).timestamp()
        os.environ["BACKUP_RPO_HOURS"] = "21"
        os.environ["MONITOR_BACKUP_RPO_WARNING_LEAD_HOURS"] = "3"
        os.environ["MONITOR_BACKUP_SCHEDULE_MAX_AGE_MINUTES"] = "1231"
        for age_minutes, expected_status in ((1230, "fresh"), (1231, "at-risk")):
            with self.subTest(age_minutes=age_minutes), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                self.configure_single_company(root)
                self.write_recovery_result(
                    root,
                    "company-north",
                    self.valid_recovery_result(
                        "company-north",
                        now - age_minutes * 60 + 8 * 3600,
                        write_barrier_at=now - age_minutes * 60,
                    ),
                )
                alerts = []
                with patch.object(MONITOR.time, "time", return_value=now):
                    result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

            self.assertEqual(result["status"], expected_status)
            self.assertEqual(
                result["companies"]["company-north"]["recoveryPointAgeHours"],
                round(age_minutes / 60, 2),
            )

    def test_corrupted_latest_recovery_result_is_not_hidden_by_older_valid_set(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_single_company(root)
            self.write_recovery_result(
                root,
                "company-north",
                self.valid_recovery_result("company-north", now - 3600),
                "older.json",
            )
            latest = self.write_recovery_result(root, "company-north", {}, "latest.json")
            latest.write_text("{not-json", encoding="utf-8")
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["companies"]["company-north"]["status"], "corrupt")
        self.assertIn("BACKUP_RESULT_CORRUPTED", {item["code"] for item in alerts})

    def test_partial_recovery_set_is_critical_even_if_top_level_says_validated(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_single_company(root)
            partial = self.valid_recovery_result("company-north", now)
            partial["components"]["object_storage"] = "failed"
            self.write_recovery_result(root, "company-north", partial)
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["companies"]["company-north"]["status"], "partial")
        self.assertIn("BACKUP_RECOVERY_SET_PARTIAL", {item["code"] for item in alerts})

    def test_failed_backup_that_did_not_restore_backend_state_is_critical(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_single_company(root)
            failed = self.valid_recovery_result("company-north", now)
            failed.update(
                {
                    "status": "failed",
                    "cleanup_stage": "resume-backend",
                    "backend_restoration": "failed",
                    "failure_stage": "resume-backend",
                    "retention": {"status": "not-started"},
                }
            )
            self.write_recovery_result(root, "company-north", failed)
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["companies"]["company-north"]["cleanupStatus"], "failed")
        self.assertIn("BACKUP_CLEANUP_FAILED", {item["code"] for item in alerts})

    def test_corrupt_component_checksum_is_not_accepted_as_validated_recovery_evidence(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_single_company(root)
            payload = self.valid_recovery_result("company-north", now)
            payload["object_storage"]["sha256"] = "not-a-sha256"
            self.write_recovery_result(root, "company-north", payload)
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["companies"]["company-north"]["status"], "corrupt")
        self.assertIn("BACKUP_RESULT_CORRUPTED", {item["code"] for item in alerts})

    def test_failed_restore_drill_and_failed_cleanup_are_critical(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            result_directory = Path(directory)
            self.configure_single_company(result_directory)
            os.environ["MONITOR_RESTORE_RESULT_DIR"] = str(result_directory)
            failed = self.valid_restore_result("company-north", now)
            failed["status"] = "failed"
            failed["disposable_targets_cleanup"] = "failed"
            failed["checks"]["object_storage_restore"]["status"] = "failed"
            (result_directory / "latest.json").write_text(json.dumps(failed), encoding="utf-8")
            alerts = []

            result = MONITOR.collect_restore_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["cleanupStatus"], "failed")
        self.assertIn("RESTORE_DRILL_FAILED", {item["code"] for item in alerts})

    def test_restore_drill_is_healthy_only_when_checksum_manifest_and_reference_checks_pass(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            result_directory = Path(directory)
            self.configure_single_company(result_directory)
            os.environ["MONITOR_RESTORE_RESULT_DIR"] = str(result_directory)
            payload = self.valid_restore_result("company-north", now)
            (result_directory / "complete.json").write_text(json.dumps(payload), encoding="utf-8")
            alerts = []

            result = MONITOR.collect_restore_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["checksumsAndManifests"], "passed")
        self.assertEqual(result["storageReferenceIntegrity"], "passed")
        self.assertEqual(result["cleanupStatus"], "cleaned")
        self.assertEqual(alerts, [])

    def test_missing_restore_drill_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            result_directory = Path(directory)
            self.configure_single_company(result_directory)
            os.environ["MONITOR_RESTORE_RESULT_DIR"] = str(result_directory)
            alerts = []

            result = MONITOR.collect_restore_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "missing")
        self.assertIn("RESTORE_DRILL_MISSING", {item["code"] for item in alerts})

    def test_old_complete_restore_drill_is_stale(self):
        old = (datetime.now(timezone.utc) - timedelta(days=40)).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            result_directory = Path(directory)
            self.configure_single_company(result_directory)
            os.environ["MONITOR_RESTORE_RESULT_DIR"] = str(result_directory)
            (result_directory / "old.json").write_text(
                json.dumps(self.valid_restore_result("company-north", old)),
                encoding="utf-8",
            )
            alerts = []

            result = MONITOR.collect_restore_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "stale")
        self.assertIn("RESTORE_DRILL_STALE", {item["code"] for item in alerts})

    def test_corrupted_latest_restore_result_is_not_hidden_by_older_pass(self):
        old = datetime.now(timezone.utc).timestamp() - 3600
        with tempfile.TemporaryDirectory() as directory:
            result_directory = Path(directory)
            self.configure_single_company(result_directory)
            os.environ["MONITOR_RESTORE_RESULT_DIR"] = str(result_directory)
            (result_directory / "older.json").write_text(
                json.dumps(self.valid_restore_result("company-north", old)),
                encoding="utf-8",
            )
            (result_directory / "latest.json").write_text("{bad-json", encoding="utf-8")
            alerts = []

            result = MONITOR.collect_restore_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "corrupt")
        self.assertIn("RESTORE_DRILL_RESULT_CORRUPTED", {item["code"] for item in alerts})

    def test_restore_drill_with_unrun_storage_reference_check_is_not_complete(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            result_directory = Path(directory)
            self.configure_single_company(result_directory)
            os.environ["MONITOR_RESTORE_RESULT_DIR"] = str(result_directory)
            payload = self.valid_restore_result("company-north", now)
            payload["checks"]["storage_reference_integrity"]["status"] = "not_run"
            (result_directory / "latest.json").write_text(json.dumps(payload), encoding="utf-8")
            alerts = []

            result = MONITOR.collect_restore_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "failed")
        self.assertIn("RESTORE_DRILL_FAILED", {item["code"] for item in alerts})

    def test_multi_company_restore_monitor_reads_only_the_host_local_tenant(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "companies.json"
            manifest.write_text(
                json.dumps(
                    {
                        "companies": [
                            {
                                "slug": "company-north",
                                "environment": "production",
                                "status": "active",
                                "deploymentHostRef": "host://production/company-north",
                            },
                            {
                                "slug": "company-south",
                                "environment": "production",
                                "status": "active",
                                "deploymentHostRef": "host://production/company-south",
                            },
                        ]
                    }
                ),
                encoding="utf-8",
            )
            for company in ("company-north", "company-south"):
                result_directory = (
                    root / company / "postgres-backups" / "restore-drills"
                )
                result_directory.mkdir(parents=True)
                payload = self.valid_restore_result(company, now)
                if company == "company-south":
                    payload["status"] = "failed"
                (result_directory / "latest.json").write_text(
                    json.dumps(payload), encoding="utf-8"
                )
            os.environ["MONITOR_RECOVERY_SET_MODE"] = "multi-company"
            os.environ["MONITOR_RECOVERY_SET_RESULT_ROOT"] = str(root)
            os.environ["MONITOR_TENANT_MANIFEST_PATH"] = str(manifest)
            os.environ["MONITOR_LOCAL_DEPLOYMENT_HOST_REF"] = "host://production/company-north"
            os.environ.pop("MONITOR_RESTORE_RESULT_DIR", None)
            alerts = []

            result = MONITOR.collect_restore_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "passed")
        self.assertEqual(list(result["companies"]), ["company-north"])
        self.assertNotIn("RESTORE_DRILL_FAILED", {item["code"] for item in alerts})

    def test_accumulated_failed_backup_artifacts_are_reported_without_paths(self):
        now = datetime.now(timezone.utc).timestamp()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_single_company(root)
            self.write_recovery_result(
                root, "company-north", self.valid_recovery_result("company-north", now)
            )
            backup_directory = root / "postgres-backups"
            postgres_failures = backup_directory / "failed"
            object_failures = backup_directory / "object-storage" / "failed"
            postgres_failures.mkdir(parents=True)
            object_failures.mkdir(parents=True)
            for index in range(3):
                (postgres_failures / f"{index}.dump.failed").write_bytes(b"fixture")
                (object_failures / f"{index}.failure.json").write_text("{}", encoding="utf-8")
            os.environ["BACKUP_FAILED_KEEP_COUNT"] = "1"
            alerts = []

            result = MONITOR.collect_backup_local_state(alerts)

        self.assertEqual(result["status"], "warning")
        self.assertGreater(result["failedArtifacts"], 1)
        self.assertIn("BACKUP_FAILED_ARTIFACTS_ACCUMULATING", {item["code"] for item in alerts})
        self.assertNotIn(directory, json.dumps(alerts))

    def test_monitor_timer_uses_persistent_calendar_cadence(self):
        timer = (
            REPOSITORY_ROOT
            / "docs/runbooks/systemd/pollos-distribuidor-monitor.timer"
        ).read_text(encoding="utf-8")
        self.assertIn("OnCalendar=*-*-* *:00/5:00 UTC", timer)
        self.assertIn("OnBootSec=2min", timer)
        self.assertIn("Persistent=true", timer)
        self.assertNotIn("OnUnitActiveSec=", timer)

    def test_webhook_alerts_redact_urls_and_credential_assignments(self):
        os.environ["MONITOR_ALERT_WEBHOOK_URL"] = "https://hooks.example.invalid/private"
        alerts = [
            {
                "severity": "warning",
                "code": "TEST_ALERT",
                "message": "endpoint=https://private.example/api bucket=tenant-store token=abc123",
            }
        ]
        captured = {}

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        def capture(request, timeout):
            captured["body"] = json.loads(request.data.decode("utf-8"))
            captured["timeout"] = timeout
            return Response()

        with patch.object(MONITOR, "urlopen", side_effect=capture):
            result = MONITOR.send_webhook(
                {"status": "warning", "checkedAt": "fixture"},
                alerts,
                MONITOR.thresholds(),
            )
        serialized = json.dumps(captured["body"]["alerts"])

        self.assertEqual(result, "sent")
        self.assertNotIn("private.example", serialized)
        self.assertNotIn("tenant-store", serialized)
        self.assertNotIn("abc123", serialized)
        self.assertEqual(captured["body"]["alerts"][0]["code"], "TEST_ALERT")

    def test_local_backup_disk_below_minimum_is_critical(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.configure_single_company(root)
            backup_directory = root / "postgres-backups"
            backup_directory.mkdir()

            class Usage:
                total = 4_000_000_000
                used = 3_500_000_000
                free = 500_000_000

            alerts = []
            with patch.object(MONITOR.shutil, "disk_usage", return_value=Usage()):
                result = MONITOR.collect_backup_local_state(alerts)

        self.assertEqual(result["status"], "critical")
        self.assertEqual(result["freeBytes"], 500_000_000)
        self.assertIn("BACKUP_LOCAL_DISK_LOW", {item["code"] for item in alerts})

    def test_legacy_postgresql_only_result_is_not_complete_recovery_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            legacy_directory = Path(directory, "postgres-backups", "results")
            legacy_directory.mkdir(parents=True)
            Path(legacy_directory, "postgres-only.json").write_text(
                json.dumps(
                    {
                        "status": "validated",
                        "validated_at": datetime.now(timezone.utc)
                        .isoformat()
                        .replace("+00:00", "Z"),
                    }
                ),
                encoding="utf-8",
            )
            os.environ["COMPANY_SLUG"] = "company-north"
            os.environ["MONITOR_RECOVERY_SET_MODE"] = "single-company"
            os.environ["MONITOR_RECOVERY_SET_RESULT_ROOT"] = directory
            os.environ.pop("MONITOR_TENANT_MANIFEST_PATH", None)
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "missing")
        self.assertIn("BACKUP_MISSING", {item["code"] for item in alerts})

    def test_multi_company_monitor_requires_the_host_local_production_recovery_set(self):
        now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory, "companies.json")
            manifest.write_text(
                json.dumps(
                    {
                        "companies": [
                            {"slug": "company-north", "environment": "production", "status": "active", "deploymentHostRef": "host://production/company-north"},
                            {"slug": "company-south", "environment": "production", "status": "active", "deploymentHostRef": "host://production/company-south"},
                            {"slug": "company-test", "environment": "staging", "status": "active", "deploymentHostRef": "host://production/company-test"},
                        ]
                    }
                ),
                encoding="utf-8",
            )
            result_directory = (
                Path(directory)
                / "company-south"
                / "postgres-backups"
                / "company-recovery"
            )
            result_directory.mkdir(parents=True)
            Path(result_directory, "current.json").write_text(
                json.dumps(
                    {
                        "status": "validated",
                        "company_slug": "company-south",
                        "finished_at": now,
                        "components": {
                            "postgresql": "validated",
                            "object_storage": "validated",
                        },
                        "recovery_point": {"method": "backend-quiesce"},
                        "recovery_set_key": "recovery-sets/company-south/current.manifest.json",
                    }
                ),
                encoding="utf-8",
            )
            os.environ["MONITOR_RECOVERY_SET_MODE"] = "multi-company"
            os.environ["MONITOR_RECOVERY_SET_RESULT_ROOT"] = directory
            os.environ["MONITOR_TENANT_MANIFEST_PATH"] = str(manifest)
            os.environ["MONITOR_LOCAL_DEPLOYMENT_HOST_REF"] = "host://production/company-north"
            os.environ["BACKUP_RPO_HOURS"] = "24"
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "missing")
        self.assertEqual(result["companies"]["company-north"]["status"], "missing")
        self.assertNotIn("company-south", result["companies"])
        self.assertNotIn("company-test", result["companies"])
        self.assertIn("BACKUP_MISSING", {item["code"] for item in alerts})

    def test_latest_failed_recovery_attempt_is_not_hidden_by_an_older_success(self):
        recent = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        previous = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "companies.json").write_text(
                json.dumps(
                    {
                        "companies": [
                            {"slug": "company-north", "environment": "production", "status": "active", "deploymentHostRef": "host://production/company-north"}
                        ]
                    }
                ),
                encoding="utf-8",
            )
            result_directory = (
                Path(directory)
                / "company-north"
                / "postgres-backups"
                / "company-recovery"
            )
            result_directory.mkdir(parents=True)
            Path(result_directory, "previous.json").write_text(
                json.dumps(
                    {
                        "status": "validated",
                        "company_slug": "company-north",
                        "finished_at": previous,
                        "components": {"postgresql": "validated", "object_storage": "validated"},
                        "recovery_point": {"method": "backend-quiesce"},
                        "recovery_set_key": "recovery-sets/company-north/previous.manifest.json",
                    }
                ),
                encoding="utf-8",
            )
            Path(result_directory, "latest.json").write_text(
                json.dumps(
                    {
                        "status": "failed",
                        "company_slug": "company-north",
                        "finished_at": recent,
                        "components": {"postgresql": "validated", "object_storage": "failed"},
                        "failure_stage": "object-storage-backup",
                    }
                ),
                encoding="utf-8",
            )
            os.environ["MONITOR_RECOVERY_SET_MODE"] = "multi-company"
            os.environ["MONITOR_RECOVERY_SET_RESULT_ROOT"] = directory
            os.environ["MONITOR_TENANT_MANIFEST_PATH"] = str(Path(directory, "companies.json"))
            os.environ["MONITOR_LOCAL_DEPLOYMENT_HOST_REF"] = "host://production/company-north"
            os.environ["BACKUP_RPO_HOURS"] = "24"
            alerts = []

            result = MONITOR.collect_backup_state(alerts, MONITOR.thresholds())

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["companies"]["company-north"]["status"], "failed")
        self.assertIn("BACKUP_FAILED", {item["code"] for item in alerts})

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
