import { apiClient } from "../../lib/api";

type Envelope<T> = { data: T };
const headers = (token: string | null) => ({
  authorization: `Bearer ${token ?? ""}`,
});
const idempotencyHeaders = (token: string | null, idempotencyKey: string) => ({
  ...headers(token),
  "idempotency-key": idempotencyKey,
});

export type CashTerminal = {
  id: string;
  operationalLocationId: string;
  code: string;
  name: string;
  deviceId: string;
  isActive: boolean;
};

export type CashShift = {
  id: string;
  terminalId: string;
  operationalLocationId: string;
  pointOfSaleDailyCloseId: string;
  cashierUserId: string;
  businessDate: string;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  openedAt: string;
  initialCashFund: string;
  initialCashIn: string;
  initialCashOut: string;
  cashCountedTotal?: string | null;
  cashDifferenceTotal?: string | null;
  closeMode?: "CASHIER" | "ADMINISTRATIVE" | null;
  closeReason?: string | null;
  closedAt?: string | null;
  terminal: CashTerminal;
  cashier: { id: string; name: string };
};

export type CashTerminalActivation = {
  activationCode: string;
  expiresAt: string;
  operationalLocationId: string;
  deviceId: string;
};

export const cashManagementService = {
  listTerminals: async (
    operationalLocationId: string,
    deviceId: string,
    token: string | null,
  ) => {
    const query = new URLSearchParams({
      operationalLocationId,
      deviceId,
      isActive: "true",
    });
    return (
      await apiClient.get<Envelope<CashTerminal[]>>(
        `/cash-terminals?${query}`,
        { headers: headers(token) },
      )
    ).data;
  },
  requestTerminalActivation: async (
    body: { deviceId: string; operationalLocationId: string },
    token: string | null,
  ) =>
    (
      await apiClient.post<Envelope<CashTerminalActivation>, typeof body>(
        "/cash-terminal-activations",
        { body, headers: headers(token) },
      )
    ).data,
  currentShift: async (deviceId: string, token: string | null) => {
    const query = new URLSearchParams({ deviceId });
    return (
      await apiClient.get<Envelope<CashShift | null>>(
        `/cash-shifts/current?${query}`,
        { headers: headers(token) },
      )
    ).data;
  },
  openShift: async (
    body: {
      terminalId: string;
      deviceId: string;
      businessDate: string;
      initialCashFund: number;
      initialCashIn: number;
      initialCashOut: number;
      notes?: string;
    },
    token: string | null,
  ) =>
    (
      await apiClient.post<Envelope<CashShift>, typeof body>("/cash-shifts", {
        body,
        headers: headers(token),
      })
    ).data,
  closeShift: async (
    shiftId: string,
    body: {
      deviceId?: string;
      cashCountedTotal: number;
      administrativeReason?: string;
    },
    token: string | null,
  ) =>
    (
      await apiClient.patch<Envelope<CashShift>, typeof body>(
        `/cash-shifts/${shiftId}/close`,
        { body, headers: headers(token) },
      )
    ).data,
  recordMovement: async (
    shiftId: string,
    body: {
      deviceId: string;
      type: "EXPENSE" | "CASH_IN" | "CASH_OUT";
      amount: number;
      reason: string;
      reference?: string;
    },
    token: string | null,
    idempotencyKey: string,
  ) =>
    (
      await apiClient.post<Envelope<unknown>, typeof body>(
        `/cash-shifts/${shiftId}/movements`,
        { body, headers: idempotencyHeaders(token, idempotencyKey) },
      )
    ).data,
};
