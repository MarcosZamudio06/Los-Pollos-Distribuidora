# Self-hosted map services

The `maps` Docker profile provides PostGIS, Photon, OSRM, and VROOM without exposing the routing services to the host network.

## Quick path

1. Prepare the Mexico datasets:

   ```bash
   ./scripts/maps/prepare-all.sh
   ```

2. Start the services:

   ```bash
   docker compose --profile maps up -d postgres photon osrm vroom
   ```

3. Verify the stack:

   ```bash
   ./scripts/maps/verify-stack.sh
   ```

## Services

| Service | Internal URL | Data source |
|---|---|---|
| Photon | `http://photon:2322` | GraphHopper Photon Mexico database |
| OSRM | `http://osrm:5000` | Geofabrik Mexico OSM extract |
| VROOM | `http://vroom:3000` | OSRM `driving` profile |
| PostGIS | PostgreSQL connection | `postgis/postgis:16-3.5-alpine` |

Datasets are stored under `.map-data/`, which is intentionally ignored by Git. Downloads are checksum-verified and prepared in a staging directory before replacing the active dataset.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MAP_DATA_DIR` | `./.map-data` | Host directory for Photon and OSRM data |
| `MAP_DOCKER_PLATFORM` | `linux/amd64` | Deterministic GIS image platform, including Apple Silicon through emulation |
| `PHOTON_DATA_URL` | Mexico Photon 1.0 database | Override Photon dataset |
| `OSM_PBF_URL` | Geofabrik Mexico latest | Override OSRM source extract |
| `PHOTON_VERSION` | `1.2.1` | Photon server version |
| `OSRM_VERSION` | `v5.27.1` | OSRM server version |
| `VROOM_VERSION` | `v1.15.0` | VROOM server version |

Refresh datasets by rerunning the preparation scripts during a maintenance window and restarting the affected service. The scripts retain the active dataset until the replacement has downloaded, validated, and finished preprocessing.

## Boundaries

- Dataset preparation is explicit and never runs during normal application startup.
- Map services have no host ports; the NestJS backend will be their only application consumer.
- PostGIS schema migrations and backend provider adapters belong to later implementation phases.
