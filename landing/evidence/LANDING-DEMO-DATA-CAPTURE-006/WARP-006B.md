> **006C continuation:** A task-owned container already exists. Do not run the
> create command below again. Use [WARP-006C.md](WARP-006C.md) for read-only
> original-manifest recovery; the 006B provisioning instructions are historical.

# Task 006B — Warp isolation handoff

**PARTIAL preparation; runtime BLOCKED awaiting Warp evidence.** Codex attempted
only `docker --version` and `docker version` for task 006B. Both failed before
client launch (`operation not permitted`, exit 127), including authorized
execution outside the sandbox. No further Docker probe or permission modification
was performed. User reports Engine/CLI 29.8.2, Desktop 4.95.0, macOS ARM64 and
`desktop-linux`; these versions were not independently verified by Codex.

## 1. Run exactly once in Warp

```sh
cd /Users/marcoszamudio/Documents/Dev/pollos-distribuidor
python3 scripts/landing_demo_006b.py create
```

Purpose: create and verify one new task-owned PostgreSQL/PostGIS container.
Side effects: may download `postgis/postgis:16-3.4`, start one container and
allocate RAM for its tmpfs database. Uses the repository harness image under
explicit `linux/amd64` emulation on ARM, which may be slower and is not a claim
of native ARM support. No dependency installation or host-permission change.

Safety controls:
- Explicit `desktop-linux` context; its Docker endpoint must be a local Unix socket.
- New UUID container/database and run label; no existing name or database reused.
- Ephemeral port bound only to `127.0.0.1`; no host directories or persistent
  volumes mounted. Only `/var/lib/postgresql/data` tmpfs accepted.
- No auto restart, deletion, cleanup, migration, seed or backend startup.
- Exact container ID/name/label/image/running state/binding checked.
- Newly constructed DATABASE_URL verified against exact database/user/secret/port;
  inherited DATABASE_URL is never used. No query parameters or remote host allowed.
- Read-only SQL confirms current database/user and PostGIS version after startup.
- Credentials generated privately under a mode-0700 temporary directory;
  private files created exclusively with mode 0600. No credentials in stdout.

Database initialization writes only to the newly created tmpfs resource. The
script performs no application writes and never calls the existing operational
seed. It rejects unknown identity instead of trying to repair it.

**Do not stop or restart this container during the capture session:** tmpfs data
will be lost. Do not rerun `create` as a retry: it intentionally creates another
exclusive resource. On failure retain the printed private directory and report
the failure. No automatic removal is attempted. After a successful run,
`isolation.json` contains safe evidence; `state.json`, `created.json`,
`postgres.env` and `connection.env` are PRIVATE and must not be pasted or committed.

Expected success: JSON with `gate: ISOLATION_VERIFIED_NO_APP_WRITES`, task-owned
container/database/binding and `migrations: NOT_RUN`, `seed: NOT_RUN`, followed by
`PRIVATE_STATE_DIRECTORY=...`. Send only this terminal output back to Codex;
never send the private files or DATABASE_URL. Success here proves isolation,
not application readiness, stock integrity or capture approval.

## 2. Recheck before any later migration or application write

Use the exact directory printed by `create` (replace the placeholder, not a glob):

```sh
python3 scripts/landing_demo_006b.py verify /tmp/landing-demo-006b-REPLACE_WITH_PRINTED_DIRECTORY
```

Purpose: fresh read-only identity verification. Safety: a foreign container,
wrong database/URL/port, external binding, remote Docker endpoint, mounted volume,
or stopped container prevents SQL verification/continuation.

**Stop after isolation verification in this handoff.** No migration command is
provided for an unverified resource. After the returned evidence is reviewed,
continue with a guarded launcher passing the exact verified URL to migration
and application child processes, avoiding root/backend `.env` loading and raw
Prisma error logging. `verify` alone is not a permanent authorization: the actual
writer must recheck and use the same bound URL, not a separately sourced shell
variable. Private runtime state is not a secret-manager replacement.

## 3. Synthetic scenario prepared, not executed

Reuse `seed.ts` catalog/location definitions and canonical role definitions;
do not execute its default development identities blindly. Use dedicated demo
users (seller/warehouse/collections), private random credentials, explicit
location access and a plainly synthetic company/customer identity.

