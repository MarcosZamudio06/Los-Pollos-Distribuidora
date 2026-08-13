# Map data and style licenses

Production rendering uses the following pinned components:

- Mexico extract from [Geofabrik](https://download.geofabrik.de/north-america/mexico.html).
- [Planetiler v0.10.2](https://github.com/onthegomap/planetiler) with the OpenMapTiles profile.
- [OpenMapTiles schema v3.16](https://github.com/openmaptiles/openmaptiles).
- [OSM Bright](https://github.com/openmaptiles/osm-bright-gl-style) at commit `563b249f7ae71528b1f1e327cb9c019d0dda4c50`.
- [OpenMapTiles fonts v2.0](https://github.com/openmaptiles/fonts/releases/tag/v2.0).

The deployed map must keep this visible attribution:

`© OpenMapTiles © OpenStreetMap contributors`

The dataset and style preparation job must retain the source licenses and
notices supplied by each component. Generated datasets, fonts, and archives
are deployment artifacts under `.map-data/` and are not committed to Git.
