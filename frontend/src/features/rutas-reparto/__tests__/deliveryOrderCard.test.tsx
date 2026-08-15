// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeliveryOrderCard } from "../components/DeliveryOrderCard";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
  root = undefined;
});

describe("DeliveryOrderCard collection controls", () => {
  it("enables collection and exposes the per-order balances", async () => {
    const onCollect = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <DeliveryOrderCard
          evidence={[]}
          onCaptureEvidence={vi.fn()}
          onCollect={onCollect}
          onIncident={vi.fn()}
          onSecondPassCollect={vi.fn()}
          onUpdateStatus={vi.fn()}
          order={{
            id: "order-1",
            accountReceivableId: "ar-1",
            customerName: "Pollería Centro",
            saleNumber: "SALE-000001",
            status: "DELIVERED",
            outstandingAmount: 300,
            derivedCollectedAmount: 200,
          }}
        />,
      );
    });

    expect(container.textContent).toContain("$300.00");
    expect(container.textContent).toContain("$200.00");

    const collectButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Cobro",
    );
    expect(collectButton?.disabled).toBe(false);

    await act(async () => collectButton?.click());
    expect(onCollect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "order-1" }),
    );
  });
});
