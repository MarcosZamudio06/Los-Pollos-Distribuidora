# Real-stack browser smoke

TASK-ID: FQA-005A-PLAYWRIGHT-REAL-STACK-SMOKE

**Current evidence: PARTIAL.** The foundation is implemented, but no browser
scenario has completed against the disposable real stack in this session.
Static checks and test discovery are not browser acceptance evidence.

## Preflight (2026-09-04, before implementation)

| Check | Result |
| --- | --- |
| Direct `@playwright/test` dependency | Absent from frontend/backend/root manifests |
| `playwright.config.ts` | Absent from the active frontend |
| Browser E2E suite | Absent; existing `backend/test` E2E uses Jest |
| Canonical browser script | Absent; root only aggregated backend E2E |
| Effective CI package manager | npm, with frontend/backend `package-lock.json` |
| Working-tree baseline | Unavailable: Git resolves to the Xcode shim without developer tools |

Optional `@vitest/browser*` peer metadata in the frontend lockfile was not an
installed browser test suite. The task-specific instruction to use the effective
CI package manager takes precedence over the general pnpm preference here.
The existing pnpm lockfiles were not migrated or updated. No commit or push.

## Run locally

Prerequisites: Node 24.14.1, npm, Docker with PostGIS image support, and a working
Chromium host. Run the following **from the repository root in Bash**. This uses
a new named container with tmpfs storage, not an existing/shared database.
On Apple Silicon, the PostGIS image below uses amd64 emulation.

```bash
(
  set -euo pipefail
  export OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh
  export NODE_ENV=test CFDI_ENABLED=false FISCAL_PROVIDER=NONE
  export E2E_RUN_ID="local-$(node -e 'console.log(Date.now())')"
  export E2E_ADMIN_EMAIL="browser-${E2E_RUN_ID}@example.test"
  export E2E_ADMIN_PASSWORD="$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))')"
  E2E_DB_PASSWORD="$(node -e 'console.log(require("node:crypto").randomBytes(24).toString("hex"))')"
  export DATABASE_URL="postgresql://postgres:${E2E_DB_PASSWORD}@127.0.0.1:55439/pollos_browser_e2e"
  export E2E_DATABASE_URL="$DATABASE_URL" E2E_DATABASE_DISPOSABLE=true
  export E2E_BASE_URL=http://127.0.0.1:4173 E2E_BACKEND_PORT=4100
  E2E_CONTAINER="pollos-browser-${E2E_RUN_ID}"

  docker run --detach --rm --name "$E2E_CONTAINER" \
    --platform linux/amd64 --label "erp.browser-e2e=$E2E_RUN_ID" \
    --tmpfs /var/lib/postgresql/data \
    -p 127.0.0.1:55439:5432 \
    -e POSTGRES_DB=pollos_browser_e2e -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD="$E2E_DB_PASSWORD" \
    --health-cmd 'pg_isready -U postgres -d pollos_browser_e2e' \
    --health-interval 1s --health-timeout 3s --health-retries 60 \
    postgis/postgis:16-3.5
  # Installed only after this invocation successfully created its own container.
  trap 'docker stop "$E2E_CONTAINER" >/dev/null' EXIT
  for attempt in $(seq 1 60); do
    health="$(docker inspect --format '{{.State.Health.Status}}' "$E2E_CONTAINER")"
    test "$health" != unhealthy
    test "$health" != healthy || break
    sleep 1
  done
  test "$health" = healthy

  npm ci --prefix backend
  npm ci --prefix frontend
  npm --prefix backend exec -- prisma generate --schema backend/prisma/schema.prisma
  npm --prefix frontend exec -- playwright install --with-deps chromium
  npm --prefix backend run browser:prepare -- --check
  # Explicitly runs ALL migrate deploy, migrate status, then the dedicated seed.
  npm --prefix backend run browser:prepare
  npm --prefix backend run build
  npm run frontend:test:e2e:browser
  # Same database/run identity, idempotent preparation, fresh app processes/contexts.
  npm --prefix backend run browser:prepare
  npm run frontend:test:e2e:browser
)
```

