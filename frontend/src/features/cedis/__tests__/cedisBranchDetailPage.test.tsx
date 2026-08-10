// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CedisBranchDetailPage } from "../CedisBranchDetailPage";
import { CedisTransferCommandPanel } from "../CedisTransferCommandPanel";
import type {
  CedisBranchHistoryResponse,
  CedisCycleSummary,
  CedisDashboardCard,
  CedisLocation,
} from "../types";
import type { Product } from "../../inventario/types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockState = vi.hoisted(() => ({
  auth: {
    user: {
      id: "admin-1",
      name: "Administrador",
      role: "ADMIN",
      permissions: [] as string[],
    },
  },
  branch: {
    data: {
      id: "branch-1",
      name: "Sucursal Centro",
      code: "S01",
      type: "BRANCH",
      parentId: "cedis-1",
      address: "Av. Centro 10",
      latitude: 19.123456,
      longitude: -96.123456,
    } as CedisLocation,
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  parent: {
    data: {
      id: "cedis-1",
      name: "CEDIS Centro",
      code: "C01",
      type: "DISTRIBUTION_CENTER",
    } as CedisLocation,
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  history: {
    data: undefined as unknown,
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  summary: {
    data: undefined as unknown,
    error: null as unknown,
    isLoading: false,
    isPending: false,
    refetch: vi.fn(),
  },
  products: {
    data: [] as Product[],
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  mutations: {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../../auth", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("../../inventario/hooks/useProducts", () => ({
  useProducts: () => mockState.products,
}));

vi.mock("../hooks", () => ({
  useCedisBranchHistory: () => mockState.history,
  useCedisCycleSummary: () => mockState.summary,
  useCancelCedisCycle: () => mockState.mutations,
  useCloseCedisCycle: () => mockState.mutations,
  useCreateCedisReturn: () => mockState.mutations,
  useCreateCedisSupply: () => mockState.mutations,
  useOpenCedisCycle: () => mockState.mutations,
  useOperationalLocation: (locationId?: string) =>
    locationId === "cedis-1" ? mockState.parent : mockState.branch,
  useRefreshCedisCycle: () => mockState.mutations,
  useReopenCedisCycle: () => mockState.mutations,
}));

const product: Product = {
  id: "product-1",
  name: "Pollo entero",
  sku: "POL-001",
  unit: "KG",
  salePrice: 85,
  isActive: true,
  inventoryBalance: {
    locationId: "cedis-1",
    quantityKg: 100,
    quantityPieces: 0,
    reservedQuantityKg: 20,
    reservedQuantityPieces: 0,
    availableQuantityKg: 80,
    availableQuantityPieces: 0,
  },
};

const card: CedisDashboardCard = {
  branch: {
    id: "branch-1",
    name: "Sucursal Centro",
    code: "S01",
    address: "Av. Centro 10",
    latitude: 19.123456,
    longitude: -96.123456,
  },
  cycle: {
    id: "cycle-1",
    businessDate: "2026-08-05",
    status: "OPEN",
    version: 3,
  },
  physical: {
    deliveredKg: "120.000",
    deliveredPieces: "0.000",
    returnedKg: "10.000",
    returnedPieces: "0.000",
    expectedSoldKg: "110.000",
    expectedSoldPieces: "0.000",
    actualSoldKg: "108.000",
    actualSoldPieces: "0.000",
  },
  financial: {
    expectedSales: "9350.00",
    actualSales: "9180.00",
    creditSales: "4500.00",
  },
  cash: {
    expected: "5000.00",
    counted: "4950.00",
    difference: "-50.00",
  },
  warningCount: 1,
  lastActivityAt: "2026-08-05T14:32:00.000Z",
};

const summary: CedisCycleSummary = {
  id: "cycle-1",
  businessDate: "2026-08-05",
  status: "OPEN",
  version: 3,
  notes: null,
  branch: card.branch,
  distributionCenter: {
    id: "cedis-1",
    name: "CEDIS Centro",
    code: "C01",
    address: "Carretera 1",
    latitude: null,
    longitude: null,
  },
  totals: {
    deliveredKg: "120.000",
    deliveredPieces: "0.000",
    returnedKg: "10.000",
    returnedPieces: "0.000",
    expectedSoldKg: "110.000",
    expectedSoldPieces: "0.000",
    actualSoldKg: "108.000",
    actualSoldPieces: "0.000",
    expectedSales: "9350.00",
    actualSales: "9180.00",
    creditSales: "4500.00",
    expectedCash: "5000.00",
    cashCounted: "4950.00",
    cashDifference: "-50.00",
    expectedProfit: "2400.00",
    actualProfit: "2250.00",
  },
  items: [
    {
      id: "item-1",
      snapshotKey: "product-1",
      productId: "product-1",
      name: "Pollo entero",
      sku: "POL-001",
      unit: "KG",
      unitPrice: "85.00",
      unitCost: "60.00",
      deliveredKg: "120.000",
      deliveredPieces: "0.000",
      returnedKg: "10.000",
      returnedPieces: "0.000",
      expectedSoldKg: "110.000",
      expectedSoldPieces: "0.000",
      actualSoldKg: "108.000",
      actualSoldPieces: "0.000",
      expectedSales: "9350.00",
      actualSales: "9180.00",
      expectedProfit: "2750.00",
      actualProfit: "2430.00",
    },
  ],
  transfers: [
    {
      id: "link-1",
      role: "SUPPLY",
      linkedAt: "2026-08-05T08:00:00.000Z",
      transfer: {
        id: "transfer-1",
        transferNumber: "TR-001",
        status: "CONFIRMED",
        originLocationId: "cedis-1",
        destinationLocationId: "branch-1",
        requestedAt: "2026-08-05T08:00:00.000Z",
        confirmedAt: "2026-08-05T08:30:00.000Z",
        cancelledAt: null,
        updatedAt: "2026-08-05T08:30:00.000Z",
        items: [
          {
            id: "transfer-item-1",
            productId: "product-1",
            productName: "Pollo entero",
            productSku: "POL-001",
            unit: "KG",
            quantityKg: "120.000",
            quantityPieces: null,
            balance: {
              locationId: "cedis-1",
              quantityKg: 30,
              quantityPieces: 0,
              reservedQuantityKg: 7,
              reservedQuantityPieces: 0,
              availableQuantityKg: 23,
              availableQuantityPieces: 0,
            },
          },
        ],
      },
    },
  ],
  dailyClose: {
    id: "daily-close-1",
    businessDate: "2026-08-05",
    status: "DRAFT",
    version: 4,
    totals: {
      cash: "5000.00",
      cardVoucher: "3180.00",
      transfer: "1000.00",
      expenses: "100.00",
      grossSales: "9180.00",
      creditSales: "4500.00",
      netCashExpected: "5000.00",
      cashCounted: "4950.00",
      cashDifference: "-50.00",
    },
    unresolvedDifferences: [
      {
        id: "difference-1",
        code: "CASH_DIFFERENCE",
        scope: "CASH",
        unit: "MXN",
        expectedValue: "5000.00",
        recordedValue: "4950.00",
        differenceValue: "-50.00",
        differenceType: "SHORTAGE",
        status: "PENDING_JUSTIFICATION",
        reason: null,
        evidence: null,
      },
    ],
    updatedAt: "2026-08-05T14:32:00.000Z",
  },
  cashMovementSummary: {
    dailyCloseId: "daily-close-1",
    movementCount: 2,
    expenseTotal: "100.00",
    cashInTotal: "0.00",
    cashOutTotal: "100.00",
    cashAdjustmentTotal: "0.00",
    movementsByTypeAndChannel: [
      {
        type: "EXPENSE",
        movementChannel: "CASH",
        isOpening: false,
        count: 1,
        grossAmount: "100.00",
        cashImpact: "-100.00",
      },
    ],
    paymentsByMethod: [{ paymentMethod: "CASH", count: 10, amount: "5000.00" }],
    shifts: {
      activeShiftCount: 1,
      openShiftCount: 0,
      openingCash: "500.00",
      shiftCashCounted: "4950.00",
    },
  },
  warningCount: 1,
  lastActivityAt: "2026-08-05T14:32:00.000Z",
  generatedAt: "2026-08-05T14:35:00.000Z",
  dataAsOf: "2026-08-05T14:32:00.000Z",
  timeZone: "America/Mexico_City",
};

function renderPage(
  entry = "/cedis/branches/branch-1?date=2026-08-05&cycle=cycle-1",
) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[entry]}>
      <CedisBranchDetailPage />
    </MemoryRouter>,
  );
}

