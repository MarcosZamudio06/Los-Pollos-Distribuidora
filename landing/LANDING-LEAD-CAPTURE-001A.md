# LANDING-LEAD-CAPTURE-001A — Receiver hardening audit

**Baseline:** clean HEAD `99c3b7891ed5246b5740b53ac1591e4c0152ab61`. This report supersedes the receipt/deduplication and maintenance guidance in task001 for the changed behavior only. Task005/006 assets, styles, reports and operational ERP modules remain untouched.

**Verdict:** local hardening checks PASS. **Public/commercial release remains NO_GO**, pending owner privacy approval, real infrastructure and authorized external mail acceptance. This is a fresh task001A assessment, not inherited acceptance or an independent human/reviewer certification. Work was linear, with no subagents, commit, push or merge.

## Findings and corrections

| Priority | Verified HEAD finding | Correction and fresh evidence |
| --- | --- | --- |
| 1 | A matching payload under an unrelated key returned an earlier reference, duplicate flag and notification state. Legacy aliases retained this capability. | Only the original `leads.request_key` can replay a receipt. No content-based lookup; legacy alias table is no longer read/written by reception. New keys receive new references and pending status, regardless of identical content. Same-key retry/conflict behavior retained. RED reproduced both disclosures; GREEN covers both. |
| 2 | Both config and service silently selected `demo-contact-v1`. | No implicit version anywhere. `canSubmit` requires a valid explicit build-time version. Service also rejects missing/invalid/stale caller versions before fetch; server still requires exact approved version. Production browser build with reserved test URLs but no version has zero commercial forms. |
| 3 | Rate responses preceded CORS, hiding429 from browsers. Rejected source attempts rolled back global counts. Invalid origins bypassed counters. | CORS is installed first; all exact-route POST attempts count before origin rejection. Source/global counters commit even for rejected requests.429 has generic `LEAD_RATE_LIMITED`, remaining-window `Retry-After`, exposed header and a safe actionable UI error. Storage failures remain503, not429. |
| 4 | Retention/backup/recovery were owner procedures without executable verification. | Added private, schema-checked backup/restore/purge commands; dry-run by default, explicit cutoff/reference and stopped-service acknowledgement for deletion. Real synthetic CLI drill and disk-backed tests verify backup, recovery, content, non-overwrite and removal. No production deletion executed. |
| 5 | Browser work was blocked in001. | Fresh permitted Playwright MCP execution:1440/1280/768/390/320, keyboard focus, no overflow, white heading, reduced-motion, invalid fields, consent, lost acknowledgement/retry, cross-key privacy and real429. Actual local receiver/disk readback; no external delivery implied. |
| 6 | Standard Nest build attempts to remove protected `backend/dist/shared` because `deleteOutDir:true`. | Reproduced ordinary/escalated failure without permission changes or manual removal. Added `build:isolated`: same Nest compiler, resolved original root-file list/configuration, fresh temporary output, no cleanup of existing dist. Final Nest compilation PASS. Standard build remains environment-blocked, not repaired. |
| 7 | Commercial bootstrap was separate; needed renewed evidence. | Import-closure regression rejects operational/Prisma/database imports and relative escapes. Startup works without a tenant database configuration.1271 existing landing/ERP/shared files retained their hashes; no operational/model/schema changes or tenant DB commands. |

### Privacy-safe receipt contract

`POST /leads` still durably commits before returning201 and `accepted:true`, `receipt:stored`, `reference`, `duplicate` and `notification`. Validation, body cap, honeypot and outbox remain in place.

- **Same original random UUID key + same normalized payload:** own receipt replay, no additional lead or email; persists across restart.
- **Same original key + changed payload:**409, no overwrite.
- **Independent key + identical payload:** new private receipt, `duplicate:false`, initially `notification:pending`; never reveal an earlier request.
- **Legacy cross-key aliases:** intentionally not honored, including after upgrade. Existing tables/data are not destructively migrated.

Tradeoff: independent submissions and reloads that lose their key may create another lead. This is deliberate: content similarity cannot authenticate someone to another person's receipt. Browser in-flight locking and stable retries in the current form remain. The random key is a bearer replay capability; do not log or expose it through analytics.

### Explicit consent version

Set `VITE_LANDING_PRIVACY_VERSION` to the same owner-approved identifier as `LEAD_PRIVACY_VERSION`, and rebuild. Allowed identifiers are1–80 characters from letters, digits, `._-`; whitespace is not silently normalized into approval. `.env.example` leaves it empty. An explicit but mismatched server version is rejected, not silently upgraded. A version identifier/checkbox does not create legal approval; the actual notice and collection wording remain owner responsibilities.

