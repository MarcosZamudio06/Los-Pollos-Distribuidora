// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryRouteDetail } from "../types";
import { RouteDetailPage } from "../pages/RouteDetailPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockState = vi.hoisted(() => ({
  route: {
    data: null as DeliveryRouteDetail | null,
    error: null,
    isLoading: false,
  },
}));

vi.mock("../hooks", () => ({
  useDeliveryRoute: () => mockState.route,
  useOpenRouteSettlement: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

vi.mock("../components/DriverRouteMap", () => ({
  DriverRouteMap: ({
    compact,
    destinationLocation,
    geometry,
    originLocation,
    orders,
    routeName,
  }: {
    compact?: boolean;
    destinationLocation?: { name?: string } | null;
    geometry?: { coordinates: [number, number][] } | null;
    originLocation?: { name?: string } | null;
    orders: Array<{ id: string; stopSequence?: number | null }>;
    routeName: string;
  }) => (
    <div
      aria-label={`Mapa de ${routeName}`}
      data-compact={compact ? "true" : "false"}
      data-coordinates={JSON.stringify(geometry?.coordinates ?? [])}
      data-destination={destinationLocation?.name ?? ""}
      data-origin={originLocation?.name ?? ""}
      data-stops={orders
        .map((order) => `${order.id}:${order.stopSequence}`)
        .join(",")}
    />
  ),
}));

const baseRoute: DeliveryRouteDetail = {
  id: "route-1",
  name: "Ruta Centro",
  status: "PENDING",
  scheduledDate: "2026-07-15",
  mapAvailable: true,
  geometry: {
    type: "LineString",
    coordinates: [
      [-96.13, 19.17],
      [-96.14, 19.18],
    ],
  },
  orders: [],
};

async function renderPage(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={["/delivery-routes/route-1"]}>
        <Routes>
          <Route
            element={<RouteDetailPage />}
            path="/delivery-routes/:routeId"
          />
        </Routes>
      </MemoryRouter>,
    );
  });
  return { container, root };
}

describe("route detail optimized map", () => {
  beforeEach(() => {
    mockState.route.data = { ...baseRoute, orders: [] };
  });

  it("passes the optimized geometry and every located stop in sequence order to the compact map", async () => {
    mockState.route.data = {
      ...baseRoute,
      orders: [
        {
          id: "stop-3",
          status: "PENDING",
          latitude: 19.19,
          longitude: -96.15,
          stopSequence: 3,
        },
        {
          id: "stop-1",
          status: "PENDING",
          latitude: 19.17,
          longitude: -96.13,
          stopSequence: 1,
        },
        {
          id: "stop-2",
          status: "PENDING",
          latitude: 19.18,
          longitude: -96.14,
          stopSequence: 2,
        },
      ],
    };
    const { container, root } = await renderPage();
    try {
      const map = container.querySelector('[aria-label="Mapa de Ruta Centro"]');
      expect(map?.getAttribute("data-compact")).toBe("true");
      expect(map?.getAttribute("data-coordinates")).toBe(
        "[[-96.13,19.17],[-96.14,19.18]]",
      );
      expect(map?.getAttribute("data-stops")).toBe(
        "stop-1:1,stop-2:2,stop-3:3",
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("shows an operational fallback when the route has no optimized map", async () => {
    mockState.route.data = {
      ...baseRoute,
      mapAvailable: false,
      geometry: null,
    };
    const { container, root } = await renderPage();
    try {
      expect(container.textContent).toContain(
        "El trazado optimizado no está disponible para esta ruta.",
      );
      expect(container.querySelector('[aria-label^="Mapa de"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("renders the map safely when the route has no orders", async () => {
    const { container, root } = await renderPage();
    try {
      expect(
        container
          .querySelector('[aria-label="Mapa de Ruta Centro"]')
          ?.getAttribute("data-stops"),
      ).toBe("");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("shows the persisted vehicle for an existing route", async () => {
    mockState.route.data = {
      ...baseRoute,
      vehicleId: "vehicle-1",
      vehicle: {
        id: "vehicle-1",
        code: "UNIDAD-01",
        displayName: "Unidad 1",
        plateNumber: "ABC-123",
      },
    };
    const { container, root } = await renderPage();
    try {
      expect(container.textContent).toContain("Unidad 1");
      expect(container.textContent).toContain("UNIDAD-01 · ABC-123");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("keeps logistics route details outside commercial settlement and order views", async () => {
    mockState.route.data = {
      ...baseRoute,
      type: "BRANCH_RETURN",
      mapAvailable: false,
      geometry: null,
      inventoryTransferId: "transfer-1",
      logisticsStop: {
        status: "PENDING",
        inventoryTransferId: "transfer-1",
        transferNumber: "TR-0001",
        transferStatus: "IN_TRANSIT",
        origin: {
          id: "branch-1",
          name: "Sucursal Centro",
          latitude: 19.2,
          longitude: -96.2,
        },
        destination: {
          id: "cedis-1",
          name: "CEDIS",
          latitude: 19.1,
          longitude: -96.1,
        },
        items: [
          {
            id: "item-1",
            productId: "product-1",
            productName: "Pollo entero",
            unit: "KG",
            quantityKg: 10,
            quantityPieces: 0,
          },
        ],
      },
      orders: [],
    };
    const { container, root } = await renderPage();
    try {
      expect(container.textContent).toContain("Transporte interno");
      expect(container.textContent).toContain("Carga del traslado");
      expect(container.textContent).not.toContain("Liquidación");
      expect(container.textContent).not.toContain("Pedidos asignados");
      expect(container.textContent).not.toContain("Esperado");
      expect(
        container
          .querySelector('[aria-label="Mapa de Ruta Centro"]')
          ?.getAttribute("data-origin"),
      ).toBe("Sucursal Centro");
      expect(
        container
          .querySelector('[aria-label="Mapa de Ruta Centro"]')
          ?.getAttribute("data-destination"),
      ).toBe("CEDIS");
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
