#!/usr/bin/env python3
"""Company-scoped, fail-closed synthetic replacement drill. Never performs cutover."""
import argparse
import datetime as dt
import hashlib
import io
import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import tempfile
import urllib.request
import urllib.parse
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts/database"
REPOSITORY = "MarcosZamudio06/Los-Pollos-Distribuidora"
NAMESPACE = "ghcr.io/marcoszamudio06/los-pollos-distribuidora"
TABLES = ("Product", "Customer", "Sale", "SaleItem", "InventoryMovement", "Payment",
          "CashMovement", "DeliveryEvidence", "Invoice", "FiscalArtifact")
RESTORE_CHECKS = ("postgres_restore_status", "object_storage_restore_status", "migration_schema_status",
                  "release_compatibility_status", "cross_reference_status", "health_smoke_status", "traffic_closed_status")
SMOKE_CHECKS = ("ready", "authentication", "restored_product", "business_read", "application_object_readback",
                "frontend_http", "frontend_api", "release_schema", "volume_measured", "deployed_images")
HELPERS = {
    "postgres": "postgis/postgis:16-3.5-alpine@sha256:becb8d49a20a2c1fcce1b154e853e1ea1a19cd5de99310852888b998694ec2ea",
    "storage": "chrislusf/seaweedfs:4.29@sha256:d47c7ee99fcb951351d7194915f4e3a5ea604a8e8871183d713907dec4fb9bf5",
    "aws": "amazon/aws-cli@sha256:cd11f6e909d42f066a03e15f072853fcc19f033e343cb83b2d553e2082cbb5a7",
}


class Blocked(RuntimeError):
    """Only opaque safe reason codes are emitted, never subprocess output."""


def require(condition):
    if not condition: raise Blocked("DESCRIPTOR_INVALID")


def utc(): return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def instant(value):
    try:
        result = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None: raise ValueError()
        return result
    except (ValueError, AttributeError, TypeError): raise Blocked("TIMESTAMP_INVALID") from None


def seconds(later, earlier):
    value = (instant(later) - instant(earlier)).total_seconds()
    if value < 0: raise Blocked("TIMELINE_INVALID")
    return round(value, 3)


def rpo(incident, barrier):
    value = seconds(incident, barrier)
    if value > 24 * 3600: raise Blocked("RECOVERY_POINT_OUTSIDE_RPO")
    return value


def write(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, sort_keys=True, indent=2); handle.write("\n")
    temporary.chmod(0o600)
    temporary.replace(path)


def read(path):
    try:
        if not path or Path(path).is_symlink(): raise ValueError()
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError): raise Blocked("DESCRIPTOR_UNAVAILABLE") from None


def image_ref(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-z0-9.-]+(?:/[a-z0-9._:-]+)+@sha256:[a-f0-9]{64}", value):
        raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE")
    host, digest = value.split("/", 1)[0], value.rsplit(":", 1)[1]
    if host.endswith((".invalid", ".test", ".example")) or "example" in host or len(set(digest)) < 4:
        raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE")
    return value


def opaque(value): return isinstance(value, str) and bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{2,127}", value))


def validate_profile(p, company):
    fields = {"company_slug", "volume_source", "postgres_size_bytes", "postgres_row_counts", "object_count",
              "object_storage_total_bytes", "largest_object_bytes", "object_size_distribution", "expected_image_digests", "target_rto_minutes"}
    try:
        require(isinstance(p, dict) and set(p) == fields and p["company_slug"] == company)
        require(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", company) and len(company) <= 24)
        source = p["volume_source"]
        require(set(source) == {"kind", "measured_at", "evidence_ref"})
        require(source["kind"] == "operational-measurement" and opaque(source["evidence_ref"]))
        require(instant(source["measured_at"]) <= instant(utc()))
        require(p["target_rto_minutes"] == 60)
        for field in ("postgres_size_bytes", "object_count", "object_storage_total_bytes", "largest_object_bytes"):
            require(type(p[field]) is int and p[field] > 0)
        require(p["largest_object_bytes"] <= p["object_storage_total_bytes"])
        require(set(p["postgres_row_counts"]) == set(TABLES))
        require(all(type(n) is int and n >= 0 for n in p["postgres_row_counts"].values()))
        require(all(p["postgres_row_counts"][name] > 0 for name in ("Product", "Sale", "DeliveryEvidence", "FiscalArtifact")))
        images = p["expected_image_digests"]
        require({"backend", "frontend"} <= set(images) <= {"backend", "frontend", "tileserver", *HELPERS})
        for ref in images.values(): image_ref(ref)
        distribution = p["object_size_distribution"]
        require(isinstance(distribution, list) and distribution and len(distribution) <= 20)
        prior = 0
        for band in distribution:
            require(set(band) == {"max_bytes", "count", "total_bytes"})
            require(all(type(n) is int and n >= 0 for n in band.values()))
            require(band["max_bytes"] > prior)
            require(band["count"] * prior <= band["total_bytes"] <= band["count"] * band["max_bytes"])
            prior = band["max_bytes"]
        require(prior >= p["largest_object_bytes"])
        require(sum(x["count"] for x in distribution) == p["object_count"])
        require(sum(x["total_bytes"] for x in distribution) == p["object_storage_total_bytes"])
    except (AssertionError, KeyError, TypeError, Blocked):
        raise Blocked("REPRESENTATIVE_VOLUME_NOT_AVAILABLE") from None
    return p


def representative(p, observed):
    # Fixed ±20% envelope; row counts and each size band are mandatory, not padded bytes alone.
    def close(expected, actual):
        return actual == 0 if expected == 0 else 0.8 * expected <= actual <= 1.2 * expected
    return (all(close(p[k], observed[k]) for k in ("postgres_size_bytes", "object_count", "object_storage_total_bytes", "largest_object_bytes"))
            and all(close(p["postgres_row_counts"][k], observed["postgres_row_counts"][k]) for k in TABLES)
            and len(p["object_size_distribution"]) == len(observed["object_size_distribution"])
            and all(a["max_bytes"] == b["max_bytes"] and close(a["count"], b["count"]) and close(a["total_bytes"], b["total_bytes"])
                    for a, b in zip(p["object_size_distribution"], observed["object_size_distribution"])))


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        if not newurl.startswith("https://"): raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE")
        result = super().redirect_request(request, fp, code, msg, headers, newurl)
        result.remove_header("Authorization")
        return result


def github(path, raw=False):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "replacement-benchmark"}
    if os.environ.get("GH_TOKEN"): headers["Authorization"] = "Bearer " + os.environ["GH_TOKEN"]
    request = urllib.request.Request("https://api.github.com/repos/" + REPOSITORY + path, headers=headers)
    try:
        with urllib.request.build_opener(SafeRedirect()).open(request, timeout=30) as response:
            data = response.read(4 * 1024 * 1024 + 1)
            if len(data) > 4 * 1024 * 1024: raise ValueError()
        return data if raw else json.loads(data)
    except Exception: raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE") from None


