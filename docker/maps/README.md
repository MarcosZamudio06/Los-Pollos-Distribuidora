# Self-hosted map services

The development `maps` Docker profile and the production Compose contract
provide PostGIS, Photon, OSRM, VROOM, and a pinned TileServer GL without
exposing private map services to the host network. Production uses the same
service contracts without a `maps` profile; only migration and bootstrap are
one-shot profile services.

## Dataset refresh safety

Dataset preparation can replace directories that are bind-mounted into the
runtime containers. **Never run `prepare-all.sh` while Photon, OSRM, or
TileServer GL are consuming their active datasets.** Every refresh requires a
maintenance window.

Use this order for a refresh:

```bash
docker compose --profile maps stop backend vroom photon osrm tileserver
./scripts/maps/prepare-all.sh
docker compose --profile maps up -d --force-recreate \
  photon osrm vroom tileserver backend
./scripts/maps/verify-stack.sh
```

For the single-host production Compose, set `COMPOSE_FILE` before using these
scripts so their `docker compose` calls target the production file:

```bash
COMPOSE_FILE=docker-compose.production.yml docker compose stop \
  backend vroom photon osrm tileserver
COMPOSE_FILE=docker-compose.production.yml ./scripts/maps/prepare-all.sh
COMPOSE_FILE=docker-compose.production.yml docker compose up -d --force-recreate \
  photon osrm vroom tileserver backend
COMPOSE_FILE=docker-compose.production.yml ./scripts/maps/verify-stack.sh
```

PostgreSQL is not stopped by this flow. Do not delete `node.lock` manually:
it belongs to OpenSearch and must be managed by Photon/OpenSearch.

## Quick path

1. On initial provisioning, before the services start, prepare the Mexico
   datasets:

   ```bash
   ./scripts/maps/prepare-all.sh
   ```

