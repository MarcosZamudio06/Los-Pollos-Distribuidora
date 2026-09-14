# MTE-000: Multi-company silo architecture

**Status:** Proposed  
**Decision type:** Architecture Decision Record (ADR)  
**Audited baseline:** `b58ae875f102b7ea6940bf8c3d2bbe010233f071`  
**Scope:** Architecture and delivery plan only; no implementation is authorized by this document.

## Decision summary

Run one complete, independently administered data plane per company. Each data
plane keeps the current single-company application model and receives exactly
one `DATABASE_URL`, one Object Storage instance/bucket, one set of JWT and
fiscal secrets, one backup boundary, and one domain/TLS boundary. Requests are
routed to a company before they reach NestJS, by DNS and the company's edge
proxy. NestJS never selects a tenant at request time.

The control plane is initially declarative and operational: a non-secret
company inventory, immutable release digests, deployment state, and per-company
secret references. It is not an ERP application, does not proxy ERP traffic,
does not query company databases, and has no `SUPERADMIN` user in any company
database.

This is the minimum safe architecture because it preserves the audited domain,
Prisma, HTTP, authentication, and WebSocket behavior. Multi-company support is
created by repeating the existing deployment unit, not by making the
application tenant-aware.

## Context verified at the baseline

| Area | Baseline evidence | Consequence |
| --- | --- | --- |
| Prisma | `PrismaService` is one global `PrismaClient`; `schema.prisma` reads one `DATABASE_URL`. | Keep one backend process bound to one company database. No dynamic Prisma client or tenant column is needed. |
| Schema | Business, auth, GIS, and fiscal records share one schema; there is no tenant discriminator. | Isolation must be outside the schema. `schema.prisma` remains unchanged. |
| Auth/session | JWT access and refresh secrets come from environment variables; server-side sessions live in the same PostgreSQL database. Tokens have no company claim. | Unique secrets plus a separate session database per company provide isolation without changing token payloads or APIs. |
| Bootstrap | `bootstrap-production.ts` creates company-local roles and an `ADMIN`; it does not create `SUPERADMIN`. | Run bootstrap independently with a unique one-shot admin password for each company. Identical local IDs or email values do not cross the database boundary. |
| Production deployment | `docker-compose.production.yml` already consumes immutable image references and owns PostgreSQL/PostGIS and SeaweedFS volumes. | Reuse the same image digests in separately named/hosted Compose projects. |
| Edge/TLS | `Caddyfile.production` is a single-company template with fixed example hosts and loopback ports. | Parameterize it per data plane; do not add tenant routing to NestJS. |
| Frontend image | The frontend image embeds `OBJECT_STORAGE_PUBLIC_ORIGIN` in its Nginx CSP at build time. | The current image is not independently tenant-neutral at the HTTP-header boundary. The company Caddy configuration must replace that upstream CSP with the correct company Object Storage origin, or a later image contract must remove the build-time origin. |
| Object Storage | One S3 client/bucket is selected from environment; signed download URLs use a configured public endpoint. | Give each company a separate storage instance/bucket, credentials, volume, and public endpoint. Storage keys need no company prefix when physical storage is isolated. |
| CFDI/PAC | PAC credentials are resolved from an opaque Docker-secret reference; fiscal records and certificate metadata live in PostgreSQL. The production Compose file does not mount a fiscal secret. | Add deployment-only secret wiring per company. Do not change issuance, reconciliation, or provider business logic. |
| CSD | The schema stores certificate metadata, not private CSD bytes; the audited runtime has no local CSD-private-key resolver. | Do not invent a CSD storage path. If a future provider flow requires local CSD bytes, design a separate secret-backed adapter before enabling it. |
| GIS | PostgreSQL already uses PostGIS. Photon, OSRM, VROOM, and TileServer are runtime services backed by map datasets. | Keep the first production silo fully company-local. Reuse image and dataset versions, not writable runtime state. Sharing GIS is a later cost optimization, not an MTE prerequisite. |
| Backups | Current automation backs up PostgreSQL to S3/B2 and can run a guarded restore drill. It does not create a coordinated PostgreSQL plus Object Storage recovery set. | Add company identity and Object Storage recovery evidence before claiming complete company recovery. |
| GitHub Actions | Release Images publishes immutable backend/frontend/GIS image digests once after the quality gate. | Promote the same release set to N company environments; never rebuild per company. |
| WebSockets | Socket.IO authenticates against the local `AuthService` and joins unprefixed in-process rooms. Session-revocation fan-out is also in memory. | Room names are safe only because each company has a separate backend process. Keep one backend replica per company in this phase. |