Do not remove the safety flag or change these commands to target another database
to get past an infrastructure failure. Preparation never resets/truncates data,
deletes audit history, or disables triggers. Cleanup stops only the container
created by the current invocation; its tmpfs is discarded.

To reuse an already-created **dedicated disposable** database, export the same
contract and run preparation + smoke. Keep the same run ID to test rerunnability;
use a new run ID/email for a new dataset. Runs sharing app ports must be serial.

## Safety and test contract

- Both preparation/seed and Playwright reuse `assertDisposableE2eEnvironment`.
  They additionally require a loopback PostgreSQL URL, database name
  `pollos_browser_e2e` or `pollos_browser_e2e_<suffix>`, and no URL query/hash.
  The marker is an operator attestation, not automatic proof of disposability.
- Run ID: 1–40 lowercase letters/digits/hyphens. Email must be exactly
  `browser-${E2E_RUN_ID}@example.test`. Password is required, minimum 16 characters,
  with no default. Use generated test-only values; never production credentials.
- The seed upserts ADMIN, canonical permissions from the shared backend contract,
  and run-scoped CEDIS/branch/user. bcrypt uses cost 12. It does not issue tokens,
  reuse the development seed, seed sales, or change production auth behavior.
- Real NestJS is launched from the build output; real Vite reuses the application's
  plugins and API proxy. Both disallow reuse of existing servers. Test cwd/envDir
  avoid loading developer root/backend/frontend `.env` files. Base URL is
  configurable only as `http://127.0.0.1:<port>` to prevent targeting a live ERP.
- Four independent browser contexts: visible ADMIN login, UI logout followed by
  protected navigation, guest direct navigation, and refresh after two reloads.
  Locators use labels/roles. Responses are observed, never fulfilled/intercepted.
- Refresh is implemented without sleeps, fake time, injected tokens or expiration
  changes: `AuthProvider` stores the access token in memory and bootstraps through
  the real HttpOnly refresh cookie on reload. Assertions require refresh HTTP 200
  and the visible shell after each reload. This is not expiry/replay-attack coverage.
- Chromium only, explicit timeouts, one worker, fail-fast, zero local retries and
  one CI retry. Flaky outcomes fail CI. No GIS journeys or PAC calls.
- Failure traces can contain test credentials/cookies. Do not publish them.
  They are gitignored; CI uploads only failure trace ZIPs/screenshots for 3 days.
  Access follows repository artifact permissions. Video is off.

The separate `browser` job in `.github/workflows/quality-gate.yml` uses its own
PostGIS service, prepares the database, builds NestJS, runs both smoke passes, and
is required by `CI Gate`. Later steps do not continue after a failing smoke.
The job has been added, **not executed on GitHub in this session**.

## Validation evidence

All local npm lifecycle commands below used `OPENSSL_CONF=/dev/null` and
`npm_config_script_shell=/bin/sh` (equivalent to `--script-shell=/bin/sh`).
The default shell invocation failed; the explicit shell worked. RTK was denied
even with escalation, so diagnostics used raw commands.

