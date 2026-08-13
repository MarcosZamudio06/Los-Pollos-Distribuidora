import type {
  FleetGeofenceEvent,
  FleetIncidentCreated,
  FleetPositionUpdated,
} from "../../lib/fleetSocket";

export type FleetCoordinate = [number, number];

export type FleetLineString = {
  type: "LineString";
  coordinates: FleetCoordinate[];
};

export type FleetPolygon = {
  type: "Polygon";
  coordinates: FleetCoordinate[][];
};

export type FleetDeliveryStop = {
  id: string;
  saleId?: string | null;
  stopSequence?: number | null;
  deliveryAddress?: string | null;
  status: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export type FleetRoute = {
  id: string;
  name: string;
  status: string;
  scheduledDate: string;
  originLocationId: string | null;
  geometry?: FleetLineString | null;
  totalOrders?: number | null;
  deliveredOrders?: number | null;
  incidentCountActive?: number | null;
};

export type FleetVehicle = {
  id: string;
  code: string;
  displayName: string;
  plateNumber: string | null;
};

export type FleetDriver = {
  id: string;
  name: string;
};

export type FleetPosition = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedKph: number | null;
  headingDegrees: number | null;
  recordedAt: string;
};

export type FleetLiveItem = {
  vehicle: FleetVehicle;
  driver: FleetDriver;
  route: FleetRoute;
  position: FleetPosition | null;
  stale: boolean;
  nextStop: FleetDeliveryStop | null;
  deliveryStops?: FleetDeliveryStop[];
  incidentCountActive?: number | null;
  incidents?: FleetIncident[];
};

export type FleetIncident = {
  incidentId: string;
  deliveryOrderId: string;
  routeId: string;
  vehicleId: string | null;
  driverId: string | null;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "CANCELLED" | string;
  statusSnapshot?: string | null;
  reason: string;
  occurredAt: string;
  position: { latitude: number; longitude: number } | null;
  stop: { latitude: number; longitude: number } | null;
};

export type DeliveryZone = {
  id: string;
  name: string;
  originLocationId: string;
  geometry: FleetPolygon;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type FleetLiveSnapshot = {
  serverTime: string;
  items: FleetLiveItem[];
};

export type FleetLocation = {
  id: string;
  name: string;
  type?: string | null;
  isActive?: boolean;
};

export type FleetLiveFilters = {
  originLocationId: string;
  routeId: string;
  vehicleId: string;
  search: string;
};

export type FleetHeatmapMetric = "DELIVERIES" | "INCIDENTS";

export type FleetHeatmapFilters = {
  metric: FleetHeatmapMetric;
  from: string;
  to: string;
  originLocationId: string;
  vehicleId: string;
  routeId: string;
};

export type FleetHeatmapFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    weight: number;
    count: number;
    metric: FleetHeatmapMetric;
  };
};

export type FleetHeatmapFeatureCollection = {
  type: "FeatureCollection";
  features: FleetHeatmapFeature[];
};

export type FleetTrafficCongestionLevel =
  | "UNKNOWN"
  | "LOW"
  | "MODERATE"
  | "HIGH"
  | "SEVERE";

export type FleetTrafficFeature = {
  type: "Feature";
  id: string;
  geometry: FleetLineString;
  properties: {
    id: string;
    congestionLevel: FleetTrafficCongestionLevel;
    observedAt: string;
    source: string;
  };
};

export type FleetTrafficFeatureCollection = {
  type: "FeatureCollection";
  features: FleetTrafficFeature[];
};

export type FleetConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type FleetSnapshotEnvelope = {
  data?: FleetLiveSnapshot;
  message?: string;
  success?: boolean;
};

export type FleetHeatmapEnvelope = {
  data?: FleetHeatmapFeatureCollection;
  message?: string;
  success?: boolean;
};

export type FleetPositionEvent = FleetPositionUpdated;
export type FleetGeofenceTimelineEvent = FleetGeofenceEvent;
export type FleetIncidentEvent = FleetIncidentCreated;
export type DeliveryZonesEnvelope = {
  data?: {
    items?: DeliveryZone[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
  items?: DeliveryZone[];
  message?: string;
  success?: boolean;
};

export type DeliveryZonePayload = {
  name: string;
  originLocationId: string;
  geometry: FleetPolygon;
  isActive?: boolean;
};
