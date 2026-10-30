# ERP-DR-V2-FEASIBILITY-003 — Causal recovery rejection and measured laboratory phases

**Status: COMPLETED for the requested isolated laboratory scope. Architecture B: NOT APPROVED. Production: NO GO.**

The final 1024-row and 32768-row suites each passed two real PostgreSQL PITR/historical-object recoveries and eight fault injections covering seven required fault classes. All incomplete candidates were rejected without acceptance or promotion. The retained first full-size attempt failed before injection; its cause was investigated and corrected, not counted as a negative-test success. These results establish laboratory mechanics, not contractual RPO, service RTO, production capacity or 35-day retention.

## 1. Scope, sources and preserved baseline

- Read `AGENTS.md`, reports `Audit/ERP-DR-V2-FEASIBILITY-001.md` and `002.md`, `Audit/ERP-PRODUCTION-DR-V2-DESIGN-001.md`, and the complete `scripts/database/dr-v2-feasibility/` laboratory.
- Branch: `main`; HEAD before/after: `18d25b22b79167c99c98bfe0054a9821a875b088`.
- Pre-existing tracked modifications preserved byte-for-byte: `.github/workflows/representative-replacement-benchmark.yml` and `scripts/database/test-representative-replacement-benchmark.py`. Tracked diff SHA256 remained `89140d8c835671be15172d755171fd754f8f1085bf6cff2b3034e2c610284b2f`; index stayed unchanged.
- Existing laboratory Dockerfile, bootstrap reproduction, original 17 tests, previous reports/design, production Compose and ObjectStoragePort were preserved. The lab directory was already untracked. `Audit/` is already ignored; no ignore/staging changes were made.
- No application changes, existing database access, business data, recovery-set-v1 changes, production infrastructure, deploy, image publication, commit or push. RPO **300 seconds**, service RTO **3600 seconds**, and recoverable retention **at least 35 days** are unchanged and NOT certified here. GO FUNCIONAL is not revisited or extended.

## 2. Environment actually exercised

| Component | Observed configuration |
|---|---|
| Docker | CLI/Engine 29.8.2; Docker Desktop 4.95.0 (242831), macOS client ARM64, Linux VM ARM64 |
| VM resources | 10 CPUs; 12,526,370,816 bytes RAM reported in preflight; shared host |
| PostgreSQL image | Existing `erp-dr-v2-feasibility:pg16-pgbr260`, AMD64 under emulation; observed image ID `sha256:19a20dce57743acf0d8bfa51b96b048a7a4dc57b130a9101a5e0f93220556afd` |
| Database/tools | PostgreSQL 16.14, PostGIS 3.5.7, pgBackRest 2.60.0 |
| pgBackRest source archive | SHA256 `7409309d5b69365ecc21f3f9c377056a6a4cdc327ce062e41354a442989d22d0` |
| Synthetic S3 | PGSTY SILO digest `sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7`; separate owned container/volume, same VM |
| Network/security | Private run network, no published ports; random disposable credentials; self-signed TLS with certificate verification disabled only in this lab |
| Cache state | `HOST_CACHE_UNCONTROLLED`; repeated fresh target PGDATA, not host/VM cold-cache runs |

No image build was needed during this task. These observations do not certify a native AMD64 release build or provider compatibility.

## 3. Laboratory changes

| File | Change |
|---|---|
| `scripts/database/dr-v2-feasibility/recovery.py` (new) | Strict shared restore/acceptance path, independent repository materialization, actual injected faults, typed rejection checks, phase metrics and target/run orphan verification |
| `scripts/database/dr-v2-feasibility/test_recovery.py` (new) | Eight regressions: specific rejection evidence, generic-error denial, traversal denial, unrelated S3-error denial, explicit backup selection, failure-origin preservation, unavailable timing, multiline event redaction |
| `scripts/database/dr-v2-feasibility/lab.py` | Extract preparation/catalog hooks without replacing legacy entrypoint; diagnose all fresh targets, cgroup peak, sanitize multiline Docker exec events |
| `scripts/database/dr-v2-feasibility/README.md` | Strict entrypoint, reproduction, evidence semantics, selection boundary, cache and production limitations |
| This report and `Audit/evidence/ERP-DR-V2-FEASIBILITY-003/` | Sanitized evidence, failed attempt, measurements, source/evidence hashes and test logs |

The earlier TCP-only readiness fix remains intact. Schema and load stages remain separate. The full generator still creates **32768 rows × 1024 bytes**, using 32 MD5 fragments per row; no volume reduction or acceptance-test removal. Its SQL payload is random; readback is checked against that run's source oracle rather than claiming identical bytes between runs. S3 test bytes use deterministic seeded generation.

