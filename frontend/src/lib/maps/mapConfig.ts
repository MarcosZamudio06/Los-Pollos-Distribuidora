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
  if (styleUrl.startsWith("//")) {
    throw new Error(
      "VITE_MAP_STYLE_URL must use a same-origin /maps path or an absolute public HTTP(S) URL.",
    );
  }

  if (styleUrl.startsWith("/")) {
    let parsed: URL;
    try {
      parsed = new URL(styleUrl, "https://same-origin.invalid");
    } catch {
      throw new Error(
        "VITE_MAP_STYLE_URL must use a same-origin /maps path or an absolute public HTTP(S) URL.",
      );
    }

    if (
      !parsed.pathname.startsWith("/maps/") ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error(
        "VITE_MAP_STYLE_URL must be a same-origin /maps path without query tokens or fragments.",
      );
    }
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(styleUrl);
  } catch {
    throw new Error(
      "VITE_MAP_STYLE_URL must use HTTP, HTTPS, or a same-origin /maps path.",
    );
  }

  if (!(parsed.protocol === "http:" || parsed.protocol === "https:")) {
    throw new Error(
      "VITE_MAP_STYLE_URL must use HTTP, HTTPS, or a same-origin /maps path.",
    );
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "VITE_MAP_STYLE_URL must not contain credentials, query tokens, or fragments.",
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  const internalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "tileserver" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local");
  if (internalHost || /^(photon|vroom|osrm)([.-]|$)/i.test(hostname)) {
    throw new Error(
      "VITE_MAP_STYLE_URL must point to a public map style, not an internal routing provider.",
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
