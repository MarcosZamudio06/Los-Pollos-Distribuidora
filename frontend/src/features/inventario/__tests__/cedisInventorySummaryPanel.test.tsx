// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CedisInventorySummaryPanel } from "../components/CedisInventorySummaryPanel";

vi.mock("../hooks/useProducts", () => ({
  useInventoryLocations: () => ({
    data: [
      { id: "cedis-1", name: "Matriz CEDIS", type: "DISTRIBUTION_CENTER" },
    ],
    error: null,
    isLoading: false,
  }),
  useCedisInventorySummary: () => ({
    data: {
      cedis: { id: "cedis-1", name: "Matriz CEDIS" },
      businessDate: "2026-08-05",
      generatedAt: "2026-08-05T12:00:00.000Z",
      dataAsOf: "2026-08-05T12:00:00.000Z",
      timeZone: "America/Mexico_City",
      totals: {
        opening: { kg: "10.000", pieces: "0.000" },
        receivedFromSuppliers: { kg: "25.000", pieces: "0.000" },
        sentToBranches: { kg: "8.000", pieces: "0.000" },
        returnedFromBranches: { kg: "2.000", pieces: "0.000" },
        otherNet: { kg: "0.000", pieces: "0.000" },
        remaining: { kg: "29.000", pieces: "0.000" },
      },
      items: [
        {
          productId: "product-1",
          productName: "Pollo mixto",
          sku: "POLLO-1",
          unit: "KG",
          opening: { kg: "10.000", pieces: "0.000" },
          receivedFromSuppliers: { kg: "25.000", pieces: "0.000" },
          sentToBranches: { kg: "8.000", pieces: "0.000" },
          returnedFromBranches: { kg: "2.000", pieces: "0.000" },
          otherNet: { kg: "0.000", pieces: "0.000" },
          remaining: { kg: "29.000", pieces: "0.000" },
        },
      ],
    },
    error: null,
    isLoading: false,
  }),
}));

describe("CedisInventorySummaryPanel", () => {
  it("muestra recibido, enviado, devuelto y restante del CEDIS", () => {
    const html = renderToStaticMarkup(<CedisInventorySummaryPanel />);

    expect(html).toContain("Recibido de proveedores");
    expect(html).toContain("Enviado a sucursales");
    expect(html).toContain("Devuelto al CEDIS");
    expect(html).toContain("Restante físico");
    expect(html).toContain("25.000 kg");
    expect(html).toContain("29.000 kg");
    expect(html).toContain("Pollo mixto");
  });
});
