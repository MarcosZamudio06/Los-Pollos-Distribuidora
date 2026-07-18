// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CancelSaleDialog } from '../CancelSaleDialog'
import { Cart, CustomerSelector, SaleSummary, TicketModal } from '../components'
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
  toast: { success: vi.fn(), warning: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: mockState.toast }))

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

vi.mock('../../rutas-reparto/components/DriverRouteMap', () => ({
  DriverRouteMap: ({ compact, currentOrder, orders = [], routeName }: { compact?: boolean; currentOrder?: { stopSequence?: number | null }; orders?: Array<{ stopSequence?: number | null }>; routeName: string }) => (
    <div aria-label={`Mapa de ${routeName}`} data-compact={compact ? 'true' : 'false'}>
      {orders.map((order) => <span key={order.stopSequence}>Pedido {order.stopSequence}</span>)}
      {currentOrder && <span>Pedido {currentOrder.stopSequence}</span>}
    </div>
  ),
}))

function renderWithRouter(element: React.ReactElement, initialEntry = '/sales/history') {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[initialEntry]}>{element}</MemoryRouter>)
}

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(text))
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button not found: ${text}`)
  return button
}

function getSelectByLabelText(container: HTMLElement, text: string): HTMLSelectElement {
  const label = Array.from(container.querySelectorAll('label')).find((candidate) => candidate.textContent?.includes(text))
  const select = label?.querySelector('select')
  if (!(select instanceof HTMLSelectElement)) throw new Error(`Select not found for label: ${text}`)
  return select
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
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
    mockState.toast.success.mockReset()
    mockState.toast.warning.mockReset()
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

  it('muestra advertencia, mora y política sin presentar WARN_ONLY como bloqueo', () => {
    const customer = {
      id: 'customer-warning', name: 'Comedor Central', customerType: 'INSTITUTIONAL' as const,
      creditStatus: 'ACTIVE', isActive: true,
      creditSummary: {
        effectiveCreditStatus: 'WARNING' as const,
        overdueAmount: 125,
        maximumDaysOverdue: 4,
        overdueBlockingMode: 'WARN_ONLY' as const,
        blockingReasons: ['CREDIT_OVERDUE_WARNING'],
        availableCredit: 900,
      },
    }

    const selector = renderToStaticMarkup(<CustomerSelector customers={[customer]} error={null} isLoading={false} onSearchChange={() => undefined} onSelect={() => undefined} search="" selectedCustomer={customer} />)
    const summary = renderToStaticMarkup(<SaleSummary cart={[]} customer={customer} paymentType="CREDIT_SALE" />)

    expect(selector).toContain('Advertencia de crédito')
    expect(selector).toContain('Vencido $125.00')
    expect(selector).toContain('4 días de atraso')
    expect(summary).toContain('Solo advertencia')
    expect(summary).not.toContain('Crédito bloqueado')
  })

  it('permite a ADMIN autorizar un bloqueo de mora con motivo explícito y lo envía en la venta', async () => {
    mockState.auth = { user: { role: 'ADMIN' } }
    mockState.locations = { data: [{ id: 'loc-counter', name: 'Mostrador', code: 'MOST', type: 'BRANCH' }], error: null, isLoading: false }
    mockState.products = { data: [{ id: 'prod-1', name: 'Pollo entero', sku: 'POL-1', presentationType: 'WHOLE', unit: 'PIECE', salePrice: 92, inventoryBalance: { locationId: 'loc-counter', quantityKg: 0, quantityPieces: 8 } }], error: null, isLoading: false, refetch: vi.fn() }
    mockState.customers = { data: [{ id: 'customer-1', name: 'Restaurante Norte', customerType: 'WHOLESALE', creditStatus: 'ACTIVE', commercialPolicyId: 'policy-1', isActive: true, creditSummary: { effectiveCreditStatus: 'BLOCKED', isBlockedForCredit: true, blockingReason: 'Saldo vencido', blockingReasons: ['CREDIT_OVERDUE_BLOCKED'], canAdministrativeOverride: true, overdueAmount: 800, maximumDaysOverdue: 8, availableCredit: 3000 } }], error: null, isLoading: false }
    mockState.createSale.mutateAsync.mockResolvedValue({ sale: { id: 'sale-1', items: [], total: 92, paymentType: 'CREDIT_SALE', status: 'CONFIRMED' } })

    const { container, root } = await renderDom(<MemoryRouter initialEntries={['/sales']}><SalesPosPage /></MemoryRouter>)
    try {
      const locationSelect = getSelectByLabelText(container, 'Ubicación operativa')
      await act(async () => { locationSelect.value = 'loc-counter'; locationSelect.dispatchEvent(new Event('change', { bubbles: true })) })
      await act(async () => { getButtonByText(container, 'Agregar').click(); getButtonByText(container, 'Restaurante Norte').click(); getButtonByText(container, 'Venta a crédito').click() })

      expect(container.textContent).toContain('Autorizar excepción de crédito')
      const overrideCheckbox = container.querySelector('input[name="credit-override"]') as HTMLInputElement
      await act(async () => { overrideCheckbox.click() })
      const reason = container.querySelector('textarea[name="credit-override-reason"]') as HTMLTextAreaElement
      await act(async () => { changeTextarea(reason, 'Autorizado por dirección') })
      await act(async () => { getButtonByText(container, 'Venta de contado').click(); getButtonByText(container, 'Venta a crédito').click() })
      expect((container.querySelector('input[name="credit-override"]') as HTMLInputElement).checked).toBe(false)
      expect(container.querySelector('textarea[name="credit-override-reason"]')).toBeNull()
      await act(async () => { (container.querySelector('input[name="credit-override"]') as HTMLInputElement).click() })
      await act(async () => { changeTextarea(container.querySelector('textarea[name="credit-override-reason"]') as HTMLTextAreaElement, 'Autorizado por dirección') })
      await act(async () => { getButtonByText(container, 'Confirmar venta').click() })
      expect(document.body.textContent).toContain('Autorización administrativa')
      await act(async () => { getButtonByText(document.body, 'Confirmar registro').click() })

      expect(mockState.createSale.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ administrativeOverrideReason: 'Autorizado por dirección' }))
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  it('no expone autorización de crédito a SELLER', async () => {
    mockState.auth = { user: { role: 'SELLER' } }
    mockState.locations = { data: [{ id: 'loc-counter', name: 'Mostrador', type: 'BRANCH' }], error: null, isLoading: false }
    mockState.customers = { data: [{ id: 'customer-1', name: 'Cliente bloqueado', customerType: 'WHOLESALE', creditStatus: 'ACTIVE', isActive: true, creditSummary: { effectiveCreditStatus: 'BLOCKED', isBlockedForCredit: true, blockingReason: 'Saldo vencido', blockingReasons: ['CREDIT_OVERDUE_BLOCKED'], canAdministrativeOverride: true } }], error: null, isLoading: false }
    const { container, root } = await renderDom(<MemoryRouter initialEntries={['/sales']}><SalesPosPage /></MemoryRouter>)
    try {
      await act(async () => { getButtonByText(container, 'Cliente bloqueado').click(); getButtonByText(container, 'Venta a crédito').click() })
      expect(container.textContent).not.toContain('Autorizar excepción de crédito')
      expect(container.textContent).toContain('Saldo vencido')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  it('deja vacíos kilos y piezas del carrito cuando su valor es cero', () => {
    const html = renderToStaticMarkup(<Cart items={[{ availableKg: 10, availablePieces: 10, id: 'prod-1', locationId: 'loc-counter', name: 'Pollo mixto', presentationType: 'WHOLE', productId: 'prod-1', quantityKg: 0, quantityPieces: 0, salePrice: 100, unit: 'KG_AND_PIECE', unitPrice: 100 }]} onQuantityChange={() => undefined} onRemove={() => undefined} />)

    expect(html.match(/value="0"/g)).toBeNull()
    expect(html).toContain('value=""')
  })

  it('limpia el cliente del resumen y conserva la ubicación después de registrar una venta', async () => {
    mockState.locations = { data: [{ id: 'loc-counter', name: 'Mostrador', code: 'MOST', type: 'BRANCH' }], error: null, isLoading: false }
    mockState.products = {
      data: [{ id: 'prod-1', name: 'Pollo entero', sku: 'POL-1', presentationType: 'WHOLE', unit: 'PIECE', salePrice: 92, inventoryBalance: { locationId: 'loc-counter', locationName: 'Mostrador', quantityKg: 0, quantityPieces: 8 } }],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    }
    mockState.customers = {
      data: [{ id: 'customer-1', name: 'Restaurante Norte', customerType: 'WHOLESALE', creditLimit: 5000, creditSummary: { availableCredit: 3200, creditLimit: 5000, outstandingAmount: 1800 }, isActive: true }],
      error: null,
      isLoading: false,
    }
    mockState.createSale.mutateAsync.mockResolvedValue({
      creditWarnings: ['CREDIT_OVERDUE_WARNING'],
      sale: { id: 'sale-1', saleNumber: 'V-1001', items: [], total: 92, paymentType: 'CASH_SALE', status: 'CONFIRMED', collectionStatus: 'PAID' },
      payment: { amount: 92, paymentMethod: 'CASH' },
      ticketId: 'ticket-1',
    })

    const { container, root } = await renderDom(<MemoryRouter initialEntries={['/sales']}><SalesPosPage /></MemoryRouter>)

    try {
      const locationSelect = getSelectByLabelText(container, 'Ubicación operativa')
      await act(async () => {
        locationSelect.value = 'loc-counter'
        locationSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await act(async () => { getButtonByText(container, 'Agregar').click() })
      await act(async () => { getButtonByText(container, 'Restaurante Norte').click() })

      expect(container.textContent).toContain('$5,000.00')
      expect(container.textContent).toContain('$3,200.00')

      await act(async () => { getButtonByText(container, 'Confirmar venta').click() })
      await act(async () => { getButtonByText(document.body, 'Confirmar registro').click() })

      expect(mockState.createSale.mutateAsync).toHaveBeenCalledTimes(1)
      expect(mockState.toast.warning).toHaveBeenCalledWith('Venta registrada con advertencia por saldo vencido.')
      expect(container.textContent).toContain('0 partidas')
      expect(container.textContent).not.toContain('$5,000.00')
      expect(container.textContent).not.toContain('Limpiar cliente')
      expect(container.textContent).toContain('Límite de crédito—')
      expect(container.textContent).toContain('Crédito disponible—')
      expect(container.textContent).toContain('Saldo pendiente—')
      expect(getSelectByLabelText(container, 'Ubicación operativa').value).toBe('loc-counter')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  it('conserva carrito, cliente y resumen cuando el registro de venta falla', async () => {
    mockState.locations = { data: [{ id: 'loc-counter', name: 'Mostrador', code: 'MOST', type: 'BRANCH' }], error: null, isLoading: false }
    mockState.products = {
      data: [{ id: 'prod-1', name: 'Pollo entero', sku: 'POL-1', presentationType: 'WHOLE', unit: 'PIECE', salePrice: 92, inventoryBalance: { locationId: 'loc-counter', locationName: 'Mostrador', quantityKg: 0, quantityPieces: 8 } }],
      error: null,
      isLoading: false,
      refetch: vi.fn(),
    }
    mockState.customers = {
      data: [{ id: 'customer-1', name: 'Restaurante Norte', customerType: 'WHOLESALE', creditLimit: 5000, creditSummary: { availableCredit: 3200, creditLimit: 5000, outstandingAmount: 1800 }, isActive: true }],
      error: null,
      isLoading: false,
    }
    mockState.createSale.mutateAsync.mockRejectedValue(new Error('No se pudo registrar la venta'))

    const { container, root } = await renderDom(<MemoryRouter initialEntries={['/sales']}><SalesPosPage /></MemoryRouter>)

    try {
      const locationSelect = getSelectByLabelText(container, 'Ubicación operativa')
      await act(async () => {
        locationSelect.value = 'loc-counter'
        locationSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      await act(async () => { getButtonByText(container, 'Agregar').click() })
      await act(async () => { getButtonByText(container, 'Restaurante Norte').click() })
      await act(async () => { getButtonByText(container, 'Confirmar venta').click() })
      await act(async () => { getButtonByText(document.body, 'Confirmar registro').click() })

      expect(mockState.createSale.mutateAsync).toHaveBeenCalledTimes(1)
      expect(container.textContent).toContain('1 en carrito')
      expect(container.textContent).toContain('$5,000.00')
      expect(container.textContent).toContain('$3,200.00')
      expect(container.textContent).toContain('Limpiar cliente')
      expect(document.body.textContent).toContain('No se pudo registrar la venta')
      expect(locationSelect.value).toBe('loc-counter')
    } finally {
      await act(async () => { root.unmount() })
      container.remove()
    }
  })

  it('mantiene bloqueo local del POS para roles no autorizados', () => {
    mockState.auth = { user: { role: 'DRIVER' } }

    const html = renderWithRouter(<SalesPosPage />, '/sales')

    expect(html).toContain('Acceso al POS denegado')
    expect(html).toContain('Solo los roles ADMIN y SELLER')
  })

  it('muestra historial con filtros y datos operativos en español', () => {
    mockState.locations = { data: [{ id: 'loc-counter', name: 'Mostrador', code: 'MOST', type: 'BRANCH' }], error: null, isLoading: false }
    mockState.sales = {
      data: { items: [confirmedSale] },
      error: null,
      isLoading: false,
    }

    const html = renderWithRouter(<SalesHistoryPage />)

    expect(html).toContain('Historial de ventas')
    expect(html).toContain('Ubicación operativa')
    expect(html).toContain('Todas las ubicaciones')
    expect(html).toContain('Mostrador · MOST')
    expect(html).not.toContain('ID de ubicación')
    expect(html).toContain('Folio físico')
    expect(html).toContain('Restaurante Norte')
    expect(html).toContain('Nota sencilla')
    expect(html).toContain('Venta a crédito')
    expect(html).toContain('Pendiente')
    expect(html).toContain('Sin ruta asignada')
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
    expect(html).toContain('Sin ruta asignada')
  })

  it('separa la asignación de ruta del estado comercial de la venta', () => {
    const routedSale = { ...confirmedSale, id: 'sale-2', routeId: 'route-1', saleNumber: 'V-1002' }
    mockState.sales = { data: { items: [confirmedSale, routedSale] }, error: null, isLoading: false }
    mockState.sale = { data: routedSale, error: null, isLoading: false }

    const historyHtml = renderWithRouter(<SalesHistoryPage />)
    const detailHtml = renderWithRouter(
      <Routes><Route path="/sales/:saleId" element={<SaleDetailPage />} /></Routes>,
      '/sales/sale-2',
    )

    expect(historyHtml).toContain('Confirmada')
    expect(historyHtml).toContain('Sin ruta asignada')
    expect(historyHtml).toContain('Ruta asignada')
    expect(detailHtml).toContain('Confirmada')
    expect(detailHtml).toContain('Ruta asignada')
  })

  it('muestra un minimapa compacto con la ruta optimizada y la parada del pedido actual', () => {
    mockState.sale = {
      data: {
        ...confirmedSale,
        routeId: 'route-1',
        routePreview: {
          id: 'route-1', name: 'Ruta Norte', mapAvailable: true,
          geometry: { type: 'LineString', coordinates: [[-96.14, 19.18], [-96.13, 19.17]] },
          distanceMeters: 8600, durationSeconds: 1440,
          order: { latitude: 19.1738, longitude: -96.1342, stopSequence: 2 },
        },
      },
      error: null,
      isLoading: false,
    }

    const html = renderWithRouter(<Routes><Route path="/sales/:saleId" element={<SaleDetailPage />} /></Routes>, '/sales/sale-1')

    expect(html).toContain('Ruta optimizada asignada')
    expect(html).toContain('Ruta Norte')
    expect(html).toContain('Mapa de Ruta Norte')
    expect(html).toContain('data-compact="true"')
    expect(html).toContain('Pedido 2')
    expect(html).toContain('8.6 km')
    expect(html).toContain('24 min')
  })

  it('muestra estado operativo sin mapa para ruta sin geometría y omite la sección si no hay asignación', () => {
    mockState.sale = {
      data: { ...confirmedSale, routeId: 'route-1', routePreview: { id: 'route-1', name: 'Ruta histórica', mapAvailable: false, geometry: null, distanceMeters: null, durationSeconds: null, order: null } },
      error: null,
      isLoading: false,
    }
    const unavailableHtml = renderWithRouter(<Routes><Route path="/sales/:saleId" element={<SaleDetailPage />} /></Routes>, '/sales/sale-1')
    expect(unavailableHtml).toContain('Ruta histórica')
    expect(unavailableHtml).toContain('Ruta asignada')
    expect(unavailableHtml).not.toContain('Ruta optimizada asignada')
    expect(unavailableHtml).toContain('El trazado optimizado no está disponible para esta ruta.')
    expect(unavailableHtml).not.toContain('Mapa de Ruta histórica')

    mockState.sale = { data: confirmedSale, error: null, isLoading: false }
    const unassignedHtml = renderWithRouter(<Routes><Route path="/sales/:saleId" element={<SaleDetailPage />} /></Routes>, '/sales/sale-1')
    expect(unassignedHtml).not.toContain('Ruta optimizada asignada')
    expect(unassignedHtml).not.toContain('trazado optimizado')
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

      expect(document.body.textContent).toContain('Ticket interno')
      expect(document.body.textContent).toContain('Imprimir')
      expect(document.body.textContent).toContain('V-1001')
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
    expect(html).toContain('ticket-print-root')
    expect(html).toContain('ticket-print-content')
  })
})
