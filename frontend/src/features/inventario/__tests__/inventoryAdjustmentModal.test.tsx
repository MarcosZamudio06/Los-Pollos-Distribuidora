// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryAdjustmentModal } from "../components/InventoryAdjustmentModal";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useProducts", () => ({
  useCreateInventoryAdjustment: () => ({
    isPending: false,
    mutateAsync,
  }),
}));

function changeValue(element: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function changeText(element: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}

let root: Root | undefined;

describe("InventoryAdjustmentModal idempotency", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "adjustment-ui-key" });
    mutateAsync.mockReset().mockRejectedValueOnce(new Error("timeout"));
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    root = undefined;
  });

  it("conserva la clave al reintentar después de un timeout", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () =>
      root?.render(
        <InventoryAdjustmentModal
          productId="product-1"
          locationId="location-1"
          onClose={vi.fn()}
        />,
      ),
    );

    await act(async () => {
      changeValue(
        container.querySelector<HTMLInputElement>('input[type="number"]')!,
        "2.5",
      );
    });
    const reason = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => changeText(reason, "Physical count correction"));

    const form = container.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    mutateAsync.mockResolvedValueOnce({ id: "movement-1" });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync.mock.calls[1][0].idempotencyKey).toBe(
      mutateAsync.mock.calls[0][0].idempotencyKey,
    );
  });
});
