# FINAL-QA-PRODUCTION — Production readiness evidence

Audit date: 2026-08-20  
Audited branch: `feature/correcciones-deploy`  
Audited baseline HEAD: `0d5beed2c13ac8ed4360355cee559c884f7c6005`  
Verdict: **NO-GO**

## 1. Evidence policy and baseline

A PASS in this report means the cited command completed successfully against the
audited source. A static or mocked test is never promoted to Docker, PostgreSQL,
authenticated HTTP, browser, realtime, GIS-rendering, backup, or restore proof.

The worktree was clean before remediation. It was not reset, checked out,
committed, pushed, or otherwise destructively modified. Baseline:

| Evidence | Result |
| --- | --- |
| Branch | `feature/correcciones-deploy` |
| HEAD | `0d5beed2c13ac8ed4360355cee559c884f7c6005` |
| Git state | Clean before remediation; branch was two commits ahead of its remote tracking branch |
| Node | `v24.14.1` |
| npm | `11.16.0` |
| pnpm | `11.10.0` |
| Effective CI/release package manager | npm |
| Task manifest | `FINAL-QA-PRODUCTION` is not registered in `specs/.specs/07-workflows/task/action.md` |

The repository has a real package-manager contradiction. `AGENTS.md` requires
pnpm, while the quality workflow, release Dockerfiles, validation runbook, and
the root/backend/frontend `package-lock.json` files use npm. This audit treated
npm as the effective CI/release contract and did not create a `pnpm-lock.yaml`.

### Environment limitations

- Every `rtk` command was rejected with `operation not permitted`; direct
  equivalents were required.
- `npm ci --prefix backend` was rejected while spawning dependency lifecycle
  scripts. `npm ci --ignore-scripts` succeeded for root, backend, and frontend.
  Direct local executables reproduced the quality commands.
- Docker and Docker Compose execution were rejected with `operation not
  permitted`, including after approved escalation.
- The reachable PostgreSQL endpoint rejected Prisma with `P1000`; no permitted
  disposable credentials were available.
- No local gitleaks, Trivy, or Semgrep binary was available.

These limitations make the runtime sections below **NOT TESTED**, not PASS.

## 2. Canonical sources read

- `AGENTS.md`
- `specs/.specs/00-business/business-rules.md` (targeted mutation rules)
- `specs/.specs/03-api/delivery-api.md` (targeted incident contract)
- `specs/.specs/05-testing/testing-strategy.md`
- `specs/.specs/05-testing/acceptance-criteria.md`
- `specs/.specs/06-deployment/deployment.md`
- `specs/.specs/06-deployment/docker.md`
- `specs/.specs/06-deployment/env-vars.md` (targeted variables)
- `specs/.specs/07-workflows/task/action.md`
- `specs/modules/routes-delivery/spec.md`
- `docs/validation.md`
- `docs/audit/plan.md`

## 3. Functional traceability matrix

Legend: **STATIC PASS** = implementation and focused/full automated source tests
were inspected; **PARTIAL** = contract exists but a required layer is absent or
runtime evidence is missing; **NOT TESTED** = the required real environment
could not be executed.