2. Start the disposable/dev stack required by the browser-facing smoke:

   ```bash
   docker compose --profile maps up -d \
     postgres photon osrm vroom tileserver migrate backend frontend
   docker compose --profile maps ps
   ```

   The command includes backend and frontend because the official rendering
   path is frontend Nginx -> /maps/** -> TileServer GL. Starting only the map
   profile services cannot prove that browser-facing path. The frontend also
   waits for the backend health contract defined by Compose.

3. Verify the stack through the frontend:

   ```bash
   ./scripts/maps/verify-stack.sh
   ```

   verify-stack.sh must be able to reach
   http://127.0.0.1:${FRONTEND_PORT:-3000}/maps/health; it never replaces
   that request with a direct TileServer URL.

4. Run the branch registration smoke only against a disposable/dev/test
   installation:

   ```bash
   SMOKE_DISPOSABLE=true \
   SMOKE_ENV=dev \
   SMOKE_BASE_URL=http://127.0.0.1:${FRONTEND_PORT:-3000} \
   SMOKE_ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL}" \
   SMOKE_ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD}" \
   ./scripts/maps/smoke-branch-create.sh
   ```

   The script authenticates through the frontend HTTP entry point, creates a
   unique branch under an active CEDIS, verifies the catalog relationship and
   location fields, prints only IDs and result status, and optionally
   deactivates the disposable branch. It never creates inventory.

5. For a production single-host deployment, prepare the datasets first, run
   the one-shot migration and bootstrap jobs, then start the complete local
   stack:

   ```bash
   export COMPOSE_FILE=docker-compose.production.yml
   docker compose config >/dev/null
   docker compose --profile migration run --rm migrate
   docker compose --profile migration run --rm bootstrap
   docker compose up -d postgres photon osrm vroom tileserver backend frontend
   docker compose ps
   ./scripts/maps/verify-stack.sh
   ./scripts/maps/smoke-route.sh
   ```

## Services

| Service | Internal URL          | Data source                        |
| ------- | --------------------- | ---------------------------------- |
| Photon  | `http://photon:2322`  | GraphHopper Photon Mexico database |
| OSRM    | `http://osrm:5000`    | Geofabrik Mexico OSM extract       |
| VROOM   | `http://vroom:3000`   | OSRM `driving` profile             |
| TileServer GL | `http://tileserver:8080` | Mexico PMTiles and OSM Bright style |
| PostGIS | PostgreSQL connection | `postgis/postgis:16-3.5-alpine`    |

Datasets are stored under `.map-data/`, which is intentionally ignored by Git.
Downloads are checksum-verified and prepared in a staging directory before
replacing the active dataset. The preparation guards abort if Docker confirms
that the corresponding runtime consumer is still running.

## Configuration

| Variable              | Default                    | Purpose                                                                     |
| --------------------- | -------------------------- | --------------------------------------------------------------------------- |
| `MAP_DATA_DIR`        | `./.map-data`              | Host directory for Photon and OSRM data                                     |
| `MAP_DOCKER_PLATFORM` | `linux/amd64`              | Deterministic GIS image platform, including Apple Silicon through emulation |
| `PHOTON_DATA_URL`     | Mexico Photon 1.0 database | Override Photon dataset                                                     |
| `OSM_PBF_URL`         | Geofabrik `mexico-260812.osm.pbf` | Override the pinned Mexico extract used for rendering and OSRM preparation |
| `PHOTON_VERSION`      | `1.2.1`                    | Photon server version                                                       |
| `OSRM_VERSION`        | `v5.27.1`                  | OSRM server version                                                         |
| `VROOM_VERSION`       | `v1.15.0`                  | VROOM server version                                                        |
| TileServer GL image   | `maptiler/tileserver-gl:v5.6.0` | Pinned runtime image; do not override with a floating tag                 |
| `PLANETILER_IMAGE`   | `ghcr.io/onthegomap/planetiler:v0.10.2` | Pinned rendering generator |
| `OSM_PBF_SHA256`     | empty                    | Optional required SHA-256 for the Geofabrik extract                         |

Rendering artifacts are prepared explicitly by
`./scripts/maps/prepare-rendering.sh`. It writes `mexico.pmtiles`, fonts, and
`manifest.json` under `.map-data/rendering/`; the manifest records dataset
source/version/hash, generator, schema, style revision, renderer, and
attribution. The committed style and sprite metadata live under
`docker/maps/styles/operations/` and licenses under `docker/maps/licenses/`.

Refresh datasets only during a maintenance window. Stop all map consumers,
prepare the replacement, recreate the affected services, and verify the stack
before reopening traffic. The scripts retain the active dataset until the
replacement has downloaded, validated, and finished preprocessing; they never
manage service lifecycle automatically.

## Rollout order

Deploy in this order so historical textual routes remain available throughout the rollout:

1. Prepare and start PostGIS, Photon, OSRM, VROOM, TileServer GL, backend, and
   frontend from `docker-compose.production.yml`. The frontend is required
   even when the goal is only a rendering smoke because it owns the
   browser-facing /maps/ proxy.
2. Run `./scripts/maps/verify-stack.sh`; it checks style version, vector source,
   attribution, derived sprite/glyph resources, TileJSON, and a representative
   Veracruz tile through the frontend same-origin proxy.
3. Apply the compatible database migration.
4. Deploy the backend with `MAP_DATA_VERSION`, `MAP_DATA_PREPARED_AT`, and the
   private `MAP_TILES_URL` health target.
5. Deploy the frontend with
   `VITE_MAP_STYLE_URL=/maps/styles/operations/style.json` only after backend
   and TileServer health checks are green.
6. Run `./scripts/maps/smoke-route.sh` before gradual enablement. Run
   `./scripts/maps/smoke-branch-create.sh` only in a separate disposable
   dev/test environment; it requires `SMOKE_DISPOSABLE=true` and must not
   target production.

The smoke test uses a controlled closed route through Veracruz, Boca del Rio, and Alvarado. It checks that OSRM returns road geometry, distance, and duration. It does not create application records.

## Monthly renewal

Run during a maintenance window:

```bash
./scripts/maps/refresh-monthly.sh
```

The refresh stops backend, VROOM, Photon, OSRM, and TileServer GL before
preparing data, stages and validates replacement data before activation,
recreates only the map services and backend, then executes health and
controlled-route smoke checks. It does not stop PostgreSQL. Persist the printed
`MAP_DATA_VERSION` and `MAP_DATA_PREPARED_AT` values in the deployment
configuration. Existing routes keep their original `routingDataVersion`; they
are never rewritten during a dataset refresh.

The ADMIN route control page reads `GET /api/delivery-routing/technical-status`. It reports PostGIS, Photon, VROOM, OSRM, optional `MapTiles`, `routingDataVersion`, Fleet persistence, and the aggregate age of the newest persisted vehicle position without exposing internal service URLs or personal data. MapLibre style configuration remains frontend-only through `VITE_MAP_STYLE_URL`.

## Boundaries

- Dataset preparation is explicit and never runs during normal application startup.
- In production, PostGIS, Photon, OSRM, VROOM, and TileServer GL have no host
  ports. The frontend binds only to `127.0.0.1` for the host Caddy entry point;
  its Nginx is the only browser-facing gateway for `/maps/`. NestJS is the only
  application consumer of Photon, OSRM, and VROOM, and VROOM reaches OSRM via
  the internal `osrm` DNS name.
- The official smoke path is browser-facing: frontend Nginx, then /maps/**,
  then TileServer GL. A direct request to tileserver:8080 is not rendering
  evidence.
- Production never falls back to `tile.openstreetmap.org`; an unavailable
  renderer leaves the manual/textual location workflow enabled.
- PostGIS schema migrations are applied by the explicit migration job; backend
  provider adapters remain the only application consumers of the private map
  services.
- GPS snapshots and Socket.IO deltas are recoverable from PostgreSQL; Socket.IO
  memory is never the source of truth.
