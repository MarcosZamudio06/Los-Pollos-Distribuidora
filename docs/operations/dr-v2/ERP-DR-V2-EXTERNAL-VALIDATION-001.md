# ERP-DR-V2-EXTERNAL-VALIDATION-001 — Independent validation preparation

**Status: PARTIAL. Local preparation and contracts validated; integrated external runner/adapters and infrastructure remain pending. Architecture B: NOT APPROVED. Production: NO GO.**

Prepared a separate native-host preflight, approved read-only external S3 probe, measurement/fault contracts, manual preparation workflow, and preservation inventory for ignored audits. **No native/external host-loss, PITR, service restore, remote retention or RPO/RTO acceptance was executed.** Every integrated external scenario is `BLOCKED_EXTERNAL_INFRASTRUCTURE`. Provider/source-loss/full-service adapters still require implementation against approved infrastructure; the workflow deliberately cannot provision or cut over.

Date: 2026-10-28 America/Mexico_City; execution evidence UTC is 2026-10-29. Work was linear, without subagents. This is implementation preparation, not an architecture approval or production deployment.

## 1. Preflight and current Git evidence

| Item | Current observation |
|---|---|
| Branch / HEAD | `main` / `cc9aa7c1acdb408e3e653583854921d1e23e31bc` |
| Initial working tree/index | Clean; no pending tracked or untracked modifications |
| Prior benchmark correction | **Already committed in the current checkout**, not still pending: `cc9aa7c1` includes the workflow initialization fix, its contract tests, DR lab and Dockerfile |
| Prior workflow hash | `fce73f9910d8ff7ea4b0666a0938a6e0dac68411e5e2863f45bd95ec4a53b703`, unchanged |
| Prior benchmark-test hash | `f9232bfe007beeb83c3caf53d9f59f7d6602460bcf932d52763448598e97240c`, unchanged |
| Prior lab Dockerfile | `0a7337f079fd81877ba4fdf8ecd2e6746826fd057986ce5aed112c0811ec4fe8`, unchanged, including OpenSSL correction |
| End working tree | Only new manual workflow, `scripts/database/dr-v2-external-validation/` and `docs/operations/dr-v2/` candidates; current report/evidence are ignored under existing `Audit` rule |
| Protected baseline | Existing lab files, legacy benchmark/workflow/tests, Quality Gate, production Compose, ObjectStoragePort and four prior reports/design byte-identical to preflight; HEAD/index unchanged |
| Docker | Both normal and explicitly authorized version-only invocations failed before client launch: `operation not permitted: docker`, exit 127. No daemon/resource inventory or new Docker runtime proof is claimed |

Read AGENTS.md, prior DR design, FEASIBILITY001/002/003, lab/recovery contracts, legacy workflow and replacement benchmark contracts, and applicable validation/documentation/debugging guidance. FEASIBILITY-003's four positive/16 negative synthetic results remain historical lab evidence, not measurements from this task. Its 5–6-second data-recovery path is not a service RTO.

No ERP application, ObjectStoragePort, production Compose, backups/recovery sets v1, original lab/Dockerfile or Quality Gate was modified. No existing database, business data, remote credentials, source/target host, remote bucket or retention setting was accessed or created. No image build/publication, infrastructure purchase, workflow dispatch, commit, push, staging cutover or production cutover occurred. GO FUNCIONAL is preserved within its original scope, not reissued for a new SHA by this task. CFDI is not enabled.

## 2. New files and reused code

