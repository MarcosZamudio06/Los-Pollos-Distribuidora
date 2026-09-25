// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductQrModal } from "../components/ProductQrModal";
import type { Product } from "../types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("qrcode", () => ({
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,transient"),
  toString: vi.fn().mockResolvedValue("<svg aria-label=\"qr\"></svg>"),
}));

const product: Product = {
  id: "cm123456",
  name: "Pechuga de pollo",
  sku: "PECH-001",
  barcode: "7501234567890",
  salePrice: 120,
  unit: "KG",
  isActive: true,
};

let root: Root | undefined;

describe("ProductQrModal", () => {
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    document.body.innerHTML = "";
    root = undefined;
  });

  it("shows the product details and generated QR actions without changing the product shape", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ProductQrModal onClose={vi.fn()} product={product} />);
    });

    expect(container.textContent).toContain("Generar QR");
    expect(container.textContent).toContain("Pechuga de pollo");
    expect(container.textContent).toContain("PECH-001");
    expect(container.textContent).toContain("7501234567890");
    expect(container.textContent).toContain("cm123456");
    expect(container.textContent).toContain("ERP:PRODUCT:1:cm123456");
    expect(container.querySelector('img[alt="Código QR de Pechuga de pollo"]')).not.toBeNull();
    expect(container.textContent).toContain("Descargar PNG");
    expect(container.textContent).toContain("Descargar SVG");
    expect(container.textContent).toContain("Imprimir etiqueta");
  });
});