## Decision

### Production topology

The production isolation unit is one company per VM, project, or cloud account.
Running multiple Compose projects on one host is allowed only for development
and acceptance testing; it does not satisfy the production administration and
blast-radius requirement.

```text
                      CONTROL PLANE
  company inventory + release digests + deployment audit + secret refs
                               |
             deploy exact immutable release by digest
                _______________|_______________
               /                               \
      DATA PLANE: company A             DATA PLANE: company B
      DNS/TLS/Caddy A                    DNS/TLS/Caddy B
      frontend image @ digest X         frontend image @ digest X
      backend image  @ digest Y         backend image  @ digest Y
      JWT/PAC secrets A                 JWT/PAC secrets B
      PostgreSQL/PostGIS A              PostgreSQL/PostGIS B
      Object Storage A                  Object Storage B
      GIS runtime/data A                GIS runtime/data B
      backups/restore evidence A        backups/restore evidence B
      company ADMIN A                   company ADMIN B
```

The two companies may temporarily run different approved release digests during
a canary rollout, but every digest comes from the same release catalog. No image
is rebuilt or customized for a company.

### Request and identity boundary

1. A user opens the company's own ERP domain.
2. DNS and that company's Caddy instance select the data plane.
3. The company frontend proxies HTTP and Socket.IO to only its backend.
4. The backend uses its process-level `DATABASE_URL`, JWT secrets, PAC secret
   reference, and Object Storage configuration.
5. No tenant identifier is accepted from headers, cookies, JWT claims, request
   bodies, or query parameters.

A token issued by company A must fail at company B because B uses different
JWT secrets and a different `AuthSession` database. Adding `companyId` to the
token is unnecessary in this topology and would not replace infrastructure
isolation.

### Backward compatibility

The existing single-company path remains the default:

- no company manifest is required to run the current Compose command;
- existing environment variable names and defaults remain valid;
- default ports remain `3000` and `8333`;
- the current Prisma schema, migrations, endpoints, payloads, cookies, JWT
  payload, roles, permissions, and WebSocket events remain unchanged;
- multi-company wrappers and overlays are opt-in;
- absent multi-company configuration means exactly one application process,
  one database, and one Object Storage boundary, as today.

## Control-plane and data-plane boundaries

| Concern | Control plane may hold | Must remain in one company data plane |
| --- | --- | --- |
| Company identity | Slug, display label, environment name, domains, opaque deployment target | Business/legal records and operational locations |
| Releases | Approved image digests, schema compatibility, promotion history | Running containers and company-local migration state |
| Secrets | Opaque secret references and rotation timestamps | Secret values: PostgreSQL, JWT, Object Storage, backup, PAC, CSD, TLS private material, bootstrap password |
| Routing | Desired DNS names and target references | TLS termination, private keys, upstream addresses, company CSP |
| Administration | Infrastructure RBAC, deployment approvals, audit trail | Company `ADMIN` users, roles, sessions, access-control audit logs |
| Data | Health state, version, non-sensitive counts | PostgreSQL rows, files, fiscal artifacts, delivery evidence, coordinates |
| Backups | Policy, expected RPO/RTO, last verified recovery-set ID | Archives, manifests, credentials, restore execution and evidence |
| Observability | Company slug, release, health, aggregate SLO | Logs/traces containing user, route, sale, payment, fiscal, or location data |