| Feature | Canonical spec | Frontend | Endpoint / controller / service | Prisma models | Authorization | Automated evidence | State |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Auth and sessions | `modules/auth/spec.md`, `03-api/auth-api.md` | `features/auth` | `auth.controller/service` | User, AuthSession | public login/refresh; global JWT otherwise | unit + security contracts; no real HTTP | PARTIAL |
| Users | `modules/usuarios/spec.md` | `features/employees` | `users.controller/service` | User, Role | `users.manage` | unit/controller | STATIC PASS |
| RBAC/permissions | auth/users specs | `access-control`, routeAccess | access-control, roles, global guards | Role, Permission, RolePermission, audit | permissions + scopes | unit/controller; no adversarial HTTP | PARTIAL |
| Products | entities/inventory specs | `features/inventario` | products controller/service | Product | global auth + roles/scopes | unit | STATIC PASS |
| Categories | entities | inventory product UI | categories controller/service | Category | global auth | unit | STATIC PASS |
| Locations | `03-api/locations-api.md`, `04-ui/locations.md` | `ubicaciones` | locations controller/service | OperationalLocation | role/location scope | unit + location E2E present | PARTIAL |
| Inventory | `modules/inventory/spec.md`, inventory API | `inventario` | inventory controller/service | InventoryBalance, InventoryMovement | role/location scope | unit/idempotency; real DB blocked | PARTIAL |
| KG/PIECE equivalences | product-equivalences API | product forms/POS | products/equivalence services | ProductUnitEquivalent | authenticated catalog admin | unit/equivalence | STATIC PASS |
| Customers | customers API/UI | `clientes` | customers controller/service | Customer | role/location scope | unit | STATIC PASS |
| Commercial policies | commercial-policies API | POS/customer forms | commercial-policies controller/service | CommercialPolicy, DiscountAuthorization | role/business validation | unit | STATIC PASS |
| Operational configuration | operational-config API | feature consumers | operational-config controller/service | OperationalConfig | ADMIN/manage | unit | STATIC PASS |
| Sales/POS | sales specs/API/UI | `ventas` | sales controller/service | Sale, SaleItem | SELLER/ADMIN + location/device | unit + operational-day E2E present | PARTIAL |
| Sales documents | sales-documents specs/API | sales detail/POS | sales-documents controller/service | SaleDocument | sales roles/scope | unit | STATIC PASS |
| Discounts | sales/billing specs | POS | sales pricing/discount paths | SaleItem, DiscountAuthorization | approval policy | unit consistency/allocation | STATIC PASS |
| Payments | AR/sales specs | POS/cobranza | payments + AR services | Payment | permission/method/scope | unit/idempotency | PARTIAL |
| Accounts receivable | AR specs/API/UI | `cobranza` | accounts-receivable controller/service | AccountReceivable, Payment | COLLECTIONS/SELLER/ADMIN + scope | unit; real concurrency blocked | PARTIAL |
| Cash | closing specs | cierre-diario/cobranza | cash-management controller/service | CashShift, CashMovement | own-shift permissions/admin close | unit | PARTIAL |
| POS terminals | closing specs | `terminales-pos` | cash-management | CashTerminal, Activation | reassignment/own scope | unit | STATIC PASS |
| Daily close | closing specs/API/UI | `cierre-diario` | daily-close controller/service | DailyClose and related snapshots/events | differences/reopen permissions | unit + journey E2E present | PARTIAL |
| Suppliers | purchases specs | `compras` | suppliers controller/service | Supplier | purchase roles | unit | STATIC PASS |
| Purchases | purchases specs/API/UI | `compras` | purchases controller/service | Purchase, PurchaseItem | role/location scope | unit/idempotency; real DB blocked | PARTIAL |
| CEDIS | branch-supply specs | `cedis` | cedis controllers/services | BranchSupplyCycle family | CEDIS permissions + hierarchy | unit + two E2E suites present | PARTIAL |
| Supplies | branch-supply specs | CEDIS pages | supply cycle/transfer endpoints | BranchSupplyCycleTransfer | dispatch/receive scopes | unit + E2E present | PARTIAL |
| Receipts | branch-supply specs/API | CEDIS receipt UI | transfer receiveSupply | BranchSupplyReceipt/Item | receive supplies + destination scope | unit + E2E present | PARTIAL |
| Returns | branch-supply specs | CEDIS returns views | cycle/transfer return paths | cycle transfer/item/events | request/receive return permissions | unit + E2E present | PARTIAL |
| Transfers | inventory-transfer API | inventory/CEDIS | inventory-transfers controller/service | InventoryTransfer/Item | origin/destination scope | unit/idempotency | PARTIAL |
| Delivery routes | routes specs/API/UI | `rutas-reparto` | delivery controllers/service | DeliveryRoute, DeliveryOrder | route/driver/location ownership | unit/controller | PARTIAL |
| Planning/reoptimization | routes specs | planner | route plan endpoints/providers | DeliveryRoutePlanDraft | route management scope | unit + provider contracts | PARTIAL |
| Driver | routes UI/spec | `chofer`, route pages | driver-mobile/delivery | User, DeliveryRoute/Order | DRIVER ownership | unit/controller | PARTIAL |
| Evidence | routes/delivery API | evidence capture | evidence endpoints/object storage | DeliveryEvidence | driver/order ownership | unit/signed URL tests | PARTIAL |
| Route settlements | route-settlement specs/API | route settlement UI | settlement controller/service | RouteSettlement | driver/admin ownership | unit; open key ignored by backend | PARTIAL |
| Fleet/vehicles | routes/fleet contracts | `fleet` | fleet controller/service | Vehicle | `fleet.view/manage` | unit/controller | PARTIAL |
| GPS | delivery API/routes spec | driver + FleetLive | fleet position endpoints/service | VehiclePosition | publish permission + assignment | unit; real GPS blocked | PARTIAL |
| Socket.IO | architecture/routes | fleet/socket clients | Fleet/CEDIS/Sales gateways | session/user/position | token, permission, room scope | gateway/client unit | PARTIAL |
| Geofences | delivery API/routes | fleet zones | geospatial/fleet | DeliveryZone, GeofenceEvent/State | zone management/view | unit | PARTIAL |
| Incidents | delivery API/routes | incident dialog/fleet | delivery incident endpoint/service | DeliveryIncident | driver ownership/fleet view | unit/idempotency; real concurrency blocked | PARTIAL |
| MapLibre | deployment/UI routes | FleetLiveMap/route maps | Nginx `/maps/**` gateway | n/a | authenticated ERP shell | component/static contracts | PARTIAL |
| Photon | deployment/routes | address search | Photon provider | n/a | backend-only provider | unit success/failure/timeout; runtime blocked | PARTIAL |
| OSRM | deployment/routes | route maps | OSRM provider | n/a | backend-only provider | unit success/failure/timeout; runtime blocked | PARTIAL |
| VROOM | deployment/routes | planner | VROOM provider | plan draft | route management scope | unit success/failure/timeout; runtime blocked | PARTIAL |
| TileServer | deployment/maps | MapLibre | Nginx → TileServer | n/a | browser gateway only | static contract; render blocked | PARTIAL |
| Reports | reports specs/API/UI | `reportes` | reports controller/service | aggregate models | role/location/cost permissions | unit; no real reconciliation | PARTIAL |
| Billing Requests | billing request specs/API/UI | billing-requests | controller/service | BillingRequest family | BILLING/ADMIN | unit | STATIC PASS |
| Billing | billing specs | billing remediation/reportable notes | billing controllers/services | Invoice/application/audit models | BILLING + fiscal export | unit | STATIC PASS |
| Object storage | deployment/runbook | evidence consumers | object-storage service | DeliveryEvidence keys | signed URLs and ownership | unit/contracts; service runtime blocked | PARTIAL |
| Health checks | deployment | n/a | health controller/service | dependency probes | public probes | unit/static; deployed probes blocked | PARTIAL |
| Backups | deployment/runbook | n/a | `scripts/database` | PostgreSQL/PostGIS | operator-only | syntax + contract; drill blocked | PARTIAL |
| Release/deploy | deployment/docker specs | built frontend | workflows/Compose/Dockerfiles/Caddy | migrations/bootstrap | operator secrets/variables | static contracts/build source | PARTIAL |

