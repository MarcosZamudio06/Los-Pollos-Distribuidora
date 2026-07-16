// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductFilters } from '../hooks/useProducts'
import { ProductListPage } from '../pages/ProductListPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockState = vi.hoisted(() => ({
  auth: { user: { role: 'ADMIN' } },
  categories: { data: [{ id: 'cat-1', name: 'Pollo fresco' }], error: null as Error | null, isLoading: false, refetch: vi.fn() },
  locations: { data: [{ id: 'loc-1', name: 'Almacén Principal' }], error: null as Error | null, isLoading: false, refetch: vi.fn() },
  products: { data: [], error: null, isLoading: false },
  productFilters: {} as ProductFilters,
}))

vi.mock('../../auth', () => ({
  useAuth: () => mockState.auth,
}))

vi.mock('../hooks/useProducts', () => ({
  useInventoryCategories: () => mockState.categories,
  useInventoryLocations: () => mockState.locations,
  useProducts: (filters: ProductFilters) => { mockState.productFilters = filters; return mockState.products },
}))

vi.mock('../components/InventoryByLocationView', () => ({ InventoryByLocationView: () => null }))
vi.mock('../components/InventoryMovementsView', () => ({ InventoryMovementsView: () => null }))
vi.mock('../components/InventoryTransferView', () => ({ InventoryTransferView: () => null }))

describe('Filtros del inventario', () => {
  let root: Root | undefined

  beforeEach(() => {
    mockState.auth = { user: { role: 'ADMIN' } }
    mockState.categories = { data: [{ id: 'cat-1', name: 'Pollo fresco' }], error: null, isLoading: false, refetch: vi.fn() }
    mockState.locations = { data: [{ id: 'loc-1', name: 'Almacén Principal' }], error: null, isLoading: false, refetch: vi.fn() }
    mockState.productFilters = {}
  })

  afterEach(async () => { if (root) await act(async () => root?.unmount()); document.body.innerHTML = ''; root = undefined })

  async function renderPage() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<ProductListPage />))
    return container
  }

  async function select(selectElement: HTMLSelectElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(selectElement, value)
      selectElement.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }

  it('muestra categorías y ubicaciones reales en selects en lugar de pedir IDs', () => {
    const html = renderToStaticMarkup(<ProductListPage />)

    expect(html).toContain('Pollo fresco')
    expect(html).toContain('Almacén Principal')
    expect(html).toContain('Todas las categorías')
    expect(html).toContain('Todas las ubicaciones')
    expect(html).not.toContain('ID de categoría')
    expect(html).not.toContain('ID de ubicación')
  })

  it('envía los IDs seleccionados y limpia stock bajo al quitar la ubicación', async () => {
    const container = await renderPage()
    const category = container.querySelector<HTMLSelectElement>('[aria-label="Categoría"]')!
    const location = container.querySelector<HTMLSelectElement>('[aria-label="Ubicación"]')!
    const lowStock = container.querySelector<HTMLInputElement>('[aria-label="Solo stock bajo"]')!

    await select(category, 'cat-1')
    await select(location, 'loc-1')
    await act(async () => lowStock.click())
    expect(mockState.productFilters).toMatchObject({ categoryId: 'cat-1', locationId: 'loc-1', lowStock: true })

    await select(location, '')
    expect(lowStock.checked).toBe(false)
    expect(lowStock.disabled).toBe(true)
    expect(mockState.productFilters).toMatchObject({ categoryId: 'cat-1', locationId: undefined, lowStock: undefined })
  })

  it('muestra errores de catálogos y permite reintentar ambas cargas', async () => {
    mockState.categories = { data: [], error: new Error('categorías caídas'), isLoading: false, refetch: vi.fn() }
    mockState.locations = { data: [], error: new Error('ubicaciones caídas'), isLoading: false, refetch: vi.fn() }
    const container = await renderPage()

    expect(container.textContent).toContain('No se pudieron cargar las categorías')
    expect(container.textContent).toContain('No se pudieron cargar las ubicaciones')
    const retryButtons = [...container.querySelectorAll<HTMLButtonElement>('button')].filter((button) => button.textContent === 'Reintentar')
    expect(retryButtons).toHaveLength(2)
    await act(async () => { retryButtons[0].click(); retryButtons[1].click() })
    expect(mockState.categories.refetch).toHaveBeenCalledOnce()
    expect(mockState.locations.refetch).toHaveBeenCalledOnce()
  })
})
