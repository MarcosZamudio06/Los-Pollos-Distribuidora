# External DR v2 validation — preparation and operator contract

**Preparation only. Architecture B is not approved. Production remains NO GO.**

The local AMD64-under-ARM64 laboratory proves synthetic mechanics, not a native host benchmark, remote retention or service recovery. This package preserves that lab and adds offline configuration gates, bounded read-only external S3 verification, measurement/rejection contracts, and a manual preparation workflow. **Cloud provisioning, host-loss injection and full ERP service adapters are not implemented or authorized by this package.** They must be approved and implemented for the selected disposable infrastructure before an integrated drill can run.

## Quick path — local checks, no cloud

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/database/dr-v2-external-validation -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/database/dr-v2-feasibility -p 'test_*.py'
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-external-validation/prepare.py \
  --config scripts/database/dr-v2-external-validation/config.example.json \
  --audited-sha "$(git rev-parse HEAD)" --output /tmp/dr2-preparation-UNIQUE
```

The example intentionally exits **2**, records `BLOCKED_EXTERNAL_INFRASTRUCTURE` and null RPO/RTO, and performs no network/resource creation. `--check-host` adds Linux/x86_64 and Docker Linux/AMD64 checks. Matching uname/daemon is necessary, not sufficient native-hardware proof; require a provider-signed architecture/no-emulation receipt. There is no `--apply` infrastructure command.

## 1. Inputs and trust

| Operator input | Contract |
|---|---|
| Exact SHA | Protected `main`, workflow revision equals dispatch input and checkout. No tags/branch names as substitutes. Immutable image/config/schema/GIS digests bound to the receipt |
| Reviewed JSON | Copy `config.example.json` into `scripts/database/dr-v2-external-validation/approved/<name>.json` in a future reviewed change; never store secrets. `WORKFLOW_SHA` binds in memory to the exact selected SHA, avoiding a commit-self-hash circularity. No arbitrary interpolation |
| Approval | Scope, owner, expiry, provider/account/region/buckets, source/target/catalog domains, cost ceiling, fault methods, credential roles and retention policy; approval references are not self-authenticating authorizations |
| Images | Real registry references by digest for database+pgBackRest, backend, frontend, GIS and probe. Empty/example refs block. Record AMD64 manifest, SBOM/source build provenance and runtime version readback; no image is built/published here |
| Toolchain | PG 16.14/PostGIS 3.5.7/pgBackRest 2.60.0 from prior lab are candidates, not a released native image. Python 3.12.12/boto3 1.40.0 are exact illustrative probe candidates; resolve/audit their image and dependency lock before approval. Do not silently install latest dependencies during a measured recovery |
| Workload | Synthetic only. Hypotheses in `profiles.json` are not business data. Separately approved anonymized counts/distributions may drive generated data; no real records, names, images, financial entries or backups |
| Host quota receipts | Dedicated disposable Linux AMD64, separate source and new target and independent witness/catalog domain; bounded CPU/RAM, dedicated quota-enforced disk, IOPS/latency and network policies; no production identity/volume/runner |
| Secrets | Environment-only restore access key/secret, optional session token, independent test catalog HMAC key of at least 32 bytes, and fine-grained Environment metadata-audit token. Never provide their values in JSON, dispatch inputs, argv, logs or source-control files |

The preparation config checks numeric CPU/RAM/disk/time budgets and scratch capacity; it does **not** enforce provider quotas or verify host attestation by itself. Integrated execution must refuse absent signed quota/identity receipts. Source writer/protector roles, provisioning control and loss-witness roles remain separately approved operator adapters, never the restore credential.

## 2. Native AMD64 execution contract

- New run namespace `dr2-ext-*`; company/run prefixes and labels are mandatory. No existing data source, container, network or volume may be adopted. Unique resources have an append-only ownership ledger before mutation.
- Source and target are different newly allocated hosts/failure domains; witness/catalog/key custody survives both. An ephemeral GitHub coordinator is not replacement-host provisioning evidence.
- Native database/tools image retains the local TCP readiness semantics; assert actual PG16/PostGIS3.5/pgBackRest versions and cluster system identifier/timeline. Pin the selected completed backup label; no same-second auto-selection fallback or shifted recovery target.
- Enforce approved per-service cgroup limits, no swap overrun, dedicated filesystem quota and free/scratch reserve before materialization. Bound every subprocess and the whole suite; limit exception diagnostics without suppressing cleanup. The example's 7200-second suite ceiling includes setup/negative trials, **not a relaxation of the 3600-second service RTO**.
- No public PG/S3/API ports. Isolated host network/firewall allows approved provider HTTPS and private observer/service access only. Deny production networks and any real routing/cutover command. Verify packet-level traffic closure independently.
- Prefer fresh dedicated hosts for cold runs; do not flush shared-host caches or label new PGDATA as host-cold. Record image/disk/GIS/provider cache state separately. Repeat by fixed profile, image, hardware, cache mode and region.
- Capture sanitized logs/state/cgroups, command fingerprints, timings, native error codes and relevant events **before** cleanup. No full env/inspect/raw argv/credential-bearing SDK exception dumps. Keep failure evidence even if the next attempt succeeds.
- Cleanup checks owner/run/company on each resource, continues after individual failures, and inventories zero remaining owned host/container/network/volume resources. No global prune. Locked remote evidence is intentionally retained until its approved expiry, recorded as retained evidence rather than a cleanup leak. Daemon loss requires scoped reconciliation.

## 3. External S3 contract

Provider, endpoint, region, accounts, bucket names, versioning, IAM and cost/retention approvals must pre-exist. This package issues **no create, PUT, delete, retention-update or lifecycle operation**. HTTPS with normal trusted-CA/hostname validation is mandatory; no insecure flag, self-signed bypass, endpoint credentials, local/IP endpoint or arbitrary custom CA.

Four separately scoped buckets: mutable pgBackRest working repository **R**, protected versioned repository vault **V**, historical objects, and independent authenticated catalog. They must not share source-host custody; catalog/key administration and restore authority are independent of the source writer. Distinct buckets alone do not prove account/IAM isolation.

| Role | Permit | Deny / independent proof |
|---|---|---|
| Source writer | Approved company/run PUT/WAL to R; object upload via approved protection protocol | Delete/retention shortening or another company's prefix; no restore/catalog-signing/admin secrets |
| Protector | Exact-version verification and V/receipt creation | Source cannot impersonate protector or alter the signed path mapping |
| Restore/readback | GET exact versions and required versioning/retention metadata on declared company buckets | PUT, delete, retention/lifecycle/admin and other-company access; prove actual denial, not policy text alone |
| Retention custodian | Approved expiry/lifecycle administration under separate custody | Not injected into application/restore workflow; independent delete/shorten/bypass resistance evidence |

Do not blanket-lock mutable pgBackRest metadata. Preserve signed native-path -> exact provider VersionId/SHA256/size mappings in V; materialize a new native-layout repository from protected versions. pgBackRest is not assumed to select historical S3 versions automatically. Read every required base/WAL/timeline/manifest object, not merely HEAD or ETag; bind system ID, timeline, backup, target/marker/LSN, schema, images, objects and keys to one company candidate. Catalog v1 retains its existing semantics.

`probe.py` is a **read-only subset**, not the complete catalog-v2 verifier. It authenticates a company/run-bound HMAC test envelope obtained by exact catalog VersionId and pinned SHA256, streams every declared entry by VersionId, checks SHA256/size/MIME and per-version retention. Secret material lives outside source and is not in evidence. The HMAC test envelope must not be represented as implemented production signing/custody or complete DB reference closure.

The conservative probe requires **COMPLIANCE** retention for the catalog and each declared V/object version through now + configured horizon. Governance may be a future approved alternative only after actual bypass/shorten/delete denial is established; it is not silently accepted. Example horizon **47 = 35 recovery + 7 maximum base gap + 5 safety days**; increase for actual chain/calendar/key/validation needs. Referenced live objects stay protected while referenced, even when older than 47 days; retirement starts from last recoverable DB reference, not creation date. Prove lifecycle cannot remove dependencies early. The probe reads retention metadata; it does not prove 35 elapsed days, write-role deletion resistance or provider disaster survival.

## 4. Independent host-loss sequence and adapter handoff

Future provider-specific adapters must be separately reviewed, pinned to the audited bundle and approved. Inputs/outputs are authenticated receipts bound to company/run/SHA/action/config hash; no arbitrary shell from a descriptor. An adapter failure is FAIL/BLOCKED, never a simulated successful step.

| State / adapter | Required proof and fail-closed transition |
|---|---|
| `APPROVED` / resource allocator | Signed native architecture, fresh host IDs, roles, domains, disk/cgroup quotas, egress and closed ingress; approved spend ceiling. Allocate only disposable source; destination provisioning remains timed after incident |
| `SEEDED` / synthetic producer | Schema fingerprint, generated financial/inventory/evidence oracle, acknowledged transaction sequence and server commit UTC/LSN, exact object receipt/version bindings; continuous externally observed WAL/object frontier |
| `PROTECTED` / verifier | Physical backup validation, complete protected WAL/timeline chain through marker, receipt-journal superset/DB-object closure, historical versions and independent readback. Durable bytes + authentication + keys, not successful upload alone |
| `SOURCE_LOST` / external injector+witness | Independently record incident onset, then fence/remove power/network access to the **whole source host**. Probe lost host from independent observer; source credentials/caches/containers/volumes unusable. Do not delete any production host |
| `TARGET_ALLOCATED` / replacement allocator | New native host in independent domain after incident; signed provision start/end; no pre-existing warm host represented as cold provision. Any prepositioning is declared and costed separately |
| `HYDRATED` / restore executor | Fetch only declared artifact bundle/image/GIS/schema digests, externally recoverable credentials and authenticated catalog. Materialize exact protected repository versions, restore explicit backup and target, replay to pause and verify all object/DB references |
| `VALIDATED_CLOSED` / service+domain validators | Verify compatible schema/migrations without automatic destructive DDL; start backend/frontend/GIS on private staging network with writes fenced. Check API, authenticated business read, Socket acknowledgement/reconnect and expected semantic oracles. No production promotion or routing |
| `STAGING_SERVICE_VALIDATED` / external client observer | Authorized private staging readiness/client checks completed and all receipts available. This is the drill endpoint, not authorization for production cutover. Any staging promotion/write exercise needs its own approved subphase after prerequisite checks; every negative trial remains unpromoted |
| `CLEANED` / scoped cleanup | Logs persisted independently, run-specific resources removed/absence verified, retained locked evidence inventoried. Operator audits residual resources even after exceptions |

The destination bootstrap bundle declares all files: scripts at audited SHA, config/profile/schema and migration hashes, image manifests, approved public GIS index/data hashes, signed repository/object catalog, witness public trust/credentials references, synthetic expected invariants and adapter versions. Rehydrate from independent storage and verify bytes on a **new checkout or declared bundle**. Missing undeclared file, local `node_modules`, checkout `.env`, source cache or sole source-host secret is a blocker. No origin volume/cache mount or original container may be used. Key-recovery time counts in RTO.

## 5. Integral frontier, sentinels and clocks

Record UTC and monotonic durations from an independent coordinator that survives source loss. Synchronize hosts, capture offset/uncertainty and refuse unknown or >1-second clock error; never subtract different host monotonic clocks. An incident witness, not delayed operator declaration, anchors RTO. Record detection/declaration/approval delays separately, without removing them from incident-to-service elapsed time.

- Insert external-observed monotonically numbered acknowledged transactions with commit UTC/LSN, company and semantic checksum. Include before/after marker sentinels and object-version changes (old version, replacement, operational delete).
- Candidate frontier F is the **latest authenticated point** for which base/WAL/timeline/schema/images/keys plus every referenced protected object is verifiably recoverable. A marker merely in local WAL is not F. Preserve valid earlier F on a gap; never advance F to local now or to an unauthenticated point.
- After source loss at T0, restore to F; prove all acknowledged transactions <=F and required object versions match the expected semantic oracle, later sentinel excluded. Report lost acknowledged sequence interval and the last acknowledged UTC independently. Reject a claimed F newer than proved data.
- Conservative `RPO_upper = T0 - F_UTC + combined clock uncertainty <=300s`.
- `RTO_service_upper = independent validated staging service time - T0 + clock uncertainty <=3600s`. Staging endpoint must include all service/client validations, not only PG restore or a GET. The production service contract would additionally require approved actual routing/client recovery; **this preparation cannot certify it**.
- `PhaseRecorder` records UTC start/end and monotonic nanoseconds/duration, retaining FAIL under exception. `validate_measurement` requires all 18 phase receipts, same observer clock, conservative RPO/RTO bounds, independent-loss proof, closed traffic and externally authenticated evidence. It is a **contract validator, not a receipt authenticator**; its input boolean cannot replace the signed witness/artifact verification adapter.

Required timings: frontier validation/loss witness, target provision, image/secret access, repository transfer, physical restore, WAL replay, historical object recovery, schema/migration compatibility, backend/frontend start, GIS readiness, API/Socket health, sales/receivables/inventory/settlement reconciliation, private staging client service validation and cleanup. Record bytes and request counts separately for base/WAL/objects and repeated readback; nested/pipelined stages use measured critical path, not double-counting or arbitrary parallelism discounts. Backups made before incident are setup, **not RTO**; any backup/materialization actually needed after incident counts.

Reconciliation must compare persisted/read-back exact cents/decimals and movement traceability, not only counts: sale totals/payments, Payment-derived collections/outstanding receivables, balances by location and inventory movement lineage, settlement/cash differences and evidence-version bindings. Reuse existing functional acceptance oracles and replacement smoke helpers only after adapting their interface to isolated restored data; no business rules are redefined. Baseline nonzero legitimate differences must match the oracle, never be zeroed to pass. Read-only migration compatibility checks must not run automatic `migrate deploy` against an unverified target.

## 6. Negative trial contract

Reuse the causal pattern and native error evidence from unchanged `dr-v2-feasibility/recovery.py`; do not invoke its same-host/self-signed endpoint path with external credentials. Each isolated trial needs a healthy control at the boundary, signed injection receipt, expected native cause/stage and **accepted=false, promoted=false, public_traffic_open=false**. Generic exceptions or prerequisite failure are FAIL/BLOCKED, not negative PASS. A trial starts from its own known valid recovery state. Required trials:

| Injection | Required causal observation |
|---|---|
| Whole source host loss | Independent host witness fails to reach source; successful restore uses only independent bundle/repository/key custody. Loss is positive recovery prerequisite, not a fabricated refusal test |
| Network interruption during archive | Approved source-test-only egress fence; archive-push failure/backlog evidence; frontier stops, acknowledged writes follow approved risk/fencing policy. Loss after >300s outage must not claim recent recovery. Restore rejects any unsupported newer candidate |
| Required WAL removed | Tamper only a disposable materialized repository, never locked master/v1. Fresh replay beyond the gap must report target unreachable and no promotion |
| Historical version missing | Isolated candidate/test version actually absent (or denied exact-version GET), not latest-key HEAD failure. Reject complete candidate. Never delete a retained master or shorten lock to manufacture this case |
| Hash/size mismatch | Exact-version bytes do not match authenticated expectation; no hydration acceptance |
| Catalog not authenticated | Tampered envelope/untrusted key rejects before target/service allocation |
| Wrong credentials | Actual provider auth/access error at intended request, not DNS/SDK setup error |
| Other company | Separate real test identities/buckets/keys reject A->B read, write, unwrap/catalog and restore, not only string comparison |
| Partial restore | Omit declared dependency in throwaway materialization; full schema/object/domain verifier refuses acceptance |
| Service startup failure | Inject into owned backend/frontend/GIS before acceptance. Health/Socket/private-client proof fails; staging traffic remains closed and recovery unpromoted |

These external trials are currently `BLOCKED_EXTERNAL_INFRASTRUCTURE`; the contracts/tests do not claim to have run them. External provider/host/ERP adapters and source write-fencing decision remain pending. Do not select availability over durability on the operator's behalf.

## 7. Capacity, repetitions, cost and escalation

`profiles.json` copies small/medium/high hypotheses from the prior design: DB/object totals **10/20, 100/200, 500/2000 GiB**, modeled totals **2064/3818/12160 s**, NOT native measurements. Medium/high already miss 3600 under those assumptions. Each run reports actual `pg_database_size`, physical/repository bytes, WAL bytes/rate/backlog, object count/version/size distribution, live/retired generations, request counts, bytes downloaded/written/read back, elapsed phase/critical path, effective throughput, cgroup CPU/peak RAM and own-device block I/O/IOPS/fsync latency. Missing counters remain null/NOT_AVAILABLE.

Report distribution/variance per fixed hardware/profile/digests/cache/region, at least **20 independent successful service observations** before the nearest-rank empirical p95 helper returns a number. Twenty samples still do not establish an SLA tail confidence bound; retain failures/timeouts as censored failures, never drop them to improve p95. Do not mix warm/cold or emulated/native samples. Measure multiple incompressible sizes and WAL/object mixes; never extrapolate the 32 MiB local sample linearly.

Cost inputs: allocated test-host hours × approved tariffs, retained GiB-month × provider/storage class, GET/PUT/list/retention/KMS operations, WAN/readback/restore egress, GIS retrieval, monitoring and operator hours; report rate date, currency, retention obligations and actual bill delta. Null tariffs => UNKNOWN, not free. Locked synthetic artifacts may incur cost after host cleanup.

Recommend revising B toward C when measured representative worst relevant/p95 service path >3600s, integral frontier age >300s under approved failure envelope, WAL drain cannot exceed peak generation, required transfer/readback+remaining phases exceed budget at conservative measured throughput, provisioning/keys/GIS cannot be bounded, or business needs acknowledged-commit protection during sustained remote outage plus source loss. Consider shorter replay chains, prepositioned verified objects/GIS, warm independent capacity/standby with fencing; quantify recurring cost. Faster RAM/CPU alone does not fix a network/object hydration bottleneck. No adoption or purchase is authorized.

## 8. Manual GitHub Actions preparation workflow

`.github/workflows/dr-v2-external-validation.yml` is manual only and isolated from existing Quality Gate and legacy replacement workflow. It runs a hosted Ubuntu24.04 **coordinator**, not a production runner or replacement VPS; exact SHA equals selected protected-main workflow revision. Checkout/upload actions are pinned to verified commit SHAs. Environment **dr-v2-external-validation** must already exist with required reviewers, prevent-self-review, no admin bypass and protected-branch policy; check support for the repository's GitHub plan before use.

Before data credentials are injected, `environment_gate.py` checks read-only Environment metadata and verifies required secret names exist there, preventing accidental repository-secret fallback. Operator supplies `DR2_ENVIRONMENT_AUDIT_TOKEN` with exact-repository Environment metadata read permission only. Missing metadata access, policy or secrets blocks; the workflow does not configure Environment protection itself. Data credentials live only in the probe step. Optional session token must also be Environment-scoped if used.

The bounded digest-pinned read-only probe container has no public ports/Docker socket, readonly root, drop-all capabilities, no-new-privileges, 2 CPUs, 4 GiB RAM/no additional swap, 128 PIDs and 64 MiB tmpfs. Streaming quotas cap payload reads; outputs are small metadata only. The full-host quota requirements remain a separate adapter gate. Only explicitly named/label-owned probe cleanup is allowed; daemon/inventory errors cannot be treated as resource absence. Only five known sanitized summary paths are uploaded, including independent initial blocked evidence created **before checkout** and verified probe absence after cleanup. No raw SDK/provider logs or credentials are uploaded. RPO/RTO remain null; a green preparation job is not DR acceptance.

**Do not dispatch now.** No approved images, config, Environment/secrets, independent hosts/storage or adapters have been supplied. The workflow cannot test full host-loss recovery and must not be advertised as that runner. Keep v1 historical results and original 24-hour/READY_FOR_CUTOVER benchmark semantics; neither qualifies as v2's 300-second integral RPO or service RTO. No workflow was dispatched here.

## 9. Audit custody and release inventory

`baseline/` holds byte-identical versionable copies of design + FEASIBILITY001/002/003 and compact003 measurements/checks. `audit-custody.json` records hashes/sizes for all 121 allowlisted historical report/evidence files and copy mappings. A Git clone can retain these reports once reviewed/versioned; Git still does not contain the raw historical diagnostics.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 scripts/database/dr-v2-external-validation/custody.py \
  --manifest docs/operations/dr-v2/audit-custody.json --output /tmp/dr2-history-UNIQUE.tar.gz
```