def approved_release(sha):
    runs = github("/actions/workflows/release-images.yml/runs?head_sha=" + sha + "&status=success&per_page=100")
    candidates = [r for r in runs.get("workflow_runs", []) if r.get("head_sha") == sha
                  and r.get("conclusion") == "success" and r.get("head_branch") == "main"]
    if not candidates: raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE")
    run_id = candidates[0]["id"]
    gates = github("/actions/workflows/quality-gate.yml/runs?head_sha=" + sha + "&status=success&per_page=100")
    if not any(r.get("head_sha") == sha and r.get("conclusion") == "success" for r in gates.get("workflow_runs", [])):
        raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE")
    artifacts = github(f"/actions/runs/{run_id}/artifacts?per_page=100")
    matches = [a for a in artifacts.get("artifacts", []) if a.get("name") == "release-digests-" + sha and not a.get("expired")]
    if len(matches) != 1: raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE")
    try:
        with zipfile.ZipFile(io.BytesIO(github(f'/actions/artifacts/{matches[0]["id"]}/zip', raw=True))) as archive:
            member = archive.getinfo("release-digests.json")
            if member.file_size > 65536: raise ValueError()
            release = json.loads(archive.read(member))
        if release["commit"] != sha or release["tag"] != "sha-" + sha: raise ValueError()
        images = {name: image_ref(release["images"][name]) for name in ("backend", "frontend", "tileserver")}
        if any(not ref.startswith(NAMESPACE + "/" + name + "@") for name, ref in images.items()): raise ValueError()
    except (KeyError, TypeError, ValueError, zipfile.BadZipFile): raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE") from None
    return {"commit": sha, "release_run_id": run_id, "images": {**images, **HELPERS}}


def run(args, *, env=None, data=None, timeout=3600):
    try:
        result = subprocess.run(args, input=data, capture_output=True, text=True, env=env, timeout=timeout, check=True)
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError): raise Blocked("COMMAND_FAILED") from None


def assert_absent(docker, project):
    for command in (["ps", "-aq"], ["network", "ls", "-q"], ["volume", "ls", "-q"]):
        if run([docker, *command, "--filter", "label=com.docker.compose.project=" + project]):
            raise Blocked("TARGET_COLLISION")


def target_identity(company):
    # Existing executor requires a 14-digit UTC timestamp and a decimal suffix.
    # Seven suffix digits keep even the maximum company slug within S3's 63 bytes.
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d%H%M%S")
    unique = str(secrets.randbelow(10**7))
    return ("dr" + stamp + unique + "-replacement", "benchmark_" + unique + "_replacement",
            "mte-replacement-" + company + "-" + stamp + "-" + unique, unique)


def cleanup(compose, project, owned):
    evidence = {"status": "not_run", "project": project, "targets_removed": None,
                "database_bucket_policy": "ephemeral-container-filesystems-removed"}
    if not owned: return evidence
    try:
        run([*compose, "down", "--volumes", "--remove-orphans"], timeout=180)
        assert_absent(compose[0], project)
        evidence.update(status="passed", targets_removed=True)
    except Blocked: evidence.update(status="failed", targets_removed=False)
    return evidence


