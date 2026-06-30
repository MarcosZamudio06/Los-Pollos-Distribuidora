import { useState } from 'react'
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

export function ProductListPage() {
  const { user } = useAuth()
  const canManage = canManageInventory(user?.role)
  const [filters, setFilters] = useState<ProductFilters>({})
  const [editingProduct, setEditingProduct] = useState<Product | null>()
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null)
  const products = useProducts(filters)
  const locationSelected = Boolean(filters.locationId)

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-8">
        <header className="overflow-hidden rounded-[2rem] border border-[#20211f]/10 bg-white shadow-[0_24px_80px_rgba(32,33,31,0.08)]">
          <div className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#9d2d24]">Libro de inventario</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">Productos y stock por ubicación</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#68645c]">La disponibilidad operativa se muestra solo por ubicación. Los productos nunca capturan ni editan stock global.</p>
            </div>
            {canManage ? (
              <button onClick={() => setEditingProduct(null)} className="rounded-2xl bg-[#20211f] px-5 py-3 font-black text-white">Nuevo producto</button>
            ) : (
              <div className="rounded-2xl border border-[#20211f]/10 bg-[#f5f3ee] p-4 text-sm font-bold text-[#68645c]">Acceso de solo lectura para SELLER. Los cambios de productos, ajustes y traspasos requieren ADMIN o WAREHOUSE.</div>
            )}
          </div>
        </header>

        <section className="grid gap-3 rounded-[1.75rem] border border-[#20211f]/10 bg-white p-4 md:grid-cols-7">
          <input className="rounded-xl border p-3 md:col-span-2" placeholder="Buscar nombre o SKU" onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <input className="rounded-xl border p-3" placeholder="ID de categoría" onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })} />
          <select className="rounded-xl border p-3" onChange={(event) => setFilters({ ...filters, presentationType: event.target.value })}><option value="">Presentación</option><option value="KG">Kilo</option><option value="WHOLE">Entero</option><option value="CUT">Corte</option></select>
          <select className="rounded-xl border p-3" onChange={(event) => setFilters({ ...filters, unit: event.target.value })}><option value="">Unidad</option><option value="KG">KG</option><option value="PIECE">PIECE</option><option value="KG_AND_PIECE">KG_AND_PIECE</option></select>
          <input className="rounded-xl border p-3" placeholder="ID de ubicación" onChange={(event) => setFilters({ ...filters, locationId: event.target.value })} />
          <select className="rounded-xl border p-3" onChange={(event) => setFilters({ ...filters, isActive: event.target.value })}><option value="">Estado</option><option value="true">Activo</option><option value="false">Inactivo</option></select>
          <label className="flex items-center gap-2 text-sm font-bold text-[#68645c]"><input disabled={!locationSelected} type="checkbox" onChange={(event) => setFilters({ ...filters, lowStock: event.target.checked || undefined })} /> Stock bajo</label>
        </section>

        <AsyncState empty={!products.data?.length} emptyMessage="No hay productos para estos filtros. Prueba con una ubicación, categoría o SKU." error={products.error} isLoading={products.isLoading}>
          <div className="overflow-x-auto rounded-[1.75rem] border border-[#20211f]/10 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#20211f] text-xs uppercase tracking-[0.16em] text-white"><tr><th className="p-4">Nombre</th><th className="p-4">SKU</th><th className="p-4">Categoría</th><th className="p-4">Presentación</th><th className="p-4">Precio de venta</th><th className="p-4">Costo</th><th className="p-4">Unidad</th><th className="p-4">Equivalencia</th><th className="p-4">Ubicación</th><th className="p-4">Kg</th><th className="p-4">Piezas</th><th className="p-4">Mínimo</th><th className="p-4">Stock bajo</th><th className="p-4">Estado</th><th className="p-4">Acciones</th></tr></thead>
              <tbody>{products.data?.map((product) => {
                const balance = productBalance(product)
                return (
                  <tr key={product.id} className="border-t align-top"><td className="p-4 font-black">{product.name}</td><td className="p-4">{product.sku ?? '—'}</td><td className="p-4">{categoryName(product)}</td><td className="p-4">{productPresentation(product)}</td><td className="p-4">${product.salePrice}</td><td className="p-4">${productPurchaseCost(product)}</td><td className="p-4">{productUnit(product)}</td><td className="p-4">{productEquivalence(product)}</td><td className="p-4">{balance?.locationName ?? filters.locationId ?? 'Selecciona ubicación'}</td><td className="p-4">{balance?.quantityKg ?? '—'}</td><td className="p-4">{balance?.quantityPieces ?? '—'}</td><td className="p-4">{balance?.minQuantityKg ?? balance?.minimumKg ?? balance?.minQuantityPieces ?? balance?.minimumPieces ?? '—'}</td><td className="p-4"><LowStockBadge isLowStock={balance?.isLowStock} locationSelected={locationSelected} /></td><td className="p-4">{isProductActive(product) ? 'Activo' : 'Inactivo'}</td><td className="p-4">{canManage ? <div className="flex gap-3"><button className="font-bold text-[#9d2d24]" onClick={() => setEditingProduct(product)}>Editar</button><button className="font-bold text-[#39798b]" onClick={() => setAdjustingProduct(product)}>Ajustar</button></div> : <span className="text-[#68645c]">Solo lectura</span>}</td></tr>
                )
              })}</tbody>
            </table>
          </div>
        </AsyncState>

        {canManage ? (
          <>
            <InventoryByLocationView locationId={filters.locationId} />
            <InventoryTransferView canManage={canManage} />
            <InventoryMovementsView />
          </>
        ) : (
          <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 text-sm text-[#68645c]">Los paneles administrativos de inventario están ocultos para sesiones SELLER. Usa la tabla de productos para revisar disponibilidad.</section>
        )}
      </section>
      {canManage && editingProduct !== undefined && <ProductFormModal product={editingProduct} onClose={() => setEditingProduct(undefined)} />}
      {canManage && adjustingProduct && <InventoryAdjustmentModal productId={adjustingProduct.id} locationId={filters.locationId} onClose={() => setAdjustingProduct(null)} />}
    </main>
  )
}