| Order | Real operation | Intended demo data / check |
| --- | --- | --- |
| 1 | Create master data | Whole chicken KG, breast KG, wings PIECE; CEDIS Veracruz and VER branch. No global stock. Synthetic customer `Cliente Demo Veracruz 006B`, contact domain `example.test`; no real phone needed. |
| 2 | Purchase through PurchasesService | Proposed synthetic receipt: 120 kg whole chicken, 60 kg breast, 200 wings at CEDIS. Use `POST /api/purchases`, validated DTO and unique idempotency key; verify returned state and movements, not a direct CONFIRMED fixture. |
| 3 | Supply via existing CEDIS/transfer services | Proposed 40 kg whole, 20 kg breast, 80 wings to VER; confirm using the legitimate service flow. Expected CEDIS after transfer: 80 kg, 40 kg, 120 pieces; branch: 40 kg, 20 kg, 80 pieces, absent other operations. No fake reception/arrival. |
| 4 | Cash terminal/shift through real cash workflow | Valid device-bound terminal, actor and location; open shift through service/UI. Do not bypass warnings by editing data or pixels. |
| 5 | Explicit scenario cash/credit transactions | Prepare known real demo transactions for activity, recording IDs/amounts/payments. The particular transaction set must be validated against effective policy and stock before execution. Every collection payment maps to one receivable. Never confirm the screenshot cart. |
| 6 | Optional reserved order | Use the legitimate SalesService reservation flow only if eligible; read actual reserved stock back. Zero reserved quantities are preferable to invented commitments. |
| 7 | Capture inventory first | Read `/api/inventory/balances` for CEDIS and VER; reconcile physical totals to movement ledger, reserved quantities to active commitments and available = physical minus reserved for each unit. Capture genuine InventoryByLocationView. |
| 8 | Capture dashboard | Same-day activity read from actual created transactions; scoped demo user, no development identity, no invented KPI. |
| 9 | Capture POS | Open valid shift, demo customer, KG/piece cart; prepare 2.5 kg whole and 6 wings only as an unconfirmed cart, subject to available stock. No audit products. |

Amounts are proposed fixtures, NOT observations or accepted balances. No delivery
photo, GPS, signature, route completion or close difference is fabricated.

### Reuse boundary from fresh source audit

`seed-guard.ts` only rejects production; it does not prove isolation.
`seed.operational.ts` directly creates CONFIRMED purchases/sales, final delivery
states (`seedDeliveryOrders`) and REVIEWED formula-based closes
(`seedDailyCloses`). These are test fixtures, not acceptable workflow evidence.
Reuse master definitions and service-backed CEDIS/transfer patterns, not final
operational rows. No operational seed edits or execution took place.

Existing `backend/test/browser-database.ts` also runs migration plus its browser
seed. It is NOT the launcher for this task: its environment requires a different
DB-name contract and Object Storage configuration. Do not bypass that guard or
rename this task DB merely to force the unrelated fixture pipeline to run.

## 4. Capture and integration gates

Backend/frontend are not running for this new scenario. After fresh isolation,
migration and service-driven data preparation succeed, inspect the genuine UI
with Playwright: Inventory, Dashboard, POS (desktop), then meaningful mobile
frames. Preserve private originals with resolution/time/module/origin/SHA-256;
review all visible errors and sensitive fields before approving any derivative.
No code-built screenshots, edited values or hidden warnings. Only APPROVED assets
may enter the existing landing registry, preserving ten modules, six stages and
current design. New APPROVED/REJECTED captures: zero. All three scenarios BLOCKED.

## 5. Verification of this preparation

```sh
python3 -m unittest discover -s scripts/tests -p test_landing_demo_006b.py
python3 scripts/landing_demo_006b.py --help
git diff --check
```

11 offline tests pass: exact identity, foreign ID/label/name/image, public binding,
foreign URL/database/port, mounted volume, stopped container, remote context,
private-file permissions/exclusive creation, and invalid identity stopping before
SQL. These are guards exercised with synthetic/mocked inputs, NOT live Docker or
PostGIS proof. Initial RED was missing implementation; a further RED exposed
unsupported Path.open(opener=...) and was fixed using exclusive os.open + fdopen.
No real provisioning or migration was attempted by these tests.

Landing application source/assets unchanged by 006B. Task 006's earlier 53-test,
lint, typecheck and build results remain historical; not rerun as fresh visual
proof. Browser, backend, migrations, data integrity and capture matrix NOT RUN.

Verdicts: DEMO_ENV_GO **BLOCKED pending Warp isolation**;
DATA_INTEGRITY_GO **BLOCKED**; ASSET_QUALITY_GO **BLOCKED**;
VISUAL_GO **NOT VERIFIED**. No commit, push, merge or cleanup performed.
