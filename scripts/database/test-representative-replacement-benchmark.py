#!/usr/bin/env python3
"""Contracts, not runtime or representative-volume proof."""
import importlib.util
import json
import io
import tempfile
import unittest
import zipfile
from argparse import Namespace
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "benchmark", Path(__file__).with_name("representative-replacement-benchmark.py"))
B = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(B)


def profile():
    return {
        "company_slug": "company-a", "volume_source": {"kind": "operational-measurement",
            "measured_at": "2026-10-01T00:00:00Z", "evidence_ref": "measurement-123"},
        "postgres_size_bytes": 100000, "postgres_row_counts": {name: 10 for name in B.TABLES},
        "object_count": 10, "object_storage_total_bytes": 10000, "largest_object_bytes": 1000,
        "object_size_distribution": [{"max_bytes": 1000, "count": 10, "total_bytes": 10000}],
        "expected_image_digests": {"backend": "ghcr.io/test/backend@sha256:" + "abcdef01" * 8,
                                   "frontend": "ghcr.io/test/frontend@sha256:" + "abcdef02" * 8},
        "target_rto_minutes": 60,
    }


class Contracts(unittest.TestCase):
    def test_unique_target_names_fit_s3_limit_for_long_company_slug(self):
        with patch.object(B.secrets, "randbelow", return_value=9999999):
            project, database, bucket, unique = B.target_identity("c" * 24)
        self.assertLessEqual(len(bucket), 63)
        self.assertTrue(project.endswith("-replacement"))
        self.assertTrue(database.endswith("_replacement"))
        self.assertEqual(unique, "9999999")

    def test_failed_release_preserves_independent_sanitized_evidence_without_provisioning(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "evidence"
            args = Namespace(evidence_dir=str(destination), audited_sha="a" * 40, company="company-a", check=True)
            with patch.object(B, "approved_release", side_effect=B.Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE")), \
                    patch.object(B, "run", return_value="a" * 40) as runner:
                self.assertEqual(B.benchmark(args), 1)
            self.assertEqual(runner.call_count, 1)  # Git identity only, no Docker/provisioning.
            for name in ("benchmark.json", "replacement-benchmark-company-a.json", "smoke.json",
                         "cleanup.json", "release-digests.json", "volume-profile.json"):
                self.assertTrue((destination / name).is_file(), name)
            result = B.read(destination / "benchmark.json")
            self.assertEqual(result["company"], "company-a")
            self.assertEqual(result["status"], "BLOCKED")
            self.assertIsNone(result["rto_seconds"])
            self.assertFalse(result["traffic_cutover_performed"])
            self.assertEqual(B.read(destination / "cleanup.json")["status"], "not_run")
            self.assertEqual(B.read(destination / "smoke.json")["status"], "not_run")

    def test_approved_release_uses_exact_successful_sha_and_github_artifact(self):
        sha = "a" * 40
        manifest = {"commit": sha, "tag": "sha-" + sha,
                    "images": {k: B.NAMESPACE + "/" + k + "@sha256:" + "abcdef01" * 8
                               for k in ("backend", "frontend", "tileserver")}}
        def artifact():
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                archive.writestr("release-digests.json", json.dumps(manifest))
            return buffer.getvalue()
        responses = [{"workflow_runs": [{"id": 42, "head_sha": sha, "head_branch": "main", "conclusion": "success"}]},
                     {"workflow_runs": [{"head_sha": sha, "conclusion": "success"}]},
                     {"artifacts": [{"id": 43, "name": "release-digests-" + sha, "expired": False}]}, artifact()]
        with patch.object(B, "github", side_effect=responses) as api:
            r = B.approved_release(sha)
        self.assertEqual(r["commit"], sha)
        self.assertEqual(r["release_run_id"], 42)
        self.assertEqual(r["images"]["backend"], manifest["images"]["backend"])
        self.assertIn("/actions/artifacts/43/zip", api.call_args.args[0])
        manifest["commit"] = "b" * 40
        with patch.object(B, "github", side_effect=[*responses[:3], artifact()]):
            with self.assertRaises(B.Blocked): B.approved_release(sha)

    def test_synthetic_descriptors_refuse_production_sources_or_other_company(self):
        d = {"company_slug": "company-a", "data_classification": "synthetic",
             "source_database": "company_a_benchmark_source", "source_bucket": "mte-benchmark-source-company-a-123",
             "recovery_set_key": "recovery-sets/company-a/2026-10-01T00-00-00Z-1-2.manifest.json",
             "schema_state_sha256": "a" * 64, "smoke_fixture": {"product_id": "fixture-product", "product_sku": "FIXTURE-SKU", "branding_sha256": "b" * 64}}
        self.assertEqual(B.validate_dataset(d, "company-a"), d)
        for k, v in [("company_slug", "company-b"), ("data_classification", "production"),
                     ("source_database", "production"), ("source_bucket", "production-bucket")]:
            with self.subTest(key=k), self.assertRaises(B.Blocked): B.validate_dataset({**d, k: v}, "company-a")

    def test_external_host_receipt_requires_clock_before_provisioning(self):
        incident = "2026-10-01T00:00:00Z"
        h = {"kind": "disposable-host", "role": "disposable-benchmark", "status": "passed",
             "host_ref": "disposable-host-123", "original_host_ref": "source-host-123",
             "incident_declared_at": incident, "provisioning_started_at": "2026-10-01T00:00:01Z",
             "infrastructure_ready_at": "2026-10-01T00:10:00Z", "evidence_ref": "provider-evidence-123"}
        with patch.object(B, "read", return_value=h):
            self.assertEqual(B.host_provisioning("receipt", incident, "source-host-123"), h)
        for k, v in [("provisioning_started_at", "2026-09-30T23:59:59Z"), ("host_ref", "source-host-123"),
                     ("kind", "existing-ci-host"), ("status", "not_run")]:
            with self.subTest(key=k), patch.object(B, "read", return_value={**h, k: v}):
                with self.assertRaises(B.Blocked): B.host_provisioning("receipt", incident, "source-host-123")
        self.assertIsNone(B.host_provisioning(None, incident, "source-host-123"))

    def test_existing_evidence_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            marker = Path(d) / "benchmark.json"; marker.write_text("original")
            args = Namespace(evidence_dir=d, audited_sha="a" * 40, company="company-a")
            with self.assertRaises(FileExistsError): B.benchmark(args)
            self.assertEqual(marker.read_text(), "original")

    def test_python_optimization_does_not_disable_safety_guards(self):
        self.assertNotIn("assert ", Path(B.__file__).read_text())
        with self.assertRaises(B.Blocked): B.require(False)

    def test_real_traffic_boundary_rejects_public_ports_and_external_network(self):
        context = {"compose": ["docker", "compose"], "project": "project"}
        with patch.object(B, "run", return_value=json.dumps({"services": {"backend": {"ports": [4000]}}})):
            with self.assertRaises(B.Blocked): B.traffic_closed(context)
        with patch.object(B, "run", side_effect=[json.dumps({"services": {"backend": {}}}), json.dumps([{"Internal": False}])]):
            with self.assertRaises(B.Blocked): B.traffic_closed(context)

    def test_smoke_failure_still_writes_smoke_artifact(self):
        with tempfile.TemporaryDirectory() as d:
            context = {"company": "company-a", "compose": ["docker", "compose"], "evidence": d}
            with patch.object(B, "run", side_effect=B.Blocked("COMMAND_FAILED")):
                with self.assertRaises(B.Blocked): B.application_smoke(context)
            smoke = B.read(Path(d) / "smoke.json")
            self.assertEqual(smoke["status"], "failed")
            self.assertEqual(smoke["checks"], {})

    def test_workflow_is_manual_explicit_sha_and_always_uploads(self):
        workflow = (B.ROOT / ".github/workflows/representative-replacement-benchmark.yml").read_text()
        self.assertIn("workflow_dispatch:", workflow)
        self.assertNotIn("workflow_run:", workflow)
        self.assertNotIn("push:", workflow)
        self.assertIn("ref: ${{ inputs.audited_sha }}", workflow)
        self.assertIn("if: always()", workflow)
        self.assertIn("HOST_PROVISIONING", Path(B.__file__).read_text())

    def test_missing_profile_is_not_representative(self):
        with self.assertRaisesRegex(B.Blocked, "REPRESENTATIVE_VOLUME_NOT_AVAILABLE"):
            B.validate_profile({}, "company-a")

    def test_volume_requires_operational_source_and_company(self):
        for key, value in [("company_slug", "company-b"), ("volume_source", {"kind": "invented"}),
                           ("postgres_row_counts", {}), ("largest_object_bytes", 0),
                           ("object_size_distribution", [])]:
            p = profile(); p[key] = value
            with self.subTest(key=key), self.assertRaises(B.Blocked):
                B.validate_profile(p, "company-a")

    def test_rto_target_cannot_be_relaxed(self):
        p = profile(); p["target_rto_minutes"] = 120
        with self.assertRaises(B.Blocked): B.validate_profile(p, "company-a")

    def test_distribution_must_reconcile(self):
        p = profile(); p["object_size_distribution"][0]["count"] = 2
        with self.assertRaises(B.Blocked): B.validate_profile(p, "company-a")

    def test_no_secrets_in_descriptor(self):
        p = profile(); p["password"] = "sensitive"
        with self.assertRaises(B.Blocked): B.validate_profile(p, "company-a")

    def test_fictitious_digests_are_rejected(self):
        for ref in ["example.invalid/backend@sha256:" + "a" * 64,
                    "ghcr.io/test/backend:main", "sha256:" + "1" * 64,
                    "ghcr.io/test/backend@sha256:" + "0" * 64]:
            with self.subTest(ref=ref), self.assertRaises(B.Blocked): B.image_ref(ref)

    def test_digest_syntax_is_not_approval(self):
        with patch.object(B, "github", return_value={"conclusion": "failure", "head_sha": "a" * 40}):
            with self.assertRaisesRegex(B.Blocked, "APPROVED_RELEASE_IMAGES_UNAVAILABLE"):
                B.approved_release("a" * 40)

    def test_volume_matches_every_dimension_not_only_bytes(self):
        p = profile()
        observed = {"postgres_size_bytes": 100000, "postgres_row_counts": p["postgres_row_counts"],
                    "object_count": 10, "object_storage_total_bytes": 10000,
                    "largest_object_bytes": 1000, "object_size_distribution": p["object_size_distribution"]}
        self.assertTrue(B.representative(p, observed))
        observed["postgres_row_counts"] = {**p["postgres_row_counts"], "Sale": 1}
        self.assertFalse(B.representative(p, observed))

    def test_rpo_uses_write_barrier_and_refuses_old_or_future_points(self):
        self.assertEqual(B.rpo("2026-10-01T01:00:00Z", "2026-10-01T00:45:00Z"), 900)
        for barrier in ["2026-09-29T00:00:00Z", "2026-10-02T00:00:00Z"]:
            with self.assertRaises(B.Blocked): B.rpo("2026-10-01T01:00:00Z", barrier)

    def test_pass_requires_real_application_smoke_and_all_restore_stages(self):
        result = {key: "passed" for key in B.RESTORE_CHECKS}
        result.update(status="READY_FOR_CUTOVER", traffic_cutover_performed=False)
        smoke = {key: True for key in B.SMOKE_CHECKS}
        self.assertEqual(B.outcome(result, smoke, True, 3500), "PASSED_RTO_OBJECTIVE")
        self.assertEqual(B.outcome(result, smoke, True, 3601), "EXCEEDED_RTO_OBJECTIVE")
        self.assertEqual(B.outcome(result, smoke, False, 20), "NOT_REPRESENTATIVE")
        for check in B.SMOKE_CHECKS:
            with self.subTest(check=check):
                self.assertEqual(B.outcome(result, {**smoke, check: False}, True, 20), "BLOCKED")
        for check in B.RESTORE_CHECKS:
            with self.subTest(check=check):
                self.assertEqual(B.outcome({**result, check: "not_run"}, smoke, True, 20), "BLOCKED")
        result["traffic_cutover_performed"] = True
        self.assertEqual(B.outcome(result, smoke, True, 20), "BLOCKED")

    def test_cleanup_is_independent_and_verifies_containers_networks_volumes(self):
        calls = []
        def runner(args, **kwargs):
            calls.append(args); return ""
        with patch.object(B, "run", side_effect=runner):
            c = B.cleanup(["docker", "compose"], "dr20261001000000123-replacement", True)
        self.assertEqual(c["status"], "passed")
        self.assertEqual(c["database_bucket_policy"], "ephemeral-container-filesystems-removed")
        self.assertTrue(any("--volumes" in x for x in calls))
        self.assertTrue(any(x[1:3] == ["network", "ls"] for x in calls))
        self.assertTrue(any(x[1:3] == ["volume", "ls"] for x in calls))
        with patch.object(B, "run", side_effect=B.Blocked("DOCKER_UNAVAILABLE")):
            self.assertEqual(B.cleanup(["docker", "compose"], "dr20261001000000123-replacement", True)["status"], "failed")

    def test_collision_never_grants_cleanup_ownership(self):
        with patch.object(B, "run", return_value="existing-container"):
            with self.assertRaisesRegex(B.Blocked, "TARGET_COLLISION"): B.assert_absent("docker", "project")
        with patch.object(B, "run") as runner:
            self.assertEqual(B.cleanup(["docker", "compose"], "project", False)["status"], "not_run")
            runner.assert_not_called()

    def test_private_compose_has_no_ingress_or_production_mounts(self):
        images = {name: "ghcr.io/test/" + name + "@sha256:" + "abcdef01" * 8
                  for name in ["backend", "frontend", "tileserver", "postgres", "storage", "aws"]}
        c = B.compose_config(images, "test_replacement", "mte-replacement-test-20261001000000-123", "/tmp/maps", "/tmp/work")
        self.assertTrue(c["networks"]["app_network"]["internal"])
        self.assertTrue(c["services"]["backend"]["environment"]["DATABASE_URL"].endswith("?sslmode=disable"))
        self.assertEqual(c["services"]["backend"]["environment"]["DATABASE_SSL"], "false")
        self.assertEqual(c["services"]["frontend"]["depends_on"], ["backend", "tileserver"])
        for service in c["services"].values():
            self.assertNotIn("ports", service)
            self.assertNotIn("container_name", service)
            self.assertNotIn("network_mode", service)
            self.assertNotIn("build", service)

    def test_rto_starts_before_pull_provision_and_ends_at_ready_not_cleanup(self):
        source = Path(B.__file__).read_text()
        start = source.index('timeline["incident_declared_at"] =')
        provisioning = source.index('timeline["replacement_provisioning_started_at"] =')
        pull = source.index('"pull", "postgres"')
        restore = source.index('timeline["restore_started_at"] =')
        ready = source.index('timeline["ready_for_cutover_at"] =')
        self.assertLess(start, provisioning); self.assertLess(provisioning, pull)
        self.assertLess(pull, restore); self.assertLess(restore, ready)
        self.assertIn('seconds(timeline["ready_for_cutover_at"], timeline["incident_declared_at"])', source)

    def test_template_explicitly_unavailable(self):
        p = json.loads(Path(B.__file__).with_name("replacement-volume-profile.template.json").read_text())
        with self.assertRaisesRegex(B.Blocked, "REPRESENTATIVE_VOLUME_NOT_AVAILABLE"):
            B.validate_profile(p, p["company_slug"])


if __name__ == "__main__": unittest.main()
