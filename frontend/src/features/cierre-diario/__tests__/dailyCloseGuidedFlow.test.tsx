// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DailyCloseGuidedFlow } from "../DailyCloseGuidedFlow";
import { DailyCloseHeader } from "../DailyCloseHeader";
import type { DailyClose } from "../types";

const close: DailyClose = {
  id: "close-1",
  operationalLocationId: "location-1",
  businessDate: "2026-07-22",
  status: "REVIEWED",
  cashSessionStatus: "CLOSED",
  terminalIdentifier: "Caja 01",
  openedAt: "2026-07-22T08:03:00.000Z",
  initialCashFund: "1500",
  initialCashIn: "0",
  initialCashOut: "0",
  version: 5,
  operationalLocation: {
    id: "location-1",
    name: "Sucursal Centro",
    code: "CENTRO",
  },
  totalInputKg: "30",
  totalSoldKg: "20",
  totalRemainingKg: "10",
  totalShortageKg: "1",
  totalSurplusKg: "0",
  scaleReportedKg: "19.5",
  scaleDifferenceKg: "-0.5",
  cashTotal: "300",
  cardVoucherTotal: "400",
  transferTotal: "12500",
  expenseTotal: "80",
  grossSalesTotal: "13200",
  netCashExpected: "220",
  cashCountedTotal: "210",
  cashDifferenceTotal: "-10",
  dataAsOf: "2026-07-22T14:00:00.000Z",
  sales: [
    {
      saleNumber: "V-100",
      documentType: "SIMPLE_NOTE",
      requiresAdministrativeInvoice: true,
      total: "13200",
      billingRequests: [
        {
          id: "billing-1",
          status: "REQUESTED",
          requestedAt: "2026-07-22T12:00:00.000Z",
        },
      ],
    },
  ],
  differences: [],
};

function render(step: "operations" | "signoff") {
  return renderToStaticMarkup(
    <DailyCloseGuidedFlow
      activeStep={step}
      canAuthorizeDifferences
      canClose
      canEditDifferences
      canEditInventory
      canViewFinancials
      canViewInventory
      canViewProfit
      close={close}
      inventoryReconciliation={null}
      onAuthorizeDifference={vi.fn()}
      onDeleteInventoryCount={vi.fn()}
      onJustifyDifference={vi.fn()}
      onRequestClose={vi.fn()}
      onSaveInventoryCount={vi.fn()}
      onStepChange={vi.fn()}
      products={[]}
      validationResult={null}
    />,
  );
}

describe("guided daily close flow", () => {
  it("deja que Control de jornada desaparezca al desplazar el contenido", () => {
    const html = renderToStaticMarkup(<DailyCloseHeader close={close} />);

    expect(html).toContain("relative z-0");
    expect(html).not.toContain("sticky");
  });

  it("presents the six operational steps while keeping the current detail focused", () => {
    const html = render("operations");

    expect(html).toContain("Verificar operaciones");
    expect(html).toContain("Conciliar inventario");
    expect(html).toContain("Revisar báscula");
    expect(html).toContain("Contar caja");
    expect(html).toContain("Revisar diferencias");
    expect(html).toContain("Firmar y cerrar");
    expect(html).toContain("Ventas incluidas");
  });

  it("summarizes kilos, scale, inventory, expenses, sales, billable notes, and unresolved differences before signing", () => {
    const html = render("signoff");

    expect(html).toContain("Kilos del día");
    expect(html).toContain("Báscula");
    expect(html).toContain("Inventario");
    expect(html).toContain("Gastos");
    expect(html).toContain("Ventas");
    expect(html).toContain("Notas facturables");
    expect(html).toContain("Diferencias sin resolver");
    expect(html).toContain("Firmar y cerrar");
  });
});