### Recovery and acceptance path

1. Create only uniquely named/labelled disposable resources; prove S3 and final PostgreSQL TCP availability.
2. Generate/verify payload; take physical full backup, write identifiable transactions and flush/check archived WAL; run native `pgbackrest verify --output=text`.
3. Freeze a laboratory-authenticated candidate with company, UTC target, marker LSN, explicit completed backup label/stop time/LSN, repository SHA256/size inventory, exact object VersionId/SHA256/size/MIME, and payload oracle. Reject a target not following backup stop time/LSN.
4. Capture source diagnostics, then actually remove its container and PGDATA volume. Recoveries have no live source database.
5. Materialize repository bytes from the owned S3 repository to a separate owned POSIX volume; compare the transfer inventory to the frozen one. The database target mounts this repository read-only, separating transfer from native base restore and replay.
6. Authenticate company/catalog, GET and check backup-manifest bytes, GET the exact historical object version, check SHA256/size/MIME and persist it. Then restore into fresh PGDATA using explicit backup label, original fractional time target, timeline 1 and `target-action=pause`.
7. Require `before` sentinel present and `after` absent; exact restored DB JSON equals the selected historical object reference; complete payload count/bytes/ordered row-digest oracle matches; independent `sha256sum` reads the persisted object file; SQL confirms recovery **and replay paused**. Only then mark `accepted=true`, always `promoted=false`.

The MD5 row oracle is a synthetic readback regression aid, not a cryptographic authenticity claim. Object integrity and repository inventory use SHA256; neither ETag nor HEAD is used as proof.

## 4. Executions and positive evidence

Evidence root throughout this report: `Audit/evidence/ERP-DR-V2-FEASIBILITY-003/`.

| Evidence directory | Rows | Actual outcome |
|---|---:|---|
| `pilot-smoke/` | 1024 | PASS, two positive/eight negative trials, earlier instrumentation |
| `instrumented-smoke-before-pin/` | 1024 | PASS, two positive/eight negative trials, pre-selector correction |
| `failed-full-selector/` | 32768 | **FAIL** at first positive native restore, before any injection; cleanup PASS |
| `smoke/` | 1024 | **PASS**, two positives + eight injected rejections, cleanup PASS |
| `full/` | 32768 | **PASS**, two positives + eight injected rejections, cleanup PASS |

Primary acceptance counts use only `smoke/` and `full/`: **4 positive recoveries, 16 injected rejections**. Pilots are retained, not added to those totals. All five runs ended with empty run-labelled container/network/volume inventories.

| Readback | 1024-row suite | 32768-row suite |
|---|---:|---:|
| Payload rows | 1024 | 32768 |
| Payload bytes | 1,048,576 | 33,554,432 |
| Per-row min/max bytes | 1024 / 1024 | 1024 / 1024 |
| Observed PostgreSQL database bytes | 20,896,791 | 58,366,999 |
| Object versions | Two × 1,048,576 bytes | Two × 1,048,576 bytes |
| Selected backup label | `20261028-034730F` | `20261028-035524F` |

Each positive uses the version-one DB reference although source transactions subsequently selected version two. The operational key has already been replaced and delete-marked. Exact version-one GET remains possible and matches SHA256 `08b2a8da54e3e185f025ac53633deae5a583c8880a72a21e169a1da022baa003`, size and MIME. A final negative test explicitly deletes that **required VersionId**, verifies its absence, and independently verifies that version two remains readable. This deliberately demonstrates why versioning alone is NOT retention protection.

`smoke/result.json`, `full/result.json`, their `recovery-*.log` files and pre-cleanup diagnostics contain the exact UTC target/LSN/segment/version IDs and native target-pause evidence.

## 5. Seven causal fault classes — eight trials per volume

Before each injection, an actual healthy repository GET and exact required-version GET must succeed. Only the expected typed code at the expected boundary, with injection/native evidence, passes. Generic exceptions, unexpected provider codes, timeouts at unrelated stages, or a successful restore of an invalid candidate fail the suite.