def compose_config(images, database, bucket, maps, work):
    def service(image, **kw):
        return {"image": image, "platform": "linux/amd64", "networks": ["app_network"], **kw}
    health = lambda cmd: {"test": ["CMD-SHELL", cmd], "interval": "2s", "timeout": "2s", "retries": 60}
    app = {"NODE_ENV": "production", "PORT": "4000", "CFDI_ENABLED": "false", "FISCAL_PROVIDER": "NONE",
           "CORS_ORIGIN": "http://frontend:3000", "DATABASE_SSL": "false",
           "DATABASE_URL": f"postgresql://postgres:${{BENCHMARK_DB_PASSWORD}}@postgres:5432/{database}?sslmode=disable",
           "JWT_ACCESS_SECRET": "${BENCHMARK_ACCESS_SECRET}", "JWT_REFRESH_SECRET": "${BENCHMARK_REFRESH_SECRET}",
           "OBJECT_STORAGE_BUCKET": bucket, "OBJECT_STORAGE_REGION": "us-east-1",
           "OBJECT_STORAGE_ENDPOINT": "http://replacement-storage:8333", "OBJECT_STORAGE_PUBLIC_ENDPOINT": "http://replacement-storage:8333",
           "OBJECT_STORAGE_ACCESS_KEY_ID": "${BENCHMARK_S3_ACCESS}", "OBJECT_STORAGE_SECRET_ACCESS_KEY": "${BENCHMARK_S3_SECRET}",
           "OBJECT_STORAGE_FORCE_PATH_STYLE": "true", "BENCHMARK_FIXTURE_EMAIL": "${BENCHMARK_FIXTURE_EMAIL}",
           "BENCHMARK_FIXTURE_PASSWORD": "${BENCHMARK_FIXTURE_PASSWORD}"}
    return {"services": {
        "postgres": service(images["postgres"], environment={"POSTGRES_DB": "postgres", "POSTGRES_USER": "postgres",
            "POSTGRES_PASSWORD": "${BENCHMARK_DB_PASSWORD}"}, healthcheck=health("pg_isready -U postgres -d postgres"),
            volumes=["postgres-data:/var/lib/postgresql/data"]),
        "replacement-storage": service(images["storage"], command=["mini", "-dir=/data"],
            environment={"AWS_ACCESS_KEY_ID": "${BENCHMARK_S3_ACCESS}", "AWS_SECRET_ACCESS_KEY": "${BENCHMARK_S3_SECRET}",
                         "S3_BUCKET": "benchmark-bootstrap"}, volumes=["storage-data:/data"],
            healthcheck=health("curl -fsS http://127.0.0.1:8333/healthz >/dev/null")),
        "backend": service(images["backend"], profiles=["application"], environment=app),
        "frontend": service(images["frontend"], profiles=["application"], depends_on=["backend", "tileserver"]),
        "tileserver": service(images["tileserver"], profiles=["application"],
            command=["--config", "/data/config.json", "--bind", "0.0.0.0", "--port", "8080", "--public_url", "/maps/", "--silent"],
            volumes=[f"{maps}/rendering:/data/rendering:ro", f"{maps}/rendering/fonts:/data/fonts:ro",
                     f"{ROOT}/docker/maps/tileserver/config.json:/data/config.json:ro", f"{ROOT}/docker/maps/styles:/data/styles:ro"]),
    }, "networks": {"app_network": {"internal": True}}, "volumes": {"postgres-data": {}, "storage-data": {}}}


def traffic_closed(context):
    c = context["compose"]
    config = json.loads(run([*c, "config", "--format", "json"]))
    if any(s.get("ports") or s.get("network_mode") or s.get("privileged") or s.get("build") for s in config["services"].values()):
        raise Blocked("TRAFFIC_BOUNDARY_INVALID")
    network = json.loads(run([c[0], "network", "inspect", context["project"] + "_app_network"]))[0]
    if network.get("Internal") is not True: raise Blocked("TRAFFIC_BOUNDARY_INVALID")
    ids = run([c[0], "ps", "-aq", "--filter", "label=com.docker.compose.project=" + context["project"]]).splitlines()
    if not ids: raise Blocked("TRAFFIC_BOUNDARY_INVALID")
    for container in json.loads(run([c[0], "inspect", *ids])):
        if container["HostConfig"].get("PortBindings") or container["HostConfig"].get("Privileged"):
            raise Blocked("TRAFFIC_BOUNDARY_INVALID")
        if set(container["NetworkSettings"]["Networks"]) != {context["project"] + "_app_network"}:
            raise Blocked("TRAFFIC_BOUNDARY_INVALID")


def aws(context, arguments, backup=False):
    e = os.environ.copy()
    if backup:
        access, secret, region = (e["BACKUP_S3_ACCESS_KEY_ID"], e["BACKUP_S3_SECRET_ACCESS_KEY"], e["BACKUP_S3_REGION"])
        network = []  # Dedicated short-lived reader can reach B2; replacement stays internal.
    else:
        access, secret, region = (e["BENCHMARK_S3_ACCESS"], e["BENCHMARK_S3_SECRET"], "us-east-1")
        network = ["--network", context["project"] + "_app_network"]
    e.update(AWS_ACCESS_KEY_ID=access, AWS_SECRET_ACCESS_KEY=secret, AWS_DEFAULT_REGION=region, AWS_EC2_METADATA_DISABLED="true")
    return run([context["compose"][0], "run", "--rm", *network,
                "--label", "com.docker.compose.project=" + context["project"],
                "-e", "AWS_ACCESS_KEY_ID", "-e", "AWS_SECRET_ACCESS_KEY", "-e", "AWS_DEFAULT_REGION", "-e", "AWS_EC2_METADATA_DISABLED",
                "-v", context["work"] + ":/backup", context["images"]["aws"], *arguments], env=e)


def pg(context, sql):
    return run([*context["compose"], "exec", "-T", "postgres", "psql", "-X", "-U", "postgres",
                "-d", context["database"], "-v", "ON_ERROR_STOP=1", "-Atqc", sql])


