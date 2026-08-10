import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiClientError } from "../../../lib/api";
import { cashManagementService } from "../cashManagementService";
import { dailyCloseErrorMessage } from "../dailyCloseErrors";
import { CashShiftSummary } from "../CashShiftSummary";
import type { DailyClose } from "../types";

const closeWithOpenShift = {
  cashShifts: [
    {
      id: "shift-1",
      terminalId: "terminal-1",
      cashierUserId: "cashier-1",
      businessDate: "2026-07-22",
      status: "OPEN",
      openedAt: "2026-07-22T08:00:00.000Z",
      initialCashFund: "100",
      initialCashIn: "20",
      initialCashOut: "0",
      terminal: { id: "terminal-1", code: "C01", name: "Caja 01" },
      cashier: { id: "cashier-1", name: "Cajero 1" },
    },
  ],
} as DailyClose;

const closeWithClosedShift = {
  cashShifts: [
    {
      id: "shift-closed-1",
      terminalId: "terminal-1",
      cashierUserId: "cashier-1",
      businessDate: "2026-07-22",
      status: "CLOSED",
      openedAt: "2026-07-22T08:00:00.000Z",
      closedAt: "2026-07-22T18:00:00.000Z",
      initialCashFund: "100",
      initialCashIn: "20",
      initialCashOut: "0",
      cashCountedTotal: "165",
      cashDifferenceTotal: "5",
      closeMode: "CASHIER",
      terminal: { id: "terminal-1", code: "C01", name: "Caja 01" },
      cashier: { id: "cashier-1", name: "Cajero 1" },
    },
  ],
} as DailyClose;

describe("cash shift closure contract", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a normal shift close through the PATCH endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { id: "shift-1", status: "CLOSED" } }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      ),
    );

    await expect(
      cashManagementService.closeShift(
        "shift-1",
        {
          deviceId: "device-1",
          cashCountedTotal: 165,
        },
        "access-token",
      ),
    ).resolves.toMatchObject({ id: "shift-1", status: "CLOSED" });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/cash-shifts/shift-1/close",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ deviceId: "device-1", cashCountedTotal: 165 }),
      }),
    );
  });

  it("allows administrative closure without sending a terminal device", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: {
              id: "shift-1",
              status: "CLOSED",
              closeMode: "ADMINISTRATIVE",
            },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      ),
    );

    await cashManagementService.closeShift(
      "shift-1",
      {
        cashCountedTotal: 145,
        administrativeReason: "Terminal inaccesible",
      },
      "access-token",
    );

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/cash-shifts/shift-1/close",
      expect.objectContaining({
        body: JSON.stringify({
          cashCountedTotal: 145,
          administrativeReason: "Terminal inaccesible",
        }),
      }),
    );
  });

  it("sends the current device and password to reopen the same shift", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ data: { id: "shift-closed-1", status: "OPEN" } }),
          {
            headers: { "content-type": "application/json" },
            status: 200,
          },
        ),
      ),
    );

    await expect(
      cashManagementService.reopenShift(
        "shift-closed-1",
        { deviceId: "device-1", password: "valid-password" },
        "access-token",
      ),
    ).resolves.toMatchObject({ id: "shift-closed-1", status: "OPEN" });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/cash-shifts/shift-closed-1/reopen",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          deviceId: "device-1",
          password: "valid-password",
        }),
      }),
    );
  });

  it("maps the open-shift code to operational copy instead of exposing the backend code", () => {
    const error = new ApiClientError("DAILY_CLOSE_HAS_OPEN_SHIFTS", 409, {
      error: "DAILY_CLOSE_HAS_OPEN_SHIFTS",
      message: "DAILY_CLOSE_HAS_OPEN_SHIFTS",
      statusCode: 409,
    });

    expect(dailyCloseErrorMessage(error, "fallback")).toBe(
      "Hay turnos de caja abiertos. Cierra todos los turnos antes de finalizar la jornada.",
    );
  });

  it("shows the open shift and the cashier count action", () => {
    const html = renderToStaticMarkup(
      <CashShiftSummary
        canAdministrativelyClose={false}
        canReopenClosedShifts={false}
        close={closeWithOpenShift}
        currentUserId="cashier-1"
        onCloseShift={vi.fn()}
        onReopenShift={vi.fn()}
      />,
    );

    expect(html).toContain("Turnos abiertos");
    expect(html).toContain("Efectivo contado de Caja 01");
    expect(html).toContain("Cerrar turno");
  });

  it("shows reopening only for the closed shift owner and does not expose a password", () => {
    const html = renderToStaticMarkup(
      <CashShiftSummary
        canAdministrativelyClose={false}
        canReopenClosedShifts
        close={closeWithClosedShift}
        currentUserId="cashier-1"
        onCloseShift={vi.fn()}
        onReopenShift={vi.fn()}
      />,
    );

    expect(html).toContain("Reabrir turno de Caja 01");
    expect(html).toContain("Reabrir turno");
    expect(html).not.toContain("password");
    expect(html).not.toContain("valid-password");
  });
});