The control plane must never contain a cross-company ERP user directory or an
application `SUPERADMIN`. Platform operators administer infrastructure through
provider/GitHub/host RBAC; company administrators remain ordinary `ADMIN`
records inside only their company database.

## Isolation rules by subsystem

### PostgreSQL, Prisma, and jobs

- One PostgreSQL/PostGIS instance and durable volume per company.
- One backend process connects to exactly one `DATABASE_URL` for its lifetime.
- Migrate and bootstrap jobs use the exact backend digest used by that company.
- Scheduled fiscal, retention, and certificate jobs execute inside that
  company's backend and therefore see only that company's database.
- Do not pool databases behind one Prisma service or derive connection strings
  from requests.

### Object Storage and fiscal material

- Use a separate SeaweedFS/S3 instance, bucket, credentials, volume, and public
  hostname per company.
- Caddy must preserve the signed URL host, path, and query exactly and must emit
  a company-specific CSP. It must discard the frontend image's baked CSP before
  setting the authoritative edge CSP.
- PAC credentials are separate Docker secrets or secret-manager records. The
  reference may be configured in the data-plane environment; credential bytes
  may not be stored there.
- CSD private keys/certificates, if later required, must use a dedicated
  company secret reference and may never enter PostgreSQL, Git, image layers,
  logs, the control-plane inventory, or a shared filesystem.
- Never use a shared provider credential merely because Facturama supports
  multiple issuers. Provider capability is not a tenant-isolation boundary.

### GIS

- PostGIS remains inside each company database.
- Phase one runs Photon, OSRM, VROOM, and TileServer in each company data plane.
- Images and verified dataset versions are reusable; writable caches, logs, and
  runtime networks are not.
- Sharing a read-only map reference plane can be evaluated later. VROOM and
  request logs can observe business route coordinates, so that optimization
  requires an explicit privacy and failure-domain decision.

### WebSockets

- Company DNS must route `/api/socket.io` and all namespaces to only the local
  backend.
- Existing room names remain unchanged because Socket.IO servers are not shared.
- This phase supports one backend replica per company. Multiple replicas require
  a company-local Socket.IO adapter and a distributed session-revocation bus;
  that is intentionally out of scope.

### Backups and restores

- Each company uses different backup credentials, bucket, local result
  directory, retention policy execution, and restore target.
- A complete recovery point contains PostgreSQL, Object Storage, release
  digests, schema/migration status, checksums, timestamps, and company identity.
- Until application-level coordinated snapshots exist, create the recovery set
  in a maintenance window with writes stopped. A PostgreSQL-only dump is not a
  complete company backup because database rows reference Object Storage keys.
- Restore tooling must fail closed when the manifest company slug does not
  match the requested target.
- An emergency restore is company-local and must never overwrite another
  company's database, bucket, volumes, or DNS.

## Alternatives considered

| Alternative | Decision | Tradeoff |
| --- | --- | --- |
| Shared schema with `companyId` | Rejected | Lowest infrastructure cost, but requires pervasive model, query, authorization, uniqueness, job, WebSocket, and migration changes. One missed predicate leaks data. |
| Schema per company in one database | Rejected | Reduces some row-filter risk but keeps a shared database failure/admin boundary and requires runtime schema/client selection. |
| Database per company behind one shared NestJS process | Rejected | Preserves database isolation but requires request-time tenant resolution and dynamic Prisma/client lifecycle changes. WebSockets and jobs become especially error-prone. |
| Separate backend and state per company, shared edge | Rejected for phase one | Fewer hosts, but shared routing/TLS/admin becomes a cross-company blast radius. Useful only after an explicit risk decision. |
| Full data-plane silo per company | Accepted | Highest infrastructure cost and operational repetition, but the smallest application change and strongest compatibility/isolation boundary. |

## Exact implementation surface for MTE-001 through MTE-007

These paths are the proposed future implementation boundary. MTE-000 creates
only this ADR.

### Files to create

