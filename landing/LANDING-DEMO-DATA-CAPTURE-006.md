# LANDING-DEMO-DATA-CAPTURE-006

**Latest status: PARTIAL / BLOCKED_BACKUP — task 006D, 2026-10-18 local time.**
Existing development PostgreSQL is directly accessible and was inspected read-only.
No database writes, login, seed, authenticated ERP capture or new public asset was
performed. The requested commercial evidence is not accepted yet.

## Current continuation — LANDING-DEMO-DATA-CAPTURE-006D

The owner explicitly authorizes the existing development database. This supersedes
the disposable-environment requirement in the historical sections below **for
006D only**. No new database, container, infrastructure or isolation is requested.
Work was linear, without subagents, commit, push, merge or infrastructure repair.

### Database access and preservation gate

- Direct Prisma connection to `localhost:5433/pollo_distribucion` succeeded using
  the repository fallback in `backend/src/config/database.config.ts`. No inherited
  `DATABASE_URL` was present; protected environment files were not read. No full
  URL, password, token, customer contact or password hash is in the evidence.
- SQL identity: database `pollo_distribucion`, role `postgres`, internal address
  `172.18.0.5:5432`, PostgreSQL **16.14**, PostGIS **3.5.7**. This is a reachable
  local port, not independent proof of the backend's active target or exclusive
  non-customer use. The Compose definition declares development mode and the
  expected PostgreSQL target; the actual container environment remains unverified.
- The backend uses Nest ConfigModule/process environment; PrismaService constructs
  PrismaClient against `DATABASE_URL`. Thus the repository fallback is a useful
  direct probe, not evidence that the running backend selected that fallback.
- `http://localhost:3000/api/health/ready`: HTTP 200. Database dependency: up.
  Object storage: unavailable. Geospatial dependencies reported up, but no route
  or delivery workflow was executed to establish operational correctness.
- **98 local migrations = 98 applied**, with no unfinished, missing, database-only
  or mismatched-checksum migrations. No migration was executed.
- `docker --version` fails before client launch (exit 127, operation not permitted),
  including an authorized escalated attempt. `psql`, `pg_dump`, `pg_restore` are
  absent from this agent's PATH. No alternate Docker execution path was attempted.
- **Backup: NOT OBTAINED. No database writes are permitted yet.** Login was also
  deferred because authentication can persist sessions/audit data. The live ERP
  was navigated only to its unauthenticated login screen at `localhost:5173`.

[Read-only database evidence](evidence/LANDING-DEMO-DATA-CAPTURE-006/006D/database-readonly.json)
was collected inside one REPEATABLE READ, READ ONLY transaction at
`2026-10-19T01:00:40.613Z` (2026-10-18 Mexico City).

### Existing data and seed audit

| Existing records | Count |
| --- | ---: |
| Users / operational locations / products | 13 / 30 / 11 |
| Customers / suppliers | 20 / 5 |
| Inventory balances / movements | 25 / 461 |
| Sales / payments / receivables | 155 / 124 / 95 |
| Routes / delivery orders / vehicles | 20 / 33 / 5 |
| Cash shifts / daily closes | 4 / 12 |

All six canonical seed users exist; role/active-state counts are in the evidence,
without personal identifiers. Whole-chicken KG, breast KG and wings PIECE base
products exist and are active. These facts do not prove all existing transactions
were service-driven, nor that all existing records are synthetic or capture-safe.

Inventory has **zero invalid balance rows** (negative quantities/reservations or
reservations exceeding physical) and **zero duplicate product/location keys**.
These are bounded checks, not a complete ledger/reservation/payment reconciliation.
Aggregate CEDIS-VER: physical **90.001 KG**, reserved **10.001 KG**, available
**80.000 KG**. VER: **877.600 KG / 1,065 pieces**; BDR: **895.500 KG / 1,051
pieces**; ALV: **1,138.400 KG / 1,735 pieces**, all with zero aggregate reserves.
Per-product visible UI values still need reconciliation; these mixed-product
location totals are not a screenshot or an operational KPI acceptance.

