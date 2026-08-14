// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupplierFormPanel } from "../SupplierFormPanel";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function setNativeValue(element: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  descriptor?.set?.call(element, value);
}

async function renderPanel(): Promise<{
  container: HTMLElement;
  root: Root;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <SupplierFormPanel
        onClose={() => undefined}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
  });
  return { container, root };
}

describe("SupplierFormPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("conserva los espacios mientras se captura el nombre", async () => {
    const { container, root } = await renderPanel();

    try {
      const name = container.querySelectorAll("input")[0];
      if (!(name instanceof HTMLInputElement))
        throw new Error("Supplier name input not found");

      await act(async () => {
        setNativeValue(name, "Granja ");
        name.dispatchEvent(new Event("input", { bubbles: true }));
      });

      expect(name.value).toBe("Granja ");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("limita el teléfono a 10 caracteres", async () => {
    const { container, root } = await renderPanel();

    try {
      const phone = container.querySelectorAll("input")[1];
      if (!(phone instanceof HTMLInputElement))
        throw new Error("Supplier phone input not found");

      expect(phone.maxLength).toBe(10);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("descarta letras mientras se captura el teléfono", async () => {
    const { container, root } = await renderPanel();

    try {
      const phone = container.querySelectorAll("input")[1];
      if (!(phone instanceof HTMLInputElement))
        throw new Error("Supplier phone input not found");

      await act(async () => {
        setNativeValue(phone, "229abc1234");
        phone.dispatchEvent(new Event("input", { bubbles: true }));
      });

      expect(phone.value).toBe("2291234");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });
});