No endpoint was classified safe merely because its frontend action is hidden.
The backend has global JWT and permission guards plus service-level scope checks,
but the full cross-role and IDOR/BOLA matrix could not be proven over real HTTP.

## 4. Historical audit regression

| Finding | Classification | Current evidence |
| --- | --- | --- |
| AUD-001 | VERIFIED_FIXED | PIECE uses the captured billable quantity; unit/consistency tests and full backend suite pass. |
| AUD-002 | VERIFIED_FIXED | CASH uses the current collection close, TRANSFER works after the sale close, and route collection stays outside POS close; focused tests pass. |
| AUD-003 | PARTIAL | Production Compose now declares internal Photon/OSRM/VROOM URLs and static contracts pass; actual Compose startup is untested. |
| AUD-004 | VERIFIED_FIXED | Deterministic line discount allocation and cross-document consistency tests pass. |
| AUD-005 | VERIFIED_FIXED | A destination receives only actual quantities; no zero-delta SHRINKAGE is created; transfer equation regression passes. |
| AUD-006 | VERIFIED_FIXED | Adjustment Idempotency-Key/hash/unique record/Serializable retry tests pass; real concurrent PostgreSQL race is untested. |
| AUD-007 | VERIFIED_FIXED | COLLECTIONS has receive-cash and own-shift permissions with ownership checks; unit/controller tests pass. |
| AUD-008 | PARTIAL | Explicit migrate/bootstrap/backend topology and rotation contracts exist; empty-DB bootstrap is untested. |
| AUD-009 | VERIFIED_FIXED | Shared civil-date range uses exclusive next-day bounds; service tests pass. |
| AUD-010 | VERIFIED_FIXED | Shared difference policy blocks unresolved review/close states; tests pass. |
| AUD-011 | VERIFIED_FIXED | Shared timezone-aware operational window has multi-zone/DST tests. |
| AUD-012 | PARTIAL | The operational-day E2E now covers purchase→CEDIS→PIECE sale→collection→return→close, but PostgreSQL execution was blocked by P1000. |
| AUD-013 | REGRESSED | Transactional services remain 2,028–3,435 lines and SalesPosPage remains 1,829 lines. |
| AUD-014 | VERIFIED_FIXED | Product reads are batched and session touch is thresholded; unit tests pass, load proof absent. |
| AUD-015 | VERIFIED_FIXED | Routes are lazy-loaded and source build splits feature chunks; MapLibre remains a 976.44 kB warning chunk. |
| AUD-016 | VERIFIED_FIXED | Backend build and production entrypoint contract pass; live start/health is blocked. |
| AUD-017 | REGRESSED | npm/pnpm, documentation, and deprecated Prisma configuration contradictions remain. |
| AUD-018 | VERIFIED_FIXED | 429/Retry-After mapping and login UI tests pass. |

