import { apiClient } from "../../lib/api";
import type {
  MapAttribution,
  MapCapabilities,
  MapClientConfig,
  MapCoordinates,
  MapGeocodingRequestOptions,
  MapGeocodingResult,
  MapViewport,
} from "./types";

type ApiEnvelope<T> = {
  data?: T;
  message?: string;
  success?: boolean;
};

export class MapsConfigError extends Error {
  readonly code = "INVALID_MAPS_CONFIG" as const;

  constructor(message: string) {
    super(message);
    this.name = "MapsConfigError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function unwrapConfig(response: unknown): unknown {
  if (isRecord(response) && "data" in response) return response.data;
  return response;
}

function authHeaders(accessToken?: string | null): Record<string, string> {
  return accessToken ? { authorization: `Bearer ${accessToken}` } : {};
}

function isGeocodingResult(value: unknown): value is MapGeocodingResult {
  if (!isRecord(value)) return false;
  return (
    typeof value.label === "string" &&
    value.label.trim().length > 0 &&
    isFiniteNumber(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    isFiniteNumber(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    (value.osmType === undefined || value.osmType === null || typeof value.osmType === "string") &&
    (value.osmId === undefined || value.osmId === null || typeof value.osmId === "string")
  );
}

function parseGeocodingResult(value: unknown): MapGeocodingResult {
  if (!isGeocodingResult(value)) {
    throw new Error("The geocoding response is invalid.");
  }
  return {
    label: value.label,
    latitude: value.latitude,
    longitude: value.longitude,
    ...(value.osmType !== undefined ? { osmType: value.osmType } : {}),
    ...(value.osmId !== undefined ? { osmId: value.osmId } : {}),
  };
}

function parseGeocodingList(value: unknown): MapGeocodingResult[] {
  const payload = unwrapConfig(value);
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];
  return payload.items.filter(isGeocodingResult).map(parseGeocodingResult);
}

function withSearchParams(
  path: string,
  params: Record<string, string | number | undefined>,
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSafePublicUrl(value: string, allowEmpty = false) {
  if (value.trim().length === 0) return allowEmpty;
  if (allowEmpty && value === "") return true;
  if (value.startsWith("/") && !value.startsWith("//")) return true;

  try {
    const origin =
      typeof window !== "undefined" && window.location.origin
        ? window.location.origin
        : "http://localhost";
    const url = new URL(value, origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isAttribution(value: unknown): value is MapAttribution {
  if (!isRecord(value) || typeof value.label !== "string") return false;
  if (value.label.trim().length === 0) return false;
  return value.url === undefined ||
    (typeof value.url === "string" && isSafePublicUrl(value.url));
}

function isViewport(value: unknown): value is MapViewport {
  if (!isRecord(value)) return false;
  return (
    isFiniteNumber(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    isFiniteNumber(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180 &&
    isFiniteNumber(value.zoom) &&
    value.zoom >= 0 &&
    value.zoom <= 24
  );
}

function isCapabilities(value: unknown): value is MapCapabilities {
  return (
    isRecord(value) &&
    typeof value.geocoding === "boolean" &&
    typeof value.routing === "boolean" &&
    typeof value.optimization === "boolean"
  );
}

function parseMapClientConfig(value: unknown): MapClientConfig {
  if (!isRecord(value)) {
    throw new MapsConfigError("The maps configuration response is not an object.");
  }

  const attribution = value.attribution;
  if (
    value.renderer !== "maplibre" ||
    typeof value.available !== "boolean" ||
    typeof value.styleUrl !== "string" ||
    !isSafePublicUrl(value.styleUrl) ||
    typeof value.revision !== "string" ||
    !Array.isArray(attribution) ||
    !attribution.every(isAttribution) ||
    !isViewport(value.defaultViewport) ||
    !isCapabilities(value.capabilities)
  ) {
    throw new MapsConfigError("The maps configuration response is invalid.");
  }

  return {
    renderer: "maplibre",
    available: value.available,
    styleUrl: value.styleUrl,
    revision: value.revision,
    attribution: attribution.map((item) => ({
      label: item.label,
      ...(item.url ? { url: item.url } : {}),
    })),
    defaultViewport: {
      latitude: value.defaultViewport.latitude,
      longitude: value.defaultViewport.longitude,
      zoom: value.defaultViewport.zoom,
    },
    capabilities: {
      geocoding: value.capabilities.geocoding,
      routing: value.capabilities.routing,
      optimization: value.capabilities.optimization,
    },
  };
}

export const mapsService = {
  async getConfig(accessToken?: string | null, signal?: AbortSignal) {
    const response = await apiClient.get<ApiEnvelope<MapClientConfig> | MapClientConfig>(
      "/maps/config",
      {
        headers: accessToken
          ? { authorization: `Bearer ${accessToken}` }
          : {},
        ...(signal ? { signal } : {}),
      },
    );

    return parseMapClientConfig(unwrapConfig(response));
  },

  async searchAddresses(
    query: string,
    accessToken?: string | null,
    options: MapGeocodingRequestOptions = {},
  ) {
    const response = await apiClient.get<
      ApiEnvelope<{ items?: MapGeocodingResult[] }> | { items?: MapGeocodingResult[] }
    >(
      withSearchParams("/geocoding/search", {
        q: query,
        latitude: options.latitude,
        longitude: options.longitude,
        limit: options.limit,
      }),
      {
        headers: authHeaders(accessToken),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );

    return parseGeocodingList(response);
  },

  async reverseAddress(
    coordinates: MapCoordinates,
    accessToken?: string | null,
    options: Pick<MapGeocodingRequestOptions, "signal"> = {},
  ) {
    const response = await apiClient.get<
      ApiEnvelope<MapGeocodingResult> | MapGeocodingResult
    >(
      withSearchParams("/geocoding/reverse", coordinates),
      {
        headers: authHeaders(accessToken),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );

    return parseGeocodingResult(unwrapConfig(response));
  },
};