| Path | Purpose |
| --- | --- |
| `docker/multi-company/company-manifest.schema.json` | Non-secret control-plane contract. |
| `docker/multi-company/companies.example.json` | Safe example with two companies and opaque secret/deployment references. |
| `docker/multi-company/company.env.example` | Per-company data-plane variables without values. |
| `docker/multi-company/docker-compose.cfdi.yml` | Optional company-local PAC Docker-secret mount. |
| `scripts/multi-company/validate-company-manifest.mjs` | Fail-closed manifest, uniqueness, domain, port, digest, and secret-reference validation. |
| `scripts/multi-company/validate-company-manifest.test.mjs` | Validator contract tests. |
| `scripts/multi-company/compose-company.sh` | Render/pull/migrate/bootstrap/deploy one selected company using the existing production Compose file. |
| `scripts/multi-company/compose-company.test.mjs` | Legacy-default and two-project isolation contracts. |
| `scripts/multi-company/verify-secret-boundaries.mjs` | Verify unique secret references/mount targets without reading secret values. |
| `scripts/multi-company/verify-secret-boundaries.test.mjs` | Secret and fiscal-boundary negative tests. |
| `scripts/multi-company/verify-release-set.mjs` | Confirm every custom service uses approved immutable digests and no company-specific build. |
| `scripts/multi-company/verify-release-set.test.mjs` | Release-set contract tests. |
| `scripts/multi-company/test-two-company-isolation.sh` | Disposable two-data-plane real-stack harness. |
| `scripts/database/backup-object-storage-to-b2.sh` | Company-local Object Storage backup with checksums and manifest. |
| `scripts/database/restore-object-storage-from-b2.sh` | Guarded Object Storage restore drill. |
| `scripts/database/create-company-recovery-set.sh` | Quiesced PostgreSQL plus Object Storage recovery-set orchestration. |
| `scripts/database/restore-company-recovery-set.sh` | Company-bound full recovery drill and evidence. |
| `.github/workflows/deploy-company.yml` | Approved release promotion to exactly one protected company environment. |
| `frontend/e2e/multi-company-isolation.spec.ts` | Real-browser cross-company HTTP and Socket.IO isolation journey. |
| `docs/runbooks/multi-company-operations.md` | Provision, deploy, rotate, monitor, rollback, and decommission one data plane. |
| `docs/runbooks/multi-company-secrets-admin.md` | Per-company secrets, bootstrap, PAC/CSD, TLS, and operator RBAC. |
| `docs/runbooks/multi-company-backup-restore.md` | Recovery-set creation and restore procedure. |

### Files to modify

| Path | Minimum change |
| --- | --- |
| `docker-compose.production.yml` | Parameterize the Object Storage loopback port with a backward-compatible `8333` default; keep image and volume behavior unchanged. |
| `.env.production.example` | Add optional `COMPANY_SLUG`, Compose project, company domains/ports, and opaque secret-reference examples; preserve all existing defaults. |
| `Caddyfile.production` | Replace fixed example hosts/ports with defaulted environment placeholders; strip the image CSP and emit the correct company-specific CSP at the edge. |
| `backend/src/prisma/caddy.contract.spec.ts` | Prove host, signed-URL, proxy-header, CSP replacement, and default compatibility contracts. |
| `scripts/database/postgres-backup-common.sh` | Add reusable company identity/recovery-set validation while keeping legacy no-company behavior. |
| `scripts/database/backup-postgres-to-b2.sh` | Include optional company/recovery-set identity in keys and manifests; retain current keys when company mode is absent. |
| `scripts/database/restore-postgres-from-b2.sh` | Reject mismatched company/recovery-set manifests; preserve current guarded drill behavior. |
| `backend/src/prisma/postgres-backup.contract.spec.ts` | Cover legacy and company-bound backup/restore contracts. |
| `.github/workflows/quality-gate.yml` | Add manifest, Compose, Caddy, recovery, and disposable two-company isolation gates. |
| `docs/runbooks/caddy-deployment.md` | Document one Caddy/TLS boundary per production company. |
| `docs/runbooks/production-release.md` | Document build-once/promote-many and independent company rollback. |