No Markdown `COMPLETED` label was used as evidence.

## 5. Quality Gate reproduction

| Gate | Command/equivalent | Result |
| --- | --- | --- |
| Install | `npm ci --prefix backend` | BLOCKED: lifecycle spawn EPERM |
| Lock/audit install | `npm ci --ignore-scripts` root/backend/frontend | PASS |
| Focused/skipped test guard | direct `ts-node scripts/forbid-focused-tests.ts` | PASS |
| Backend lint | direct quality-gate ESLint arguments | PASS, 0 warnings |
| Frontend lint | `eslint .` | PASS by current script, 16 warnings |
| Backend typecheck | build tsconfig, no incremental | PASS |
| Frontend typecheck | `tsc -b` | PASS |
| Backend coverage | Jest coverage, in band | PASS: 145 suites, 1,150 tests; 84.58% statements, 70.81% branches, 84.02% functions, 85.53% lines |
| Frontend coverage | Vitest v8 coverage | PASS: 103 files, 507 tests; 63.86% statements, 58.45% branches, 54.73% functions, 65.61% lines |
| Prisma validate | dummy non-secret URL, schema-only | PASS |
| Prisma generate | Prisma 6.19.3 | PASS; deprecated package.json Prisma config warning |
| Clean migrations | PostgreSQL/PostGIS | NOT TESTED: Docker denied / P1000 |
| Prisma migrate status | PostgreSQL/PostGIS | NOT TESTED: P1000 |
| Backend E2E | four files/five cases | NOT TESTED: all stopped during DB authentication, not assertions |
| GIS contracts | four shell fixtures/contracts | PASS static; runtime candidate/final smokes explicitly skipped |
| Production Compose config | Docker Compose | NOT TESTED: Docker denied |
| Backend image | Docker build | NOT TESTED: Docker denied |
| Frontend image | Docker build | NOT TESTED: Docker denied |
| Dependency audit | npm audit root/backend/frontend | PASS: 0 known vulnerabilities |
| Secret history scan | gitleaks 8.28.0 contract | NOT TESTED: tool unavailable |
| Backend source build | Nest build | PASS |
| Frontend source build | Vite production build | PASS with MapLibre chunk warning |

