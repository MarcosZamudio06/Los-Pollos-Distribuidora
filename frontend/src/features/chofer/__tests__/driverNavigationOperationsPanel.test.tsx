// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DriverNavigationOperationsPanel } from "../components/DriverNavigationOperationsPanel";
import type { DeliveryRouteDetail } from "../../rutas-reparto/types";

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
});
