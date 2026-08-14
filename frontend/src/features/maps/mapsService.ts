import { apiClient } from "../../lib/api";
import type {
  MapCoordinates,
  MapGeocodingRequestOptions,
  MapGeocodingResult,
} from "./types";

type ApiEnvelope<T> = {
  data?: T;
  message?: string;
  success?: boolean;
};

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

export const mapsService = {
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
