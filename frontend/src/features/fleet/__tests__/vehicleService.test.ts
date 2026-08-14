import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vehicleService } from "../vehicleService";

const jsonHeaders = { "content-type": "application/json" };
const okJson = (data: unknown) =>
  new Response(JSON.stringify({ data }), { headers: jsonHeaders, status: 200 });

function lastRequest() {
  const call = vi.mocked(fetch).mock.calls.at(-1);
  if (!call) throw new Error("No request captured");
  return { input: String(call[0]), init: call[1] as RequestInit };
}

describe("vehicle API service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists vehicles with search, status and pagination filters", async () => {
    const data = {
      items: [
        {
          id: "vehicle-1",
          code: "UNIDAD-01",
          displayName: "Reparto Centro",
          plateNumber: "ABC-123",
          homeLocationId: "location-1",
          isActive: true,
        },
      ],
      total: 1,
      page: 2,
      limit: 20,
      totalPages: 2,
    };
    vi.mocked(fetch).mockResolvedValueOnce(okJson(data));

    await expect(
      vehicleService.listVehicles(
        { page: 2, limit: 20, search: "Centro", isActive: "true" },
        "token",
      ),
    ).resolves.toEqual(data);

    expect(lastRequest().input).toBe(
      "/api/vehicles?page=2&limit=20&search=Centro&isActive=true",
    );
  });

  it("creates a vehicle through the fleet API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        id: "vehicle-1",
        code: "UNIDAD-01",
        displayName: "Reparto Centro",
        plateNumber: null,
        homeLocationId: null,
        isActive: true,
      }),
    );

    await vehicleService.createVehicle(
      { code: "UNIDAD-01", displayName: "Reparto Centro" },
      "token",
    );

    const request = lastRequest();
    expect(request.input).toBe("/api/vehicles");
    expect(request.init.method).toBe("POST");
    expect(JSON.parse(String(request.init.body))).toEqual({
      code: "UNIDAD-01",
      displayName: "Reparto Centro",
    });
  });

  it("updates a vehicle through the fleet API", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      okJson({
        id: "vehicle-1",
        code: "UNIDAD-01",
        displayName: "Reparto Centro",
        plateNumber: "XYZ-987",
        homeLocationId: null,
        isActive: false,
      }),
    );

    await vehicleService.updateVehicle(
      "vehicle-1",
      { plateNumber: "XYZ-987", isActive: false },
      "token",
    );

    const request = lastRequest();
    expect(request.input).toBe("/api/vehicles/vehicle-1");
    expect(request.init.method).toBe("PATCH");
    expect(JSON.parse(String(request.init.body))).toEqual({
      plateNumber: "XYZ-987",
      isActive: false,
    });
  });
});
