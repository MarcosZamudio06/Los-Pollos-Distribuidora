import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deliveryService } from "../deliveryService";

const jsonHeaders = { "content-type": "application/json" };
const okJson = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: jsonHeaders, status: 200 });

function requestAt(index = -1) {
  const call = vi.mocked(fetch).mock.calls.at(index);
  if (!call) throw new Error("No request captured");
  return { url: String(call[0]), init: call[1] as RequestInit };
}

describe("delivery route planning API contracts", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("crypto", { randomUUID: () => "route-idempotency-key" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists eligible sales and searches Photon through the backend proxy", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        okJson({
          items: [
            {
              saleId: "sale-1",
              saleNumber: "V-1001",
              suggestedDeliveryAddress: "Centro",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        okJson({
          items: [
            { label: "Centro, Veracruz", latitude: 19.17, longitude: -96.13 },
          ],
        }),
      );

    await deliveryService.listEligibleSales(
      { originLocationId: "origin-1", search: "V-1001" },
      "token",
    );
    await deliveryService.searchAddresses(
      { q: "Centro Veracruz", latitude: 19.18, longitude: -96.14 },
      "token",
    );

    expect(requestAt(0).url).toBe(
      "/api/delivery-route-planning/eligible-sales?originLocationId=origin-1&search=V-1001",
    );
    expect(requestAt(1).url).toContain("/api/geocoding/search?");
    expect(requestAt(1).url).toContain("q=Centro+Veracruz");
    expect(new Headers(requestAt(1).init.headers).get("authorization")).toBe(
      "Bearer token",
    );
  });

  it("allows the planner to search an unassigned folio without an implicit origin filter", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        items: [
          {
            saleId: "sale-ver",
            saleNumber: "V-2001",
            suggestedDeliveryAddress: "Veracruz",
          },
        ],
      }),
    );

    await deliveryService.listEligibleSales(
      { limit: 100, search: "V-2001" },
      "token",
    );

    expect(requestAt().url).toBe(
      "/api/delivery-route-planning/eligible-sales?limit=100&search=V-2001",
    );
    expect(requestAt().url).not.toContain("originLocationId");
  });

  it("lists only active fleet vehicles for the planner", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        items: [
          {
            id: "vehicle-1",
            code: "UNIDAD-01",
            displayName: "Unidad 1",
            isActive: true,
          },
        ],
      }),
    );

    await deliveryService.listVehicles("token");

    expect(requestAt().url).toBe("/api/vehicles?active=true&limit=100");
    expect(new Headers(requestAt().init.headers).get("authorization")).toBe(
      "Bearer token",
    );
  });

  it("creates a plan and consumes it with a stable idempotency key", async () => {
    const planPayload = {
      driverId: "driver-1",
      vehicleId: "vehicle-1",
      scheduledDate: "2026-07-15",
      originLocationId: "origin-1",
      stops: [
        {
          saleId: "sale-1",
          deliveryAddress: "Centro",
          latitude: 19.17,
          longitude: -96.13,
        },
      ],
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        okJson({
          id: "plan-1",
          orderedStops: [],
          geometry: { type: "LineString", coordinates: [] },
          distanceMeters: 1000,
          durationSeconds: 300,
        }),
      )
      .mockResolvedValueOnce(okJson({ id: "route-1" }));

    await deliveryService.createRoutePlan(planPayload, "token");
    await deliveryService.createOptimizedRoute(
      {
        name: "Ruta Centro",
        driverId: "driver-1",
        vehicleId: "vehicle-1",
        scheduledDate: "2026-07-15",
        originLocationId: "origin-1",
        routePlanId: "plan-1",
      },
      "route-key",
      "token",
    );

    expect(requestAt(0).url).toBe("/api/delivery-route-plans");
    expect(requestAt(0).init.method).toBe("POST");
    expect(requestAt(1).url).toBe("/api/delivery-routes");
    expect(new Headers(requestAt(1).init.headers).get("idempotency-key")).toBe(
      "route-key",
    );
  });

  it("retrieves the persisted DRIVER route map and approved stop sequence", async () => {
    const geometry = {
      type: "LineString" as const,
      coordinates: [
        [-96.14, 19.18],
        [-96.13, 19.17],
      ] as [number, number][],
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        id: "route-1",
        mapAvailable: true,
        geometry,
        distanceMeters: 8600,
        durationSeconds: 1440,
        orders: [
          {
            id: "order-1",
            stopSequence: 1,
            customerName: "Polleria Centro",
            latitude: 19.17,
            longitude: -96.13,
          },
        ],
      }),
    );

    await expect(
      deliveryService.getRoute("route-1", "driver-token"),
    ).resolves.toEqual(
      expect.objectContaining({
        mapAvailable: true,
        geometry,
        orders: [
          expect.objectContaining({
            stopSequence: 1,
            customerName: "Polleria Centro",
          }),
        ],
      }),
    );
    expect(requestAt().url).toBe("/api/delivery-routes/route-1");
    expect(new Headers(requestAt().init.headers).get("authorization")).toBe(
      "Bearer driver-token",
    );
  });

  it("publishes a GPS reading without client-controlled assignment identifiers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        id: "position-1",
        vehicleId: "vehicle-1",
        routeId: "route-1",
        recordedAt: "2026-08-12T16:00:00.000Z",
        receivedAt: "2026-08-12T16:00:01.000Z",
      }),
    );

    await deliveryService.publishFleetPosition(
      {
        accuracyMeters: 12.5,
        clientEventId: "gps-event-1",
        latitude: 19.1738,
        longitude: -96.1342,
        recordedAt: "2026-08-12T16:00:00.000Z",
        speedKph: 32.2,
      },
      "driver-token",
    );

    expect(requestAt().url).toBe("/api/fleet/positions");
    expect(requestAt().init.method).toBe("POST");
    expect(JSON.parse(String(requestAt().init.body))).toEqual({
      accuracyMeters: 12.5,
      clientEventId: "gps-event-1",
      latitude: 19.1738,
      longitude: -96.1342,
      recordedAt: "2026-08-12T16:00:00.000Z",
      speedKph: 32.2,
    });
    expect(JSON.parse(String(requestAt().init.body))).not.toHaveProperty(
      "routeId",
    );
    expect(JSON.parse(String(requestAt().init.body))).not.toHaveProperty(
      "vehicleId",
    );
    expect(JSON.parse(String(requestAt().init.body))).not.toHaveProperty(
      "driverId",
    );
  });

  it("retrieves the ADMIN routing technical status", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        status: "operational",
        checkedAt: "2026-08-12T16:00:00.000Z",
        routingDataVersion: "mx-2026-07",
        dataset: { version: "mx-2026-07", ageDays: 13 },
        services: [{ name: "PostGIS", status: "up", latencyMs: 4 }],
        fleetPersistence: { status: "up" },
        latestVehiclePositionAgeSeconds: null,
        traffic: { available: false, provider: null },
      }),
    );
    await expect(
      deliveryService.getRoutingTechnicalStatus("admin-token"),
    ).resolves.toEqual(expect.objectContaining({ status: "operational" }));
    expect(requestAt().url).toBe("/api/delivery-routing/technical-status");
    expect(new Headers(requestAt().init.headers).get("authorization")).toBe(
      "Bearer admin-token",
    );
  });
});
