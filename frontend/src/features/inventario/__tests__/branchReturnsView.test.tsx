// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BranchReturnsView } from "../components/BranchReturnsView";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockState = vi.hoisted(() => ({
  confirm: vi.fn(),
  locations: [
    {
      id: "cedis-1",
      name: "CEDIS Norte",
      type: "DISTRIBUTION_CENTER",
    },
    {
      id: "branch-1",
      name: "Sucursal Centro",
      parentId: "cedis-1",
      type: "BRANCH",
    },
    {
      id: "cedis-2",
      name: "CEDIS Sur",
      type: "DISTRIBUTION_CENTER",
    },
    {
      id: "branch-2",
      name: "Sucursal Norte",
      parentId: "cedis-1",
      type: "BRANCH",
    },
  ],
  transfers: [
    {
      id: "return-1",
      transferNumber: "TRF-RETURN-1",
      originLocationId: "branch-1",
      destinationLocationId: "cedis-1",
      status: "REQUESTED",
      createdAt: "2026-08-09T10:00:00.000Z",
      requestedAt: "2026-08-09T10:00:00.000Z",
      itemsCount: 1,
      items: [
        {
          productId: "product-1",
          productName: "Pollo mixto",
          unit: "KG",
          quantityKg: 12.5,
          quantityPieces: 3,
        },
      ],
    },
    {
      id: "supply-1",
      transferNumber: "TRF-NOT-RETURN",
      originLocationId: "cedis-1",
      destinationLocationId: "branch-1",
      status: "REQUESTED",
      createdAt: "2026-08-09T10:00:00.000Z",
      items: [],
    },
    {
      id: "draft-return-1",
      transferNumber: "TRF-DRAFT-RETURN",
      originLocationId: "branch-1",
      destinationLocationId: "cedis-1",
      status: "DRAFT",
      createdAt: "2026-08-09T10:00:00.000Z",
      items: [],
    },
    {
      id: "in-transit-return-1",
      transferNumber: "TRF-IN-TRANSIT-RETURN",
      originLocationId: "branch-2",
      destinationLocationId: "cedis-1",
      status: "IN_TRANSIT",
      createdAt: "2026-08-09T10:00:00.000Z",
      items: [],
    },
    {
      id: "wrong-parent-1",
      transferNumber: "TRF-WRONG-PARENT",
      originLocationId: "branch-2",
      destinationLocationId: "cedis-2",
      status: "REQUESTED",
      createdAt: "2026-08-09T10:00:00.000Z",
      items: [],
    },
    {
      id: "confirmed-1",
      transferNumber: "TRF-CONFIRMED",
      originLocationId: "branch-1",
      destinationLocationId: "cedis-1",
      status: "CONFIRMED",
      createdAt: "2026-08-09T10:00:00.000Z",
      items: [],
    },
    {
      id: "cancelled-1",
      transferNumber: "TRF-CANCELLED",
      originLocationId: "branch-1",
      destinationLocationId: "cedis-1",
      status: "CANCELLED",
      createdAt: "2026-08-09T10:00:00.000Z",
      items: [],
    },
    {
      id: "unknown-status-1",
      transferNumber: "TRF-UNKNOWN-STATUS",
      originLocationId: "branch-1",
      destinationLocationId: "cedis-1",
      status: "UNKNOWN",
      createdAt: "2026-08-09T10:00:00.000Z",
      items: [],
    },
  ],
}));

const mockAuth = vi.hoisted(() => ({
  user: { role: "ADMIN", permissions: [] as string[] },
}));

vi.mock("../../auth", () => ({
  PERMISSIONS: { cedisReceiveReturns: "cedis.receive_returns" },
  hasPermission: (
    user: { permissions?: string[] } | null | undefined,
    permission: string,
  ) => Boolean(user?.permissions?.includes(permission)),
  useAuth: () => mockAuth,
}));

vi.mock("../hooks/useProducts", () => ({
  useConfirmInventoryTransfer: () => ({
    isPending: false,
    mutateAsync: mockState.confirm,
  }),
  useInventoryLocations: () => ({
    data: mockState.locations,
    error: null,
    isLoading: false,
  }),
  useInventoryTransfers: () => ({
    data: mockState.transfers,
    error: null,
    isLoading: false,
  }),
}));

describe("BranchReturnsView", () => {
  let root: Root | undefined;

  beforeEach(() => {
    mockAuth.user = { role: "ADMIN", permissions: [] };
    mockState.confirm.mockReset().mockResolvedValue({ id: "return-1" });
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    document.body.innerHTML = "";
    root = undefined;
  });

  it("mantiene el historial y confirma únicamente devoluciones pendientes", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<BranchReturnsView canManage />));

    expect(container.textContent).toContain("TRF-RETURN-1");
    expect(container.textContent).toContain("Sucursal Centro");
    expect(container.textContent).toContain("CEDIS Norte");
    expect(container.textContent).toContain("Pollo mixto");
    expect(container.textContent).toContain("12.5 kg · 3 piezas");
    expect(container.textContent).not.toContain("TRF-NOT-RETURN");
    expect(container.textContent).not.toContain("TRF-WRONG-PARENT");
    expect(container.textContent).toContain("TRF-CONFIRMED");
    expect(container.textContent).toContain("TRF-CANCELLED");
    expect(container.textContent).toContain("TRF-UNKNOWN-STATUS");
    expect(
      [...container.querySelectorAll("button")].filter(
        (button) => button.textContent === "Confirmar devolución",
      ),
    ).toHaveLength(3);

    const confirm = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Confirmar devolución",
    );
    await act(async () => confirm?.click());

    expect(mockState.confirm).toHaveBeenCalledWith({
      id: "return-1",
      idempotencyKey: expect.stringMatching(/\S+/),
    });
  });

  it("mantiene la vista pero oculta la confirmación para WAREHOUSE sin permiso", async () => {
    mockAuth.user = { role: "WAREHOUSE", permissions: [] };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<BranchReturnsView canManage />));

    expect(container.textContent).toContain("Solo lectura");
    expect(container.querySelector("button")).toBeNull();
  });

  it("muestra la confirmación a WAREHOUSE con cedis.receive_returns", async () => {
    mockAuth.user = {
      role: "WAREHOUSE",
      permissions: ["cedis.receive_returns"],
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<BranchReturnsView canManage />));

    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent === "Confirmar devolución",
      ),
    ).toBe(true);
  });
});
