import { PackageSearch } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { OperationalLocation } from '../../compras/types'
import { toMoney } from '../posLogic'
import type { ProductOption } from '../types'

type ProductResultsTableProps = {
  error: unknown
  frequentProducts: ProductOption[]
  isLoading: boolean
  locationDisabled?: boolean
  locationWarning?: string
  locations: OperationalLocation[]
  locationsError: unknown
  locationsLoading: boolean
  locationId: string
  onAdd: (product: ProductOption) => void
  onLocationChange: (locationId: string) => void
  products: ProductOption[]
  search: string
  showLocationSelector?: boolean
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? String(error.message) : fallback
}

const inputClass = 'h-11 rounded-lg border border-[var(--pos-steel)] bg-white px-3 text-[var(--pos-ink)] outline-none transition focus:border-[var(--pos-focus)] focus:ring-2 focus:ring-[rgba(37,99,235,0.18)]'
const PRODUCT_ROW_HEIGHT = 52
const VIRTUALIZATION_THRESHOLD = 100
const VIRTUALIZATION_OVERSCAN = 6

export function ProductResultsTable({
  error,
  frequentProducts,
  isLoading,
  locationDisabled = false,
  locationWarning,
  locations,
  locationsError,
  locationsLoading,
  locationId,
  onAdd,
  onLocationChange,
  products,
  search,
  showLocationSelector = true,
}: ProductResultsTableProps) {
  const [activeView, setActiveView] = useState<'frequent' | 'all'>('all')
  const [activeCategory, setActiveCategory] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)
  const categoryOptions = useMemo(() => Array.from(new Set(products.map((product) => product.categoryName).filter((category): category is string => Boolean(category)))), [products])
  const sourceProducts = useMemo(() => search.trim() || activeView === 'all' ? products : frequentProducts, [activeView, frequentProducts, products, search])
  const visibleProducts = useMemo(() => activeCategory ? sourceProducts.filter((product) => product.categoryName === activeCategory) : sourceProducts, [activeCategory, sourceProducts])
  const virtualized = visibleProducts.length > VIRTUALIZATION_THRESHOLD
  const renderedRowCount = Math.ceil((viewportHeight || 520) / PRODUCT_ROW_HEIGHT) + VIRTUALIZATION_OVERSCAN * 2
  const startIndex = virtualized ? Math.max(0, Math.floor(scrollTop / PRODUCT_ROW_HEIGHT) - VIRTUALIZATION_OVERSCAN) : 0
  const endIndex = virtualized ? Math.min(visibleProducts.length, startIndex + renderedRowCount) : visibleProducts.length
  const renderedProducts = virtualized ? visibleProducts.slice(startIndex, endIndex) : visibleProducts

  useEffect(() => {
    const results = resultsRef.current
    if (!results) return
    const updateViewportHeight = () => setViewportHeight(results.clientHeight)
    updateViewportHeight()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateViewportHeight)
    observer.observe(results)
    return () => observer.disconnect()
  }, [visibleProducts.length])

  return (
    <section className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--pos-steel)] px-3">
        <span className="font-[var(--pos-mono)] text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[var(--pos-muted)]">Resultados</span>
        <PackageSearch className="h-4 w-4 text-[var(--pos-muted)]" />
      </div>
      <div className="grid shrink-0 gap-2 border-b border-[var(--pos-steel)] p-3">
        {showLocationSelector && <label className="grid gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--pos-muted)]">
          Ubicación operativa
          <select className={`${inputClass} font-semibold normal-case tracking-normal`} disabled={locationDisabled} onChange={(event) => onLocationChange(event.target.value)} value={locationId}>
            <option value="">Selecciona ubicación operativa</option>
            {locations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.code ? ` · ${location.code}` : ''}</option>)}
          </select>
          {locationDisabled && <span className="text-[0.68rem] font-semibold normal-case tracking-normal text-[var(--pos-green)]">La ubicación se deriva de tu usuario.</span>}
        </label>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Vistas rápidas de productos">
          <button aria-pressed={activeView === 'frequent'} className={`inline-flex h-11 items-center text-xs font-bold transition ${activeView === 'frequent' ? 'text-[var(--pos-green)]' : 'text-[var(--pos-muted)] hover:text-[var(--pos-ink)]'}`} onClick={() => { setActiveView('frequent'); setActiveCategory('') }} type="button">Frecuentes recientes</button>
          <button aria-pressed={activeView === 'all'} className={`inline-flex h-11 items-center text-xs font-bold transition ${activeView === 'all' ? 'text-[var(--pos-green)]' : 'text-[var(--pos-muted)] hover:text-[var(--pos-ink)]'}`} onClick={() => setActiveView('all')} type="button">Todos</button>
          {categoryOptions.map((category) => <button aria-pressed={activeCategory === category} className={`inline-flex h-11 items-center border-l pl-3 text-xs font-bold transition ${activeCategory === category ? 'border-[var(--pos-green)] text-[var(--pos-green)]' : 'border-[var(--pos-steel)] text-[var(--pos-muted)] hover:text-[var(--pos-ink)]'}`} key={category} onClick={() => { setActiveView('all'); setActiveCategory(activeCategory === category ? '' : category) }} type="button">{category}</button>)}
        </div>
      </div>
      {locationWarning && <p role="status" className="border-b border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] px-3 py-2 text-xs font-bold text-[var(--erp-brand-gold-deep)]">{locationWarning}</p>}
      {!locationId && <p className="border-b border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] px-3 py-2 text-xs font-bold text-[var(--erp-brand-gold-deep)]">Selecciona una ubicación operativa antes de agregar productos. El inventario del POS nunca es global.</p>}
      {locationsLoading && <p className="border-b bg-[rgba(35,113,90,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-green)]">Cargando ubicaciones operativas...</p>}
      {Boolean(locationsError) && <p role="alert" className="border-b border-[rgba(182,42,34,0.20)] bg-[rgba(182,42,34,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-red)]">{errorMessage(locationsError, 'No se pudieron cargar las ubicaciones operativas.')}</p>}
      {isLoading && <p className="border-b bg-[rgba(35,113,90,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-green)]">Cargando productos...</p>}
      {Boolean(error) && <p role="alert" className="border-b border-[rgba(182,42,34,0.20)] bg-[rgba(182,42,34,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-red)]">{errorMessage(error, 'La búsqueda de productos falló.')}</p>}
      {locationId && !isLoading && !error && visibleProducts.length === 0 && <p className="m-3 border border-dashed border-[var(--pos-steel)] p-4 text-sm text-[var(--pos-muted)]">{activeView === 'frequent' && !search ? 'Aún no hay productos frecuentes en esta sesión. Cambia a Todos para ver el catálogo.' : 'No se encontraron productos para esta ubicación y búsqueda.'}</p>}
      <div className="min-h-0 flex-1 overflow-auto" onScroll={(event) => { if (virtualized) setScrollTop(event.currentTarget.scrollTop) }} ref={resultsRef}>
        <table className="w-full min-w-[24rem] border-collapse text-left xl:min-w-[34rem]">
          <caption className="sr-only">Productos disponibles en la ubicación operativa seleccionada</caption>
          <thead className="sticky top-0 z-10 h-9 bg-[var(--pos-porcelain)] font-[var(--pos-mono)] text-[0.62rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]"><tr><th className="px-3" scope="col">Producto</th><th className="hidden xl:table-cell" scope="col">SKU</th><th scope="col">Unidad</th><th className="text-right" scope="col">Precio</th><th className="text-right" scope="col">Existencia</th><th className="w-20 px-3 text-right" scope="col">Acción</th></tr></thead>
          <tbody>{virtualized && startIndex > 0 && <tr aria-hidden="true"><td colSpan={6} style={{ height: `${startIndex * PRODUCT_ROW_HEIGHT}px`, padding: 0 }} /></tr>}{renderedProducts.map((product) => {
            const hasNoStock = product.availableKg <= 0 && product.availablePieces <= 0
            return <tr className="h-[52px] border-b border-[var(--pos-steel)] transition hover:bg-[var(--pos-porcelain)]" key={product.id}>
              <td className="max-w-0 px-3"><p className="truncate text-sm font-bold">{product.name}</p>{product.isLowStock && <p className="text-[0.62rem] font-bold text-[var(--pos-warning)]">Stock bajo</p>}</td>
              <td className="hidden font-[var(--pos-mono)] text-[0.65rem] text-[var(--pos-muted)] xl:table-cell">{product.sku ?? product.barcode ?? 'Sin código'}</td>
              <td className="font-[var(--pos-mono)] text-xs font-bold">{product.unit}</td><td className="text-right font-[var(--pos-mono)] text-sm font-bold">{toMoney(product.salePrice)}</td>
              <td className={`text-right font-[var(--pos-mono)] text-xs font-bold ${hasNoStock ? 'text-[var(--pos-red)]' : product.isLowStock ? 'text-[#7d5a12]' : 'text-[var(--pos-muted)]'}`}>{hasNoStock ? 'Sin stock' : `${product.availableKg} kg · ${product.availablePieces} pz`}</td>
              <td className="px-3 text-right"><button className="h-11 border border-[var(--pos-ink)] px-2 text-xs font-bold text-[var(--pos-ink)] transition hover:bg-[var(--pos-ink)] hover:text-white disabled:cursor-not-allowed disabled:border-[var(--pos-steel)] disabled:text-[var(--pos-muted)]" disabled={!locationId || product.locationId !== locationId || hasNoStock} onClick={() => onAdd(product)} type="button">Agregar</button></td>
            </tr>
          })}{virtualized && endIndex < visibleProducts.length && <tr aria-hidden="true"><td colSpan={6} style={{ height: `${(visibleProducts.length - endIndex) * PRODUCT_ROW_HEIGHT}px`, padding: 0 }} /></tr>}</tbody>
        </table>
      </div>
    </section>
  )
}

export type { ProductResultsTableProps }
