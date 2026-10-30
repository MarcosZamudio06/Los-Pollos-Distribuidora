# ERP-DR-V2-FEASIBILITY-001 — Isolated feasibility checkpoint

**Task status: BLOCKED — BLOCKED_ENVIRONMENT for integrated runtime. Technical verdict: INCONCLUSIVE. Architecture approved: NO. Production: NO GO.**

The laboratory image successfully compiled pgBackRest 2.60.0 on the proposed PostGIS parent. Subsequent Docker invocations failed even through the approved outside-sandbox execution path. No PostgreSQL recovery, versioned-object experiment or capacity benchmark could be launched. This is neither evidence that B works nor evidence that B fails its RTO.

Prepared laboratory code is persisted for continuation, **not represented as a validated implementation**. Seven pure contract tests passed; these are not the seven real resilience experiments requested. No measured recovery throughput or maximum recoverable production volume exists from this task.

Date: 2026-10-27, America/Mexico_City. Linear work, no subagents. No production/development database, real backup, business traffic or external company credential was used.

## 1. Preflight and preserved baseline

| Item | Observed state |
| --- | --- |
| Branch / HEAD | `main` / `18d25b22b79167c99c98bfe0054a9821a875b088` |
| Existing modified files | `.github/workflows/representative-replacement-benchmark.yml`; `scripts/database/test-representative-replacement-benchmark.py` |
| Existing index | Preserved byte-identical, checked through cached-diff hash |
| Existing tracked diff | SHA256 `89140d8c835671be15172d755171fd754f8f1085bf6cff2b3034e2c610284b2f`, preserved |
| Workflow overlay SHA256 | `fce73f9910d8ff7ea4b0666a0938a6e0dac68411e5e2863f45bd95ec4a53b703` |
| Benchmark test overlay SHA256 | `f9232bfe007beeb83c3caf53d9f59f7d6602460bcf932d52763448598e97240c` |
| Production Compose, ObjectStoragePort and prior design | Hashes checked unchanged |
| New tracked-path candidates | Only the new `scripts/database/dr-v2-feasibility/` directory; no stage/commit/push |
| New audit evidence | This report and `Audit/evidence/ERP-DR-V2-FEASIBILITY-001/`; already ignored by the existing Audit rule |

Read AGENTS.md, deployment/design context, relevant production audit/remediation sections, the DR v2 design's contracts/sizing/acceptance boundaries, validation guidance, documentation and debugging skills. Sources: `Audit/ERP-PRODUCTION-READINESS-001.md`, `Audit/ERP-PRODUCTION-READINESS-REMEDIATION-001.md`, `Audit/ERP-PRODUCTION-DR-V2-DESIGN-001.md`, `docs/validation.md`. Previous functional acceptance remains unchanged. Remote Quality Gate was not refreshed here: the user's stated green status is not reissued as a newly verified claim.

The unchanged targets are integral RPO <=300 seconds, service RTO <=3600 seconds and recoverable retention >=35 days. No lower criterion was substituted.

## 2. Environment actually observed

| Component | Actual observation / qualification |
| --- | --- |
| Host | Darwin ARM64; roughly 82 GiB available on the inspected filesystem at preflight |
| Host Python | Python 3.9 from the Xcode framework, as shown by the unit-test traceback |
| Docker initial check | Engine/client 29.8.2; Docker Desktop 4.95.0 (242831); daemon Linux ARM64; context `desktop-linux` |
| Compose | v5.6.0; not used to modify any existing project |
| Running containers | Initial `docker ps` returned no entries; later inventory unavailable |
| Existing data | No existing container volume was inspected or attached. Image inventory only; no Docker environment/secrets inspection |
| Lab DB image | Local build `erp-dr-v2-feasibility:pg16-pgbr260`, AMD64 under ARM64 emulation |
| pgBackRest | Build output and a short-lived `docker run --rm ... pgbackrest help` confirmed **2.60.0** |
| Actual PostgreSQL/PostGIS SQL versions | **NOT MEASURED**: no database instance started. Parent specifies PG16/PostGIS3.5; tag is not SQL runtime proof |
| S3 backend | Original MinIO pull rejected. PGSTY SILO alternative pinned in prepared harness, but no successful runtime version or S3 call performed |
| External repository | Prepared as independent S3 container/volume, never started; same daemon would not equal a separate physical failure domain |

