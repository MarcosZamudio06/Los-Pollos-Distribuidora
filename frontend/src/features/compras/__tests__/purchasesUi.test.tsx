// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CancelPurchaseDialog } from '../CancelPurchaseDialog'
import { PurchaseDetailPage } from '../PurchaseDetailPage'
import { PurchaseFormPage } from '../PurchaseFormPage'
import { PurchaseItemsTable } from '../PurchaseItemsTable'
import { PurchaseLocationSelector } from '../PurchaseLocationSelector'
import { PurchasesPage } from '../PurchasesPage'
import { SupplierSelector } from '../SupplierSelector'
import type { PurchaseDetail } from '../types'

const mockState = vi.hoisted(() => ({
  auth: { user: { role: 'ADMIN' } },
  cancelPurchase: { isPending: false, mutateAsync: vi.fn() },
  createPurchase: { isPending: false, mutateAsync: vi.fn() },
  locations: { data: [{ id: 'loc-1', name: 'Almacén Principal', type: 'WAREHOUSE', isActive: true }, { id: 'route-1', name: 'Ruta 1', type: 'ROUTE_STOCK', isActive: true }], error: null, isLoading: false },
  products: { data: [{ activeEquivalences: [{ factor: 2.4, id: 'eq-1', unitFrom: 'PIECE', unitTo: 'KG' }], id: 'prod-1', name: 'Pollo entero', presentationType: 'WHOLE', purchaseCost: 80, unit: 'KG_AND_PIECE' }], error: null, isLoading: false },
  purchase: { data: null as PurchaseDetail | null, error: null, isLoading: false },
  purchases: { data: { items: [] as PurchaseDetail[] }, error: null, isLoading: false },
  suppliers: { data: [{ id: 'sup-1', name: 'Granja Norte', isActive: true }], error: null, isLoading: false },
}))

vi.mock('../hooks', () => ({
  useCancelPurchase: () => mockState.cancelPurchase,
  useCreatePurchase: () => mockState.createPurchase,
  usePurchase: () => mockState.purchase,
  usePurchaseLocations: () => mockState.locations,
  usePurchases: () => mockState.purchases,
  useSuppliers: () => mockState.suppliers,
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
    mockState.purchase = { data: null, error: null, isLoading: false }
    mockState.purchases = { data: { items: [] }, error: null, isLoading: false }
  })

  it('muestra listado de compras con filtros y columnas requeridas', () => {
    mockState.purchases = { data: { items: [{ ...purchase, locationName: undefined }] }, error: null, isLoading: false }

    const html = renderToStaticMarkup(<MemoryRouter><PurchasesPage /></MemoryRouter>)

    expect(html).toContain('Entradas de mercancía por ubicación')
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
    expect(html).toContain('Movimientos de inventario relacionados')
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
})