## Code that must not be touched

Unless a future task first proves an unavoidable contradiction, MTE work must
not modify:

- `backend/prisma/schema.prisma` or existing migrations;
- `backend/src/database/prisma.service.ts` and
  `backend/src/database/prisma.module.ts`;
- `backend/src/modules/auth/**`, JWT guards, token payloads, cookies, or session
  semantics;
- `backend/src/modules/object-storage/**`;
- `backend/src/modules/cfdi/**`, including stamping, reconciliation,
  cancellation, repositories, provider adapters, and state machines;
- `backend/src/modules/sales/**`, `payments/**`, `cedis/**`, `delivery/**`,
  `fleet/**`, POS, purchases, reports, inventory, or any other audited business
  service/controller;
- frontend application/auth/API/socket code, except the new isolated acceptance
  spec;
- existing API routes, DTOs, response bodies, error codes, or WebSocket event
  names.

If one of these files becomes necessary, stop that task, document the failed
infrastructure assumption, update the architecture/spec first, and obtain a
separate scope decision.

## Tasks and dependencies

| Task | Outcome | Depends on |
| --- | --- | --- |
| **MTE-001 — Define company deployment contract** | Add the non-secret manifest, validator, uniqueness rules, and immutable-release contract. | MTE-000 approved |
| **MTE-002 — Make the current data plane repeatable** | Add the opt-in wrapper and backward-compatible Compose/env parameters; prove two named projects cannot share state. | MTE-001 |
| **MTE-003 — Isolate domain, TLS, CSP, and signed Object Storage routing** | Parameterize Caddy per company and prove the same frontend digest works under two domain pairs. | MTE-002 |
| **MTE-004 — Isolate secrets, administration, and fiscal configuration** | Wire per-company secret references/mounts, bootstrap procedure, PAC/CSD rules, and operator RBAC without changing auth or CFDI logic. | MTE-002 |
| **MTE-005 — Create complete company recovery sets** | Pair PostgreSQL/PostGIS and Object Storage backups, enforce company identity, and prove guarded restoration. | MTE-003, MTE-004 |
| **MTE-006 — Build once and promote independently** | Add protected per-company deployment, canary, audit, concurrency, and digest rollback using the existing release artifacts. | MTE-003, MTE-004, MTE-005 |
| **MTE-007 — Prove isolation and pilot rollout** | Run the dual-company real-stack suite, legacy regression, pilot onboarding, rollback rehearsal, and acceptance sign-off. | MTE-001 through MTE-006 |

No implementation task may begin until MTE-000 is approved and the relevant
canonical deployment/testing specs are updated. There is no MTE task in the
audited `action.md` baseline, so this ADR is planning input, not implementation
authority.

## Mandatory tests by phase

### MTE-001

- Accept a valid two-company manifest.
- Reject duplicate company slugs, ERP domains, Object Storage domains, ports,
  Compose project names, deployment targets, and secret references.
- Reject mutable image tags, embedded credentials, raw secret-like fields, and
  invalid/non-HTTPS production domains.
- Prove the manifest contains no business, user, fiscal-document, or location
  data.

### MTE-002

- Render the existing single-company Compose configuration without any new
  variables and compare its effective services, defaults, volumes, and image
  references with the baseline.
- Render two company projects and prove distinct project names, networks,
  volumes, loopback ports, PostgreSQL databases, and Object Storage instances.
- Apply migrations and bootstrap twice to each disposable database; both runs
  must be idempotent and use the same backend digest as runtime.
- Assert `schema.prisma`, API snapshots, and audited business files are
  unchanged.

### MTE-003

- Validate two generated/defaulted Caddy configurations.
- Prove SNI/certificates, ERP domains, Object Storage domains, upstream ports,
  and CSP origins never cross.
