// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryTransferView } from "../components/InventoryTransferView";
import type { InventoryTransfer } from "../types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const mutateAsync = vi.fn().mockResolvedValue({ id: "transfer-1" });
const cancelMutateAsync = vi.fn().mockResolvedValue({ id: "transfer-1" });
const detailState = vi.hoisted<{ data: InventoryTransfer | null }>(() => ({
  data: null,
}));

vi.mock("../hooks/useProducts", () => ({
  useInventoryLocations: () => ({
    data: [
      { id: "origin-1", name: "Matriz" },
      { id: "destination-1", name: "Sucursal" },
    ],
    error: null,
    isLoading: false,
  }),
  useInventoryTransfers: () => ({
    data: detailState.data ? [detailState.data] : [],
    error: null,
    isLoading: false,
  }),
  useInventoryTransferDetail: () => ({
    data: detailState.data,
    error: null,
    isLoading: false,
  }),
  useCreateInventoryTransfer: () => ({ isPending: false, mutateAsync }),
  useConfirmInventoryTransfer: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useCancelInventoryTransfer: () => ({
    isPending: false,
    mutateAsync: cancelMutateAsync,
  }),
}));

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.innerHTML = "";
  mutateAsync.mockClear();
  cancelMutateAsync.mockClear();
  detailState.data = null;
  root = undefined;
});

function change(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function select(input: HTMLSelectElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function changeText(input: HTMLTextAreaElement, value: string) {
  Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("InventoryTransferView confirmation", () => {
  it("no crea antes de confirmar y crea una sola vez al confirmar", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(<InventoryTransferView canManage />));
    const inputs = [...container.querySelectorAll("input")];
    const origin = container.querySelector<HTMLSelectElement>(
      '[aria-label="Ubicación de origen"]',
    )!;
    const destination = container.querySelector<HTMLSelectElement>(
      '[aria-label="Ubicación de destino"]',
    )!;
    await act(async () => {
      select(origin, "origin-1");
      select(destination, "destination-1");
      change(inputs[1], "product-1");
      change(inputs[2], "2");
    });
    const form = container.querySelector("form");
    await act(async () =>
      form?.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Confirmar traspaso");
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Confirmar registro",
    );
    await act(async () => confirm?.click());
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("reutiliza la clave al reintentar el mismo motivo y la cambia si cambia el motivo", async () => {
    detailState.data = {
      id: "transfer-1",
      transferNumber: "TRF-RETURN-1",
      originLocationId: "branch-1",
      destinationLocationId: "cedis-1",
      status: "IN_TRANSIT",
      createdAt: "2026-08-09T10:00:00.000Z",
      items: [],
    };
    cancelMutateAsync.mockRejectedValue(new Error("retry"));
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<InventoryTransferView canManage />));
    const reason = container.querySelector<HTMLTextAreaElement>("textarea")!;
    const cancel = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Cancelar",
    )!;

    await act(async () => {
      changeText(reason, "Motivo uno");
      cancel.click();
    });
    await act(async () => cancel.click());
    const firstKey = cancelMutateAsync.mock.calls[0][0].idempotencyKey;
    const retryKey = cancelMutateAsync.mock.calls[1][0].idempotencyKey;

    await act(async () => {
      changeText(reason, "Motivo dos");
      cancel.click();
    });
    const changedReasonKey = cancelMutateAsync.mock.calls[2][0].idempotencyKey;

    expect(retryKey).toBe(firstKey);
    expect(changedReasonKey).not.toBe(firstKey);
  });
});