| Validation | Observed result |
| --- | --- |
| `npm --prefix frontend exec -- playwright --version` | 1.63.0 |
| Chromium download | 153.0.8010.12, Playwright build 1243; final cache-lock cleanup failed EPERM |
| Chromium headless launch | FAIL: `required built-in appearance SystemAppearance not found`, including escalated retry |
| `npm run frontend:test:e2e:browser -- --list` with guarded env | `Total: 4 tests in 1 file` |
| Browser smoke launch | Exit 1 before any test: `Process from config.webServer was not able to start. Exit code: 1` |
| Immediate server cause | Missing `backend/dist/backend/src/main.js` after blocked build |
| Subsequent canonical smoke attempt | Exit 1: `EPERM: operation not permitted, rmdir 'frontend/test-results/browser'`, also with escalation; 0 tests executed |
| `npm --prefix backend run build` | EPERM cleaning `backend/dist/shared`, including escalated retry |
| `docker version` | `operation not permitted: docker`, including escalated retry |
| `prisma migrate status` on explicit disposable target | P1001 at `127.0.0.1:55439`; no DB created, migrated, seeded or cleaned |
| Frontend lint | PASS, zero warnings |
| Frontend typecheck | PASS |
| Frontend Vitest | PASS: 119 files, 600 tests; jsdom canvas warnings are not browser evidence |
| Backend typecheck | PASS |
| New backend harness ESLint | PASS, zero warnings |
| Auth service/controller/JWT guard tests | PASS: 3 suites, 19 tests |
| New disposable-boundary tests | RED then GREEN: 1 suite, 24 tests PASS; includes URL query override regression |
| Preparation `--check`, missing DB contract | Correctly rejects before DB connection/writes |
| Preparation `--check`, explicit valid test contract | PASS without DB connection/writes; TypeScript seed/helper imports compile |
| Same-DB smoke rerun | NOT_TESTED: first real-stack run is blocked |
| Git diff/status and receipt | NOT_TESTED: developer tools unavailable; no review receipt claimed |
| Workflow YAML parse and browser aggregate dependency | PASS via installed js-yaml; not a GitHub Actions run |
| npm frontend audit | 1 HIGH: browserslist; reported, not repaired in this scope |

Focused validation commands:

```bash
export OPENSSL_CONF=/dev/null npm_config_script_shell=/bin/sh
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix backend run typecheck
npm --prefix backend run test:e2e -- --runInBand --runTestsByPath test/browser-environment.e2e-spec.ts
npm --prefix backend test -- --runInBand --runTestsByPath src/modules/auth/auth.service.spec.ts src/modules/auth/auth.controller.spec.ts src/modules/auth/jwt-auth.guard.spec.ts
node scripts/forbid-exclusive-tests.mjs
# After exporting the guarded E2E environment from the runbook:
npm run frontend:test:e2e:browser -- --list
```

**Acceptance gates:** login, logout, protected route and refresh are **NOT_TESTED**,
not functional failures and not PASS. PostgreSQL/PostGIS real: **NO**; backend real:
**NO**; frontend real: **NO** for this attempted suite run. API mocks: **0**.
Test count: **4 discovered, 0 executed**. No functional ERP defect was reproduced.
The `PARTIAL` status cannot advance until both real-stack runs pass.

## Changed files and rollback boundary

Created:

- `frontend/playwright.config.ts` — guarded Chromium runner and real web servers.
- `frontend/vite.browser.config.ts` — reuse Vite configuration without dev env files.
- `frontend/e2e/auth.spec.ts` — four auth browser scenarios.
- `backend/test/browser-environment.ts` — browser-only guard on canonical contract.
- `backend/test/browser-environment.e2e-spec.ts` — safety regressions, no DB mocks.
- `backend/test/browser-database.ts` — explicit guarded migrate/status/seed CLI.
- `backend/test/browser-seed.ts` — dedicated idempotent run-scoped fixtures.
- `docs/testing/browser-e2e.md` — preflight, runbook and evidence.

Modified:

- Root `package.json` — browser aggregator with argument forwarding.
- `frontend/package.json`, `frontend/package-lock.json` — Playwright devDependency and script.
- `backend/package.json` — database preparation script.
- `frontend/vite.config.ts` — keep Playwright out of Vitest/coverage, preserve defaults.
- `frontend/tsconfig.node.json` — typecheck browser configuration and tests.
- `frontend/eslint.config.js`, `frontend/.gitignore` — exclude failure artifacts.
- `scripts/forbid-exclusive-tests.mjs` — include browser tests in existing guard.
- `.github/workflows/quality-gate.yml` — separate browser job and aggregate gate dependency.

Rollback only these additions/edits as a unit; do not discard other working-tree
changes. No production source, schema, migration, business rule or UI was changed.
Dependency installs/downloads and attempted builds also affected generated local
dependencies, browser cache and build output, not versioned application logic.

Configuration references: [Playwright webServer](https://playwright.dev/docs/test-webserver)
and [test configuration](https://playwright.dev/docs/test-configuration).