Because the database, Docker, and secret-scan jobs were not demonstrated, the
equivalent Quality Gate is **INCOMPLETE/FAIL for release purposes**.

## 6. Business, concurrency, RBAC, browser, realtime, and GIS

### Independent business oracles

The requested independent equations were not executed against a disposable
database:

- inventory: `initial + in - out ± adjustments - sales + returns = final`;
- cash: `opening + cash receipts + cash in - expenses - cash out`;
- receivable: `original - valid applied payments = outstanding`;
- sale: independent line/discount sum against persisted total.

The operational-day E2E contains cross-module assertions, but it is not runtime
evidence until it passes against disposable PostgreSQL/PostGIS.

### Idempotency and concurrency

Static/unit contracts cover sales, adjustments, purchases, transfers, receipts,
payments, route collections, incidents, closing, and settlements to differing
depths. The audit added the missing purchase retry ownership and incident replay
contracts. Real two-connection races, lost responses, Serializable retries, and
version conflicts remain unproven in PostgreSQL.

Opening a route settlement still generates an Idempotency-Key in the frontend
HTTP service, but `DeliveryController.openSettlement` does not read it and
`DeliveryService.openSettlement` does not bind it to a canonical payload.
The unique route-settlement relation prevents a second settlement, but this is
not the required payload-bound replay/version contract.

### RBAC matrix

| Role | Frontend route intent | Backend authority | Scope requiring runtime proof |
| --- | --- | --- | --- |
| ADMIN | all administrative areas | all canonical permissions | cross-location administrative access and audit |
| BILLING | billing requests/remediation/reports | fiscal export/billing roles | customer/document ownership |
| SELLER | POS, customers, own cash shift, branch receipt | sales roles + own shift + CEDIS receive/request | assigned operational location/device |
| WAREHOUSE | inventory, purchases, CEDIS dispatch/receipt | cost/CEDIS permissions | origin/destination hierarchy |
| COLLECTIONS | receivables, own cash shift | receive cash + own shift permissions | own shift/location and non-cash behavior |
| DRIVER | assigned routes/evidence/GPS | route ownership + GPS publish | assigned driver, route, vehicle, and order |

Positive/negative guard tests pass. Authenticated HTTP IDOR/BOLA attempts across
branches, routes, drivers, and locations are **NOT TESTED**.

### Browser E2E

There is no Playwright configuration, dependency, or browser specification in
the repository. Therefore login/logout, refresh, role navigation, POS,
purchases, inventory, CEDIS, collections, daily close, driver evidence, and
Fleet Live are **NOT TESTED in a real browser**.

### Fleet/realtime/GIS

Gateway and frontend tests cover token/permission rejection, reconnect,
connection-state recovery, REST snapshot reconciliation, stable GeoJSON IDs,
`GeoJSONSource.updateData()`, StrictMode-safe map ownership, and provider
success/error/timeout behavior. Static GIS scripts pass.

The required DRIVER → persisted GPS → Socket.IO → Nginx → ADMIN browser →
React → MapLibre marker movement without refresh is **NOT TESTED**. Photon,
OSRM, VROOM, and style→source→PBF→MapLibre rendering are also **NOT TESTED**
against deployed providers.

## 7. Security

Static inspection and unit tests found:

- distinct access/refresh tokens, hashed refresh tokens, atomic rotation,
  reuse-triggered session revocation, inactive-user/session version checks,
  idle and absolute TTLs, and password-change session invalidation;
- Helmet in production, configured CORS allowlist, request IDs, compression,
  one-megabyte default body limit, global ValidationPipe whitelist/transform,
  and sanitized exception responses;
