// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CancelSaleDialog } from '../CancelSaleDialog'
import { TicketModal } from '../components'
import { SaleDetailPage } from '../SaleDetailPage'
import { SalesHistoryPage } from '../SalesHistoryPage'
import { SalesPosPage } from '../SalesPosPage'
import type { SaleDetail, TicketData } from '../types'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockState = vi.hoisted(() => ({
  auth: { user: { role: 'ADMIN' } },
  cancelSale: { isPending: false, mutateAsync: vi.fn() },
  documents: { data: { items: [] as Array<{ createdAt?: string; documentType?: string; id?: string; physicalFolio?: string; status?: string }> }, error: null, isLoading: false },
  createSale: { isPending: false, mutateAsync: vi.fn() },
  customers: { data: [] as Array<Record<string, unknown>>, error: null, isLoading: false },
  locations: { data: [] as Array<Record<string, unknown>>, error: null, isLoading: false },
  products: { data: [] as Array<Record<string, unknown>>, error: null, isLoading: false, refetch: vi.fn() },
  sale: { data: null as SaleDetail | null, error: null, isLoading: false },
  sales: { data: { items: [] as SaleDetail[] }, error: null, isLoading: false },
  ticket: { data: undefined as TicketData | undefined, error: null, isLoading: false },
}))

vi.mock('../hooks', () => ({
  useCancelSale: () => mockState.cancelSale,
  useCreateSale: () => mockState.createSale,
  useSale: () => mockState.sale,
  useSaleDocuments: () => mockState.documents,
  useSales: () => mockState.sales,
  useSaleTicket: () => mockState.ticket,
}))

vi.mock('../../auth', () => ({
  useAuth: () => mockState.auth,
}))

vi.mock('../../inventario/hooks/useProducts', () => ({
  useProducts: () => mockState.products,
}))

vi.mock('../../compras/hooks', () => ({
  usePurchaseLocations: () => mockState.locations,
}))

vi.mock('../../clientes/hooks/useCustomers', () => ({
  useCustomers: () => mockState.customers,
}))

