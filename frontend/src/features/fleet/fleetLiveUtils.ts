import type {
  FleetGeofenceEvent,
  FleetIncidentCreated,
  FleetPositionUpdated,
} from "../../lib/fleetSocket";
import type {
  FleetDeliveryStop,
  FleetLiveFilters,
  FleetLiveItem,
  FleetLiveSnapshot,
  FleetLineString,
  FleetIncident,
  FleetPolygon,
  DeliveryZone,
} from "./types";

export type GeoJsonFeature<Geometry, Properties> = {
  type: "Feature";
  id: string;
  geometry: Geometry;
  properties: Properties;
};

export type GeoJsonFeatureCollection<Geometry, Properties> = {
  type: "FeatureCollection";
  features: Array<GeoJsonFeature<Geometry, Properties>>;
};

export type VehicleFeatureProperties = {
  id: string;
  code: string;
  selectedLabel: string;
  routeId: string;
  driverId: string;
  driverName: string;
  status: string;
  stale: boolean;
  headingDegrees: number | null;
  speedKph: number | null;
  recordedAt: string | null;
  hasActiveIncident: boolean;
  selected?: boolean;
  highlighted?: boolean;
};

export type RouteFeatureProperties = {
  id: string;
  name: string;
  status: string;
  selected?: boolean;
};

export type DeliveryFeatureProperties = {
  id: string;
  routeId: string;
  status: string;
  stopSequence: number | null;
  selected?: boolean;
};

export type DeliveryZoneFeatureProperties = {
  id: string;
  name: string;
  originLocationId: string;
  isActive: boolean;
  selected?: boolean;
  highlighted?: boolean;
};

export type IncidentFeatureProperties = {
  id: string;
  deliveryOrderId: string;
  routeId: string;
  vehicleId: string | null;
  status: string;
  reason: string;
  occurredAt: string;
  locationType: "GPS" | "STOP";
};

type PointGeometry = { type: "Point"; coordinates: [number, number] };

export type FleetFeatureCollections = {
  vehicles: GeoJsonFeatureCollection<PointGeometry, VehicleFeatureProperties>;
  routes: GeoJsonFeatureCollection<
    FleetLineString,
    RouteFeatureProperties
  >;
  deliveries: GeoJsonFeatureCollection<
    PointGeometry,
    DeliveryFeatureProperties
  >;
  zones: GeoJsonFeatureCollection<FleetPolygon, DeliveryZoneFeatureProperties>;
  incidents: GeoJsonFeatureCollection<PointGeometry, IncidentFeatureProperties>;
};

function finiteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function asNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteMetric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function validSpeed(value: unknown): number | null {
  const number = finiteMetric(value);
  return number !== null && number >= 0 ? number : null;
}

function hasActiveIncident(item: FleetLiveItem): boolean {
  const itemIncidentCount = item.incidentCountActive ?? 0;
  const routeIncidentCount = item.route.incidentCountActive ?? 0;
  if (Math.max(itemIncidentCount, routeIncidentCount) > 0) return true;
  return (item.incidents ?? []).some(
    (incident) => incident.status === "OPEN" || incident.status === "IN_REVIEW",
  );
}

function formatVehicleLabel(code: string, speedKph: number | null): string {
  if (speedKph === null) return code;
  return `${code} · ${Math.round(speedKph)} km/h`;
}

function isLineString(value: unknown): value is FleetLineString {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  return (
    geometry.type === "LineString" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length > 0 &&
    geometry.coordinates.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        finiteCoordinate(coordinate[0]) &&
        finiteCoordinate(coordinate[1]),
    )
  );
}

function isPolygon(value: unknown): value is FleetPolygon {
  if (!value || typeof value !== "object") return false;
  const geometry = value as { type?: unknown; coordinates?: unknown };
  return (
    geometry.type === "Polygon" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length > 0 &&
    geometry.coordinates.every(
      (ring) =>
        Array.isArray(ring) &&
        ring.length >= 4 &&
        ring.every(
          (coordinate) =>
            Array.isArray(coordinate) &&
            coordinate.length >= 2 &&
            finiteCoordinate(coordinate[0]) &&
            finiteCoordinate(coordinate[1]),
        ),
    )
  );
}

function stopCoordinates(stop: FleetDeliveryStop): [number, number] | null {
  const latitude = asNumber(stop.latitude);
  const longitude = asNumber(stop.longitude);
  return latitude !== null && longitude !== null
    ? [longitude, latitude]
    : null;
}

function stopIsCompleted(status: string) {
  return [
    "DELIVERED",
    "NOT_DELIVERED",
    "CANCELLED",
    "PARTIALLY_REJECTED",
    "RETURNED",
  ].includes(status);
}

