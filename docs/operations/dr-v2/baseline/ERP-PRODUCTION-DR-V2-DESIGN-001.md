# ERP-PRODUCTION-DR-V2-DESIGN-001 — Integral recovery architecture

**Design task: COMPLETED. Architecture: PROPOSED / NOT APPROVED. Production: NO GO.**

This document makes Alternative B implementable and testable; it does not approve B, implement it, or certify its objectives. Business must approve the availability/durability policy before implementation. An asynchronous single-host design cannot unconditionally guarantee a five-minute recovery point during a prolonged remote outage followed by host loss.

| Contract | Unchanged requirement |
| --- | --- |
| Integral RPO | Maximum **300 seconds**, PostgreSQL/PostGIS and every referenced object together |
| Service RTO | Maximum **3600 seconds**, including replacement provisioning, recovery, validation, approved traffic transition and client verification |
| Recoverable retention | At least **35 continuous days**, not merely 35 backup files or a sparse GFS selection |
| Company boundary | Independent company data planes, repositories, credentials, keys and replacement targets |
| Compatibility | Existing `mte-company-recovery-set/v1` remains unchanged; a logical dump is never relabelled PITR |
| Product scope | Preserve GO FUNCIONAL within its original scope. `CFDI_ENABLED=false`; no PAC/SAT activation |

Date: 2026-10-27, America/Mexico_City. Baseline HEAD and local `origin/main`: `18d25b22b79167c99c98bfe0054a9821a875b088`. The two existing tracked workflow/test modifications were preserved. Work was linear, without subagents. No production endpoints, private environment files or credentials were read. No installation, image build/publication, infrastructure, restore, commit, push or deployment was performed.

**Reading order:** decisions (§1), fault policy (§7), feasibility (§8), approvals (§12). Detailed implementation contracts follow in §§4–6; future tasks and acceptance evidence are in §§10–11.

## 1. Proposed architectural decisions

All decisions below are proposals, not an adopted architecture or business authorization.

| ID | Proposal | Reason / boundary |
| --- | --- | --- |
| P01 | Retain one active backend, local PostGIS and operational SeaweedFS per company | Preserve the existing silo, domain and session model; no tenant selector in API/JWT/Prisma |
| P02 | Physical cluster backup and continuous WAL using candidate **pgBackRest 2.60.0** | Mature backup/recovery engine rather than an original WAL-copy implementation; package compatibility still requires proof |
| P03 | Separate a mutable pgBackRest working repository from an independently administered immutable vault | Do not apply blanket WORM to mutable `backup.info`/`archive.info`; preserve recoverable historical repository closures |
| P04 | Every new object reference requires a verified off-host durability receipt **before its DB transaction commits** | DB recovery must never advance beyond the availability of its referenced bytes |
| P05 | Immutable logical object identity plus exact remote provider version, SHA256, size and MIME | Neither ETag nor key-only HEAD establishes cryptographic integrity or historical identity |
| P06 | Retain current objects indefinitely while referenced; retain retired versions through the last retained DB reference | Thirty-five days from object creation is insufficient for an old logo replaced today |
| P07 | Authenticated, append-only, company-bound v2 catalog with a protected PostgreSQL marker and an object-receipt superset | Causally relate DB/WAL and objects without taking long DB transactions during uploads |
| P08 | Independent protection frontier and external monitoring at 15-second cadence | Existing five-minute monitoring and 24-hour v1 indicators cannot govern a 300-second objective |
| P09 | Separate restore executor for a new physical cluster, not `pg_restore` into the running cluster | Physical PITR restores the whole cluster; retain existing v1 drill/replacement guards |
| P10 | Recommend policy B from §7: reject object-dependent commits without receipts; fence company writes when protection lease expires | Reduces exposure but does not make an old frontier recent. Requires explicit business approval |
| P11 | Keep v1 as an independent fallback throughout rollout | v2 failure must not silently disable the existing backup path or fabricate compliance |
| P12 | Escalate to Alternative C when recovery capacity or compound-fault requirements exceed B | HA still needs protected backups, objects, fencing, keys and representative acceptance |

### 1.1 Current evidence and contradictions

| Source inspected | Confirmed baseline | Design consequence |
| --- | --- | --- |
| `specs/.specs/06-deployment/deployment.md`, `docker.md`, `env-vars.md` | Five-minute RPO, 60-minute RTO, 35-day retention; single-host company silo and private service DNS | No target relaxation or external managed DB switch by implication |
| `Audit/ERP-PRODUCTION-READINESS-001.md`, `ERP-PRODUCTION-READINESS-REMEDIATION-001.md` | NO GO; B proposed, not approved; representative service recovery absent | This design is not closure of the production audit |
| `docker-compose.production.yml:21-72` | PostGIS 16/3.5 Alpine, SeaweedFS 4.29 `mini`; no WAL archive configuration in this path | New reviewed DB image/config is required; local volumes are one failure domain |
| `scripts/database/backup-postgres-to-b2.sh:150-249` | `pg_dump` custom format, remote size and full download/hash verification | Preserve v1; it is not a physical backup |
| `scripts/database/create-company-recovery-set.sh` | Company lock, backend quiesce/write barrier, paired components and validated manifest | Valuable fallback, not online PITR |
| `docs/runbooks/production-recovery-set-backup.md`, backup timer | Twice daily plus jitter; GFS 14 daily / 8 weekly / 6 monthly; v1 writer has retention deletion access | Neither five-minute protection nor continuous 35-day history is established |
| `scripts/database/company-recovery-manifest.mjs:285-305,341-417` | Exact v1 format, backend/frontend digests and migration fingerprint | v2 needs a separate discriminator/reader and more complete runtime identity |
| `scripts/database/recovery-storage-reference-verifier.mjs:10-34` | Branding, DeliveryEvidence and FiscalArtifact groups; branding has no persisted expected SHA/size | Reuse invariants, not a claim that current branding verification is cryptographically complete |
| `scripts/database/verify-restored-database.sh` | Target-class guards, PostGIS, migrations and critical-table presence/count checks | Extend future verification to semantic money/inventory/receivable invariants; counts alone are insufficient |
| `restore-company-production-replacement.sh`, benchmark Python and workflow | Explicit apply, new targets, traffic closed; success stops at `READY_FOR_CUTOVER` | Keep this hold point; add separate service-ready evidence, never reinterpret the old result |
| Monitor Python, health-monitoring runbook and systemd units | Remote HEAD/existence signals, v1 age in hours; monitor every five minutes | Add v2 seconds/continuity/receipt signals; preserve v1 indicators separately |

The previous production audit's run/CI statements are historical source evidence, not newly queried remote status in this task. Its functional acceptance is preserved, not rerun or expanded. Old runbook text suggesting an executor is still missing conflicts with the existing executor; the remaining lack of representative service-cutover proof is real. Current specs prevail. None of these contradictions is repaired here.

## 2. Components, topology and trust boundaries

```text
Company A production VPS                         Independent recovery domain
--------------------------------               -----------------------------
Clients -> Caddy -> frontend -> backend          Company A working repo (R)
                                |               physical backup + WAL, TLS
               PostGIS 16 ------+-- pgBackRest -> versioned mutable metadata
                 |              |                         |
                 |              |               protector/verifier (off VPS)
                 |              |                         |
                 |              +-> SeaweedFS              v
                 |              |    local immutable keys  Company A vault (V)
                 |              +-> durability service --> exact versions + WORM
                 |                    receipt before DB    + protected repo closure
                 |                                        + receipt journal/catalog
                 +-> marker coordinator -----------------> external catalog signer
                                                          |
                                            external monitor / alert receiver
                                            key custody + image/config/GIS vault

Company B: a different VPS, DB, buckets, identities, keys and catalogs.
No company selection occurs inside an ERP request. No cross-company restore.
```

R and V are proposed dedicated buckets in **separate administrative accounts**, outside the VPS provider's failure domain. Candidate provider: Backblaze B2 through its S3-compatible API, conditional on the exact capability tests below. Regions, jurisdiction and whether a second provider/region is mandatory require approval. Two accounts at one provider do not protect against that provider's full outage. A separately reachable second vault/provider is required if such an outage is in the guaranteed recovery envelope.

The off-host durability/protector/catalog services are **new proposed recovery-plane components**, not claimed capabilities of current SeaweedFS `mini` or pgBackRest. They must have protected persistent state, idempotent operations, company-bound credentials, restart recovery and external alerting. A recovery-plane outage freezes publication or blocks the selected write paths; it must not falsely acknowledge protection. Their costs and bootstrap/restore requirements are included in sizing. Shared software is acceptable; shared company data credentials or an all-company signing key are not the proposed default.

| Principal | Allowed | Explicitly denied |
| --- | --- | --- |
| ERP object writer | Local company PUT/GET; call company durability service | Vault deletion, retention changes, cross-company paths, raw vault administrator key |
| pgBackRest archiver on VPS | Required read/list/PUT for its company archive namespace and metadata reads | Backup/other-company prefixes, deletion/version deletion, bucket/lifecycle administration and V access |
| Off-host physical-backup executor | Required native operations in R, including cleanup of incomplete/resumed backup files | V deletion/hold release, other-company paths; automatic expiration disabled; cleanup is not retention authorization |
| Protector | Read exact R versions; create/read protected V entries and receipts | Production DB/business writes, releasing holds/deleting V versions |
| Catalog signer | Verify closure and append signed company catalogs | Rewriting prior catalogs, deleting backups; signer private key not resident on VPS |
| Restore operator | Time-limited company read/list/version access and key unwrap; write only new approved targets | Source deletion, production overwrite, other-company keys or automatic cutover |
| External monitor | Catalog/receipt read and necessary version/retention checks | PUT, DELETE, retention change or promotion |
| Retention custodian | Separately approved expiration/hold-release after dependency proof | ERP runtime use; shortening compliance retention |
| Break-glass administration | MFA, audited dual-control recovery | Routine runtime credentials or bypass granted to VPS |