- Generate a signed Object Storage URL in each data plane and verify A succeeds
  only against A while B succeeds only against B.
- Prove Caddy removes the frontend image's baked CSP and emits exactly the
  company CSP, without weakening the remaining directives.
- Re-run HTTP and Socket.IO proxy upgrade contracts.

### MTE-004

- Assert all secret references and secret mounts are company-unique and no raw
  secret is rendered, committed, uploaded, or logged.
- Bootstrap each company with a different one-shot password; verify only local
  roles exist and no `SUPERADMIN` role/user is created.
- Issue access and refresh tokens in A; both must be rejected by B, including
  Socket.IO handshakes.
- With the fake fiscal provider, prove each company resolves only its own PAC
  credential and persists attempts only in its own database.
- Keep protected real-PAC tests separately approved and company-scoped; never
  use cross-company stamping as an isolation test.

### MTE-005

- Create a quiesced recovery set containing PostgreSQL/PostGIS, Object Storage,
  release digests, schema status, company slug, timestamps, sizes, and checksums.
- Restore A into a disposable A target and verify PostGIS, critical tables,
  delivery evidence, fiscal artifacts, and checksums.
- Attempt to restore A as B and require a fail-closed result before mutation.
- Corrupt/miss one archive, manifest, or object and require failure with no
  production overwrite.
- Measure and record RPO/RTO from a real restore drill for each pilot company.

### MTE-006

- Prove one validated release artifact supplies the exact backend/frontend/GIS
  digests deployed to both companies and that deployment performs no build.
- Prove GitHub Environment approvals and credentials for A cannot deploy B.
- Prove per-company deployment concurrency prevents overlapping migrations.
- Fail a canary deployment and verify the other company remains unchanged.
- Roll back one company to its prior compatible digests without changing the
  other company.

### MTE-007

- Start two disposable data planes with identical application image digests.
- Seed unique sentinel data independently through normal APIs and verify with
  independent PostgreSQL oracles that A never appears in B and vice versa.
- Verify cross-company denial for login/session reuse, HTTP resources, signed
  objects, WebSocket rooms/events, administration, and fake fiscal operations.
- Run the existing authenticated Auth, POS, CEDIS, DRIVER/fleet, payment, and
  CFDI regression suites against each data plane without mocks for the data
  plane boundary.
- Run the current single-company deployment and browser smoke with no new
  multi-company variables.
- Rehearse backup restore and digest rollback before onboarding the second real
  company.

## Acceptance criteria

MTE is accepted only when all of the following are true:

- At least two production-like data planes run the same backend and frontend
  image digests without per-company rebuilds.
- Each company has distinct PostgreSQL/PostGIS, Object Storage, JWT secrets,
  PAC/CSD secret references where enabled, backup targets/credentials,
  domain/TLS state, Compose project, and administrators.
- A request reaches exactly one company backend before application code runs.
- Cross-company HTTP, refresh-token, signed-object, WebSocket, database,
  administration, and fiscal tests fail closed.
- `schema.prisma` has no `tenantId`/`companyId`; `PrismaService` still owns one
  process-level client; no audited business service/controller changed.
- Existing API and WebSocket contracts are byte/behavior compatible.
- A deployment, migration failure, rollback, restore drill, or secret rotation
  for one company does not mutate another company.
- A complete PostgreSQL plus Object Storage recovery set restores successfully
  and a mismatched-company restore is rejected before mutation.
- The control plane stores no secret values or ERP data and creates no
  `SUPERADMIN` in a company database.
- An installation with no multi-company configuration passes the existing
  single-company Compose, backend, frontend, browser, GIS, Object Storage, and
  backup contracts unchanged.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Wrong DNS/upstream or environment file routes A to B | Critical data disclosure | Dedicated production hosts/projects; unique targets/domains; manifest uniqueness; pre-deploy endpoint identity and sentinel tests. |
