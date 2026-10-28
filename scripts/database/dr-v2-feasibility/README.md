# Disposable DR feasibility laboratory

**Use `recovery.py` for FEASIBILITY-003 acceptance and metrics.** `lab.py` preserves the earlier FEASIBILITY-002 mechanics path, not the stricter acceptance gate. See the corresponding reports under `Audit/`; FEASIBILITY-001 remains the earlier blocked snapshot. Not production acceptance. Do not run against any existing ERP database/bucket. No production Compose or application module imports are used.

## Reproduction after Docker execution is available

Requirements: Python 3.9+, Docker Engine/CLI, outbound image/build access, at least several GiB free space. The PostGIS parent is AMD64; an ARM64 host executes it under emulation. Builds fetch source and OS dependencies; image ID and source SHA must be recorded for each run. This is not a reproducible production release build.

```bash
docker build --platform linux/amd64 \
  -t erp-dr-v2-feasibility:pg16-pgbr260 scripts/database/dr-v2-feasibility
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/database/dr-v2-feasibility -p 'test_*.py'
# Output directory must not already exist. Only synthetic generated rows are used.
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/recovery.py \
  --output /private/tmp/erp-dr2-run-UNIQUE --rows 32768
# Legacy mechanics-only larger sample; NOT the FEASIBILITY-003 acceptance suite:
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/lab.py \
  --output /private/tmp/erp-dr2-run-LARGER-UNIQUE --rows 131072
```

The helper creates uniquely labelled `erp-dr2-lab-*` containers, network and named volumes, no published ports or existing-volume attachment. Random ephemeral credentials/config/certificate material now live in a separate private temporary directory, not in the evidence output. The test HMAC key stays in process memory. Private material is removed during cleanup. Do not upload material from the separate private directory.

## Bootstrap regression and diagnostics

Readiness and SQL use TCP `127.0.0.1` **inside** the new PostgreSQL container. The initializer's Unix-socket-only temporary server is not the final server and deliberately fast-shuts down. A TCP readiness probe plus a successful query must pass before schema creation. Schema creation, original synthetic load and exact count/byte-length checks are separate stages; the full generator still produces 32768 rows × 1024 bytes, without reducing its 32 MD5 fragments per row.

Before cleanup (and before intentional source loss), capture `diagnostics-*.json`: owned-service logs, state/exit/OOM/restart/signal/limits, cgroup memory events/current/max, PostgreSQL state and timestamp-bounded Docker events. `commands.jsonl` records safe command summaries, SQL hashes, stage, exit, elapsed time and sanitized output, including timeouts/launch failures. Never full-inspect environment or persist raw argv/helper input. Docker exec-event command text is omitted. Diagnostic failure does not prevent remaining services/cleanup attempts; cleanup verifies the run label before deleting each resource and never prunes globally.

An explicit regression-only script reproduces the **old** Unix-socket behavior; it is not imported by the normal harness:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/reproduce_bootstrap.py \
  --output /private/tmp/erp-dr2-legacy-UNIQUE
```

Its expected result is `REPRODUCED_ADMINISTRATOR_TERMINATION` with cleanup passed. If the race does not manifest, it reports NOT_REPRODUCED instead of forcing a fake failure. It preserves the original 32768-row combined SQL and stops before backup when the probe completes. Do not use legacy readiness for regular tests.

The storage image is PGSTY SILO pinned by digest, not MinIO/B2/SeaweedFS certification. PostgreSQL archive/restore uses real pgBackRest S3 operations and repository encryption. S3 uses self-signed TLS with verification disabled **only in the isolated lab**. The helper does not prove certificate authentication, WORM retention, production IAM or off-host survival. Bucket versioning plus a delete marker exercises historical GET; retention is not claimed merely because Object Lock is enabled at bucket creation.

## Experiments prepared

### Causal recovery suite — FEASIBILITY-003

`recovery.py` is the stricter fault/measurement entry point. `lab.py` and the bootstrap reproduction retain their earlier scope. Always use a fresh output directory:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/database/dr-v2-feasibility -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/recovery.py --output /private/tmp/erp-dr2-suite-smoke-UNIQUE --rows 1024
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/recovery.py --output /private/tmp/erp-dr2-suite-full-UNIQUE --rows 32768
```