These are capability contracts, not fictitious deployed IAM policies. B2 app keys support bucket/prefix and capability restrictions; actual S3/Native API mappings and denial behavior must be tested using separate principals. Do not copy AWS IAM JSON and assume B2 equivalence. [B2 application-key documentation](https://www.backblaze.com/docs/cloud-storage-application-keys).

## 3. Recovery diagram and service boundary

```text
t0 incident onset / simulated source loss (also record declaration/detection)
 |
 +-> fence old company host / prevent split brain; preserve original resources
 +-> obtain external signed catalog, trust roots, keys and approved release record
 +-> provision NEW company replacement host, private networks and empty PGDATA
 |      +-> pull approved images / restore config, GIS bundles, TLS/DNS capability
 |
 +-> validate company + cluster + target identity BEFORE importing data
 +-> choose latest acceptable point C and materialize protected pgBackRest repo
 |      +-> restore base/dependencies -> replay exact WAL/timeline -> pause at C
 |      +-> fetch exact object versions referenced by DB at C -> new SeaweedFS
 |
 +-> readback PostgreSQL and every required S3 object independently
 +-> schema/PostGIS/release checks + money/stock/receivables + authenticated smokes
 +-> promote only the isolated recovered cluster; validate new timeline handling
 +-> READY_FOR_CUTOVER (traffic still closed; NOT service RTO completion)
 |
 +-> separate human-approved traffic transition and client/Socket/S3/GIS checks
 +-> SERVICE_RESTORED at t_service; start protected new lineage before new writes
 |
 +-> preserve source/target evidence; separately authorize owned-resource cleanup
```

Contract metrics:

```text
C = latest authenticated, dependency-complete integral recovery point
RPO_age_seconds = max(0, incident_onset_UTC - conservative_C_UTC)
RTO_service_seconds = service_restored_UTC - incident_onset_UTC
RTO_declared_seconds = service_restored_UTC - incident_declared_UTC
RTO_hold_seconds = ready_for_cutover_UTC - incident_onset_UTC
```

Record both onset and declaration; a detection delay cannot disappear by starting a stopwatch at restore. For controlled acceptance, onset and declaration coincide. If onset is uncertain, record the interval and assess the conservative upper bound. Use monotonic clocks for phase durations and synchronized UTC with measured clock uncertainty for cross-host points. Unknown uncertainty is `UNKNOWN`, never PASS. No business event's client `capturedAt` is substituted for a PostgreSQL recovery marker.

Service restored means the approved company ingress actually reaches the recovered service, authenticated clients can read/write the accepted scope, referenced evidence downloads work, and money/inventory/receivable operations persist and survive independent readback. A readiness 200, pgBackRest exit 0 or a hold-point receipt alone is insufficient. Only a separately approved **staging** traffic transition will be exercised in acceptance; no production cutover is authorized here.

## 4. PostgreSQL, physical backup and WAL contracts

### 4.1 Candidate versions and image integration

Candidate **pgBackRest 2.60.0**, released 2026-10-18 according to the official release page checked for this design. It includes the 2.59.3 encryption-randomness fix; older versions must not be selected merely because an OS package is convenient. Version 2.60 introduces stricter restore/expiration behavior for page-checksum errors. Explicitly test it rather than relaxing checksum failures. [Official releases](https://pgbackrest.org/release.html).

Proposed derived runtime image starts from the **existing** pinned parent:

```text
postgis/postgis:16-3.5-alpine@sha256:becb8d49a20a2c1fcce1b154e853e1ea1a19cd5de99310852888b998694ec2ea
```

Add the verified 2.60.0 binary and runtime dependencies in a reproducible future build; preserve PostgreSQL 16, PostGIS libraries, libc/architecture, entrypoint, PGDATA ownership and existing extension compatibility. The final derived digest is **TBD, not published**. Record actual `server_version_num`, `postgis_full_version()`, architecture, libc, locales/collations and pgBackRest version in acceptance. A parent digest is not the new image digest. Do not combine a PostgreSQL major upgrade, PostGIS upgrade or Alpine-to-Debian move with DR rollout. The upstream container project is the packaging reference, not a guarantee of this unbuilt integration. [PostGIS Docker source](https://github.com/postgis/docker-postgis).

Run the executable **inside the PostgreSQL container** for `archive_command`; a sidecar alone cannot satisfy it. The proposed off-host backup executor uses the same pinned pgBackRest version and its native remote PostgreSQL-host protocol over authenticated TLS/private connectivity, with a constrained company endpoint; it does not run a second PostgreSQL server over production PGDATA. Keep database ports private. Scrub logs; mount secret-bearing config read-only outside the checkout with least privileges. Do not mount host Docker control into PostgreSQL or backend.

Separate the archiver credential from the physical-backup executor credential. Native failed/resumed-backup cleanup can remove files even when automatic retention is disabled; a blanket read/PUT-only backup identity is therefore **not assumed compatible**. Those necessary R cleanup rights belong only to the off-host executor, never the source VPS or V writer. Completed-chain expiration remains a separate custodian operation. Test the exact R API calls and B2 prefix/capability mappings, with no grant of V deletion as a workaround. This distinction is verified in the pinned [pgBackRest backup-resume source](https://raw.githubusercontent.com/pgbackrest/pgbackrest/release/2.60.0/src/command/backup/resume.c.inc).

### 4.2 Concrete proposed configuration — inert examples only

The following is a specification fragment, **not installed configuration**. `company-example`, endpoint/region/bucket placeholders and runtime paths must be resolved and validated against the approved company identity. It contains no credentials. The secret provider must supply pgBackRest's S3 key/secret and repository cipher pass through private configuration supported by the pinned binary; these options do not automatically interpret secret-manager URI strings.

```ini
# Proposed PostgreSQL 16 settings, not activated.
wal_level = replica
archive_mode = on
archive_command = '/usr/local/bin/pgbackrest --stanza=company-example archive-push %p'
archive_timeout = 60s
fsync = on
full_page_writes = on
synchronous_commit = on
```

```ini
# Proposed /etc/pgbackrest/pgbackrest.conf, no secret values.
[global]
repo1-type=s3
repo1-s3-endpoint=APPROVED_B2_ENDPOINT_WITHOUT_SCHEME
repo1-s3-region=APPROVED_REGION
repo1-s3-bucket=APPROVED_COMPANY_WORKING_BUCKET
repo1-s3-key-type=shared
repo1-s3-uri-style=path
repo1-path=/dr-v2/CLUSTER_EPOCH
repo1-storage-verify-tls=y
repo1-cipher-type=aes-256-cbc
repo1-retention-full-type=time
repo1-retention-full=40
repo1-retention-archive-type=full
archive-async=n
archive-check=y
archive-timeout=60
compress-type=zst
compress-level=3
process-max=2
expire-auto=n
start-fast=n
log-level-console=info

[company-example]
pg1-path=/var/lib/postgresql/data
pg1-port=5432
pg1-socket-path=/var/run/postgresql
```

The configuration reference documents the options. `archive-push-queue-max` is deliberately **unset**: a configured drop limit can acknowledge and discard WAL, breaking PITR. PostgreSQL `archive_timeout` forces segment rotation; pgBackRest `archive-timeout` bounds backup/check waiting, not end-to-end protection. Time retention keeps an anchor backup older than the window; do not configure shorter independent archive retention. [pgBackRest configuration](https://pgbackrest.org/configuration.html).

The fragment above is the source-local archive configuration. The off-host backup executor requires an additional approved `pg1-host`/native TLS client configuration and restricted matching server authorization in the PostgreSQL image; its R backup credential is not copied into this source-local file. Authenticate the company client/server and validate certificate/key mounts, version match and command permissions in DR-V2-002. No public PostgreSQL or unrestricted shell/SSH access is introduced. Native remote and S3 deployment recipes are described in the [pgBackRest user guide](https://pgbackrest.org/user-guide.html); they still need exact-image integration testing.

In 2.60 acceptance, require page-checksum failures to reject backup eligibility and restore, using the candidate's supported `checksum-page-error=y` setting after checking its version-specific help. Inspect `SHOW data_checksums`; do not claim existing pages are protected if it is off. Enabling checksums on an existing cluster requires an independently planned offline operation; a new recovery target must preserve the source format. PostgreSQL `synchronous_commit=on` here is **local durability**, not remote synchronous replication.

No `archive_command` success on network/authentication/storage failure; no `|| true`, dummy archive, deletion of unarchived segments, or `pg_resetwal` recovery shortcut. R acknowledges a completed remote repository write, but **the integral frontier advances only after V protection**, not after R acknowledgement. Local `.done` files are not V evidence.

### 4.3 Backups and verification

1. Create a unique stanza and cluster epoch bound to actual PostgreSQL system identifier. Test archive behavior before the initial physical full backup. Never mix clusters under a reused label alone.
2. Initial schedule hypothesis: full weekly, differential daily, incremental hourly, serialized per company; avoid overlapping jobs. A failed or slow job is an alert, not permission to delete its dependency. Baseline rate must support the initial full while WAL continues to drain.
3. Validate backup completion, start/stop LSN, consistency WAL, all referenced files, page-checksum results, dependency chain, repository format and encrypt/decrypt readback. Run `check`, `info --output=json`, and `verify --set=<completed-label> --output=text` with the pinned version. `verify` validates repository backups/archives; it is not an ERP restore. [pgBackRest command reference](https://pgbackrest.org/command.html).
4. Off-host protector records exact R versions and SHA256 of stored ciphertext bytes; native backup manifests retain their native checksum semantics. Do **not** relabel a pgBackRest internal checksum as SHA256. V closure includes the native manifests, metadata and every required base/incremental/WAL file.
5. A new backup becomes frontier-eligible only after complete verification and vault readback. Until then, prior protected backup plus continuous WAL may remain eligible, but replay/RTO may exceed budget. Monitor oldest valid full and latest usable incremental separately.
6. Proposed operation: daily repository verification of newly introduced dependencies, weekly full protected-chain verification, monthly isolated full restore and quarterly total-host replacement/service exercise. A new chain/format requires a successful isolated restore before activation; intervals require operator approval and cost allocation.

Full backup plus a continuous archive supports cluster recovery; logical dumps do not. WAL must extend from the required base start/consistency interval through the target. [PostgreSQL 16 PITR](https://www.postgresql.org/docs/16/continuous-archiving.html).

### 4.4 Markers, LSNs, timelines and exact targets

Every at-most-60-second protection cycle proposes a unique named restore point: `dr2:<epoch-short>:<monotonic-sequence>`, bounded by PostgreSQL's name limit. Coordinator serializes marker publication and deployment/migration epochs, not business requests. Record PostgreSQL system ID, numeric timeline, returned marker LSN, UTC bracket before/after marker creation and measured clock error. Force WAL switch after the marker and wait for the **segment containing it** to pass protection. The new/current empty segment is not a missing predecessor.

Use PostgreSQL's restore-point/WAL-switch functions through a restricted recovery role, not application superuser access. An LSN is an ordering coordinate, **not a timestamp**. Marker time is conservatively the lower UTC bracket adjusted for uncertainty. [PostgreSQL administration functions](https://www.postgresql.org/docs/16/functions-admin.html).

The normal catalog target is **one named marker** plus one explicit numeric timeline. Its LSN and time are cross-checks, not extra simultaneous targets. A requested timestamp uses exactly one UTC `recovery_target_time`; an LSN request uses exactly one `recovery_target_lsn` with explicit inclusivity. Bind either to the same cluster/timeline and prove object coverage for the requested point; do not round up beyond the incident or corruption event. `recovery_target_action=pause` is the proposed pre-promotion behavior. Verify pre-marker/post-marker sentinel inclusion before opening writes. [PostgreSQL recovery targets](https://www.postgresql.org/docs/16/runtime-config-wal.html#RUNTIME-CONFIG-WAL-RECOVERY-TARGET).

After restore promotion, record the new timeline/history and parent fork LSN; never select `latest` blindly. Validate history ancestry and required segments on each leg. LSNs from unrelated timelines/clusters cannot be compared as one ordered frontier. Physical PITR uses an empty, explicitly owned PGDATA and restores the whole cluster, including roles. In v2, source DB names remain part of that cluster; a `_replacement` SQL database suffix alone is **not** a sufficient physical-target guard.

### 4.5 Continuity, gaps, remote failure and retention

Verifier calculates required segment identities from the recorded WAL segment size and LSN/timeline ranges, including base consistency and ancestor history. It paginates exact-version inventory, fetches/verifies each new segment and authenticates its protected manifest. Check decoded WAL record/CRC continuity with native PostgreSQL-compatible tooling as well as repository checks; mere consecutive filenames are not complete semantic proof. Detect missing, duplicate/conflicting or wrong-system versions, history gaps and truncated objects.

If a segment is absent/corrupt, freeze the frontier before the first gap. Never jump to a later marker on the same broken chain. A separately verified newer physical backup may establish a **new** recoverable interval without that older gap; it does not repair the lost historical interval. Report union-of-intervals and explicitly fail the continuous 35-day guarantee until restored. No automatic promotion at end-of-archive when the requested target was not reached.

Retain a rolling **40-day policy buffer**, with the contractual acceptance floor still 35 days. Keep a usable base at/before the oldest promised target, all incremental ancestors, consistency/replay WAL, timeline histories and corresponding object/catalog/release/key dependencies. Weekly successful fulls can require an anchor approaching 47 days old. Delayed fulls extend the need further; retain dependencies rather than deleting them by age. Startup requires accumulating/proving the whole 35-day window; day-one activation cannot claim 35 days of history.

R expiration runs only off-host under a separate retention identity with dependency plans, completion locks and a rollback-safe audit record. V uses proposed minimum 50-day compliance retention for newly stored recovery bytes **plus a hold while referenced by any retained closure**. The exact 50-day policy and legal effects need approval. Never release a hold merely because creation is old; stalled backups can require longer retention. Excess retention raises cost but must not silently destroy recoverability.

Vault protects immutable data and each selected **version** of mutable repository metadata. The protector pins completed backup metadata under a publication lock, walks its native manifest dependency closure, copies/reads exact R versions and builds an authenticated mapping `native_repository_path -> V key + V version + stored-byte SHA256 + size`. New WAL entries extend this closure append-only. If metadata changes during capture, retry the bounded publication cycle or leave it unpublished; never publish a mixed closure. Expiration cannot race that lock.

Restore materializes that mapping into a **new local pgBackRest repository**, byte-for-byte in native layout, then uses native restore/archive-get. pgBackRest is not assumed to request historical provider versions automatically. Protect `backup.info`, `archive.info`, their copies, manifests/history, required data and timeline files explicitly. Source-write credentials cannot rewrite the signed path mapping or erase protected V versions. The reconstruction step, full readback, scratch and network cost count toward RTO. Native-version compatibility and mutation/expiration races are acceptance gates, not solved by generic bucket mirroring.

During remote outage, archive retries with bounded individual timeouts and retains WAL locally. Reserve disk for a **measured** outage duration; compute time-to-full from peak rate. There is no finite disk setting guaranteeing unlimited outage survival. On critical pressure use the approved admission/shutdown policy, never unarchived-WAL deletion. After recovery, prove drain rate exceeds incoming WAL, reverify continuity and publish fresh protected markers before clearing degradation.

## 5. Durable Object Storage contracts

### 5.1 Actual writer inventory

The source search covered application TypeScript in `backend/src`, frontend/shared sources and operational storage scripts, excluding dependencies/build output. No frontend direct-to-S3 writer or other application `PutObject` implementation was found in that inspected scope. Repeat this inventory at every storage-contract change; this is not a proof against future writers or unauthorized external tools.

| Writer / source | Actual behavior | Required v2 treatment |
| --- | --- | --- |
| `delivery/delivery.service.ts:1368-1458`; `delivery-evidence-storage.ts` | Photo/binary PUT before serializable DB create; UUID/date/order key; SHA256/size/MIME stored; compensating delete on DB failure. Non-binary evidence can be DB-only | Durable receipt before reference transaction; remote version cannot be removed by compensation; preserve validation/retry semantics |
| `branding/branding.service.ts:105-232,381-407` | UUID logo key; upload before create/update; replacement/removal deletes prior object; DB has MIME but no SHA/size/provider version | Compute SHA/size, additive asset binding; retain previous versions for PITR; local cleanup must not delete V |
| `cfdi/fiscal-artifact.service.ts:280-296,410-430,797-810` | XML/PDF and cancellation ACK PUT before marking AVAILABLE; SHA/size; deterministic `.../xml-v1.xml`, `pdf-v1.pdf`, `cancellation-ack-v1.xml`; recovery/retry paths can revisit key | Cover both PUT sites and recovery path; immutable logical generation, reject differing bytes under same identity; preserve existing historical artifacts only; **do not enable CFDI** |
| `object-storage/object-storage.port.ts`, `.service.ts`, `.module.ts` | One production S3 adapter bound through `OBJECT_STORAGE`; PUT returns void; key-only DELETE and signed GET; optional upload checksum; response VersionId discarded | Add explicit receipt/version-aware contract; preserve internal/public endpoint separation and signed-download authorization |
| `backup-object-storage-to-b2.sh`, coordinator | Export local bucket, write tar/component/manifests to backup destination | Remain v1 backup writers, not application-object receipt issuers; separate namespace/credentials |
| `restore-object-storage-from-b2.sh`, replacement executor, DR/benchmark/seed harnesses | Write restored/test objects into target buckets; reference verifier generates local helper/evidence files | Explicit restore/test principal and new-target checks; cannot call production writer or overwrite source |
| GIS preparation, release/config/evidence scripts | Persist map bundles, manifests, images/config and operational results; not DB attachment writers | Include compatible immutable bundle/config/release identities in recovery dependency closure, not fictional `StorageAsset` references |
| Tickets/PDF/exports generated for download rather than persisted object references | Not additional S3 writers in inspected application sources | Regenerate only when existing product contract permits; if persistence is later added, registration becomes mandatory |

Persisted attachment references are currently `DeliveryEvidence.storageKey`, `CompanyBranding.logoObjectKey`, `FiscalArtifact.storageKey` in `backend/prisma/schema.prisma:1325,1607,2557`. Fiscal `PENDING/FAILED` rows may contain planned keys without available bytes; do not invent their bytes. Recovery validates status and explicitly reports incomplete artifacts, while every `AVAILABLE`/required attachment must resolve. Branding and evidence must never silently lose a required object.

### 5.2 Identity, immutable versions and receipt

Proposed additive silo-local `StorageAsset`/receipt binding (name provisional until spec approval):

| Field | Contract |
| --- | --- |
| `assetId`, `logicalVersionId` | Random immutable identifiers; no PII in key; retry uses stable request identity, not accidental overwrite |
| `operationalKey` | Unique content generation; never reuse for different bytes. Provider-level local versioning is optional additional defense, not a prerequisite inferred from SeaweedFS |
| `remoteStoreRef`, `remoteBucketRef`, `remoteKey`, `remoteVersionId` | Exact protected version identity; company-bound deployment context. Never just “current key” |
| `plaintextSha256`, `sizeBytes`, `mimeType` | Locally computed hash of complete bytes, exact length and validated/canonical MIME; reject claimed-hash mismatch |
| `ciphertextSha256`, `ciphertextSize`, `encryptionEnvelopeRef` | Encrypted-byte integrity plus decrypt parameters/key version; distinguish plaintext and ciphertext |
| `receiptId`, `receiptSequence`, `protectedAt`, `retentionUntil`, `holdState` | Durable external receipt, signed independently and persisted before return |
| `keyCustodyRef`, `signerKeyId`, `signature` | Opaque key references and verifiable authority, not secret values |
| `state` | `INTENT`, `UPLOADED`, `PROTECTED`, `REFERENCED`, `RETIRED`, `GC_ELIGIBLE`, `PURGED`; failure is never `PROTECTED` |

The logical version is application identity, not the remote provider's VersionId. Both are retained. Remote S3 VersionId/B2 file-ID translation is adapter-specific and must round-trip with the selected API; no assumption that those strings are interchangeable. Historical retrieval uses exact identities. B2's version documentation distinguishes latest-name retrieval from historical-file retrieval. [B2 file versions](https://www.backblaze.com/docs/cloud-storage-file-versions).

**Exact durability boundary:** a reference is **eligible** for a DB commit only when the off-host service has (1) completed the selected remote version upload, (2) independently downloaded that exact version, (3) authenticated/decrypted the envelope and compared both stored-byte and plaintext SHA256/length plus MIME/encryption metadata, (4) read back effective retention and hold, and (5) durably appended an authenticated company receipt referencing those checks. The caller must verify the receipt and bind it to the asset in the same short transaction as the business reference. The reference becomes durable at that transaction's commit **with respect to object bytes**; integral DB+object durability is reached only when the commit is covered by protected WAL/catalog. Do not label the complete transaction remotely durable at object receipt time.

The verifier is off-host, not a self-attestation by the compromised VPS. Initial design requires full GET and streamed SHA256 for **every new version**, including multipart completion, before eligibility. Provider-validated full-object checksums can be an optimization only after a separate contract proves algorithm, API semantics, encryption/multipart scope and independent readback equivalence. User metadata `sha256`, ETag, ContentLength, or HEAD without a verified checksum are not that proof. AWS checksum documentation is an API reference, not certification of B2 or SeaweedFS behavior. [S3 integrity semantics](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html).

Proposed object encryption: TLS plus per-object envelope encryption with authenticated encryption (candidate AES-256-GCM), random nonce and company/key-version-bound additional authenticated data; wrapped data key stored with the protected receipt, master key outside VPS. Protect MIME/size/hash metadata in that authenticated envelope. Provider encryption is defense in depth. Do not invent a custom cryptographic format; future design must select a supported encryption implementation, reviewed envelope specification and rotation/migration tests before coding.

### 5.3 Write, abort, replace and read ordering

```text
validate bytes/MIME/authorization -> reserve stable upload intent/idempotency key
 -> PUT local immutable generation (not yet exposed by a DB reference)
 -> protect exact generation in V; independent GET/hash/retention verification
 -> persist and return signed PROTECTED receipt
 -> short DB transaction: verify receipt binding, insert asset, update business ref
 -> COMMIT -> respond according to the approved admission policy
```

No DB transaction stays open during network transfers. Under future runtime roles/constraints, a non-null business reference must bind to the expected asset/receipt; new paths cannot insert a raw key that bypasses protection. This requires additive schema and writer changes after approval, including migration/backfill constraints. Keep one company per DB, not a new company discriminator. Async outbox alone after reference commit does **not** implement this barrier.

Retries with an existing receipt validate identical bytes and company context. Reuse with different hash/length/MIME fails closed and allocates a new logical generation only through an explicit replacement. On crash after remote protection but before DB commit, the receipt is an orphan candidate, not an error permitting remote destruction. On DB timeout/unknown outcome, read back idempotent state before retry/cleanup; do not infer rollback from lost response.

Transaction abort: local best-effort cleanup may run only after reference absence is proven; remote protected bytes stay retained. Delete/replace: DB first commits a tombstone/new receipt binding; old remote version stays protected. No in-place overwrite or blind DELETE propagates to V. Public signed GET resolves the current DB binding to the authorized immutable operational key; historical restore selects the corresponding historical generation.

After restore to new storage, provider-native local IDs can change. Preserve `assetId`, original protected remote identity and logical key, and record `restored-target-version` mapping separately. Do not change historical receipts to pretend they originated in the new bucket. Readback confirms that the new operational key contains the original plaintext bytes and MIME before serving it.

### 5.4 Retention, garbage collection and malicious deletion

Proposed V objects use compliance retention plus legal hold while live or needed by any retained recovery interval. Compliance retention cannot be shortened; a hold continues beyond it. B2 documents those semantics and API capability requirements; verify actual settings per version, including backfilled objects. Default bucket changes do not retroactively protect existing versions. [B2 Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock).

Only the off-host retention custodian can release holds/purge after all of the following:

1. An authenticated dependency graph covers every retained DB interval/catalog and applicable legal/business hold. All object references recoverable in that graph have been resolved, including pre-tombstone references.
2. No live reference, unexpired upload intent, active restore/drill pin or in-flight publication can introduce/reuse the generation. Terminal intent/cancellation is recorded externally; bounded upload/DB transaction lifetimes and fencing prevent late commit after eligibility is revoked.
3. Retire/drop commit is protected and older than the **last DB point that could reference it plus the retained window and safety margin**. If absence/last-reference time cannot be proven, retain indefinitely and alert; creation date is irrelevant to that proof.
4. A two-pass signed GC plan, separated by a proposed 24-hour quarantine, still sees zero dependencies; required compliance retention has expired and legal holds can lawfully be released. Approval and actual exact-version deletion result are retained.

GC failure leaks storage rather than losing evidence. Unknown objects and orphan receipts stay protected until this proof exists; do not garbage-collect by “not in current DB” or bucket listing age. Lifecycle rules must never independently expire required versions or delete markers/metadata needed for restoration. Long-lived logos may require years of retention; budget for that.

Compromised runtime credentials must not delete protected versions, release holds, shorten retention or forge catalogs. Keep trust roots/keys in independent custody. Immutable data cannot prove that malicious **new** business writes are valid; recover to a known-clean point and reconcile under incident authority. Loss of the cloud account, legal seizure or simultaneous compromise of all custodians is outside B's single-vault guarantee and requires separate approved controls.

### 5.5 Backfill and migration boundary

1. Inventory current DB references plus available historical v1 recovery sets and their objects; freeze destructive local cleanup under a separately approved migration window before inventory can race replacement/deletion. Do not alter v1 backups.
2. Capture a consistent baseline/epoch; deploy additive immutable-key/receipt-aware writers under approved compatibility controls. Inventory racing legacy writes is not sufficient. New writers and direct administrative uploads must not bypass the gate.
3. GET each existing required object, compute SHA/size/MIME and compare existing evidence/fiscal metadata. Branding has no trusted old SHA/size: establish a **baseline**, not a retrospective integrity guarantee. Reject missing/mismatched bytes; identify owner/remediation instead of synthesizing an image.
4. Upload/protect exact existing versions, create receipts and idempotently backfill asset bindings in batches. Preserve original keys for historical DBs; include migration mapping in the protected catalog.
5. Inspect retained historical references from each v1 set in isolated read-only restores if historical continuity is sought. Already deleted/replaced objects not present anywhere cannot be recovered by a checksum algorithm. Report that historical gap explicitly.
6. Verify 100% of required baseline references and all new writers, then enable the approved admission policy. v2 recoverable history begins at the verified baseline; it reaches 35 days only after the window exists and is proven. v1 remains its original sparse fallback, not manufactured v2 continuity.

## 6. Integral catalog v2 and recoverable frontier

### 6.1 Format, authentication and dependencies

Proposed discriminator: `mte-company-recovery-catalog/v2`. Use a new `recovery-v2/<company>/<cluster-epoch>/...` namespace and separate validator/selector; never accept v1 in it by coercion. No v1 manifest, checksum, retention rule or reader is changed by this design.

Each immutable signed record MUST contain the following. Large inventories are content-addressed, paginated immutable shards with counts, byte totals and SHA256 roots rather than inline millions of objects.

| Group | Mandatory binding |
| --- | --- |
| Identity | Format/version, company slug, deployment-host reference, cluster epoch, decimal system identifier, DB names, architecture, source environment |
| Physical backup | pgBackRest version/format, stanza, label/type, exact manifest/metadata versions, parent labels, start/stop/consistency LSN and verified dependency inventory |
| WAL | Segment size, explicit timeline and ancestry/fork LSNs, required start/end segment, protected continuous ranges, exact versions/SHA256/length, verification results |
| Target | Unique marker name, LSN, numeric timeline, UTC bracket/uncertainty, single target mode, inclusivity where applicable; no target later than incident |
| Schema | Ordered successful `_prisma_migrations` names/checksums/finish state, source schema fingerprint and compatible deployment epoch; reject unfinished/rolled-back ambiguity |
| Runtime | Source commit; all application/GIS/PostGIS/SeaweedFS/VROOM image digests and architecture; Compose/Caddy/config hashes; GIS bundles, locales and extension versions |
| Objects | Baseline receipt root, appended receipt-journal high-watermark/root, explicit protected-asset closure root and membership proof, logical identities, remote version mappings, hash/size/MIME/encryption/retention; conservative superset permitted |
| Keys | Opaque repository cipher, object-envelope and signature-key versions; custody/availability attestations and trust-root identifiers; **no secret material** |
| Protection | R/V identity, complete native-path closure root, WORM/hold verification, earliest continuously recoverable target and known gaps/revocations |
| Validation | State, validator version/digest, component results, bytes/counts, time, independent readback evidence and previous chain/restore qualification |
| Authentication | Company-specific signing key ID, signature over canonical manifest hash and domain-separated version/company/sequence, previous catalog hash, externally anchored monotonic sequence |

Candidate signing algorithm: Ed25519 with an independently custodied key and approved canonical encoding (e.g. RFC 8785 JSON) or an equivalently supported signing service. Select/validate the actual library/service under DR-V2-001; do not implement custom canonicalization or cryptography. Hashes detect corruption; the signature plus trusted external sequence prevents forged replacement/rollback by an attacker holding the VPS credentials. Reject duplicate JSON keys, non-canonical or oversized/deep structures, unsafe integers, path traversal, symlinks in reconstructed paths and unknown critical fields. Encode LSNs/system IDs/large byte totals as validated strings where JSON number precision would be unsafe. Algorithm/encoding references: [EdDSA RFC 8032](https://www.rfc-editor.org/rfc/rfc8032), [JSON Canonicalization RFC 8785](https://www.rfc-editor.org/rfc/rfc8785); neither substitutes for the implementation/security review.

States: `CANDIDATE -> COMPONENTS_VERIFIED -> PROTECTED`; independent restore results append `RESTORE_VERIFIED` evidence. Invalidity appends `REVOKED`/`GAP` evidence, not mutation of an old record. A per-minute `PROTECTED` record means its complete dependency closure and new WAL/receipts were checked against a qualified chain, **not** that a full ERP restore ran every minute. Show `last_actual_restore_at` separately. Production eligibility additionally requires a recent representative `RESTORE_VERIFIED` chain and accepted service evidence.

### 6.2 Causal publication algorithm

1. Validate company/cluster/deployment epoch against independently approved inventory. Only completed, qualified physical chains with protected dependencies are candidates.
2. All allowed object writers already follow receipt-before-reference (§5). The receipt service allocates a durable monotonically ordered sequence only after byte/retention validation. Current and historically required receipts remain available.
3. Coordinator creates marker M and forces segment switch. **After M returns**, request the receipt authority's journal root/high-watermark S. Every object transaction committed before M necessarily obtained its receipt before that commit, and therefore before this later root request. S is a conservative **superset** of assets at M; including orphans/later assets is safe. Do not scan a DB snapshot before M and assume it captures concurrent references.
4. Serialize deployment/migration epoch changes against marker publication. Read the schema/release binding under that epoch; migrations cannot overlap this binding. Business transactions keep running. If epoch changes, abandon the candidate and retry, without publishing mixed schema/images.
5. Protector proves base/dependency/WAL continuity through M in V, pins native metadata and receipt root S, verifies new exact versions and checks retention/key availability. Previously verified immutable dependencies can be reused; fresh unknown bytes cannot. No reliance on LIST ordering, webhook delivery, local upload success or clock comparison alone. Poll/reconcile with pagination so missed notifications are discovered.
6. External signer validates the closure and appends the catalog, then a separate reader fetches/authenticates it from V. Publish the external sequence/head only after data is protected. Partial publication is discoverable but ineligible; do not advance C.
7. C becomes the most recent marker on the approved lineage with an eligible unrevoked catalog. Selection revalidates access/keys/retention evidence and records the actual chosen version. A signed `latest` pointer is a hint; older records remain discoverable if the pointer is lost.

The append-only journal root is an audit commitment, not a requirement that bytes from every receipt ever issued remain forever. Each catalog additionally pins an explicit protected-asset closure. It includes all receipts that could back references at M, plus conservative extras; a receipt can be omitted from a **future** closure only with the signed retirement/GC proof from §5.4 and enforcement preventing any new reference to that retired generation. Existing catalog pins cannot be removed retrospectively. An orphan included conservatively remains pinned until those catalogs expire. Without this distinction, historical journal entries would make safe GC impossible or omission would silently create a recovery gap.

For arbitrary UTC/LSN targets between named points, require a protected later journal/WAL envelope that demonstrably covers **all** potential references up to the target and a base consistent no later than it. Otherwise select the preceding validated marker, reporting its real age. A newer backup cannot be used to recover before its consistency point. Under malicious/temporal corruption, use known-clean boundaries rather than “latest”.

### 6.3 Selection, rejection and recovery validation

Select newest-to-oldest on the approved company lineage, not lexicographic key time. Preflight rejects wrong company/environment/system ID, unsupported format/version, bad signature/root/sequence, revoked record, missing key, incomplete base chain, WAL/history gap, missing exact object version, illegal retention state or incompatible image/schema. External clock uncertainty or incomplete inventory makes selection `UNKNOWN/BLOCKED`. Older fallback requires recording its RPO and explicit incident-owner acceptance; it is not silently compliant if older than 300 seconds.

Before target mutation, verify new host/project/network/volume/PGDATA ownership and source-vs-target inequality; require explicit incident/apply authorization. Isolated restore at M then independently derives the actual DB reference set and joins **every** required row to its protected receipt. The receipt-root superset is not permission to skip this exact join. Download versions, decrypt/hash and restore correct MIME into new operational keys, then GET/hash the target with a different read identity. Missing/ambiguous history fails closed. Do not downgrade migrations or run latest migrations automatically over a historical restored schema; use its compatible release first.

After validation, controlled promotion creates a new timeline. Register/protect its history and archive path, restore the protection coordinator/admission lease, and verify new writes can again meet policy before enabling company writes. Preserve the selected historical catalog and emit a new recovery-lineage record. Promotion must not overwrite old timeline WAL or pretend source and replacement identities are identical.

### 6.4 Frontier monitoring and admission lease

Proposed normal budget, **hypothesis to measure under representative peaks**:

| Phase | Budget |
| --- | ---: |
| Marker cadence / segment close | 60 s |
| Archive transfer to R | 60 s |
| V protection / new-byte verification | 30 s |
| Catalog publication / external readback | 15 s |
| Clock/measurement allowance | 15 s |
| Planned normal envelope | **180 s**, leaving 120 s to the unchanged 300 s maximum |

These are budgets, not independent timeout guarantees or measured percentiles. Overlap may improve latency but cannot be assumed. Full-base verification must complete before chain qualification, not within every 30-second WAL cycle. If peak upload/readback cannot fit, change capacity/cadence/design, not the objective.

External observer every 15 s reports frontier age/LSN/timeline, continuous retention floor, WAL oldest pending/bytes/drain rate, repository/vault lag, object receipt failures, oldest unprotected object, qualified-base age, key/access status, disk/inode time-to-full and last actual restore/service drill. Proposed warning at 120 s; critical/fencing workflow at 180 s; **breach at >300 s**, and boundary testing includes exactly 300 s. Missing heartbeat, unverifiable signature or unavailable keys is critical/unknown, not age zero. Notification delivery and on-call acknowledgement are independently monitored.

If policy B is approved, an externally issued signed company protection lease expires at most 180 seconds after conservative C. Each write path, scheduled worker and direct runtime DB writer must be fenced at transaction admission/commit; caches cannot extend a lost lease. Include maximum transaction duration, cancellation, clock uncertainty and restart/failover behavior in the 120-second margin. Gate receipt-dependent operations immediately if receipt protection fails. A read-only HTTP proxy alone is insufficient because jobs and open transactions can still write; test an actual DB-role/transaction enforcement design under DR-V2-001. Only recovery/archiver identities can create marker/recovery metadata while business writes are fenced.

Fencing cannot retroactively protect already committed local transactions or make C advance during a remote outage. It limits newly exposed work, but `incident - C` may exceed 300 s even with zero later business writes. Report both frontier age and acknowledged-transaction exposure without substituting one for the contractual RPO. This is why policy B alone cannot provide an unconditional compound-fault guarantee.

## 7. Availability and failure decision matrix

**A/B/C in this section are fault-response policies**, not the previous report's architecture A/B/C. They remain unapproved choices:

- **A — Continue temporarily:** preserve service with a bounded incident exception, accepting possible RPO breach. No compliant DR label while the frontier is stale.
- **B — Enforce remote durability:** block operations lacking a receipt and fence company business writes when the protection lease expires. May cause an outage and does not repair old lag.
- **C — Additional independent availability components:** replicated/provisioned recovery infrastructure, potentially remote synchronous commits, with explicit failover and partition policy. No component magically solves all network partitions.

| Failure | Detection / fail-closed recovery rule | Policy A consequence | Policy B consequence | Policy C / escalation |
| --- | --- | --- | --- | --- |
| Temporary B2/S3 connection loss | Both R and V access/lease checked; no new protected frontier without verification | Buffer on disk; incident owner accepts aged frontier and object/commit exposure | Missing receipt blocks affected operation immediately; business writes stop by lease expiry | Independent reachable repository/vault route may help only if prequalified; no ad-hoc fail-open |
| WAL archive command failure | Error counters + pending segment age + exact remote proof | Continue with measured time-to-full, acknowledging loss risk | Fence before deadline; preserve WAL; manual controlled stop before disk exhaustion if needed | Remote WAL flush/standby can protect commits; restore chain and old history still required |
| WAL queue growing | Incoming vs verified drain rate and free bytes/inodes | Accept only explicitly time-bounded exposure; no segment drop | Quiesce/fence; drain and verify before reopening | Scale bandwidth/IOPS or independent replica; a slot without capacity only moves the disk-full problem |
| Remote object unconfirmed/hash mismatch | No PROTECTED receipt; exact GET disagrees | A deferred/pending UX would require product approval; cannot call evidence saved/durable. No unapproved current-flow behavior change | Reject evidence/logo/AVAILABLE transition; DB-only operations follow lease policy | Additional durable destination with tested receipt semantics; eventual mirror alone insufficient |
| Loss of production host | External heartbeat, original host fenced | Restore latest actually eligible point, disclose possible >300 s loss | Same honest selection; stop acknowledgement on dead host; restore in new resources | Warm/preprovisioned data plane reduces provisioning/transfer; confirm old host cannot write |
| Loss/revocation of credentials | Negative auth + expired lease, not empty bucket success | Continued operation exposes data until new key verified | Block unprotected operations; recover via separate custodian, not shared old key | Independent keys/access routes reduce recovery delay; simultaneous custody loss still blocks |
| Corrupted physical backup | Native verification + SHA/readback/restore failure | Do not use corrupt chain; older eligible chain may exceed RTO/RPO | Identical restore rejection, no bypass | Alternate qualified backup/repo/standby; if corrupted data propagated, select older clean point |
| Malicious deletion/metadata overwrite | Signed catalog/sequence and exact V versions; deny/delete tests | Runtime continuation cannot recreate erased history | Do not count mutable R alone; V protection/readback required | Independent vault/account/provider, break-glass; HA is not anti-ransomware backup |
| Protector/catalog/monitor dies | External heartbeat/sequence stops | Writes may continue only under explicit risk decision; no invented protection | Lease expires even if app itself is healthy | Redundant recovery-plane instances with one authoritative sequence/fencing; requires testing |
| Keys lost but bytes available | Decrypt/signature trust-root preflight fails | Backup is unusable, not “exists therefore safe” | Block new unprotected refs; restore blocked until approved custody recovery | Independent escrow/wrapping keys and rehearsed break-glass; no lost-key bypass |
| Host loss + remote outage | No source and no reachable complete protected closure | **Cannot guarantee 300/3600** | Fencing does not restore reachability or freshen C; **cannot guarantee** | Independent reachable replica/vault, keys, images and routing are necessary; outages of all domains remain excluded/NO GO |
| Gap + corrupt newer base + credentials loss | Union of failures invalidates closure | Never choose individually “healthy” components from unrelated points | Fail closed, quantify available clean interval and escalate | Only a pretested independent complete chain can recover; no fixture-derived assurance |

**Recommendation for approval:** policy B as the minimum launch posture for any approved implementation of architecture B; maintain read access where safe, reject unprotected attachments, fence all company writes on lease expiry, and use an incident owner for exceptional availability decisions. This is a proposal **not an enabled feature**. Policy A requires a documented business exception and is incompatible with promising unconditional 300-second RPO during that exception. If the business cannot accept B's outages **or** requires durable acknowledged commits during remote-storage outage plus source loss, approve/measure architecture C instead. A single async host must not be sold as that guarantee.

## 8. Measurable sizing and feasibility

No figures below describe actual company volume. Obtain authorized company aggregates or a signed launch/growth profile before implementation acceptance. The existing benchmark's operational-volume requirement cannot be satisfied merely by relabelling these hypotheses as measurements.

### 8.1 Inputs and measurement plan

| Variable | Measurement / unit |
| --- | --- |
| `D`, `D_growth`, `delta` | Full cluster bytes, tables/indexes/TOAST, daily growth and changed-file bytes; physical restore volume, not only `pg_database_size` |
| `W_avg`, `W_peak`, `W_burst` | Actual archived WAL GiB/h, peak 1/5/60-minute windows and largest transaction; sample `pg_stat_wal`/LSN deltas and actual segment bytes under backups/imports |
| `S_wal`, `cW`, `cD` | Actual segment size and measured WAL/DB compression ratios; include forced rotation padding and encryption overhead |
| `O_live`, `N_live`, `N_new`, `s_object` | Required live/reference-at-C bytes/count; new evidences/day, photo count/size p50/p95/p99/max, branding/other distributions |
| `V_retired`, `versions`, `holds` | Replaced/deleted bytes/day, historical generations, current/retired legal holds and orphan receipts; count PUTs even if DB rolls back |
| `B_up`, `B_down`, `B_verify` | Sustained effective encrypted transfer and exact-version full-readback rate by real region/provider; RTT, throttling, p5 throughput and outage duration |
| `B_restore`, `R_replay` | End-to-end DB/object materialization with decryption, disk writes and required verification; WAL replay GiB/min at peak contention |
| `P_restore`, `Q_api` | Restore parallelism and GET/PUT/LIST/version operations/s; tiny objects can be API/latency bound rather than bandwidth bound |
| `CPU`, `RAM`, `IOPS`, `latency` | Host/container p95/p99 CPU, RSS, fsync/commit latency and sustained mixed I/O under app+backup+hash+GIS; no destructive benchmark on production |
| `T_provision`, `T_images`, `T_GIS`, `T_validate`, `T_route` | Replacement provisioning, pull, GIS hydration/start, full validation, human approval/DNS/TLS/client reconnection time |
| `K`, `ops`, `egress`, `hours` | Retained GiB-month, request classes, recovery/readback egress, monitor/signing/KMS usage, DBA/on-call/drill hours and actual quoted tariffs |

Measure at least an approved representative business cycle plus peaks and backup overlap; a proposed 7–14-day baseline is not a substitute for known seasonal/import peaks. Include failed uploads/readbacks and retry amplification. Every metric needs company, measurement period, method and authority; no PII in aggregate evidence.

### 8.2 Capacity equations

```text
Local_disk >= OS + images(current/previous) + logs + D + growth
            + W_peak * approved_outage_hours + WAL_working_reserve
            + O_live + GIS(active/candidate/rollback)
            + simultaneous_backup/restore_scratch + safety_reserve

R_storage >= retained physical chains + continuous required WAL + metadata
V_storage >= protected physical dependency union + protected WAL
           + live object generations + retired/orphan generations still pinned
           + catalogs/receipts/config/GIS + WORM over-retention
           + margin for next full and failed attempts

O_V >= O_live + integral(retired_bytes still required over retention)
       + protected orphans/holds

Archive_drain > incoming_W_peak during the approved recovery/drain window
Time_to_full = usable_WAL_reserve / max(0, incoming_WAL - verified_drain)
```

With 16 MiB segments and a forced close each minute during activity, rotation alone can produce about **22.5 GiB/day of uncompressed segment files**. WAL compression may reduce this but must be measured; low business activity does not mean zero archival capacity cost. Default 1 GiB free-space settings are not a computed outage reserve.

Do not price only one copy: R and V, retained metadata versions, holds, duplicate verification reads, daily/incremental changes, GIS and test recoveries all consume storage/transfer. With weekly fulls and 40-day buffered policy, use roughly seven/eight fulls for initial worst-case planning and then compute the actual dependency union. Hourly file-level incrementals can re-copy the same changed file many times; daily changed bytes alone can substantially understate storage unless the measured amplification is included.

### 8.3 RTO model and phase budget

```text
T_service = T_detect/declare + T_keys/approval + T_provision + T_images/config
          + T_repo_materialize + T_DB_restore + T_WAL_replay
          + T_objects_restore/readback + T_GIS_ready
          + T_validation + T_traffic_transition + T_client_verification
```

Parallel phases use a measured critical path, not automatic subtraction. Repository reconstruction and DB restore may be pipelined only after that pipeline is proven. A useful optimistic bound is `wire_bytes / effective_download`; a conservative sequential transfer model uses `(D + O_required)/effective_pipeline_rate`, where that rate includes native repo reconstruction, local writes, decrypt/hash and target readback. Actual duplicate wire bytes/extra passes must be measured and charged, not counted away through a faster NIC.

Proposed planning budget: provisioning/images/keys **720 s**; all data transfers **1200 s**; replay **180 s**; service/GIS validation **420 s**; authorized routing **300 s**; post-route client verification **180 s**; spare **600 s** = **3600 s**. This is an allocation for review, not a predicted result. Cold GIS download/rebuild is included in data/provisioning budgets; if it does not fit, a preverified/prepositioned bundle or architecture change is necessary.

### 8.4 Hypothetical small / medium / high scenarios

All sizes use GiB/MiB; these scenarios **are not business measurements or purchase recommendations**. Assume full-pipeline effective rate already accounts for materialization/readback contention, two hours of WAL replay after latest usable backup, and fixed non-transfer/non-replay phases of 1620 s (720+420+300+180). Add any unmodelled GIS download or approval delay; it is not free.

| Hypothesis | Small | Medium | High |
| --- | ---: | ---: | ---: |
| Cluster `D` | 10 GiB | 100 GiB | 500 GiB |
| Objects required at C | 20 GiB | 200 GiB | 2000 GiB |
| Archived WAL average / peak | 1 / 5 GiB/h | 5 / 20 GiB/h | 25 / 80 GiB/h |
| New evidence objects/day × mean | 500 × 1 MiB | 5000 × 1.5 MiB | 50000 × 2 MiB |
| New evidence volume/day | 0.49 GiB | 7.32 GiB | 97.66 GiB |
| Retired generations/day (separate assumption) | 0.1 GiB | 2 GiB | 25 GiB |
| Effective full recovery pipeline | 80 MiB/s | 150 MiB/s | 250 MiB/s |
| Replay rate | 2 GiB/min | 4 GiB/min | 10 GiB/min |
| Data transfer, sequential optimistic model | 384 s | 2048 s | 10240 s |
| Two-hour WAL replay | 60 s | 150 s | 300 s |
| Total model including fixed phases | **2064 s / 34.4 min** | **3818 s / 63.6 min** | **12160 s / 202.7 min** |
| Six-hour peak-WAL reserve, before margin | 30 GiB | 120 GiB | 480 GiB |
| Result | May fit; **not demonstrated** | **Does not fit** even these assumptions | **Does not fit**; large transfer dominates |

Storage illustration, deliberately provisional: eight compressed fulls at `cD=0.65`; 47 days of incremental changed bytes at `0.15*D/day`, **amplification=1 only for this illustration**; 47 days of WAL at `cW=0.5`; objects `O_live + 50*V_retired`; add 25% planning margin. This produces V data estimates of about **859 / 5123 / 27802 GiB** respectively, excluding GIS, metadata/ops, long-lived holds and additional copies. It is a sensitivity example, not an upper bound: hourly file re-copy amplification, full delays, growth or hold accumulation can exceed it. Add R separately from its measured lifecycle. Do not use these totals to provision production.

Resource test envelopes, not replacements for the current caps: small full-stack candidate **8–12 vCPU / 32 GiB**, medium **16 vCPU / 64 GiB**, high **32 vCPU / 128 GiB** or a redesigned topology. Test sustained mixed I/O at exploratory **3000 / 10000 / 30000 IOPS** respectively and measure fsync latency, not only IOPS. Include existing eight-service configured RAM caps of 20.25 GiB, host cache, pgBackRest workers, hash/encryption and GIS preparation headroom. RAM/CPU alone cannot cure the medium/high transfer bottleneck; high tier is not approved merely by buying this host.

### 8.5 When B cannot satisfy the contract

- `(required wire/data work / p5 effective rate) + remaining critical path >3600 s`, including complete object reference hydration and verification. Example: 50 GiB at 100 Mbit/s takes about 72 minutes **just to transfer**.
- No bounded replacement provisioning, key access, image/GIS retrieval, TLS/DNS or decision latency. A pre-existing CI VM is not a measured replacement VPS.
- WAL generation/readback exceeds drain capacity, or the maximum acceptable backup age makes replay miss the remaining budget.
- Required provider/credential/custody is unavailable for longer than the RTO, or object history/backfill has unrepairable gaps.
- Business requires a guarantee under prolonged remote outage plus source-host loss, not merely a healthy-path RPO objective.

First evaluate measured bandwidth/parallelism, shorter replay chains, verified preprovisioning and approved recovery-plane capacity. If these cannot fit with margin, B is **not dimensionally viable** at that profile; revise architecture toward C, prepositioned objects/GIS or another approved design. Do not reduce dataset size, omit readback, move the clock start, or relax 300/3600 to manufacture PASS.

### 8.6 Operating cost model

```text
Monthly_cost = company_VPS + recovery_plane/standby + R_GiB_month * R_rate
             + V_GiB_month * V_rate + operations_by_class * operation_rate
             + normal_ingress/egress/readback + drills_and_incident_egress
             + image/GIS_retention + key_custody/signing + external_monitor/logs
             + DBA/security/on_call_hours + staging/provisioning_hours
```

Collect region/currency/tax/SLA-specific quotes, request quotas, retrieval minimums and emergency egress limits. Do not assume advertised free egress applies to all restoration/readback patterns. Use the provider's current pricing as an input at procurement, not a price locked by this report. [B2 pricing](https://www.backblaze.com/cloud-storage/pricing). Monitor cost growth from WAL cadence, orphan generation and WORM retention alongside capacity; cost alarms cannot automatically delete required recovery dependencies.

## 9. Comparison with architecture Alternative C

| Dimension | Proposed architecture B | Architecture C: B plus independent replicas/HA |
| --- | --- | --- |
| Active ERP topology | Existing one-company/one-active-backend local stack | Same company boundary; standby/HA topology requires spec amendment and operational ownership |
| DB data loss | Async archive/vault lag; <=300 s only within measured healthy envelope | Async replica still needs bounded lag; synchronous remote flush can protect acknowledged commits while available |
| Commit policy | Local `synchronous_commit=on`; remote archive after commit | Candidate `synchronous_commit=on` plus explicitly configured required synchronous standby; no automatic downgrade when unavailable |
| Partition tradeoff | Policy A risks RPO; policy B stops exposed work | Required synchronous node loss stops commits; choose availability/durability explicitly |
| Service RTO | Provision, download, restore and verify full required state | Warm DB/objects/GIS and prepared ingress can shorten critical path, but cutover/fencing/validation still count |
| Objects | Remote receipt barrier and protected history mandatory | Identical requirement; DB replication does not protect objects |
| Corruption/ransomware | Independent immutable closures/keys | Still required; a replica propagates malicious writes and deletes |
| Operation/cost | Backup/storage recovery plane plus cold replacement | Additional independent host/zones, DB/object capacity, replication, failure detector/quorum, fencing and drills |
| Multi-company | Dedicated identities and storage per silo | Same; no shared tenant-aware ERP process or all-company failover |

PostgreSQL distinguishes asynchronous shipping from synchronous replication; `remote_write` is not the proposed durable remote-flush condition. A sync commit policy needs a named eligible standby and explicit behavior when none is available. Promotion must prove fencing; two mutually unreachable nodes are not a safe quorum by themselves. [PostgreSQL standby and synchronous replication](https://www.postgresql.org/docs/16/warm-standby.html).

C does not automatically authorize multiple backend replicas: current in-memory throttling/session fan-out assumptions remain. A DB standby with controlled single-backend failover is different from horizontal app scaling. Choose the smallest independent topology supported by the approved failure envelope. No Patroni/consensus tool, cloud vendor or managed database is selected unilaterally here.

## 10. Incremental implementation sequence — future work only

No task below is started by this design. File names marked **new/proposed** are planned artifacts, not claims that they exist. New application logic must be TypeScript. Preserve the dirty tree, v1 bytes, company isolation and explicit apply/cutover controls. Every task requires strict RED → GREEN against real failure semantics, not source-string checks alone. Small fixtures can prove mechanics; they cannot certify production sizing/RPO/RTO.

### DR-V2-001 — Approved specifications and contracts

- **Scope:** approve topology, fault envelope/policy A/B/C, lease enforcement, encryption/signing implementation, IAM, retention graph, versioned schemas, sizing profile and service-ready authority. Update canonical specs **only after approval**.
- **Files:** existing deployment/Docker/env specs; `docs/architecture/multi-company-silo.md`; runbooks backup/monitor/restore; **new/proposed** `specs/modules/disaster-recovery-v2.md`, `docs/architecture/disaster-recovery-v2.md`, JSON contract schemas under `scripts/database/dr-v2/`.
- **Dependencies:** business/DBA/security/operations review of this report and baseline inventory. **Risks:** unapproved availability loss, false RPO guarantee, cryptography/provider capability mismatch.
- **RED:** contract examples accept missing company/version/WAL/receipt or confuse hold-point with service. **GREEN:** executable schema/algorithm tests reject them; reviewers sign exact failure envelope, resource profile, trust model and policy.
- **Evidence:** signed decision record, traceability to §§4–11, real provider capability proof plan and explicit pending items; no simulated approvals.
- **v1 compatibility:** document exact separate discriminator/namespaces; no v1 contract changes. **Rollback:** withdraw unapproved draft; do not alter data or reinterpret prior evidence.

### DR-V2-002 — Physical repository, WAL and PITR

- **Scope:** reviewed DB image, stanza/system-ID binding, physical schedules, R→V closure, checksum verification, continuity and native restore materialization; independent retention/cipher custody.
- **Files:** `docker-compose.production.yml` in a future reviewed integration; **new/proposed** `docker/database/dr-v2/Dockerfile`, configuration templates and `scripts/database/dr-v2/` physical/protector tooling plus tests; deployment templates/runbooks.
- **Dependencies:** 001 and separately authorized isolated storage/hosts. **Risks:** libc/extension mismatch, missing WAL, credential overreach, mutable metadata/WORM conflicts and storage exhaustion.
- **RED:** real PostGIS restore fails with missing segment, wrong key, corrupt page/file, wrong system ID and overwritten R metadata. **GREEN:** exact named/LSN/time target restores with before/after sentinels and timeline fork; original protected closure survives R overwrite/deletion attempts.
- **Evidence:** pinned built-image digest/SBOM/scan, native logs, exact-version inventories, independent decrypt/readback, real loss/restart tests and retention boundary restore.
- **v1 compatibility:** v1 timer/scripts/data untouched and distinguishable; plan resource coexistence. **Rollback:** roll back image/config only within compatible PG16 storage format, retain R/V/WAL and last good v1; stop v2 eligibility, never claim fallback meets five-minute RPO.

### DR-V2-003 — Object/version protection and backfill

- **Scope:** explicit durable receipt contract, immutable keys, exact-version retrieval, all three writer services including retry/compensation paths, additive asset bindings, backfill, tombstones/GC and restore mapping. Select supported envelope/signature implementation under 001.
- **Files:** `backend/src/modules/object-storage/{object-storage.port,object-storage.service,object-storage.module}.ts`; delivery, branding and fiscal-artifact services/tests; `backend/prisma/schema.prisma` and **new/proposed** additive migration; **new/proposed** TypeScript recovery-plane asset service and contracts/tests under approved source/script trees; reference verifier integration.
- **Dependencies:** 001; may develop mechanically after 001 but cannot activate integral coverage until 002 and 004. **Risks:** changed upload latency/errors, unknown DB outcome, late commit after GC, deterministic fiscal overwrite and historical missing bytes.
- **RED:** inject crash after each write/receipt/commit, lost ACK, checksum/MIME mismatch, remote timeout, branding replacement, concurrent retries, multipart abort and late intent; reproduce missing old logo on pre-replacement restore.
- **GREEN:** no committed required reference without verified receipt, exactly-once logical binding, historical versions recover, orphan retention safe, 100% required baseline coverage; fiscal remains disabled.
- **Evidence:** real selected-provider PUT/GET/version/retention/denial results, DB persisted readbacks, full backfill exception report and restored historical branding/evidence; not just mocks.
- **v1 compatibility:** additive schema; v1 logical exports still read current keys and unchanged format. Historical v2 receipts cannot be erased to satisfy old cleanup behavior. **Rollback:** revert only compatible reader/writer release under a fence; preserve all receipts/versions/mappings. Re-enabling legacy deletion or unprotected writes loses v2 eligibility and requires incident/business decision, not automatic fallback.

### DR-V2-004 — Integral recovery catalog

- **Scope:** authenticated format, marker/receipt-root causal protocol, epoch serialization, native-path closure, selection/rejection, trust-root and external sequence recovery.
- **Files:** **new/proposed** v2 catalog schemas, TypeScript coordinator/validator/selector and tests under `scripts/database/dr-v2/`; company configuration contract via additive versioned schema; canonical spec/runbook additions.
- **Dependencies:** 001–003. **Risks:** snapshot-vs-marker race, schema/release mismatch, replay/rollback attack and falsely verified incomplete closure.
- **RED:** interleave object receipts and DB commits around M; mutate schema epoch; omit pagination/shard/WAL/version; corrupt signature; replay old signed head; cross company with matching local row IDs.
- **GREEN:** conservative receipt superset always covers references at M; invalid candidate never advances frontier; immutable published closure is independently retrievable without VPS state.
- **Evidence:** concurrency schedules, authenticated catalog/shard roots, restored-reference exact join, external restart/rebuild and negative-case artifacts.
- **v1 compatibility:** separate reader/format; strict v1 still rejects v2. **Rollback:** stop publication, retain every prior record and key; selector returns last truly eligible record with real age, never fabricates fresh v1 PITR.

### DR-V2-005 — Isolated physical restore and verifier

- **Scope:** new-PGDATA restore, exact target/timeline, object version hydration, comprehensive readback, domain invariants, key recovery and fail-closed hold point.
- **Files:** **new/proposed** v2 physical executor/verifier/isolated Compose/tests under `scripts/database/dr-v2/`; reuse guards/invariants from `restore-company-production-replacement.sh`, `verify-restored-database.sh`, `recovery-storage-reference-verifier.mjs` without weakening their v1 contracts; runbook additions.
- **Dependencies:** 002–004. **Risks:** physical cluster role/name differences, wrong mounted volume, incomplete target treated as end-of-archive, provider version remapping, old release incompatibility.
- **RED:** wrong company/host/PGDATA, existing source target, missing target WAL/key/object, incomplete migration and falsified ready response must prevent acceptance. **GREEN:** only new owned resources mutate; restored marker/sentinels, exact object hashes and business invariants pass after independent process restart/readback; traffic stays closed.
- **Evidence:** full restore timeline, native replay target evidence, read-only comparisons, target ownership/network proof, smokes and cleanup result; no source overwrite.
- **v1 compatibility:** original dump/drill executors unchanged; physical guards are additive and stronger, not suffix substitutions. **Rollback:** fence/discard only separately authorized owned failed targets; preserve original and failed evidence. No automatic destructive cleanup on import failure.

### DR-V2-006 — Recoverable-frontier monitoring and admission

- **Scope:** seconds-based external frontier/retention monitor, signed protection lease, all-write-path enforcement, alerts and custody/heartbeat/drain/capacity checks under approved policy.
- **Files:** `scripts/monitoring/monitor-production.py`, tests and health-monitoring runbook for additive v2 reporting; **new/proposed** external monitor/lease services and units under `scripts/monitoring/` / `docs/runbooks/systemd/`; backend/DB enforcement files resolved in approved 001 design.
- **Dependencies:** 004–005 and all-writer enforcement from 003; approve exact policy before activation. **Risks:** false green, stale cache, in-flight/background write bypass, monitor as new single point and clock skew.
- **RED:** kill host/monitor/signer, skew clock, deny read/decrypt, grow WAL, let transaction outlive lease; notifications dropped. **GREEN:** critical/unknown reaches external guard; no bypass after lease; fresh verified point required before reopening; alerts and response independently timestamped.
- **Evidence:** measured 120/180/300-second boundary tests, process-restart tests, durable lease/admission logs and external alert receipt/ack; report over-target breaches honestly.
- **v1 compatibility:** keep hours-based v1 checks explicitly separate; never just set `BACKUP_RPO_HOURS` to a fractional value. **Rollback:** disable new admission only by approved availability exception; maintain alerts and protected data; v2 becomes unaccepted/degraded, not green.

### DR-V2-007 — Representative replacement benchmark integration

- **Scope:** version-aware benchmark selects v2 executor, measures full provisioning/data/GIS/verification and emits separate hold-point vs service metrics. Retain no-production-cutover default and add controlled staging service evidence ingestion.
- **Files:** `scripts/database/representative-replacement-benchmark.py`, tests, smoke/traffic hooks and volume templates; `.github/workflows/representative-replacement-benchmark.yml`; **new/proposed** v2 result schema; replacement runbook. Preserve the two pre-existing local fixes in these files rather than replacing them.
- **Dependencies:** 005–006; approved images and representative measurements/launch profile via explicit contract decision. **Risks:** clock truncation, fixture padding, skipped GIS/objects, cold-host provisioning omitted and stale image artifacts.
- **RED:** fresh hold-point response with no service-ready proof, missing volume/digests/host receipt, ±20% distribution failure, 301-second RPO or 3601-second service RTO must not pass.
- **GREEN:** actual representative bytes/rows/object distributions and full timeline accepted; staging routing evidence separately authorized/signed, source untouched; valid cleanup mandatory.
- **Evidence:** company-scoped volume, host provisioning, release digests, phase timings, hash/reference/domain results, service-client evidence and cleanup; checked-in fixtures alone never sufficient.
- **v1 compatibility:** existing v1 result names retain original meaning; do not redefine `PASSED_RTO_OBJECTIVE` historically as service restored. **Rollback:** keep original harness callable; new evidence remains versioned and cannot certify v2 if integration is disabled.

### DR-V2-008 — Staging and representative acceptance

- **Scope:** production-like company silos, approved normal/peak growth workload, 35-day real retention proof, every fault in §11, service transition and operational/cost sign-off. No production deployment.
- **Files:** future company-scoped acceptance report under `Audit/`, runbooks and evidence inventories; **new/proposed** staging scenarios/acceptance drivers under `scripts/database/dr-v2/`; no unrelated business changes.
- **Dependencies:** 001–007, operational owners/guardia, private credentials and separately authorized infrastructure. **Risks:** non-representative launch profile, unsafe fault injection, incomplete 35-day history and underestimated human/egress time.
- **RED:** representative fault tests expose any missing bytes, stale point, isolation leak, orphaned effects, money/stock discrepancy or missed time limit. **GREEN:** all mandatory tests pass with full persisted/readback evidence; accepted failure envelope/policy is signed; oldest/mid/latest retained points actually restored.
- **Evidence:** raw sanitized timelines/results, snapshots of aggregate workload/capacity/cost, independent custody exercise, source-loss drill, external alerts, v1 regression, rollback/service verification and owner approvals.
- **v1 compatibility:** prove coexistence/restorability and resource budget; v1 retirement, if ever desired, is a separate decision. **Rollback:** close staging routing and remove only owned test resources with approval; production stays unchanged/NO GO pending its own release decision. Failed acceptance does not trigger scope-expanding repairs automatically.

## 11. Real acceptance tests and evidence contract

All runtime tests below are **NOT RUN in this design task**. Use the exact selected PG/PostGIS/pgBackRest/provider/image versions and at least two isolated company silos. Selected external-provider semantics need real provider tests: an S3 emulator can test mechanics, not certify B2 WORM/IAM. Failure injection is allowed only in separately authorized disposable/staging resources, never production or the sole protected backup.

| ID | Real test / RED injection | GREEN acceptance and required evidence |
| --- | --- | --- |
| AT01 | Under normal, low and peak approved load, record independently acknowledged money/inventory/evidence sentinels; lose source at varied points in the marker cycle | Latest recovered valid C has conservative age **<=300 s**, every eligible pre-C commit/reference present and post-target sentinel behavior exact; record lost acknowledged operations explicitly, clocks and selected catalog |
| AT02 | Cold total-VPS replacement with no original disk/cache/config/secret access | New infrastructure, images/GIS/keys, physical/object restore, checks, approved **staging** traffic transition and clients reach **SERVICE_RESTORED <=3600 s**; keep hold-point metric distinct |
| AT03 | Create evidence and logo; replace/delete after a protected marker; include a logo older than 35 days before replacement | Restore before/after replacement and recover exact old bytes/version/hash/MIME even when absent locally; legal-hold/retention readback and historical DB references agree |
| AT04 | Crash after local PUT, remote PUT, receipt append, DB commit and response; inject transaction abort/unknown response and concurrent retry | No required committed reference without a valid receipt; no lost old generation, no duplicate logical effect; protected orphan remains GC-safe; restart and independent DB/S3 readback prove state |
| AT05 | Remove/corrupt one required WAL segment in an owned test chain; leave later segment names present | Frontier freezes before gap; target beyond it is rejected; new base creates a new interval but continuous 35-day status remains failed until repaired. No `pg_resetwal`, gap skip or end-of-archive promotion |
| AT06 | Deny R/V endpoint access during writes, then lose source; separately saturate upload/readback and grow WAL | Chosen policy behaves exactly as approved; breach/unknown reported, queue preserved and time-to-full alerted. B **must fail** unconditional compliance in prolonged compounded outage unless C/alternate qualified domain actually recovers within limits |
| AT07 | Revoke upload, monitor, restore and unwrap credentials individually; lose all VPS-local credentials | Least-privilege failures visible; independent custodian restores authorized access within measured RTO allocation; no secret logging or use of another company's keys; unavailable sole key blocks restore |
| AT08 | Use company A tokens, bucket/repository paths, catalogs, signatures, keys and target markers against B, including identical row IDs | Every cross-company attempt denied **before target mutation**; B original data/service unchanged; byte/count/ownership readback with separate principals |
| AT09 | Corrupt base/file/page/manifest/ciphertext; overwrite mutable R metadata and signed-head hint; attempt malicious version deletion | Signature/sequence/SHA/native verification rejects corruption; protected historical V closure still reconstructs; writer cannot delete/release hold/change retention; no unverified fallback |
| AT10 | Full business cycle: cash/credit sales, payments, refunds/cancellations, purchases/receipts, CEDIS supply/return, route collections/settlement/reopen, cash closing and evidence | Money/stock/receivables reconcile at C using the canonical rules and frozen transaction expectations; zero unexplained deltas or duplicate effects; real persisted PostgreSQL queries and authorized HTTP reads, not response-only asserts |
| AT11 | Recover named, time and LSN targets, including long transactions spanning marker and promotion to another timeline | Only commits before/at selected semantics visible; no half transaction; exact ancestry/history and PostGIS query results correct; new timeline archived without colliding with old |
| AT12 | Full 35-day retained window with normal expiration, delayed full, long-lived logo retirement, orphan and active-restore pins | Restore oldest floor, intermediate points, boundaries around expiration and latest point; continuous WAL/dependencies/object coverage, keys and images still available. Changing system clock or fabricated object dates is not elapsed retention proof |
| AT13 | Kill protector/signer/monitor and restart with local state lost; stale receipt root, lost notifications, duplicated/paginated listings | External append-only authority rebuilds consistent state; lease expires as designed, no false frontier advancement; complete reconciliation and independent alert receipt |
| AT14 | New-target restore then independent process/host restart, read-only DB inspection and S3 GET of **every** required version | Byte hashes/size/MIME and business rows persist; target read principal cannot read source or other company; no in-memory-only proof; cleanup result retained separately |
| AT15 | Missing/mismatched image digest, GIS bundle, schema migration, trust root or provider version; attempted wrong PGDATA mount | Preflight/verification fails closed, traffic stays closed, source unchanged; unavailable dependency is BLOCKED, not a skipped PASS |
| AT16 | v1 backup/restore and its corruption/company/cleanup negative cases with v2 installed | Original format/reader/retention semantics and disposable guards unchanged; separately label its real RPO/RTO scope; no retrospective PITR claims |
| AT17 | Disk/inode pressure, full backup overlapping peak, background job and long transaction across lease expiry | No pending WAL discard; measured admission/fencing reaches **every** writer; recovery drains faster than arrival, reopens only on fresh proof; app latency/resource SLOs and reserve hold |
| AT18 | Loss of source plus corrupt newest backup / expired key / blocked primary repository in combinations from approved envelope | Either independent complete qualified path meets 300/3600, or explicit FAIL/NO GO for that envelope; no mixing unrelated company/point components and no silent policy downgrade |

### 11.1 Domain integrity oracle

Freeze independent expected results at the selected commit/marker boundary, including precise decimal values and operational location identities. Do not infer monetary correctness from table counts. Reuse the existing accepted functional rules without changing them:

- `Payment` remains the monetary source; one collection payment applies to one receivable in the MVP. Compare payment effects, cash movements, authorized cancellations/reversals and outstanding balances; do not activate PaymentAllocation.
- Inventory reconciles movement lineage and balances **per operational location**, including CEDIS sent/received/sold/returned constraints. No global-stock substitute or hidden discrepancy adjustment.
- Route collection/settlement/reopen and closing projections agree with underlying persisted operations at C. Date-bounded checks use `America/Mexico_City` civil-day boundaries rather than server-local dates.
- Evidence availability, immutable identity and byte hashes agree with DeliveryEvidence/branding and existing AVAILABLE fiscal records. No PAC call or synthetic fiscal “success” is authorized by recovery.

Expected business rows and object bytes are obtained independently from the test workload's acknowledged operation journal and selected target, not calculated solely by the same application implementation being tested. Verify before/after restart using a separate connection/process and restricted read credentials. Preserve the accepted GO FUNCIONAL report unchanged; these tests validate recovery, not a rewritten product contract.

### 11.2 Evidence required for any acceptance statement

Each result records task/test ID, company and opaque source/target host references, source commit and all digests, schema/cluster/timeline/LSN/marker, catalog signature/version/root, exact object version inventories, clocks/uncertainty, phase durations, incident/declaration/hold/service times, measured volume and profile authority, fault settings/outcome, domain comparisons and independent readback. Keep raw sanitized native outputs, hashes and verifier version with external protected custody. No secrets, credentials, signed URLs, customer payloads or raw environment files in shared logs/artifacts.

Results: `PASS`, `FAIL`, `BLOCKED`, `UNKNOWN`, `NOT_RUN`, with applicability and reason. Missing required proof is not PASS. Cleanup failure is separate and blocks final acceptance; do not destroy failed resources before evidence/ownership approval. A sampled object check cannot stand in for complete referenced-object readback. Sampling older points supplements, but does not replace, complete dependency/continuity checks of the retained interval.

## 12. Decisions pending explicit approval

| Decision | Required owner(s) | Status / effect |
| --- | --- | --- |
| Adopt B or require C; exact guaranteed failure envelope | Business + architecture + DBA/operations | **PENDING**. 300/3600 remain unchanged; unconditional compound-outage guarantee excludes plain async B |
| Policy A exception versus B fencing, transaction deadline, operator authority and user messaging | Business + operations + security | **PENDING**. No writes are blocked by this report |
| R/V provider, account/region separation, second-provider need, residency and budgets | Security + procurement + operations | **PENDING**, no infrastructure or spending authorized |
| Candidate 2.60.0, derived PostGIS image build/scan and supported Alpine integration | DBA + release/security | **PENDING**, digest not built/published |
| Encryption/signature implementation, custody, rotation and dual-control hold release | Security + DBA + legal | **PENDING**, no novel crypto implementation authorized |
| Retention at least 35 days, proposed 40-day buffer/50-day vault policy and longer business holds | Business + legal + security | **PENDING**; no automated purge policy activated |
| Additive asset/schema migration, receipt contract and backfill historical-gap disposition | Backend/domain owners + DBA + business | **PENDING**; prior missing bytes cannot be invented |
| Volume, peak/growth/outage reserve and representative acceptance profile | Business + QA + DBA/operations | **PENDING**, hypothetical scenarios are not approved inputs |
| Runtime/DB-role enforcement of lease across workers/open transactions | Architecture + DBA + security | **PENDING**, must be proven before any policy-B activation |
| Replacement/service cutover authority, DNS/TLS timing, on-call staffing and evidence retention | Operations + business + QA | **PENDING**, hold-point alone insufficient |
| Canonical spec amendments and DR-V2-001–008 implementation authorizations | Maintainer + architecture + business | **PENDING**, none executed here |

The recovery controller does not choose these policies on behalf of the company. Approval should name owners, decision scope, failure envelope, measurable acceptance, rollback, resource budget and dates. If a decision changes a canonical business/deployment rule, update its spec before implementation.

## 13. Risks maintaining production NO GO

1. **v2 is design only:** no physical/WAL pipeline, object barrier, catalog, admission gate or independent recovery evidence implemented by this task. Current v1 cadence does not meet the five-minute contract.
2. **Async compound-fault limit remains:** alarms/fencing do not establish a recent remotely recoverable point during prolonged remote outage plus host loss. An unconditional guarantee requires an approved stronger topology/failure envelope.
3. **No measured representative RTO to service:** cold provisioning, repository reconstruction, object readback, GIS, key custody and traffic/client transition may exceed 3600 s. Medium/high hypotheses already exceed it under stated assumptions.
4. **Historical integrity/backfill unproven:** deleted old logos or overwritten fiscal-key history may be unavailable; 35 days of continuous v2 history does not exist merely because a policy is written.
5. **Provider/security integration unproven:** actual version IDs, WORM, capability separation, cipher/signing keys, restore access and mutable-repository closure need real tests. A single account/provider/custodian can remain a correlated failure domain.
6. **Supply chain and broader release gates remain:** prior audit reports approved release-image/configuration and staging gaps. This task did not refresh remote CI/publication state or close production-hardening findings; require current proof in the future release decision.
7. **Operational readiness remains unaccepted:** staffing, external alerts, incident authority, pressure/shutdown policy, quotas and cost/capacity require sign-off. Backup configuration alone is not an operated DR service.

**GO FUNCIONAL remains unchanged within its accepted local functional scope. Production remains NO GO.** Neither completion of this document nor proposed selection of pgBackRest is production approval. No CFDI/PAC activation, image publication, new infrastructure or v1 modification follows implicitly.

## 14. Design-task verification and preservation record

### 14.1 Sources inspected

- `AGENTS.md`; canonical deployment, Docker and environment specs; targeted task lookup in `specs/.specs/07-workflows/task/action.md` (no entry for this task); silo architecture document.
- Both production audit/remediation reports; GO FUNCIONAL report identity preserved without rerunning its audit.
- `ObjectStoragePort`, its registered S3 implementation/module and actual delivery/branding/fiscal writer paths; relevant Prisma models; frontend/shared writer search.
- Physical absence/current logical-backup paths, coordinator, manifests/retention, object backup/restore paths, production replacement executor and Compose, DB/reference verifiers, representative benchmark/templates/workflow.
- Backup/recovery/replacement/monitoring runbooks, monitor implementation and backup/monitor timers; current PostgreSQL/PostGIS/SeaweedFS Compose configuration.
- Primary technical documentation linked next to externally verified claims. Version/pricing/provider claims were checked from official sources on the design date; no third-party blog supplies a technical guarantee.

### 14.2 Executed checks and limits

Performed repository/source read-only inspection, official documentation retrieval, arithmetic recomputation, report structural readback (sections, tasks, acceptance coverage, balanced code fences, local paths and whitespace), Git identity/diff preservation and hashes. **No runtime tests/builds were appropriate to this documentation-only task.** Future RED/GREEN criteria are specified, not reported as executed. Report validation is not DR runtime acceptance.

Initial `shasum` failed because the sandbox could not load Perl's library; the approved retry outside the sandbox succeeded. This was a local hash-tooling issue, not a backup/restore failure. No permissions or dependencies were repaired. A private scratch baseline recorded only hashes/status/diff identity; it is not a recovery catalog or durable enterprise evidence.

| Preserved file | SHA256 |
| --- | --- |
| Existing workflow overlay `.github/workflows/representative-replacement-benchmark.yml` | `fce73f9910d8ff7ea4b0666a0938a6e0dac68411e5e2863f45bd95ec4a53b703` |
| Existing test overlay `scripts/database/test-representative-replacement-benchmark.py` | `f9232bfe007beeb83c3caf53d9f59f7d6602460bcf932d52763448598e97240c` |
| Production audit `ERP-PRODUCTION-READINESS-001.md` | `15cd3053f2beca8293b8343a2836aeefd72f3932026722eae09e30741fe22a26` |
| Prior remediation `ERP-PRODUCTION-READINESS-REMEDIATION-001.md` | `8df91805a67268302567b3173a0855c30375d9ecbaccbe6caef5e868d5d62c8d` |
| Functional audit `AUDIT-ERP-FUNCTIONAL-CRITICAL-001.md` | `9d97edab22c4fbc7e52ccf6af9789cedee660a94dc1a9506fe27ff0643e8a46e` |

Only new deliverable: `Audit/ERP-PRODUCTION-DR-V2-DESIGN-001.md`. `Audit/` is already ignored at `.gitignore:37`; do not change that rule, force-stage, commit or push. The report must be read directly because `git diff --check` does not inspect ignored files. Subsequent implementation requires separate authorization, approved specs and the evidence described here.

### 14.3 Read-only reproduction of document checks

These checks inspect the report, not the future recovery system:

```bash
git status --short
git rev-parse HEAD
git diff --check
python3 - <<'PY'
from pathlib import Path
import hashlib, re
p = Path('Audit/ERP-PRODUCTION-DR-V2-DESIGN-001.md')
s = p.read_text()
assert sum(line.startswith(chr(96) * 3) for line in s.splitlines()) % 2 == 0
assert all(line == line.rstrip() for line in s.splitlines())
for number in range(1, 15):
    assert re.search(r'^## ' + str(number) + r'\.', s, re.M)
for number in range(1, 9):
    assert re.search(r'^### DR-V2-' + f'{number:03d}' + r' —', s, re.M)
for number in range(1, 19):
    assert '| AT' + f'{number:02d}' + ' |' in s
print('DOCUMENT_STRUCTURE_PASS', hashlib.sha256(p.read_bytes()).hexdigest())
PY
```

## Key Learnings:

1. Integral PITR requires a causally complete object-version closure; adding WAL to a DB-only backup never establishes a five-minute ERP recovery point.
2. Receipt-before-reference solves object/DB ordering, but asynchronous DB archiving still has an explicit compound-outage availability/durability limit.
3. Historical object retention follows the last recoverable DB reference, not the object's creation date; mutable backup metadata needs protected version mappings, not indiscriminate WORM.
4. Recovery completion is verified service after an approved traffic transition; `READY_FOR_CUTOVER` and small-fixture timings are strictly weaker evidence.
