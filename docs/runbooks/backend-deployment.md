# Backend deployment

## Quick path: first production deployment

Use the following order for a new or migrated production database. The
bootstrap job is one-shot and runs only after migrations complete successfully.

1. Set the regular required production environment. Do not set
   `SEED_ADMIN_PASSWORD` in an environment file used by the long-lived
   services. The bootstrap password is supplied only to its one-shot command,
   must be nonblank and at least 10 characters, and must not be printed,
   committed, or included in logs.
2. Validate Compose interpolation without starting services:

   ```bash
   docker compose -f docker-compose.production.yml config >/dev/null
   ```

3. Apply migrations:

   ```bash
   docker compose -f docker-compose.production.yml --profile migration run --rm migrate
   ```

4. Create the operational baseline:

   ```bash
   (
     read -r -s -p 'SEED_ADMIN_PASSWORD (minimum 10 characters): ' SEED_ADMIN_PASSWORD
     printf '\n'
     export SEED_ADMIN_PASSWORD
     docker compose -f docker-compose.production.yml --profile migration run --rm bootstrap
   )
   ```

5. Stop if either one-shot job fails. Only then deploy the long-lived backend
   and frontend services.

The bootstrap creates or reconciles the production roles, permissions,
role-permission links, main CEDIS, main branch, and administrator. It does not
run the development Prisma seed.

## Verify postconditions safely

Use read-only queries through the managed PostgreSQL console or an approved
database client. Never select or display `passwordHash`, session tokens, or the
bootstrap secret. Confirm the operational baseline with queries such as:

```sql
SELECT
  u.email,
  u."controlNumber",
  u."isActive",
  u."mustChangePassword",
  u."sessionVersion",
  r.name AS role_name,
  l.code AS operational_location_code,
  l.type AS operational_location_type
FROM "User" u
JOIN "Role" r ON r.id = u."roleId"
JOIN "OperationalLocation" l ON l.id = u."operationalLocationId"
WHERE u.email = 'admin@pollos.local';

SELECT
  branch.code AS branch_code,
  branch.type AS branch_type,
  branch."isActive" AS branch_is_active,
  cedis.code AS cedis_code,
  cedis.type AS cedis_type,
  cedis."isActive" AS cedis_is_active
FROM "OperationalLocation" branch
JOIN "OperationalLocation" cedis ON cedis.id = branch."parentId"
WHERE branch.code = 'MAIN' AND cedis.code = 'MAIN-CEDIS';

SELECT
  r.name AS role_name,
  COUNT(rp."permissionId") AS assigned_permission_count
FROM "Role" r
LEFT JOIN "RolePermission" rp ON rp."roleId" = r.id
WHERE r.name IN ('ADMIN', 'SELLER', 'WAREHOUSE', 'DRIVER', 'COLLECTIONS', 'BILLING')
GROUP BY r.name
ORDER BY r.name;
```

Treat the baseline as verified only when the first query returns the
administrator with `role_name = ADMIN` and `operational_location_code = MAIN`,
the second returns the active `MAIN` branch linked to the active `MAIN-CEDIS`,
and the third returns one row per expected role with its observed permission
link count. The queries do not disclose password or session secrets.

## Rerun versus explicit administrator rotation

A normal bootstrap rerun is idempotent and preserves the existing
administrator's `passwordHash`, `mustChangePassword`, and `sessionVersion`.
Use it to reconcile missing operational data without changing credentials:

```bash
(
  read -r -s -p 'SEED_ADMIN_PASSWORD (minimum 10 characters): ' SEED_ADMIN_PASSWORD
  printf '\n'
  export SEED_ADMIN_PASSWORD
  docker compose -f docker-compose.production.yml --profile migration run --rm bootstrap
)
```

Changing `SEED_ADMIN_PASSWORD` alone does not rotate an existing administrator.
For an intentional credential reset, use the separate explicit route and record
the operational change outside the secret value:

```bash
(
  read -r -s -p 'SEED_ADMIN_PASSWORD (minimum 10 characters): ' SEED_ADMIN_PASSWORD
  printf '\n'
  export SEED_ADMIN_PASSWORD
  docker compose -f docker-compose.production.yml --profile migration run --rm bootstrap npm run bootstrap:production:rotate-admin
)
```

The separate package script invokes `--rotate-admin-password`; do not append
that flag to the normal bootstrap command.

