// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CedisReturnsReviewView } from "../CedisReturnsReviewView";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockReturns = vi.hoisted(() => ({
  query: {
    data: {
      items: [
        {
          id: "transfer-1",
          transferNumber: "TR-RETURN-001",
          cycle: {
            id: "cycle-1",
            version: 1,
            businessDate: "2026-08-14",
            branch: { id: "branch-1", name: "Sucursal Centro", code: "S01" },
            distributionCenter: {
              id: "cedis-1",
              name: "CEDIS Norte",
              code: "C01",
            },
          },
          status: "PENDING",
          notes: null,
          requestedAt: "2026-08-14T16:00:00.000Z",
          confirmedAt: null,
          cancelledAt: null,
          createdAt: "2026-08-14T16:00:00.000Z",
          requestedBy: { id: "user-1", name: "Vendedor" },
          items: [
            {
              transferItemId: "item-1",
              productId: "product-1",
              productName: "Pollo entero",
              unit: "PIECE",
              quantityKg: 0,
              quantityPieces: 12,
            },
            {
              transferItemId: "item-2",
              productId: "product-2",
              productName: "Pechuga de pollo",
              unit: "KG",
              quantityKg: 4.5,
              quantityPieces: 0,
            },
          ],
        },
      ],
      total: 1,
      page: 1,
      limit: 100,
      totalPages: 1,
    },
    error: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  complete: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
}));

vi.mock("../hooks", () => ({
  useCedisReturns: () => mockReturns.query,
  useCompleteCedisReturn: () => mockReturns.complete,
}));

vi.mock("../../../components/shared/confirmation-dialog", () => ({
  ConfirmationDialog: ({
    children,
    confirmLabel,
    onConfirm,
    open,
  }: {
    children?: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
    open: boolean;
  }) =>
    open ? (
      <div role="dialog">
        {children}
        <button onClick={() => void onConfirm()}>{confirmLabel}</button>
      </div>
    ) : null,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("CedisReturnsReviewView", () => {
  let root: Root | undefined;

  beforeEach(() => {
    mockReturns.query.refetch.mockReset();
    mockReturns.complete.mutateAsync.mockReset().mockResolvedValue({});
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    document.body.innerHTML = "";
    root = undefined;
  });

  it("muestra las devoluciones pendientes y confirma la recepción", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () =>
      root?.render(<CedisReturnsReviewView canReceiveReturns />),
    );

    expect(container.textContent).toContain("Recepción en CEDIS");
    expect(container.textContent).toContain("Sucursal Centro");
    expect(container.textContent).toContain("Confirmar recepción");
    expect(container.textContent).toContain("12 pzas.");

    const actionButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Confirmar recepción"),
    );
    await act(async () => actionButton?.click());

    expect(container.textContent).toContain("Mercancía devuelta");
    expect(container.textContent).toContain("Pollo entero");
    expect(container.textContent).toContain("Pechuga de pollo");
    expect(container.textContent).toContain("4.5 kg");

    const confirmationButton = container.querySelector<HTMLButtonElement>(
      '[role="dialog"] button',
    );
    await act(async () => confirmationButton?.click());

    expect(mockReturns.complete.mutateAsync).toHaveBeenCalledWith({
      transferId: "transfer-1",
    });
  });

  it("oculta la acción de confirmación sin permiso de recepción", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () =>
      root?.render(<CedisReturnsReviewView canReceiveReturns={false} />),
    );

    expect(container.textContent).toContain("Sin permiso de recepción");
    expect(container.textContent).not.toContain("Confirmar recepción");
  });
});
