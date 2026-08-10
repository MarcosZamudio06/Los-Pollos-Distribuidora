// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CashShiftSummary } from "../CashShiftSummary";
import type { DailyClose } from "../types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const close = {
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

let root: Root | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
  root = undefined;
});

async function renderSummary(
  onReopenShift: (id: string, password: string) => Promise<void>,
  currentUserId = "cashier-1",
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root?.render(
      <CashShiftSummary
        canAdministrativelyClose={false}
        canReopenClosedShifts
        close={close}
        currentUserId={currentUserId}
        onCloseShift={vi.fn()}
        onReopenShift={onReopenShift}
      />,
    ),
  );
}

describe("cash shift reopen dialog", () => {
  it("requires the session password and sends no client user id", async () => {
    const onReopenShift = vi.fn().mockResolvedValue(undefined);
    await renderSummary(onReopenShift);

    await act(async () =>
      document
        .querySelector<HTMLButtonElement>(
          '[aria-label="Reabrir turno de Caja 01"]',
        )
        ?.click(),
    );

    const password = document.querySelector<HTMLInputElement>(
      'input[type="password"]',
    );
    expect(password).toBeTruthy();
    expect(password?.getAttribute("aria-label")).toBe(
      "Contraseña para reabrir el turno de Caja 01",
    );
    expect(document.body.textContent).not.toContain("valid-password");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(password, "valid-password");
      password?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () =>
      document
        .querySelector<HTMLElement>('[role="alertdialog"] button:not(:first-child)')
        ?.click(),
    );

    expect(onReopenShift).toHaveBeenCalledWith(
      "shift-closed-1",
      "valid-password",
    );
  });

  it("does not offer reopening to another cashier", async () => {
    await renderSummary(vi.fn().mockResolvedValue(undefined), "cashier-2");

    expect(
      document.querySelector('[aria-label="Reabrir turno de Caja 01"]'),
    ).toBeNull();
  });
});