### Failure chronology and bounded investigation

1. Sandbox Docker calls returned `operation not permitted`. The approved escalated retry **succeeded** for Docker version/info and inventory. It was therefore appropriate to attempt a disposable lab, not immediately fabricate an environment block.
2. The local image build completed. BuildKit emitted `pgBackRest 2.60.0`, exported the local image and did not push it.
3. Querying the exact binary rejected `repo-storage-type` as an invalid archive-push option (error 031). The prepared configuration removed that option and switched its planned S3 endpoint to self-signed TLS; this corrected configuration remains runtime-unverified.
4. `docker pull minio/minio:RELEASE.2025-04-22T22-12-26Z` returned `pull access denied ... repository does not exist or may require docker login`. No login/credential repair was attempted. That error alone cannot distinguish removal from authorization failure.
5. Later escalated Docker queries failed with shell exit **127**, `zsh: operation not permitted: docker`, including an absolute-path retry and a final `docker version`. Four subsequent diagnostic invocations showed the same execution block. No SQL/S3 experiment was launched. No runtime/toolchain workaround or global permission repair was attempted.

The root cause of the **later Docker execution prohibition is UNDETERMINED**. A daemon-down error was not observed; the shell failed to launch the client. Do not label the whole machine Docker-less, or claim the initial successful build proves continued availability. This is `BLOCKED_ENVIRONMENT` for the required experiments.

