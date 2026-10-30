# ERP-DR-V2-FEASIBILITY-002 — PostgreSQL bootstrap race diagnosed

**Task status: COMPLETED for the targeted laboratory fix. Root cause: CONFIRMED by isolated reproduction. Architecture B: NOT APPROVED. Production: NO GO.**

The original Unix-socket readiness test accepted the Docker image's **temporary initialization server**, which deliberately fast-shuts down before the final PostgreSQL server starts. The original combined schema/payload query could connect to that temporary server and be terminated during its shutdown. An isolated regression probe reproduced the exact `FATAL: terminating connection due to administrator command` and psql exit 2 while loading the original 32768-row query. The corrected TCP readiness/query path passed both 1024-row smoke and 32768-row integrated tests without shrinking the generator.

This is a laboratory lifecycle correction, not approval of DR architecture, RPO/RTO, production capacity or ERP deployment. No production service, ObjectStoragePort, v1 backup or existing database was modified.

Date: 2026-10-27, America/Mexico_City; evidence timestamps are UTC on 2026-10-28. Work was linear without subagents. Baseline `main` / HEAD `18d25b22b79167c99c98bfe0054a9821a875b088` remained unchanged.

## 1. Sources and baseline preservation

Read `AGENTS.md`, all files in `scripts/database/dr-v2-feasibility/`, `Audit/ERP-DR-V2-FEASIBILITY-001.md`, debugging/documentation guidance and the applicable validation boundaries. FEASIBILITY-001 remains the earlier blocked snapshot and was not rewritten as a success.

Preserved the existing two tracked modifications: `.github/workflows/representative-replacement-benchmark.yml` and `scripts/database/test-representative-replacement-benchmark.py`. The tracked diff SHA256 remains `89140d8c835671be15172d755171fd754f8f1085bf6cff2b3034e2c610284b2f`; HEAD and cached diff are unchanged. Individually checked hashes of production Compose, ObjectStoragePort, the previous report and the laboratory Dockerfile against this task's initial snapshot. In particular, the user's pre-existing `openssl` package addition to the lab Dockerfile was preserved.

Only the lab Python/tests/README were updated and a regression-only Python probe added. New report/evidence is under the existing ignored `Audit/` tree. No stage, commit, push, image publication or production deployment occurred.

## 2. Root-cause evidence

### 2.1 Original behavior and confirmed mechanism