| Class / trial | Real injection and required observable consequence | 1024 | 32768 |
|---|---|---|---|
| Required WAL missing | Quarantine the post-backup marker segment in the **actual materialized repository consumed by the new target**. Native restore reaches replay, then PostgreSQL reports `recovery ended before configured recovery target was reached`; `pg_ctl status` exits 3; control state is not production. `WAL_TARGET_UNREACHABLE` at `wal_replay` | PASS | PASS |
| Historical object missing | Delete actual required provider VersionId; native `NoSuchVersion` maps to `MISSING_OBJECT` at `object_preflight` | PASS | PASS |
| Incorrect SHA256 | Authenticated candidate contains incorrect SHA256; actual exact-version GET fails `OBJECT_INTEGRITY` at `object_preflight` | PASS | PASS |
| Incorrect size (same class) | Independently alter expected size; downloaded bytes fail `OBJECT_INTEGRITY` at `object_preflight` | PASS | PASS |
| Altered catalog | Change payload after signing; `CATALOG_AUTHENTICATION_FAILED` at `catalog_authentication` | PASS | PASS |
| Wrong S3 credentials | Actual GET with wrong secret gives native `SignatureDoesNotMatch`; `BAD_CREDENTIALS` at `repository_probe` | PASS | PASS |
| Other company | Valid laboratory signature but company B under company-A expected identity; `COMPANY_MISMATCH` at `catalog_authentication` | PASS | PASS |
| Repository unavailable | Stop only the run's S3 container; actual GET yields native `EndpointConnectionError`; `REPOSITORY_UNAVAILABLE` at `repository_probe`. Restart and successful probe required during repair | PASS | PASS |

All negative records have `injected=true`, `accepted=false`, `promoted=false`. Only the WAL scenario creates a PostgreSQL target; every preflight rejection occurs before target allocation. The WAL file is restored after its trial. Each scenario checks its target resources are absent afterwards; shared owned helper/S3/repository resources intentionally remain until terminal cleanup. The deliberately deleted object version is tested last, because uploading identical bytes would not recreate its provider VersionId.

Scope boundaries: this is a missing-segment test, not every corruption mode. Company denial tests catalog/restore identity, not two independent production IAM silos. Wrong SHA/size tests the authenticated expected metadata against real downloaded bytes, not a simulated network exception.

## 6. Measured phases and timing semantics

Durations use monotonic clocks; phase start/end evidence uses UTC. Rounded seconds below come from raw results; full precision and derivations are in `measurement-summary.json`. Parent phases include child phases: **do not add nested breakdowns twice**.

### Setup — excluded from recovery elapsed time

| Phase (seconds) | 1024 rows | 32768 rows |
|---|---:|---:|
| Resource preparation + availability + schema/load (parent) | 7.062 | 10.263 |
| Container provisioning including readiness (subset) | 6.500 | 8.164 |
| PostgreSQL TCP readiness (subset) | 5.267 | 5.269 |
| S3 availability and version setup (subset) | 0.502 | 0.613 |
| Schema (subset) | 0.081 | 0.082 |
| Synthetic load (subset) | 0.127 | 1.679 |
| Physical full backup creation | 31.754 | 225.829 |
| WAL flush/archive check after marker | 0.363 | 0.881 |
| Native physical backup validation | 0.716 | 0.897 |

`resource_operations` records resource-creation subprocess durations separately. The archive-check duration covers the explicit switch/check operation, not end-to-end continuous RPO lag. Backup creation/verification occurs before the simulated loss and is NOT recovery RTO.

### Positive recovery — two trials per volume

| Phase (seconds; observed min–max) | 1024 rows | 32768 rows |
|---|---:|---:|
| Repository S3 transfer + POSIX materialization | 2.417–2.422 | 2.661–2.767 |
| Repository preflight GET/integrity | 0.325–0.333 | 0.328–0.337 |
| Exact historical S3 recovery/verification | 0.346–0.361 | 0.337–0.344 |
| Target container/PGDATA preparation | 0.181–0.215 | 0.187–0.202 |
| Native physical PostgreSQL restore | 0.980–1.004 | 1.089–1.107 |
| PostgreSQL start + WAL replay to pause | 0.499–0.500 | 1.198–1.218 |
| DB/object persisted readback and integrity | 0.365–0.372 | 0.465–0.518 |
| **Local data recovery elapsed** | **5.142–5.185** | **6.347–6.422** |
| Target diagnostic capture + cleanup, after recovery | 5.580–5.694 | 5.618–5.630 |
| Terminal shared-resource cleanup | 0.473 | 0.472 |
| Terminal orphan verification | 0.054 | 0.058 |

Repository materialized bytes: **15,378,880** (smoke), **92,820,384** (full), including compressed/encrypted base/WAL/metadata. Effective local materialization rates: **6.056–6.068 MiB/s**, **31.993–33.261 MiB/s** respectively. This size-dependent rate includes thousands of object/file operations and interpreter/CLI overhead; it is not network line rate or production restore throughput.

