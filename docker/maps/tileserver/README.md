# TileServer GL

The production rendering service is pinned to `maptiler/tileserver-gl:v5.6.0`.
It serves the committed OSM Bright style and generated Mexico PMTiles through
the frontend Nginx `/maps/` reverse proxy. The service has no host port and
must not download datasets during startup.

Required mounted artifacts:

- `config.json` at `/data/config.json`;
- `docker/maps/styles/` at `/data/styles/`;
- `.map-data/rendering/mexico.pmtiles` and `manifest.json` at
  `/data/rendering/`;
- generated OpenMapTiles fonts at `/data/fonts/`.

Run `scripts/maps/prepare-rendering.sh` before deploying the service. Run
`scripts/maps/verify-rendering.sh` through the same-origin frontend after the
service is healthy.
