import { useState } from 'react'
import { Boxes, MapPin, Package, Pencil, Search, Settings2, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '../../auth'
import { AsyncState } from '../components/AsyncState'
import { InventoryAdjustmentModal } from '../components/InventoryAdjustmentModal'
import { InventoryByLocationView } from '../components/InventoryByLocationView'
import { InventoryMovementsView } from '../components/InventoryMovementsView'
import { InventoryTransferView } from '../components/InventoryTransferView'
import { LowStockBadge } from '../components/LowStockBadge'
import { ProductFormModal } from '../components/ProductFormModal'
import { useProducts, type ProductFilters } from '../hooks/useProducts'
import type { InventoryBalance, Product } from '../types'

function categoryName(product: Product) {
  if (!product.category) return '—'
  return typeof product.category === 'string' ? product.category : product.category.name
}

function canManageInventory(role?: string | null) {
  return role === 'ADMIN' || role === 'WAREHOUSE'
}

function productBalance(product: Product): InventoryBalance | null {
  return product.inventoryBalance ?? product.locationBalance ?? product.balances?.[0] ?? null
}

function productUnit(product: Product) {
  return product.unit ?? product.operationalUnit ?? '—'
}

function productPresentation(product: Product) {
  return product.presentationType ?? product.presentation ?? '—'
}

function productPurchaseCost(product: Product) {
  return product.purchaseCost ?? product.cost ?? 0
}

function productEquivalence(product: Product) {
  if (product.visibleEquivalence) return product.visibleEquivalence
  const activeEquivalence = product.activeEquivalences?.[0]
  if (activeEquivalence) return `${activeEquivalence.factor} ${activeEquivalence.unitTo} por ${activeEquivalence.unitFrom}`
  return product.equivalentPolicyStatus ?? product.equivalencePolicyStatus ?? 'Política pendiente'
}

function isProductActive(product: Product) {
  return product.isActive ?? product.active ?? product.status !== 'INACTIVE'
}

const fieldClass =
  'h-11 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 text-sm text-[var(--erp-foreground)] shadow-sm outline-none transition placeholder:text-[var(--erp-muted-foreground)] focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)]'

const tableHeadClass =
  'border-b border-[var(--erp-border)] bg-[var(--erp-surface-muted)] text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]'

const tableCellClass = 'px-4 py-3 align-middle'

export function ProductListPage() {
  const { user } = useAuth()
  const canManage = canManageInventory(user?.role)
  const [filters, setFilters] = useState<ProductFilters>({})
  const [editingProduct, setEditingProduct] = useState<Product | null>()
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null)
  const products = useProducts(filters)
  const locationSelected = Boolean(filters.locationId)

  return (
    <main className="min-h-screen bg-[var(--erp-shell-bg)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] shadow-[0_24px_80px_rgba(16,24,32,0.08)]">
          <div className="grid gap-6 border-b border-[var(--erp-border)] p-5 md:grid-cols-[1.2fr_0.8fr] md:items-end lg:p-6">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(157,45,36,0.18)] bg-[rgba(157,45,36,0.08)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--erp-danger)]">
                <Package className="h-3.5 w-3.5" aria-hidden="true" />
                Libro de inventario
              </div>
              <h1 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-[var(--erp-foreground)] md:text-4xl">
                Productos y stock por ubicación
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--erp-muted-foreground)]">
                La disponibilidad operativa se muestra solo por ubicación. Los productos nunca capturan ni editan stock global.
              </p>
            </div>
            {canManage ? (
              <button
                onClick={() => setEditingProduct(null)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] px-5 text-sm font-semibold text-[var(--erp-on-brand)] shadow-[0_14px_32px_rgba(157,45,36,0.18)] transition hover:bg-[var(--erp-brand-red-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(214,155,45,0.32)]"
              >
                <Package className="h-4 w-4" aria-hidden="true" />
                Nuevo producto
              </button>
            ) : (
              <div className="rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 text-sm font-semibold text-[var(--erp-muted-foreground)]">
                Acceso de solo lectura para SELLER. Los cambios de productos, ajustes y traspasos requieren ADMIN o WAREHOUSE.
              </div>
            )}
          </div>
          <div className="grid gap-3 bg-[var(--erp-surface-muted)]/70 p-4 text-sm text-[var(--erp-muted-foreground)] sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl bg-[var(--erp-surface-elevated)] px-4 py-3">
              <MapPin className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" aria-hidden="true" />
              Stock siempre por ubicación
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[var(--erp-surface-elevated)] px-4 py-3">
              <Boxes className="h-4 w-4 text-[var(--erp-info)]" aria-hidden="true" />
              Catálogo y saldos separados
            </div>
            <div className="flex items-center gap-3 rounded-xl bg-[var(--erp-surface-elevated)] px-4 py-3">
              <ShieldCheck className="h-4 w-4 text-[var(--erp-success)]" aria-hidden="true" />
              Permisos existentes intactos
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-4 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--erp-foreground)]">
                <SlidersHorizontal className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" aria-hidden="true" />
                Filtros operativos
              </h2>
              <p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">Conservan la búsqueda y los filtros existentes.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            <label className="relative md:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--erp-muted-foreground)]" aria-hidden="true" />
              <input className={`${fieldClass} w-full pl-9`} placeholder="Buscar nombre o SKU" onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
            </label>
            <input className={fieldClass} placeholder="ID de categoría" onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })} />
            <select className={fieldClass} onChange={(event) => setFilters({ ...filters, presentationType: event.target.value })}><option value="">Presentación</option><option value="KG">Kilo</option><option value="WHOLE">Entero</option><option value="CUT">Corte</option></select>
            <select className={fieldClass} onChange={(event) => setFilters({ ...filters, unit: event.target.value })}><option value="">Unidad</option><option value="KG">KG</option><option value="PIECE">PIECE</option><option value="KG_AND_PIECE">KG_AND_PIECE</option></select>
            <input className={fieldClass} placeholder="ID de ubicación" onChange={(event) => setFilters({ ...filters, locationId: event.target.value })} />
            <select className={fieldClass} onChange={(event) => setFilters({ ...filters, isActive: event.target.value })}><option value="">Estado</option><option value="true">Activo</option><option value="false">Inactivo</option></select>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 text-sm font-semibold text-[var(--erp-muted-foreground)]">
              <input className="h-4 w-4 accent-[var(--erp-brand-red)]" disabled={!locationSelected} type="checkbox" onChange={(event) => setFilters({ ...filters, lowStock: event.target.checked || undefined })} /> Stock bajo
            </label>
          </div>
        </section>

        <AsyncState empty={!products.data?.length} emptyMessage="No hay productos para estos filtros. Prueba con una ubicación, categoría o SKU." error={products.error} isLoading={products.isLoading}>
          <div className="overflow-hidden rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--erp-border)] px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-[var(--erp-foreground)]">Catálogo operativo</h2>
                <p className="text-xs text-[var(--erp-muted-foreground)]">Tabla compacta para consulta, edición y ajuste autorizado.</p>
              </div>
              <span className="rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
                {products.data?.length ?? 0} registros
              </span>
            </div>
            <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className={tableHeadClass}><tr><th className={tableCellClass}>Nombre</th><th className={tableCellClass}>SKU</th><th className={tableCellClass}>Categoría</th><th className={tableCellClass}>Presentación</th><th className={tableCellClass}>Precio de venta</th><th className={tableCellClass}>Costo</th><th className={tableCellClass}>Unidad</th><th className={tableCellClass}>Equivalencia</th><th className={tableCellClass}>Ubicación</th><th className={tableCellClass}>Kg</th><th className={tableCellClass}>Piezas</th><th className={tableCellClass}>Mínimo</th><th className={tableCellClass}>Stock bajo</th><th className={tableCellClass}>Estado</th><th className={tableCellClass}>Acciones</th></tr></thead>
              <tbody>{products.data?.map((product) => {
                const balance = productBalance(product)
                return (
                  <tr key={product.id} className="border-t border-[var(--erp-border)] align-top transition hover:bg-[var(--erp-surface-muted)]/70"><td className={`${tableCellClass} min-w-52 font-semibold text-[var(--erp-foreground)]`}>{product.name}</td><td className={`${tableCellClass} font-mono text-xs text-[var(--erp-muted-foreground)]`}>{product.sku ?? '—'}</td><td className={tableCellClass}>{categoryName(product)}</td><td className={tableCellClass}>{productPresentation(product)}</td><td className={`${tableCellClass} text-right font-semibold`}>${product.salePrice}</td><td className={`${tableCellClass} text-right text-[var(--erp-muted-foreground)]`}>${productPurchaseCost(product)}</td><td className={tableCellClass}>{productUnit(product)}</td><td className={`${tableCellClass} min-w-44 text-[var(--erp-muted-foreground)]`}>{productEquivalence(product)}</td><td className={tableCellClass}>{balance?.locationName ?? filters.locationId ?? 'Selecciona ubicación'}</td><td className={`${tableCellClass} text-right font-semibold`}>{balance?.quantityKg ?? '—'}</td><td className={`${tableCellClass} text-right font-semibold`}>{balance?.quantityPieces ?? '—'}</td><td className={`${tableCellClass} text-right text-[var(--erp-muted-foreground)]`}>{balance?.minQuantityKg ?? balance?.minimumKg ?? balance?.minQuantityPieces ?? balance?.minimumPieces ?? '—'}</td><td className={tableCellClass}><LowStockBadge isLowStock={balance?.isLowStock} locationSelected={locationSelected} /></td><td className={tableCellClass}><span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${isProductActive(product) ? 'border-[rgba(63,123,65,0.22)] bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]' : 'border-[var(--erp-border)] bg-[var(--erp-surface-muted)] text-[var(--erp-muted-foreground)]'}`}>{isProductActive(product) ? 'Activo' : 'Inactivo'}</span></td><td className={tableCellClass}>{canManage ? <div className="flex flex-wrap gap-2"><button className="inline-flex items-center gap-1 rounded-lg border border-[var(--erp-border)] px-3 py-1.5 text-xs font-semibold text-[var(--erp-danger)] transition hover:bg-[rgba(157,45,36,0.08)]" onClick={() => setEditingProduct(product)}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Editar</button><button className="inline-flex items-center gap-1 rounded-lg border border-[var(--erp-border)] px-3 py-1.5 text-xs font-semibold text-[var(--erp-info)] transition hover:bg-[rgba(47,111,115,0.08)]" onClick={() => setAdjustingProduct(product)}><Settings2 className="h-3.5 w-3.5" aria-hidden="true" />Ajustar</button></div> : <span className="text-[var(--erp-muted-foreground)]">Solo lectura</span>}</td></tr>
                )
              })}</tbody>
            </table>
            </div>
          </div>
        </AsyncState>

        {canManage ? (
          <>
            <InventoryByLocationView locationId={filters.locationId} />
            <InventoryTransferView canManage={canManage} />
            <InventoryMovementsView />
          </>
        ) : (
          <section className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 text-sm text-[var(--erp-muted-foreground)]">
            Los paneles administrativos de inventario están ocultos para sesiones SELLER. Usa la tabla de productos para revisar disponibilidad.
          </section>
        )}
      </section>
      {canManage && editingProduct !== undefined && <ProductFormModal product={editingProduct} onClose={() => setEditingProduct(undefined)} />}
      {canManage && adjustingProduct && <InventoryAdjustmentModal productId={adjustingProduct.id} locationId={filters.locationId} onClose={() => setAdjustingProduct(null)} />}
    </main>
  )
}