Inside repository materialization, actual WAL GETs total **8,081,520 bytes / 0.0254–0.0256 s** and **67,586,880 bytes / 0.1030–0.1065 s**. These cached same-VM helper timings are nested subsets, not additive phases or WAN evidence. Base-file GET timings are separately recorded as `backup_get_seconds`.

**Native archive-get sub-breakdown: NOT_AVAILABLE.** The restored configuration did not emit INFO completion-duration lines. Raw primary results contain `reported_ms: 0` from an earlier empty-list summation; that value is NOT a measurement of zero WAL I/O. `measurement-summary.json` reparses the retained native logs and reports `null`, `NOT_AVAILABLE`, zero samples. The final extractor and regression now preserve this distinction. Measured host `wal_replay` and helper WAL transfer remain valid. Failure-origin preservation and this optional timing extractor were final diagnostic-only changes, unit-tested and checked against retained evidence, not followed by another integrated suite; successful restore/injection logic was unchanged.

The elapsed path starts at repository materialization and ends at verified paused recovery, before diagnostic cleanup. It excludes backup creation and initial source setup. It also excludes replacement-host provisioning, infrastructure recovery, ERP/GIS startup, DNS/routing, promotion/cutover and user-visible service validation. **It is NOT service RTO.** No maximum production-recoverable volume or linear extrapolation is justified by these two small sizes/two repetitions.

### Resources and repeatability

Observed source cgroup `memory.peak` before loss: **275,070,976 bytes** (smoke), **580,882,432 bytes** (full); cgroup OOM/kill counters zero, `OOMKilled=false`. These include cgroup accounting/cache, not process RSS or whole-run host peaks. Container limits were unbounded within the shared VM. Docker stats, cgroup, server state/events and image identity are retained at diagnostic checkpoints, not as a continuous CPU/IOPS profiler. The SILO limits-template query returned exit 1/empty output; that specific detail is unavailable, not asserted measured.

**Cold-cache trials: NOT_RUN.** Globally flushing host/VM caches or restarting the shared daemon would affect unrelated resources. Fresh containers/PGDATA plus repeated repository downloads are the safe repeatability boundary. Two repetitions describe observed variation only; no percentile/SLA conclusion is defensible.

## 7. Investigated failure — same-second backup selection

The first 32768-row suite (`failed-full-selector/`) exited 75 at `postgres_restore`: no backup set with stop time less than `2026-10-28 03:41:50.550626+00`. The completed backup stop epoch was `1793158910`, the same integer second; the post-backup marker LSN followed backup stop LSN. This was before injection, so it remains **FAIL**, not an expected-negative PASS.

Confirmed mechanism: pgBackRest's automatic selector stores time in `time_t` and uses a strict backup-stop-before-target comparison. Explicit `--set` takes a separate selection branch. See the pinned [pgBackRest 2.60.0 restore selector source](https://raw.githubusercontent.com/pgbackrest/pgbackrest/release/2.60.0/src/command/restore/select.c.inc), lines 51–84 and 138–140. The lab now authenticates/pins the completed backup label and passes `--set` while preserving the exact target, WAL requirement and fail-closed checks. No artificial wait, altered target, retry blanket or contractual relaxation was used. Both sizes then passed integrated tests.

The failed run's top-level `failed_stage` was overwritten by cleanup, but `failed_command.stage=postgres_restore`, exit code, stderr and phase records preserve the real origin. The final fix records the first unexpected failure origin before cleanup; its RED/GREEN regression is retained. No OOM cause is alleged.

## 8. Evidence, diagnostics and cleanup

- `result.json`: scenario outcomes, exact native causes, target/backup/object binding, UTC/monotonic phases, cleanup and orphan checks.
- `commands.jsonl`: bounded sanitized output, safe command summaries (not raw argv), SQL hashes, exit/timeout and elapsed duration.
- `diagnostics-*.json`: all still-existing owned services' logs, state/exit/OOM, Docker events, stats, PostgreSQL/cgroup/recovery state before source deletion, before target deletion and before terminal cleanup. Empty service logs remain empty; they are not fabricated.
- `recovery-*.log`: actual target pause or missing-WAL fatal result. `unit-red*.log` and `unit-green.log`: retained regressions and **25/25 PASS** (17 originals + eight new tests).
- `measurement-summary.json`: transparent derived phase/rate inputs and unavailable-native-timing correction. `source-hashes.json`: final lab file SHA256. `final-checks.json`: preservation, parsing, scenario and report checks. `sha256.json`: checksum manifest of the 96 evidence files (about 29 MB); checksums detect local changes, not external attestation.

