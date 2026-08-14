// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AccountReceivable } from "../types";

const mockState = vi.hoisted(() => ({
  canReceiveCash: true,
  registerPayment: {
    error: null,
    isPending: false,
    mutateAsync: vi.fn(),
  },
  cashSession: {
    data: {
      id: "cash-shift-1",
      pointOfSaleDailyCloseId: "close-1",
      terminal: { name: "Caja principal" },
    },
    isLoading: false,
  },
}));

vi.mock("../hooks/useAccountsReceivable", () => ({
  useRegisterReceivablePayment: () => mockState.registerPayment,
}));

vi.mock("../../cierre-diario/hooks", () => ({
  useOpenCashSession: () => mockState.cashSession,
}));

vi.mock("../../auth", () => ({
  PERMISSIONS: { collectionsReceiveCash: "collections.receive_cash" },
  hasPermission: () => mockState.canReceiveCash,
  useAuth: () => ({ user: { role: "COLLECTIONS" } }),
}));

vi.mock("@/components/shared/confirmation-dialog", () => ({
  ConfirmationDialog: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("../../../lib/deviceIdentity", () => ({
  getPosDeviceId: () => "device-1",
}));

import { PaymentRegistrationDialog } from "../components/PaymentRegistrationDialog";

const account = {
  id: "ar-1",
  customerId: "customer-1",
  customerName: "Cliente de prueba",
  originalAmount: "100.00",
  outstandingAmount: "100.00",
  saleDate: "2026-08-01T00:00:00.000Z",
  dueDate: "2026-08-15T00:00:00.000Z",
  status: "UNPAID",
  agingStatus: "CURRENT",
  saleLocationId: "location-1",
} as AccountReceivable;

describe("PaymentRegistrationDialog", () => {
  it("presenta métodos de pago en español y captura la siguiente fecha de pago", () => {
    const html = renderToStaticMarkup(
      <PaymentRegistrationDialog account={account} onClose={vi.fn()} />,
    );

    expect(html).toContain("Efectivo");
    expect(html).toContain("Transferencia");
    expect(html).toContain("Depósito");
    expect(html).toContain("Tarjeta");
    expect(html).toContain("Cheque");
    expect(html).toContain("Siguiente fecha de pago");
    expect(html).toContain('type="date"');
    expect(html).not.toContain("Documento aplicado");
  });

  it("no muestra banco ni referencia cuando el método inicial es efectivo", () => {
    mockState.canReceiveCash = true;
    const html = renderToStaticMarkup(
      <PaymentRegistrationDialog account={account} onClose={vi.fn()} />,
    );

    expect(html).not.toContain(">Banco<");
    expect(html).not.toContain(">Referencia<");
  });

  it("muestra banco y referencia para métodos no monetarios", () => {
    mockState.canReceiveCash = false;
    const html = renderToStaticMarkup(
      <PaymentRegistrationDialog account={account} onClose={vi.fn()} />,
    );

    expect(html).toContain(">Banco<");
    expect(html).toContain(">Referencia<");
    mockState.canReceiveCash = true;
  });
});