Freshly re-read both seeds. **Do not run either wholesale**:

- `seed.ts` updates existing users (including password hashes), locations and
  products; it also deletes/rebuilds role-permission links. It is not insert-only.
- `seed.operational.ts` detects partial state, but its complete-state shortcut
  checks counts, not full semantic integrity. It also upserts existing records
  and directly writes final confirmed sales, delivery states and reviewed closes.
  Existing counts alone do not establish safe rerun or authentic workflow proof.
- New synthetic records: **0**. Operational workflows executed: **0**. No audit
  product or historical row was removed. Reuse candidates exist, so adding a new
  dataset is not justified before authenticated inspection and provenance checks.

### Captures, integration and checks

New authenticated ERP captures / approved public derivatives: **0 / 0**. Inventory
is still missing. `approved/`, `landingImages.ts`, `productModules.ts` and all UI
source remain untouched; no redesign, invented interface or image-value edit.

Fresh validation of the **existing unchanged landing**:

```sh
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh test -- --reporter=dot
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run lint
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run typecheck
OPENSSL_CONF=/dev/null LANDING_VITE_CACHE_DIR=/tmp/landing-006d-cache npm --prefix landing --script-shell=/bin/sh run build -- --outDir /tmp/landing-006d-dist
git diff --check
```

All passed: **53 tests / 4 files**, lint, typecheck, build and whitespace check.
Playwright MCP against `localhost:5174` passed the bounded desktop/mobile viewport
smoke at **1440, 1280, 768, 390, 320**: ten module tabs, six stages, no horizontal
overflow, white visible headings, nine existing module images decoding, gallery
zoom/Escape/focus return and keyboard End selection. Inventory remains a truthful
missing-image state. Reduced-motion smoke ran at 320; loaded screenshot readback
also used reduced motion at 1440/390. This is viewport emulation, not physical
mobile hardware, a full accessibility audit or new ERP scenario validation.

[Validation summary](evidence/LANDING-DEMO-DATA-CAPTURE-006/006D/validation.json)
and [QA capture manifest](evidence/LANDING-DEMO-DATA-CAPTURE-006/006D/qa-capture-manifest.json)
record results, origins, timestamps, dimensions and SHA-256. Four original PNG
landing QA frames are retained, **not commercial ERP assets**. The first desktop
frame caught an undecoded below-fold lazy image; the `-loaded` confirmation frames
scroll/decode every image before capture. No image pixels were retouched or
optimized for public integration. Only the report and `006D/` evidence were added
or changed. All **32 task-005 preservation hashes still match**.

### Verdicts and exact continuation

| Requested gate | Current result |
| --- | --- |
| DATABASE_READY | PARTIAL — SQL/schema ready; active backend mapping, nonshared confirmation and verified backup pending |
| DATA_INTEGRITY_GO | NOT GRANTED — bounded existing-balance checks pass; full reconciliation and workflow proof pending |
| ASSET_QUALITY_GO | BLOCKED — no new authenticated ERP assets |
| VISUAL_GO | NOT GRANTED for 006D — existing landing smoke passes; representative inventory and new-asset acceptance pending |

Run the single guarded block in
[WARP-006D.md](evidence/LANDING-DEMO-DATA-CAPTURE-006/006D/WARP-006D.md).
It checks the **existing** backend's development environment, compares backend and
PostgreSQL database/cluster identities, then uses the existing PostgreSQL service's
`pg_dump` and `pg_restore` to create/list/read a private custom archive and hash it.
It creates no infrastructure and restores nothing. Shell syntax was checked with
`bash -n`; runtime execution is **NOT RUN**. Archive list/read is not a restore drill.
Return only its sanitized verification output and confirm local/non-customer use.
Then recheck preservation/identity and capture Inventory first, followed by
Dashboard/POS. Route/customer delivery PHOTO remains conditional on real evidence
and working storage; no final-state fixture or fabricated GPS/photo is acceptable.

