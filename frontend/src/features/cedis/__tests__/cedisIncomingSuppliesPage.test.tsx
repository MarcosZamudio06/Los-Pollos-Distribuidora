// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CedisIncomingSuppliesPage } from "../CedisIncomingSuppliesPage";
import type { CedisIncomingSupply } from "../types";

const mockState = vi.hoisted(() => ({
  auth: {
    accessToken: "access-token",
    user: {
      id: "seller-1",
      name: "Vendedor",
      role: "SELLER",
      operationalLocationId: "branch-1",
    },
  },
  supplies: {
    data: undefined as
      | {
          items: CedisIncomingSupply[];
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        }
      | undefined,
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  detail: {
    data: undefined as CedisIncomingSupply | undefined,
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  receive: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock("../../auth", () => ({ useAuth: () => mockState.auth }));
vi.mock("../hooks", () => ({
  useCedisIncomingSupplies: () => mockState.supplies,
  useCedisIncomingSupply: () => mockState.detail,
  useReceiveCedisSupply: () => mockState.receive,
}));
vi.mock("../../../lib/cedisSocket", () => ({
  cedisSocket: { subscribe: vi.fn(() => () => undefined) },
}));

const supply = (
  id: string,
  status: "PENDING" | "RECEIVED",
): CedisIncomingSupply => ({
  id,
  transferNumber: `TRF-${id}`,
  cycleId: `cycle-${id}`,
  cycleVersion: 2,
  businessDate: "2026-08-05",
  status,
  origin: { id: "cedis-1", name: "CEDIS Centro", code: "C01" },
  destination: { id: "branch-1", name: "Sucursal Centro", code: "S01" },
  notes: "Despacho de prueba",
  requestedAt: "2026-08-05T08:00:00.000Z",
  confirmedAt: status === "RECEIVED" ? "2026-08-05T09:00:00.000Z" : null,
  createdAt: "2026-08-05T08:00:00.000Z",
  items: [
    {
      transferItemId: `item-${id}`,
      productId: "product-1",
      productName: "Pollo entero",
      unit: "KG",
      quantityKg: 10,
      quantityPieces: 0,
    },
  ],
  receipt:
    status === "RECEIVED"
      ? {
          id: `receipt-${id}`,
          receivedAt: "2026-08-05T09:00:00.000Z",
          notes: "Recepción exacta",
          receivedBy: { id: "seller-1", name: "Vendedor" },
          items: [
            {
              transferItemId: `item-${id}`,
              productId: "product-1",
              productName: "Pollo entero",
              unit: "KG",
              sentKg: "10.000",
              sentPieces: 0,
              receivedKg: "10.000",
              receivedPieces: 0,
              differenceKg: "0.000",
              differencePieces: 0,
            },
          ],
        }
      : null,
});

function renderPage() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/cedis/incoming?date=2026-08-05"]}>
        <CedisIncomingSuppliesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CEDIS incoming supplies UI", () => {
  beforeEach(() => {
    mockState.supplies = {
      data: {
        items: [supply("one", "PENDING"), supply("two", "RECEIVED")],
        total: 2,
        page: 1,
        limit: 25,
        totalPages: 1,
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.detail = {
      data: undefined,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
  });

  it("muestra la bandeja en una cuadrícula de dos columnas y distingue pendientes", () => {
    const html = renderPage();
    expect(html).toContain("Envíos del CEDIS");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("TRF-one");
    expect(html).toContain("Pendiente");
    expect(html).toContain("TRF-two");
  });
});
