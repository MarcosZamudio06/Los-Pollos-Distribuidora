// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DriverNavigationPage } from "../pages/DriverNavigationPage";
import type { DeliveryRouteDetail } from "../../rutas-reparto/types";

const mockState = vi.hoisted(() => ({
  routeStatus: "IN_PROGRESS" as string,
  detail: null as DeliveryRouteDetail | null,
  start: vi.fn(),
  stop: vi.fn(),
  completeLogisticsStop: vi.fn(),
  updateRouteStatus: vi.fn(),
  navigationCalls: [] as Array<{ enabled: boolean; target: unknown }>,
}));

vi.mock("../../auth", () => ({
  useAuth: () => ({
    user: { id: "driver-1", role: "DRIVER" },
  }),
}));
vi.mock("../../rutas-reparto/hooks", () => ({
  useDeliveryRoute: () => ({
    data: mockState.detail,
    error: null,
    isLoading: false,
  }),
  useCompleteLogisticsStop: () => ({
    isPending: false,
    mutateAsync: mockState.completeLogisticsStop,
  }),
  useUpdateDeliveryRouteStatus: () => ({
    isPending: false,
    mutateAsync: mockState.updateRouteStatus,
  }),
}));
vi.mock("../../rutas-reparto/useRouteLocationTracking", () => ({
  useRouteLocationTracking: () => ({
    canStart: mockState.routeStatus === "IN_PROGRESS",
    errorMessage: null,
    isEligible: mockState.routeStatus === "IN_PROGRESS",
    isTracking: false,
    lastPosition: null,
    lastPublishedAt: null,
    lastPublishedPosition: null,
    start: mockState.start,
    status: "stopped",
    stop: mockState.stop,
  }),
}));
vi.mock("../hooks", () => ({
  useDriverNavigationSession: ({
    enabled,
    target,
  }: {
    enabled: boolean;
    target: unknown;
  }) => {
    mockState.navigationCalls.push({ enabled, target });
    return {
      data: null,
      distanceFromRouteMeters: null,
      error: null,
      follow: true,
      geometry: null,
      isError: false,
      isOffRoute: false,
      isRecalculating: false,
      nextStep: null,
      position: null,
      recenter: vi.fn(),
      showOverview: vi.fn(),
      steps: [],
      suspendFollow: vi.fn(),
      target,
      viewMode: "follow" as const,
    };
  },
}));
vi.mock("../components/DriverNavigationMap", () => ({
  DriverNavigationMap: () => <div data-testid="driver-navigation-map" />,
}));
vi.mock("../components/NavigationInstructionBanner", () => ({
  NavigationInstructionBanner: () => <div data-testid="navigation-instruction" />,
}));
vi.mock("../components/NavigationDeliverySheet", () => ({
  NavigationDeliverySheet: ({
    onOpenDelivery,
    onStart,
    target,
  }: {
    onOpenDelivery: () => void;
    onStart: () => void;
    target: { id: string } | null;
  }) => (
    <>
      <output data-navigation-target={target?.id ?? "none"} />
      <button onClick={onStart} type="button">
        Iniciar navegación
      </button>
      <button onClick={onOpenDelivery} type="button">
        Abrir entrega
      </button>
    </>
  ),
}));
vi.mock("../components/NavigationMapControls", () => ({
  NavigationMapControls: () => <div data-testid="navigation-map-controls" />,
}));
vi.mock(
  "../../rutas-reparto/components/DeliveryEvidenceCapture",
  () => ({
    DeliveryEvidenceCapture: () => (
      <div data-testid="delivery-evidence-dialog" />
    ),
  }),
);
vi.mock(
  "../../rutas-reparto/components/DeliveryIncidentDialog",
  () => ({
    DeliveryIncidentDialog: () => (
      <div data-testid="delivery-incident-dialog" />
    ),
  }),
);

let root: Root | undefined;

function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  return { container, root };
}

