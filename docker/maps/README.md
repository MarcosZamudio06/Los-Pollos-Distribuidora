# Self-hosted map services

The `maps` Docker profile provides PostGIS, Photon, OSRM, VROOM, and a pinned
TileServer GL without exposing private map services to the host network.

## Quick path

1. Prepare the Mexico datasets:

   ```bash
   ./scripts/maps/prepare-all.sh
   ```

2. Start the services:

   ```bash
   docker compose --profile maps up -d postgres photon osrm vroom tileserver
   ```

3. Verify the stack:

   ```bash
   ./scripts/maps/verify-stack.sh
   ```

## Services

| Service | Internal URL          | Data source                        |
| ------- | --------------------- | ---------------------------------- |
| Photon  | `http://photon:2322`  | GraphHopper Photon Mexico database |
| OSRM    | `http://osrm:5000`    | Geofabrik Mexico OSM extract       |
| VROOM   | `http://vroom:3000`   | OSRM `driving` profile             |
| TileServer GL | `http://tileserver:8080` | Mexico PMTiles and OSM Bright style |
| PostGIS | PostgreSQL connection | `postgis/postgis:16-3.5-alpine`    |

Datasets are stored under `.map-data/`, which is intentionally ignored by Git. Downloads are checksum-verified and prepared in a staging directory before replacing the active dataset.

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

Refresh datasets by rerunning the preparation scripts during a maintenance window and restarting the affected service. The scripts retain the active dataset until the replacement has downloaded, validated, and finished preprocessing.

## Production rollout order

Deploy in this order so historical textual routes remain available throughout the rollout:

1. Prepare and start PostGIS, Photon, OSRM, VROOM, and TileServer GL.
2. Run `./scripts/maps/verify-stack.sh`; it checks style version, vector source,
   attribution, derived sprite/glyph resources, TileJSON, and a representative
   Veracruz tile through the frontend same-origin proxy.
3. Apply the compatible database migration.
4. Deploy the backend with `MAP_DATA_VERSION`, `MAP_DATA_PREPARED_AT`, and the
   private `MAP_TILES_URL` health target.
5. Deploy the frontend with
   `VITE_MAP_STYLE_URL=/maps/styles/operations/style.json` only after backend
   and TileServer health checks are green.
6. Run `./scripts/maps/smoke-route.sh` and the branch-create smoke before
   gradual enablement.

The smoke test uses a controlled closed route through Veracruz, Boca del Rio, and Alvarado. It checks that OSRM returns road geometry, distance, and duration. It does not create application records.

## Monthly renewal

Run during a maintenance window:

```bash
./scripts/maps/refresh-monthly.sh
```

The refresh stages and validates replacement data before activation, recreates only the map services and backend, then executes health and controlled-route smoke checks. Persist the printed `MAP_DATA_VERSION` and `MAP_DATA_PREPARED_AT` values in the deployment configuration. Existing routes keep their original `routingDataVersion`; they are never rewritten during a dataset refresh.

The ADMIN route control page reads `GET /api/delivery-routing/technical-status`. It reports PostGIS, Photon, VROOM, OSRM, optional `MapTiles`, `routingDataVersion`, Fleet persistence, and the aggregate age of the newest persisted vehicle position without exposing internal service URLs or personal data. MapLibre style configuration remains frontend-only through `VITE_MAP_STYLE_URL`.

## Boundaries

- Dataset preparation is explicit and never runs during normal application startup.
- Private map services have no host ports. NestJS is the only consumer of
  Photon, OSRM, and VROOM; the browser reaches TileServer GL only through
  Nginx `/maps/`.
- Production never falls back to `tile.openstreetmap.org`; an unavailable
  renderer leaves the manual/textual location workflow enabled.
- PostGIS schema migrations are applied by the explicit migration job; backend
  provider adapters remain the only application consumers of the private map
  services.
- GPS snapshots and Socket.IO deltas are recoverable from PostgreSQL; Socket.IO
  memory is never the source of truth.