The local exporter verifies every original hash, type, confinement and basic privacy patterns; output must be new. A locally tested archive/receipt is **not independent custody**. Before any release destroys or replaces this workspace, the operator must preserve the archive in approved independent artifact custody, independently download/read back its SHA256, and store an authenticated receipt with owner, location, bytes, hash and expiry. Verify an empty checkout can obtain it. Release is blocked while that receipt is absent. Do not modify `.gitignore` or force-add all Audit output.

Versioning candidates: new reviewed Python/contracts/example/profile, manual workflow, runbook, report copies and custody/hash manifests. Exclude credential/config/key material, any `.env`, provider/SSH state, unreviewed raw logs/catalog payloads, source caches/volumes, business data, local tar files and generated execution directories. Publish only allowlisted sanitized artifacts after privacy review. Checksums detect changes; they are not signatures or proof of historical runtime provenance.

## References and next gate

GitHub Environment approvals/secrets are external settings, not guaranteed by the YAML: [Environment management](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [secure runner use](https://docs.github.com/en/actions/reference/security/secure-use). Provider retention must be verified per version: [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [B2 Object Lock API support](https://www.backblaze.com/docs/cloud-storage-enable-object-lock-with-the-s3-compatible-api). These sources explain capabilities, not a claim that an account/Environment is configured.

Next approved work unit: choose provider/test hosts and policy, supply image digests and secret custody, implement authenticated provider/source-loss/service adapters, then execute the native/external representative sequence and all causal negatives. Preserve NO GO until that separate acceptance succeeds and business approves B or C.
