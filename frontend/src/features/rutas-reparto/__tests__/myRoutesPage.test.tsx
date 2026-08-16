// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyRoutesPage } from "../pages/MyRoutesPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockState = vi.hoisted(() => ({
  logisticsStopMutateAsync: vi.fn(),
  mutateAsync: vi.fn(),
  routeStatus: "PENDING",
  routeType: "SALE_DELIVERY",
  logisticsStop: null as Record<string, unknown> | null,
  orders: [] as Array<Record<string, unknown>>,
}));

vi.mock("../hooks", () => ({
  useDeliveryRoute: () => ({
    data: {
      id: "route-1",
      name: "Ruta Centro",
      status: mockState.routeStatus,
      scheduledDate: "2026-08-14",
      driverId: "driver-1",
      type: mockState.routeType,
      vehicleId: "vehicle-1",
      vehicle: {
        id: "vehicle-1",
        code: "UNIDAD-01",
        displayName: "Unidad 1",
        plateNumber: null,
      },
      routeStockLocationId: "stock-1",
      mapAvailable: false,
      geometry: null,
      logisticsStop: mockState.logisticsStop,
      orders: mockState.orders,
    },
    error: null,
    isLoading: false,
  }),
  useDeliveryRoutes: () => ({
    data: {
      items: [
        {
          id: "route-1",
          name: "Ruta Centro",
          status: mockState.routeStatus,
          type: mockState.routeType,
          scheduledDate: "2026-08-14",
          ordersCount: mockState.orders.length,
          pendingOrdersCount: mockState.orders.filter(
            (order) =>
              ![
                "DELIVERED",
                "NOT_DELIVERED",
                "CANCELLED",
                "PARTIALLY_REJECTED",
                "RETURNED",
              ].includes(String(order.status)),
          ).length,
        },
      ],
    },
    error: null,
    isLoading: false,
  }),
  useCompleteLogisticsStop: () => ({
    isPending: false,
    mutateAsync: mockState.logisticsStopMutateAsync,
  }),
  useUpdateDeliveryRouteStatus: () => ({
    isPending: false,
    mutateAsync: mockState.mutateAsync,
  }),
}));

vi.mock("../components/DriverRouteMap", () => ({
  DriverRouteMap: (props: {
    destinationLocation?: { name?: string } | null;
    originLocation?: { name?: string } | null;
    routeName: string;
  }) => (
    <div
      aria-label={`Mapa de ${props.routeName}`}
      data-destination={props.destinationLocation?.name ?? ""}
      data-origin={props.originLocation?.name ?? ""}
      data-testid="driver-route-map"
    />
  ),
}));

vi.mock("../useRouteLocationTracking", () => ({
  useRouteLocationTracking: () => ({
    canStart: false,
    errorMessage: null,
    isEligible: mockState.routeType !== "SALE_DELIVERY",
    isTracking: false,
    lastPosition: null,
    lastPublishedAt: null,
    lastPublishedPosition: null,
    start: vi.fn(),
    status: "stopped",
    stop: vi.fn(),
  }),
}));

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
  root = undefined;
  mockState.mutateAsync.mockReset();
  mockState.logisticsStopMutateAsync.mockReset();
  mockState.routeStatus = "PENDING";
  mockState.routeType = "SALE_DELIVERY";
  mockState.logisticsStop = null;
  mockState.orders = [];
});