Primary references checked: [pgBackRest release 2.60.0](https://pgbackrest.org/release.html), [official build guide](https://pgbackrest.org/user-guide.html#build) and [pinned Meson source](https://raw.githubusercontent.com/pgbackrest/pgbackrest/release/2.60.0/meson.build). The local S3 alternative comes from the [PGSTY SILO release](https://github.com/pgsty/silo/releases/tag/RELEASE.2026-10-18T00-00-00Z); this is a laboratory choice, not a recommendation to change production storage or proof of B2 equivalence.

## 3. Prepared reproducible configuration

| New file | Purpose / actual validation |
| --- | --- |
| `scripts/database/dr-v2-feasibility/Dockerfile` | Isolated PG16/PostGIS3.5 parent plus source-built 2.60.0 and Python/boto3 tools; **build succeeded** |
| `scripts/database/dr-v2-feasibility/lab.py` | Owned-resource orchestration, synthetic rows/objects, S3 repository, PITR target, source removal, catalog/byte checks and bounded cleanup; **integrated execution NOT RUN** |
| `scripts/database/dr-v2-feasibility/test_lab.py` | Seven pure tests for catalog authentication/company isolation, canonical ordering and exact SHA/size/MIME comparison; **PASS**, not network/storage proof |
| `scripts/database/dr-v2-feasibility/README.md` | Reproduction, limitations, credentials/evidence separation and cleanup boundary |

Pinned DB parent:

```text
postgis/postgis:16-3.5-alpine@sha256:becb8d49a20a2c1fcce1b154e853e1ea1a19cd5de99310852888b998694ec2ea
```

Actual locally built image manifest: `sha256:4c8b8afbb27aeb6f6de53a554b9f2d384898f08615d79797acbb080307dc21e1`; exported local image index: `sha256:9f96db2985a7707f8076258cf2144747eb4763344923cc2b72feee9fd5c67f1e`. Neither is a published release artifact. Source archive checksum is generated inside the image; its retrieval was blocked by later Docker restrictions. Do not claim independent signature/provenance verification of that archive. OS dependencies are not a locked production supply chain.

Prepared S3 image: `pgsty/silo@sha256:2636fc4155d9a7e41ff58cdb65ddd13ba9304e67184e13c25bc5cb34016269d7`. The mutable existing tag was observed in image inventory; actual execution of the pinned alternative remains unverified.

Planned namespace is a random `erp-dr2-lab-*` prefix with labels. Network is Docker-internal, no published ports; all volumes are new and recorded by that run. Credentials/cipher password are random test-only values generated under a private temporary directory, not checked in. Source database container receives no existing ERP config. The helper retains a private test HMAC key outside the source container; shared audit evidence must exclude that secret/config.

Repository uses native pgBackRest S3 operations, `archive_mode=on`, `archive_timeout=60s`, synchronous archive-push acknowledgement, zstd compression and AES-256-CBC repository encryption. The planned S3 TLS certificate is self-signed with verification disabled in the isolated lab. This **does not** validate production TLS, IAM separation, object encryption, Object Lock policy or WORM retention. Bucket versioning and historical GET are separate from effective retention.

Reproduction after the execution surface is restored:

```bash
docker build --platform linux/amd64 -t erp-dr-v2-feasibility:pg16-pgbr260 scripts/database/dr-v2-feasibility
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/database/dr-v2-feasibility -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-feasibility/lab.py --output /private/tmp/erp-dr2-run-UNIQUE --rows 32768
```

Use a fresh output path. Review the README before execution. Integrated harness correctness is not established by this command being written. No production endpoint/credential input is accepted by its CLI. The lab image/cache is retained locally; no global Docker prune or image deletion was performed. Temporary binary-version queries used `--rm`; no persistent source/S3 lab container or named volume was created. Final daemon inventory could not be checked, so absolute daemon cleanup is not claimed.

## 4. Required experiments — evidence state

| Experiment | Prepared method | Actual result |
| --- | --- | --- |
| A — PostgreSQL | Physical full before identifiable transactions, archive WAL, UTC time target, named marker/LSN cross-check, pause recovery, verify `before` exists and `after` does not | **NOT RUN / BLOCKED_ENVIRONMENT**; no base, WAL archive, recovery sentinel or SQL version evidence |
| B — Objects | Two synthetic versions under one key, delete current name, GET both exact versions and compare body/SHA256/size/MIME | **NOT RUN**; no version IDs, readback or historical object evidence |
| C — Consistency | DB points to first protected object at target, later switches to second; restored DB must resolve first exact version | **NOT RUN**; no persisted DB/S3 integrity evidence |
| D — Source loss | Remove only generated source container/volume; restore using separate S3 volume and external-to-source test config | **NOT RUN**; source-loss resilience not proven |
| E — Measurement | Monotonic durations per phase and real bytes; multiple approved synthetic scales/cold runs | **NOT RUN**; no recovery rate or production-capacity conclusion |

Prepared test catalog binds company, target time, marker/LSN, required segment and exact object identities/hashes. HMAC is a laboratory authentication mechanism only, **not implementation of the production v2 signed catalog**. The harness is not connected to ObjectStoragePort or ERP writers. It must still validate actual PostgreSQL system identifier/timeline and full dependency closure before qualifying as a production-format verifier.

## 5. Resilience and fail-closed evidence

| Required failure | Pure validation evidence | Real integrated evidence |
| --- | --- | --- |
| Missing WAL segment | None claimed | **NOT RUN**. Prepared native archive-get rejection; additionally require fresh PGDATA replay beyond the gap and proof that target is unreachable, not just a missing-file command |
| Missing historical object | None claimed | **NOT RUN**; planned exact-version GET with nonexistent version must fail |
| Incorrect SHA256/size/MIME | Shared comparison helper rejects each altered value in unit tests | **NOT RUN**; real S3 bytes still need independent GET/readback |
| Altered catalog | HMAC tamper test rejected payload change | **NOT RUN** for remotely persisted/selected catalog |
| Wrong credentials | Wrong HMAC key rejected in unit test, not S3 credentials | **NOT RUN** for S3 auth and pgBackRest repository credentials |
| Other company | Pure authenticated company binding rejected | **NOT RUN** across real separate company data planes/buckets/keys |
| Unavailable repository | None claimed | **NOT RUN**; planned stop of owned S3 service and archive-get failure |

No negative condition may be recorded as PASS because a prerequisite was unavailable. Missing WAL/object/keys, unknown identity, invalid authentication or incomplete target must leave the result failed/blocked and routing closed. Future full failure tests must cover reader restart/persistence and independent credentials, not only in-process comparisons. These remain acceptance work.

## 6. Timing and measurements

| Stage | Actual duration / interpretation |
| --- | --- |
| Image dependency layer | BuildKit step reports 10.2 s; **image preparation only**, not VPS provisioning |
| Source build step | BuildKit reports 23.9 s; binary version output at 23.81 s; **not restore throughput** |
| Image export | BuildKit reports 14.6 s; **not data-transfer recovery measurement** |
| Full host provisioning | NOT MEASURED |
| Repository transfer | NOT MEASURED |
| Physical base restore | NOT MEASURED |
| WAL replay | NOT MEASURED |
| Historical object restore/readback | NOT MEASURED |
| DB/object validation | NOT MEASURED |
| ERP/GIS startup, routing/client validation | NOT MEASURED; absent from the current small mechanics harness |
| RPO / RTO to service | **UNKNOWN**, not zero and not PASS |

BuildKit steps can overlap and omit cached/pre-existing work; do not add them into a supposed cold-host provisioning SLA. Unit-test `0.000s` is rounded pure test time and is not a recovery measurement.

The prepared harness initially combines physical restore and S3 transfer. Separate transfer/materialization timing needs native-log/counter instrumentation or a separately timed protected-repository reconstruction before restore. Object and DB validation are also a combined phase until refined. No independent service-ready measurement exists. This instrumentation gap must be closed before fulfilling experiment E, even after Docker becomes usable.

## 7. Capacity and the three hypothetical scenarios

The prior design's numbers remain **hypotheses**, not measurements of this lab or business. With its fixed non-transfer/non-replay allowance of 1620 s, the following arithmetic describes the demand:

| Hypothesis | Small | Medium | High |
| --- | ---: | ---: | ---: |
| DB + required objects | 10 + 20 = 30 GiB | 100 + 200 = 300 GiB | 500 + 2000 = 2500 GiB |
| Assumed replay time from prior model | 60 s | 150 s | 300 s |
| Remaining transfer budget under 3600 s | 1920 s | 1830 s | 1680 s |
| Minimum aggregate effective pipeline rate under those assumptions | **16.00 MiB/s** | **167.87 MiB/s** | **1523.81 MiB/s** |
| Prior design hypothetical effective rate | 80 MiB/s | 150 MiB/s | 250 MiB/s |
| Prior model total | 2064 s | 3818 s | 12160 s |
| Rate actually measured here | **UNKNOWN** | **UNKNOWN** | **UNKNOWN** |
| Feasibility conclusion from this task | **INCONCLUSIVE** | **INCONCLUSIVE** | **INCONCLUSIVE** |

The medium/high cases exceed the objective **in the previous model**, not in an experiment that never ran. Minimum rates above include the model's pipeline scope; a NIC/link rate is not equivalent. Extra GIS retrieval, key/approval delay, native-repository reconstruction, decrypt/write/readback or low IOPS consumes more of the remaining budget.

Maximum estimable volume cannot be given numerically without measured rates. Once the relevant rates exist:

```text
T_data_budget = 3600 - measured_other_critical_path - measured_replay
Vmax_GiB_bound = max(0, T_data_budget) * measured_effective_MiB_s / 1024
```

This is a **conditional bound at a fixed workload mix**, not a linear capacity forecast. A better feasibility test measures DB bytes and objects separately:

```text
T_other + T_repo_materialize(D) + T_DB_restore(D)
        + T_replay(W) + T_objects(O, count, distribution)
        + T_full_readback(D, O) <= 3600
```

Use the measured critical path if phases actually overlap. Require multiple sizes, repeated cold-cache runs and p5 effective throughput/p95 durations; include incompressible payloads, API latency/small-object count, bandwidth contention, WAL peaks, crypto CPU, fsync, verification, throttling and adequate disk reserve. Do not extrapolate AMD64-under-ARM emulation or same-daemon networking to native AMD64 and WAN/B2. A synthetic 32–128 MiB table is useful for mechanics, not ERP sizing.

## 8. Adoption criteria, limits and escalation to C

**Consider B only after** exact-image PG/PostGIS compatibility, physical target/replay and historical S3 recovery pass with complete reference readback, all fault injections reject safely, and representative end-to-end **service** recovery fits 3600 s with margin. Establish externally protected company catalogs, effective retention >=35 days, custody, IAM, monitoring and an approved availability/durability policy. No 35-day elapsed-time proof exists here.

**Escalate/revise toward C** if measured recovery critical path cannot fit, cold provisioning/GIS/key/network availability lacks a bound, or business requires protection of acknowledged commits during prolonged remote outage followed by source loss. Candidate remedies include faster measured storage/network, shorter replay chains, preprovisioned replacement capacity, prepositioned verified objects/GIS, and an independently hosted standby with explicit commit/fencing policy. Each has recurring cost and operational complexity; no component or spend is authorized by this report.

Same-host S3/PG separation can test container/source-volume loss but cannot test VPS/cloud/provider loss. Versioning is not WORM. HMAC unit tests do not certify external trust roots or multi-company IAM. A replica does not replace historical backups/object protection. These limitations prevent `B_FEASIBLE_FOR_MEASURED_SCOPE`, `B_FEASIBLE_WITH_CONDITIONS` or `B_INSUFFICIENT_FOR_RTO` as evidence-based runtime verdicts today. The correct technical verdict is **INCONCLUSIVE**.

## 9. Evidence, pending work and restrictions

Evidence directory: `Audit/evidence/ERP-DR-V2-FEASIBILITY-001/`:

- `environment-status.json`: explicitly transcribed environment observations, blocker and **NOT_RUN** states; not a synthetic runtime result.
- `build.log`: actual successful image compilation/export output. SHA256 `105c15e5e205c4ec723b355e99104ee2842004b815764118740696aa9bf5e036`.
- `unit-red.log`: test collection failed before the exact-byte validator existed (ImportError); not a reproduced PostgreSQL defect.
- `unit-green.log`: seven pure contract tests PASS after adding the shared validator.

Executed static checks: Python AST parse, CLI help, seven unit tests, arithmetic recomputation, `git diff --check` and hash/diff preservation. No ERP/backend/frontend suite was run because application code was untouched. No successful integrated `lab.py` run or `result.json` exists. Do not use the environment-status file as one.

Next steps, in order: restore the approved Docker execution capability; run/review the prepared lab in fresh resources; fix actual observed harness failures under strict RED/GREEN; add fresh-gap replay/independent restart and phase instrumentation; repeat across measured synthetic scales; obtain an authorized representative profile and external provider/custody tests; only then reassess B/C and operational costs.

Unchanged restrictions: production Compose, ObjectStoragePort, ERP domain, RPO/RTO, v1 recovery sets, existing benchmark overlays, original design and GO FUNCIONAL. No commit/push, deploy, production server, real traffic or CFDI enablement. No access/permissions repair, Docker login, global prune or implicit B approval.

**Final result: BLOCKED_ENVIRONMENT / INCONCLUSIVE. Architecture approved: NO. Production: NO GO.**

## Key Learnings:

1. Successful image compilation and a binary version check establish a narrow compatibility foothold, not successful PITR or measured recovery capacity.
2. A later client execution prohibition must be reported even when Docker initially responded; unavailable runtime experiments cannot be converted into timings or PASS results.
