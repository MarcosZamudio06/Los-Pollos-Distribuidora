// @vitest-environment jsdom
import { act, createRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CancelSaleDialog } from "../CancelSaleDialog";
import {
  ConfirmSaleButton,
  CustomerSelector,
  SaleSummary,
  TicketModal,
} from "../components";
import { CartPanel as Cart } from "../pos/CartPanel";
import { CheckoutDock, selectCheckoutVisualState } from "../pos/CheckoutDock";
import { ProductResultsTable } from "../pos/ProductResultsTable";
import { SaleDetailPage } from "../SaleDetailPage";
import { SalesHistoryPage } from "../SalesHistoryPage";
import { SalesPosPage } from "../SalesPosPage";
import type {
  SaleDetail,
  SalePaymentInput,
  SaleVoidPreview,
  TicketData,
} from "../types";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mockState = vi.hoisted(() => ({
  auth: { user: { role: "ADMIN" } },
  cashSession: {
    data: {
      id: "shift-1",
      terminalId: "terminal-1",
      operationalLocationId: "loc-counter",
      pointOfSaleDailyCloseId: "close-1",
      cashierUserId: "admin-1",
      businessDate: "2026-07-22",
      status: "OPEN",
      openedAt: "2026-07-22T08:03:00.000Z",
      initialCashFund: "1500",
      initialCashIn: "0",
      initialCashOut: "0",
      terminal: {
        id: "terminal-1",
        operationalLocationId: "loc-counter",
        code: "C01",
        name: "Caja 01",
        deviceId: "device-1",
        isActive: true,
      },
      cashier: { id: "admin-1", name: "Admin" },
    },
    isLoading: false,
  },
  cancelSale: { isPending: false, mutateAsync: vi.fn() },
  voidPreview: {
    data: null as SaleVoidPreview | null,
    error: null,
    isLoading: false,
  },
  voidSale: { isPending: false, mutateAsync: vi.fn() },
  documents: {
    data: {
      items: [] as Array<{
        createdAt?: string;
        documentType?: string;
        id?: string;
        physicalFolio?: string;
        status?: string;
      }>,
    },
    error: null,
    isLoading: false,
  },
  createSale: { isPending: false, mutateAsync: vi.fn() },
  customers: {
    data: [] as Array<Record<string, unknown>>,
    error: null,
    isLoading: false,
  },
  locations: {
    data: [] as Array<Record<string, unknown>>,
    error: null,
    isLoading: false,
  },
  products: {
    data: [] as Array<Record<string, unknown>>,
    error: null,
    isLoading: false,
    refetch: vi.fn(),
  },
  sale: { data: null as SaleDetail | null, error: null, isLoading: false },
  sales: { data: { items: [] as SaleDetail[] }, error: null, isLoading: false },
  ticket: {
    data: undefined as TicketData | undefined,
    error: null as unknown,
    isLoading: false,
    refetch: vi.fn(),
  },
  toast: { success: vi.fn(), warning: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mockState.toast }));

vi.mock("../hooks", () => ({
  useCancelSale: () => mockState.cancelSale,
  useSaleVoidPreview: () => mockState.voidPreview,
  useVoidSale: () => mockState.voidSale,
  useCreateSale: () => mockState.createSale,
  useSale: () => mockState.sale,
  useSaleDocuments: () => mockState.documents,
  useSales: () => mockState.sales,
  useSaleTicket: () => mockState.ticket,
}));

vi.mock("../../auth", () => ({
  useAuth: () => mockState.auth,
}));

vi.mock("../../cierre-diario/hooks", () => ({
  useOpenCashSession: () => mockState.cashSession,
}));

vi.mock("../../inventario/hooks/useProducts", () => ({
  useProducts: () => mockState.products,
}));

vi.mock("../../compras/hooks", () => ({
  usePurchaseLocations: () => mockState.locations,
}));

vi.mock("../../clientes/hooks/useCustomers", () => ({
  useCustomers: () => mockState.customers,
}));

vi.mock("../../rutas-reparto/components/DriverRouteMap", () => ({
  DriverRouteMap: ({
    compact,
    currentOrder,
    orders = [],
    routeName,
  }: {
    compact?: boolean;
    currentOrder?: { stopSequence?: number | null };
    orders?: Array<{ stopSequence?: number | null }>;
    routeName: string;
  }) => (
    <div
      aria-label={`Mapa de ${routeName}`}
      data-compact={compact ? "true" : "false"}
    >
      {orders.map((order) => (
        <span key={order.stopSequence}>Pedido {order.stopSequence}</span>
      ))}
      {currentOrder && <span>Pedido {currentOrder.stopSequence}</span>}
    </div>
  ),
}));

function renderWithRouter(
  element: React.ReactElement,
  initialEntry = "/sales/history",
) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>,
  );
}

function getButtonByText(
  container: HTMLElement,
  text: string,
): HTMLButtonElement {
  if (text === "Confirmar venta") {
    const confirmButton = container.querySelector(
      'button[aria-keyshortcuts="F8"]',
    );
    if (confirmButton instanceof HTMLButtonElement) return confirmButton;
  }
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`Button not found: ${text}`);
  return button;
}

async function selectPosCustomer(container: HTMLElement, customerName: string) {
  await act(async () => {
    getButtonByText(container, "Público general").click();
  });
  await act(async () => {
    getButtonByText(container, customerName).click();
  });
}

function getConditionButton(
  container: HTMLElement,
  label: string,
): HTMLButtonElement {
  const button = Array.from(
    container.querySelectorAll('button[role="radio"]'),
  ).find((candidate) => candidate.textContent === label);
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`Condition button not found: ${label}`);
  return button;
}

function getPosPrimaryAction(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector("button[data-pos-primary-action]");
  if (!(button instanceof HTMLButtonElement))
    throw new Error("POS primary action not found");
  return button;
}

async function openPaymentCapture(container: HTMLElement) {
  const button = container.querySelector(
    '[aria-label="Resumen de pago"] button[aria-controls="pos-payment-entry"]',
  );
  if (!(button instanceof HTMLButtonElement))
    throw new Error("Payment summary button not found");
  await act(async () => {
    button.click();
  });
}

async function addPosPayment(container: HTMLElement) {
  await openPaymentCapture(container);
}

function getSelectByLabelText(
  container: HTMLElement,
  text: string,
): HTMLSelectElement {
  const label = Array.from(container.querySelectorAll("label")).find(
    (candidate) => candidate.textContent?.includes(text),
  );
  const select = label?.querySelector("select");
  if (!(select instanceof HTMLSelectElement))
    throw new Error(`Select not found for label: ${text}`);
  return select;
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function changeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderDom(
  element: React.ReactElement,
): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(element);
  });

  return { container, root };
}

const confirmedSale: SaleDetail = {
  id: "sale-1",
  saleNumber: "V-1001",
  collectionStatus: "UNPAID",
  createdAt: "2026-07-03T15:30:00.000Z",
  customerName: "Restaurante Norte",
  documentType: "SIMPLE_NOTE",
  items: [
    {
      productId: "prod-1",
      productName: "Pollo entero",
      quantityKg: 0,
      quantityPieces: 3,
      subtotal: 276,
      discount: 27.6,
      taxableBase: 248.4,
      tax: 0,
      total: 248.4,
      unit: "PIECE",
    },
  ],
  locationId: "loc-counter",
  paymentType: "CREDIT_SALE",
  physicalFolio: "N-42",
  saleChannel: "COUNTER",
  status: "CONFIRMED",
  total: 276,
  version: 4,
};

