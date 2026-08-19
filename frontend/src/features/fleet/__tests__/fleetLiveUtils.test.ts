import { describe, expect, it } from "vitest";
import {
  appendGeofenceEvent,
  applyIncidentCreated,
  applyPositionUpdated,
  createFleetFeatureCollections,
  filterFleetItems,
} from "../fleetLiveUtils";
import type { DeliveryZone, FleetLiveItem, FleetLiveSnapshot } from "../types";

const baseItem = (overrides: Partial<FleetLiveItem> = {}): FleetLiveItem => ({
  vehicle: {
    id: "vehicle-1",
    code: "UNIDAD-01",
    displayName: "Unidad 1",
    plateNumber: "ABC-123",
  },
  driver: { id: "driver-1", name: "Driver One" },
  route: {
    id: "route-1",
    name: "Ruta Centro",
    status: "IN_PROGRESS",
    scheduledDate: "2026-08-12T00:00:00.000Z",
    originLocationId: "origin-1",
    geometry: {
      type: "LineString",
      coordinates: [
        [-96.2, 19.1],
        [-96.15, 19.15],
      ],
    },
    totalOrders: 2,
    deliveredOrders: 1,
  },
  position: {
    latitude: 19.15,
    longitude: -96.15,
    accuracyMeters: 8,
    speedKph: 31.2,
    headingDegrees: 185,
    recordedAt: "2026-08-12T16:00:00.000Z",
  },
  stale: false,
  nextStop: {
    id: "order-2",
    status: "PENDING",
    latitude: 19.16,
    longitude: -96.14,
    stopSequence: 2,
  },
  deliveryStops: [
    { id: "order-1", status: "DELIVERED", latitude: 19.14, longitude: -96.16 },
    { id: "order-2", status: "PENDING", latitude: 19.16, longitude: -96.14 },
  ],
  ...overrides,
});

const snapshot: FleetLiveSnapshot = {
  serverTime: "2026-08-12T16:01:00.000Z",
  items: [baseItem()],
};

const zone: DeliveryZone = {
  id: "zone-1",
  name: "Zona Centro",
  originLocationId: "origin-1",
  geometry: {
    type: "Polygon" as const,
    coordinates: [[[-96.2, 19.1], [-96.1, 19.1], [-96.1, 19.2], [-96.2, 19.2], [-96.2, 19.1]]],
  },
  isActive: true,
};

const geofenceEvent = (type: "ENTER" | "EXIT", eventId: string) => ({
  eventId,
  type,
  zoneId: "zone-1",
  zoneName: "Zona Centro",
  vehicleId: "vehicle-1",
  vehicleCode: "UNIDAD-01",
  routeId: "route-1",
  latitude: 19.15,
  longitude: -96.15,
  occurredAt: "2026-08-12T16:02:00.000Z",
});