## Historical record — original task 006 and continuations B/C

The sections below describe earlier attempts and retain their original isolation
requirement and results. They are not the current 006D environment decision.

## 1. Repository and preservation

- Initial/final branch: `feat/landing-commercial-final-polish-005`.
- Initial/final HEAD: `3ea1042e265d48f39ccbbeab0c47a833a0ad3920`.
- Initial tree: 13 modified tracked landing files plus the untracked task 005
  report, evidence, `finalPolish.test.tsx` and `brand.ts` (32 existing files total
  across tracked modifications and untracked content).
- Origin: `https://github.com/MarcosZamudio06/Los-Pollos-Distribuidora.git`.
- Read-only `git ls-remote origin HEAD refs/heads/main` returned the initial HEAD
  for both refs. This does not establish a deployed version or publish task 005.
- No branch switch, stash, reset, checkout, commit, push, merge or deletion.
- Existing work remains in place. [Preservation manifest](evidence/LANDING-DEMO-DATA-CAPTURE-006/preserved-005.json)
  records SHA-256 of those 32 files for final readback; this is a checksum manifest,
  not an independent recoverable backup. No task 005 file was edited.
- Task 006 adds only this report and its evidence directory; source and asset
  configuration remain unchanged.

## 2. Isolation gate — not satisfied

| Probe | Result |
| --- | --- |
| `docker info --format '{{.ServerVersion}}'` | Exit 127, `zsh:1: operation not permitted: docker` |
| Same probe with authorized escalated execution | Same exit and error |
| `command -v docker` | No executable path reported |
| New task-owned container/database | Not created |
| Exclusive DATABASE_URL / database identity verification | NOT RUN; no URL was constructed or used |
| Migrations / seeds / backend / ERP frontend | NOT RUN |

Observed execution failure is not proof of its host-level root cause. No Docker
installation, daemon repair or host configuration change was attempted. No existing
PostgreSQL instance was substituted. No environment/credential files were read.
No production or shared staging data was copied, restored or queried.

`backend/scripts/test-operational-seed.ts` is the reusable reference: UUID container,
PostGIS `16-3.4`, loopback ephemeral port, explicit child database URLs, migration
`deploy`, and owned-container stop. It currently stops the container in `finally`;
therefore it is a verification harness, not a persistent capture session. It was
read, not executed or modified.

A continuation must first create a uniquely named task-owned database/container,
verify ownership and the loopback port binding, compare the parsed URL database
name/host/port with that resource, and read back `current_database()`, database user
and PostGIS identity before migration/seed. Ignore inherited URLs and fail closed
on any mismatch. Use private temporary runtime credentials; publish only sanitized
identity/probe evidence. Never use migrate reset, forced reset or volume deletion.
No resource was created here, so no cleanup is needed or authorized.

## 3. Seed audit and permitted reuse

Read the requested `seed.ts`, `seed.operational.ts`, `seed.operational.data.ts`,
`seed-guard.ts`, `scripts/test-operational-seed.ts`, the actual inventory component
and both landing capture/module registries.

| Component | Finding / continuation |
| --- | --- |
| Base catalog | Existing whole chicken KG, breast KG, wings PIECE meet the requested product types. Reuse definitions; do not invent global Product.stock. |
| Base locations | CEDIS Veracruz with VER, BDR and ALV branches already defined. Reuse hierarchy, add nothing without need. |
| Base identities | Six canonical roles and development-labelled users exist. Create task-specific demo identities with scoped permissions and private credentials only after isolation. Do not use Development Admin as commercial evidence. |
| Seed guard | Only rejects `NODE_ENV=production`; development/test alone does not prove isolation. Do not run against an inherited URL. |
| Operational generator | Deterministic seed IDs/tag, serializable transaction and partial-state refusal are useful safety patterns, not proof of authentic workflow execution. |
| Purchases/sales | `seedPurchases` directly creates CONFIRMED purchases; `seedSales` directly creates CONFIRMED sales, documents, movements and payments. Not accepted unchanged as services-driven process evidence for this task. |
| Deliveries | `seedDeliveryOrders`, called by `seedSales`, creates final statuses and `deliveredAt` directly. Do not use it to claim actual customer delivery. |
| Daily closes | `seedDailyCloses` creates REVIEWED records and formula-based totals/shortages/surpluses. Do not present these as observed reconciliation outcomes. |
| CEDIS/transfers | Existing service-backed paths can inform a narrowly scoped scenario. `seedTransfers` invokes create/confirm; do not duplicate those services. |