describe("MyRoutesPage route start", () => {
  it("lets the assigned driver confirm starting a pending route", async () => {
    mockState.mutateAsync.mockResolvedValue({
      id: "route-1",
      status: "IN_PROGRESS",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes"]}>
          <MyRoutesPage />
        </MemoryRouter>,
      );
    });

    const startButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Iniciar ruta",
    );
    expect(startButton).toBeTruthy();

    await act(async () => startButton?.click());
    const confirmButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Confirmar inicio",
    );
    await act(async () => confirmButton?.click());

    expect(mockState.mutateAsync).toHaveBeenCalledWith({
      status: "IN_PROGRESS",
    });
  });

  it("lets the assigned driver finish a route after all orders reach final status", async () => {
    mockState.routeStatus = "IN_PROGRESS";
    mockState.orders = [
      { id: "order-1", saleNumber: "SALE-000001", status: "DELIVERED" },
      { id: "order-2", saleNumber: "SALE-000002", status: "DELIVERED" },
    ];
    mockState.mutateAsync.mockResolvedValue({
      id: "route-1",
      status: "COMPLETED",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes"]}>
          <MyRoutesPage />
        </MemoryRouter>,
      );
    });

    const finishButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Terminar ruta",
    );
    expect(finishButton).toBeTruthy();

    await act(async () => finishButton?.click());
    const confirmButton = [...document.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Confirmar término",
    );
    await act(async () => confirmButton?.click());

    expect(mockState.mutateAsync).toHaveBeenCalledWith({
      status: "COMPLETED",
    });
  });

  it("confirms a logistics stop without showing commercial collection controls", async () => {
    mockState.routeStatus = "IN_PROGRESS";
    mockState.routeType = "BRANCH_RETURN";
    mockState.logisticsStop = {
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
    };
    mockState.logisticsStopMutateAsync.mockResolvedValue({
      id: "route-1",
      type: "BRANCH_RETURN",
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes"]}>
          <MyRoutesPage />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Parada logística");
    expect(container.textContent).toContain("Devolución a CEDIS");
    expect(container.textContent).toContain("Carga del traslado");
    expect(container.textContent).toContain("10 kg");
    expect(container.textContent).toContain("Seguimiento GPS");
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    expect(
      container
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("33");
    expect(
      container
        .querySelector('[data-testid="driver-route-map"]')
        ?.getAttribute("data-origin"),
    ).toBe("Sucursal Centro");
    expect(
      container
        .querySelector('[data-testid="driver-route-map"]')
        ?.getAttribute("data-destination"),
    ).toBe("CEDIS");
    expect(container.textContent).not.toContain("Cobrado");
    expect(container.textContent).not.toContain("Liquidación");

    const confirmTrigger = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Confirmar recepción",
    );
    await act(async () => confirmTrigger?.click());
    const confirmationButtons = [
      ...document.querySelectorAll("button"),
    ].filter((button) => button.textContent?.trim() === "Confirmar recepción");
    await act(async () => confirmationButtons.at(-1)?.click());

    expect(mockState.logisticsStopMutateAsync).toHaveBeenCalledWith({});
    expect(mockState.mutateAsync).not.toHaveBeenCalledWith({
      status: "COMPLETED",
    });
  });

  it("identifies a CEDIS supply route and keeps its physical endpoints visible", async () => {
    mockState.routeStatus = "PENDING";
    mockState.routeType = "CEDIS_SUPPLY";
    mockState.logisticsStop = {
      status: "PENDING",
      inventoryTransferId: "transfer-2",
      transferNumber: "TR-0002",
      transferStatus: "APPROVED",
      origin: {
        id: "cedis-1",
        name: "CEDIS Principal",
        latitude: 19.1,
        longitude: -96.1,
      },
      destination: {
        id: "branch-2",
        name: "Sucursal Norte",
        latitude: 19.2,
        longitude: -96.2,
      },
      items: [],
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes"]}>
          <MyRoutesPage />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Suministro a sucursal");
    expect(container.textContent).toContain("CEDIS Principal");
    expect(container.textContent).toContain("Sucursal Norte");
    expect(
      container
        .querySelector('[data-testid="driver-route-map"]')
        ?.getAttribute("data-origin"),
    ).toBe("CEDIS Principal");
    expect(
      container
        .querySelector('[data-testid="driver-route-map"]')
        ?.getAttribute("data-destination"),
    ).toBe("Sucursal Norte");
  });
});