| New file/path | Actual capability |
|---|---|
| `scripts/database/dr-v2-external-validation/contracts.py` | Strict non-secret config, exact SHA binding, digest/version/host/domain/TLS/retention/budget guards and proposed secret-free pgBackRest config |
| `prepare.py` | Offline preparation runner; optional Linux/x86_64 + Linux/AMD64 Docker check; sanitized blocked/result evidence; **no provisioning/restore adapter** |
| `probe.py` | Explicitly approved read-only S3 exact-version GET, HMAC test catalog + SHA256, streaming SHA/size/MIME readback, versioning/per-version compliance-retention checks, byte/time budgets. Real external execution **not run** |
| `metrics.py` | UTC/monotonic phase recorder, integral RPO/service timing/rejection contract validator, empirical p95 helper refusing samples <20; **not an external receipt authenticator** |
| `environment_gate.py` | Read-only GitHub Environment policy/secret-name metadata gate; missing reviewer policy, metadata permission or Environment secrets blocks. Not executed against GitHub |
| `custody.py` | Confined, hash-verified local export of allowlisted historical audits; no remote upload or Git writes |
| `config.example.json`, `profiles.json` | Intentionally unapproved template and three explicitly hypothetical sizing profiles; no credentials or real business volumes |
| `test_contracts.py` | 19 offline tests, including config/TLS/company/identity/budget denial, read-only probe behavior, metadata gate, SHA symbol, CLI blocked result and measurement boundary checks |
| `.github/workflows/dr-v2-external-validation.yml` | Manual protected-Environment **preparation + read-only probe**, not full replacement/DR execution |
| `docs/operations/dr-v2/external-validation.md` | Versionable detailed operator/adapter/security/measurement/fault/capacity/release contract |
| `docs/operations/dr-v2/baseline/` | Four byte-identical historical report/design copies + compact FEASIBILITY003 measurements/checks |
| `docs/operations/dr-v2/audit-custody.json` | Original/copy hashes and inventory of 121 historical ignored report/evidence files |
| `docs/operations/dr-v2/ERP-DR-V2-EXTERNAL-VALIDATION-001.md` | Versionable copy of this report, so it need not depend solely on the ignored Audit tree |

Existing lab is **not repointed** to real storage: its self-signed TLS and same-host assumptions remain isolated. Reused contracts: explicit verified backup label, TCP readiness, fresh target, causal rejection, historical VersionId + SHA/size/MIME readback, fail-closed acceptance, ownership cleanup. The new package does not import the legacy restore executor as a disguised PITR path. Legacy 24-hour RPO / `READY_FOR_CUTOVER` benchmark results retain their original meaning and are not v2 acceptance.

## 3. Native host, S3 and replacement contracts

Detailed executable interfaces and state transitions are in the versionable operator contract `docs/operations/dr-v2/external-validation.md`. Key gates:

- **AMD64:** separately approved disposable source, newly provisioned target and independent witness/catalog domain; actual native/no-emulation attestation, signed host IDs/quota/network receipts. Pin database+pgBackRest, probe, ERP and GIS images by registry digest and record actual versions. PG16/PostGIS3.5/pgBackRest2.60.0 compatibility is a candidate inherited from the synthetic lab, not proof for an unbuilt native image.
- **Limits:** per-service CPU/RAM/no-swap-overrun, dedicated disk quotas/scratch/free reserve, per-command/whole-suite deadlines, private ingress and approved egress. Config numeric guards are implemented; provider quota enforcement/attestation belongs to the pending host adapter. Example suite ceiling is 7200 seconds including setup/faults; service RTO stays 3600.
- **Ephemeral secrets:** Environment-only readback credentials and independent test catalog key; source writer/protector/retention/provision/witness roles separate. TTL/revocation and least-privilege denial require real provider evidence; config TTL is not proof that a long-lived B2 key expires. Keys must remain recoverable outside the lost host.
- **External storage:** explicitly approved provider/HTTPS endpoint/region/accounts, four distinct working/vault/objects/catalog buckets, company/run prefix and exact remote versions. TLS validation cannot be disabled. No PUT/create/delete/retention mutation method exists in the new read-only probe.
- **Retention:** probe conservatively accepts per-version COMPLIANCE mode through the configured horizon, example **47 = 35 + 7 base-gap + 5 margin** days. Governance remains an alternative requiring separately approved actual bypass-denial tests, not silently accepted. Never blanket-WORM mutable pgBackRest metadata. Live referenced objects remain protected while referenced; retire by last retained DB reference. No elapsed 35-day or malicious-deletion resistance proof exists here.
- **Catalog:** company/run authentication and exact version/checksum readback before object reads. Test HMAC is not implementation of the production v2 signer, receipt-journal closure or full system-ID/timeline/schema/image dependency verifier. Those remain pending adapters/contracts, not a completed security feature.
- **Loss experiment:** source whole-host fence verified by independent witness at incident onset, then new target allocated in another failure domain. Destination may use only authenticated declared bundle, external repositories/objects/keys/images/GIS/schema; no source volume/cache/container or undeclared checkout file. Keep target paused/writes fenced and private ingress closed through validation. Missing prerequisite rejects; no implicit cutover.

