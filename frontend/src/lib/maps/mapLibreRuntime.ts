import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

type MapLibreModule = typeof import("maplibre-gl");

let mapLibreModulePromise: Promise<MapLibreModule> | null = null;
let configuredMapLibre: MapLibreModule | null = null;

function configureMapLibre(maplibre: MapLibreModule) {
  if (configuredMapLibre === maplibre) return;

  maplibre.setWorkerUrl(mapLibreWorkerUrl);
  configuredMapLibre = maplibre;
}

export function loadMapLibre(): Promise<MapLibreModule> {
  if (!mapLibreModulePromise) {
    mapLibreModulePromise = import("maplibre-gl")
      .then((maplibre) => {
        configureMapLibre(maplibre);
        return maplibre;
      })
      .catch((error: unknown) => {
        mapLibreModulePromise = null;
        throw error;
      });
  }

  return mapLibreModulePromise;
}
