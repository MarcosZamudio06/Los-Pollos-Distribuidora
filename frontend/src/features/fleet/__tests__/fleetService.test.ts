import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fleetService } from "../fleetService";

const jsonHeaders = { "content-type": "application/json" };
const okJson = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: jsonHeaders, status: 200 });

function requestUrl() {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) throw new Error("No request captured");
  return String(call[0]);
}

describe("fleet delivery zone API", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("filters zones by origin and preserves Polygon GeoJSON", async () => {
    const zone = {
      id: "zone-1",
      name: "Zona Centro",
      originLocationId: "origin-1",
      geometry: {
        type: "Polygon",
        coordinates: [[[-96.2, 19.1], [-96.1, 19.1], [-96.1, 19.2], [-96.2, 19.2], [-96.2, 19.1]]],
      },
      isActive: true,
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({ items: [zone] }),
    );

    await expect(
      fleetService.listDeliveryZones({ originLocationId: "origin-1" }, "token"),
    ).resolves.toEqual([zone]);
    expect(requestUrl()).toBe(
      "/api/delivery-zones?originLocationId=origin-1&page=1&limit=100",
    );
  });

  it("requests the bounded historical heatmap with metric and date filters", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-96.14, 19.17] },
            properties: { weight: 2, count: 2, metric: "INCIDENTS" },
          },
        ],
      }),
    );

    await expect(
      fleetService.getHeatmap(
        {
          metric: "INCIDENTS",
          from: "2026-08-01",
          to: "2026-08-07",
          originLocationId: "origin-1",
          vehicleId: "vehicle-1",
          routeId: "route-1",
        },
        "token",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        type: "FeatureCollection",
        features: [
          expect.objectContaining({
            properties: expect.objectContaining({ weight: 2 }),
          }),
        ],
      }),
    );
    expect(requestUrl()).toBe(
      "/api/fleet/analytics/heatmap?metric=INCIDENTS&from=2026-08-01T00%3A00%3A00.000Z&to=2026-08-07T23%3A59%3A59.999Z&originLocationId=origin-1&vehicleId=vehicle-1&routeId=route-1",
    );
  });
});