describe("DriverNavigationPage", () => {
  beforeEach(() => {
    mockState.routeStatus = "IN_PROGRESS";
    mockState.detail = {
      id: "route-1",
      name: "Ruta Centro",
      driverId: "driver-1",
      status: mockState.routeStatus,
      type: "SALE_DELIVERY",
      vehicleId: "vehicle-1",
      geometry: null,
      orders: [
        {
          id: "order-1",
          customerName: "Centro",
          deliveryAddress: "Centro",
          latitude: 19.17,
          longitude: -96.13,
          status: "PENDING",
          stopSequence: 1,
        },
      ],
    } satisfies DeliveryRouteDetail;
    mockState.start.mockReset();
    mockState.stop.mockReset();
    mockState.completeLogisticsStop.mockReset();
    mockState.updateRouteStatus.mockReset();
    mockState.navigationCalls.length = 0;
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
  });

  it("does not start GPS automatically and starts only after the explicit action", async () => {
    const { container } = renderPage();
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes/route-1/navigation"]}>
          <Routes>
            <Route
              element={<DriverNavigationPage />}
              path="/my-routes/:routeId/navigation"
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(mockState.start).not.toHaveBeenCalled();
    const startButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Iniciar navegación"),
    );
    expect(startButton).toBeTruthy();

    await act(async () => startButton?.click());
    expect(mockState.start).toHaveBeenCalledTimes(1);
  });

  it("does not enter navigation mode for a pending route", async () => {
    mockState.routeStatus = "PENDING";
    mockState.detail = {
      ...mockState.detail,
      status: "PENDING",
    } as DeliveryRouteDetail;
    const { container } = renderPage();
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes/route-1/navigation"]}>
          <Routes>
            <Route
              element={<DriverNavigationPage />}
              path="/my-routes/:routeId/navigation"
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Ruta pendiente");
    expect(container.textContent).not.toContain("Iniciar navegación");
    expect(mockState.start).not.toHaveBeenCalled();
  });

  it("closes delivery actions and follows the server-selected next target", async () => {
    mockState.detail = {
      ...mockState.detail,
      orders: [
        ...(mockState.detail?.orders ?? []),
        {
          id: "order-2",
          customerName: "Norte",
          deliveryAddress: "Norte",
          latitude: 19.18,
          longitude: -96.12,
          status: "PENDING",
          stopSequence: 2,
        },
      ],
    } as DeliveryRouteDetail;
    const { container } = renderPage();
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes/route-1/navigation"]}>
          <Routes>
            <Route
              element={<DriverNavigationPage />}
              path="/my-routes/:routeId/navigation"
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Abrir entrega"))
        ?.click();
    });
    expect(container.querySelector("[data-navigation-operations]")).not.toBeNull();

    mockState.detail = {
      ...mockState.detail,
      orders: (mockState.detail?.orders ?? []).map((order) =>
        order.id === "order-1" ? { ...order, status: "DELIVERED" } : order,
      ),
    } as DeliveryRouteDetail;
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes/route-1/navigation"]}>
          <Routes>
            <Route
              element={<DriverNavigationPage />}
              path="/my-routes/:routeId/navigation"
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(
      container.querySelector("[data-navigation-target='order-2']"),
    ).not.toBeNull();
    expect(container.querySelector("[data-navigation-operations]")).toBeNull();
    expect(mockState.navigationCalls.at(-1)?.target).toMatchObject({
      id: "order-2",
    });
  });

  it("does not calculate after all orders are final and exposes the existing route completion flow", async () => {
    mockState.detail = {
      ...mockState.detail,
      orders: (mockState.detail?.orders ?? []).map((order) => ({
        ...order,
        status: "NOT_DELIVERED",
      })),
    } as DeliveryRouteDetail;
    const { container } = renderPage();
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes/route-1/navigation"]}>
          <Routes>
            <Route
              element={<DriverNavigationPage />}
              path="/my-routes/:routeId/navigation"
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Ninguna parada pendiente");
    expect(container.textContent).toContain("Terminar ruta");
    expect(mockState.navigationCalls.at(-1)?.enabled).toBe(false);
    expect(mockState.start).not.toHaveBeenCalled();
  });

  it("keeps the navigation session mounted while evidence and incidents are opened", async () => {
    const { container } = renderPage();
    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/my-routes/route-1/navigation"]}>
          <Routes>
            <Route
              element={<DriverNavigationPage />}
              path="/my-routes/:routeId/navigation"
            />
          </Routes>
        </MemoryRouter>,
      );
    });

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Abrir entrega"))
        ?.click();
    });
    const evidenceButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Evidencia",
    );
    expect(evidenceButton).toBeTruthy();
    await act(async () => evidenceButton?.click());

    expect(container.querySelector("[data-testid='driver-navigation-map']"))
      .not.toBeNull();
    expect(
      container.querySelector("[data-testid='delivery-evidence-dialog']"),
    ).not.toBeNull();

    const incidentButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Incidencia",
    );
    expect(incidentButton).toBeTruthy();
    await act(async () => incidentButton?.click());
    expect(
      container.querySelector("[data-testid='delivery-incident-dialog']"),
    ).not.toBeNull();
  });
});