- authenticated WebSocket handshakes with must-change-password, permission, and
  driver-room enforcement; revoked sessions are disconnected;
- signed object-storage URLs with server-derived keys;
- no product-code `dangerouslySetInnerHTML`;
- raw SQL sites use constant statements or parameter placeholders in the
  inspected paths.

This is not a dynamic penetration test. CORS/CSP, path traversal, XSS,
IDOR/BOLA, mass assignment, log leakage, WebSocket revocation, and signed URL
expiry remain unproven against a deployed system. Secret-history scanning is
also absent.

## 8. Production release

The audit reproduced a release P1: `.github/workflows/release-images.yml`
built the final frontend with `https://objects.example.com`. The remediation:

- reads `vars.OBJECT_STORAGE_PUBLIC_ORIGIN`;
- fails closed if missing, non-HTTPS, localhost, or a reserved/placeholder
  hostname;
- passes the approved origin to the final CSP;
- keeps the map style browser-relative;
- records immutable image digests.

The actual GitHub repository variable is external state and could not be read.
The checked-in `Caddyfile.production` intentionally contains example
hostnames as a deployment template. Release remains blocked until an operator
proves that the repository variable, deployed Caddy host, DNS/TLS, and final CSP
all name the same approved object-storage origin.

Production Compose has no `build:` fallback, pins infrastructure images by
digest, requires application image variables, and reuses `BACKEND_IMAGE` for
migrate/bootstrap/backend. Health and proxy contracts exist. None of these
runtime claims, including Caddy, frontend, Socket.IO, object storage, or
`/maps/health`, were executed.

## 9. Backup, restore, and rollback

`scripts/database` and `docs/runbooks/postgres-backup-b2.md` provide a
verifiable design for dump, SHA-256 checksum, B2 upload, restore selection,
restore drill isolation, PostGIS checks, critical Prisma-table checks, retention,
and JSON result evidence. Shell syntax, Python byte compilation, and backend
contract tests pass.

No backup/upload/restore drill ran. Docker rollback does not revert PostgreSQL.
The new delivery-incident migration is additive and nullable, but its regular
unique-index creation can lock incident writes; production needs a measured
maintenance window/table-size check. The release migration set also needs a
real empty-DB apply and a data-volume lock/backfill review before deployment.

## 10. Findings

### FQA-001 — Purchase retry could duplicate inventory

- **Severity:** P1 (remediated)
- **Area:** purchases/idempotency
- **File:** `frontend/src/features/compras/purchasesService.ts`,
  `hooks.ts`, `PurchaseFormPage.tsx`, `CancelPurchaseDialog.tsx`
- **How to reproduce:** lose the response after commit and retry the same form.
- **Actual:** a new UUID was created for every HTTP attempt.
- **Expected:** one logical command owns one stable key through terminal result.
- **Business impact:** duplicate purchase and stock.
- **Root cause:** key ownership lived in the transport call, not command state.
- **Missing coverage:** caller-key forwarding.
- **Correction:** stable UI command key forwarded through hook/service.
- **Regression risk:** medium; focused regression and full frontend suite pass.

### FQA-002 — Returned-stock incident retry could duplicate stock

- **Severity:** P1 (remediated)
- **Area:** delivery/inventory/idempotency
- **File:** `backend/src/modules/delivery/delivery-orders.controller.ts`,
  `delivery.service.ts`, `backend/prisma/schema.prisma`
- **How to reproduce:** retry a RETURNED incident after a lost response.
- **Actual:** backend ignored the header and reapplied returned quantities.
- **Expected:** same key/payload replays; changed payload conflicts; one movement.
- **Business impact:** inflated route stock and duplicated incident history.
- **Root cause:** incident endpoint was transactional but not idempotent.
- **Missing coverage:** replay/collision and caller-owned key.
- **Correction:** persisted key/hash, unique migration, Serializable retry,
  derived movement keys, single post-commit emission, stable frontend key.
- **Regression risk:** high; unit/controller/frontend/full suites pass, real
  PostgreSQL concurrency is still untested.