No seed or fixture was created, changed or executed. The audit does not claim the
existing test generator is defective for its original purpose; its direct fixtures
simply do not meet this task's stronger provenance requirements.

## 4. Authentication, operational constraints and specs

- `backend/src/modules/auth/auth.controller.ts`: real login and refresh routes,
  refresh cookie, authenticated endpoints. No session/token was obtained.
- `backend/src/common/authorization/permissions.ts`: ADMIN, SELLER, WAREHOUSE,
  DRIVER, COLLECTIONS, BILLING; cash-shift, CEDIS and fleet permissions are explicit.
- Base SELLER/DRIVER/COLLECTIONS users use VER; WAREHOUSE uses CEDIS-VER.
  Runtime effective permissions and location restrictions remain unverified.
- `specs/.specs/04-ui/inventory.md`, balance section: consume
  `GET /api/inventory/balances`, preserve location context, no global stock.
  `InventoryByLocationView.tsx` displays physical/reserved/available KG and pieces.
  Its values must be reconciled against actual balances/movements before approval.
- `specs/.specs/04-ui/sales-pos.md`, cash-shift/payment sections: confirmation
  requires the actor/device/terminal/location-matching open shift and valid payment.
  Prepare a cart without confirming it for screenshot aesthetics.
- `specs/.specs/04-ui/routes-delivery.md`, planning/mobile/evidence sections:
  valid driver and separate vehicle, eligible sales/stops, conditional geospatial
  services; PHOTO required for delivered status. No fabricated photo/GPS/signature.
- `specs/.specs/04-ui/accounts-receivable.md`, payment section: each collection
  payment applies to exactly one receivable; cash requires effective permission
  and the actor's open device-bound shift.
- Read `landing/PRODUCT.md`, `landing/DESIGN.md`, task 005 report and
  `docs/validation.md`. No business rule or UI design was changed.

## 5. Capture inventory: before = after

The [capture audit](evidence/LANDING-DEMO-DATA-CAPTURE-006/capture-audit.json)
records all 20 existing approved-directory files, byte sizes and SHA-256 before/
after. Their existing approvals are preserved, not independently renewed.
Original source/dimensions and historical provenance remain in task 005's asset
audit and the implementation/closure approval manifests referenced there.

| Capture | Current limitation | New task 006 capture |
| --- | --- | --- |
| Dashboard | Development identity and unrepresentative activity noted by task 005 | BLOCKED |
| POS | Audit products, unopened shift and warnings noted by task 005 | BLOCKED |
| Inventory (priority) | Empty registry slot; no authentic balance capture | BLOCKED |
| Fleet / route planner | Empty stops; no live tracking proof | BLOCKED |
| Driver / driver stop | Existing CEDIS transport, not customer delivery | BLOCKED |
| CEDIS | Administrative context, not physical receipt proof | BLOCKED |
| Purchases | Existing legacy detail; dataset not reconstructed here | BLOCKED |
| Collections | Dashboard summary, not payment workflow proof | BLOCKED |
| Closing | Existing shift/close view, not proof of performed close | BLOCKED |
| Billing | Administrative request, not fiscal emission | BLOCKED |

