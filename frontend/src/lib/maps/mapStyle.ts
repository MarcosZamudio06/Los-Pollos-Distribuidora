import type { StyleSpecification } from "maplibre-gl";

export const OSM_RASTER_TILE_URL =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png" as const;
export const OSM_RASTER_ATTRIBUTION = "© OpenStreetMap contributors" as const;

export function createOsmRasterStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: [OSM_RASTER_TILE_URL],
        tileSize: 256,
        attribution: OSM_RASTER_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: "osm-raster",
        type: "raster",
        source: "osm",
      },
    ],
  };
}