### FQA-003 — Release image baked a fictitious object-storage origin

- **Severity:** P1 (source remediated; deployment proof pending)
- **Area:** release/CSP/object storage
- **File:** `.github/workflows/release-images.yml`,
  `docker/frontend/Dockerfile`, `scripts/validate-public-origin.mjs`
- **How to reproduce:** inspect the former release build arg.
- **Actual:** `https://objects.example.com` was compiled into final CSP.
- **Expected:** one explicitly approved real HTTPS origin, validated before build.
- **Business impact:** evidence images blocked or sent toward a fictitious host.
- **Root cause:** release fixture value was treated as deployment configuration.
- **Missing coverage:** production-only placeholder rejection.
- **Correction:** GitHub variable plus fail-closed shared validator/contracts.
- **Regression risk:** high until the actual GitHub variable and Caddy host are
  proven equal.

### FQA-004 — Required production runtime evidence is unavailable

- **Severity:** P1 release blocker
- **Area:** database/Docker/E2E/GIS/realtime/backup
- **File:** environment; no source line
- **How to reproduce:** run Docker commands or Prisma E2E in this environment.
- **Actual:** Docker is denied and PostgreSQL returns P1000.
- **Expected:** disposable PostGIS, complete Compose, real API/browser/GIS, and
  backup/restore evidence.
- **Business impact:** money, stock, authorization, deployment, and recovery
  behavior cannot be certified.
- **Root cause:** audit environment lacks executable Docker and usable DB access.
- **Missing coverage:** all runtime gates listed above.
- **Correction proposed:** rerun the documented commands on an approved Docker
  host with disposable credentials and preserve evidence artifacts.
- **Regression risk:** critical if deployment proceeds without this proof.

### FQA-005 — No real browser E2E suite

- **Severity:** P2
- **Area:** browser/critical journeys
- **File:** frontend test configuration (absent)
- **How to reproduce:** search for Playwright config/spec/dependency.
- **Actual:** no Playwright suite exists.
- **Expected:** stable non-mocked smoke journeys against real backend/PostGIS.
- **Business impact:** route guards, session refresh, forms, proxies, and MapLibre
  integration can regress while unit tests stay green.
- **Root cause:** Quality Gate stops at Vitest and backend Supertest.
- **Missing coverage:** all Phase 7 journeys.
- **Correction proposed:** add a seeded disposable Playwright project after the
  real stack is available.
- **Regression risk:** high.

### FQA-006 — Route settlement opening ignores its idempotency key

- **Severity:** P2
- **Area:** route settlement contract
- **File:** `frontend/src/features/rutas-reparto/deliveryService.ts`,
  `backend/src/modules/delivery/delivery.controller.ts`,
  `delivery.service.ts`
- **How to reproduce:** send the same key with a changed opening command; backend
  does not read or bind the key.
- **Actual:** uniqueness by route avoids a second settlement but no payload-bound
  replay/version contract exists.
- **Expected:** explicit Idempotency-Key/hash and current-version semantics.
- **Business impact:** ambiguous retries and inability to detect key collisions.
- **Root cause:** frontend transport added a header without backend ownership.
- **Missing coverage:** replay/collision/concurrency/version.
- **Correction proposed:** apply the existing route-collection idempotency
  pattern to opening.
- **Regression risk:** medium.

### FQA-007 — Transactional services remain oversized

- **Severity:** P2
- **Area:** architecture
- **File:** Sales 3,435 lines; Daily Close 2,527; CEDIS cycles 2,230;
  Transfers 2,028; SalesPosPage 1,829.
- **How to reproduce:** `wc -l` on the named files.
- **Actual:** business policy, persistence, authorization, projection, and
  orchestration remain coupled.
- **Expected:** characterized policies and smaller application orchestrators.
- **Business impact:** high cognitive load and cross-domain regression risk.
- **Root cause:** incremental growth without post-stabilization extraction.
- **Missing coverage:** architecture boundaries and mutation characterization.
- **Correction proposed:** incremental extraction only after runtime E2E proof.
- **Regression risk:** high if refactored prematurely.

