# Next step — schema migration of the verified original demo database

**Prerequisite met:** user-operated Warp resume returned
`ISOLATION_VERIFIED_NO_APP_WRITES` for the original full ID, database and loopback
port 63865, PostGIS 3.4. Evidence is `resume-006c-result.json`. This is supplied
live host evidence, not direct Codex runtime verification. No seed has run.

## Execute in Warp

This command writes schema/migration history only to the original demo database.
It does not create another container, reset any database or execute a seed.

```sh
cd /Users/marcoszamudio/Documents/Dev/pollos-distribuidor
python3 scripts/landing_demo_006b.py migrate \
  /tmp/landing-demo-006b-06x847f7 \
  --expected-container 5ca2b7a0aa96fffcd24f8c4db0b952cd106401219adcd1e52f556155a9b05363 \
  --expected-port 63865 \
  --confirm-migrations
```

Purpose: run the repository's real Prisma `migrate deploy`, then `migrate status`.
The same original-manifest/container/URL/SQL guard runs before staging and again
immediately before each child process. Only an identical verified in-memory
connection is passed to the child, never an inherited DATABASE_URL.

Safety and side effects:
- Uses only the original container, expected full ID and port; stops on mismatch.
- Copies only schema.prisma, migration_lock.toml and versioned migration.sql files
  to a new private staging directory, with a SHA-256 source manifest. Original
  repository files and private created.json are not changed.
- A standalone package/cwd and staged schema avoid normal discovery of the root
  or backend `.env` alongside repository schema. No environment file is copied.
  Child environment is allowlisted; npm user/global config paths point to distinct
  absent files in the private stage instead of user settings.
- Runs npm exec with explicit backend prefix, offline mode, installation consent
  disabled and lifecycle scripts disabled. No dependency installation is authorized;
  missing local tooling blocks execution.
- Captures raw Prisma stdout/stderr in memory; publishes only exit outcome and
  allowlisted Prisma P-number on failure, never DSN/password/raw SQL/error text.
- Migration execution has a ten-minute limit per phase. A failed/timed-out
  migration may be partially applied. Stop; do not retry/reset/resolve or clean up
  automatically. The private stage/source manifest is preserved for inspection.
- No seed, start of ERP processes, public asset edit, container stop or deletion.

Expected success: `gate: MIGRATIONS_DEPLOYED_NO_SEED`,
`migrations: DEPLOY_AND_STATUS_PASS`, `seed: NOT_RUN` and the original identity.
Send only sanitized terminal output. Do not send private state, DATABASE_URL or
raw Prisma logs. Preserve the running tmpfs container.

## Verification boundary

21 offline tests pass, including migration guard before subprocess, schema-only
staging without `.env`, environment/command secret separation, sanitized failures,
rechecks before both phases and no retry/status after failed deploy. Initial new
migration tests were RED before implementation. These tests mock host tools;
they do not prove installed npm/Prisma execution or migration compatibility.

The migrate action is separate from read-only resume. A successful resume does
not itself apply migrations. Actual migration result is still pending Warp.
Backend/frontend startup, service-driven demo fixtures and capture approval remain
pending after schema acceptance. Do not run seed:operational for image preparation.
