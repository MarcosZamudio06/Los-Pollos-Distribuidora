// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useRoutePlannerCatalog } from "../hooks";

const calls = vi.hoisted(() => ({ sales: vi.fn(async () => ({ items: [] })) }));
vi.mock("../../auth", () => ({
  useAuth: () => ({ accessToken: "test-only" }),
}));
vi.mock("../deliveryService", () => ({
  deliveryService: {
    listPlannerDrivers: async () => [],
    listPlannerLocations: async () => [],
    listVehicles: async () => ({ items: [] }),
    listEligibleSales: calls.sales,
  },
}));
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

it("does not send the physical dispatch origin as a Sale.locationId eligibility filter", async () => {
  function Probe() {
    useRoutePlannerCatalog("ROUTE-SALE-1", "physical-cedis");
    return null;
  }
  const container = document.createElement("div"),
    root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      );
    });
    expect(calls.sales).toHaveBeenCalledWith(
      { limit: 100, search: "ROUTE-SALE-1" },
      "test-only",
    );
  } finally {
    await act(async () => root.unmount());
    client.clear();
  }
});