Limitations above are historical observations from task 005 and current registry
copy, not a fresh visual review of every screenshot. Existing derivatives are
NEEDS_REVIEW against task 006's stricter dataset provenance; their public files
are not reclassified or removed. New APPROVED: 0; new REJECTED: 0; new captures: 0.
All requested new scenarios are BLOCKED upstream. No originals or optimized
new derivatives exist, so no new capture resolution/origin/date/hash is invented.

All ten modules and the six-stage narrative remain unchanged. No resource was
published. No generative image, screen reconstruction, crop or value editing used.

## 6. Validation and visual evidence

Fresh local commands (all completed successfully):

```sh
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh test -- --reporter=dot
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run lint
OPENSSL_CONF=/dev/null npm --prefix landing --script-shell=/bin/sh run typecheck
OPENSSL_CONF=/dev/null LANDING_VITE_CACHE_DIR=/tmp/landing-006-cache npm --prefix landing --script-shell=/bin/sh run build -- --outDir /tmp/landing-006-dist
git diff --check
```

53 tests passed in four files. Lint/typecheck passed. Build passed: JS 381.86 kB /
128.53 kB gzip; CSS 53.88 kB / 10.90 kB gzip. External outDir warning expected;
no existing output was emptied. These checks verify the preserved landing only.

NOT RUN: database integrity, balances/reservations, sales/routes/collections
relations, runtime authentication/permissions, ERP screenshots, image-load browser
checks, 1440/1280/768/390/320 Playwright, explorer/zoom/keyboard/Escape/focus,
reduced motion and visual before/after. No integrated asset changed, and environment
failure prevents the requested new-data visual acceptance. Task 005 browser results
remain historical evidence only; no fresh desktop/mobile or layout GO is inferred.
No backend code changed, so backend tests/build were not run. No source logic was
implemented; no artificial TDD cycle was claimed for this passive audit report.

## 7. Verdicts and next action

| Gate | Verdict |
| --- | --- |
| DEMO_ENV_GO | NO — BLOCKED_ENVIRONMENT; isolation not established |
| DATA_INTEGRITY_GO | BLOCKED — no isolated dataset or runtime reconciliation |
| ASSET_QUALITY_GO | BLOCKED — no new provenance-backed captures |
| VISUAL_GO | NOT VERIFIED for task 006; no new browser evidence |

Next: restore access to a working authorized Docker runtime, then re-enter at the
isolation gate. Prepare a task-owned persistent variant of the disposable harness;
reuse catalog/location definitions but execute operational transactions through
real services. Capture Inventory first, then Dashboard/POS. Keep original private
frames plus sanitized viewport/time/origin/hash manifests, review each frame,
optimize only APPROVED images, and only then perform limited landing integration
and the full requested browser matrix. Preserve task 005 throughout. No commit,
push, merge, host repair or pre-existing-resource cleanup is authorized by this report.

## Retry requested by user — 2026-10-18

Re-ran `docker info --format '{{.ServerVersion}}'` normally and with authorized
escalation. Both returned exit 127 and `zsh:1: operation not permitted: docker`.
Rechecked branch/HEAD (unchanged) and all 32 task 005 preservation hashes (all
match). No database operation, runtime repair or asset modification attempted.
`BLOCKED_ENVIRONMENT` and all task 006 gate results above remain unchanged.

## Continuation LANDING-DEMO-DATA-CAPTURE-006B — 2026-10-18

**PARTIAL preparation / BLOCKED_ENVIRONMENT for execution.** Only
`docker --version` and `docker version` were attempted in this continuation,
with authorized execution outside the sandbox; both failed before client launch,
exit 127, `operation not permitted`. User-reported working Warp Docker is not
contradicted by this agent execution restriction. No further Docker probe or
permission change was attempted.

Created `scripts/landing_demo_006b.py` (Warp-only, create/verify, no migrations,
seeds, app startup or deletion) and `scripts/tests/test_landing_demo_006b.py`
(11 passing offline guard tests). Initial RED and subsequent private-file API
regression RED preceded GREEN. This is tooling, not new ERP application logic.

