// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriverNavigationOperationsPanel } from "../components/DriverNavigationOperationsPanel";
import { LogisticsRouteCompletionControl } from "../../rutas-reparto/components/LogisticsRouteCompletionControl";
import { LogisticsStopConfirmationControl } from "../../rutas-reparto/components/LogisticsStopConfirmationControl";
import type { DeliveryRouteDetail, LogisticsStop } from "../../rutas-reparto/types";

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
      accountReceivableVersion: 1,
      outstandingAmount: 425,
      status: "IN_ROUTE",
      stopSequence: 1,
    },
  ],
};

const logisticsStop: LogisticsStop = {
  status: "PENDING",
  inventoryTransferId: "transfer-1",
  transferNumber: `TRF-IDEMP-${"9E51A6937D88C397E8BCFF9".repeat(4)}`,
  transferStatus: "IN_TRANSIT",
  origin: { id: "cedis-1", name: "CEDIS" },
  destination: { id: "branch-1", name: "Boca del Río" },
  items: [],
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("DriverNavigationOperationsPanel", () => {
  it("keeps the active order while delegating collection, evidence and incident actions", () => {
    const onCollect = vi.fn();
    const onCaptureEvidence = vi.fn();
    const onIncident = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DriverNavigationOperationsPanel
          evidence={[]}
          onCaptureEvidence={onCaptureEvidence}
          onClose={vi.fn()}
          onCollect={onCollect}
          onIncident={onIncident}
          onSecondPassCollect={vi.fn()}
          onUpdateStatus={vi.fn()}
          open
          order={route.orders?.[0]}
          route={route}
        />,
      );
    });

    const buttons = [...container.querySelectorAll("button")];
    act(() => {
      buttons.find((button) => button.textContent?.trim() === "Cobro")?.click();
      buttons.find((button) => button.textContent?.trim() === "Evidencia")?.click();
      buttons
        .find((button) => button.textContent?.trim() === "Incidencia")
        ?.click();
    });

    expect(onCollect).toHaveBeenCalledWith(route.orders?.[0]);
    expect(onCaptureEvidence).toHaveBeenCalledWith(route.orders?.[0]);
    expect(onIncident).toHaveBeenCalledWith(route.orders?.[0]);
    expect(container.textContent).toContain("Cliente Centro");

    act(() => root.unmount());
  });

  it("allows the active operations menu to minimize and restore without closing it", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DriverNavigationOperationsPanel
          evidence={[]}
          onCaptureEvidence={vi.fn()}
          onClose={vi.fn()}
          onCollect={vi.fn()}
          onIncident={vi.fn()}
          onSecondPassCollect={vi.fn()}
          onUpdateStatus={vi.fn()}
          open
          order={route.orders?.[0]}
          route={route}
        />,
      );
    });

    expect(
      container.querySelector("[data-navigation-operations-content]"),
    ).not.toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          "button[aria-label='Minimizar acciones operativas']",
        )
        ?.click();
    });

    expect(
      container.querySelector(
        "[data-navigation-operations-minimized='true']",
      ),
    ).not.toBeNull();
    expect(
      [...container.querySelectorAll("button")].some((button) =>
        button.textContent?.trim() === "Cobro",
      ),
    ).toBe(false);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          "button[aria-label='Restaurar acciones operativas']",
        )
        ?.click();
    });

    expect(
      container.querySelector(
        "[data-navigation-operations-minimized='true']",
      ),
    ).toBeNull();
    expect(
      [...container.querySelectorAll("button")].some((button) =>
        button.textContent?.trim() === "Cobro",
      ),
    ).toBe(true);

    act(() => root.unmount());
  });

  it("contains long logistics content and keeps actions fluid on narrow screens", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DriverNavigationOperationsPanel
          evidence={[]}
          onCaptureEvidence={vi.fn()}
          onClose={vi.fn()}
          onCollect={vi.fn()}
          onIncident={vi.fn()}
          onSecondPassCollect={vi.fn()}
          onUpdateStatus={vi.fn()}
          open
          order={null}
          route={{
            ...route,
            name: "CEDIS_SUPPLY",
            type: "CEDIS_SUPPLY",
            orders: [],
          }}
        >
          <div className="grid gap-4">
            <LogisticsStopConfirmationControl
              canConfirm
              isCompleting={false}
              onComplete={vi.fn()}
              routeName="CEDIS_SUPPLY"
              stop={logisticsStop}
            />
            <LogisticsRouteCompletionControl
              isCompleting={false}
              onComplete={vi.fn()}
              routeName="CEDIS_SUPPLY"
              stopCompleted={false}
            />
          </div>
        </DriverNavigationOperationsPanel>,
      );
    });

    const operations = container.querySelector("[data-navigation-operations]");
    const content = container.querySelector(
      "[data-navigation-operations-content]",
    );
    const transfer = [...container.querySelectorAll("p")].find(
      (paragraph) => paragraph.textContent === logisticsStop.transferNumber,
    );
    const actionButtons = [...container.querySelectorAll("button")].filter(
      (button) =>
        button.textContent?.includes("Confirmar recepción") ||
        button.textContent?.includes("Terminar ruta"),
    );

    expect(operations?.className).toContain("overflow-x-hidden");
    expect(content?.className).toContain("min-w-0");
    expect(transfer?.className).toContain("[overflow-wrap:anywhere]");
    expect(actionButtons).toHaveLength(2);
    for (const button of actionButtons) {
      expect(button.className).toContain("w-full");
      expect(button.className).toContain("min-w-0");
    }

    act(() => root.unmount());
  });
});