Credentials/config/certificate material remain in a separate private temporary directory and are removed by cleanup; no private key or connection string is part of the evidence bundle. Docker exec event text is omitted, including multiline bodies. Evidence was allowlisted to logs/JSON, recursively sanitized and scanned for sensitive patterns; no unredacted credential/key/connection-pattern matches were found. Candidate HMAC signatures and synthetic object IDs/checksums are evidence, not secrets.

Cleanup verifies prefix and owner label before deletion; no global Docker prune, unrelated-resource inspection, cache flush or existing-volume attachment. Scenario orphan checks cover that scenario's resources; terminal checks cover all resources labelled with that run ID. **PASS under success, native WAL failure and the initial unexpected selector exception**. Daemon loss/SIGKILL outside Python cleanup is not proven and still requires scoped operator reconciliation.

## 9. Reproduce and inspect

Use the existing lab image or the README's isolated build command; never substitute production credentials/endpoints. Each output directory must be new.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s scripts/database/dr-v2-feasibility -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/recovery.py \
  --output /private/tmp/erp-dr2-003-smoke-UNIQUE --rows 1024
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/recovery.py \
  --output /private/tmp/erp-dr2-003-full-UNIQUE --rows 32768
```

Expect `LAB_RECOVERY_AND_CAUSAL_REJECTIONS_PASSED`, ten scenario records per run, exact negative causes, `cleanup=PASSED` and empty final orphan inventories. Any mismatch or unrelated error is FAIL, not PASS. Docker access denied/unavailable is BLOCKED, never synthetic runtime success. Do not upload private temporary material or infer production capacity from the elapsed seconds.

## 10. Residual risks and next acceptance gates

| Gate | Current status / required evidence |
|---|---|
| Synthetic PITR, historical versions, DB/S3 relation, seven fault classes | **PASS**, bounded results above |
| Native AMD64 | **NOT_RUN**. Repeat exact suite on disposable native host with image digest/build provenance, representative sizes, sustained WAL, constrained CPU/RAM/IOPS, measured disk/network and isolated cold/warm runs; more repetitions before percentile estimates |
| External S3/B2 | **NOT_RUN**. Separate real failure domain/account; TLS verification, provider VersionId/checksum behavior, WAN/rate/egress costs, independent readback, credential rotation/revocation, explicit least-privilege roles and two-company cross-denial |
| Object Lock / retention at least 35 days | **NOT_PROVEN**. Explicit per-version retention, delete/shorten-denial under writer/restore/admin threats, retained backup+WAL chain, key custody and elapsed/representative retention acceptance. Bucket versioning or creation with ObjectLockEnabled is insufficient |
| Total host loss / key custody | **NOT_PROVEN**. This removes owned source container+PGDATA only, not the VM/S3 host. Restore from externally held signed catalog, keys, repository and objects with no source/private working directory |
| RPO at most 300 seconds | **NOT_PROVEN**. Continuous integral recoverable frontier under load/outage and induced host loss; last acknowledged DB/object commit measured independently, fail-closed policy approved |
| RTO at most 3600 seconds until service | **NOT_PROVEN**. Replacement provisioning through authenticated ERP/GIS/business readback and routing/cutover; backup creation excluded unless required during actual recovery |
| Production integrity | **NOT_RUN**. Money, inventory, receivables, evidence and schema/image compatibility acceptance with representative synthetic workload; no existing ERP database used |
| Production catalog / security | **NOT_IMPLEMENTED**. In-memory lab HMAC is not external signing/custody, catalog-v2 rollout, retention enforcement, immutable remote attestation or company-isolated IAM |

**Limited verdict: B_FEASIBLE_FOR_MEASURED_SCOPE — isolated synthetic laboratory only.** Do not overturn the prior design's medium/high scenario concerns. Adopt B only after representative native/external end-to-end evidence meets the unchanged contracts with operational headroom. Escalate to a revised design/C (prepositioned recovery copies, standby/HA and independently protected objects) if measured transfer, replay, provisioning, service validation or outage durability cannot fit the approved budget. HA does not replace historical backup/WAL/object retention.

Pending business approval remains unchanged: availability-versus-remote-durability policy, failure-domain/provider/IAM/key custody, representative workload/cost budget, and selection of B versus C. **Architecture approved: NO. Production: NO GO.**

## Key Learnings:

1. A negative recovery result is evidence only when a healthy control reaches the injection boundary and the expected native failure prevents acceptance/promotion.
2. Pin the verified physical backup identity; fractional time targets must not depend on automatic second-granularity backup selection.
3. A paused synthetic recovery, same-host versioning and cached transfer speeds do not prove service RTO, remote retention or production capacity.
