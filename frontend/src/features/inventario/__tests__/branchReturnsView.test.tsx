// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BranchReturnsView } from "../components/BranchReturnsView";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockAuth = vi.hoisted(() => ({
  user: null as {
    role?: string;
    operationalLocationId?: string;
    permissions?: string[];
  } | null,
}));

const mockCedis = vi.hoisted(() => ({
  location: {
    data: {
      id: "cedis-1",
      name: "CEDIS Norte",
      code: "C01",
      type: "DISTRIBUTION_CENTER",
      parentId: null as string | null,
    },
    error: null,
    isLoading: false,
  },
  history: {
    data: {
      items: [
        {
          cycle: { id: "cycle-1", businessDate: "2026-08-12", version: 1 },
        },
      ],
    },
    error: null,
    isLoading: false,
  },
  summary: {
    data: {
      id: "cycle-1",
      businessDate: "2026-08-12",
      version: 1,
      branch: { id: "branch-1", name: "Sucursal Centro", code: "S01" },
      distributionCenter: {
        id: "cedis-1",
        name: "CEDIS Norte",
        code: "C01",
      },
      items: [],
      totals: { expectedSales: "0" },
    },
    error: null,
    isLoading: false,
  },
  create: { mutateAsync: vi.fn() },
}));

vi.mock("../../auth", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../../cedis/hooks", () => ({
  useOperationalLocation: () => mockCedis.location,
  useCedisBranchHistory: () => mockCedis.history,
  useCedisCycleSummary: () => mockCedis.summary,
  useCreateCedisReturn: () => mockCedis.create,
}));

vi.mock("../../cedis/CedisTransferCommandPanel", () => ({
  CedisTransferCommandPanel: () => <p>Formulario de devolución</p>,
}));

vi.mock("../../cedis/CedisReturnsReviewView", () => ({
  CedisReturnsReviewView: () => <p>Recepción operativa CEDIS</p>,
}));

vi.mock("../hooks/useProducts", () => ({
  useProducts: () => ({ data: [], error: null, isLoading: false }),
}));

describe("BranchReturnsView", () => {
  let root: Root | undefined;

  beforeEach(() => {
    mockAuth.user = {
      role: "SELLER",
      operationalLocationId: "branch-1",
      permissions: ["cedis.view", "cedis.request_returns"],
    };
    mockCedis.location.data = {
      id: "branch-1",
      name: "Sucursal Centro",
      code: "S01",
      type: "BRANCH",
      parentId: "cedis-1",
    };
    mockCedis.create.mutateAsync.mockReset().mockResolvedValue({});
  });

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    document.body.innerHTML = "";
    root = undefined;
  });

  it("muestra únicamente el formulario de creación para la sucursal", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<BranchReturnsView />));

    expect(container.textContent).toContain("Productos no vendidos del ciclo");
    expect(container.textContent).toContain("Registrar devolución");
    expect(container.textContent).not.toContain("Cola");
    expect(container.textContent).not.toContain("Confirmar devolución");

    const registerButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Registrar devolución",
    );
    await act(async () => registerButton?.click());
    expect(container.textContent).toContain("Formulario de devolución");
  });

  it("muestra la recepción operativa cuando la ubicación es CEDIS", async () => {
    mockAuth.user = {
      role: "ADMIN",
      operationalLocationId: "cedis-1",
      permissions: ["cedis.view", "cedis.receive_returns"],
    };
    mockCedis.location.data = {
      id: "cedis-1",
      name: "CEDIS Norte",
      code: "C01",
      type: "DISTRIBUTION_CENTER",
      parentId: null,
    };
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => root?.render(<BranchReturnsView />));

    expect(container.textContent).toContain("Recepción operativa CEDIS");
    expect(container.textContent).not.toContain(
      "Registro disponible en sucursal",
    );
    expect(container.textContent).not.toContain(
      "Productos no vendidos del ciclo",
    );
  });
});