def measure_volume(context):
    rows = {name: int(pg(context, f'SELECT count(*) FROM "{name}"')) for name in TABLES}
    database_bytes = int(pg(context, "SELECT pg_database_size(current_database())"))
    objects = json.loads(aws(context, ["s3api", "list-objects-v2", "--bucket", context["bucket"],
                                      "--endpoint-url", "http://replacement-storage:8333", "--output", "json"])).get("Contents", [])
    bands = [{"max_bytes": x["max_bytes"], "count": 0, "total_bytes": 0} for x in context["profile"]["object_size_distribution"]]
    for obj in objects:
        for band in bands:
            if obj["Size"] <= band["max_bytes"]:
                band["count"] += 1; band["total_bytes"] += obj["Size"]; break
        else: raise Blocked("OBJECT_DISTRIBUTION_OUTSIDE_PROFILE")
    return {"postgres_size_bytes": database_bytes, "postgres_row_counts": rows, "object_count": len(objects),
            "object_storage_total_bytes": sum(x["Size"] for x in objects), "largest_object_bytes": max((x["Size"] for x in objects), default=0),
            "object_size_distribution": bands}


# Runs inside the approved backend image. No tokens, URLs, bodies or PII are returned.
HTTP_SMOKE = r'''
const {createHash} = require('node:crypto');
const checks = {}; const fixture = JSON.parse(process.env.BENCHMARK_SMOKE_FIXTURE);
async function request(url, options = {}) {
  const r = await fetch(url, {...options, signal: AbortSignal.timeout(5000)});
  if (!r.ok) throw Error('http'); return r;
}
async function json(path, token) {
  const r = await request('http://127.0.0.1:4000/api' + path,
    token ? {headers:{authorization:'Bearer ' + token}} : {});
  const b = await r.json(); if (b.success !== true) throw Error('response'); return b.data;
}
(async () => {
  const deadline = Date.now() + 120000;
  while (true) {
    try { const r = await json('/health/ready'); if (r.status !== 'ready') throw Error(); break; }
    catch { if (Date.now() >= deadline) throw Error('ready'); await new Promise(r => setTimeout(r, 250)); }
  }
  checks.ready = true;
  const login = await request('http://127.0.0.1:4000/api/auth/login', {method:'POST',
    headers:{'content-type':'application/json'}, body:JSON.stringify({email:process.env.BENCHMARK_FIXTURE_EMAIL,
    password:process.env.BENCHMARK_FIXTURE_PASSWORD})});
  const body = await login.json(); const token = body.data?.accessToken;
  if (body.success !== true || !token) throw Error('auth');
  const me = await json('/auth/me', token);
  if (me.user?.email !== process.env.BENCHMARK_FIXTURE_EMAIL) throw Error('auth');
  checks.authentication = true;
  const product = await json('/products/' + encodeURIComponent(fixture.product_id), token);
  if (product.id !== fixture.product_id || product.sku !== fixture.product_sku) throw Error('restored');
  checks.restored_product = true;
  await json('/products', token); checks.business_read = true;
  const branding = await json('/branding'); const url = new URL(branding.logoUrl);
  if (url.origin !== 'http://replacement-storage:8333') throw Error('storage origin');
  const data = Buffer.from(await (await request(url)).arrayBuffer());
  if (createHash('sha256').update(data).digest('hex') !== fixture.branding_sha256) throw Error('readback');
  checks.application_object_readback = true;
  let html; while (true) {
    try { html = await (await request('http://frontend:3000/')).text(); break; }
    catch { if (Date.now() >= deadline) throw Error('frontend'); await new Promise(r => setTimeout(r, 250)); }
  }
  if (!html.includes('id="root"') || !html.includes('/assets/')) throw Error('frontend');
  checks.frontend_http = true;
  const frontendReady = await (await request('http://frontend:3000/api/health/ready')).json();
  if (frontendReady.data?.status !== 'ready') throw Error('frontend api');
  checks.frontend_api = true;
})().catch(() => {process.exitCode = 1;}).finally(() => {process.stdout.write(JSON.stringify(checks));});
'''


def application_smoke(context):
    evidence = {"company": context["company"], "status": "failed", "checks": {}, "started_at": utc()}
    try:
        c = context["compose"]
        # Read-only migration status detects a restored history incompatible with the actual release.
        run([*c, "run", "--rm", "--no-deps", "backend", "npm", "exec", "--", "prisma", "migrate", "status", "--schema", "prisma/schema.prisma"])
        evidence["checks"]["release_schema"] = True
        run([*c, "up", "-d", "--no-build", "backend", "tileserver", "frontend"])
        for service in ("backend", "frontend", "tileserver", "postgres", "replacement-storage"):
            image = context["images"].get({"replacement-storage": "storage"}.get(service, service))
            ids = run([*c, "ps", "-q", service]).splitlines()
            if len(ids) != 1: raise Blocked("DEPLOYED_RELEASE_MISMATCH")
            actual = json.loads(run([c[0], "inspect", ids[0]]))[0]
            expected = json.loads(run([c[0], "image", "inspect", image]))[0]
            if actual["Image"] != expected["Id"] or image not in expected.get("RepoDigests", []):
                raise Blocked("DEPLOYED_RELEASE_MISMATCH")
        evidence["checks"]["deployed_images"] = True
        observed = measure_volume(context)
        write(Path(context["evidence"]) / "observed-volume.json", observed)
        evidence["checks"]["volume_measured"] = True
        fixture_env = {**os.environ, "BENCHMARK_SMOKE_FIXTURE": json.dumps(context["dataset"]["smoke_fixture"])}
        checks = json.loads(run([*c, "exec", "-T", "-e", "BENCHMARK_SMOKE_FIXTURE", "backend", "node", "-"],
                                env=fixture_env, data=HTTP_SMOKE, timeout=180))
        evidence["checks"].update(checks)
        if not all(evidence["checks"].get(k) is True for k in SMOKE_CHECKS): raise Blocked("APPLICATION_SMOKE_FAILED")
        evidence["status"] = "passed"
    finally:
        evidence["finished_at"] = utc()
        write(Path(context["evidence"]) / "smoke.json", evidence)