describe("fleet live data flow", () => {
  it("creates stable vehicle, route, and delivery FeatureCollections from the snapshot", () => {
    const data = createFleetFeatureCollections(snapshot.items, null, [zone]);

    expect(data.vehicles.features).toHaveLength(1);
    expect(data.vehicles.features[0]).toEqual(
      expect.objectContaining({
        id: "vehicle-1",
        geometry: { type: "Point", coordinates: [-96.15, 19.15] },
      }),
    );
    expect(data.routes.features[0]).toEqual(
      expect.objectContaining({ id: "route-1" }),
    );
    expect(data.deliveries.features.map((feature) => feature.id)).toEqual([
      "order-1",
      "order-2",
    ]);
    expect(data.zones.features).toEqual([
      expect.objectContaining({
        id: "zone-1",
        geometry: zone.geometry,
        properties: expect.objectContaining({ originLocationId: "origin-1" }),
      }),
    ]);
  });

  it("normalizes marker metrics and exposes warning and selected-label properties", () => {
    const data = createFleetFeatureCollections(
      [
        baseItem({
          incidentCountActive: 1,
          position: {
            ...baseItem().position!,
            headingDegrees: Number.NaN,
            speedKph: Number.NaN,
          },
        }),
      ],
      "vehicle-1",
    );

    expect(data.vehicles.features[0].properties).toEqual(
      expect.objectContaining({
        hasActiveIncident: true,
        headingDegrees: null,
        selected: true,
        selectedLabel: "UNIDAD-01",
        speedKph: null,
      }),
    );

    const validSpeed = createFleetFeatureCollections([baseItem()], "vehicle-1")
      .vehicles.features[0].properties;
    expect(validSpeed.selectedLabel).toBe("UNIDAD-01 · 31 km/h");
  });

  it("updates only the affected vehicle and rejects an old socket position", () => {
    const newer = {
      vehicleId: "vehicle-1",
      vehicleCode: "UNIDAD-01",
      routeId: "route-1",
      driverId: "driver-1",
      originLocationId: "origin-1",
      latitude: 19.2,
      longitude: -96.1,
      accuracyMeters: 5,
      speedKph: 25,
      headingDegrees: 200,
      recordedAt: "2026-08-12T16:02:00.000Z",
    };
    const next = applyPositionUpdated(snapshot, newer);
    expect(next.items[0].position?.latitude).toBe(19.2);
    expect(next.items[0].route.geometry).toEqual(snapshot.items[0].route.geometry);
    expect(next.items).toHaveLength(1);

    const old = applyPositionUpdated(next, { ...newer, latitude: 18, recordedAt: "2026-08-12T16:01:30.000Z" });
    expect(old).toBe(next);
    expect(old.items[0].position?.latitude).toBe(19.2);
  });

  it("preserves stale state and applies route, vehicle, and text filters", () => {
    const staleItem = baseItem({
      vehicle: { ...baseItem().vehicle, id: "vehicle-2", code: "UNIDAD-02" },
      route: { ...baseItem().route, id: "route-2", name: "Ruta Norte" },
      position: null,
      stale: true,
    });
    const items = [snapshot.items[0], staleItem];
    expect(createFleetFeatureCollections([staleItem]).vehicles.features).toHaveLength(0);
    expect(
      filterFleetItems(items, {
        originLocationId: "",
        routeId: "route-2",
        vehicleId: "",
        search: "norte",
      }),
    ).toEqual([staleItem]);
    expect(
      filterFleetItems(items, {
        originLocationId: "",
        routeId: "",
        vehicleId: "vehicle-1",
        search: "",
      }),
    ).toEqual([snapshot.items[0]]);
  });

  it("deduplicates ENTER/EXIT events when a reconnect replays the same event", () => {
    const enter = geofenceEvent("ENTER", "event-1");
    const exit = geofenceEvent("EXIT", "event-2");
    const first = appendGeofenceEvent([], enter);
    const replayed = appendGeofenceEvent(first, enter);
    const next = appendGeofenceEvent(replayed, exit);

    expect(replayed).toBe(first);
    expect(next.map((event) => event.eventId)).toEqual(["event-2", "event-1"]);
  });

  it("renders persisted incidents at GPS coordinates and keeps stop coordinates separate", () => {
    const data = createFleetFeatureCollections([
      baseItem({
        incidents: [
          {
            incidentId: "incident-1",
            deliveryOrderId: "order-2",
            routeId: "route-1",
            vehicleId: "vehicle-1",
            driverId: "driver-1",
            status: "OPEN",
            reason: "Cliente no localizado",
            occurredAt: "2026-08-12T16:02:00.000Z",
            position: { latitude: 19.17, longitude: -96.13 },
            stop: { latitude: 19.16, longitude: -96.14 },
          },
          {
            incidentId: "incident-2",
            deliveryOrderId: "order-1",
            routeId: "route-1",
            vehicleId: "vehicle-1",
            driverId: "driver-1",
            status: "OPEN",
            reason: "Sin GPS",
            occurredAt: "2026-08-12T16:01:00.000Z",
            position: null,
            stop: { latitude: 19.14, longitude: -96.16 },
          },
        ],
      }),
    ]);

    expect(data.incidents.features).toEqual([
      expect.objectContaining({
        id: "incident-1",
        geometry: { type: "Point", coordinates: [-96.13, 19.17] },
        properties: expect.objectContaining({ locationType: "GPS" }),
      }),
      expect.objectContaining({
        id: "incident-2",
        geometry: { type: "Point", coordinates: [-96.16, 19.14] },
        properties: expect.objectContaining({ locationType: "STOP" }),
      }),
    ]);
  });

  it("applies a socket incident only to the affected route and ignores replayed ids", () => {
    const event = {
      incidentId: "incident-1",
      deliveryOrderId: "order-2",
      routeId: "route-1",
      vehicleId: "vehicle-1",
      driverId: "driver-1",
      status: "OPEN" as const,
      reason: "Cliente no localizado",
      occurredAt: "2026-08-12T16:02:00.000Z",
      position: null,
      stop: { latitude: 19.16, longitude: -96.14 },
    };
    const next = applyIncidentCreated(
      {
        ...snapshot,
        items: [
          snapshot.items[0],
          baseItem({
            vehicle: { ...baseItem().vehicle, id: "vehicle-2" },
            route: { ...baseItem().route, id: "route-2" },
          }),
        ],
      },
      event,
    );

    expect(next.items[0].incidents?.[0].incidentId).toBe("incident-1");
    expect(next.items[0].incidentCountActive).toBe(1);
    expect(next.items[1].incidents).toBeUndefined();
    expect(applyIncidentCreated(next, event)).toBe(next);
  });

  it("handles the controlled production-size snapshot without recalculating routes", () => {
    const controlledItems = Array.from({ length: 50 }, (_, vehicleIndex) => {
      const base = baseItem();
      const routeIndex = vehicleIndex % 20;
      return {
        ...base,
        vehicle: {
          ...base.vehicle,
          id: `vehicle-${vehicleIndex}`,
          code: `UNIDAD-${String(vehicleIndex).padStart(2, "0")}`,
        },
        driver: { id: `driver-${vehicleIndex}`, name: `Driver ${vehicleIndex}` },
        route: {
          ...base.route,
          id: `route-${routeIndex}`,
          name: `Ruta ${routeIndex}`,
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [-96.2 + routeIndex / 10_000, 19.1],
              [-96.15 + routeIndex / 10_000, 19.15],
            ] as [number, number][],
          },
        },
        deliveryStops: Array.from({ length: 10 }, (_, stopIndex) => ({
          id: `order-${vehicleIndex}-${stopIndex}`,
          status: stopIndex === 0 ? "DELIVERED" : "PENDING",
          latitude: 19.1 + stopIndex / 10_000,
          longitude: -96.2 + vehicleIndex / 10_000,
          stopSequence: stopIndex + 1,
        })),
      };
    });

    const startedAt = performance.now();
    const featureCollections = createFleetFeatureCollections(controlledItems);
    const elapsedMs = performance.now() - startedAt;

    expect(featureCollections.vehicles.features).toHaveLength(50);
    expect(featureCollections.routes.features).toHaveLength(20);
    expect(featureCollections.deliveries.features).toHaveLength(500);
    expect(elapsedMs).toBeLessThan(1_000);

    const updated = applyPositionUpdated(
      { serverTime: "2026-08-12T16:00:00.000Z", items: controlledItems },
      {
        vehicleId: "vehicle-25",
        vehicleCode: "UNIDAD-25",
        routeId: "route-5",
        driverId: "driver-25",
        originLocationId: "origin-1",
        latitude: 19.25,
        longitude: -96.05,
        accuracyMeters: 5,
        speedKph: 30,
        headingDegrees: 180,
        recordedAt: "2026-08-12T16:00:10.000Z",
      },
    );
    expect(updated.items).toHaveLength(50);
    expect(updated.items[25].position?.latitude).toBe(19.25);
    expect(updated.items[25].route.geometry).toEqual(
      controlledItems[25].route.geometry,
    );
  });
});
