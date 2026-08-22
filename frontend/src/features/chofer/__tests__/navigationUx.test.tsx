// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationDeliverySheet } from "../components/NavigationDeliverySheet";
import { NavigationInstructionBanner } from "../components/NavigationInstructionBanner";
import { NavigationMapControls } from "../components/NavigationMapControls";
import type {
  DeliveryRouteDetail,
  DriverNavigationResponse,
} from "../../rutas-reparto/types";

const route: DeliveryRouteDetail = {
  id: "route-1",
  name: "Ruta Centro",
  driverId: "driver-1",
  status: "IN_PROGRESS",
  type: "SALE_DELIVERY",
  orders: [
    {
      id: "order-1",
      saleNumber: "SALE-100",
      customerName: "Cliente Centro",
      deliveryAddress: "Av. Centro 10",
      accountReceivableId: "ar-1",
      outstandingAmount: 425,
      status: "PENDING",
      stopSequence: 2,
      latitude: 19.17,
      longitude: -96.13,
    },
  ],
};

const target = {
  kind: "DELIVERY_ORDER" as const,
  id: "order-1",
  label: "Cliente Centro",
  address: "Av. Centro 10",
  latitude: 19.17,
  longitude: -96.13,
  stopSequence: 2,
};

const navigation: DriverNavigationResponse = {
  routeId: "route-1",
  target,
  geometry: {
    type: "LineString",
    coordinates: [
      [-96.14, 19.18],
      [-96.13, 19.17],
    ],
  },
  distanceMeters: 350,
  durationSeconds: 95,
  steps: [],
};

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("navigation presentation", () => {
  it("renders the current maneuver, distance and street in the top banner", () => {
    const { container, root } = mount(
      <NavigationInstructionBanner
        routeAvailable
        step={{
          distanceMeters: 350,
          durationSeconds: 22,
          streetName: "Avenida Independencia",
          maneuver: {
            type: "TURN",
            modifier: "RIGHT",
            location: { latitude: 19.17, longitude: -96.13 },
            bearingBefore: 90,
            bearingAfter: 180,
            exit: null,
          },
        }}
      />,
    );

    expect(container.textContent).toContain("En 350 m");
    expect(container.textContent).toContain("Gira a la derecha");
    expect(container.textContent).toContain("Avenida Independencia");
    expect(container.querySelector("[aria-live='polite']")).not.toBeNull();
    act(() => root.unmount());
  });

  it("renders recalculating and no-connection states without hiding the last route", () => {
    const { container, root } = mount(
      <NavigationInstructionBanner
        isCalculating
        isOffline
        routeAvailable
      />,
    );
    expect(container.textContent).toContain("Recalculando");
    expect(container.textContent).toContain("último trazado válido");
    act(() => root.unmount());
  });

  it("renders the permission request state before the first GPS reading", () => {
    const { container, root } = mount(
      <NavigationInstructionBanner isRequestingPermission routeAvailable />,
    );
    expect(container.textContent).toContain("Solicitando permiso");
    act(() => root.unmount());
  });

  it("keeps the last route visible when recalculation fails", () => {
    const { container, root } = mount(
      <NavigationInstructionBanner
        recalculationFailed
        routeAvailable
      />,
    );
    expect(container.textContent).toContain("No se pudo recalcular");
    expect(container.textContent).toContain("última ruta válida");
    act(() => root.unmount());
  });

  it("renders delivery data and requires explicit start action", () => {
    const onStart = vi.fn();
    const { container, root } = mount(
      <NavigationDeliverySheet
        isTracking={false}
        navigation={navigation}
        onArrived={vi.fn()}
        onOpenDelivery={vi.fn()}
        onStart={onStart}
        route={route}
        target={target}
      />,
    );

    expect(container.textContent).toContain("Parada 2");
    expect(container.textContent).toContain("Cliente Centro");
    expect(container.textContent).toContain("SALE-100");
    expect(container.textContent).toContain("Av. Centro 10");
    expect(container.textContent).toContain("350 m");
    expect(container.textContent).toContain("2 min");
    expect(container.textContent).toContain("$425.00");
    const startButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Iniciar navegación"),
    );
    expect(startButton).toBeTruthy();
    act(() => startButton?.click());
    expect(onStart).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("minimizes the active stop panel to reveal the map and restores its details", () => {
    const { container, root } = mount(
      <NavigationDeliverySheet
        isTracking
        navigation={navigation}
        onArrived={vi.fn()}
        onOpenDelivery={vi.fn()}
        onStart={vi.fn()}
        route={route}
        target={target}
      />,
    );

    expect(container.querySelector("[data-navigation-sheet='active']"))
      .not.toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          "button[aria-label='Minimizar detalle de la parada']",
        )
        ?.click();
    });

    expect(container.querySelector("[data-navigation-sheet='active']"))
      .toBeNull();
    expect(
      container.querySelector("[data-navigation-sheet='minimized']"),
    ).not.toBeNull();
    expect(container.textContent).toContain("Cliente Centro");
    expect(container.textContent).not.toContain("Saldo por cobrar");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          "button[aria-label='Mostrar detalle completo de la parada']",
        )
        ?.click();
    });

    expect(container.querySelector("[data-navigation-sheet='minimized']"))
      .toBeNull();
    expect(container.querySelector("[data-navigation-sheet='active']"))
      .not.toBeNull();
    expect(container.textContent).toContain("$425.00");

    act(() => root.unmount());
  });

  it("switches the delivery CTA after GPS has started", () => {
    const onOpenDelivery = vi.fn();
    const { container, root } = mount(
      <NavigationDeliverySheet
        isNearDestination
        isTracking
        navigation={navigation}
        onArrived={vi.fn()}
        onOpenDelivery={onOpenDelivery}
        onStart={vi.fn()}
        route={route}
        target={target}
      />,
    );
    const button = [...container.querySelectorAll("button")].find((item) =>
      item.textContent?.includes("Abrir entrega"),
    );
    expect(button).toBeTruthy();
    act(() => button?.click());
    expect(onOpenDelivery).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("keeps delivery and logistics arrival actions disabled away from a reliable destination position", () => {
    const onOpenDelivery = vi.fn();
    const { container, root } = mount(
      <NavigationDeliverySheet
        isTracking
        navigation={navigation}
        onArrived={vi.fn()}
        onOpenDelivery={onOpenDelivery}
        onStart={vi.fn()}
        route={route}
        target={target}
      />,
    );

    const deliveryButton = [...container.querySelectorAll("button")].find(
      (item) => item.textContent?.includes("Abrir entrega"),
    ) as HTMLButtonElement | undefined;
    expect(deliveryButton?.disabled).toBe(true);
    act(() => deliveryButton?.click());
    expect(onOpenDelivery).not.toHaveBeenCalled();
    act(() => root.unmount());

    const onArrived = vi.fn();
    const logisticsRoute: DeliveryRouteDetail = {
      ...route,
      type: "BRANCH_RETURN",
      orders: [],
      logisticsStop: {
        status: "PENDING",
        inventoryTransferId: "transfer-1",
        transferNumber: "TR-0001",
        transferStatus: "IN_TRANSIT",
        origin: null,
        destination: {
          id: "cedis-1",
          name: "CEDIS",
          latitude: target.latitude,
          longitude: target.longitude,
        },
        items: [],
      },
    };
    const logisticsTarget = {
      kind: "LOGISTICS_STOP" as const,
      id: "transfer-1",
      label: "CEDIS",
      latitude: target.latitude,
      longitude: target.longitude,
    };
    const logisticsMount = mount(
      <NavigationDeliverySheet
        isTracking
        navigation={{ ...navigation, target: logisticsTarget }}
        onArrived={onArrived}
        onOpenDelivery={vi.fn()}
        onStart={vi.fn()}
        route={logisticsRoute}
        target={logisticsTarget}
      />,
    );
    const arrivedButton = [...logisticsMount.container.querySelectorAll("button")].find(
      (item) => item.textContent?.includes("Llegué"),
    ) as HTMLButtonElement | undefined;
    expect(arrivedButton?.disabled).toBe(true);
    act(() => arrivedButton?.click());
    expect(onArrived).not.toHaveBeenCalled();
    act(() => logisticsMount.root.unmount());
  });

  it("only displays the near-destination hint and never changes delivery state automatically", () => {
    const onOpenDelivery = vi.fn();
    const { container, root } = mount(
      <NavigationDeliverySheet
        isNearDestination
        isTracking
        navigation={navigation}
        onArrived={vi.fn()}
        onOpenDelivery={onOpenDelivery}
        onStart={vi.fn()}
        route={route}
        target={target}
      />,
    );

    expect(container.textContent).toContain("Estás cerca del destino");
    expect(onOpenDelivery).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Abrir entrega");
    act(() => root.unmount());
  });

  it("exposes comfortable recenter and overview buttons", () => {
    const onRecenter = vi.fn();
    const onOverview = vi.fn();
    const { container, root } = mount(
      <NavigationMapControls onOverview={onOverview} onRecenter={onRecenter} />,
    );
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons).toHaveLength(2);
    expect(buttons[0].getAttribute("aria-label")).toBe(
      "Recentrar en mi ubicación",
    );
    expect(buttons[1].getAttribute("aria-label")).toBe(
      "Mostrar vista general de la ruta",
    );
    act(() => {
      buttons[0].click();
      buttons[1].click();
    });
    expect(onRecenter).toHaveBeenCalledTimes(1);
    expect(onOverview).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