def outcome(restore, smoke, is_representative, rto_seconds):
    if (restore.get("status") != "READY_FOR_CUTOVER" or restore.get("traffic_cutover_performed") is not False
            or not all(restore.get(k) == "passed" for k in RESTORE_CHECKS)
            or not all(smoke.get(k) is True for k in SMOKE_CHECKS)):
        return "BLOCKED"
    if not is_representative: return "NOT_REPRESENTATIVE"
    return "PASSED_RTO_OBJECTIVE" if rto_seconds <= 3600 else "EXCEEDED_RTO_OBJECTIVE"


def validate_dataset(d, company):
    try:
        require(set(d) == {"company_slug", "data_classification", "recovery_set_key", "source_database", "source_bucket", "schema_state_sha256", "smoke_fixture"})
        require(d["company_slug"] == company and d["data_classification"] == "synthetic")
        require(re.fullmatch(r"[a-z][a-z0-9_]{0,40}_benchmark_source", d["source_database"]))
        require(re.fullmatch(r"mte-benchmark-source-" + re.escape(company) + r"-[a-z0-9-]+", d["source_bucket"]))
        require(re.fullmatch(r"recovery-sets/" + re.escape(company) + r"/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-\d+-\d+\.manifest\.json", d["recovery_set_key"]))
        require(re.fullmatch(r"[a-f0-9]{64}", d["schema_state_sha256"]))
        fixture = d["smoke_fixture"]
        require(set(fixture) == {"product_id", "product_sku", "branding_sha256"})
        require(opaque(fixture["product_id"]) and opaque(fixture["product_sku"]))
        require(re.fullmatch(r"[a-f0-9]{64}", fixture["branding_sha256"]))
    except (KeyError, TypeError, Blocked): raise Blocked("SYNTHETIC_DATASET_UNAVAILABLE") from None
    return d


def host_provisioning(path, incident, original):
    if not path: return None
    p = read(path)
    try:
        require(set(p) == {"kind", "role", "host_ref", "original_host_ref", "incident_declared_at", "provisioning_started_at", "infrastructure_ready_at", "evidence_ref", "status"})
        require(p["kind"] == "disposable-host" and p["role"] == "disposable-benchmark" and p["status"] == "passed")
        require(p["original_host_ref"] == original and opaque(p["host_ref"]) and p["host_ref"] != original and opaque(p["evidence_ref"]))
        require(incident == p["incident_declared_at"])
        seconds(p["provisioning_started_at"], incident)
        seconds(p["infrastructure_ready_at"], p["provisioning_started_at"])
        seconds(utc(), p["infrastructure_ready_at"])
    except (KeyError, TypeError, Blocked): raise Blocked("HOST_PROVISIONING_EVIDENCE_INVALID") from None
    return p


