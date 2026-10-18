# Validate the operational CEDIS demo seed

`FIX-OPERATIONAL-SEED-CEDIS` replaces direct branch purchases and destructive
recreation with parent-CEDIS supply commands and an atomic, non-destructive seed.

## Run safely

Docker must be running and backend dependencies/Prisma Client installed:

```sh
OPENSSL_CONF=/dev/null npm --prefix backend run test:seed:operational
OPENSSL_CONF=/dev/null npm --prefix backend exec tsc -- --project backend/test/tsconfig.operational-seed.json
OPENSSL_CONF=/dev/null npm --prefix backend exec tsc -- --project backend/tsconfig.build.json --noEmit --incremental false
```

On macOS, if Docker is not on PATH:

```sh
OPENSSL_CONF=/dev/null DOCKER_BIN=/Applications/Docker.app/Contents/Resources/bin/docker npm --prefix backend run test:seed:operational
```

The harness creates its own `postgis/postgis:16-3.4` container on a random
loopback port, waits for TCP readiness, applies all migrations, sets both database
URLs explicitly, and stops only its own container in `finally`. It does not use
the caller's database URL or connect to the principal application database.
The focused integration corpus is separate from the shared-database E2E corpus.
Allow time for an image download and 98 migrations on the first run.

## Expected evidence

- 12 confirmed purchases received only at active `CEDIS-VER`.
- Original quantities: 2,784 KG whole chicken, 1,392 KG breast, 6,600 wings.
- Three opening supply cycles, one for each direct branch (`VER`, `BDR`, `ALV`).
- Four exact, append-only receipts per branch; 12 supplies plus the existing
  seven downstream transfers, all confirmed through inventory services.
- 150 sales, 30 delivery orders, nine daily closes, two route settlements,
  customers, receivables and payments retained.
- No negative physical quantities or reservations; final balances agree with
  movement deltas, and reservations are fully consumed.
- A missing-coordinate supply failure rolls back purchases, balances, cycles,
  receipts and other operational rows. A real legacy partial purchase is
  rejected without changes. Completed replay returns `already-complete` and
  preserves the captured operational records exactly.

## Generation and recovery rules

Purchases keep their quantities, products and suppliers, but are dated before
the 30-day sales window to establish opening stock. Supply cycles use the first
business date. Native dispatch, reception and downstream transfer audit
timestamps/folios are service-generated; no audit timestamps are backdated.
Every branch is replenished before downstream transfers and sales execute.

All writes and service calls join one serializable transaction with a 120-second
timeout and a generator advisory lock. The transaction facade joins nested
service transaction callbacks rather than opening independent connections.
No trigger, constraint, reservation or receipt validation is disabled.
A concurrent stale transaction may fail serialization; rerun after it finishes.

The old `deleteOperationalData()` is removed. The seed never resets balances or
deletes receipts. Existing incomplete/legacy operations produce
`OPERATIONAL_SEED_PARTIAL_STATE`; they require an explicitly reviewed recovery
plan or a fresh disposable database, not automatic cleanup. Completed replay
does not refresh dates or recreate missing downstream records.

The production guard still rejects `NODE_ENV=production`. The normal
`seed:operational` command uses its configured database and is **not** a safety
harness; do not run it against real data.

## Local verification limitations

The focused PostgreSQL corpus passed after all 98 migrations. Focused TypeScript
and production TypeScript checks passed. The ordinary Nest build encountered
`EPERM` removing the existing protected `backend/dist/backend/scripts`; no
permissions were changed. Production TypeScript emission to `/private/tmp`
succeeded instead. The inclusive project TypeScript check also reports existing
errors in unrelated historical test fixtures; this task does not repair them.
No full repository CI or independent reviewer approval is claimed.
