import type {
  MapConfig,
  ResolvedMapStyle,
} from "./mapTypes";
import { createOsmRasterStyle } from "./mapStyle";

export const runtimeMapConfig: MapConfig = {
  mode: import.meta.env.MODE,
  styleUrl: import.meta.env.VITE_MAP_STYLE_URL,
};

function assertPublicMapStyleUrl(styleUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(styleUrl);
  } catch {
    throw new Error("VITE_MAP_STYLE_URL must be a valid HTTP(S) URL.");
  }

  if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
    throw new Error("VITE_MAP_STYLE_URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "VITE_MAP_STYLE_URL must not contain credentials, query tokens, or fragments.",
    );
  }
  if (/^(photon|vroom|osrm)([.-]|$)/i.test(parsed.hostname)) {
    throw new Error(
      "VITE_MAP_STYLE_URL must point to a public map style, not a routing provider.",
    );
  }
}

export function assertProductionMapConfig(config = runtimeMapConfig): void {
  if (config.mode === "production" && !config.styleUrl?.trim()) {
    throw new Error(
      "VITE_MAP_STYLE_URL must be defined when building the frontend for production.",
    );
  }
  if (config.styleUrl?.trim()) {
    assertPublicMapStyleUrl(config.styleUrl.trim());
  }
}

export function resolveMapStyle(
  config: MapConfig = runtimeMapConfig,
): ResolvedMapStyle {
  assertProductionMapConfig(config);

  if (config.styleUrl?.trim()) return config.styleUrl;

  return createOsmRasterStyle();
}