def benchmark(args):
    os.umask(0o077)
    evidence = Path(args.evidence_dir).resolve()
    # New evidence directory only; never replace a prior company's audit record.
    evidence.mkdir(parents=True, exist_ok=False)
    summary = {"task": "BACKUP-PROD-011", "company": args.company, "audited_sha": args.audited_sha,
               "status": "BLOCKED", "reason": None, "target_rto_minutes": 60, "traffic_cutover_performed": False,
               "timeline": {}, "rpo_seconds": None, "rto_seconds": None, "incident_declared_at": None,
               "replacement_ready_at": None, "database_bytes": None, "object_storage_bytes": None,
               "object_count": None, "failure_stage": "release_approval"}
    write(evidence / "smoke.json", {"company": args.company, "status": "not_run", "checks": {}})
    write(evidence / "volume-profile.json", {"status": "REPRESENTATIVE_VOLUME_NOT_AVAILABLE"})
    write(evidence / "release-digests.json", {"commit": args.audited_sha, "status": "APPROVED_RELEASE_IMAGES_UNAVAILABLE"})
    project = None; compose = []; owned = False; work = None
    try:
        if not re.fullmatch(r"[a-f0-9]{40}", args.audited_sha): raise Blocked("AUDITED_SHA_INVALID")
        summary["harness_sha"] = run(["git", "-C", str(ROOT), "rev-parse", "HEAD"])
        summary["harness_content_sha256"] = hashlib.sha256(b"".join(
            (SCRIPTS / name).read_bytes() for name in ("representative-replacement-benchmark.py",
            "replacement-benchmark-smoke.sh", "replacement-benchmark-traffic-closed.sh", "restore-company-production-replacement.sh"))).hexdigest()
        release = approved_release(args.audited_sha)
        write(evidence / "release-digests.json", release)
        summary["failure_stage"] = "volume_profile"
        if args.check: raise Blocked("REPRESENTATIVE_VOLUME_NOT_AVAILABLE")
        profile = validate_profile(read(args.volume_profile), args.company)
        write(evidence / "volume-profile.json", profile)
        summary["failure_stage"] = "synthetic_dataset"
        dataset = validate_dataset(read(args.dataset), args.company)
        summary["recovery_set_key"] = dataset["recovery_set_key"]
        if not args.apply: raise Blocked("EXPLICIT_APPLY_REQUIRED")
        summary["failure_stage"] = "disposable_target_preflight"
        if os.environ.get("BENCHMARK_HOST_ROLE") != "disposable-benchmark": raise Blocked("DISPOSABLE_HOST_REQUIRED")
        original = os.environ.get("BENCHMARK_ORIGINAL_HOST_REF", "")
        if not opaque(original): raise Blocked("ORIGINAL_HOST_IDENTITY_REQUIRED")
        docker = os.environ.get("BACKUP_DOCKER_BIN", "docker")
        # No remote Docker context, production daemon, user-supplied Compose file or target selectors.
        if os.environ.get("DOCKER_HOST") or os.environ.get("DOCKER_CONTEXT"): raise Blocked("REMOTE_DOCKER_FORBIDDEN")
        current_context = json.loads(run([docker, "context", "inspect"]))[0]
        if not current_context["Endpoints"]["docker"]["Host"].startswith("unix://"): raise Blocked("REMOTE_DOCKER_FORBIDDEN")
        if run([docker, "ps", "-aq"]): raise Blocked("NONEMPTY_BENCHMARK_DAEMON")
        images = release["images"]
        if any(images[k] != v for k, v in profile["expected_image_digests"].items()): raise Blocked("PROFILE_RELEASE_MISMATCH")
        for name, ref in images.items():
            image_ref(ref)
            manifest = json.loads(run([docker, "buildx", "imagetools", "inspect", ref, "--format", "{{json .Manifest}}"], timeout=60))
            if manifest.get("digest") != ref.split("@", 1)[1]: raise Blocked("APPROVED_RELEASE_IMAGES_UNAVAILABLE")
        maps = Path(args.map_data).resolve() if args.map_data else None
        if not maps or not (maps / "rendering/fonts").is_dir() or not (maps / "rendering/mexico.pmtiles").is_file():
            raise Blocked("BENCHMARK_MAP_DATA_UNAVAILABLE")
        email, password = os.environ.get("BENCHMARK_FIXTURE_EMAIL", ""), os.environ.get("BENCHMARK_FIXTURE_PASSWORD", "")
        if not re.fullmatch(r"[a-zA-Z0-9._+-]+@example\.test", email) or not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", password):
            raise Blocked("SYNTHETIC_FIXTURE_LOGIN_REQUIRED")
        for key in ("BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"):
            if not os.environ.get(key): raise Blocked("SYNTHETIC_BACKUP_ACCESS_UNAVAILABLE")
        source_endpoint = os.environ.get("BENCHMARK_SOURCE_S3_ENDPOINT", "")
        parsed_endpoint = urllib.parse.urlsplit(os.environ["BACKUP_S3_ENDPOINT"])
        if (parsed_endpoint.scheme != "https" or not parsed_endpoint.hostname or parsed_endpoint.username or parsed_endpoint.password
                or parsed_endpoint.query or parsed_endpoint.fragment or parsed_endpoint.path not in ("", "/")
                or not os.environ["BACKUP_S3_BUCKET"].startswith("mte-benchmark-backup-" + args.company + "-")):
            raise Blocked("PRODUCTION_SOURCE_FORBIDDEN")
        if not source_endpoint.startswith(("http://", "https://")) or source_endpoint.rstrip("/") == "http://replacement-storage:8333":
            raise Blocked("SYNTHETIC_SOURCE_ENDPOINT_REQUIRED")
        timeline = summary["timeline"]
        timeline["incident_declared_at"] = args.incident_declared_at or utc()
        summary["incident_declared_at"] = timeline["incident_declared_at"]
        host = host_provisioning(args.host_provisioning, timeline["incident_declared_at"], original)
        if args.incident_declared_at and not host: raise Blocked("HOST_PROVISIONING_EVIDENCE_INVALID")
        if host: write(evidence / "host-provisioning.json", host)
        # All replacement image pulls, service creation and readiness occur AFTER the incident.
        timeline["replacement_provisioning_started_at"] = host["provisioning_started_at"] if host else utc()
        timeline["container_provisioning_started_at"] = utc()
        summary["failure_stage"] = "replacement_provisioning"
        project, database, bucket, unique = target_identity(args.company)
        work = Path(tempfile.mkdtemp(prefix="replacement-benchmark-"))
        compose_file = work / "dr-replacement.compose.yml"
        env_file = work / "compose.conf"
        variables = {"BENCHMARK_DB_PASSWORD": secrets.token_hex(24), "BENCHMARK_S3_ACCESS": secrets.token_hex(16),
                     "BENCHMARK_S3_SECRET": secrets.token_hex(24), "BENCHMARK_ACCESS_SECRET": secrets.token_hex(32),
                     "BENCHMARK_REFRESH_SECRET": secrets.token_hex(32), "BENCHMARK_FIXTURE_EMAIL": email, "BENCHMARK_FIXTURE_PASSWORD": password,
                     "RECOVERY_TARGET_ROLE": "replacement", "RECOVERY_COMPANY_SLUG": args.company,
                     "RECOVERY_HOST_REF": host["host_ref"] if host else project}
        if any("\n" in value or "\r" in value or "$" in value or "#" in value for value in variables.values()):
            raise Blocked("FIXTURE_ENV_INVALID")
        env_file.write_text("".join(k + "=" + v + "\n" for k, v in variables.items()), encoding="utf-8")
        write(compose_file, compose_config(images, database, bucket, str(maps), str(work)))
        compose = [docker, "compose", "--project-name", project, "--env-file", str(env_file), "-f", str(compose_file), "--profile", "application"]
        context = {"company": args.company, "project": project, "database": database, "bucket": bucket,
                   "work": str(work), "compose": compose, "images": images, "profile": profile, "dataset": dataset, "evidence": str(evidence)}
        write(work / "context.json", context)
        os.environ.update(variables)
        assert_absent(docker, project)
        owned = True  # Ownership only after absence verification, before partial provisioning can fail.
        run([*compose, "pull", "postgres", "replacement-storage", "backend", "frontend", "tileserver"])
        run([docker, "pull", images["aws"]])
        run([*compose, "up", "-d", "--no-build", "--wait", "--wait-timeout", "150", "postgres", "replacement-storage"])
        traffic_closed(context)
        timeline["replacement_infrastructure_ready_at"] = utc()
        timeline["restore_started_at"] = utc()
        summary["failure_stage"] = "recovery_set_preflight"
        # Validate the selected remote manifest, including company and write barrier, BEFORE target mutation.
        for suffix, local in (("", "set.json"), (".sha256", "set.sha256")):
            aws(context, ["s3", "cp", "s3://" + os.environ["BACKUP_S3_BUCKET"] + "/" + dataset["recovery_set_key"] + suffix,
                          "/backup/" + local, "--endpoint-url", os.environ["BACKUP_S3_ENDPOINT"], "--only-show-errors"], backup=True)
        run(["node", str(SCRIPTS / "company-recovery-manifest.mjs"), "verify-identity", "--manifest", str(work / "set.json"),
             "--checksum", str(work / "set.sha256"), "--expected-company", args.company])
        recovery = read(work / "set.json")
        summary["rpo_seconds"] = rpo(timeline["incident_declared_at"], recovery["recovery_point"]["write_barrier_at"])
        summary["archive_bytes"] = recovery["object_storage"]["size_bytes"]
        if recovery["postgresql"]["database"] != dataset["source_database"] or recovery["object_storage"]["source_bucket"] != dataset["source_bucket"]:
            raise Blocked("SYNTHETIC_RECOVERY_IDENTITY_MISMATCH")
        env = {k: v for k, v in os.environ.items() if not k.startswith(("RESTORE_", "COMPOSE_", "BACKUP_"))}
        for key in ("BACKUP_S3_ENDPOINT", "BACKUP_S3_REGION", "BACKUP_S3_BUCKET", "BACKUP_S3_ACCESS_KEY_ID", "BACKUP_S3_SECRET_ACCESS_KEY"):
            env[key] = os.environ[key]
        incident_ref = "benchmark-" + unique
        hooks = {"health": SCRIPTS / "replacement-benchmark-smoke.sh", "traffic": SCRIPTS / "replacement-benchmark-traffic-closed.sh"}
        env.update(BENCHMARK_CONTEXT_FILE=str(work / "context.json"), BACKUP_DOCKER_BIN=docker, BACKUP_UPLOAD_IMAGE=images["aws"],
                   COMPANY_SLUG=args.company, RESTORE_RECOVERY_SET_KEY=dataset["recovery_set_key"],
                   RESTORE_PRODUCTION_DATABASE_NAME=dataset["source_database"], RESTORE_REPLACEMENT_DATABASE_NAME=database,
                   RESTORE_PRODUCTION_BUCKET=dataset["source_bucket"], RESTORE_REPLACEMENT_BUCKET=bucket,
                   RESTORE_PRODUCTION_COMPOSE_PROJECT="synthetic-source", RESTORE_REPLACEMENT_COMPOSE_PROJECT=project,
                   RESTORE_ORIGINAL_HOST_REF=original, RESTORE_REPLACEMENT_HOST_REF=variables["RECOVERY_HOST_REF"],
                   RESTORE_PRODUCTION_S3_ENDPOINT=os.environ["BENCHMARK_SOURCE_S3_ENDPOINT"],
                   RESTORE_REPLACEMENT_COMPOSE_FILE=str(compose_file), RESTORE_REPLACEMENT_COMPOSE_ENV_FILE=str(env_file),
                   RESTORE_REPLACEMENT_NETWORK=project + "_app_network", RESTORE_REPLACEMENT_POSTGRES_PASSWORD=variables["BENCHMARK_DB_PASSWORD"],
                   RESTORE_REPLACEMENT_S3_ENDPOINT="http://replacement-storage:8333", RESTORE_ALLOW_INSECURE_TARGET_ENDPOINT="true",
                   RESTORE_REPLACEMENT_S3_REGION="us-east-1", RESTORE_REPLACEMENT_S3_ACCESS_KEY_ID=variables["BENCHMARK_S3_ACCESS"],
                   RESTORE_REPLACEMENT_S3_SECRET_ACCESS_KEY=variables["BENCHMARK_S3_SECRET"],
                   RESTORE_INCIDENT_REF=incident_ref, RESTORE_INCIDENT_DECLARED_AT=timeline["incident_declared_at"],
                   RESTORE_APPROVED_BACKEND_DIGEST=images["backend"], RESTORE_APPROVED_FRONTEND_DIGEST=images["frontend"],
                   RESTORE_APPROVED_SCHEMA_SHA256=dataset["schema_state_sha256"], RESTORE_HEALTH_SMOKE_SCRIPT=str(hooks["health"]),
                   RESTORE_HEALTH_SMOKE_SHA256=hashlib.sha256(hooks["health"].read_bytes()).hexdigest(),
                   RESTORE_TRAFFIC_CLOSED_SCRIPT=str(hooks["traffic"]), RESTORE_TRAFFIC_CLOSED_SHA256=hashlib.sha256(hooks["traffic"].read_bytes()).hexdigest(),
                   RESTORE_LOCAL_DIR=str(work / "restore"), RESTORE_RESULT_FILE=str(evidence / "replacement-ready.json"),
                   RESTORE_CONFIRMATION=f"RESTORE:{args.company}:{incident_ref}:{project}")
        summary["failure_stage"] = "replacement_restore_and_smoke"
        run(["bash", str(SCRIPTS / "restore-company-production-replacement.sh"), "--apply"], env=env, timeout=7200)
        restored = read(evidence / "replacement-ready.json")
        timeline["ready_for_cutover_at"] = restored["ready_for_cutover_at"]
        timeline["restore_completed_at"] = restored["object_storage_restore_finished_at"]
        timeline["verification_completed_at"] = restored["verification_finished_at"]
        smoke = read(evidence / "smoke.json")
        observed = read(evidence / "observed-volume.json")
        measured_rto = seconds(timeline["ready_for_cutover_at"], timeline["incident_declared_at"])
        is_representative = representative(profile, observed) and host is not None
        summary.update(status=outcome(restored, smoke["checks"], is_representative, measured_rto),
            rto_seconds=measured_rto, total_rto_seconds=measured_rto,
            provisioning_seconds=seconds(timeline["replacement_infrastructure_ready_at"], timeline["incident_declared_at"]),
            restore_seconds=seconds(timeline["restore_completed_at"], timeline["restore_started_at"]),
            postgres_restore_seconds=seconds(restored["postgres_restore_finished_at"], restored["postgres_restore_started_at"]),
            pg_restore_seconds=restored["pg_restore_seconds"],
            object_restore_seconds=seconds(restored["object_storage_restore_finished_at"], restored["object_storage_restore_started_at"]),
            verification_seconds=seconds(timeline["verification_completed_at"], restored["verification_started_at"]),
            health_smoke_seconds=seconds(smoke["finished_at"], smoke["started_at"]),
            representative_volume=representative(profile, observed), host_provisioning_included=host is not None,
            volume=observed, release=release, replacement_ready_at=timeline["ready_for_cutover_at"])
        summary.update(database_bytes=observed["postgres_size_bytes"], object_storage_bytes=observed["object_storage_total_bytes"],
                       object_count=observed["object_count"], failure_stage=None)
        if not is_representative: summary["reason"] = "HOST_PROVISIONING_NOT_INCLUDED" if host is None else "VOLUME_OUTSIDE_PROFILE"
    except Blocked as error:
        summary["reason"] = str(error)
    except Exception:
        summary["reason"] = "BENCHMARK_STAGE_FAILED"
    finally:
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP): signal.signal(sig, signal.SIG_IGN)
        summary["main_status"] = summary["status"]
        cleaned = cleanup(compose, project, owned)
        cleaned["company"] = args.company
        cleaned["private_work_removed"] = None
        if work:
            try:
                shutil.rmtree(work)
                cleaned["private_work_removed"] = True
            except OSError:
                cleaned.update(status="failed", private_work_removed=False)
                summary.update(status="BLOCKED", reason="PRIVATE_WORK_CLEANUP_FAILED")
        write(evidence / "cleanup.json", cleaned)
        summary["cleanup_status"] = cleaned["status"]
        if cleaned["status"] == "failed": summary.update(status="BLOCKED", cleanup_failure=True)
        write(evidence / "benchmark.json", summary)
        if args.company: write(evidence / ("replacement-benchmark-" + args.company + ".json"), summary)
    print(json.dumps({"status": summary["status"], "reason": summary["reason"], "company": args.company}))
    return 0 if summary["status"] == "PASSED_RTO_OBJECTIVE" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hook", choices=["smoke", "traffic"])
    parser.add_argument("--check", action="store_true", help="Read-only release prerequisites; never a benchmark PASS")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--company")
    parser.add_argument("--audited-sha")
    parser.add_argument("--volume-profile")
    parser.add_argument("--dataset")
    parser.add_argument("--map-data")
    parser.add_argument("--incident-declared-at")
    parser.add_argument("--host-provisioning")
    parser.add_argument("--evidence-dir")
    args = parser.parse_args()
    if args.hook:
        context = read(os.environ.get("BENCHMARK_CONTEXT_FILE"))
        try: application_smoke(context) if args.hook == "smoke" else traffic_closed(context)
        except Exception: return 1
        return 0
    if not args.audited_sha or not args.evidence_dir: parser.error("--audited-sha and --evidence-dir are required")
    if not args.check and not args.company: parser.error("--company is required")
    if args.company and (not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", args.company) or len(args.company) > 24):
        parser.error("company must be a canonical slug, at most 24 characters")
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(Blocked("INTERRUPTED")))
    signal.signal(signal.SIGINT, lambda *_: (_ for _ in ()).throw(Blocked("INTERRUPTED")))
    signal.signal(signal.SIGHUP, lambda *_: (_ for _ in ()).throw(Blocked("INTERRUPTED")))
    try: return benchmark(args)
    except OSError:
        print(json.dumps({"status": "BLOCKED", "reason": "EVIDENCE_DIRECTORY_UNAVAILABLE_OR_REUSED"}))
        return 1


if __name__ == "__main__": raise SystemExit(main())
