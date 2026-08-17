# Production Docker operations

The production Compose contract keeps the single-host stack recoverable without
allowing Docker logs to grow without bound. Long-lived services use the same
bounded `json-file` policy and `unless-stopped` restart policy. The migration
and bootstrap jobs remain explicit one-shot commands. Container UID,
capability, rootfs, and writable-mount decisions are documented in
[`container-hardening.md`](./container-hardening.md).

## Quick path

1. Set the production environment, including the optional log limits:

   ```text
   DOCKER_LOG_MAX_SIZE=10m
   DOCKER_LOG_MAX_FILE=5
   ```

2. Render the final Compose contract before deployment:

   ```bash
   docker compose -f docker-compose.production.yml config >/dev/null
   ```

3. Run migration and bootstrap explicitly, then start only the long-lived
   services through the deployment runbook.
4. Verify the rendered logging, restart, health, and port contracts:

   ```bash
   docker compose -f docker-compose.production.yml ps
   docker compose -f docker-compose.production.yml logs --tail=100 frontend backend
   ```

## Log rotation

`docker-compose.production.yml` defines one reusable logging anchor:

| Setting               | Default | Meaning                                   |
| --------------------- | ------- | ----------------------------------------- |
| `DOCKER_LOG_MAX_SIZE` | `10m`   | Maximum size of one JSON log file.        |
| `DOCKER_LOG_MAX_FILE` | `5`     | Number of rotated files kept per service. |

The anchor is applied to `postgres`, `backend`, `frontend`, `object-storage`,
`photon`, `osrm`, `vroom`, and `tileserver`. With the defaults, the configured
upper bound is approximately 400 MiB across those eight services, excluding
small filesystem overhead. Compose applies the service-level setting even
when the host daemon has a different default. Do not remove either limit or
replace `json-file` with an unbounded driver.

The `migrate` and `bootstrap` services are deliberately excluded because they
are one-shot jobs. Their output is available from the explicit command that
ran them and they must not become a permanently restarting workload.

## Host daemon recommendation

On Ubuntu, the host administrator may set the same safe default in
`/etc/docker/daemon.json` for containers that do not declare a service-level
policy:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
```

This file is host configuration and is intentionally not committed here. The
Compose service-level values remain authoritative for this application. After
changing `daemon.json`, validate it and restart Docker during a maintenance
window; existing containers may need to be recreated before they inherit a
new daemon default.

## Restart and frontend health

Every long-lived production service uses `restart: unless-stopped`:

- PostgreSQL/PostGIS, SeaweedFS, Photon, OSRM, VROOM, TileServer GL;
- backend and frontend.

The `migrate` and `bootstrap` jobs use `restart: "no"` and are run with
`--profile migration run --rm`. A failed one-shot job must be investigated,
not hidden by a restart loop.

The frontend healthcheck runs inside the Nginx container and requests
`http://127.0.0.1:3000/` with BusyBox `wget`. It proves that Nginx is actually
serving HTTP, does not contact Internet, Cloudflare, or Caddy, and publishes
no additional port. `depends_on` still controls startup ordering; health is a
separate signal from the restart policy.

## Recovery check

Run this on a maintenance or disposable deployment after the image is built:

```bash
docker compose -f docker-compose.production.yml exec -T frontend sh -c 'kill -9 1' || true
for attempt in 1 2 3 4 5 6; do
  state="$(docker inspect --format '{{.State.Status}} {{.State.Health.Status}}' \
    "$(docker compose -f docker-compose.production.yml ps -q frontend)")"
  printf 'frontend: %s\n' "$state"
  case "$state" in
    'running healthy') break ;;
  esac
  sleep 5
done
docker compose -f docker-compose.production.yml ps frontend
```

The expected result is a newly running frontend with a healthy local HTTP
probe. The same policy starts the container again after a Docker daemon restart
or host reboot unless an operator intentionally stopped it. Verify the
post-reboot result with `docker compose ps`; do not use `docker compose start`
as a substitute for testing the restart policy. `docker compose stop` and
`docker compose kill` are intentional operator stops; `unless-stopped` keeps
them stopped, so they are not process-crash tests.

## Port boundary

The logging and restart changes do not publish ports. Production keeps only
the intentional loopback bindings:

- frontend: `127.0.0.1:3000:3000`;
- object storage: `127.0.0.1:8333:8333`.

PostgreSQL, backend, Photon, OSRM, VROOM, and TileServer remain private on
`app_network` and are reached through Docker DNS or the host-side Caddy path.

## Resource guardrails

CPU/RAM limits, Photon and Node heaps, GIS preprocessing limits, the shared
preprocessing lock, and the measurement checklist are documented in
[`resource-limits.md`](./resource-limits.md). Apply those limits independently
from log rotation and recreate only the services whose resource settings
changed.
