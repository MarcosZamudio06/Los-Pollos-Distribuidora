# Backend deployment

## Quick path: first production deployment

Use the following order for a new or migrated single-host production database.
The production Compose provisions PostGIS and the private routing services on
the same `app_network`. The bootstrap job is one-shot and runs only after
migrations complete successfully.

1. Set the regular required production environment, including
   `POSTGRES_PASSWORD`. Do not set
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

5. Stop if either one-shot job fails. Only then deploy the complete long-lived
   stack:

   ```bash
   docker compose -f docker-compose.production.yml up -d \
     postgres photon osrm vroom tileserver backend frontend
   ```

The bootstrap creates or reconciles the production roles, permissions,
role-permission links, main CEDIS, main branch, and administrator. It does not
run the development Prisma seed.

## Verify postconditions safely

Use read-only queries through the local PostGIS container or an approved
database client. Never select or display `passwordHash`, session tokens, or the
bootstrap secret. Confirm the operational baseline with queries such as:

```bash
docker compose -f docker-compose.production.yml exec -T postgres \
  psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-pollo_distribucion}"
```

Then run the following SQL through that connection:

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

Production uses the Architecture A single-host contract. PostGIS, Photon,
OSRM, VROOM, TileServer GL, backend, and frontend are services in
`docker-compose.production.yml` and share `app_network`. The backend uses only
the following Docker DNS names:

| Variable | Production value |
| --- | --- |
| `DATABASE_URL` | `postgresql://...@postgres:5432/...` |
| `PHOTON_URL` | `http://photon:2322` |
| `OSRM_URL` | `http://osrm:5000` |
| `VROOM_URL` | `http://vroom:3000` |
| `MAP_TILES_URL` | `http://tileserver:8080` |

Do not set or override these provider/database URLs with managed endpoints,
public APIs, or `localhost`. Compose owns the internal values so the backend,
VROOM, and the migration job cannot accidentally leave `app_network`.

`ROUTING_TIMEOUT_MS` is optional and defaults to 10 seconds. Validate the
complete environment before a release:

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

The complete image and environment contract is in
[`production-release.md`](./production-release.md). Run the separate Release
Images workflow after CI Gate and copy its digest artifact into the production
environment before following these database steps.

1. Set `BACKEND_IMAGE` to the release's immutable digest. Compose uses that
   exact reference for `migrate`, `bootstrap`, and `backend`; it never builds a
   production application image on the VPS.
2. Apply migrations as a separate deployment job against local PostGIS:

```bash
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
```

3. Run the bootstrap job from the quick path after a successful migration. Stop
   the release if either one-shot job exits unsuccessfully.
4. Deploy the backend service and wait for `GET /api/health/ready` to return
   HTTP 200. Compose gates backend startup only on PostGIS; GIS and Object
   Storage are observed through `/api/health/dependencies` so a map outage does
   not take core ERP traffic offline.
5. Deploy the frontend after the backend rollout is ready. Only the frontend
   binds a host port, and that port is fixed to `127.0.0.1` for Caddy.

## Health probes

- Liveness: `GET /api/health/live` proves only that the process responds.
- Startup: `GET /api/health/startup` proves NestJS bootstrap completed.
- Readiness: `GET /api/health/ready` proves the instance is bootstrapped,
  connected to PostgreSQL, and not draining. It intentionally does not require
  Photon, OSRM, VROOM, TileServer GL, or Object Storage.
- Dependency health: `GET /api/health/dependencies` reports bounded probes for
  PostgreSQL, Photon, OSRM, VROOM, TileServer GL, and Object Storage without
  returning internal URLs, credentials, buckets, or stack traces.

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

## PostgreSQL/PostGIS disaster recovery

PostgreSQL is private to Docker and must be protected outside the VPS. The
host systemd timer runs the custom-format dump and B2 upload flow documented in
[`postgres-backup-b2.md`](./postgres-backup-b2.md). Run a restore drill before
production cutover and after credential or schema changes; never use the drill
target as a production restore target.

## Docker log rotation and restart policy

Production long-lived services use bounded `json-file` logs and
`restart: unless-stopped`; the migration and bootstrap jobs remain
`restart: "no"` one-shot commands. Configure `DOCKER_LOG_MAX_SIZE` and
`DOCKER_LOG_MAX_FILE` in the runtime environment and follow the host daemon,
frontend healthcheck, and recovery procedure in
[`docker-operations.md`](./docker-operations.md).
