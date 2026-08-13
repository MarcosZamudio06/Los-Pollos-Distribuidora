import { resolveMapStyle, runtimeMapConfig } from "./mapConfig";
import type {
  MapAttribution,
  MapCapabilities,
  MapConfig,
  MapViewport,
  ResolvedMapStyle,
} from "./mapTypes";

export type MapClientConfig = {
  renderer: "maplibre";
  available: boolean;
  style: ResolvedMapStyle;
  revision: string;
  attribution: MapAttribution[];
  defaultViewport: MapViewport;
  capabilities: MapCapabilities;
};

const DEFAULT_VIEWPORT: MapViewport = {
  latitude: 19.1738,
  longitude: -96.1342,
  zoom: 11,
};

const DEFAULT_ATTRIBUTION: MapAttribution[] = [
  {
    label: "© OpenMapTiles",
    url: "https://openmaptiles.org/",
  },
  {
    label: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
  },
];

export function resolveMapClientConfig(
  config: MapConfig = runtimeMapConfig,
): MapClientConfig {
  return {
    renderer: "maplibre",
    available: true,
    style: resolveMapStyle(config),
    revision: import.meta.env.VITE_MAP_STYLE_REVISION?.trim() || "runtime",
    attribution: DEFAULT_ATTRIBUTION.map((item) => ({ ...item })),
    defaultViewport: { ...DEFAULT_VIEWPORT },
    capabilities: {
      geocoding: true,
      routing: true,
      optimization: true,
    },
  };
}
