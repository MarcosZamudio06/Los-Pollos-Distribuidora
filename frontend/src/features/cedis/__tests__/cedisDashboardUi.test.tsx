// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CedisDashboardPage } from "../CedisDashboardPage";
import type { CedisDashboardCard, CedisLocation } from "../types";

const mockState = vi.hoisted(() => ({
  auth: {
    user: {
      id: "admin-1",
      name: "Admin",
      role: "ADMIN",
    },
  },
  dashboard: {
    data: undefined as unknown,
    error: null as unknown,
    isFetching: false,
    isLoading: false,
    refetch: vi.fn(),
  },
  locations: {
    data: [] as CedisLocation[],
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  assignedLocation: {
    data: undefined as CedisLocation | undefined,
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
}));

vi.mock("../../auth", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("../hooks", () => ({
  useCedisDashboard: () => mockState.dashboard,
  useCedisLocations: () => mockState.locations,
  useOperationalLocation: () => mockState.assignedLocation,
}));

const dashboardCard: CedisDashboardCard = {
  branch: {
    address: "Av. Centro 10",
    code: "S01",
    id: "branch-1",
    latitude: 19.123456,
    longitude: -96.123456,
    name: "Sucursal Centro",
  },
  cash: { counted: "695.00", difference: "-5.00", expected: "700.00" },
  cycle: {
    businessDate: "2026-08-05",
    id: "cycle-1",
    status: "CLOSED",
    version: 2,
  },
  financial: { actualSales: "900.00", expectedSales: "1000.00" },
  lastActivityAt: "2026-08-05T12:00:00.000Z",
  physical: {
    actualSoldKg: "24.000",
    actualSoldPieces: "8.000",
    deliveredKg: "25.500",
    deliveredPieces: "10.000",
    expectedSoldKg: "24.500",
    expectedSoldPieces: "9.000",
    returnedKg: "1.000",
    returnedPieces: "1.000",
  },
  warningCount: 2,
};

function renderPage(initialEntry = "/cedis") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialEntry]}>
      <CedisDashboardPage />
    </MemoryRouter>,
  );
}

describe("CEDIS dashboard UI", () => {
  beforeEach(() => {
    mockState.auth = {
      user: { id: "admin-1", name: "Admin", role: "ADMIN" },
    };
    mockState.dashboard = {
      data: {
        businessDate: "2026-08-05",
        cedisLocationId: "cedis-1",
        dataAsOf: "2026-08-05T12:00:00.000Z",
        generatedAt: "2026-08-05T12:00:00.000Z",
        items: [dashboardCard],
        timeZone: "America/Mexico_City",
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.locations = {
      data: [
        {
          code: "C01",
          id: "cedis-1",
          name: "CEDIS Centro",
          type: "DISTRIBUTION_CENTER",
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
  });

  it("renderiza la tarjeta completa, dirección, coordenadas y enlace de detalle", () => {
    const html = renderPage("/cedis?date=2026-08-05&cedis=cedis-1");

    expect(html).toContain("CEDIS / Sucursales");
    expect(html).toContain("Revisa primero excepciones, diferencias");
    expect(html).toContain("Revisar recepciones pendientes");
    expect(html).toContain(
      'href="/cedis/incoming?date=2026-08-05&amp;status=PENDING"',
    );
    expect(html).toContain("Sucursal Centro");
    expect(html).toContain("Código S01");
    expect(html).toContain("Av. Centro 10");
    expect(html).toContain("Coordenadas: 19.123456, -96.123456");
    expect(html).toContain("Venta esperada");
    expect(html).toContain("Venta real");
    expect(html).toContain("Diferencia");
    expect(html).toContain("Caja: Faltante");
    expect(html).toContain("2 advertencias");
    expect(html).toContain(
      'href="/cedis/branches/branch-1?cedis=cedis-1&amp;date=2026-08-05&amp;cycle=cycle-1"',
    );
    expect(html).toContain("focus-visible:ring-4");
    const cardStart = html.indexOf('aria-label="Abrir detalle');
    const cardEnd = html.indexOf("</a>", cardStart);
    expect(html.slice(cardStart, cardEnd)).not.toContain("<button");
  });

  it("conserva los filtros recibidos desde la URL", () => {
    const html = renderPage(
      "/cedis?date=2026-08-04&cedis=cedis-1&status=OPEN&q=norte",
    );

    expect(html).toContain('value="2026-08-04"');
    expect(html).toContain('value="norte"');
    expect(html).toContain('<option value="OPEN" selected');
  });

  it("muestra loading, error y vacío", () => {
    mockState.dashboard = {
      data: undefined,
      error: null,
      isFetching: true,
      isLoading: true,
      refetch: vi.fn(),
    };
    expect(renderPage()).toContain("animate-pulse");

    mockState.dashboard = {
      data: undefined,
      error: new Error("network"),
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    };
    expect(renderPage()).toContain("No se pudo cargar el tablero CEDIS");

    mockState.dashboard = {
      data: {
        businessDate: "2026-08-05",
        cedisLocationId: "cedis-1",
        dataAsOf: "2026-08-05T12:00:00.000Z",
        generatedAt: "2026-08-05T12:00:00.000Z",
        items: [],
        timeZone: "America/Mexico_City",
      },
      error: null,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    };
    expect(renderPage()).toContain("No hay sucursales para estos filtros");
  });

  it("resuelve el CEDIS asignado para un vendedor", () => {
    mockState.auth = {
      user: {
        id: "seller-1",
        name: "Vendedor",
        role: "SELLER",
      },
    };
    mockState.locations = {
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.assignedLocation = {
      data: {
        id: "branch-1",
        name: "Sucursal Centro",
        parentId: "cedis-1",
        type: "BRANCH",
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };

    expect(renderPage()).toContain("CEDIS asignado");
  });
});
