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
  mutateAsync: vi.fn(),
  routeStatus: "PENDING",
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
  useUpdateDeliveryRouteStatus: () => ({
    isPending: false,
    mutateAsync: mockState.mutateAsync,
  }),
}));

vi.mock("../useRouteLocationTracking", () => ({
  useRouteLocationTracking: () => ({
    canStart: false,
    errorMessage: null,
    isEligible: false,
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
  mockState.routeStatus = "PENDING";
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
});
