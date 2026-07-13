// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CancelPurchaseDialog } from '../CancelPurchaseDialog'
import { PurchaseDetailPage } from '../PurchaseDetailPage'
import { PurchaseFormPage } from '../PurchaseFormPage'
import { PurchaseItemsTable } from '../PurchaseItemsTable'
import { PurchaseLocationSelector } from '../PurchaseLocationSelector'
import { PurchasesPage } from '../PurchasesPage'
import { SuppliersPage } from '../SuppliersPage'
import { SupplierSelector } from '../SupplierSelector'
import type { PurchaseDetail, Supplier } from '../types'

const mockState = vi.hoisted(() => ({
  auth: { user: { role: 'ADMIN' } },
  cancelPurchase: { isPending: false, mutateAsync: vi.fn() },
  createPurchase: { isPending: false, mutateAsync: vi.fn() },
  createSupplier: { isPending: false, mutateAsync: vi.fn() },
  deactivateSupplier: { isPending: false, mutateAsync: vi.fn() },
  locations: { data: [{ id: 'loc-1', name: 'Almacén Principal', type: 'WAREHOUSE', isActive: true }, { id: 'route-1', name: 'Ruta 1', type: 'ROUTE_STOCK', isActive: true }], error: null, isLoading: false },
  products: { data: [{ activeEquivalences: [{ factor: 2.4, id: 'eq-1', unitFrom: 'PIECE', unitTo: 'KG' }], id: 'prod-1', name: 'Pollo entero', presentationType: 'WHOLE', purchaseCost: 80, unit: 'KG_AND_PIECE' }], error: null, isLoading: false },
  purchase: { data: null as PurchaseDetail | null, error: null, isLoading: false },
  purchases: { data: { items: [] as PurchaseDetail[] }, error: null, isLoading: false },
  suppliers: { data: [{ id: 'sup-1', name: 'Granja Norte', isActive: true }] as Supplier[], error: null as Error | null, isLoading: false },
  updateSupplier: { isPending: false, mutateAsync: vi.fn() },
}))

vi.mock('../hooks', () => ({
  useCancelPurchase: () => mockState.cancelPurchase,
  useCreatePurchase: () => mockState.createPurchase,
  useCreateSupplier: () => mockState.createSupplier,
  useDeactivateSupplier: () => mockState.deactivateSupplier,
  usePurchase: () => mockState.purchase,
  usePurchaseLocations: () => mockState.locations,
  usePurchases: () => mockState.purchases,
  useSuppliers: () => mockState.suppliers,
  useUpdateSupplier: () => mockState.updateSupplier,
}))

vi.mock('../../inventario', () => ({
  useProducts: () => mockState.products,
}))

vi.mock('../../auth', () => ({
  useAuth: () => mockState.auth,
}))

const purchase: PurchaseDetail = {
  createdAt: '2026-07-03T12:00:00.000Z',
  id: 'pur-1',
  inventoryMovements: [{ createdAt: '2026-07-03T12:01:00.000Z', id: 'mov-1', locationId: 'loc-1', locationName: 'Almacén Principal', newQuantityKg: 12, newQuantityPieces: 4, productId: 'prod-1', productName: 'Pollo entero', quantityKg: 10, quantityPieces: 4, type: 'PURCHASE' }],
  items: [{ appliedEquivalentFactor: 2.4, id: 'item-1', productId: 'prod-1', productName: 'Pollo entero', quantityKg: 10, quantityPieces: 4, subtotal: 800, unit: 'KG_AND_PIECE', unitCost: 80, unitEquivalentId: 'eq-1' }],
  locationId: 'loc-1',
  locationName: 'Almacén Principal',
  purchaseNumber: 'C-0001',
  status: 'CONFIRMED',
  supplierId: 'sup-1',
  supplierName: 'Granja Norte',
  total: 800,
  userId: 'user-1',
}

