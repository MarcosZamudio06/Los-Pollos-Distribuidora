import { apiClient } from "../../lib/api";
import type {
  DeliveryZone,
  DeliveryZonePayload,
  DeliveryZonesEnvelope,
  FleetLiveSnapshot,
  FleetLiveFilters,
  FleetLocation,
  FleetHeatmapFeatureCollection,
  FleetHeatmapFilters,
  FleetHeatmapEnvelope,
  FleetSnapshotEnvelope,
} from "./types";

type ApiListEnvelope<T> = {
  data?: T[] | { items?: T[] };
  items?: T[];
  message?: string;
  success?: boolean;
};

function authHeaders(accessToken?: string | null) {
  return accessToken
    ? { authorization: `Bearer ${accessToken}` }
    : undefined;
}

function withParams(
  path: string,
  params: Record<string, string | undefined>,
) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, value);
  });
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function unwrapSnapshot(response: FleetSnapshotEnvelope): FleetLiveSnapshot {
  const payload = response.data;
  if (!payload || !Array.isArray(payload.items)) {
    return { serverTime: new Date().toISOString(), items: [] };
  }
  return payload;
}

function unwrapHeatmap(response: FleetHeatmapEnvelope): FleetHeatmapFeatureCollection {
  const data = response.data;
  if (data?.type === "FeatureCollection" && Array.isArray(data.features)) {
    return data;
  }
  return { type: "FeatureCollection", features: [] };
}

function heatmapDateBoundary(value: string, endOfDay: boolean) {
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;
}

function unwrapLocations(response: ApiListEnvelope<FleetLocation>) {
  const data = response.data;
  if (Array.isArray(data)) return data;
  if (data && !Array.isArray(data) && Array.isArray(data.items)) {
    return data.items;
  }
  return response.items ?? [];
}

export const fleetService = {
  async getLive(
    filters: Pick<FleetLiveFilters, "originLocationId"> = {
      originLocationId: "",
    },
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<FleetSnapshotEnvelope>(
      withParams("/fleet/live", {
        originLocationId: filters.originLocationId || undefined,
      }),
      { headers: authHeaders(accessToken) },
    );
    return unwrapSnapshot(response);
  },

  async getHeatmap(
    filters: FleetHeatmapFilters,
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<FleetHeatmapEnvelope>(
      withParams("/fleet/analytics/heatmap", {
        metric: filters.metric,
        from: heatmapDateBoundary(filters.from, false),
        to: heatmapDateBoundary(filters.to, true),
        originLocationId: filters.originLocationId || undefined,
        vehicleId: filters.vehicleId || undefined,
        routeId: filters.routeId || undefined,
      }),
      { headers: authHeaders(accessToken) },
    );
    return unwrapHeatmap(response);
  },

  async listOrigins(accessToken?: string | null) {
    const response = await apiClient.get<ApiListEnvelope<FleetLocation>>(
      "/locations?isActive=true&limit=100",
      { headers: authHeaders(accessToken) },
    );
    return unwrapLocations(response).filter(
      (location) => location.isActive !== false && location.type !== "ROUTE_STOCK",
    );
  },

  async listDeliveryZones(
    filters: { originLocationId?: string } = {},
    accessToken?: string | null,
  ) {
    const response = await apiClient.get<DeliveryZonesEnvelope>(
      withParams("/delivery-zones", {
        originLocationId: filters.originLocationId || undefined,
        page: "1",
        limit: "100",
      }),
      { headers: authHeaders(accessToken) },
    );
    const data = response.data;
    if (data && Array.isArray(data.items)) return data.items;
    return response.items ?? [];
  },

  async createDeliveryZone(
    payload: DeliveryZonePayload,
    accessToken?: string | null,
  ) {
    const response = await apiClient.post<
      { data?: DeliveryZone } | DeliveryZone,
      DeliveryZonePayload
    >("/delivery-zones", {
      body: payload,
      headers: authHeaders(accessToken),
    });
    return unwrapZone(response);
  },

  async updateDeliveryZone(
    id: string,
    payload: Partial<DeliveryZonePayload>,
    accessToken?: string | null,
  ) {
    const response = await apiClient.patch<
      { data?: DeliveryZone } | DeliveryZone,
      Partial<DeliveryZonePayload>
    >(`/delivery-zones/${id}`, {
      body: payload,
      headers: authHeaders(accessToken),
    });
    return unwrapZone(response);
  },
};

function unwrapZone(response: { data?: DeliveryZone } | DeliveryZone) {
  if ("data" in response && response.data) return response.data;
  return response as DeliveryZone;
}
