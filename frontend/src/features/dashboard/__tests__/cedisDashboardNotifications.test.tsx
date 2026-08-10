// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CedisDashboardNotifications } from "../CedisDashboardNotifications";

type TransferFixture = {
  id: string;
  originLocationId: string;
  destinationLocationId: string;
  status: string;
  createdAt: string;
  items?: { productId: string; unit: string }[];
};

const mockState = vi.hoisted(() => ({
  auth: {
    user: {
      id: "admin-1",
      name: "Admin",
      permissions: ["cedis.view"],
      role: "ADMIN",
    },
  },
  locations: {
    data: [
      { id: "cedis-1", name: "CEDIS Norte", type: "DISTRIBUTION_CENTER" },
      {
        id: "branch-1",
        name: "Sucursal Centro",
        parentId: "cedis-1",
        type: "BRANCH",
      },
      { id: "cedis-2", name: "CEDIS Sur", type: "DISTRIBUTION_CENTER" },
      {
        id: "branch-2",
        name: "Sucursal Norte",
        parentId: "cedis-1",
        type: "BRANCH",
      },
    ],
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  transfers: {
    data: [] as TransferFixture[],
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

const mockHooks = vi.hoisted(() => ({
  useInventoryLocations: vi.fn(() => mockState.locations),
  useInventoryTransfers: vi.fn(() => mockState.transfers),
}));

vi.mock("../../auth", () => ({
  PERMISSIONS: { cedisView: "cedis.view" },
  hasPermission: (
    user: { permissions?: string[] } | null | undefined,
    permission: string,
  ) => Boolean(user?.permissions?.includes(permission)),
  useAuth: () => mockState.auth,
}));

vi.mock("../../inventario/hooks/useProducts", () => mockHooks);

function renderNotifications() {
  return renderToStaticMarkup(
    <MemoryRouter>
      <CedisDashboardNotifications />
    </MemoryRouter>,
  );
}

describe("CedisDashboardNotifications", () => {
  beforeEach(() => {
    mockState.auth.user = {
      id: "admin-1",
      name: "Admin",
      permissions: ["cedis.view"],
      role: "ADMIN",
    };
    mockState.locations.data = [
      { id: "cedis-1", name: "CEDIS Norte", type: "DISTRIBUTION_CENTER" },
      {
        id: "branch-1",
        name: "Sucursal Centro",
        parentId: "cedis-1",
        type: "BRANCH",
      },
      { id: "cedis-2", name: "CEDIS Sur", type: "DISTRIBUTION_CENTER" },
      {
        id: "branch-2",
        name: "Sucursal Norte",
        parentId: "cedis-1",
        type: "BRANCH",
      },
    ];
    mockState.locations.error = null;
    mockState.locations.isLoading = false;
    mockState.transfers.error = null;
    mockState.transfers.isLoading = false;
    mockState.transfers.data = [
      {
        id: "return-draft",
        originLocationId: "branch-1",
        destinationLocationId: "cedis-1",
        status: "DRAFT",
        createdAt: "2026-08-09T10:00:00.000Z",
        items: [
          { productId: "product-1", unit: "KG" },
          { productId: "product-2", unit: "PIECE" },
        ],
      },
      {
        id: "return-requested",
        originLocationId: "branch-1",
        destinationLocationId: "cedis-1",
        status: "REQUESTED",
        createdAt: "2026-08-09T10:00:00.000Z",
        items: [{ productId: "product-1", unit: "KG" }],
      },
      {
        id: "return-in-transit",
        originLocationId: "branch-2",
        destinationLocationId: "cedis-1",
        status: "IN_TRANSIT",
        createdAt: "2026-08-09T10:00:00.000Z",
        items: [
          { productId: "product-1", unit: "KG" },
          { productId: "product-2", unit: "PIECE" },
          { productId: "product-3", unit: "KG" },
        ],
      },
      {
        id: "supply",
        originLocationId: "cedis-1",
        destinationLocationId: "branch-1",
        status: "REQUESTED",
        createdAt: "2026-08-09T10:00:00.000Z",
        items: [],
      },
      {
        id: "wrong-parent",
        originLocationId: "branch-1",
        destinationLocationId: "cedis-2",
        status: "REQUESTED",
        createdAt: "2026-08-09T10:00:00.000Z",
        items: [],
      },
      {
        id: "confirmed",
        originLocationId: "branch-1",
        destinationLocationId: "cedis-1",
        status: "CONFIRMED",
        createdAt: "2026-08-09T10:00:00.000Z",
        items: [],
      },
      {
        id: "cancelled",
        originLocationId: "branch-1",
        destinationLocationId: "cedis-1",
        status: "CANCELLED",
        createdAt: "2026-08-09T10:00:00.000Z",
        items: [],
      },
      {
        id: "unknown",
        originLocationId: "branch-1",
        destinationLocationId: "cedis-1",
        status: "UNKNOWN",
        createdAt: "2026-08-09T10:00:00.000Z",
        items: [],
      },
    ];
    mockHooks.useInventoryLocations.mockClear();
    mockHooks.useInventoryTransfers.mockClear();
  });

  it("muestra el acceso directo para ADMIN con cedis.view", () => {
    const html = renderNotifications();

    expect(html).toContain("Acceso directo a CEDIS");
    expect(html).toContain('href="/cedis"');
    expect(html).toContain("Abrir CEDIS");
    expect(mockHooks.useInventoryLocations).toHaveBeenCalledWith({
      enabled: true,
      refetchInterval: 60_000,
    });
  });

  it("muestra el acceso directo para WAREHOUSE con cedis.view", () => {
    mockState.auth.user = {
      id: "warehouse-1",
      name: "Almacén",
      permissions: ["cedis.view"],
      role: "WAREHOUSE",
    };

    expect(renderNotifications()).toContain("Acceso directo a CEDIS");
  });

  it("mantiene devoluciones para ADMIN sin cedis.view, pero oculta el acceso directo", () => {
    mockState.auth.user = {
      id: "admin-without-cedis-view",
      name: "Admin sin CEDIS",
      permissions: [],
      role: "ADMIN",
    };

    const html = renderNotifications();

    expect(html).not.toContain("Acceso directo a CEDIS");
    expect(html).not.toContain('href="/cedis"');
    expect(html).toContain("3 devoluciones a CEDIS pendientes");
    expect(mockHooks.useInventoryTransfers).toHaveBeenCalledWith({
      enabled: true,
      refetchInterval: 60_000,
    });
  });

  it("mantiene devoluciones para WAREHOUSE sin cedis.view", () => {
    mockState.auth.user = {
      id: "warehouse-without-cedis-view",
      name: "Almacén sin CEDIS",
      permissions: [],
      role: "WAREHOUSE",
    };

    const html = renderNotifications();

    expect(html).not.toContain("Acceso directo a CEDIS");
    expect(html).toContain("3 devoluciones a CEDIS pendientes");
  });

  it("oculta el acceso directo para SELLER aunque tenga cedis.view", () => {
    mockState.auth.user = {
      id: "seller-1",
      name: "Vendedor",
      permissions: ["cedis.view"],
      role: "SELLER",
    };

    const html = renderNotifications();

    expect(html).toBe("");
    expect(mockHooks.useInventoryLocations).toHaveBeenCalledWith({
      enabled: false,
      refetchInterval: false,
    });
    expect(mockHooks.useInventoryTransfers).toHaveBeenCalledWith({
      enabled: false,
      refetchInterval: false,
    });
  });

  it("cuenta transferencias pendientes y excluye suministros, padres incorrectos y estados cerrados", () => {
    const html = renderNotifications();

    expect(html).toContain("3 devoluciones a CEDIS pendientes");
    expect(html).toContain('href="/inventory"');
    expect(html).toContain("Revisar devoluciones");
    expect(html).not.toContain("8 devoluciones a CEDIS pendientes");
  });

  it("muestra el estado verde cuando no hay devoluciones pendientes", () => {
    mockState.transfers.data = [];

    const html = renderNotifications();

    expect(html).toContain("Devoluciones a CEDIS al día");
    expect(html).toContain("bg-[rgba(63,123,65,0.12)]");
  });

  it("muestra carga y permite reintentar ante un error", () => {
    mockState.locations.isLoading = true;
    expect(renderNotifications()).toContain("Cargando devoluciones a CEDIS");

    mockState.locations.isLoading = false;
    mockState.locations.error = new Error("network");
    const html = renderNotifications();
    expect(html).toContain("No se pudieron cargar las devoluciones a CEDIS");
    expect(html).toContain("Reintentar");
  });
});
