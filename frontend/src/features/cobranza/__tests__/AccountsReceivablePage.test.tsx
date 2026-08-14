import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockAccount = {
  id: "ar-1",
  customerId: "customer-1",
  customerName: "Cliente de prueba",
  originalAmount: "100.00",
  outstandingAmount: "100.00",
  saleDate: "2026-08-01T00:00:00.000Z",
  dueDate: "2026-08-15T00:00:00.000Z",
  status: "UNPAID",
  agingStatus: "CURRENT",
} as const;

vi.mock("../hooks/useAccountsReceivable", () => ({
  useAccountsReceivable: () => ({
    data: [mockAccount],
    error: null,
    isLoading: false,
  }),
}));

vi.mock("../../auth", () => ({
  useAuth: () => ({ user: { role: "SELLER" } }),
}));

vi.mock("../components/OverdueAccountsView", () => ({
  OverdueAccountsView: () => null,
}));
vi.mock("../components/CustomerBalanceView", () => ({
  CustomerBalanceView: () => null,
}));
vi.mock("../components/PaymentRegistrationDialog", () => ({
  PaymentRegistrationDialog: () => null,
}));
vi.mock("../../../components/shared/operational-catalogs", () => ({
  MiniAjaxSelect: () => <input aria-label="Cliente" />,
}));
vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

import { AccountsReceivablePage } from "../pages/AccountsReceivablePage";

describe("AccountsReceivablePage", () => {
  it("presenta el botón de pagar como acción primaria visible", () => {
    const html = renderToStaticMarkup(<AccountsReceivablePage />);
    const paymentButton = html.match(
      /<button[^>]*aria-label="Registrar pago[^>]*>/,
    )?.[0];

    expect(html).toContain(">Pagar<");
    expect(paymentButton).toBeDefined();
    expect(paymentButton).not.toContain(' disabled=""');
    expect(html).toContain("bg-[var(--erp-info)]");
    expect(html).toContain("focus-visible:ring-4");
  });
});