Exact manual commands, purpose, side effects, security checks, private-state
handling, synthetic scenario and fixture/service separation are in
[evidence/LANDING-DEMO-DATA-CAPTURE-006/WARP-006B.md](evidence/LANDING-DEMO-DATA-CAPTURE-006/WARP-006B.md).
Run `python3 scripts/landing_demo_006b.py create` from the repository in Warp and
return only the sanitized terminal output. This creates one UUID PostGIS database
bound to loopback, using explicit amd64 emulation of the existing harness image
on ARM. It performs read-only identity checks but no application writes. Tmpfs
keeps it disposable; stopping/restarting loses data, so maintain the session.

Task 005's 32 preservation hashes still match; 20 approved assets remain unchanged.
Task 006's previous report/evidence was retained; this section is additive. Branch
and HEAD remain `feat/landing-commercial-final-polish-005` /
`3ea1042e265d48f39ccbbeab0c47a833a0ad3920`. The report SHA-256 before this additive
continuation was `462eb5af8c048043a04eeb3fd33aae20767cbb2dbea9261c1ff0013e8bc5ac74`.
No original task 005 file, seed, landing source/configuration or image was edited.

DEMO_ENV_GO remains BLOCKED pending live Warp evidence; DATA_INTEGRITY_GO and
ASSET_QUALITY_GO remain BLOCKED; VISUAL_GO remains NOT VERIFIED. No new capture
or original/derivative hash exists to report. No backend/frontend demo process,
Playwright session, migration, seed or synthetic business operation has run.

## LANDING-DEMO-ENV-VERIFY-006C — diagnosis pending host inspect

Read the original private `created.json` in memory and printed only nonsecret
identity fields. Did not read `postgres.env`, echo the password or DSN, invoke
Docker, recreate the resource, or write to the private directory/database.

- Run: `5451d0c5a0274cdc8db4a833d2cf1b66`.
- Container name: `landing-demo-006b-5451d0c5a0274cdc8db4a833d2cf1b66`.
- Original full ID: `5ca2b7a0aa96fffcd24f8c4db0b952cd106401219adcd1e52f556155a9b05363`.
- Database: `landing_demo_006b_5451d0c5a0274cdc8db4a833d2cf1b66`.
- Original private directory: `/tmp/landing-demo-006b-06x847f7`, mode 0700.
- Manifest has run/name/container/database/user/password keys and no stored port
  or DATABASE_URL. `state.json` does not exist.

This narrows the failure to the initial inspect/binding/validate path between
`save_private(created.json)` and `save_private(state.json)`. Readiness/TCP success
reported by the user does not identify the failing Python predicate. In
particular, inspect's actual Mounts/Tmpfs representation and ownership label
have not yet been observed. Do not infer the exact cause from readiness alone.
The generic exception handler hid the original predicate.

A separate demonstrated recovery limitation is that `verify` requires
`state.json`, so it cannot currently resume this partial creation using the
original `created.json`. No validation predicate has been weakened and no fix
is claimed before the original Docker identity is read back. Next action is
selective read-only Docker inspect in Warp, using the full original ID and
explicit `desktop-linux` context, exposing no Config.Env or raw manifest.
Never run create again. After that evidence identifies the failing predicate,
add a narrowly scoped regression and a read-only original-manifest recovery path.

Fresh existing offline verifier suite: 11 PASS. All 32 task 005 hashes match.
No source/asset/seed edit, migration, DB write, commit, push, merge or cleanup.
DEMO_ENV_GO: BLOCKED pending exact live identity evidence; a running/accepting
container alone is not complete isolation acceptance.

## 006C — confirmed root cause and minimal correction

User-supplied selective host inspect (preserved without credentials in
`evidence/LANDING-DEMO-DATA-CAPTURE-006/host-inspect-006c.json`) proves the
original container's exact ID/name/image/label, running state, no-restart policy,
loopback binding `127.0.0.1:63865`, empty Mounts and data tmpfs in HostConfig.Tmpfs.
The supplied desktop-linux Docker endpoint is local Unix. This was not a direct
Codex Docker execution.

