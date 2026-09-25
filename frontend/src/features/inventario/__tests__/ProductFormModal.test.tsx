// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductFormModal } from "../components/ProductFormModal";
import type { Product } from "../types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useProducts", () => ({
  useSaveProduct: () => ({ isPending: false, mutateAsync }),
}));

function changeInput(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

let root: Root | undefined;

describe("ProductFormModal barcode field", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    document.body.innerHTML = "";
    root = undefined;
  });

  it("accepts manual, pasted, and HID-like barcode input when creating", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () =>
      root?.render(<ProductFormModal onClose={vi.fn()} />),
    );

    const barcodeInput = container.querySelector<HTMLInputElement>(
      "#product-form-barcode",
    );
    expect(barcodeInput).not.toBeNull();
    expect(barcodeInput?.value).toBe("");

    await act(async () => {
      changeInput(barcodeInput as HTMLInputElement, "  AbC-128/42  ");
    });
    expect(barcodeInput?.value).toBe("  AbC-128/42  ");

    await act(async () => {
      barcodeInput?.focus();
      barcodeInput?.blur();
    });
    expect(barcodeInput?.value).toBe("AbC-128/42");
  });

  it("loads the barcode in edit mode so it can be replaced", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const product: Product = {
      id: "product-1",
      name: "Pechuga de pollo",
      barcode: "UPC-A-42",
      salePrice: 120,
      unit: "KG",
      isActive: true,
    };

    await act(async () =>
      root?.render(<ProductFormModal product={product} onClose={vi.fn()} />),
    );

    const barcodeInput = container.querySelector<HTMLInputElement>(
      "#product-form-barcode",
    );
    expect(barcodeInput?.value).toBe("UPC-A-42");

    await act(async () => {
      changeInput(barcodeInput as HTMLInputElement, "EAN-13-UPDATED");
    });
    expect(barcodeInput?.value).toBe("EAN-13-UPDATED");
  });
});