The workflow coordinator is hosted Ubuntu24.04, **not a replacement VPS**. Its existence never counts as measured host provisioning. The live host-loss and ERP/GIS/service execution adapters are intentionally absent until provider/host/policy approval; this is why task status is PARTIAL rather than complete integrated-runner readiness.

## 4. RPO/RTO instrumentation and acceptance

`PhaseRecorder` uses UTC start/end plus monotonic nanoseconds and preserves FAIL on exceptions. The independent observer must survive source loss; never subtract monotonic clocks from different hosts. Require measured clock error <=1 second and signed per-phase evidence/identity. The offline validator checks a contract; caller-supplied `authenticated_external_receipts=true` is **not cryptographic proof**. Independent receipt verification must precede it in the future executor.

```text
RPO_upper = incident_onset_UTC - latest_proved_integral_frontier_UTC + clock_uncertainty <= 300 s
RTO_upper = complete_validated_service_UTC - incident_onset_UTC + clock_uncertainty <= 3600 s
```

Frontier must prove physical backup+WAL/timeline/target/schema/images/keys and all referenced historical object versions; it cannot advance on upload/HEAD/ETag alone. Record external-observed acknowledged transaction sequence/commit UTC/LSN, before/after sentinels and version changes, then compare restored persisted state and lost-ack interval independently. Never reset clocks to declaration/pg_restore/S3-start or move target to manufacture PASS.

Required phase receipts cover frontier/loss witness, new host provision, images/secrets, repository transfer, physical restore, replay WAL, historical object versions, compatible schema/migrations, backend/frontend, GIS, API+Socket, sales/receivables/inventory/settlement reconciliations, private staging client-service validation and cleanup. Count post-incident transfers/readback and key delays; exclude pre-incident backup creation. Nested/pipelined phases use measured critical path, not double-counting or imaginary overlap.

Sales/payments, Payment-derived receivables, per-location inventory lineage, settlement/cash differences and evidence bindings require exact synthetic semantic oracles and persisted independent readback; counts alone are insufficient. Do not apply automatic migrations before schema/target compatibility validation. Staging service endpoint is private; production cutover remains forbidden. A successful future staging drill still does not authorize production routing.

**Actual measured RPO/RTO in this task: null / null.** No service, provisioning, network restore throughput or native p95 observation exists. Contract fixtures asserting timing boundaries are unit tests, not synthetic runtime measurements.

## 5. External scenarios and observable rejection

| Scenario | Required independent evidence | Current execution |
|---|---|---|
| Whole origin-host loss | Independent unreachability witness; positive recovery only from external bundle/copies/credentials/new host | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Archive network interruption | Source-only controlled egress failure, backlog/frontier stop, approved write-fencing behavior; unsupported later candidate rejected | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Required WAL absent | Disposable materialized repo gap; new PGDATA replay cannot reach target; no promotion | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Historical version absent | Required exact-version provider failure; complete candidate refused | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Hash/size mismatch | Real downloaded bytes disagree with authenticated metadata; refusal before acceptance | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Unauthenticated catalog | Tamper/untrusted-key rejection before allocation | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Incorrect credentials | Real provider auth failure at injected request, not an earlier setup error | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Cross-company access | Real separate IAM/bucket/key/catalog/restore identities deny A->B | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Partial restore | Missing declared dependency makes full reference/schema/domain verifier reject | BLOCKED_EXTERNAL_INFRASTRUCTURE |
| Service startup failure | Owned backend/frontend/GIS fault causes health/client rejection, no promotion/traffic | BLOCKED_EXTERNAL_INFRASTRUCTURE |

Each negative requires healthy boundary control, actual injection receipt, specific expected native cause/stage, `accepted=false`, `promoted=false`, `public_traffic_open=false` and retained diagnostics. Generic exceptions are never negative PASS. Whole-host loss is the positive recovery prerequisite; inability to access a missing prerequisite is BLOCKED, not a successful loss experiment. Missing-version/WAL mutations must target throwaway recovery material, not retention-protected masters or v1. No availability-versus-durability business choice is made here.

