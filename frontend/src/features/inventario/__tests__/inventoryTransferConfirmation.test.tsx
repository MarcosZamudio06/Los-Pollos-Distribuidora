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
const locationsState = vi.hoisted(() => ({
  data: [
    {
      id: "origin-1",
      name: "Matriz",
      type: "DISTRIBUTION_CENTER",
      isActive: true,
    },
    {
      id: "destination-1",
      name: "Sucursal",
      type: "MIXED",
      isActive: true,
    },
  ] as Array<{
    id: string;
    name: string;
    type: string;
    isActive: boolean;
  }>,
  requestedOptions: {} as { storageOnly?: boolean },
  error: null as unknown,
  isLoading: false,
}));

vi.mock("../hooks/useProducts", () => ({
  useInventoryLocations: (options?: { storageOnly?: boolean }) => {
    locationsState.requestedOptions = options ?? {};
    return locationsState;
  },
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
  locationsState.data = [
    {
      id: "origin-1",
      name: "Matriz",
      type: "DISTRIBUTION_CENTER",
      isActive: true,
    },
    {
      id: "destination-1",
      name: "Sucursal",
      type: "MIXED",
      isActive: true,
    },
  ];
  locationsState.requestedOptions = {};
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
  it("keeps only active canonical storage locations in both selectors", async () => {
    locationsState.data = [
      {
        id: "warehouse-1",
        name: "Almacén",
        type: "WAREHOUSE",
        isActive: true,
      },
      {
        id: "cedis-1",
        name: "CEDIS",
        type: "DISTRIBUTION_CENTER",
        isActive: true,
      },
      {
        id: "mixed-1",
        name: "Ubicación mixta",
        type: "MIXED",
        isActive: true,
      },
      {
        id: "external-1",
        name: "Punto externo",
        type: "EXTERNAL_POINT_OF_SALE",
        isActive: true,
      },
      {
        id: "route-stock-1",
        name: "Ruta de reparto",
        type: "ROUTE_STOCK",
        isActive: true,
      },
      {
        id: "branch-1",
        name: "Sucursal",
        type: "BRANCH",
        isActive: true,
      },
      {
        id: "inactive-1",
        name: "Almacén inactivo",
        type: "WAREHOUSE",
        isActive: false,
      },
      {
        id: "route-plan-1",
        name: "Plan de ruta",
        type: "DELIVERY_ROUTE_PLAN_DRAFT",
        isActive: true,
      },
      {
        id: "shipment-1",
        name: "Embarque",
        type: "SHIPMENT",
        isActive: true,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "",
        type: "DELIVERY_ROUTE",
        isActive: true,
      },
    ];
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<InventoryTransferView canManage />));

    expect(locationsState.requestedOptions).toEqual({ storageOnly: true });

    const originValues = [
      ...container.querySelector<HTMLSelectElement>(
        '[aria-label="Ubicación de origen"]',
      )!.options,
    ].map((option) => option.value);
    const destinationValues = [
      ...container.querySelector<HTMLSelectElement>(
        '[aria-label="Ubicación de destino"]',
      )!.options,
    ].map((option) => option.value);

    expect(originValues).toEqual([
      "",
      "warehouse-1",
      "cedis-1",
      "mixed-1",
      "external-1",
      "route-stock-1",
      "branch-1",
    ]);
    expect(destinationValues).toEqual([
      "",
      "warehouse-1",
      "cedis-1",
      "mixed-1",
      "external-1",
      "route-stock-1",
    ]);
  });

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