export function filterFleetItems(
  items: FleetLiveItem[],
  filters: FleetLiveFilters,
) {
  const search = filters.search.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (
      filters.originLocationId &&
      item.route.originLocationId !== filters.originLocationId
    ) {
      return false;
    }
    if (filters.routeId && item.route.id !== filters.routeId) return false;
    if (filters.vehicleId && item.vehicle.id !== filters.vehicleId) return false;
    if (!search) return true;
    return [
      item.vehicle.code,
      item.vehicle.displayName,
      item.vehicle.plateNumber ?? "",
      item.driver.name,
      item.route.name,
    ].some((value) => value.toLocaleLowerCase().includes(search));
  });
}

export function applyPositionUpdated(
  snapshot: FleetLiveSnapshot,
  position: FleetPositionUpdated,
): FleetLiveSnapshot {
  const itemIndex = snapshot.items.findIndex(
    (item) =>
      item.vehicle.id === position.vehicleId &&
      item.route.id === position.routeId,
  );
  if (itemIndex < 0) return snapshot;

  const currentItem = snapshot.items[itemIndex];
  const currentRecordedAt = currentItem.position?.recordedAt;
  if (
    currentRecordedAt &&
    Date.parse(position.recordedAt) <= Date.parse(currentRecordedAt)
  ) {
    return snapshot;
  }

  const nextItem: FleetLiveItem = {
    ...currentItem,
    position: {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracyMeters: position.accuracyMeters,
      speedKph: position.speedKph,
      headingDegrees: position.headingDegrees,
      recordedAt: position.recordedAt,
    },
    stale: false,
  };

  const items = snapshot.items.slice();
  items[itemIndex] = nextItem;
  return { ...snapshot, items };
}

export function applyIncidentCreated(
  snapshot: FleetLiveSnapshot,
  incident: FleetIncidentCreated,
): FleetLiveSnapshot {
  const itemIndex = snapshot.items.findIndex(
    (item) =>
      item.route.id === incident.routeId &&
      (incident.vehicleId === null || item.vehicle.id === incident.vehicleId),
  );
  if (itemIndex < 0) return snapshot;

  const currentItem = snapshot.items[itemIndex];
  const currentIncidents = currentItem.incidents ?? [];
  if (currentIncidents.some((current) => current.incidentId === incident.incidentId)) {
    return snapshot;
  }

  const nextIncident: FleetIncident = {
    incidentId: incident.incidentId,
    deliveryOrderId: incident.deliveryOrderId,
    routeId: incident.routeId,
    vehicleId: incident.vehicleId,
    driverId: incident.driverId,
    status: incident.status,
    reason: incident.reason,
    occurredAt: incident.occurredAt,
    position: incident.position,
    stop: incident.stop,
  };
  const nextItem: FleetLiveItem = {
    ...currentItem,
    incidents: [nextIncident, ...currentIncidents].slice(0, 100),
    incidentCountActive:
      (currentItem.incidentCountActive ?? 0) +
      (incident.status === "OPEN" || incident.status === "IN_REVIEW" ? 1 : 0),
    route: {
      ...currentItem.route,
      incidentCountActive:
        (currentItem.route.incidentCountActive ??
          currentItem.incidentCountActive ??
          0) +
        (incident.status === "OPEN" || incident.status === "IN_REVIEW" ? 1 : 0),
    },
  };
  const items = snapshot.items.slice();
  items[itemIndex] = nextItem;
  return { ...snapshot, items };
}

export function appendGeofenceEvent(
  events: FleetGeofenceEvent[],
  event: FleetGeofenceEvent,
): FleetGeofenceEvent[] {
  if (events.some((current) => current.eventId === event.eventId)) {
    return events;
  }
  return [event, ...events].slice(0, 100);
}