### Rate scope and limitations

Counters are durable per commercial SQLite datastore, shared by connections/workers on that host. Existing policy remains five attempts/source per ten-minute fixed bucket and100 globally. All POSTs to exact `/leads`, including invalid/forged origins and invalid bodies, consume both budgets. Other paths and preflight OPTIONS are not reception attempts. Fixed windows permit boundary bursts; this is not a rolling-window/WAF or botnet protection claim.

`Retry-After` is the positive number of seconds to the current bucket boundary. Allowed-origin browsers can read it, including on429. Exact origin matching remains a browser policy, **not authentication**: non-browser clients can forge Origin. Only configured trusted proxy IPs may supply forwarded addresses; otherwise the socket source applies. Shared NATs/proxies share a source budget. At deployment, overwrite forwarding headers, firewall direct access, configure the trusted edge narrowly, and add edge-level connection/request abuse controls. Rate-secret rotation changes source hashes, not the shared global budget. Expired counter rows are removed on the next counted POST; retirement/backups must also cover those pseudonymous hashes.

## Private lifecycle controls

`backend/src/commercial/data-ops.cli.ts` is an operator command, never a public endpoint. It does not load ERP `.env`, Prisma, tenant configuration or mail credentials. It requires an existing regular file with the commercial table/column shape and a successful SQLite integrity check. Unrelated SQLite schemas are rejected without mutation.

Run from repository root, with **operator-supplied private paths**:

```bash
# DB, SNAPSHOT, RESTORED and RETENTION_CUTOFF must be selected by the owner/operator.
# SNAPSHOT and RESTORED must be NEW absolute paths; existing files are never overwritten.
OPENSSL_CONF=/dev/null npm --prefix backend run commercial:data -- \
  backup --source "$DB" --destination "$SNAPSHOT"
OPENSSL_CONF=/dev/null npm --prefix backend run commercial:data -- \
  restore --source "$SNAPSHOT" --destination "$RESTORED" --service-stopped

# Preview: no deletion. Cutoff must be an explicit, non-future ISO timestamp,
# including milliseconds, e.g. the format YYYY-MM-DDTHH:mm:ss.sssZ.
OPENSSL_CONF=/dev/null npm --prefix backend run commercial:data -- \
  purge --source "$DB" --before "$RETENTION_CUTOFF"
# Only after owner approval and independently confirming ALL receiver/workers stopped:
OPENSSL_CONF=/dev/null npm --prefix backend run commercial:data -- \
  purge --source "$DB" --before "$RETENTION_CUTOFF" --apply --service-stopped
# Alternatively select ONE verified request reference, not a public self-service deletion:
OPENSSL_CONF=/dev/null npm --prefix backend run commercial:data -- \
  purge --source "$DB" --reference "$REFERENCE" --apply --service-stopped
```

Backup uses Node's SQLite online backup API, including committed WAL data. Targets are exclusively created with mode0600. Restore always writes to a new target, checks schema/integrity, and quarantines all unsent rows as `reconcile` instead of automatically replaying old notifications. Keep restored data offline until the private deletion ledger and provider history have been reconciled. Sent rows remain sent. Never overwrite a live database or reset old provider keys to force delivery.

Purge deletes selected lead payload/envelope, captured mail and legacy aliases transactionally, then applies secure-delete, VACUUM and WAL truncation. A lock/checkpoint/IO failure is not successful erasure: the CLI exits nonzero with a generic warning, and a failure after commit may mean logical deletion already occurred. Inspect privately; keep services stopped and re-preview before deciding next steps. `--service-stopped` is an operator attestation, not process discovery. Confirm the service manager state and open handles (for example `lsof "$DB"`) with sufficient privileges; if that cannot be verified, do not apply.

**Owner decisions not invented:** retention duration, authorized staff, deletion-request identity checks/all related references, encrypted storage/backups and key management, backup expiry/schedule/RPO/RTO, provider-side deletion and private deletion ledger retention. There is no automatic destructive retention job and no claim of forensic erasure from SSD snapshots, filesystem copies, logs, old backups or provider systems. Reapply approved deletions after restore before exposure. Counters, replicas and captured mail must be covered by that policy too. A reference purge is one technical operation, not certification that an entire person's data has been found/deleted everywhere.