The explicit route writes the new password hash, sets `mustChangePassword`,
increments `sessionVersion`, and revokes active sessions. It is the only
bootstrap route that changes `passwordHash`. Verify only the non-secret
postconditions above after it completes.

## Required routing providers

Production requires backend-reachable managed endpoints for Photon, VROOM, and
OSRM. Set `PHOTON_URL`, `VROOM_URL`, and `OSRM_URL` before rendering or starting
the production Compose project. `ROUTING_TIMEOUT_MS` is optional and defaults to
10 seconds.

The production Compose file rejects missing provider URLs during interpolation,
before starting a backend that cannot finish NestJS bootstrap. Do not use
`localhost` unless the provider runs inside the backend container itself.

Validate the complete environment before a release:

```bash
docker compose -f docker-compose.production.yml config >/dev/null
```

## Fleet geospatial runtime configuration

The backend owns the private Photon, VROOM, and OSRM URLs. They are never
copied into a `VITE_*` variable or returned by the browser-facing API. The
frontend receives only the public MapLibre style URL through
`VITE_MAP_STYLE_URL`; production image builds fail when it is missing.

Set and validate these bounded values before a release:

| Variable | Default | Contract |
| --- | ---: | --- |
| `FLEET_POSITION_STALE_SECONDS` | `60` | Positive seconds used by the backend to mark a live position stale. |
| `FLEET_POSITION_FUTURE_TOLERANCE_SECONDS` | `300` | Positive seconds accepted for device clock skew. |
| `FLEET_ANALYTICS_MAX_RANGE_DAYS` | `31` | Maximum historical heatmap range. |
| `FLEET_POSITION_RETENTION_DAYS` | `365` | Positive days kept online; the daily Fleet job purges only unreferenced positions older than this window. |
| `RATE_LIMIT_FLEET_POSITION_MAX` | `60` | Per-driver position publications per minute; normal 10-second tracking remains below this limit. |
| `ROUTING_TIMEOUT_MS` | `10000` | Positive provider timeout, capped at 120000 ms. |
| `MAP_DATA_VERSION` | — | Required production routing dataset version. |
| `MAP_DATA_PREPARED_AT` | — | Optional ISO timestamp; omit only when freshness is intentionally unknown. |

The Socket.IO namespace is `/fleet` on the existing `/api/socket.io` path.
The frontend proxy must preserve `Upgrade` and `Connection: upgrade`; no
additional WebSocket port is deployed. A disconnected socket is not a source
of truth: the frontend keeps its last REST snapshot and performs one
`GET /api/fleet/live` reconciliation after reconnecting.

## Release sequence

1. Build and publish the backend image once. Set `BACKEND_IMAGE` to its
   immutable digest for both `migrate` and `backend`.
2. Apply migrations as a separate deployment job:

```bash
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
```

3. Run the bootstrap job from the quick path after a successful migration. Stop
   the release if either one-shot job exits unsuccessfully.
4. Deploy backend replicas gradually and wait for `GET /api/health/ready` to
   return HTTP 200 before routing traffic to each replica.
5. Deploy frontend after the backend rollout is ready.

## Health probes

- Liveness: `GET /api/health/live` proves only that the process responds.
- Startup: `GET /api/health/startup` proves NestJS bootstrap completed.
- Readiness: `GET /api/health/ready` proves the instance is bootstrapped,
  connected to PostgreSQL, and not draining.

Docker Compose maps its single healthcheck to readiness. An orchestrator with
separate probes must map startup, liveness, and readiness to their matching
endpoints.

## Graceful termination

1. Remove the instance from traffic using readiness before termination.
2. Send `SIGTERM` and allow at least 75 seconds for in-flight requests and the
   longest configured transaction to complete.
3. Do not force-kill the process unless the termination grace period expires.

NestJS marks the instance as draining while processing the termination signal,
closes HTTP listeners, then Prisma disconnects after application shutdown.

## Failed migration recovery

Inspect the migration state before another deployment. Roll back manually when
safe, or complete the change and use `prisma migrate resolve` to mark the
migration as rolled back or applied. Record the incident and run the migration
job again only after the database state is known.

## Schema compatibility

Use expand/contract: expand schema first, deploy dual-compatible code, run
idempotent backfills outside startup, verify consumers, then contract in a
later release. Do not combine destructive changes with the first release that
uses a new schema shape.