Before the fix, `waitsql()` invoked `pg_isready -U postgres` without a host, and every `psql` call also omitted the host. Both use the Unix socket. The official PostgreSQL initializer runs a temporary socket-only server, executes initialization and stops that server before starting the final one. [Official entrypoint source](https://github.com/docker-library/postgres/blob/master/docker-entrypoint.sh).

The upstream source explains the mechanism but is not substituted for the exact image's runtime evidence. The actual regression probe used the already built laboratory image and the original readiness, SQL connection method, version-query sequence and combined 32768-row/32-fragment CTAS query. It did **not** inject a stop, signal, artificial delay, OOM limit or administrative SQL termination.

| UTC / observation | Regression evidence |
| --- | --- |
| `03:12:10.738` | Temporary PostgreSQL PID 54 listens on the Unix socket |
| `03:12:10.750` | Temporary server reports ready; old socket readiness accepts it |
| `03:12:11.508` | Original combined query starts; two `CREATE TABLE` command tags are returned |
| `03:12:12.032` | Server PID 54 receives **fast shutdown request** during image initialization |
| `03:12:12.033` | Backend PID 103 emits **FATAL: terminating connection due to administrator command** |
| Client result | psql exit **2**, lost connection; query elapsed **0.544 s**, well below its 300 s timeout |
| Container state captured before cleanup | `Running=true`, `ExitCode=0`, `Restarting=false`, `OOMKilled=false` |
| Memory evidence | cgroup `oom=0`, `oom_kill=0`, `oom_group_kill=0`; current memory 173477888 bytes, not a peak measurement |
| Docker events before cleanup | Failed exec exit 2; no container stop/kill/die event explaining the SQL termination |
| Probe outcome | `REPRODUCED_ADMINISTRATOR_TERMINATION`; cleanup **PASSED** |

Full evidence: `Audit/evidence/ERP-DR-V2-FEASIBILITY-002/legacy/{commands.jsonl,diagnostics-legacy-pre-cleanup.json,result.json}`. This reproduces the supplied symptom and confirms the harness defect. The original Warp run's lost server logs cannot be retroactively reconstructed; its historic OOM state is not invented.

### 2.2 Why this is not a generator or OOM diagnosis

The same 32768 × 32 aggregation succeeded after waiting for the final TCP server. No SQL volume reduction, memory-limit increase, PostgreSQL tuning, timeout increase, start-fast change or architecture change was required. An administrative shutdown is not by itself proof of OOM. The reproduced failure's server log, container state and cgroup counters instead identify the initialization shutdown race.

No harness stop/removal runs during the original failed CTAS: source destruction is intentionally later, after backup/archive and negative checks; cleanup only follows the exception. `subprocess.run(timeout=300)` did not expire in the reproduced failure. The temporary server shutdown comes from the image initializer, not from cleanup or an SQL `pg_terminate_backend` call.

## 3. Changes made

| File | Change |
| --- | --- |
| `lab.py` | Readiness explicitly targets container-local TCP `127.0.0.1:5432/postgres`, then confirms an actual query and non-recovery source. SQL calls use the same explicit TCP endpoint. No public database port added |
| `lab.py` | Separate `schema_creation`, `synthetic_payload_load`, `synthetic_payload_verify`; verify count, min/max row byte length and total bytes. Original generator retained |
| `lab.py` | Per-command sanitized JSONL: stage, UTC start, timeout, elapsed seconds, exit/outcome, safe operation/program summary and SQL fingerprint; capture timeout/launch failure without raw argv or credential-bearing exception text |
| `lab.py` | Diagnostics before cleanup on success/failure and before intentional source deletion: own-service logs, state/exit/OOM/restarts, configured limits/signal, memory counters, process names, PostgreSQL state and relevant Docker events |
| `lab.py` | Bounded diagnostics continue despite an individual probe failing. Cleanup verifies prefix **and run ownership label**, continues after individual errors, and fails closed rather than deleting a resource with unproven ownership |
| `lab.py` | Credentials, cipher config and certificate material moved outside evidence into a private temporary directory; HMAC key stays in memory. Cleanup removes private material |
| `test_lab.py` | Existing seven tests retained; ten lifecycle/sanitization/volume/cleanup regressions added, **17 total PASS** |
| `reproduce_bootstrap.py` | Explicit isolated regression probe of the old behavior, never imported by the normal harness; preserves the original combined SQL and stops before backup if the race does not occur |
| `README.md` | Updated evidence state, reproduction, TCP bootstrap boundary, diagnostics/privacy/cleanup and limitations |

No new production-facing feature or application logic was introduced. No unrelated refactor was performed.

## 4. Diagnostic and privacy contract

Each execution writes only sanitized evidence under its own output directory. Persisted diagnostics never use full `docker inspect`, environment dumps, private file readback, raw exec argv or helper stdin. State and resource settings use selected format projections. Docker event `Action` can embed exec arguments, so command text after `exec_create:` / `exec_start:` is removed; event identity, timestamp, signal and exit are retained. SQL bodies are identified by SHA256 in command summaries.

Redaction covers generated test access/secret/cipher values, private-key PEM blocks, password assignments and credential-bearing PostgreSQL URLs. Existing captured event files were normalized to the final command-omission policy before archiving; those normalized artifacts and hashes are retained. No application data is used. The unit RED transcript was sanitized for ephemeral test tokens before retention.

Outputs include `commands.jsonl`, `diagnostics-pre-cleanup.json`, optional `diagnostics-before-source-loss.json` and `result.json`. Legacy reproduction uses `diagnostics-legacy-pre-cleanup.json`. Failed stage, command class/fingerprint, exit and elapsed time remain available even after resources are removed. Diagnostics run before any destructive cleanup. Individual diagnostic failures are explicit, not silent PASS.

## 5. Environment, resource limits and emulation

| Item | Verified scope |
| --- | --- |
| Docker | Client/Engine 29.8.2, Docker Desktop 4.95.0 (242831), Darwin ARM64 client / Linux ARM64 daemon |
| Laboratory image actually executed | `sha256:19a20dce57743acf0d8bfa51b96b048a7a4dc57b130a9101a5e0f93220556afd`; existing local lab build, no publication |
| DB/extensions | PostgreSQL **16.14**, x86_64 Linux musl; PostGIS **3.5.7** from SQL readback |
| Backup engine | pgBackRest **2.60.0**; native full backup and restore executed |
| Source archive | Image reports SHA256 `7409309d5b69365ecc21f3f9c377056a6a4cdc327ce062e41354a442989d22d0`; this is recorded checksum evidence, not an independent signature attestation |
| S3 | Existing digest-pinned PGSTY SILO isolated container; self-signed TLS with verification bypassed only for the laboratory |
| Resource limits | Source inspect: memory=0, swap=0, nano_cpus=0; cgroup memory.max=`max`. No explicit per-container memory/CPU cap; this does **not** mean unlimited physical Docker VM capacity |
| Source signal / restarts | Configured stop signal SIGINT; restart count 0 in successful snapshots |
| OOM evidence in all three source snapshots | `OOMKilled=false`, memory.events `oom=0`, `oom_kill=0` |
| Memory.current | Smoke 288112640 bytes; full 439664640 bytes; legacy 173477888 bytes. Snapshots, **not peaks or capacity recommendations** |

The AMD64 database image is emulated on ARM64. Hash generation, startup, checkpoint scheduling, disk cache and S3 networking are laboratory-specific. No duration is a native AMD64/VPS or real-B2 benchmark. Direct shell Docker checks in this agent initially remained denied; the explicitly authorized Python harness execution did access Docker and produced the runtime evidence. Two later supplemental shell-side observation probes failed locally without changing the running full test; they are not treated as PostgreSQL failures.

## 6. Smoke and complete run results

| Criterion | Smoke: 1024 rows | Full: 32768 rows |
| --- | --- | --- |
| Prefix | `erp-dr2-lab-48b27ac57f` | `erp-dr2-lab-9c8646cb5a` |
| PostgreSQL/S3 initialization | PASS | PASS |
| Schema creation | PASS | PASS |
| Original 32-fragment synthetic load | PASS | PASS |
| Payload row count × bytes | 1024 × 1024 = **1048576** | 32768 × 1024 = **33554432** |
| Source DB size | 20896791 bytes | 58366999 bytes |
| Physical full backup / continuous archive check | PASS | PASS |
| Intentional source container and volume loss | PASS, only owned resources | PASS, only owned resources |
| Timestamp PITR | PASS: recovery paused; `before` present / `after` absent | PASS: recovery paused; `before` present / `after` absent |
| Historical S3 | PASS: both exact versions after current-name deletion | PASS: both exact versions after current-name deletion |
| Combined DB/S3 | Restored DB selects historical version one; full byte/size/MIME/SHA readback resolves it | Same check PASS |
| Cleanup | **PASSED**, no cleanup errors | **PASSED**, no cleanup errors |
| Terminal mechanics result | `MECHANICS_PASSED_NOT_PRODUCTION_ACCEPTANCE` | Same |

Each of the two synthetic object versions is 1048576 bytes. SHA256 values are `08b2a8da54e3e185f025ac53633deae5a583c8880a72a21e169a1da022baa003` and `d27fe3c012c8ef70941e04176f46b638b174677f2de98b817f3b4f172d5c6743`. Exact provider version IDs and target timestamps/LSNs are in each `result.json`; latest-name retrieval is not substituted for historical GET. The target database's object binding points to version one although the source later switched to version two.

The runtime creates a real physical backup, removes the owned source container/volume, replays remote WAL to a UTC time target, pauses and queries recovered records. It does not use an existing development DB or real backup. Object verification reads protected synthetic remote versions; it does **not** claim a new production SeaweedFS hydration pipeline or full ERP business-invariant acceptance.

### Phase durations, seconds — emulation only

| Phase | Smoke | Full |
| --- | ---: | ---: |
| Container provisioning | 9.286 | 7.465 |
| Schema creation | 0.085 | 0.085 |
| Synthetic payload load | 0.131 | 1.673 |
| Physical full backup | 30.851 | 225.932 |
| WAL switch/archive check | 0.346 | 0.881 |
| Physical restore **including S3 transfer** | 1.079 | 1.180 |
| WAL replay to paused target | 0.927 | 1.401 |
| Objects plus DB validation | 0.850 | 0.883 |

The full backup's log explicitly says it waits for the next regular checkpoint: backup start requested at `03:07:00.349`, actual backup start LSN logged at `03:10:43.133`. Do not interpret the whole 225.932 s as data-copy throughput. `start-fast` and checkpoint policy were not changed to manufacture a better result. Transfer/restore and object/DB validation remain combined phases; no service-ready/cutover duration exists. Contractual RPO <=300 s and RTO <=3600 s are unchanged and **not certified** by these samples.

## 7. Failure tests and cleanup

Both successful runs retained the seven original scoped negative checks:

| Negative | Observed rejection / actual scope |
| --- | --- |
| Altered catalog | HMAC authentication rejection, not a production external-signature service |
| Other company | Authenticated catalog company mismatch, not full two-company IAM/network acceptance |
| Wrong SHA | Actual remote GET followed by `OBJECT_INTEGRITY_FAILED` |
| Missing historical version | Actual S3 `NoSuchVersion` |
| Wrong test secret | Actual S3 `SignatureDoesNotMatch` |
| Removed required WAL segment | Native archive-get exit 1, segment absent; bytes quarantined and restored in the owned repository |
| Stopped S3 repository | Native repository lookup fails with exception 103 / unavailable repository; not a configuration-option failure |

Archive-get rejection remains narrower than fresh PGDATA replay across a missing segment. Full 35-day retention, protected WORM/IAM, restart persistence, WAN/provider failures, money/inventory/receivable reconciliation and production cutover remain outside this task. No existing test was deleted or relabelled to imply those outcomes passed.

Cleanup passed in **three actual executions**, including the legacy SQL exception. Only generated, label-verified containers/volumes/network were removed. Unit tests additionally prove continued cleanup after a removal exception, refusal of a mismatched owner and continued service diagnostics after a log-probe exception. A simulated daemon failure is a **failed cleanup**, never a fabricated success. SIGKILL, loss of daemon or inaccessible ownership metadata can still prevent cleanup; these remain reported failures requiring later owned-resource inspection, not global prune.

## 8. Reproduction and evidence inventory

Use fresh output paths. No build is required if the same reviewed lab image is present; the Dockerfile was not changed in this task.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/database/dr-v2-feasibility -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/lab.py --output /private/tmp/erp-dr2-smoke-UNIQUE --rows 1024
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/lab.py --output /private/tmp/erp-dr2-full-UNIQUE --rows 32768
# Explicit OLD-behavior regression, never normal readiness:
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/reproduce_bootstrap.py --output /private/tmp/erp-dr2-legacy-UNIQUE
git diff --check
```

Evidence: `Audit/evidence/ERP-DR-V2-FEASIBILITY-002/`, with `smoke/`, `full/`, `legacy/`, sanitized `unit-red.log`, `unit-green.log` and a SHA256 inventory (`sha256.json`). The initial RED run retained seven original passes and reproduced six missing/defective lifecycle contracts (two assertion failures, four errors); final **17/17 tests PASS**. Static AST and baseline-preservation checks passed. No independent subagent review was used, following the explicit linear-work rule.

## 9. Residual risks and rollback

- The reproduced bootstrap race is fixed and the full requested volume passed. The old nondeterministic generator was not defective in these tests; it remains unchanged, with deterministic **volume validation**, not a false claim of identical random bytes across runs.
- Same-host synthetic storage and emulation do not establish production durability or recovery capacity. Architecture B remains **NOT APPROVED** and production remains **NO GO**.
- Bounded tail logs/events and snapshots are diagnostics, not continuous peak-memory sampling or a complete kernel forensic record. Future failures retain unknown/unavailable fields honestly.
- If a command times out, killing the Docker client need not cancel the remote SQL/backend immediately; diagnostics precede container cleanup to retain that evidence.
- Rollback boundary is only the lab lifecycle/diagnostic/test/README changes and the explicit legacy probe. Any authorized rollback must preserve the pre-existing Dockerfile, benchmark overlays, previous reports and source/production data, and acknowledge that reverting TCP readiness reintroduces the reproduced race. No rollback or destructive global operation was performed here.

## Key Learnings:

1. A Unix-socket PostgreSQL readiness response during Docker initialization can come from a temporary server that is about to stop; readiness must identify the final serving endpoint.
2. Administrator termination, container exit and OOM are distinct observations. The reproduced SQL failure happened during intentional bootstrap shutdown with a running, non-OOM-killed container.
3. Diagnostics and ownership-verified cleanup must survive the original failure independently; successful small synthetic PITR is not production RPO/RTO approval.