Primary implementation references: [Node SQLite API](https://nodejs.org/api/sqlite.html), [SQLite online backup](https://sqlite.org/backup.html), [SQLite secure-delete limitations](https://sqlite.org/pragma.html#pragma_secure_delete). These controls do not grant privacy/legal approval.

## Reproduce the local browser proof

Use fresh synthetic-only storage/counters and free ports. Do not use a production receiver. The fixture notice is visibly labeled as a local test, not an authentic legal notice.

```bash
# Terminal1: choose a NEW private temporary directory each run; no existing DB reset.
fixture=$(mktemp -d /tmp/lead-001a.XXXXXX)
LEAD_MODE=local LEAD_PORT=4021 LEAD_DB_PATH="$fixture/leads.sqlite" \
LEAD_ORIGINS=http://localhost:5192 \
LEAD_PRIVACY_URL=http://localhost:5192/__lead-local/privacy \
LEAD_PRIVACY_VERSION=explicit-001a LEAD_PRIVACY_APPROVED=true \
LEAD_PROVIDER=capture LEAD_RATE_SECRET=synthetic-local-001a-rate-secret-only \
OPENSSL_CONF=/dev/null npm --prefix backend run start:commercial:local
```

```bash
# Terminal2
LEAD_LOCAL_PROXY_PORT=4021 LANDING_VITE_CACHE_DIR=/tmp/lead-001a-vite-cache \
VITE_LANDING_LOCAL_LEADS=true VITE_LANDING_LEAD_ENDPOINT=/__lead-local/leads \
VITE_LANDING_PRIVACY_URL=/__lead-local/privacy \
VITE_LANDING_PRIVACY_VERSION=explicit-001a OPENSSL_CONF=/dev/null \
npm --prefix landing run dev -- --host 127.0.0.1 --port 5192 --strictPort
```

In a permitted Playwright MCP session at the repository root, run `browser_run_code_unsafe` with `filename: landing/e2e/lead_capture.browser.ts`. It is a function-expression fixture; the single ESLint annotation documents that runner format only. Outputs go to this task's evidence directory. No package or browser installation/change was required for the successful browser run.

The final script passed completely on a NEW receiver/database after the initial exploratory scopes. It deliberately stubs only a negative incomplete HTTP200 case; successful acceptance comes from the real Nest receiver. It commits a request then drops the response, verifies the same-key replay, and verifies a new-key receipt cannot recover it. Two independent requests result in exactly two captured local messages, not external mail.

An early separate rate probe assumed previous requests shared a fixed time bucket and timed out after a bucket rollover; inspection confirmed distinct buckets. The test was corrected to fill the actual budget with bounded invalid requests, never by resetting counters or relaxing limits. A later fixture-only runner error (`process` unavailable in the MCP function context) was corrected before any final scenario request. Both are test-harness findings, not concealed application passes. The final full run has neither error. `browser-results.json` and independent `local-disk-readback.json` are the current proof; no001/005/006 browser result was reused.

Additional fresh checks: normal-motion desktop smoke, and a real **production build** with reserved synthetic HTTPS endpoint/privacy URLs but an empty version, served locally: zero commercial forms. No external request/approval is implied. Native mobile hardware, screen readers and legal accessibility certification were not claimed.

## Validation and build isolation

| Check | Fresh001A result |
| --- | --- |
| Regressions before fixes | Server5 failing privacy/rate cases; frontend2 failing version/429 cases; lifecycle test missing module — expected RED |
| Backend commercial tests |30 PASS /5 suites, including all19 previous tests |
| Landing tests |59 PASS /6 files, including previous coverage |
| Backend global lint / landing lint |PASS |
| Backend production types / landing types |PASS |
| Inclusive backend test typecheck |148 diagnostics outside commercial/new build helper; zero new-scope diagnostics; not repaired out of scope |
| Landing production build |PASS to temporary output; separate missing-version build PASS |
| Standard Nest build |BLOCKED: reproduced EPERM attempting existing dist cleanup |
| `build:isolated` |PASS using actual Nest CLI and original resolved source program; existing dist untouched |
| Browser five widths, keyboard, reduced-motion, errors/retry/privacy/429 |PASS, final complete script, fresh synthetic local receiver |
| Disk readback |2 leads and2 captured messages after final complete scenario |
| Private CLI backup/restore/dry-run/purge drill |PASS: snapshot2, restored2, preview2, deleted2 in restored clone only; source and snapshot retained |
| Preservation / whitespace |PASS; design/assets/005/006/operational sources unchanged |
| Authorized public reception / owner inbox |NOT RUN: configuration/approval not supplied |

Build-isolation command:

```bash
OPENSSL_CONF=/dev/null npm --prefix backend run build:isolated
```

The helper resolves the root-file program from the existing `tsconfig.build.json`, inherits its compiler settings, supplies the original type roots, and invokes Nest with explicit config paths into a fresh temporary output and `deleteOutDir:false`. It does not modify the standard command, CLI configuration, permissions, hooks or deployment artifacts. Early helper tests exposed Nest's relative config-path handling and type-root resolution from relocated configs; both were corrected before the final successful compile. This is local compilation evidence, not a claim that protected dist was fixed or a release image was built. No `rm`, chmod/chown repair or directory deletion was performed on the build tree. [Nest build reference](https://docs.nestjs.com/cli/usages#nest-build).

Other reproducible commands:

```bash
OPENSSL_CONF=/dev/null npm --prefix backend test -- --runInBand --runTestsByPath \
  src/commercial/receiver.spec.ts src/commercial/notification.spec.ts \
  src/commercial/hardening.spec.ts src/commercial/data-ops.spec.ts src/commercial/isolation.spec.ts
OPENSSL_CONF=/dev/null npm --prefix backend run lint:check
OPENSSL_CONF=/dev/null npm --prefix backend run typecheck
(cd backend && OPENSSL_CONF=/dev/null npm exec tsc -- --noEmit --incremental false)
OPENSSL_CONF=/dev/null npm --prefix landing test
OPENSSL_CONF=/dev/null npm --prefix landing run lint
OPENSSL_CONF=/dev/null npm --prefix landing run typecheck
OPENSSL_CONF=/dev/null LANDING_VITE_CACHE_DIR=/tmp/lead-001a-cache \
  npm --prefix landing run build -- --outDir /tmp/lead-001a-build
git diff --check
```

## Changed files and Git

Modified:
- `backend/src/commercial/store.ts`, `receiver.ts`: key-only replay and corrected rate/CORS behavior.
- `backend/package.json`: private data-ops and isolated-build scripts; no dependency/lockfile changes.
- `landing/src/config/commercialConfig.ts`, `services/demoRequest.ts`, `components/FinalCta.tsx`: explicit version gate and trusted429 error copy; no layout/style changes.
- `landing/.env.example`: empty explicit version requirement.
- `landing/src/__tests__/commercial.test.tsx`, `leadCapture.test.ts`: explicit version fixtures, preserving prior assertions.
- `landing/e2e/lead_capture.py`: old reproducible scenario updated to the privacy-safe independent-key contract; Python syntax checked, not passed off as the executed MCP test.

Created:
- `backend/src/commercial/hardening.spec.ts`, `isolation.spec.ts`: privacy/rate and runtime import isolation regressions.
- `backend/src/commercial/data-ops.ts`, `data-ops.cli.ts`, `data-ops.spec.ts`: private lifecycle controls and disk-backed tests.
- `backend/scripts/build-isolated.ts`: non-destructive actual Nest compile path.
- `landing/src/__tests__/leadHardening.test.ts`: consent/429 regression cases.
- `landing/e2e/lead_capture.browser.ts`: executed TypeScript Playwright fixture.
- This report and `landing/evidence/LANDING-LEAD-CAPTURE-001A/`: fresh results, synthetic captures, lifecycle proof, source hashes and preservation/Git evidence.

No style, product screenshot,005/006 report/evidence, operational module, Prisma schema/migration, tenant configuration or ERP business rule was edited. No tenant database was opened or changed. Only new synthetic SQLite fixtures and their restored clones were exercised. The worktree now contains uncommitted001A changes; HEAD is unchanged. Receipt-driven mode was queried read-only (enabled by default); no review was started and no native approval receipt is claimed. Independent delivery review remains separate from these local functional checks.

## Separate gates and remaining owner actions

- **FORM_GO: LOCAL_PASS** — fresh browser and automated proof; identity unchanged.
- **RECEIVER_GO: LOCAL_PASS** — privacy/rate/idempotency corrections and isolation verified; public deployment acceptance pending.
- **DATA_CONTROL_GO: LOCAL_PASS** — executable controls/drill verified; production encryption, schedule, retention/deletion policy and recovery acceptance pending.
- **NOTIFICATION_GO: LOCAL_CAPTURE_PASS / EXTERNAL_PENDING** — no authorized external mailbox acceptance.
- **PRIVACY_GO: NO_GO** — authentic notice, collection wording and owner/legal approval missing.
- **COMMERCIAL_GO: NO_GO** — no authentic public receiver/owner inbox proof; no owner contacts, domains, credentials or approval invented.

Before public enablement: owner approves/publishes the notice and version, authorizes real recipient/sender/provider credentials, selects TLS host/origins/private storage and narrowly trusted edge, approves lifecycle/monitoring policies, and verifies one authorized real receipt plus mailbox delivery. The local synthetic notice/capture cannot satisfy those gates.