| Reused JWT, PAC, storage, backup, or TLS credentials | Cross-company access/blast radius | Separate secret records and IAM policies; unique references; rotation and negative tests; never copy environment files. |
| Frontend CSP remains tied to one build-time Object Storage origin | Broken downloads or wrong allowlist | Authoritative company CSP at Caddy; strip upstream CSP; dual-domain contract test. |
| PostgreSQL backup exists but referenced objects do not | Incomplete recovery | Quiesced paired recovery sets and real restore drills. |
| Migration fan-out damages every company | Fleet-wide outage | One-company canary, serialized promotion, per-company approval, schema compatibility gate, no automatic database downgrade. |
| Shared control-plane permissions become de facto super-admin | All-company operational compromise | Per-company deployment environments, least privilege, audited approvals, no DB/network access from inventory readers. |
| One backend is scaled to multiple replicas | Lost revocation/event delivery or inconsistent sockets | Keep one replica per company; design a company-local adapter/bus before scaling. |
| Full GIS duplication is expensive | Higher infrastructure cost | Accept for phase-one isolation; later evaluate read-only reference-service sharing with privacy evidence. |
| Provider multi-issuer account is shared | Fiscal credential and issuer blast radius | Separate provider credentials/accounts per company even when the API supports multiple issuers. |
| Human chooses the wrong restore target | Destructive cross-company restore | Company-bound manifests, target identity checks, disposable drill suffixes, explicit maintenance approval, fail closed before writes. |

## Rollback strategy

1. **Before pilot:** the existing single-company deployment remains untouched;
   delete or ignore the opt-in manifest/wrapper with no runtime effect.
2. **Routing/config rollback:** restore the previous company Caddy/env revision
   and validate it before reload. DNS changes use a documented TTL and previous
   target record.
3. **Application rollback:** change only the affected company's image references
   to its previous approved compatible digests. Never rebuild and never roll
   back all companies automatically.
4. **Database rule:** do not reverse Prisma migrations automatically. Use
   expand/contract compatibility; a data restore requires a separate incident
   decision and maintenance window.
5. **Recovery rollback:** restore only from a matching company recovery-set
   manifest into a new target, verify it, then switch traffic. Preserve the old
   database and bucket until acceptance.
6. **Pilot abort:** route the pilot domain back to its previous isolated stack;
   other companies and the legacy installation remain unchanged.

## Assumptions that are incorrect or require confirmation

1. **“The current frontend image is already reusable under arbitrary company
   Object Storage domains” is incorrect.** The baseline bakes one
   `OBJECT_STORAGE_PUBLIC_ORIGIN` into Nginx CSP. MTE-003 must make the edge CSP
   company-specific while preserving one frontend digest.
2. **“The current production Compose already wires PAC secrets” is
   incorrect.** The code can resolve a Docker secret, but the baseline Compose
   does not mount one. MTE-004 must add deployment-only wiring before CFDI is
   enabled.
3. **“Current backups are a complete company backup” is incorrect.** The
   current automated contract covers PostgreSQL/PostGIS, not a coordinated
   Object Storage recovery point.
4. **“CSD private material is currently managed by the ERP” is not supported
   by the baseline.** Only certificate metadata is persisted. The actual CSD
   custody model must be confirmed before claiming CSD isolation.
5. **“N companies can safely share one backend process without application
   changes” is incorrect.** A shared process would force tenant resolution,
   dynamic database clients, tenant-aware jobs, and WebSocket isolation—the
   exact changes this architecture avoids.
6. **“Multiple backend replicas per company work unchanged” is incorrect.**
   Socket.IO rooms and session-revocation notifications are process-local.
7. **The proposed production isolation level assumes one VM/project/account per
   company.** If the intended target is multiple production companies on one
   Docker host, administration, TLS, kernel, resource, and host compromise are
   shared; that is a weaker silo and requires explicit acceptance before
   MTE-002.

## Approval gate

Approve this ADR only if the business accepts the infrastructure cost of one
production data plane per company and confirms the CSD custody model. Approval
authorizes planning MTE-001 through MTE-007; it does not authorize code changes.