describe("TASK-055 sales UI behavior", () => {
  beforeEach(() => {
    mockState.auth = { user: { role: "ADMIN" } };
    mockState.cashSession = {
      data: {
        id: "shift-1",
        terminalId: "terminal-1",
        operationalLocationId: "loc-counter",
        pointOfSaleDailyCloseId: "close-1",
        cashierUserId: "admin-1",
        businessDate: "2026-07-22",
        status: "OPEN",
        openedAt: "2026-07-22T08:03:00.000Z",
        initialCashFund: "1500",
        initialCashIn: "0",
        initialCashOut: "0",
        terminal: {
          id: "terminal-1",
          operationalLocationId: "loc-counter",
          code: "C01",
          name: "Caja 01",
          deviceId: "device-1",
          isActive: true,
        },
        cashier: { id: "admin-1", name: "Admin" },
      },
      isLoading: false,
    };
    mockState.cancelSale = { isPending: false, mutateAsync: vi.fn() };
    mockState.voidPreview = { data: null, error: null, isLoading: false };
    mockState.voidSale = { isPending: false, mutateAsync: vi.fn() };
    mockState.createSale = { isPending: false, mutateAsync: vi.fn() };
    mockState.customers = { data: [], error: null, isLoading: false };
    mockState.documents = {
      data: { items: [] },
      error: null,
      isLoading: false,
    };
    mockState.locations = { data: [], error: null, isLoading: false };
    mockState.products = {
      data: [],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.sale = { data: null, error: null, isLoading: false };
    mockState.sales = { data: { items: [] }, error: null, isLoading: false };
    mockState.ticket = {
      data: undefined,
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.toast.success.mockReset();
    mockState.toast.warning.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("selecciona un único estado visual del dock según la prioridad operacional", () => {
    const state = (
      transactionState: Parameters<
        typeof selectCheckoutVisualState
      >[0]["transactionState"],
      disabledReason = "",
      payments: Parameters<
        typeof selectCheckoutVisualState
      >[0]["payments"] = [],
    ) =>
      selectCheckoutVisualState({ disabledReason, payments, transactionState });

    expect(
      state("PROCESSING", "Selecciona una ubicación operativa."),
    ).toMatchObject({ kind: "LOCATION_REQUIRED" });
    expect(
      state(
        "READY_TO_CHARGE",
        "Abre un turno de caja en esta terminal antes de registrar ventas.",
      ),
    ).toMatchObject({ kind: "CASH_CLOSED" });
    expect(
      state("READY_TO_CHARGE", "Producto sin existencia en Mostrador."),
    ).toMatchObject({ kind: "STOCK_INSUFFICIENT" });
    expect(
      state("EMPTY", "Sin conexión. La venta no se registrará sin conexión."),
    ).toMatchObject({ kind: "CART_EMPTY" });
    expect(state("WEIGHT_PENDING")).toMatchObject({ kind: "WEIGHT_PENDING" });
    expect(state("CUSTOMER_REQUIRED")).toMatchObject({
      kind: "CUSTOMER_REQUIRED",
    });
    expect(
      state(
        "CREDIT_BLOCKED",
        "La venta excede el crédito disponible de $10.00.",
      ),
    ).toMatchObject({ kind: "CREDIT_UNVALIDATED" });
    expect(
      state("CREDIT_BLOCKED", "El crédito del cliente está bloqueado."),
    ).toMatchObject({ kind: "CREDIT_BLOCKED" });
    expect(
      state(
        "CREDIT_BLOCKED",
        "Solo un administrador puede autorizar esta excepción de crédito.",
      ),
    ).toMatchObject({ kind: "SUPERVISOR_REQUIRED" });
    expect(state("CART_ACTIVE")).toMatchObject({ kind: "PAYMENT_NOT_STARTED" });
    expect(
      state("PAYMENT_PENDING", "", [{ amount: 10, paymentMethod: "CASH" }]),
    ).toMatchObject({ kind: "PAYMENT_PARTIAL" });
    expect(state("READY_TO_CHARGE")).toMatchObject({ kind: "READY_TO_CHARGE" });
    expect(state("PROCESSING")).toMatchObject({ kind: "PROCESSING" });
    expect(state("SUCCESS")).toMatchObject({ kind: "SALE_REGISTERED" });
    expect(state("SUCCESS", "Ticket impreso.")).toMatchObject({
      kind: "TICKET_PRINTED",
    });
    expect(
      state("BLOCKED", "Sin conexión. La venta no se registrará sin conexión."),
    ).toMatchObject({ kind: "OFFLINE" });
  });

  it("renderiza POS empresarial para ADMIN y mantiene estados operativos visibles", () => {
    mockState.auth = { user: { role: "ADMIN" } };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            locationName: "Mostrador",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
        {
          id: "prod-2",
          name: "Pechuga",
          sku: "PECH",
          presentationType: "CUT",
          unit: "KG",
          salePrice: 120,
          inventoryBalance: {
            locationId: "loc-counter",
            locationName: "Mostrador",
            quantityKg: 0,
            quantityPieces: 0,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
        {
          id: "loc-ext",
          name: "Punto externo",
          code: "EXT",
          type: "EXTERNAL_POINT_OF_SALE",
        },
      ],
      error: null,
      isLoading: false,
    };

    const html = renderWithRouter(<SalesPosPage />, "/sales");

    expect(html).toContain("Escáner y búsqueda");
    expect(html).toContain("h-[52px]");
    expect(html).toContain("h-16");
    expect(html).toContain("grid-cols-[40fr_60fr]");
    expect(html).toContain("xl:grid-cols-[38fr_62fr]");
    expect(html).toContain("min-h-0 min-w-0 overflow-hidden border-r");
    expect(html).toContain(
      "relative flex min-h-0 min-w-0 flex-col overflow-hidden",
    );
    expect(html).toContain("h-60");
    expect(html).toContain("min-[1280px]:h-36");
    expect(html).toContain("grid-rows-[repeat(3,minmax(0,1fr))]");
    expect(html).toContain("gap-px");
    expect(html).toContain("min-[1024px]:grid-cols-[20fr_13fr_22fr]");
    expect(html).toContain(
      "min-[1024px]:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
    );
    expect(html).toContain("min-[1280px]:grid-cols-[20fr_13fr_22fr_20fr_25fr]");
    expect(html).toContain("Total de la venta");
    expect(html).toContain("text-[clamp(2.25rem,3.2vw,3rem)]");
    expect(html).toContain("Total en vivo");
    expect(html).toContain("Ubicación operativa");
    expect(html).toContain("Resultados");
    expect(html).toContain("Carrito");
    expect(html).toContain("Cliente");
    expect(html).toContain("Condición comercial");
    expect(html).toContain("Documento de venta");
    expect(html).toContain("Resumen de transacción");
    expect(html).toContain("Resumen de transacción y total");
    expect(html).toContain("Selecciona una ubicación operativa");
    expect(html).toContain("Mostrador · MOST");
    expect(html).toContain("Nueva venta");
    expect(html).toContain("Ventas recientes");
    expect(html).toContain('aria-controls="pos-recent-sales-modal"');
    expect(html).toContain("Frecuentes recientes");
    expect(html).toContain("Impresora: no configurada");
    expect(html).toContain("Báscula: captura manual");
    expect(html).not.toContain("Teclado numérico");
    expect(html).toContain("Listo · F2");
    expect(html).toContain("Agrega productos");
    expect(html).toContain("Resolución no compatible");
  });

  it("abre ventas recientes en un modal descendente sin salir del POS", async () => {
    mockState.sales = {
      data: { items: [confirmedSale] },
      error: null,
      isLoading: false,
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const recentSalesButton = container.querySelector<HTMLButtonElement>(
        'button[aria-controls="pos-recent-sales-modal"]',
      );
      expect(recentSalesButton).toBeTruthy();
      expect(recentSalesButton?.getAttribute("href")).toBeNull();

      await act(async () => {
        recentSalesButton?.click();
      });

      const dialog = container.querySelector<HTMLElement>(
        '[role="dialog"]#pos-recent-sales-modal',
      );
      expect(dialog).toBeTruthy();
      expect(dialog?.className).toContain("pos-recent-sales-drop");
      expect(dialog?.getAttribute("aria-modal")).toBe("true");
      expect(dialog?.textContent).toContain("V-1001");
      expect(dialog?.textContent).toContain("Restaurante Norte");
      expect(dialog?.textContent).toContain("$276.00");
      expect(container.querySelector('a[href="/sales/history"]')).toBeNull();

      await act(async () => {
        container
          .querySelector<HTMLButtonElement>(
            'button[aria-label="Cerrar ventas recientes"]',
          )
          ?.click();
      });

      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(recentSalesButton);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("enfoca la búsqueda con F2 y conserva controles de operación rápida", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const search = container.querySelector("#pos-product-search");
      expect(search).toBeInstanceOf(HTMLInputElement);
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F2", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(search);
      expect(
        container.querySelector('[aria-label="Teclado numérico"]'),
      ).toBeNull();
      expect(
        container.querySelector(
          'button[aria-label="Activar pantalla completa"]',
        ),
      ).toBeTruthy();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("dirige F4, F6, F7, F8 y F9 al paso operacional correspondiente", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.customers = {
      data: [
        {
          id: "customer-1",
          name: "Restaurante Norte",
          customerNumber: "C-001",
          customerType: "WHOLESALE",
          creditStatus: "ACTIVE",
          isActive: true,
          creditSummary: {
            effectiveCreditStatus: "ACTIVE",
            availableCredit: 3200,
          },
        },
      ],
      error: null,
      isLoading: false,
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
        getButtonByText(container, "Agregar").click();
      });

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F4", bubbles: true }),
        );
      });
      const customerDialog = container.querySelector('[role="dialog"]');
      expect(customerDialog).toBeTruthy();
      expect(customerDialog?.className).toContain("min-[1440px]:absolute");
      expect(customerDialog?.className).not.toContain("min-[1280px]");
      expect(customerDialog?.getAttribute("aria-modal")).toBe("true");
      expect(customerDialog?.getAttribute("aria-labelledby")).toBe(
        "pos-customer-selection-title",
      );
      expect(customerDialog?.textContent).toContain(
        "Directorio de clientes · F4",
      );
      expect(customerDialog?.textContent).toContain(
        "Busca por nombre, número o razón social.",
      );
      expect(customerDialog?.textContent).toContain("Restaurante Norte");
      expect(customerDialog?.textContent).toContain("C-001");
      expect(customerDialog?.textContent).toContain("Disponible $3,200.00");
      expect(container.textContent).toContain("Seleccionar cliente");
      expect(
        container.querySelector('[aria-label="Teclado numérico"]'),
      ).toBeNull();
      await act(async () => {
        customerDialog?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      });
      expect(container.querySelector('[role="dialog"]')).toBeNull();

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F6", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(
        container.querySelector(
          'input[aria-label="Efectivo entregado del pago 1"]',
        ),
      );
      expect(
        container.querySelector('[role="dialog"]')?.getAttribute("aria-modal"),
      ).toBe("true");

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F7", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(
        container.querySelector(
          '[aria-label="Condición comercial"] [role="radio"]',
        ),
      );
      expect(
        container
          .querySelector('[aria-label="Condición comercial"]')
          ?.getAttribute("aria-keyshortcuts"),
      ).toBe("F7");
      expect(
        container
          .querySelector('[aria-label="Resumen de pago"] button')
          ?.getAttribute("aria-keyshortcuts"),
      ).toBe("F6");
      expect(
        container
          .querySelector('[aria-label="Resumen de pago"] button')
          ?.getAttribute("title"),
      ).toContain("F6");

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F9", bubbles: true }),
        );
      });
      expect(document.body.textContent).toContain("¿Iniciar nueva venta?");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("mantiene F6 exclusivo para Pago y asigna F7 a Condición", async () => {
    const conditionPanelRef = createRef<HTMLElement>();
    const paymentPanelRef = createRef<HTMLElement>();
    const customerSearchRef = createRef<HTMLInputElement>();
    const { container, root } = await renderDom(
      <CheckoutDock
        cart={[]}
        conditionPanelRef={conditionPanelRef}
        customerSearch=""
        customerSearchRef={customerSearchRef}
        customers={[]}
        customersError={null}
        customersLoading={false}
        isSubmitting={false}
        onConfirm={() => undefined}
        onCustomerSearchChange={() => undefined}
        onCustomerSelect={() => undefined}
        onPaymentTypeChange={() => undefined}
        onPaymentsChange={() => undefined}
        paymentPanelRef={paymentPanelRef}
        paymentType="CASH_SALE"
        payments={[]}
        selectedCustomer={null}
        total={100}
        transactionState="CART_ACTIVE"
      />,
    );

    try {
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F7", bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(
        container.querySelector(
          '[aria-label="Condición comercial"] [role="radio"]',
        ),
      );
      expect(
        container
          .querySelector('[aria-label="Condición comercial"]')
          ?.getAttribute("aria-keyshortcuts"),
      ).toBe("F7");
      expect(
        container
          .querySelector('[aria-label="Condición comercial"]')
          ?.getAttribute("title"),
      ).toContain("F7");

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F6", bubbles: true }),
        );
      });
      expect(
        container
          .querySelector('[aria-label="Resumen de pago"] button')
          ?.getAttribute("aria-keyshortcuts"),
      ).toBe("F6");
      expect(
        container
          .querySelector('[aria-label="Resumen de pago"] button')
          ?.getAttribute("title"),
      ).toContain("F6");
      expect(
        container.querySelector('[aria-label="Captura de pagos"]'),
      ).toBeTruthy();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("mantiene el dock dentro de su altura y cambia a una fila desde 1280px", () => {
    const html = renderToStaticMarkup(
      <CheckoutDock
        cart={[]}
        customerSearch=""
        customers={[]}
        customersError={null}
        customersLoading={false}
        isSubmitting={false}
        onConfirm={() => undefined}
        onCustomerSearchChange={() => undefined}
        onCustomerSelect={() => undefined}
        onPaymentTypeChange={() => undefined}
        onPaymentsChange={() => undefined}
        paymentType="CASH_SALE"
        payments={[]}
        selectedCustomer={null}
        total={0}
        transactionState="EMPTY"
      />,
    );
    const dock = document.createElement("div");
    dock.innerHTML = html;
    const footer = dock.querySelector("footer");
    const grid = footer?.firstElementChild;

    expect(footer?.className).toContain("min-[1024px]:h-60");
    expect(footer?.className).toContain("min-[1280px]:h-36");
    expect(grid?.className).toContain(
      "min-[1024px]:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
    );
    expect(grid?.className).toContain("min-[1280px]:grid-rows-1");

    const primaryAction = dock.querySelector("button[data-pos-primary-action]");
    const actionWrapper = primaryAction?.parentElement;
    const summaryWrapper = dock.querySelector(
      '[aria-label="Resumen de transacción y total"]',
    )?.parentElement;
    expect(primaryAction?.className).toContain("w-full");
    expect(primaryAction?.className).toContain("rounded-[14px]");
    expect(primaryAction?.className).toContain("active:scale-95");
    expect(primaryAction?.className).toContain("disabled:opacity-50");
    expect(actionWrapper?.className).toContain("min-[1280px]:col-start-5");
    expect(actionWrapper?.className).toContain("p-3");
    expect(actionWrapper?.className).not.toContain("bg-[var(--pos-action)]");
    expect(summaryWrapper?.className).toContain("min-[1280px]:col-start-4");
  });

  it("captura efectivo rápido, bloquea denominaciones insuficientes y enfoca Cobrar", async () => {
    const confirmButtonRef = createRef<HTMLButtonElement>();
    function CashDockHarness() {
      const [payments, setPayments] = useState<SalePaymentInput[]>([]);
      return (
        <CheckoutDock
          cart={[]}
          confirmButtonRef={confirmButtonRef}
          customerSearch=""
          customers={[]}
          customersError={null}
          customersLoading={false}
          isSubmitting={false}
          onConfirm={() => undefined}
          onCustomerSearchChange={() => undefined}
          onCustomerSelect={() => undefined}
          onPaymentTypeChange={() => undefined}
          onPaymentsChange={setPayments}
          paymentType="CASH_SALE"
          payments={payments}
          selectedCustomer={null}
          total={187.5}
          transactionState={payments.length ? "READY_TO_CHARGE" : "CART_ACTIVE"}
        />
      );
    }
    const { container, root } = await renderDom(<CashDockHarness />);

    try {
      await openPaymentCapture(container);
      const cashInput = container.querySelector<HTMLInputElement>(
        'input[aria-label="Efectivo entregado del pago 1"]',
      );
      const fifty = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Usar $50.00 de efectivo entregado"]',
      );
      const twoHundred = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Usar $200.00 de efectivo entregado"]',
      );
      expect(document.activeElement).toBe(cashInput);
      expect(fifty?.disabled).toBe(true);
      expect(twoHundred?.disabled).toBe(false);
      expect(getButtonByText(container, "Agregar pago").disabled).toBe(true);

      await act(async () => {
        twoHundred?.click();
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });

      const change = container.querySelector(
        '[aria-label="Resumen de pago"] dl > div:last-child',
      );
      expect(change?.textContent).toContain("$12.50");
      expect(change?.className).toContain("text-[var(--pos-success)]");
      expect(
        container.querySelector('[aria-label="Captura de pagos"]'),
      ).toBeNull();
      expect(document.activeElement).toBe(confirmButtonRef.current);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("habilita Confirmar venta al capturar efectivo manualmente", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );

    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
        getButtonByText(container, "Agregar").click();
      });
      await addPosPayment(container);

      const cashTendered = container.querySelector<HTMLInputElement>(
        'input[aria-label="Efectivo entregado del pago 1"]',
      );
      expect(cashTendered).toBeTruthy();
      await act(async () => {
        changeInput(cashTendered as HTMLInputElement, "100.00");
      });

      const primaryAction = getPosPrimaryAction(container);
      expect(primaryAction.disabled).toBe(false);
      expect(primaryAction.textContent).toContain("Confirmar venta");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("deshabilita Crédito para Público general y lo habilita sólo con un cliente válido", async () => {
    const conditionPanelRef = createRef<HTMLElement>();
    const paymentPanelRef = createRef<HTMLElement>();
    const customerSearchRef = createRef<HTMLInputElement>();
    const onPaymentTypeChange = vi.fn();
    const validCustomer = {
      id: "customer-1",
      name: "Cliente válido",
      customerType: "WHOLESALE" as const,
      isActive: true,
      active: true,
      creditSummary: { availableCredit: 1000 },
    };
    const renderDock = (selectedCustomer: typeof validCustomer | null) => (
      <CheckoutDock
        cart={[]}
        conditionPanelRef={conditionPanelRef}
        customerSearch=""
        customerSearchRef={customerSearchRef}
        customers={[]}
        customersError={null}
        customersLoading={false}
        isSubmitting={false}
        onConfirm={() => undefined}
        onCustomerSearchChange={() => undefined}
        onCustomerSelect={() => undefined}
        onPaymentTypeChange={onPaymentTypeChange}
        onPaymentsChange={() => undefined}
        paymentPanelRef={paymentPanelRef}
        paymentType="CASH_SALE"
        payments={[]}
        selectedCustomer={selectedCustomer}
        total={100}
        transactionState="CART_ACTIVE"
      />
    );
    const { container, root } = await renderDom(renderDock(null));

    try {
      const creditButton = getConditionButton(container, "Crédito");
      expect(creditButton.disabled).toBe(true);
      expect(creditButton.getAttribute("aria-disabled")).toBe("true");
      expect(creditButton.tabIndex).toBe(-1);
      expect(creditButton.getAttribute("aria-describedby")).toBe(
        "pos-credit-condition-reason",
      );
      expect(
        container.textContent?.match(
          /Selecciona un cliente válido para habilitar crédito\./g,
        ),
      ).toHaveLength(1);

      await act(async () => {
        creditButton.click();
      });
      expect(onPaymentTypeChange).not.toHaveBeenCalled();

      await act(async () => {
        root.render(renderDock(validCustomer));
      });
      const enabledCreditButton = getConditionButton(container, "Crédito");
      expect(enabledCreditButton.disabled).toBe(false);
      expect(enabledCreditButton.getAttribute("aria-disabled")).toBe("false");
      expect(enabledCreditButton.tabIndex).toBe(0);
      expect(enabledCreditButton.getAttribute("aria-describedby")).toBeNull();
      expect(container.textContent).not.toContain(
        "Selecciona un cliente válido para habilitar crédito.",
      );

      await act(async () => {
        enabledCreditButton.click();
      });
      expect(onPaymentTypeChange).toHaveBeenCalledWith("CREDIT_SALE");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("permite entrar a crédito para capturar un adelanto aunque el total exceda el crédito disponible", async () => {
    const conditionPanelRef = createRef<HTMLElement>();
    const paymentPanelRef = createRef<HTMLElement>();
    const customerSearchRef = createRef<HTMLInputElement>();
    const onPaymentTypeChange = vi.fn();
    const customer = {
      id: "customer-limited",
      name: "Cliente con crédito limitado",
      customerType: "WHOLESALE" as const,
      isActive: true,
      active: true,
      creditSummary: { availableCredit: 100 },
    };
    const { container, root } = await renderDom(
      <CheckoutDock
        cart={[]}
        conditionPanelRef={conditionPanelRef}
        customerSearch=""
        customerSearchRef={customerSearchRef}
        customers={[]}
        customersError={null}
        customersLoading={false}
        isSubmitting={false}
        onConfirm={() => undefined}
        onCustomerSearchChange={() => undefined}
        onCustomerSelect={() => undefined}
        onPaymentTypeChange={onPaymentTypeChange}
        onPaymentsChange={() => undefined}
        paymentPanelRef={paymentPanelRef}
        paymentType="CASH_SALE"
        payments={[]}
        selectedCustomer={customer}
        total={250}
        transactionState="CART_ACTIVE"
      />,
    );

    try {
      const creditButton = getConditionButton(container, "Crédito");
      expect(creditButton.disabled).toBe(false);

      await act(async () => {
        creditButton.click();
      });

      expect(onPaymentTypeChange).toHaveBeenCalledWith("CREDIT_SALE");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("convierte la captura de pago en adelanto y no precarga el total de crédito", async () => {
    function CreditDockHarness() {
      const [payments, setPayments] = useState<SalePaymentInput[]>([]);
      const [paymentType, setPaymentType] = useState<
        "CASH_SALE" | "CREDIT_SALE"
      >("CASH_SALE");
      return (
        <CheckoutDock
          cart={[]}
          customerSearch=""
          customers={[]}
          customersError={null}
          customersLoading={false}
          isSubmitting={false}
          onConfirm={() => undefined}
          onCustomerSearchChange={() => undefined}
          onCustomerSelect={() => undefined}
          onPaymentTypeChange={setPaymentType}
          onPaymentsChange={setPayments}
          paymentType={paymentType}
          payments={payments}
          selectedCustomer={{
            id: "customer-credit",
            name: "Cliente de crédito",
            customerType: "WHOLESALE",
            isActive: true,
            active: true,
            creditSummary: { availableCredit: 1000 },
          }}
          total={250}
          transactionState="READY_TO_CHARGE"
        />
      );
    }

    const { container, root } = await renderDom(<CreditDockHarness />);
    try {
      await openPaymentCapture(container);
      await act(async () => {
        getConditionButton(container, "Crédito").click();
      });

      expect(
        container.querySelector('[aria-label="Captura de adelantos"]'),
      ).toBeTruthy();
      expect(container.textContent).toContain("Adelanto");
      expect(container.textContent).toContain("Monto del adelanto");
      expect(container.textContent).toContain("Dinero entregado");
      expect(getButtonByText(container, "Agregar adelanto").disabled).toBe(
        false,
      );
      expect(
        (
          container.querySelector(
            'input[aria-label="Monto del adelanto 1"]',
          ) as HTMLInputElement
        ).value,
      ).toBe("");

      await act(async () => {
        changeInput(
          container.querySelector(
            'input[aria-label="Monto del adelanto 1"]',
          ) as HTMLInputElement,
          "",
        );
      });
      expect(
        container.querySelector('input[aria-label="Monto del adelanto 1"]'),
      ).toBeTruthy();

      await act(async () => {
        changeInput(
          container.querySelector(
            'input[aria-label="Dinero entregado del adelanto 1"]',
          ) as HTMLInputElement,
          "23",
        );
      });
      expect(container.textContent).toContain("Cambio$0.00");

      await act(async () => {
        changeInput(
          container.querySelector(
            'input[aria-label="Monto del adelanto 1"]',
          ) as HTMLInputElement,
          "150",
        );
      });
      expect(container.textContent).toContain("Pagado$150.00");
      expect(container.textContent).toContain("Pendiente$100.00");

      await act(async () => {
        changeInput(
          container.querySelector(
            'input[aria-label="Dinero entregado del adelanto 1"]',
          ) as HTMLInputElement,
          "200",
        );
      });
      expect(container.textContent).toContain("Cambio$50.00");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("habilita confirmar venta cuando el adelanto deja el saldo dentro del crédito disponible", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-credit",
          name: "Pollo a crédito",
          sku: "CREDIT-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 250,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 4,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.customers = {
      data: [
        {
          id: "customer-credit",
          name: "Cliente con saldo disponible",
          customerType: "WHOLESALE",
          creditStatus: "ACTIVE",
          isActive: true,
          creditSummary: {
            effectiveCreditStatus: "ACTIVE",
            availableCredit: 100,
          },
        },
      ],
      error: null,
      isLoading: false,
    };

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
        getButtonByText(container, "Agregar").click();
      });
      await selectPosCustomer(container, "Cliente con saldo disponible");
      await addPosPayment(container);
      await act(async () => {
        getConditionButton(container, "Crédito").click();
      });
      expect(getPosPrimaryAction(container).textContent).toContain(
        "Registrar adelanto",
      );

      const amount = container.querySelector(
        'input[aria-label="Monto del adelanto 1"]',
      ) as HTMLInputElement;
      await act(async () => {
        changeInput(amount, "150");
      });

      const primaryAction = getPosPrimaryAction(container);
      expect(primaryAction.disabled).toBe(false);
      expect(primaryAction.textContent).toContain("Confirmar venta");
      expect(
        container.querySelector('[aria-label="Resumen de pago"]')?.textContent,
      ).toContain("$150.00");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("conserva la captura cuando el monto se borra temporalmente para editarlo", async () => {
    function CashDockHarness() {
      const [payments, setPayments] = useState<SalePaymentInput[]>([]);
      return (
        <CheckoutDock
          cart={[]}
          customerSearch=""
          customers={[]}
          customersError={null}
          customersLoading={false}
          isSubmitting={false}
          onConfirm={() => undefined}
          onCustomerSearchChange={() => undefined}
          onCustomerSelect={() => undefined}
          onPaymentTypeChange={() => undefined}
          onPaymentsChange={setPayments}
          paymentType="CASH_SALE"
          payments={payments}
          selectedCustomer={null}
          total={250}
          transactionState="CART_ACTIVE"
        />
      );
    }

    const { container, root } = await renderDom(<CashDockHarness />);
    try {
      await openPaymentCapture(container);
      const amount = container.querySelector(
        'input[aria-label="Monto aplicado del pago 1"]',
      ) as HTMLInputElement;
      await act(async () => {
        changeInput(amount, "200");
        changeInput(amount, "");
      });

      expect(
        container.querySelector(
          'input[aria-label="Monto aplicado del pago 1"]',
        ),
      ).toBeTruthy();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("abre la confirmación con F8 cuando la venta está lista para cobrar", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
        getButtonByText(container, "Agregar").click();
      });
      await addPosPayment(container);
      expect(container.textContent).toContain("Efectivo $92.00");
      expect(container.textContent).toContain("Pagado");
      expect(container.textContent).toContain("Cambio");
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "F8", bubbles: true }),
        );
      });

      expect(document.body.textContent).toContain("Confirmar venta");
      expect(document.body.textContent).toContain(
        "Saldo pendiente de esta venta",
      );
      expect(
        container.querySelector('[data-pos-shell] [role="alertdialog"]'),
      ).toBeTruthy();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("agrega un producto al leer su SKU y presionar Enter", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const search = container.querySelector("#pos-product-search");
      expect(search).toBeInstanceOf(HTMLInputElement);
      await act(async () => {
        changeInput(search as HTMLInputElement, "POL-1");
        search?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(container.textContent).toContain("1 en carrito");
      expect(container.textContent).toContain("Agregado: Pollo entero");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("bloquea el escaneo de un producto sin existencia y muestra la sucursal", async () => {
    mockState.locations = {
      data: [
        {
          id: "loc-center",
          name: "Sucursal Centro",
          code: "CENTRO",
          type: "BRANCH",
        },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-empty",
          name: "Pollo entero",
          sku: "POL-EMPTY",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-center",
            locationName: "Sucursal Centro",
            quantityKg: 0,
            quantityPieces: 0,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-center";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const search = container.querySelector(
        "#pos-product-search",
      ) as HTMLInputElement;
      await act(async () => {
        changeInput(search, "POL-EMPTY");
        search.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });

      expect(container.textContent).toContain(
        "Producto sin existencia en Sucursal Centro.",
      );
      expect(container.textContent).toContain("0 en carrito");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("deshabilita Agregar sin stock sin hover, foco ni tabulación y conserva Sin stock visible", async () => {
    const onAdd = vi.fn();
    const products = [
      {
        availableKg: 0,
        availablePieces: 0,
        id: "prod-empty",
        locationId: "loc-counter",
        name: "Pollo agotado",
        presentationType: "WHOLE" as const,
        quantityKg: 0,
        quantityPieces: 0,
        salePrice: 92,
        unit: "PIECE" as const,
        unitPrice: 92,
      },
      {
        availableKg: 10,
        availablePieces: 8,
        id: "prod-available",
        locationId: "loc-counter",
        name: "Pollo disponible",
        presentationType: "WHOLE" as const,
        quantityKg: 0,
        quantityPieces: 0,
        salePrice: 92,
        unit: "PIECE" as const,
        unitPrice: 92,
      },
    ];
    const { container, root } = await renderDom(
      <ProductResultsTable
        error={null}
        frequentProducts={[]}
        isLoading={false}
        locationId="loc-counter"
        locations={[]}
        locationsError={null}
        locationsLoading={false}
        onAdd={onAdd}
        onLocationChange={() => undefined}
        products={products}
        search=""
        showLocationSelector={false}
      />,
    );
    try {
      const emptyRow = Array.from(container.querySelectorAll("tbody tr")).find(
        (row) => row.textContent?.includes("Pollo agotado"),
      );
      const emptyButton = emptyRow?.querySelector("button");
      const availableButton = Array.from(
        container.querySelectorAll("button"),
      ).find((button) =>
        button.closest("tr")?.textContent?.includes("Pollo disponible"),
      );

      expect(emptyButton).toBeInstanceOf(HTMLButtonElement);
      expect((emptyButton as HTMLButtonElement).disabled).toBe(true);
      expect((emptyButton as HTMLButtonElement).tabIndex).toBe(-1);
      expect(emptyButton?.getAttribute("aria-describedby")).toBe(
        "product-stock-prod-empty",
      );
      expect(emptyButton?.className).toContain("cursor-not-allowed");
      expect(emptyButton?.className).toContain("disabled:pointer-events-none");
      expect(emptyButton?.className).not.toContain("hover:");
      expect(emptyButton?.className).not.toContain("focus-visible:");
      expect(emptyRow?.textContent).toContain("Sin stock");
      expect(availableButton).toBeInstanceOf(HTMLButtonElement);
      expect((availableButton as HTMLButtonElement).disabled).toBe(false);

      await act(async () => {
        (emptyButton as HTMLButtonElement).click();
      });
      expect(onAdd).not.toHaveBeenCalled();
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("agrega un producto al leer su código de barras y presionar Enter", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          barcode: "7501234567890",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const search = container.querySelector("#pos-product-search");
      expect(search).toBeInstanceOf(HTMLInputElement);
      await act(async () => {
        changeInput(search as HTMLInputElement, "7501234567890");
        search?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(container.textContent).toContain("1 en carrito");
      expect(container.textContent).toContain("Agregado: Pollo entero");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("incrementa una pieza cada vez que el lector repite el mismo producto y resalta la partida", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          barcode: "7501234567890",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            locationName: "Mostrador",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const search = container.querySelector(
        "#pos-product-search",
      ) as HTMLInputElement;
      await act(async () => {
        for (let index = 0; index < 2; index += 1) {
          changeInput(search, "7501234567890");
          search.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
          );
        }
      });

      expect(
        (
          container.querySelector(
            'input[aria-label="Piezas capturadas de Pollo entero"]',
          ) as HTMLInputElement
        ).value,
      ).toBe("2");
      expect(container.textContent).toContain(
        "Incrementado: Pollo entero (2 piezas)",
      );
      expect(
        container.querySelector(".pos-cart-row-added")?.textContent,
      ).toContain("Pollo entero");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("selecciona un producto por kilogramo repetido y solicita capturar el peso sin alterar la cantidad", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-2",
          name: "Pechuga",
          sku: "PECH-1",
          barcode: "7501234567891",
          presentationType: "CUT",
          unit: "KG",
          salePrice: 120,
          inventoryBalance: {
            locationId: "loc-counter",
            locationName: "Mostrador",
            quantityKg: 10,
            quantityPieces: 0,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const search = container.querySelector(
        "#pos-product-search",
      ) as HTMLInputElement;
      await act(async () => {
        for (let index = 0; index < 2; index += 1) {
          changeInput(search, "7501234567891");
          search.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
          );
        }
      });

      expect(
        (
          container.querySelector(
            'input[aria-label="Kilos capturados de Pechuga"]',
          ) as HTMLInputElement
        ).value,
      ).toBe("");
      expect(container.textContent).toContain("Captura el peso de Pechuga");
      expect(
        Array.from(container.querySelectorAll("tr")).some((row) =>
          row.className.includes("shadow-[inset_3px_0_0_var(--pos-green)]"),
        ),
      ).toBe(true);
      expect(
        container.querySelector('[aria-label="Total de la venta"]')
          ?.textContent,
      ).toContain("1 partida");
      expect(
        container.querySelector('[aria-label="Total de la venta"]')
          ?.textContent,
      ).not.toContain("kg");

      const weightInput = container.querySelector(
        'input[aria-label="Kilos capturados de Pechuga"]',
      ) as HTMLInputElement;
      expect(document.activeElement).toBe(weightInput);
      await act(async () => {
        changeInput(weightInput, "2.5");
      });
      await act(async () => {
        weightInput.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
      expect(container.textContent).toContain("Peso capturado");
      expect(container.textContent).not.toContain("Peso estable");
      expect(
        container.querySelector('[aria-label="Total de la venta"]')
          ?.textContent,
      ).toContain("2.5 kg");
      expect(document.activeElement).toBe(search);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("mantiene el sonido de escaneo desactivado por defecto y guarda la preferencia local", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const soundButton = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Activar sonido de escaneo"]',
      );
      expect(soundButton?.getAttribute("aria-pressed")).toBe("false");
      expect(window.localStorage.getItem("pos:scan-sound-enabled")).toBeNull();

      await act(async () => {
        soundButton?.click();
      });

      const enabledButton = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Desactivar sonido de escaneo"]',
      );
      expect(enabledButton?.getAttribute("aria-pressed")).toBe("true");
      expect(window.localStorage.getItem("pos:scan-sound-enabled")).toBe(
        "true",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("incrementa piezas para un producto mixto cuando la unidad activa de su línea es piezas", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-3",
          name: "Pierna y muslo",
          sku: "MIX-1",
          barcode: "7501234567892",
          presentationType: "CUT",
          unit: "KG_AND_PIECE",
          salePrice: 80,
          inventoryBalance: {
            locationId: "loc-counter",
            locationName: "Mostrador",
            quantityKg: 10,
            quantityPieces: 8,
          },
          activeEquivalences: [
            { id: "eq-1", factor: 0.8, unitFrom: "PIECE", unitTo: "KG" },
          ],
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const search = container.querySelector(
        "#pos-product-search",
      ) as HTMLInputElement;
      await act(async () => {
        changeInput(search, "7501234567892");
        search.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      const piecesInput = container.querySelector(
        'input[aria-label="Piezas capturadas de Pierna y muslo"]',
      ) as HTMLInputElement;
      await act(async () => {
        piecesInput.focus();
      });
      await act(async () => {
        changeInput(search, "7501234567892");
        search.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });

      expect(piecesInput.value).toBe("1");
      expect(
        (
          container.querySelector(
            'input[aria-label="Kilos capturados de Pierna y muslo"]',
          ) as HTMLInputElement
        ).value,
      ).toBe("");
      expect(container.textContent).toContain(
        "Incrementado: Pierna y muslo (1 pieza)",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("deriva la ubicación y el canal inicial para SELLER y bloquea ubicaciones no válidas", async () => {
    mockState.auth = {
      user: { role: "SELLER", operationalLocationId: "loc-ext" },
    } as typeof mockState.auth;
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
        {
          id: "loc-ext",
          name: "Punto externo",
          code: "EXT",
          type: "EXTERNAL_POINT_OF_SALE",
        },
        {
          id: "loc-route",
          name: "Ruta Norte",
          code: "RUTA",
          type: "ROUTE_STOCK",
        },
      ],
      error: null,
      isLoading: false,
    };

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      const channelSelect = container.querySelector(
        'select[aria-label="Canal de venta"]',
      );

      expect(locationSelect.value).toBe("loc-ext");
      expect(locationSelect.disabled).toBe(true);
      expect(channelSelect).toBeInstanceOf(HTMLSelectElement);
      expect((channelSelect as HTMLSelectElement).value).toBe(
        "EXTERNAL_POINT_OF_SALE",
      );
      expect((channelSelect as HTMLSelectElement).disabled).toBe(false);
      expect(
        Array.from((channelSelect as HTMLSelectElement).options).map(
          (option) => option.value,
        ),
      ).toContain("COUNTER");
      expect(
        Array.from((channelSelect as HTMLSelectElement).options).map(
          (option) => option.value,
        ),
      ).not.toContain("ROUTE");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("muestra advertencia, mora y política sin presentar WARN_ONLY como bloqueo", () => {
    const customer = {
      id: "customer-warning",
      name: "Comedor Central",
      customerType: "INSTITUTIONAL" as const,
      creditStatus: "ACTIVE",
      isActive: true,
      creditSummary: {
        effectiveCreditStatus: "WARNING" as const,
        overdueAmount: 125,
        maximumDaysOverdue: 4,
        overdueBlockingMode: "WARN_ONLY" as const,
        blockingReasons: ["CREDIT_OVERDUE_WARNING"],
        availableCredit: 900,
      },
    };

    const selector = renderToStaticMarkup(
      <CustomerSelector
        customers={[customer]}
        error={null}
        isLoading={false}
        onSearchChange={() => undefined}
        onSelect={() => undefined}
        search=""
        selectedCustomer={customer}
      />,
    );
    const summary = renderToStaticMarkup(
      <SaleSummary cart={[]} customer={customer} paymentType="CREDIT_SALE" />,
    );

    expect(selector).toContain("Advertencia de crédito");
    expect(selector).toContain("Vencido $125.00");
    expect(selector).toContain("4 días de atraso");
    expect(summary).toContain("Solo advertencia");
    expect(summary).not.toContain("Crédito bloqueado");
  });

  it("deshabilita Crédito cuando el cliente tiene un bloqueo de mora", async () => {
    mockState.auth = { user: { role: "ADMIN" } };
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.customers = {
      data: [
        {
          id: "customer-1",
          name: "Restaurante Norte",
          customerType: "WHOLESALE",
          creditStatus: "ACTIVE",
          commercialPolicyId: "policy-1",
          isActive: true,
          creditSummary: {
            effectiveCreditStatus: "BLOCKED",
            isBlockedForCredit: true,
            blockingReason: "Saldo vencido",
            blockingReasons: ["CREDIT_OVERDUE_BLOCKED"],
            canAdministrativeOverride: true,
            overdueAmount: 800,
            maximumDaysOverdue: 8,
            availableCredit: 3000,
          },
        },
      ],
      error: null,
      isLoading: false,
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        getButtonByText(container, "Agregar").click();
      });
      await selectPosCustomer(container, "Restaurante Norte");
      expect(getConditionButton(container, "Crédito").disabled).toBe(true);
      expect(container.textContent).toContain("Crédito bloqueado.");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("bloquea una venta de contado sin pago aunque exista un cliente activo", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.customers = {
      data: [
        {
          id: "customer-1",
          name: "Restaurante Norte",
          customerType: "WHOLESALE",
          creditStatus: "ACTIVE",
          isActive: true,
          creditSummary: {
            availableCredit: 3200,
            creditLimit: 5000,
            outstandingAmount: 1800,
          },
        },
      ],
      error: null,
      isLoading: false,
    };

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        getButtonByText(container, "Agregar").click();
      });
      await selectPosCustomer(container, "Restaurante Norte");

      const primaryAction = getPosPrimaryAction(container);
      expect(primaryAction.disabled).toBe(false);
      expect(primaryAction.getAttribute("aria-keyshortcuts")).toBe("F8 Enter");
      expect(primaryAction.textContent).toContain("Registrar pago");
      const paymentSummary = container.querySelector(
        '[aria-label="Resumen de pago"]',
      );
      expect(paymentSummary?.textContent).toContain("Captura el pago.");
      expect(paymentSummary?.textContent).not.toContain(
        "La venta de contado debe liquidarse completamente",
      );
      expect(
        paymentSummary?.querySelector('span[role="status"]')?.className,
      ).toContain("h-5");
      expect(paymentSummary?.querySelector("dl")?.className).toContain("h-12");
      expect(paymentSummary?.querySelectorAll("dl > div")).toHaveLength(3);
      expect(paymentSummary?.textContent).toContain("Pagado");
      expect(paymentSummary?.textContent).toContain("Pendiente");
      expect(paymentSummary?.textContent).toContain("Cambio");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("usa un aviso breve para un pago parcial sin cambiar la validación", async () => {
    const conditionPanelRef = createRef<HTMLElement>();
    const paymentPanelRef = createRef<HTMLElement>();
    const customerSearchRef = createRef<HTMLInputElement>();
    const { container, root } = await renderDom(
      <CheckoutDock
        cart={[]}
        conditionPanelRef={conditionPanelRef}
        customerSearch=""
        customerSearchRef={customerSearchRef}
        customers={[]}
        customersError={null}
        customersLoading={false}
        disabledReason="La venta de contado debe liquidarse completamente. Cambia el tipo de venta a crédito para registrar un pago parcial."
        isSubmitting={false}
        onConfirm={() => undefined}
        onCustomerSearchChange={() => undefined}
        onCustomerSelect={() => undefined}
        onPaymentTypeChange={() => undefined}
        onPaymentsChange={() => undefined}
        paymentPanelRef={paymentPanelRef}
        paymentType="CASH_SALE"
        payments={[{ amount: 40, paymentMethod: "CASH" }]}
        selectedCustomer={null}
        total={100}
        transactionState="PAYMENT_PENDING"
      />,
    );

    try {
      const paymentSummary = container.querySelector(
        '[aria-label="Resumen de pago"]',
      );
      expect(paymentSummary?.textContent).toContain("Completa el pago.");
      expect(paymentSummary?.textContent).not.toContain(
        "La venta de contado debe liquidarse completamente",
      );
      expect(paymentSummary?.querySelectorAll("dl > div")).toHaveLength(3);
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("bloquea el POS cuando no existe un turno de caja abierto", async () => {
    mockState.cashSession = {
      data: null,
      isLoading: false,
    } as unknown as typeof mockState.cashSession;
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        getButtonByText(container, "Agregar").click();
      });

      const primaryAction = getPosPrimaryAction(container);
      expect(primaryAction.disabled).toBe(true);
      expect(primaryAction.getAttribute("aria-keyshortcuts")).toBeNull();
      expect(primaryAction.textContent).toContain(
        "Abre un turno de caja en esta terminal",
      );
      expect(container.textContent).toContain(
        "Abre un turno de caja en esta terminal",
      );
      expect(container.textContent).toContain("Abrir turno");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("bloquea la confirmación cuando el POS está sin conexión y explica que la venta no se registrará", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        getButtonByText(container, "Agregar").click();
      });
      await act(async () => {
        Object.defineProperty(window.navigator, "onLine", {
          configurable: true,
          value: false,
        });
        window.dispatchEvent(new Event("offline"));
      });

      const primaryAction = getPosPrimaryAction(container);
      expect(primaryAction.disabled).toBe(true);
      expect(container.textContent).toContain(
        "Sin conexión. La venta no se registrará sin conexión.",
      );
      expect(mockState.createSale.mutateAsync).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window.navigator, "onLine", {
        configurable: true,
        value: true,
      });
      window.dispatchEvent(new Event("online"));
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("no expone autorización de crédito a SELLER", async () => {
    mockState.auth = { user: { role: "SELLER" } };
    mockState.locations = {
      data: [{ id: "loc-counter", name: "Mostrador", type: "BRANCH" }],
      error: null,
      isLoading: false,
    };
    mockState.customers = {
      data: [
        {
          id: "customer-1",
          name: "Cliente bloqueado",
          customerType: "WHOLESALE",
          creditStatus: "ACTIVE",
          isActive: true,
          creditSummary: {
            effectiveCreditStatus: "BLOCKED",
            isBlockedForCredit: true,
            blockingReason: "Saldo vencido",
            blockingReasons: ["CREDIT_OVERDUE_BLOCKED"],
            canAdministrativeOverride: true,
          },
        },
      ],
      error: null,
      isLoading: false,
    };
    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      await selectPosCustomer(container, "Cliente bloqueado");
      expect(getConditionButton(container, "Crédito").disabled).toBe(true);
      expect(container.textContent).not.toContain(
        "Autorizar excepción de crédito",
      );
      expect(container.textContent).toContain(
        "Supervisor requerido para autorizar crédito.",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("deja vacíos kilos y piezas del carrito cuando su valor es cero", () => {
    const html = renderToStaticMarkup(
      <Cart
        highlightedItemId="prod-1"
        items={[
          {
            availableKg: 10,
            availablePieces: 10,
            id: "prod-1",
            locationId: "loc-counter",
            name: "Pollo mixto",
            presentationType: "WHOLE",
            productId: "prod-1",
            quantityKg: 0,
            quantityPieces: 0,
            salePrice: 100,
            unit: "KG_AND_PIECE",
            unitPrice: 100,
          },
        ]}
        onQuantityChange={() => undefined}
        onRemove={() => undefined}
      />,
    );

    expect(html.match(/value="0"/g)).toBeNull();
    expect(html).toContain('value=""');
    expect(html).not.toContain("Stock 10");
    expect(html).toContain('aria-describedby="cart-validation-prod-1"');
    expect(html).toContain('id="cart-validation-prod-1"');
    expect(html).toContain("h-11 w-20");
    expect(html).toContain("h-11 w-11");
    expect(html).toContain("pos-cart-row-added");
  });

  it("virtualiza resultados de productos solo cuando el catálogo supera el umbral operativo", () => {
    const products = Array.from({ length: 101 }, (_, index) => ({
      availableKg: 10,
      availablePieces: 10,
      id: `prod-${index}`,
      locationId: "loc-counter",
      name: `Producto ${index}`,
      presentationType: "WHOLE" as const,
      productId: `prod-${index}`,
      quantityKg: 0,
      quantityPieces: 0,
      salePrice: 100,
      unit: "PIECE" as const,
      unitPrice: 100,
    }));
    const html = renderToStaticMarkup(
      <ProductResultsTable
        error={null}
        frequentProducts={[]}
        isLoading={false}
        locationId="loc-counter"
        locations={[]}
        locationsError={null}
        locationsLoading={false}
        onAdd={() => undefined}
        onLocationChange={() => undefined}
        products={products}
        search=""
        showLocationSelector={false}
      />,
    );

    expect(html).toContain("Producto 0");
    expect(html).not.toContain("Producto 100");
    expect(html).toContain('aria-hidden="true"');
  });

  it("anuncia cada estado del CTA y asocia su bloqueo visible", () => {
    const cases = [
      ["EMPTY", "Confirmar venta"],
      ["CART_ACTIVE", "Registra el pago"],
      ["WEIGHT_PENDING", "Captura el peso"],
      ["CUSTOMER_REQUIRED", "Selecciona cliente"],
      ["CREDIT_BLOCKED", "Crédito no disponible"],
      ["PAYMENT_PENDING", "Pendiente: $10.00"],
      ["READY_TO_CHARGE", "Confirmar venta"],
      ["PROCESSING", "Procesando..."],
      ["SUCCESS", "Venta registrada"],
      ["BLOCKED", "Resolver incidencia"],
    ] as const;

    for (const [transactionState, label] of cases) {
      const html = renderToStaticMarkup(
        <ConfirmSaleButton
          disabledReason={
            transactionState === "BLOCKED"
              ? "Resuelve la incidencia."
              : undefined
          }
          isSubmitting={false}
          onConfirm={() => undefined}
          pendingAmount={10}
          total={10}
          transactionState={transactionState}
        />,
      );
      expect(html).toContain(label);
      expect(html).toContain('aria-live="polite"');
    }

    const blocked = renderToStaticMarkup(
      <ConfirmSaleButton
        disabledReason="Registra el pago pendiente."
        isSubmitting={false}
        onConfirm={() => undefined}
        total={10}
        transactionState="PAYMENT_PENDING"
      />,
    );
    expect(blocked).toContain('aria-describedby="checkout-blocker"');
    expect(blocked).toContain('id="checkout-blocker"');
  });

  it("abre el modal en el primer Enter y registra la venta en el segundo", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.createSale.mutateAsync.mockResolvedValue({
      sale: {
        id: "sale-enter",
        saleNumber: "V-ENTER",
        items: [],
        total: 92,
        paymentType: "CASH_SALE",
        status: "CONFIRMED",
        collectionStatus: "PAID",
      },
      ticketId: "ticket-enter",
    });

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );
    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
        getButtonByText(container, "Agregar").click();
      });
      await addPosPayment(container);

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(container.querySelector('[role="alertdialog"]')).toBeTruthy();
      expect(mockState.createSale.mutateAsync).not.toHaveBeenCalled();

      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
      });
      expect(mockState.createSale.mutateAsync).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).toContain("Venta registrada");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("limpia el cliente del resumen y conserva la ubicación después de registrar una venta", async () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            locationName: "Mostrador",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.customers = {
      data: [
        {
          id: "customer-1",
          name: "Restaurante Norte",
          customerType: "WHOLESALE",
          creditLimit: 5000,
          creditSummary: {
            availableCredit: 3200,
            creditLimit: 5000,
            outstandingAmount: 1800,
          },
          isActive: true,
        },
      ],
      error: null,
      isLoading: false,
    };
    mockState.createSale.mutateAsync.mockResolvedValue({
      creditWarnings: ["CREDIT_OVERDUE_WARNING"],
      sale: {
        id: "sale-1",
        saleNumber: "V-1001",
        items: [],
        total: 92,
        paymentType: "CASH_SALE",
        status: "CONFIRMED",
        collectionStatus: "PAID",
      },
      payment: { amount: 92, paymentMethod: "CASH" },
      ticketId: "ticket-1",
    });

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );

    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        getButtonByText(container, "Agregar").click();
      });
      await selectPosCustomer(container, "Restaurante Norte");
      await addPosPayment(container);

      expect(container.textContent).toContain("Subtotal $92.00");

      await act(async () => {
        getButtonByText(container, "Confirmar venta").click();
      });
      await act(async () => {
        getButtonByText(document.body, "Confirmar registro").click();
      });

      expect(mockState.createSale.mutateAsync).toHaveBeenCalledTimes(1);
      expect(mockState.toast.warning).toHaveBeenCalledWith(
        "Venta registrada con advertencia por saldo vencido.",
      );
      expect(container.textContent).toContain("0 en carrito");
      expect(container.textContent).toContain("Subtotal $0.00");
      expect(container.textContent).not.toContain("Limpiar cliente");
      expect(container.textContent).toContain("Público general");
      expect(getSelectByLabelText(container, "Ubicación operativa").value).toBe(
        "loc-counter",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("conserva una pantalla de venta registrada y usa impresión provisional si falla el documento", async () => {
    vi.useFakeTimers();
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            locationName: "Mostrador",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.customers = {
      data: [
        {
          id: "customer-1",
          name: "Restaurante Norte",
          customerType: "WHOLESALE",
          creditStatus: "ACTIVE",
          isActive: true,
          creditSummary: { availableCredit: 3200, outstandingAmount: 1800 },
        },
      ],
      error: null,
      isLoading: false,
    };
    mockState.createSale.mutateAsync.mockResolvedValue({
      sale: {
        id: "sale-1",
        saleNumber: "V-1001",
        documentType: "SIMPLE_NOTE",
        paymentType: "CREDIT_SALE",
        status: "CONFIRMED",
        subtotal: "92.00",
        total: "92.00",
        items: [
          {
            productName: "Pollo entero",
            unit: "PIECE",
            quantityKg: 0,
            quantityPieces: 1,
            unitPrice: "92.00",
            subtotal: "92.00",
          },
        ],
      },
      documents: [{ id: "doc-1", documentType: "SIMPLE_NOTE" }],
    });
    mockState.ticket = {
      data: undefined,
      error: new Error("Documento temporalmente no disponible"),
      isLoading: false,
      refetch: vi.fn(),
    };

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );

    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        getButtonByText(container, "Agregar").click();
      });
      await selectPosCustomer(container, "Restaurante Norte");
      await act(async () => {
        getConditionButton(container, "Crédito").click();
      });
      expect(container.textContent).toContain("Venta a crédito sin adelanto");
      await act(async () => {
        getButtonByText(container, "Confirmar venta").click();
      });
      await act(async () => {
        getButtonByText(document.body, "Confirmar registro").click();
      });

      expect(document.body.textContent).toContain("Venta registrada");
      expect(document.body.textContent).toContain("V-1001");
      expect(document.body.textContent).toContain("$92.00");
      expect(document.body.textContent).toContain("Restaurante Norte");
      expect(document.body.textContent).toContain("Reimprimir");
      expect(document.body.textContent).toContain("Ir al historial");
      expect(document.body.textContent).toContain("Nueva venta");
      expect(document.body.textContent).toContain(
        "No se pudo consultar el documento",
      );

      await act(async () => {
        vi.advanceTimersByTime(701);
      });
      expect(document.body.textContent).toContain("Venta registrada");

      await act(async () => {
        getButtonByText(document.body, "Reimprimir").click();
      });
      expect(mockState.ticket.refetch).toHaveBeenCalledTimes(1);
      expect(document.body.textContent).toContain("Impresión provisional");
      expect(document.body.textContent).toContain("NOTA DE VENTA");
      expect(document.body.textContent).toContain("Pollo entero");

      const closeTicketButton = Array.from(
        document.querySelectorAll("button"),
      ).find((button) => button.textContent?.trim() === "Cerrar");
      expect(closeTicketButton).toBeInstanceOf(HTMLButtonElement);
      await act(async () => {
        (closeTicketButton as HTMLButtonElement).click();
      });
      expect(document.body.textContent).toContain("Venta registrada");
      await act(async () => {
        getButtonByText(document.body, "Cerrar ventana").click();
      });
      expect(document.body.textContent).not.toContain("Venta registrada");
      expect(container.textContent).toContain("0 en carrito");
    } finally {
      vi.useRealTimers();
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("conserva carrito, cliente y resumen cuando el registro de venta falla", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "sale-attempt-key" });
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.products = {
      data: [
        {
          id: "prod-1",
          name: "Pollo entero",
          sku: "POL-1",
          presentationType: "WHOLE",
          unit: "PIECE",
          salePrice: 92,
          inventoryBalance: {
            locationId: "loc-counter",
            locationName: "Mostrador",
            quantityKg: 0,
            quantityPieces: 8,
          },
        },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };
    mockState.customers = {
      data: [
        {
          id: "customer-1",
          name: "Restaurante Norte",
          customerType: "WHOLESALE",
          creditLimit: 5000,
          creditSummary: {
            availableCredit: 3200,
            creditLimit: 5000,
            outstandingAmount: 1800,
          },
          isActive: true,
        },
      ],
      error: null,
      isLoading: false,
    };
    mockState.createSale.mutateAsync.mockRejectedValue(
      new Error("No se pudo registrar la venta"),
    );

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales"]}>
        <SalesPosPage />
      </MemoryRouter>,
    );

    try {
      const locationSelect = getSelectByLabelText(
        container,
        "Ubicación operativa",
      );
      await act(async () => {
        locationSelect.value = "loc-counter";
        locationSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(async () => {
        getButtonByText(container, "Agregar").click();
      });
      await selectPosCustomer(container, "Restaurante Norte");
      await addPosPayment(container);
      await act(async () => {
        getButtonByText(container, "Confirmar venta").click();
      });
      await act(async () => {
        getButtonByText(document.body, "Confirmar registro").click();
      });
      await act(async () => {
        getButtonByText(document.body, "Confirmar registro").click();
      });

      expect(mockState.createSale.mutateAsync).toHaveBeenCalledTimes(2);
      expect(mockState.createSale.mutateAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ idempotencyKey: "sale-attempt-key" }),
      );
      expect(mockState.createSale.mutateAsync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ idempotencyKey: "sale-attempt-key" }),
      );
      expect(container.textContent).toContain("1 en carrito");
      expect(container.textContent).toContain("Subtotal $92.00");
      expect(container.textContent).toContain("WHOLESALE · Crédito disponible");
      expect(document.body.textContent).toContain(
        "No se pudo registrar la venta",
      );
      expect(locationSelect.value).toBe("loc-counter");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("mantiene bloqueo local del POS para roles no autorizados", () => {
    mockState.auth = { user: { role: "DRIVER" } };

    const html = renderWithRouter(<SalesPosPage />, "/sales");

    expect(html).toContain("Acceso al POS denegado");
    expect(html).toContain("Solo los roles ADMIN y SELLER");
  });

  it("muestra historial con filtros y datos operativos en español", () => {
    mockState.locations = {
      data: [
        { id: "loc-counter", name: "Mostrador", code: "MOST", type: "BRANCH" },
      ],
      error: null,
      isLoading: false,
    };
    mockState.sales = {
      data: { items: [confirmedSale] },
      error: null,
      isLoading: false,
    };

    const html = renderWithRouter(<SalesHistoryPage />);

    expect(html).toContain("Historial de ventas");
    expect(html).toContain("Ubicación operativa");
    expect(html).toContain("Todas las ubicaciones");
    expect(html).toContain("Mostrador · MOST");
    expect(html).not.toContain("ID de ubicación");
    expect(html).toContain("Folio físico");
    expect(html).toContain("Restaurante Norte");
    expect(html).toContain("Nota sencilla");
    expect(html).toContain("Venta a crédito");
    expect(html).toContain("Pendiente");
    expect(html).toContain("Sin ruta asignada");
    expect(html).toContain("Ver detalle");
  });

  it("expone detalle de venta, reimpresión, documentos internos y estado documental", () => {
    mockState.sale = { data: confirmedSale, error: null, isLoading: false };
    mockState.documents = {
      data: {
        items: [
          {
            createdAt: "2026-07-03T15:31:00.000Z",
            documentType: "SIMPLE_NOTE",
            id: "doc-1",
            physicalFolio: "N-42",
            status: "ISSUED",
          },
        ],
      },
      error: null,
      isLoading: false,
    };

    const html = renderWithRouter(
      <Routes>
        <Route path="/sales/:saleId" element={<SaleDetailPage />} />
      </Routes>,
      "/sales/sale-1",
    );

    expect(html).toContain("Detalle de venta");
    expect(html).toContain("Reimprimir este documento");
    expect(html).toContain("Anular venta");
    expect(html).toContain("Documentos internos");
    expect(html).toContain("Nota sencilla");
    expect(html).toContain("Estado: ISSUED");
    expect(html).toContain("Venta a crédito");
    expect(html).toContain("Sin ruta asignada");
    expect(html).toContain("Descuento");
    expect(html).toContain("Base gravable");
    expect(html).toContain("Total de partida");
    expect(html).toContain("$27.60");
    expect(html).toContain("$248.40");
  });

  it("separa la asignación de ruta del estado comercial de la venta", () => {
    const routedSale = {
      ...confirmedSale,
      id: "sale-2",
      routeId: "route-1",
      saleNumber: "V-1002",
    };
    mockState.sales = {
      data: { items: [confirmedSale, routedSale] },
      error: null,
      isLoading: false,
    };
    mockState.sale = { data: routedSale, error: null, isLoading: false };

    const historyHtml = renderWithRouter(<SalesHistoryPage />);
    const detailHtml = renderWithRouter(
      <Routes>
        <Route path="/sales/:saleId" element={<SaleDetailPage />} />
      </Routes>,
      "/sales/sale-2",
    );

    expect(historyHtml).toContain("Confirmada");
    expect(historyHtml).toContain("Sin ruta asignada");
    expect(historyHtml).toContain("Ruta asignada");
    expect(detailHtml).toContain("Confirmada");
    expect(detailHtml).toContain("Ruta asignada");
  });

  it("muestra un minimapa compacto con la ruta optimizada y la parada del pedido actual", () => {
    mockState.sale = {
      data: {
        ...confirmedSale,
        routeId: "route-1",
        routePreview: {
          id: "route-1",
          name: "Ruta Norte",
          mapAvailable: true,
          geometry: {
            type: "LineString",
            coordinates: [
              [-96.14, 19.18],
              [-96.13, 19.17],
            ],
          },
          distanceMeters: 8600,
          durationSeconds: 1440,
          order: { latitude: 19.1738, longitude: -96.1342, stopSequence: 2 },
        },
      },
      error: null,
      isLoading: false,
    };

    const html = renderWithRouter(
      <Routes>
        <Route path="/sales/:saleId" element={<SaleDetailPage />} />
      </Routes>,
      "/sales/sale-1",
    );

    expect(html).toContain("Ruta optimizada asignada");
    expect(html).toContain("Ruta Norte");
    expect(html).toContain("Mapa de Ruta Norte");
    expect(html).toContain('data-compact="true"');
    expect(html).toContain("Pedido 2");
    expect(html).toContain("8.6 km");
    expect(html).toContain("24 min");
  });

  it("muestra estado operativo sin mapa para ruta sin geometría y omite la sección si no hay asignación", () => {
    mockState.sale = {
      data: {
        ...confirmedSale,
        routeId: "route-1",
        routePreview: {
          id: "route-1",
          name: "Ruta histórica",
          mapAvailable: false,
          geometry: null,
          distanceMeters: null,
          durationSeconds: null,
          order: null,
        },
      },
      error: null,
      isLoading: false,
    };
    const unavailableHtml = renderWithRouter(
      <Routes>
        <Route path="/sales/:saleId" element={<SaleDetailPage />} />
      </Routes>,
      "/sales/sale-1",
    );
    expect(unavailableHtml).toContain("Ruta histórica");
    expect(unavailableHtml).toContain("Ruta asignada");
    expect(unavailableHtml).not.toContain("Ruta optimizada asignada");
    expect(unavailableHtml).toContain(
      "El trazado optimizado no está disponible para esta ruta.",
    );
    expect(unavailableHtml).not.toContain("Mapa de Ruta histórica");

    mockState.sale = { data: confirmedSale, error: null, isLoading: false };
    const unassignedHtml = renderWithRouter(
      <Routes>
        <Route path="/sales/:saleId" element={<SaleDetailPage />} />
      </Routes>,
      "/sales/sale-1",
    );
    expect(unassignedHtml).not.toContain("Ruta optimizada asignada");
    expect(unassignedHtml).not.toContain("trazado optimizado");
  });

  it("abre el modal de ticket interno con un click real en la acción de reimpresión", async () => {
    mockState.sale = { data: confirmedSale, error: null, isLoading: false };
    mockState.documents = {
      data: {
        items: [
          {
            createdAt: "2026-07-03T15:31:00.000Z",
            documentType: "SIMPLE_NOTE",
            id: "doc-1",
            physicalFolio: "N-42",
            status: "ISSUED",
          },
        ],
      },
      error: null,
      isLoading: false,
    };
    mockState.ticket = {
      data: {
        saleNumber: "V-1001",
        total: 276,
        documentType: "SIMPLE_NOTE",
        paymentType: "CREDIT_SALE",
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    };

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={["/sales/sale-1"]}>
        <Routes>
          <Route path="/sales/:saleId" element={<SaleDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    try {
      const reprintButton = getButtonByText(
        container,
        "Reimprimir este documento",
      );

      expect(container.textContent).not.toContain("Ticket interno");

      await act(async () => {
        reprintButton.click();
      });

      expect(document.body.textContent).toContain("NOTA DE VENTA");
      expect(document.body.textContent).toContain("Imprimir");
      expect(document.body.textContent).toContain("V-1001");
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("muestra UX bloqueante cuando falta la versión requerida para cancelar", () => {
    const html = renderToStaticMarkup(
      <CancelSaleDialog
        onClose={() => undefined}
        sale={{ ...confirmedSale, version: undefined }}
      />,
    );

    expect(html).toContain("Operación administrativa");
    expect(html).toContain(
      "No se encontró la versión de concurrencia requerida para confirmar la anulación.",
    );
    expect(html).toContain("Confirmar anulación");
    expect(html).toContain('disabled=""');
  });

  it("muestra el impacto completo de la anulación antes de confirmarla", () => {
    mockState.voidPreview = {
      data: {
        canExecute: true,
        blockers: [],
        authorization: {
          requiredRole: "ADMIN",
          authorizedBy: { id: "admin-1", name: "Admin", role: "ADMIN" },
        },
        sale: {
          id: "sale-1",
          saleNumber: "V-1001",
          status: "CONFIRMED",
          version: 4,
          total: 276,
          collectionStatus: "PARTIALLY_PAID",
        },
        payments: [
          {
            id: "payment-1",
            amount: 100,
            paymentMethod: "CASH",
            status: "APPLIED",
            version: 2,
          },
        ],
        inventory: [
          {
            productId: "prod-1",
            productName: "Pollo entero",
            quantityKg: 2.5,
            quantityPieces: 0,
            locationId: "loc-counter",
          },
        ],
        accountReceivable: {
          id: "ar-1",
          originalAmount: 276,
          outstandingAmount: 176,
          status: "PARTIALLY_PAID",
        },
        documents: [
          {
            id: "doc-1",
            documentType: "SIMPLE_NOTE",
            physicalFolio: "N-42",
            status: "ISSUED",
            willCancel: true,
          },
        ],
        billingRequest: {
          id: "billing-1",
          status: "IN_REVIEW",
          willCancel: true,
        },
      },
      error: null,
      isLoading: false,
    };

    const html = renderToStaticMarkup(
      <CancelSaleDialog onClose={() => undefined} sale={confirmedSale} />,
    );

    expect(html).toContain("Pago que será revertido");
    expect(html).toContain("Inventario que será restaurado");
    expect(html).toContain("Cuenta por cobrar afectada");
    expect(html).toContain("Documentos que quedarán cancelados");
    expect(html).toContain("Usuario autorizador:");
    expect(html).toContain(
      "Cliente devolvió el pedido y se verificó el efectivo.",
    );
    expect(html).toContain("N-42");
    expect(html).toContain("billing-1");
  });

  it("reutiliza la clave idempotente al reintentar una anulación fallida", async () => {
    mockState.voidPreview = {
      data: {
        canExecute: true,
        blockers: [],
        authorization: {
          requiredRole: "ADMIN",
          authorizedBy: { id: "admin-1", name: "Admin", role: "ADMIN" },
        },
        sale: {
          id: "sale-1",
          saleNumber: "V-1001",
          status: "CONFIRMED",
          version: 4,
          total: 276,
          collectionStatus: "UNPAID",
        },
        payments: [],
        inventory: [],
        accountReceivable: null,
        documents: [],
        billingRequest: null,
      },
      error: null,
      isLoading: false,
    };
    mockState.voidSale.mutateAsync.mockRejectedValue(new Error("Error de red"));
    vi.stubGlobal("crypto", { randomUUID: () => "cancel-dialog-key" });
    const { container, root } = await renderDom(
      <CancelSaleDialog onClose={() => undefined} sale={confirmedSale} />,
    );

    try {
      await act(async () => {
        changeTextarea(
          container.querySelector("textarea") as HTMLTextAreaElement,
          "Cliente canceló el pedido",
        );
      });
      await act(async () => {
        getButtonByText(container, "Confirmar anulación").click();
      });
      await act(async () => {
        getButtonByText(container, "Confirmar anulación").click();
      });

      expect(mockState.voidSale.mutateAsync).toHaveBeenCalledTimes(2);
      expect(mockState.voidSale.mutateAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ idempotencyKey: "cancel-dialog-key" }),
      );
      expect(mockState.voidSale.mutateAsync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ idempotencyKey: "cancel-dialog-key" }),
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    }
  });

  it("renderiza unidades en español en el ticket sin filtrar enums crudos", () => {
    const html = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{
          customerName: "Público general",
          documentType: "LARGE_NOTE",
          items: [
            {
              productName: "Pierna y muslo",
              quantityKg: 2.5,
              quantityPieces: 4,
              subtotal: 310,
              unit: "KG_AND_PIECE",
            },
            {
              productName: "Pechuga",
              quantityKg: 1.2,
              quantityPieces: 0,
              subtotal: 144,
              unit: "KG",
            },
          ],
          paymentType: "CASH_SALE",
          saleNumber: "V-2002",
          total: 454,
        }}
      />,
    );

    expect(html).toContain("Kilo y pieza");
    expect(html).toContain("Kilo");
    expect(html).not.toContain("KG_AND_PIECE");
    expect(html).toContain("ticket-print-root");
    expect(html).toContain("ticket-print-content");
  });

  it("muestra efectivo entregado y cambio persistidos sin inventar valores para pagos históricos", () => {
    const html = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{
          documentType: "SIMPLE_NOTE",
          total: 187.5,
          payments: [
            {
              amount: 187.5,
              paymentMethod: "CASH",
              cashTendered: 200,
              changeGiven: 12.5,
            } as NonNullable<TicketData["payments"]>[number] & {
              cashTendered: number;
              changeGiven: number;
            },
            { amount: 50, paymentMethod: "CARD" },
          ],
        }}
      />,
    );

    expect(html).toContain("Efectivo entregado");
    expect(html).toContain("$200.00");
    expect(html).toContain("Cambio");
    expect(html).toContain("$12.50");
  });

  it("renderiza los cuatro formatos documentales con sus prioridades y oculta un RFC inexistente", () => {
    const baseTicket: TicketData = {
      createdAt: "2026-07-17T18:35:00.000Z",
      customerName: "Pollería San José",
      locationName: "Sucursal Centro",
      payments: [{ amount: 500, paymentMethod: "CASH" }],
      sellerName: "Juan Pérez",
      paymentType: "CREDIT_SALE",
      subtotal: 1912.5,
      discount: 0,
      total: 1912.5,
      items: [
        {
          productName: "Pollo entero",
          quantityKg: 25,
          unit: "KG",
          unitPrice: 42.5,
          subtotal: 1062.5,
        },
      ],
    };

    const simple = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{ ...baseTicket, documentType: "SIMPLE_NOTE" }}
      />,
    );
    const splitSimple = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{
          ...baseTicket,
          documentType: "SIMPLE_NOTE",
          payments: [
            { amount: 200, paymentMethod: "CASH" },
            { amount: 300, paymentMethod: "CARD" },
          ],
        }}
      />,
    );
    const largeWithoutTaxId = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{
          ...baseTicket,
          documentType: "LARGE_NOTE",
          customerAddress: "Av. Principal 123",
          customerPhone: "229 000 0000",
          customerCreditDays: 7,
        }}
      />,
    );
    const largeWithTaxId = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{
          ...baseTicket,
          documentType: "LARGE_NOTE",
          customerTaxId: "XAXX010101000",
        }}
      />,
    );
    const internal = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{ ...baseTicket, documentType: "INTERNAL_RECEIPT" }}
      />,
    );
    const scale = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{
          ...baseTicket,
          documentType: "SCALE_TICKET",
          scaleTicket: {
            physicalFolio: "BAS-001",
            capturedAt: "2026-07-17T18:35:00.000Z",
            productName: "Pollo entero",
            grossWeightKg: 26.2,
            tareWeightKg: 1.2,
            netWeightKg: 25,
            pieceCount: 14,
            unitPrice: 42.5,
            amount: 1062.5,
            operatorName: "María López",
          },
        }}
      />,
    );

    expect(simple).toContain("NOTA DE VENTA");
    expect(simple).toContain("Gracias por su compra");
    expect(simple).toContain("receipt-format-simple");
    expect(splitSimple).toContain("Pago: Efectivo · Tarjeta");
    expect(largeWithoutTaxId).toContain("DATOS DEL CLIENTE");
    expect(largeWithoutTaxId).toContain("Crédito a 7 días");
    expect(largeWithoutTaxId).not.toContain("RFC:");
    expect(largeWithTaxId).toContain("RFC:");
    expect(largeWithTaxId).toContain("XAXX010101000");
    expect(internal).toContain("RECIBO INTERNO");
    expect(internal).toContain("Entregó");
    expect(internal).toContain("Autorizó");
    expect(internal).toContain("DOCUMENTO DE CONTROL INTERNO");
    expect(scale).toContain("TICKET DE BÁSCULA");
    expect(scale).toContain("Peso bruto");
    expect(scale).toContain("26.2 kg");
    expect(scale).toContain("Peso tara");
    expect(scale).toContain("Peso neto");
    expect(scale).toContain("25 kg");
    expect(scale).toContain("María López");
    expect(scale).toContain("receipt-format-scale");
    expect(scale).not.toContain("Gracias por su compra");
  });

  it("no sustituye un pago inicial de cero por el total en un recibo interno de crédito", () => {
    const html = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{
          documentType: "INTERNAL_RECEIPT",
          dueDate: "2026-07-30T10:00:00.000Z",
          outstanding: 240,
          paid: 0,
          paymentType: "CREDIT_SALE",
          total: 240,
        }}
      />,
    );

    expect(html).toContain("Total de venta:");
    expect(html).toContain("Pago recibido:");
    expect(html).toContain("Saldo pendiente:");
    expect(html).toContain("Fecha de vencimiento:");
    expect(html).toContain("$0.00");
    expect(html).toContain("$240.00");
  });
});
