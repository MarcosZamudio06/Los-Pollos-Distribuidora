// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FleetLivePage } from "../pages/FleetLivePage";
import type { FleetLiveItem } from "../types";

const state = vi.hoisted(() => ({
  snapshot: null as { serverTime: string; items: FleetLiveItem[] } | null,
  heatmap: null as {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: { type: "Point"; coordinates: [number, number] };
      properties: { weight: number; count: number; metric: "DELIVERIES" | "INCIDENTS" };
    }>;
  } | null,
  selected: null as string | null,
  refetch: vi.fn(),
  geofenceEvents: [] as Array<{
    eventId: string;
    type: "ENTER" | "EXIT";
    zoneId: string;
    zoneName: string;
    vehicleId: string;
    vehicleCode: string;
    routeId: string;
    latitude: number;
    longitude: number;
    occurredAt: string;
  }>,
}));

vi.mock("../../auth", () => ({
  PERMISSIONS: { fleetZonesManage: "fleet.zones.manage" },
  hasPermission: () => false,
  useAuth: () => ({ accessToken: "access-token", user: { permissions: [] } }),
}));

vi.mock("../hooks", () => ({
  useFleetOrigins: () => ({
    data: [{ id: "origin-1", name: "CEDIS Centro", isActive: true }],
  }),
  useFleetLive: () => ({
    data: state.snapshot,
    isError: false,
    isLoading: false,
    refetch: state.refetch,
    connectionState: "connected",
    incidentCount: 1,
    geofenceEvents: state.geofenceEvents,
  }),
  useFleetHeatmap: () => ({
    data: state.heatmap,
    isError: false,
    isLoading: false,
  }),
  useDeliveryZones: () => ({
    data: [],
    isError: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../components/FleetLiveMap", () => ({
  FleetLiveMap: ({
    items,
    onSelectVehicle,
    selectedVehicleId,
  }: {
    items: FleetLiveItem[];
    onSelectVehicle: (vehicleId: string) => void;
    selectedVehicleId: string | null;
  }) => (
    <div data-selected={selectedVehicleId ?? ""} data-testid="fleet-map">
      {items.map((item) => (
        <button
          key={item.vehicle.id}
          onClick={() => onSelectVehicle(item.vehicle.id)}
          type="button"
        >
          map {item.vehicle.id}
        </button>
      ))}
    </div>
  ),
}));

const activeItem = (overrides: Partial<FleetLiveItem> = {}): FleetLiveItem => ({
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
    geometry: { type: "LineString", coordinates: [[-96.2, 19.1], [-96.15, 19.15]] },
    totalOrders: 4,
    deliveredOrders: 2,
  },
  position: {
    latitude: 19.15,
    longitude: -96.15,
    accuracyMeters: 12,
    speedKph: 32.2,
    headingDegrees: 185,
    recordedAt: "2026-08-12T16:00:00.000Z",
  },
  stale: false,
  nextStop: { id: "order-1", status: "PENDING", deliveryAddress: "Av. Centro" },
  ...overrides,
});

async function renderPage(): Promise<{ root: Root; container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<FleetLivePage />));
  return { root, container };
}