export function createFleetFeatureCollections(
  items: FleetLiveItem[],
  selectedVehicleId?: string | null,
  zones: DeliveryZone[] = [],
  selectedZoneId?: string | null,
  highlightedVehicleId?: string | null,
  highlightedZoneId?: string | null,
): FleetFeatureCollections {
  const vehicles: FleetFeatureCollections["vehicles"]["features"] = [];
  const routes: FleetFeatureCollections["routes"]["features"] = [];
  const deliveries: FleetFeatureCollections["deliveries"]["features"] = [];
  const deliveryZones: FleetFeatureCollections["zones"]["features"] = [];
  const incidents: FleetFeatureCollections["incidents"]["features"] = [];
  const routeIds = new Set<string>();
  const deliveryIds = new Set<string>();
  const incidentIds = new Set<string>();

  items.forEach((item) => {
    const selected = item.vehicle.id === selectedVehicleId;
    const highlighted = item.vehicle.id === highlightedVehicleId;
    if (item.position) {
      const headingDegrees = finiteMetric(item.position.headingDegrees);
      const speedKph = validSpeed(item.position.speedKph);
      vehicles.push({
        type: "Feature",
        id: item.vehicle.id,
        geometry: {
          type: "Point",
          coordinates: [item.position.longitude, item.position.latitude],
        },
        properties: {
          id: item.vehicle.id,
          code: item.vehicle.code,
          selectedLabel: formatVehicleLabel(item.vehicle.code, speedKph),
          routeId: item.route.id,
          driverId: item.driver.id,
          driverName: item.driver.name,
          status: item.route.status,
          stale: item.stale,
          headingDegrees,
          speedKph,
          recordedAt: item.position.recordedAt,
          hasActiveIncident: hasActiveIncident(item),
          selected,
          highlighted,
        },
      });
    }

    if (!routeIds.has(item.route.id) && isLineString(item.route.geometry)) {
      routeIds.add(item.route.id);
      routes.push({
        type: "Feature",
        id: item.route.id,
        geometry: item.route.geometry,
        properties: {
          id: item.route.id,
          name: item.route.name,
          status: item.route.status,
          selected,
        },
      });
    }

    (item.deliveryStops ?? []).forEach((stop) => {
      const coordinates = stopCoordinates(stop);
      if (!coordinates || deliveryIds.has(stop.id)) return;
      deliveryIds.add(stop.id);
      deliveries.push({
        type: "Feature",
        id: stop.id,
        geometry: { type: "Point", coordinates },
        properties: {
          id: stop.id,
          routeId: item.route.id,
          status: stop.status,
          stopSequence: stop.stopSequence ?? null,
          selected,
        },
      });
    });

    (item.incidents ?? []).forEach((incident) => {
      if (incidentIds.has(incident.incidentId)) return;
      const location = incident.position ?? incident.stop;
      if (!location) return;
      incidentIds.add(incident.incidentId);
      incidents.push({
        type: "Feature",
        id: incident.incidentId,
        geometry: {
          type: "Point",
          coordinates: [location.longitude, location.latitude],
        },
        properties: {
          id: incident.incidentId,
          deliveryOrderId: incident.deliveryOrderId,
          routeId: incident.routeId,
          vehicleId: incident.vehicleId,
          status: incident.status,
          reason: incident.reason,
          occurredAt: incident.occurredAt,
          locationType: incident.position ? "GPS" : "STOP",
        },
      });
    });
  });

  zones.forEach((zone) => {
    if (!isPolygon(zone.geometry)) return;
    deliveryZones.push({
      type: "Feature",
      id: zone.id,
      geometry: zone.geometry,
      properties: {
        id: zone.id,
        name: zone.name,
        originLocationId: zone.originLocationId,
        isActive: zone.isActive,
        selected: zone.id === selectedZoneId,
        highlighted: zone.id === highlightedZoneId,
      },
    });
  });

  return {
    vehicles: { type: "FeatureCollection", features: vehicles },
    routes: { type: "FeatureCollection", features: routes },
    deliveries: { type: "FeatureCollection", features: deliveries },
    zones: { type: "FeatureCollection", features: deliveryZones },
    incidents: { type: "FeatureCollection", features: incidents },
  };
}

export function getFleetFeatureBounds(
  data: FleetFeatureCollections,
  includeZones = true,
) {
  const points: [number, number][] = [
    ...data.vehicles.features.map((feature) => feature.geometry.coordinates),
    ...data.deliveries.features.map((feature) => feature.geometry.coordinates),
    ...data.incidents.features.map((feature) => feature.geometry.coordinates),
    ...data.routes.features.flatMap((feature) => feature.geometry.coordinates),
    ...(includeZones
      ? data.zones.features.flatMap((feature) =>
          feature.geometry.coordinates.flatMap((ring) => ring),
        )
      : []),
  ];
  if (points.length === 0) return null;

  return points.reduce<[number, number, number, number]>(
    (
      [minLongitude, minLatitude, maxLongitude, maxLatitude],
      [longitude, latitude],
    ) =>
      [
        Math.min(minLongitude, longitude),
        Math.min(minLatitude, latitude),
        Math.max(maxLongitude, longitude),
        Math.max(maxLatitude, latitude),
      ] as [number, number, number, number],
    [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ],
  );
}

export function getDeliveryProgress(item: FleetLiveItem) {
  const total = item.route.totalOrders ?? item.deliveryStops?.length ?? 0;
  const delivered = item.route.deliveredOrders ??
    (item.deliveryStops ?? []).filter((stop) => stopIsCompleted(stop.status) && stop.status === "DELIVERED").length;
  return { delivered, total };
}
