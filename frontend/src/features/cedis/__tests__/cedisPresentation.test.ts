import { describe, expect, it } from "vitest";
import { Money } from "../../../lib/money";
import {
  branchDetailHref,
  cashState,
  formatPhysicalQuantity,
  salesDifference,
} from "../cedisPresentation";
import type { CedisDashboardCard } from "../types";

const card: CedisDashboardCard = {
  branch: {
    address: "Av. Centro 10",
    code: "S01",
    id: "branch-1",
    latitude: 19.123456,
    longitude: -96.123456,
    name: "Sucursal Centro",
  },
  cash: { counted: "695.00", difference: "-5.00", expected: "700.00" },
  cycle: {
    businessDate: "2026-08-05",
    id: "cycle-1",
    status: "CLOSED",
    version: 2,
  },
  financial: { actualSales: "900.00", expectedSales: "1000.00" },
  lastActivityAt: null,
  physical: {
    actualSoldKg: "24.000",
    actualSoldPieces: "8.000",
    deliveredKg: "25.500",
    deliveredPieces: "10.000",
    expectedSoldKg: "24.500",
    expectedSoldPieces: "9.000",
    returnedKg: "1.000",
    returnedPieces: "1.000",
  },
  warningCount: 1,
};

describe("CEDIS presentation", () => {
  it("calcula la diferencia de venta con aritmética monetaria exacta", () => {
    expect(salesDifference(card)?.toString()).toBe("-100.00");
    expect(salesDifference(card)?.compare(Money.from("-100.00"))).toBe(0);
  });

  it("mantiene separadas las dimensiones de kilos y piezas", () => {
    expect(formatPhysicalQuantity("25.500", "10.000")).toBe(
      "25.5 kg · 10 piezas",
    );
  });

  it("deriva el estado de caja desde el conteo y su diferencia", () => {
    expect(cashState(card)).toEqual({ label: "Faltante", tone: "red" });
    expect(
      cashState({ ...card, cash: { ...card.cash!, difference: "0.00" } }),
    ).toEqual({ label: "Cuadrada", tone: "green" });
    expect(
      cashState({ ...card, cash: { ...card.cash!, counted: null } }),
    ).toEqual({ label: "Pendiente de conteo", tone: "amber" });
  });

  it("construye una URL de detalle sin botones anidados", () => {
    expect(
      branchDetailHref(card, {
        businessDate: "2026-08-05",
        cedisLocationId: "cedis-1",
      }),
    ).toBe(
      "/cedis/branches/branch-1?cedis=cedis-1&date=2026-08-05&cycle=cycle-1",
    );
  });
});
