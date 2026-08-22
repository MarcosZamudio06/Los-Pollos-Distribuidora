// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RouteCollectionDialog,
  RouteSecondPassCollectionDialog,
} from "../components/RouteCollectionDialog";
import type { DeliveryOrder } from "../types";

const hookMock = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
}));

vi.mock("../hooks", () => ({
  useCreateRouteCollection: () => ({
    error: null,
    isPending: false,
    mutateAsync: hookMock.mutateAsync,
  }),
}));

const order: DeliveryOrder = {
  accountReceivableId: "ar-1",
  accountReceivableVersion: 7,
  customerName: "Cliente Centro",
  derivedCollectedAmount: 100,
  id: "order-1",
  outstandingAmount: 500,
  status: "DELIVERED",
};

let root: Root | undefined;

async function renderDialog(element: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root?.render(element));
  return container;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

async function submitAmount(container: HTMLElement, amount: string) {
  const amountInput = container.querySelector<HTMLInputElement>(
    'input[type="number"]',
  );
  expect(amountInput).not.toBeNull();

  await act(async () => {
    setInputValue(amountInput!, amount);
  });

  const submit = container.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  expect(submit?.disabled).toBe(false);
  await act(async () => submit?.click());
}

describe("RouteCollectionDialog collectionPass contract", () => {
  beforeEach(() => {
    hookMock.mutateAsync.mockReset();
    hookMock.mutateAsync.mockResolvedValue({});
    vi.stubGlobal("crypto", { randomUUID: () => "collection-key" });
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    document.body.replaceChildren();
    root = undefined;
    vi.unstubAllGlobals();
  });

  it("sends first-pass collection as number 1 without changing the rest of the payload", async () => {
    const onClose = vi.fn();
    const container = await renderDialog(
      <RouteCollectionDialog
        onClose={onClose}
        order={order}
        routeId="route-1"
      />,
    );
    const passSelect = container.querySelectorAll("select")[1];

    expect(
      [...passSelect.options].map((option) => [option.value, option.textContent]),
    ).toEqual([
      ["1", "Primera vuelta"],
      ["2", "Segunda vuelta"],
    ]);

    await act(async () => {
      setSelectValue(passSelect, "2");
      setSelectValue(passSelect, "1");
    });
    await submitAmount(container, "125.50");

    expect(hookMock.mutateAsync).toHaveBeenCalledWith({
      orderId: "order-1",
      idempotencyKey: "collection-key",
      payload: {
        accountReceivableId: "ar-1",
        expectedVersion: 7,
        amount: 125.5,
        collectionPass: 1,
        paidAt: expect.any(String),
        paymentMethod: "CASH",
        reference: undefined,
      },
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("forces second-pass collection as number 2", async () => {
    const container = await renderDialog(
      <RouteSecondPassCollectionDialog
        onClose={vi.fn()}
        order={order}
        routeId="route-1"
      />,
    );

    expect(container.textContent).toContain("Segunda vuelta");
    expect(container.querySelectorAll("select")).toHaveLength(1);
    await submitAmount(container, "75");

    expect(hookMock.mutateAsync).toHaveBeenCalledWith({
      orderId: "order-1",
      idempotencyKey: "collection-key",
      payload: expect.objectContaining({
        accountReceivableId: "ar-1",
        expectedVersion: 7,
        amount: 75,
        collectionPass: 2,
        paymentMethod: "CASH",
      }),
    });
  });
});
