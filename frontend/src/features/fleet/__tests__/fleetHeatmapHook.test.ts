import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", () => ({ useQuery: queryMock }));
vi.mock("../../auth", () => ({
  useAuth: () => ({ accessToken: "access-token" }),
}));
vi.mock("../fleetService", () => ({
  fleetService: { getHeatmap: vi.fn() },
}));

import { useFleetHeatmap } from "../hooks";

describe("useFleetHeatmap", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockReturnValue({ data: null });
  });

  it("does not request historical analytics while the layer is inactive", () => {
    const filters = {
      metric: "DELIVERIES" as const,
      from: "2026-08-01",
      to: "2026-08-07",
      originLocationId: "",
      vehicleId: "",
      routeId: "",
    };

    useFleetHeatmap(filters, false);

    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("uses the filter cache key and enables the persisted request when active", () => {
    const filters = {
      metric: "INCIDENTS" as const,
      from: "2026-08-01",
      to: "2026-08-07",
      originLocationId: "origin-1",
      vehicleId: "vehicle-1",
      routeId: "route-1",
    };

    useFleetHeatmap(filters, true);

    expect(queryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        queryKey: ["fleet", "heatmap", filters],
      }),
    );
  });
});