describe("CEDIS branch detail page", () => {
  beforeEach(() => {
    mockState.auth.user.permissions = [
      "cedis.dispatch",
      "cedis.receive_returns",
      "cedis.reconcile",
      "cedis.close",
      "cedis.view_costs",
    ];
    mockState.history = {
      data: {
        branchId: "branch-1",
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
        items: [card],
        total: 1,
        page: 1,
        limit: 31,
        totalPages: 1,
        generatedAt: "2026-08-05T14:35:00.000Z",
        dataAsOf: "2026-08-05T14:32:00.000Z",
        timeZone: "America/Mexico_City",
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.summary = {
      data: summary,
      error: null,
      isLoading: false,
      isPending: false,
      refetch: vi.fn(),
    };
    mockState.products.data = [product];
    mockState.products.error = null;
    mockState.products.isLoading = false;
    mockState.products.refetch.mockReset();
    mockState.products.refetch.mockResolvedValue({});
    mockState.mutations.isPending = false;
    mockState.mutations.mutateAsync.mockReset();
    mockState.mutations.mutateAsync.mockResolvedValue({ id: "cycle-2" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("muestra historial, resumen, producto, transferencias, caja, diferencias y enlace al cierre", () => {
    const html = renderPage();

    expect(html).toContain("Fecha operativa");
    expect(html).toContain("Revisión y confirmación");
    expect(html).toContain("Inspecciona advertencias, diferencias y conciliación");
    expect(html).toContain("Confirmar jornada");
    expect(html).toContain(
      'href="/cedis/incoming?date=2026-08-05&amp;status=PENDING"',
    );
    expect(html).toContain("Historial diario");
    expect(html).toContain("Desglose por producto");
    expect(html).toContain("Pollo entero");
    expect(html).toContain("Suministros y devoluciones");
    expect(html).toContain("Físico en origen");
    expect(html).toContain("Comprometido");
    expect(html).toContain("Disponible");
    expect(html).toContain("Resumen de caja");
    expect(html).toContain("Ventas a crédito");
    expect(html).toContain("$4,500.00");
    expect(html).toContain("Advertencias y diferencias");
    expect(html).toContain("Diferencia de caja");
    expect(html).toContain(
      'href="/daily-close?closeId=daily-close-1&amp;locationId=branch-1&amp;date=2026-08-05"',
    );
    expect(html).toContain("Actualizar conciliación");
  });

  it("oculta efectivo esperado del resumen operativo", () => {
    const html = renderPage();
    const summaryStart = html.indexOf("Resumen operativo");
    const productBreakdownStart = html.indexOf("Desglose por producto");

    expect(html.slice(summaryStart, productBreakdownStart)).not.toContain(
      "Efectivo esperado",
    );
  });

  it("oculta comandos cuando el usuario solo tiene permiso de consulta", () => {
    mockState.auth.user.permissions = ["cedis.view"];
    const html = renderPage();

    expect(html).not.toContain("Enviar producto");
    expect(html).not.toContain("Registrar devolución");
    expect(html).not.toContain("Actualizar conciliación");
    expect(html).not.toContain("Cerrar");
    expect(html).not.toContain("Reabrir");
  });

  it("deshabilita transferencias y cierre cuando el ciclo está cerrado", () => {
    mockState.summary.data = { ...summary, status: "CLOSED" };
    mockState.history.data = {
      ...(mockState.history.data as CedisBranchHistoryResponse),
      items: [{ ...card, cycle: { ...card.cycle!, status: "CLOSED" } }],
    };
    const html = renderPage();

    expect(html).toContain("El ciclo está cerrado y no admite transferencias.");
    expect(html).toContain(
      "El ciclo debe estar listo para revisión antes de cerrarse.",
    );
    expect(html).toContain("Reabrir");
    expect(html).toContain('disabled=""');
  });

  it("muestra un error de consulta con reintento", () => {
    mockState.history.error = new Error("network");
    const html = renderPage();

    expect(html).toContain("No se pudo cargar el detalle");
    expect(html).toContain("Reintentar");
  });

  it("refresca saldos y conserva el formulario ante un conflicto de disponibilidad", async () => {
    mockState.mutations.mutateAsync.mockRejectedValueOnce({
      payload: {
        code: "INSUFFICIENT_STOCK",
        message: "Insufficient stock",
      },
    });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    await act(async () =>
      root.render(
        <MemoryRouter
          initialEntries={[
            "/cedis/branches/branch-1?date=2026-08-05&cycle=cycle-1",
          ]}
        >
          <CedisBranchDetailPage />
        </MemoryRouter>,
      ),
    );
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Enviar producto"))
        ?.click();
    });
    await act(async () => {
      const select = container.querySelector("select") as HTMLSelectElement;
      select.value = "product-1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const input = container.querySelector(
        'input[aria-label="Kilos 1"]',
      ) as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "25.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      (
        container.querySelector('button[type="submit"]') as HTMLButtonElement
      ).click();
    });
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent?.includes("Confirmar suministro"))
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mockState.products.refetch).toHaveBeenCalled();
    expect(mockState.summary.refetch).toHaveBeenCalled();
    expect(container.textContent).toContain("Reintentar suministro");

    await act(async () => root.unmount());
    container.remove();
  });

  it("expone semántica modal accesible para el comando de transferencia", () => {
    const html = renderToStaticMarkup(
      <CedisTransferCommandPanel
        branch={card.branch}
        cedis={summary.distributionCenter}
        expectedVersion={summary.version}
        mode="SUPPLY"
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        products={[product]}
        productsLoading={false}
      />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
  });

  it("muestra controles cuando el historial tiene varias páginas", () => {
    mockState.history.data = {
      ...(mockState.history.data as CedisBranchHistoryResponse),
      page: 2,
      totalPages: 3,
      total: 75,
    };
    const html = renderPage();

    expect(html).toContain("Página 2 de 3");
    expect(html).toContain("Página anterior");
    expect(html).toContain("Página siguiente");
  });
});

describe("CEDIS transfer command panel", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    container.remove();
  });

  function renderPanel(
    onSubmit: (payload: unknown, key: string) => Promise<void>,
  ) {
    root = createRoot(container);
    act(() => {
      root.render(
        <CedisTransferCommandPanel
          branch={card.branch}
          cedis={summary.distributionCenter}
          expectedVersion={summary.version}
          mode="SUPPLY"
          onClose={vi.fn()}
          onSubmit={onSubmit}
          products={[product]}
          productsLoading={false}
        />,
      );
    });
  }

  async function fillSupplyForm(submit = true) {
    await act(async () => {
      const select = container.querySelector("select") as HTMLSelectElement;
      select.value = "product-1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const input = container.querySelector(
        'input[aria-label="Kilos 1"]',
      ) as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "25.5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    if (submit) {
      await act(async () => {
        (
          container.querySelector('button[type="submit"]') as HTMLButtonElement
        ).click();
      });
    }
  }

  it("muestra el origen, destino y cantidades antes de confirmar", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderPanel(onSubmit);
    await fillSupplyForm(false);

    expect(container.textContent).toContain("Existencia física");
    expect(container.textContent).toContain("Comprometido");
    expect(container.textContent).toContain("Disponible");
    expect(container.textContent).toContain("Suficiente");
    await act(async () => {
      (
        container.querySelector('button[type="submit"]') as HTMLButtonElement
      ).click();
    });
    expect(container.textContent).toContain("Confirmación requerida");
    expect(container.textContent).toContain("CEDIS Centro");
    expect(container.textContent).toContain("Sucursal Centro");
    expect(container.textContent).toContain("25.5 kg");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra lo enviado y descuenta la venta no realizada del monto esperado al devolver", async () => {
    const returnProduct: Product = {
      ...product,
      inventoryBalance: {
        ...product.inventoryBalance!,
        locationId: "branch-1",
        quantityKg: 80,
        reservedQuantityKg: 0,
        availableQuantityKg: 80,
      },
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    root = createRoot(container);
    act(() => {
      root.render(
        <CedisTransferCommandPanel
          branch={card.branch}
          cedis={summary.distributionCenter}
          cycleItems={summary.items}
          expectedSales={summary.totals.expectedSales}
          expectedVersion={summary.version}
          mode="RETURN"
          onClose={vi.fn()}
          onSubmit={onSubmit}
          products={[returnProduct]}
          productsLoading={false}
        />,
      );
    });

    await act(async () => {
      const select = container.querySelector("select") as HTMLSelectElement;
      select.value = "product-1";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const input = container.querySelector(
        'input[aria-label="Kilos 1"]',
      ) as HTMLInputElement;
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setValue?.call(input, "5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Enviado en ciclo");
    expect(container.textContent).toContain("120 kg");
    expect(container.textContent).toContain("Vendido en sucursal");
    expect(container.textContent).toContain("108 kg");
    expect(container.textContent).toContain("Límite para devolver");
    expect(container.textContent).toContain("2 kg");
    expect(container.textContent).toContain("Venta no realizada");
    expect(container.textContent).toContain("$425.00");
    expect(container.textContent).toContain("Monto esperado después");
    expect(container.textContent).toContain("$8,925.00");

    await act(async () => {
      (
        container.querySelector('button[type="submit"]') as HTMLButtonElement
      ).click();
    });
    expect(container.textContent).toContain(
      "supera el límite de producto no vendido",
    );
    expect(container.textContent).not.toContain("Confirmación requerida");
  });

  it("bloquea una cantidad que supera la disponibilidad actual", async () => {
    const constrainedProduct: Product = {
      ...product,
      inventoryBalance: {
        ...product.inventoryBalance!,
        quantityKg: 10,
        reservedQuantityKg: 8,
        availableQuantityKg: 2,
      },
    };
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    root = createRoot(container);
    act(() => {
      root.render(
        <CedisTransferCommandPanel
          branch={card.branch}
          cedis={summary.distributionCenter}
          expectedVersion={summary.version}
          mode="SUPPLY"
          onClose={vi.fn()}
          onSubmit={onSubmit}
          products={[constrainedProduct]}
          productsLoading={false}
        />,
      );
    });
    expect(
      (container.querySelector('button[type="submit"]') as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    await fillSupplyForm();

    expect(container.textContent).toContain("supera la disponibilidad");
    expect(container.textContent).not.toContain("Confirmación requerida");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("deshabilita productos sin disponibilidad en el selector", () => {
    const unavailableProduct: Product = {
      ...product,
      inventoryBalance: {
        ...product.inventoryBalance!,
        quantityKg: 0,
        reservedQuantityKg: 0,
        availableQuantityKg: 0,
      },
    };
    const html = renderToStaticMarkup(
      <CedisTransferCommandPanel
        branch={card.branch}
        cedis={summary.distributionCenter}
        expectedVersion={summary.version}
        mode="SUPPLY"
        onClose={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        products={[unavailableProduct]}
        productsLoading={false}
      />,
    );

    expect(html).toContain("Sin disponibilidad");
    expect(html).toContain('disabled=""');
  });

  it("conserva la misma Idempotency-Key al reintentar un comando fallido", async () => {
    const onSubmit = vi
      .fn<(_: unknown, __: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    renderPanel(onSubmit);
    await fillSupplyForm();
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Confirmar suministro"))
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("network");
    expect(container.textContent).toContain("Reintentar suministro");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Reintentar suministro"))
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit.mock.calls[0]?.[1]).toBe(onSubmit.mock.calls[1]?.[1]);
  });
});