## 6. Workflow proposal and external prerequisites

The new manual workflow has exact 40-hex SHA input equal to selected protected-main workflow revision, digest-pinned checkout/upload actions, protected Environment `dr-v2-external-validation`, read-only permissions and no automatic Quality Gate trigger. It initializes independent failure evidence before checkout, verifies Environment required reviewers/prevent-self-review/no-admin-bypass/protected-branch policy and required secret-name provenance, validates the non-secret config path, prepares a native coordinator and optionally runs the read-only probe.

Only the authorized probe step receives S3/catalog data secrets. Optional session token is rejected if not declared in Environment metadata. The metadata audit token needs exact-repository Environment read permission; unavailable metadata/plan support fails closed. The YAML cannot configure reviewers or prove policy without that real check. See [GitHub Environment management](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) and [runner security](https://docs.github.com/en/actions/reference/security/secure-use).

Probe container: digest pinned, 2 CPUs/4GiB/no extra swap, 128 PIDs, readonly root, no capabilities/socket/public ports, 64MiB tmpfs, bounded streaming/time. Cleanup queries only this run's label, validates exact name/owner and verifies absence; daemon error is not treated as absence. Only five known sanitized summary files are uploaded; no provider dumps or secrets. An initial BLOCKED record is a fallback, not a terminal DR verdict. A green job certifies only preparation/readback subset. **Workflow not dispatched.**

Operator must provide, through reviewed policy and Environment rather than chat/source: native disposable host identities/domains/quota receipts and control adapters; provider/account/region/approved buckets/prefixes; signed catalog/version/checksum and externally held test trust key; ephemeral least-privilege restore credentials; separate writer/protector/retention roles; exact image/schema/GIS/adapter digests; synthetic workload or approved anonymized distribution; closed staging ingress and independent observer; approval expiry, cost ceiling, retention/custody/delete-denial policy and cleanup owner.

## 7. Capacity and conditions to recommend C

Prepared hypotheses match prior design, not the business: small **10GiB DB +20GiB objects**, medium **100+200GiB**, high **500+2000GiB**; prior assumed totals **2064/3818/12160 seconds**. Medium/high already exceed the objective **under the earlier assumptions**, not under a newly measured test. No maximum feasible production volume or extrapolated rate is asserted.

Future runs must record actual DB/base/WAL/object bytes/count/distribution/versions, repeated download/readback bytes, effective rates, own-device IOPS/fsync latency, CPU/RAM/disk, complete service critical path and dated/currency-specific host/storage/request/egress/KMS/monitor/operator costs. No tariff => UNKNOWN. Retention costs survive host cleanup. p95 helper requires at least 20 successful comparable observations, with failures/timeouts retained separately; this is not an SLA confidence bound. Keep profile/digests/native hardware/provider/cache strata separate.

Recommend C/revised topology if measured representative service path/p95 exceeds3600s, proved frontier age exceeds300s under approved fault policy, WAL backlog cannot drain faster than peak generation, measured transfer+readback+remaining critical path cannot fit, or host/keys/GIS/provider access lacks bounded availability. Business requiring acknowledged-commit durability during sustained remote outage+host loss also requires revisiting B. Prepositioning/standby/HA adds recurring cost/fencing/operational complexity and does not replace historical backup/object protection. No choice or spend is approved here.

## 8. Release preservation and exclusions

Original Audit reports remain ignored by `.gitignore:37`; that rule was not changed. Six versionable baseline copies were verified byte-identical. The new report also has a versionable docs copy. They are currently **untracked candidates**, not secretly staged/committed. A future release must explicitly review/version them; a plain Git archive today would not include these new files.

`audit-custody.json` inventories **121** prior ignored reports/evidence files. Local confined exporter successfully produced a **5,021,639-byte** archive with SHA256 `4ebe0308f61e2b91f9220644df4b0a07d9f4d919681d08d5d6cc40530a7a35da`. Every member/hash was checked against the manifest. This archive remains local at the task temporary output; no remote custody/upload was authorized. **Release cleanup is blocked until an operator preserves it independently, downloads/readbacks the hash and stores an authenticated custody receipt.** Git copies preserve reports/compact data, not all original diagnostics.

Versioning candidates: new Python/contracts/example/profile, separate workflow, runbook, report copies, inventory/hash manifests. Exclude `.env`, credential/private-key/SSH/provider state, raw unreviewed logs/catalogs, business payloads, generated run directories, source caches/volumes and local tar archives. Do not force-add all Audit. Inventory/evidence hashes detect byte changes, not cryptographic runtime attestation. The local exporter checks confinement/hashes/basic privacy; independent privacy review/custody is still required.

## 9. Local validation and evidence

Evidence: `Audit/evidence/ERP-DR-V2-EXTERNAL-VALIDATION-001/`, with sanitized logs, blocked preparation JSON, baseline preservation, versioning inventory, local archive receipt and checksums. No private credentials/config/key material is present.

| Validation actually executed | Result |
|---|---|
| New offline tests | **19/19 PASS** |
| Existing lab tests | **25/25 PASS**; no new Docker integration |
| Existing replacement benchmark contracts | **29/29 PASS**; fixture/mock release blocker output is not a real release query/restore |
| YAML/workflow actionlint | **PASS**, new and preserved legacy workflow; actionlint1.7.12, ShellCheck disabled/unavailable |
| Python AST, new JSON parse, CLI help/blocked execution | **PASS**; template runner exits2 with approval missing and null RPO/RTO |
| Native/emulation separation, read-only S3 SDK surface, TLS/static isolation | **PASS as local contracts**, not runtime attestation |
| Baseline copies/121-member archive hash/readback inventory | **PASS locally**, independent custody PENDING |
| Secret-pattern/static privacy review | No unredacted key/connection/credential-pattern matches in retained baseline artifacts; new files contain only dummy unit keys/secret names, no supplied real secrets. Not a full external secret-scanner attestation |
| Existing-file/HEAD/index preservation | **PASS** |
| `git diff --check` and new-file whitespace check | **PASS** |
| Native AMD64/S3/host-loss/service/fault integrations | **BLOCKED_EXTERNAL_INFRASTRUCTURE**; no timings or success simulated |

actionlint was downloaded to private temporary output from its official1.7.12 release and verified against the release checksum: archive SHA256 `aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f`. This is same-publisher checksum verification, not independent provenance attestation. PyYAML was unavailable; actionlint performs YAML/workflow parsing. No toolchain/global-permission repair was attempted.

RED evidence retains the initial missing-module contract failure and the first fixture/auth-boundary failure; neither is misrepresented as a cloud failure. Final73 local tests pass. Reproduction commands and exporter are in the versionable operator contract. No application suites were run because application code is untouched.

## 10. Remaining work and verdict

1. Operator approves provider/independent disposable native hosts, budget, IAM/retention/custody/write-fencing policy, images and Environment. Do not dispatch until these exist.
2. Implement and authenticate the provider allocation/loss/network/quota, full repository/DB-object closure, ERP/GIS/private-client/semantic verification and scoped host cleanup adapters for that approved environment. The present preflight/read-only workflow is not a substitute.
3. Run representative independent-host positive recovery plus all causal negatives, actual deletion/shortening denial, credential loss/rotation, 35-day-restorable chain and full service/persistence/readback validation. Capture true RPO/service RTO and capacity/cost evidence; then evaluate B versus C.
4. Independently preserve ignored raw audit history before any release/workspace cleanup. Review/version the prepared candidates in a later authorized change; no commit/push is performed here.

**Technical verdict: preparation validated locally; external feasibility/acceptance INCONCLUSIVE. Architecture B approved: NO. Production: NO GO.** Unchanged contractual integral RPO <=300s, service RTO <=3600s and recoverable retention >=35days remain unproven in independent infrastructure.

## Key Learnings:

1. The current clean SHA already contains the lab/benchmark fixes; old dirty-tree reports must not override current Git evidence.
2. A reviewed config cannot contain its own commit hash; bind a single declared SHA symbol to the exact approved workflow revision without rewriting checkout.
3. Versionable report copies and a locally verified archive are useful preservation steps, but raw evidence still needs independent custody before release cleanup.