### FQA-008 — Tooling contracts contradict each other

- **Severity:** P2
- **Area:** CI/developer workflow
- **File:** `AGENTS.md`, `.github/workflows/quality-gate.yml`,
  `docs/validation.md`, lockfiles, backend package Prisma configuration
- **How to reproduce:** compare mandated commands and run Prisma.
- **Actual:** pnpm is mandated locally, npm is release authority, duplicate locks
  exist, and Prisma emits a deprecation warning.
- **Expected:** one supported reproducible toolchain and current Prisma config.
- **Business impact:** local/CI drift and misleading validation results.
- **Root cause:** incomplete package-manager/config transition.
- **Missing coverage:** executable documentation.
- **Correction proposed:** make an explicit repository decision and align all
  contracts in one scoped change.
- **Regression risk:** medium.

### FQA-009 — Release migration has an unmeasured write-lock risk

- **Severity:** P2
- **Area:** database migration
- **File:** `backend/prisma/migrations/20260820193000_harden_delivery_incident_idempotency/migration.sql`
- **How to reproduce:** apply to a production-sized DeliveryIncident table while
  writes continue.
- **Actual:** regular unique-index creation requires a table/write lock.
- **Expected:** measured duration and an approved change window or safe
  production migration procedure.
- **Business impact:** temporary incident-write outage.
- **Root cause:** local schema safety is known, production cardinality is not.
- **Missing coverage:** production-size migration rehearsal.
- **Correction proposed:** measure on a restored production-like snapshot and
  schedule/adjust the migration accordingly.
- **Regression risk:** medium.

### FQA-010 — Frontend quality warnings and large MapLibre chunk remain

- **Severity:** P3
- **Area:** frontend maintainability/performance
- **File:** lint-reported React files and MapLibre build chunk
- **How to reproduce:** run frontend lint and Vite build.
- **Actual:** 16 warnings; MapLibre chunk 976.44 kB minified/252.24 kB gzip.
- **Expected:** warning-free lint and measured bundle budget.
- **Business impact:** avoidable render/performance risk; no proven functional
  outage.
- **Root cause:** warning-tolerant lint policy and heavy map dependency.
- **Missing coverage:** browser performance budget.
- **Correction proposed:** resolve warnings incrementally and measure route load.
- **Regression risk:** low-medium.

### FQA-011 — Incident realtime publication failures are swallowed

- **Severity:** P2
- **Area:** fleet/realtime observability
- **File:** `backend/src/modules/delivery/delivery.service.ts` —
  `publishIncidentCreated`
- **How to reproduce:** make `FleetGateway.emitIncidentCreated` throw after the
  incident transaction commits.
- **Actual:** the exception is caught without a log, metric, retry, or outbox.
- **Expected:** persistence remains authoritative, but failed realtime delivery
  is observable and recoverable through explicit reconciliation.
- **Business impact:** Fleet Live can remain stale until another refresh while
  operators have no failure signal.
- **Root cause:** best-effort publication was implemented as a silent catch,
  unlike GPS/geofence publication, which records an error.
- **Missing coverage:** production observability/recovery for incident events.
- **Correction proposed:** at minimum log structured failure; preferably use an
  outbox/reconciliation policy if incident latency is operationally critical.
- **Regression risk:** medium.

## 11. Remediation performed

Only confirmed P1 source defects were changed, test first:

1. Purchase stable idempotency key.
2. Delivery incident idempotency/replay/Serializable protection.
3. Release object-storage origin validation.

No business rule was weakened. No commit, push, PR, reset, or destructive
checkout was performed.

## 12. Release decision

**NO-GO.** Source-level gates and the three P1 remediations are positive, but
production readiness cannot be demonstrated without clean PostGIS migrations,
real E2E/business reconciliation, adversarial RBAC, real concurrency, browser
journeys, GPS→Socket.IO→MapLibre, provider rendering, Compose/image startup,
secret history scan, approved object-storage/Caddy alignment, and a completed
backup/restore drill.