describe("FleetLivePage", () => {
  beforeEach(() => {
    state.snapshot = {
      serverTime: "2026-08-12T16:01:00.000Z",
      items: [
        activeItem(),
        activeItem({
          vehicle: { id: "vehicle-2", code: "UNIDAD-02", displayName: "Unidad 2", plateNumber: null },
          driver: { id: "driver-2", name: "Driver Two" },
          route: { ...activeItem().route, id: "route-2", name: "Ruta Norte" },
          position: null,
          stale: true,
        }),
      ],
    };
    state.selected = null;
    state.heatmap = null;
    state.refetch.mockReset();
    state.geofenceEvents = [];
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders snapshot metrics, stale state, and does not fake missing speed as zero", async () => {
    const { root, container } = await renderPage();

    expect(container.textContent).toContain("Monitoreo de flota en vivo");
    expect(container.textContent).toContain("UNIDAD-01 · Unidad 1");
    expect(container.textContent).toContain("32.2 km/h");
    expect(container.textContent).toContain("Velocidad no disponible");
    expect(container.textContent).toContain("GPS stale");
    expect(container.textContent).not.toContain("0 km/h");

    await act(async () => root.unmount());
  });

  it("keeps the visible units list and cards constrained to the panel width", async () => {
    const { root, container } = await renderPage();

    const unitsList = container.querySelector('[data-testid="fleet-units-list"]');
    expect(unitsList?.className).toContain("min-w-0");
    expect(unitsList?.className).toContain("overflow-x-hidden");

    const unitButtons = Array.from(
      container.querySelectorAll('[data-testid="fleet-unit-button"]'),
    );
    expect(unitButtons).toHaveLength(2);
    expect(unitButtons.every((button) => button.className.includes("min-w-0"))).toBe(true);

    await act(async () => root.unmount());
  });

  it("synchronizes list selection and client-side route filters", async () => {
    const { root, container } = await renderPage();
    const unitButton = Array.from(
      container.querySelectorAll('[data-testid="fleet-unit-button"]'),
    ).find(
      (button) => button.getAttribute("aria-pressed") === "false",
    ) as HTMLButtonElement | undefined;
    expect(unitButton).toBeTruthy();
    await act(async () => unitButton?.click());
    expect(container.querySelector('[data-testid="fleet-map"]')?.getAttribute("data-selected")).toBe("vehicle-1");
    expect(container.textContent).toContain("Av. Centro");

    const routeSelect = container.querySelector('select[aria-label="Filtrar por ruta"]');
    expect(routeSelect).toBeInstanceOf(HTMLSelectElement);
    await act(async () => {
      (routeSelect as HTMLSelectElement).value = "route-2";
      routeSelect?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("UNIDAD-02 · Unidad 2");
    expect(container.querySelectorAll('[data-testid="fleet-unit-button"]')).toHaveLength(1);
    expect(container.querySelector('[data-testid="fleet-unit-button"]')?.textContent).not.toContain(
      "UNIDAD-01 · Unidad 1",
    );

    await act(async () => root.unmount());
  });

  it("renders backend ENTER and EXIT events in the timeline without administration controls", async () => {
    state.geofenceEvents = [
      {
        eventId: "event-exit",
        type: "EXIT",
        zoneId: "zone-1",
        zoneName: "Zona Centro",
        vehicleId: "vehicle-1",
        vehicleCode: "UNIDAD-01",
        routeId: "route-1",
        latitude: 19.15,
        longitude: -96.15,
        occurredAt: "2026-08-12T16:03:00.000Z",
      },
      {
        eventId: "event-enter",
        type: "ENTER",
        zoneId: "zone-1",
        zoneName: "Zona Centro",
        vehicleId: "vehicle-1",
        vehicleCode: "UNIDAD-01",
        routeId: "route-1",
        latitude: 19.15,
        longitude: -96.15,
        occurredAt: "2026-08-12T16:02:00.000Z",
      },
    ];
    const { root, container } = await renderPage();

    expect(container.textContent).toContain("Entrada");
    expect(container.textContent).toContain("Salida");
    expect(container.textContent).toContain("Zona Centro");
    expect(container.textContent).not.toContain("Nueva zona");
    expect(container.textContent).not.toContain("Editar");

    await act(async () => root.unmount());
  });

  it("toggles the persisted delivery-zone layer without changing fleet state", async () => {
    const { root, container } = await renderPage();
    const toggle = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Zonas de reparto"),
    ) as HTMLButtonElement | undefined;
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => toggle?.click());
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");

    await act(async () => root.unmount());
  });

  it("shows persisted incident details without treating the stop as GPS", async () => {
    state.snapshot = {
      serverTime: "2026-08-12T16:01:00.000Z",
      items: [
        activeItem({
          incidentCountActive: 1,
          incidents: [
            {
              incidentId: "incident-1",
              deliveryOrderId: "order-1",
              routeId: "route-1",
              vehicleId: "vehicle-1",
              driverId: "driver-1",
              status: "OPEN",
              reason: "Cliente no localizado",
              occurredAt: "2026-08-12T16:03:00.000Z",
              position: null,
              stop: { latitude: 19.15, longitude: -96.15 },
            },
          ],
        }),
      ],
    };
    const { root, container } = await renderPage();

    expect(container.textContent).toContain("Incidencias trazables");
    expect(container.textContent).toContain("Pedido order-1");
    expect(container.textContent).toContain("UNIDAD-01 · Driver One");
    expect(container.textContent).toContain("Cliente no localizado");
    expect(container.textContent).toContain("Ubicación de parada");
    expect(container.textContent).not.toContain("GPS disponible");

    await act(async () => root.unmount());
  });

  it("activates historical analytics controls and keeps the realtime panel separate", async () => {
    const { root, container } = await renderPage();
    const toggle = container.querySelector(
      '[data-testid="fleet-analytics-toggle"]',
    ) as HTMLButtonElement;

    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await act(async () => toggle.click());

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("Heatmap persistido");
    expect(container.textContent).toContain("Periodo:");
    expect(container.querySelector('select[aria-label="Métrica de heatmap"]')).toBeTruthy();

    await act(async () => root.unmount());
  });

  it("shows an empty state when the active persisted heatmap has no cells", async () => {
    state.heatmap = { type: "FeatureCollection", features: [] };
    const { root, container } = await renderPage();
    const toggle = container.querySelector(
      '[data-testid="fleet-analytics-toggle"]',
    ) as HTMLButtonElement;

    await act(async () => toggle.click());

    expect(container.textContent).toContain("No hay entregas realizadas en el periodo analizado.");
    await act(async () => root.unmount());
  });

  it("does not expose a traffic control while no provider is available", async () => {
    const { root, container } = await renderPage();

    expect(
      Array.from(container.querySelectorAll("button")).some((button) =>
        button.textContent?.toLocaleLowerCase().includes("tráfico"),
      ),
    ).toBe(false);

    await act(async () => root.unmount());
  });
});