function renderWithRouter(element: React.ReactElement, initialEntry = '/sales/history') {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>)
}

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(text))
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${text}`)
  return button
}

async function renderDom(element: React.ReactElement): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(element)
  })

  return { container, root }
}

const confirmedSale: SaleDetail = {
  id: 'sale-1',
  saleNumber: 'V-1001',
  collectionStatus: 'UNPAID',
  createdAt: '2026-07-03T15:30:00.000Z',
  customerName: 'Restaurante Norte',
  documentType: 'SIMPLE_NOTE',
  items: [{ productId: 'prod-1', productName: 'Pollo entero', quantityKg: 0, quantityPieces: 3, subtotal: 276, unit: 'PIECE' }],
  locationId: 'loc-counter',
  paymentType: 'CREDIT_SALE',
  physicalFolio: 'N-42',
  saleChannel: 'COUNTER',
  status: 'CONFIRMED',
  total: 276,
  version: 4,
}

describe('TASK-055 sales UI behavior', () => {
  beforeEach(() => {
    mockState.auth = { user: { role: 'ADMIN' } }
    mockState.cancelSale = { isPending: false, mutateAsync: vi.fn() }
    mockState.createSale = { isPending: false, mutateAsync: vi.fn() }
    mockState.customers = { data: [], error: null, isLoading: false }
    mockState.documents = { data: { items: [] }, error: null, isLoading: false }
    mockState.locations = { data: [], error: null, isLoading: false }
    mockState.products = { data: [], error: null, isLoading: false, refetch: vi.fn() }
    mockState.sale = { data: null, error: null, isLoading: false }
    mockState.sales = { data: { items: [] }, error: null, isLoading: false }
    mockState.ticket = { data: undefined, error: null, isLoading: false }
  })


  it('renderiza POS empresarial para ADMIN y mantiene estados operativos visibles', () => {
    mockState.auth = { user: { role: 'ADMIN' } }
    mockState.products = {
      data: [
        { id: 'prod-1', name: 'Pollo entero', sku: 'POL-1', presentationType: 'WHOLE', unit: 'PIECE', salePrice: 92, inventoryBalance: { locationId: 'loc-counter', locationName: 'Mostrador', quantityKg: 0, quantityPieces: 8 } },
        { id: 'prod-2', name: 'Pechuga', sku: 'PECH', presentationType: 'CUT', unit: 'KG', salePrice: 120, inventoryBalance: { locationId: 'loc-counter', locationName: 'Mostrador', quantityKg: 0, quantityPieces: 0 } },
      ],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    }
    mockState.locations = {
      data: [
        { id: 'loc-counter', name: 'Mostrador', code: 'MOST', type: 'BRANCH' },
        { id: 'loc-ext', name: 'Punto externo', code: 'EXT', type: 'EXTERNAL_POINT_OF_SALE' },
      ],
      error: null,
      isLoading: false,
    }

    const html = renderWithRouter(<SalesPosPage />, '/sales')

    expect(html).toContain('Punto de venta empresarial')
    expect(html).toContain('Total en vivo')
    expect(html).toContain('Ubicación operativa')
    expect(html).toContain('Buscador de productos')
    expect(html).toContain('Carrito')
    expect(html).toContain('Cliente')
    expect(html).toContain('Tipo de venta y pago')
    expect(html).toContain('Documento de venta')
    expect(html).toContain('Resumen sticky')
    expect(html).toContain('Selecciona una ubicación operativa')
    expect(html).toContain('Mostrador · MOST')
    expect(html).toContain('Confirmar venta')
  })

  it('mantiene bloqueo local del POS para roles no autorizados', () => {
    mockState.auth = { user: { role: 'DRIVER' } }

    const html = renderWithRouter(<SalesPosPage />, '/sales')

    expect(html).toContain('Acceso al POS denegado')
    expect(html).toContain('Solo los roles ADMIN y SELLER')
  })

  it('muestra historial con filtros y datos operativos en español', () => {
    mockState.sales = {
      data: { items: [confirmedSale] },
      error: null,
      isLoading: false,
    }

    const html = renderWithRouter(<SalesHistoryPage />)

    expect(html).toContain('Historial de ventas')
    expect(html).toContain('Ubicación operativa')
    expect(html).toContain('Folio físico')
    expect(html).toContain('Restaurante Norte')
    expect(html).toContain('Nota sencilla')
    expect(html).toContain('Venta a crédito')
    expect(html).toContain('Pendiente')
    expect(html).toContain('Ver detalle')
  })

  it('expone detalle de venta, reimpresión, documentos internos y estado documental', () => {
    mockState.sale = { data: confirmedSale, error: null, isLoading: false }
    mockState.documents = {
      data: { items: [{ createdAt: '2026-07-03T15:31:00.000Z', documentType: 'SIMPLE_NOTE', id: 'doc-1', physicalFolio: 'N-42', status: 'ISSUED' }] },
      error: null,
      isLoading: false,
    }

    const html = renderWithRouter(
      <Routes>
        <Route path="/sales/:saleId" element={<SaleDetailPage />} />
      </Routes>,
      '/sales/sale-1',
    )

    expect(html).toContain('Detalle de venta')
    expect(html).toContain('Reimprimir ticket interno')
    expect(html).toContain('Cancelar venta')
    expect(html).toContain('Documentos internos')
    expect(html).toContain('Nota sencilla')
    expect(html).toContain('Estado: ISSUED')
    expect(html).toContain('Venta a crédito')
  })

  it('abre el modal de ticket interno con un click real en la acción de reimpresión', async () => {
    mockState.sale = { data: confirmedSale, error: null, isLoading: false }
    mockState.ticket = {
      data: { saleNumber: 'V-1001', total: 276, documentType: 'SIMPLE_NOTE', paymentType: 'CREDIT_SALE' },
      error: null,
      isLoading: false,
    }

    const { container, root } = await renderDom(
      <MemoryRouter initialEntries={['/sales/sale-1']}>
        <Routes>
          <Route path="/sales/:saleId" element={<SaleDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )

    try {
      const reprintButton = getButtonByText(container, 'Reimprimir ticket interno')

      expect(container.textContent).not.toContain('Ticket interno')

      await act(async () => {
        reprintButton.click()
      })

      expect(container.textContent).toContain('Ticket interno')
      expect(container.textContent).toContain('Imprimir')
      expect(container.textContent).toContain('V-1001')
    } finally {
      await act(async () => {
        root.unmount()
      })
      container.remove()
    }
  })

  it('muestra UX bloqueante cuando falta la versión requerida para cancelar', () => {
    const html = renderToStaticMarkup(<CancelSaleDialog onClose={() => undefined} sale={{ ...confirmedSale, version: undefined }} />)

    expect(html).toContain('Cancelación auditada')
    expect(html).toContain('no incluye la versión de concurrencia requerida por la API')
    expect(html).toContain('Confirmar cancelación')
    expect(html).toContain('disabled=""')
  })

  it('renderiza unidades en español en el ticket sin filtrar enums crudos', () => {
    const html = renderToStaticMarkup(
      <TicketModal
        isLoading={false}
        onClose={() => undefined}
        ticket={{
          customerName: 'Público general',
          documentType: 'INTERNAL_RECEIPT',
          items: [
            { productName: 'Pierna y muslo', quantityKg: 2.5, quantityPieces: 4, subtotal: 310, unit: 'KG_AND_PIECE' },
            { productName: 'Pechuga', quantityKg: 1.2, quantityPieces: 0, subtotal: 144, unit: 'KG' },
          ],
          paymentType: 'CASH_SALE',
          saleNumber: 'V-2002',
          total: 454,
        }}
      />,
    )

    expect(html).toContain('Kilo y pieza')
    expect(html).toContain('Kilo')
    expect(html).not.toContain('KG_AND_PIECE')
  })
})