describe('TASK-062 purchase UI behavior', () => {
  beforeEach(() => {
    mockState.auth = { user: { role: 'ADMIN' } }
    mockState.cancelPurchase = { isPending: false, mutateAsync: vi.fn() }
    mockState.createPurchase = { isPending: false, mutateAsync: vi.fn() }
    mockState.createSupplier = { isPending: false, mutateAsync: vi.fn() }
    mockState.deactivateSupplier = { isPending: false, mutateAsync: vi.fn() }
    mockState.purchase = { data: null, error: null, isLoading: false }
    mockState.purchases = { data: { items: [] }, error: null, isLoading: false }
    mockState.suppliers = { data: [{ address: 'Carretera Norte', email: 'ventas@granja.mx', id: 'sup-1', isActive: true, name: 'Granja Norte', phone: '2291234567' }], error: null, isLoading: false }
    mockState.updateSupplier = { isPending: false, mutateAsync: vi.fn() }
  })

  it('muestra listado de compras con filtros y columnas requeridas', () => {
    mockState.purchases = { data: { items: [{ ...purchase, locationName: undefined }] }, error: null, isLoading: false }

    const html = renderToStaticMarkup(<MemoryRouter><PurchasesPage /></MemoryRouter>)

    expect(html).toContain('Recepción de mercancía por ubicación')
    expect(html).toContain('Proveedor')
    expect(html).toContain('Ubicación receptora')
    expect(html).toContain('Granja Norte')
    expect(html).toContain('Almacén Principal')
    expect(html).toContain('Confirmada')
    expect(html).toContain('Ver detalle')
    expect(html).not.toContain('ID proveedor')
    expect(html).not.toContain('ID ubicación')
  })

  it('renderiza formulario con proveedor, ubicación, items y política de costo', () => {
    const html = renderToStaticMarkup(<MemoryRouter><PurchaseFormPage /></MemoryRouter>)

    expect(html).toContain('Nueva compra')
    expect(html).toContain('Origen de la mercancía')
    expect(html).toContain('Inventario por ubicación')
    expect(html).toContain('Actualizar costo del producto')
    expect(html).toContain('Captura por kilo, pieza o ambas')
    expect(html).toContain('Registrar compra')
  })

  it('filtra ROUTE_STOCK fuera del selector de ubicación receptora', () => {
    const html = renderToStaticMarkup(<PurchaseLocationSelector onChange={() => undefined} value="" />)

    expect(html).toContain('Almacén Principal')
    expect(html).not.toContain('Ruta 1')
    expect(html).toContain('No existe stock global')
  })

  it('muestra selector de proveedor activo', () => {
    const html = renderToStaticMarkup(<SupplierSelector onChange={() => undefined} value="" />)

    expect(html).toContain('Proveedor requerido')
    expect(html).toContain('Granja Norte')
  })

  it('muestra columnas de item y equivalencia aplicada en español', () => {
    const html = renderToStaticMarkup(<PurchaseItemsTable items={[{ appliedEquivalentFactor: 2.4, productId: 'prod-1', productName: 'Pollo entero', presentationType: 'WHOLE', quantityKg: 10, quantityPieces: 4, unit: 'KG_AND_PIECE', unitCost: 80, unitEquivalentId: 'eq-1' }]} onAddItem={() => undefined} onRemoveItem={() => undefined} onUpdateItem={() => undefined} products={[]} />)

    expect(html).toContain('Kilo y pieza')
    expect(html).toContain('Equivalencia')
    expect(html).toContain('2.4 kg/pza')
    expect(html).not.toContain('KG_AND_PIECE')
  })

  it('deja vacíos los inputs numéricos cuyo valor inicial es cero', () => {
    const html = renderToStaticMarkup(<PurchaseItemsTable items={[{ productId: 'prod-1', productName: 'Pollo entero', presentationType: 'WHOLE', quantityKg: 0, quantityPieces: 0, unit: 'KG', unitCost: 0 }]} onAddItem={() => undefined} onRemoveItem={() => undefined} onUpdateItem={() => undefined} products={[]} />)

    expect(html.match(/value="0"/g)).toBeNull()
    expect(html).toContain('aria-label="Piezas de Pollo entero" value=""')
    expect(html).toContain('aria-label="Costo de Pollo entero" value=""')
  })

  it('obliga selección explícita de equivalencia para kilo y pieza mixto', () => {
    const html = renderToStaticMarkup(<PurchaseItemsTable items={[{ availableEquivalences: [{ factor: 2.4, id: 'eq-1', unitFrom: 'PIECE', unitTo: 'KG' }], appliedEquivalentFactor: null, productId: 'prod-1', productName: 'Pollo entero', presentationType: 'WHOLE', quantityKg: 10, quantityPieces: 4, unit: 'KG_AND_PIECE', unitCost: 80 }]} onAddItem={() => undefined} onRemoveItem={() => undefined} onUpdateItem={() => undefined} products={[]} />)

    expect(html).toContain('Selecciona equivalencia')
    expect(html).toContain('2.4 kg/pza')
  })

  it('expone detalle con items, movimientos y acción de cancelación', () => {
    mockState.purchase = { data: purchase, error: null, isLoading: false }

    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/purchases/pur-1']}><Routes><Route path="/purchases/:purchaseId" element={<PurchaseDetailPage />} /></Routes></MemoryRouter>)

    expect(html).toContain('Detalle de compra')
    expect(html).toContain('Items comprados')
    expect(html).toContain('Movimientos relacionados')
    expect(html).toContain('Cancelar compra')
    expect(html).toContain('Pollo entero')
  })

  it('requiere motivo para cancelar y advierte inventario negativo', () => {
    const html = renderToStaticMarkup(<CancelPurchaseDialog onClose={() => undefined} purchase={purchase} />)

    expect(html).toContain('Motivo obligatorio')
    expect(html).toContain('inventario negativo')
    expect(html).toContain('Confirmar cancelación')
    expect(html).toContain('disabled=""')
  })

  it('renderiza página de proveedores con búsqueda, estado y tabla compacta', () => {
    const html = renderToStaticMarkup(<MemoryRouter><SuppliersPage /></MemoryRouter>)

    expect(html).toContain('Proveedores')
    expect(html).toContain('Alta y mantenimiento de proveedores')
    expect(html).toContain('Buscar proveedor')
    expect(html).toContain('Activo/inactivo')
    expect(html).toContain('Granja Norte')
    expect(html).toContain('ventas@granja.mx')
    expect(html).toContain('Nuevo proveedor')
  })

  it('muestra acción de desactivación solo para ADMIN', () => {
    mockState.auth = { user: { role: 'ADMIN' } }
    const adminHtml = renderToStaticMarkup(<MemoryRouter><SuppliersPage /></MemoryRouter>)
    expect(adminHtml).toContain('Desactivar')

    mockState.auth = { user: { role: 'WAREHOUSE' } }
    const warehouseHtml = renderToStaticMarkup(<MemoryRouter><SuppliersPage /></MemoryRouter>)
    expect(warehouseHtml).not.toContain('Desactivar')
  })

  it('solicita confirmación antes de desactivar un proveedor', async () => {
    mockState.deactivateSupplier.mutateAsync.mockResolvedValue({ id: 'sup-1', isActive: false, name: 'Granja Norte' })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      await act(async () => root.render(<MemoryRouter><SuppliersPage /></MemoryRouter>))
      const deactivateButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Desactivar'))
      if (!deactivateButton) throw new Error('Deactivate supplier button not found')

      await act(async () => deactivateButton.click())
      expect(mockState.deactivateSupplier.mutateAsync).not.toHaveBeenCalled()
      expect(document.body.textContent).toContain('Desactivar proveedor')
      expect(document.body.textContent).toContain('Su historial permanecerá intacto.')

      const confirmButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent?.includes('Confirmar desactivación'))
      if (!confirmButton) throw new Error('Confirm deactivation button not found')
      await act(async () => confirmButton.click())

      expect(mockState.deactivateSupplier.mutateAsync).toHaveBeenCalledTimes(1)
      expect(mockState.deactivateSupplier.mutateAsync).toHaveBeenCalledWith('sup-1')
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })

  it('muestra estados vacío, carga y error para proveedores', () => {
    mockState.suppliers = { data: [], error: null, isLoading: false }
    expect(renderToStaticMarkup(<MemoryRouter><SuppliersPage /></MemoryRouter>)).toContain('No hay proveedores para estos filtros.')

    mockState.suppliers = { data: [], error: null, isLoading: true }
    expect(renderToStaticMarkup(<MemoryRouter><SuppliersPage /></MemoryRouter>)).toContain('Cargando proveedores...')

    mockState.suppliers = { data: [], error: new Error('Boom'), isLoading: false }
    expect(renderToStaticMarkup(<MemoryRouter><SuppliersPage /></MemoryRouter>)).toContain('No se pudieron cargar los proveedores.')
  })
})