Each suite creates a synthetic source and S3 repository, verifies the physical backup, freezes an authenticated candidate, removes its source container/volume and materializes the native repository into an owned volume. Database restore and WAL replay use that POSIX repository, so S3 materialization is measured separately. Two positive trials use fresh target PGDATA and repeated repository transfer. Both require exact pre/post sentinels, the historical DB/object binding, full payload count/bytes/row-digest oracle, independent object-file SHA256 readback, and a PostgreSQL recovery pause rather than promotion.

The signed laboratory catalog pins the completed `backup_label`, stop LSN and stop epoch. The candidate must follow that backup's stop time/LSN; native restore uses explicit `--set` while preserving the exact fractional UTC target. Automatic time-based selection rounds to seconds and can reject a valid target within the same second as backup completion. The failed attempt exposing that boundary is retained, not counted as a successful negative test.

Seven fault classes produce eight trials: missing required WAL; actual deletion of the required historical S3 version; incorrect SHA and size separately; altered catalog; incorrect S3 secret; authenticated other-company catalog; and stopped repository. All use the same recovery acceptance path. A healthy exact-version/repository control must succeed before injection. Only a typed rejection with the expected native cause, expected stage and injection evidence is a successful negative test. Unexpected errors/timeouts remain FAIL. WAL removal must reach native replay in a new PGDATA and fail before the target, with server stopped and no promotion. Preflight rejections must not create a target. The deliberately deleted version is tested last because its provider VersionId cannot be recreated by uploading its bytes again.

`result.json` contains scenario statuses, accepted/promoted flags, typed errors, phase UTC timestamps and monotonic durations, materialized compressed bytes and effective-rate inputs, native WAL-get timing subsets, cleanup and label-scoped orphan inventories. Native `recovery-*.log` files corroborate the target pause or missing-WAL fatal error. `resource_operations` is a preparation-only breakdown; parent setup phases include subphases and must not be added to them. Backup creation/validation is setup, never counted as recovery RTO. `recovery_elapsed_seconds` measures the local data-recovery path, not ERP/GIS/routing/service RTO.

Per-scenario cleanup retains shared owned S3/helper/repository resources intentionally, but removes and checks absence of that scenario's targets. Terminal cleanup checks absence of all run-labelled containers, networks and volumes. No global prune, cache flush or inspection of other projects is used. Host/VM caches are **uncontrolled**: fresh containers/PGDATA are not proof of cold host cache. Actual B2/S3 retention/IAM/WORM, 35 days, WAN latency, native AMD64, ERP business invariants and service cutover require separate acceptance.

The following bullets describe the earlier `lab.py` mechanics path, not the stricter suite:

- Physical full backup, identifiable pre/post transactions, UTC timestamp target plus named marker cross-check, recovery pause and sentinel comparison.
- Two synthetic versions, deletion of the current name, exact-version body/size/MIME/SHA256 readback.
- Restored DB points to version one although source later references version two.
- Remove only the owned source container and source named volume before restoration; recover from separate S3 volume and externally held test config.
- Negative catalog HMAC/company checks, remote object missing/hash mismatch/auth rejection, native archive-get of a removed WAL, stopped S3 endpoint.
- Timings recorded in `result.json`; database restore and S3 transfer remain a **combined phase** until finer native-log instrumentation is validated. No host provisioning, GIS, ERP HTTP service or cutover is implemented; do not call the result service RTO.

The earlier `lab.py` missing-WAL archive-get rejection is narrower than fresh PITR rejection. Use `recovery.py` for the fresh-PGDATA missing-WAL scenario. Neither path certifies all production resilience criteria or full independent host restart acceptance.

All generated resources are owned by one run; cleanup is scoped to recorded generated names, never global prune. Failure evidence is written on exit. Interruption/daemon loss can prevent cleanup: inspect the recorded prefix and Docker labels before separately removing owned resources. Never prune or delete other projects to make the experiment pass.

## Reading results

`commands.jsonl`, diagnostics and `result.json` contain measured outcomes; failures remain failures. Unit tests prove pure validation/lifecycle contracts, not PostgreSQL/S3/PITR. An exception or missing result is not PASS. Even `MECHANICS_PASSED_NOT_PRODUCTION_ACCEPTANCE` is not a production authorization or 35-day/RPO/service-RTO certification.

Use the three design scenarios only as hypothetical demand. Do not calculate a recovery-volume limit from image build time, memory-copy speed, cached tiny GETs or a missing runtime measurement. Measure multiple incompressible sizes/cold runs, disk contention, restore verification, WAL replay and provider network before fitting a capacity curve.
