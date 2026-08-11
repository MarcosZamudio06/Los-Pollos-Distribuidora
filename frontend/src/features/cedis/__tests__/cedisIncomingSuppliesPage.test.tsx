// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CedisIncomingSuppliesPage } from "../CedisIncomingSuppliesPage";
import type {
  CedisIncomingSuppliesFilters,
  CedisIncomingSupply,
} from "../types";

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
  incomingFilters: undefined as CedisIncomingSuppliesFilters | undefined,
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
  useCedisIncomingSupplies: (filters: CedisIncomingSuppliesFilters) => {
    mockState.incomingFilters = filters;
    return mockState.supplies;
  },
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

function page(initialEntry = "/cedis/incoming?date=2026-08-05") {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <CedisIncomingSuppliesPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage(initialEntry = "/cedis/incoming?date=2026-08-05") {
  return renderToStaticMarkup(page(initialEntry));
}

async function mountPage(initialEntry = "/cedis/incoming?date=2026-08-05") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => root.render(page(initialEntry)));
  return { container, root };
}

async function unmountPage({ container, root }: { container: HTMLDivElement; root: Root }) {
  await act(async () => root.unmount());
  container.remove();
}

async function openSupply(container: HTMLDivElement, transferNumber: string) {
  await act(async () => {
    const card = [...container.querySelectorAll<HTMLButtonElement>(
      'button[aria-pressed]',
    )].find((button) => button.textContent?.includes(transferNumber));
    if (!card) throw new Error(`Supply card not found: ${transferNumber}`);
    card.click();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("CEDIS incoming supplies UI", () => {
  beforeEach(() => {
    mockState.auth = {
      accessToken: "access-token",
      user: {
        id: "seller-1",
        name: "Vendedor",
        role: "SELLER",
        operationalLocationId: "branch-1",
      },
    };
    mockState.incomingFilters = undefined;
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

  it("consulta solo recepciones PENDING por defecto para ambos roles", () => {
    renderPage();
    expect(mockState.incomingFilters?.status).toBe("PENDING");

    mockState.auth = {
      accessToken: "access-token",
      user: {
        id: "admin-1",
        name: "Administrador",
        role: "ADMIN",
        operationalLocationId: "cedis-1",
      },
    };
    renderPage();
    expect(mockState.incomingFilters?.status).toBe("PENDING");
  });

  it("habilita ALL únicamente con la opción compacta de mostrar todas", () => {
    const html = renderPage("/cedis/incoming?date=2026-08-05&status=ALL");

    expect(mockState.incomingFilters?.status).toBeUndefined();
    expect(html).toContain('id="incoming-status-all"');
    expect(html).toContain('checked=""');
    expect(html).toContain("Mostrar todas las recepciones");
    expect(html).not.toContain("<select");
  });

  it("normaliza status desconocido o RECEIVED a PENDING", () => {
    renderPage("/cedis/incoming?date=2026-08-05&status=RECEIVED");

    expect(mockState.incomingFilters?.status).toBe("PENDING");
  });

  it("abre un modal accesible con evidencia y conserva el reporte del trabajador", async () => {
    mockState.detail.data = supply("one", "PENDING");
    const html = renderPage();

    expect(html).toContain("Reporta lo que llegó");
    expect(html).toContain("Verifica lo que llegó");
    expect(html).not.toContain("<select");

    const mounted = await mountPage();
    await openSupply(mounted.container, "TRF-one");

    const dialog = mounted.container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe(
      "cedis-receipt-dialog-title",
    );
    expect(dialog?.textContent).toContain("Folio de transferencia");
    expect(dialog?.textContent).toContain("TRF-one");
    expect(dialog?.textContent).toContain("CEDIS Centro");
    expect(dialog?.textContent).toContain("Sucursal Centro");
    expect(dialog?.textContent).toContain("Ciclo v2");
    expect(dialog?.textContent).toContain("Producto");
    expect(dialog?.textContent).toContain("Enviado");
    expect(dialog?.textContent).toContain("Recibido");
    expect(dialog?.textContent).toContain("Diferencia");
    expect(dialog?.textContent).toContain("Nota para matriz");
    expect(dialog?.textContent).toContain("Avisar a matriz");
    expect(
      dialog?.querySelector('input[aria-label="Pollo entero kilos recibidos"]'),
    ).not.toBeNull();

    const kilos = dialog?.querySelector(
      'input[aria-label="Pollo entero kilos recibidos"]',
    ) as HTMLInputElement | null;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(kilos, "8.5");
    kilos?.dispatchEvent(new Event("input", { bubbles: true }));
    kilos?.dispatchEvent(new Event("change", { bubbles: true }));

    await act(async () => {
      (
        dialog?.querySelector(
          'button[aria-label="Cerrar evidencia de recepción"]',
        ) as HTMLButtonElement
      ).click();
    });
    expect(mounted.container.querySelector('[role="dialog"]')).toBeNull();

    await openSupply(mounted.container, "TRF-one");
    expect(
      (
        mounted.container.querySelector(
          'input[aria-label="Pollo entero kilos recibidos"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("8.5");

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
      );
    });
    expect(mounted.container.querySelector('[role="dialog"]')).toBeNull();

    await unmountPage(mounted);
  });

  it("usa lenguaje de revisión y confirmación para administración", async () => {
    mockState.auth = {
      accessToken: "access-token",
      user: {
        id: "admin-1",
        name: "Administrador",
        role: "ADMIN",
        operationalLocationId: "cedis-1",
      },
    };
    mockState.detail.data = supply("one", "PENDING");

    const html = renderPage();

    expect(mockState.incomingFilters?.status).toBe("PENDING");
    expect(html).toContain("Recepciones por confirmar");
    expect(html).toContain("Por revisar");
    expect(html).not.toContain("Avisar a matriz");

    const mounted = await mountPage();
    await openSupply(mounted.container, "TRF-one");

    const dialog = mounted.container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Confirmar recepción");
    expect(dialog?.textContent).toContain("Nota de recepción");
    expect(dialog?.textContent).toContain("antes de confirmar");
    expect(dialog?.textContent).not.toContain("Avisar a matriz");

    await unmountPage(mounted);
  });

  it("abre recibos confirmados como evidencia de solo lectura", async () => {
    mockState.auth = {
      accessToken: "access-token",
      user: {
        id: "admin-1",
        name: "Administrador",
        role: "ADMIN",
        operationalLocationId: "cedis-1",
      },
    };
    mockState.detail.data = supply("two", "RECEIVED");
    const mounted = await mountPage(
      "/cedis/incoming?date=2026-08-05&status=ALL",
    );

    await openSupply(mounted.container, "TRF-two");

    const dialog = mounted.container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Recepción confirmada");
    expect(dialog?.textContent).toContain("Esta recepción ya quedó cerrada");
    expect(dialog?.textContent).toContain("Recibió Vendedor");
    expect(dialog?.querySelector("textarea")).toHaveProperty("disabled", true);
    expect(dialog?.textContent).not.toContain("Confirmar recepción");

    await unmountPage(mounted);
  });

  it("muestra el faltante desde la recepción sin presentarlo como merma del saldo", async () => {
    const receivedWithShortage = supply("two", "RECEIVED");
    receivedWithShortage.receipt = {
      ...receivedWithShortage.receipt!,
      notes: "Faltó producto durante el traslado",
      items: [
        {
          ...receivedWithShortage.receipt!.items[0],
          receivedKg: "9.000",
          differenceKg: "-1.000",
        },
      ],
    };
    mockState.detail.data = receivedWithShortage;
    const mounted = await mountPage(
      "/cedis/incoming?date=2026-08-05&status=ALL",
    );

    await openSupply(mounted.container, "TRF-two");

    const dialog = mounted.container.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("10.000 kg");
    expect(dialog?.textContent).toContain("9.000 kg");
    expect(dialog?.textContent).toContain("-1.000 kg");
    expect(dialog?.textContent).not.toContain("Merma");

    await unmountPage(mounted);
  });
});