**Root cause:** my original verifier incorrectly required `len(info['Mounts']) == 1`.
Docker returned `Mounts: []` with the correct tmpfs elsewhere in inspect. The old
predicate deterministically rejects that output before state.json is written.
The earlier mocked fixtures only modeled a nonempty Mounts list, missing the
observed Docker representation. This was a verifier defect, not database failure.

Correction in `scripts/landing_demo_006b.py`: require the exact data-path rw
HostConfig.Tmpfs dictionary; permit an empty Mounts list or its matching tmpfs
entry only; continue rejecting binds, volumes and extra destinations. Add
`resume` using only the original private created.json plus explicit expected
full container ID and port. It validates ownership/file restrictions and container
identity, reconstructs the URL in memory and runs only the existing read-only
SQL identity query. It writes no recovery files or database data and creates or
destroys no resources. Shared SQL/report logic was extracted for reuse.

TDD: actual storage representation first failed at the old predicate; new resume
cases failed before implementation. Final `python3 -m unittest discover -s
scripts/tests -p test_landing_demo_006b.py`: **16 PASS**. `--help` and diff check
also pass. Original private manifest matched all supplied public fields against
the corrected guard offline (port 63865), without printing/persisting credentials.
32 task 005 files and 20 approved assets remain hash-identical. No original
private file was modified and no Docker command was invoked by Codex.

Exact safe command, purpose, side effects and expected evidence:
[WARP-006C.md](evidence/LANDING-DEMO-DATA-CAPTURE-006/WARP-006C.md).
Do not run create or legacy verify for this partial state; use resume.
DEMO_ENV_GO remains **BLOCKED pending live database/user/PostGIS verification**,
not an invented GO from offline tests. No migration, seed, application operation,
capture integration, commit, push, merge or resource cleanup occurred.

## 006C — user-operated live identity verification accepted

Warp `resume` returned `ISOLATION_VERIFIED_NO_APP_WRITES` for the original full
container ID, database `landing_demo_006b_5451d0c5a0274cdc8db4a833d2cf1b66`,
loopback port 63865, image ID
`sha256:44126d872ac91993766c341e369c539e8196614321765d36a6f1bab0419a5fa5`
and PostGIS 3.4, followed by RESUME_READ_ONLY. The verifier's static SELECT also
requires the expected current user. Sanitized user-operated runtime evidence is
`evidence/LANDING-DEMO-DATA-CAPTURE-006/resume-006c-result.json`.
This supersedes the pending SQL-identity result above, not the outstanding ERP
runtime/data/asset requirements. No direct Docker run by Codex is claimed.

**Database isolation: GO on supplied live Warp evidence. DEMO_ENV_GO: PARTIAL**
because backend/frontend have not yet been started against this database.
Migration and seed remain NOT_RUN. DATA_INTEGRITY_GO and ASSET_QUALITY_GO remain
BLOCKED; VISUAL_GO NOT VERIFIED. Overall task remains PARTIAL, not COMPLETED.

Prepared the explicit schema-only `migrate` action in the existing helper, with
fresh original-resource checks before deploy/status, isolated schema/cwd staging,
source hashes, clean child environment, private URL passing and sanitized failure
reporting. No reset, seed, resource creation/deletion or automatic retry.
Read-only resume's behavior remains unchanged. Exact manual command and forecast:
[evidence/LANDING-DEMO-DATA-CAPTURE-006/WARP-MIGRATIONS.md](evidence/LANDING-DEMO-DATA-CAPTURE-006/WARP-MIGRATIONS.md).

New migration tests RED before implementation; final offline suite **21 PASS**.
Host npm/Prisma/migration execution is not proven until the user runs the command.
All 32 task 005 preservation hashes and 20 approved asset hashes match. No
business fixture, capture, application source, visual architecture or asset
changed. No migration was executed by Codex and no commit/push/merge occurred.
