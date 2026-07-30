# Backend deployment

## Release sequence

1. Build and publish the backend image once. Set `BACKEND_IMAGE` to its
   immutable digest for both `migrate` and `backend`.
2. Apply migrations as the only migration job:

```bash
docker compose -f docker-compose.production.yml --profile migration run --rm migrate
```

3. Stop the release if the job exits unsuccessfully. Do not restart, replace,
   or scale backend replicas after a failed migration.
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
