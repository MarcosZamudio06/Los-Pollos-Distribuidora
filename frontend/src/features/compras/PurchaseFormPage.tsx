import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { useProducts } from '../inventario'
import { PurchaseItemsTable } from './PurchaseItemsTable'
import { PurchaseLocationSelector } from './PurchaseLocationSelector'
import { SupplierSelector } from './SupplierSelector'
import { useCreatePurchase } from './hooks'
import type { CreatePurchasePayload, OperationalLocation, PurchaseFormItem, Supplier } from './types'

function validateForm(supplierId: string, locationId: string, items: PurchaseFormItem[]) {
  const errors: string[] = []
  if (!supplierId) errors.push('Proveedor requerido.')
  if (!locationId) errors.push('Ubicación receptora requerida.')
  if (items.length === 0) errors.push('Agrega al menos un producto.')
  items.forEach((item) => {
    if (item.unitCost < 0) errors.push(`${item.productName}: costo mayor o igual a cero requerido.`)
    if (item.quantityKg <= 0 && item.quantityPieces <= 0) errors.push(`${item.productName}: cantidad mayor a cero requerida.`)
    if (item.unit === 'KG_AND_PIECE' && item.quantityKg > 0 && item.quantityPieces > 0 && !item.unitEquivalentId) errors.push(`${item.productName}: selecciona equivalencia oficial para capturar kilos y piezas.`)
    if (item.unit === 'KG' && item.quantityPieces > 0) errors.push(`${item.productName}: un producto por kilo no debe enviar piezas.`)
    if (item.unit === 'PIECE' && item.quantityKg > 0) errors.push(`${item.productName}: un producto por pieza no debe enviar kilos.`)
    if (!Number.isInteger(item.quantityPieces)) errors.push(`${item.productName}: las piezas deben ser enteras.`)
  })
  return errors
}

function buildPayload(supplierId: string, locationId: string, allowCostUpdate: boolean, items: PurchaseFormItem[]): CreatePurchasePayload {
  return {
    allowCostUpdate,
    locationId,
    supplierId,
    items: items.map((item) => ({
      productId: item.productId,
      quantityKg: item.quantityKg,
      quantityPieces: item.quantityPieces,
      unit: item.unit,
      unitCost: item.unitCost,
      ...(item.unitEquivalentId ? { unitEquivalentId: item.unitEquivalentId } : {}),
    })),
  }
}

export function PurchaseFormPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [location, setLocation] = useState<OperationalLocation | null>(null)
  const [allowCostUpdate, setAllowCostUpdate] = useState(false)
  const [items, setItems] = useState<PurchaseFormItem[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)
  const products = useProducts({ isActive: 'true' })
  const createPurchase = useCreatePurchase()
  const errors = useMemo(() => validateForm(supplier?.id ?? '', location?.id ?? '', items), [items, location?.id, supplier?.id])
  const isAdmin = user?.role === 'ADMIN'

  async function submit() {
    setSubmitError(null)
    const validationErrors = validateForm(supplier?.id ?? '', location?.id ?? '', items)
    if (validationErrors.length > 0 || !supplier || !location) return
    try {
      const purchase = await createPurchase.mutateAsync(buildPayload(supplier.id, location.id, allowCostUpdate && isAdmin, items))
      navigate(`/purchases/${purchase.id}`)
    } catch (caught) {
      setSubmitError(caught instanceof Error ? caught.message : 'No se pudo registrar la compra.')
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="rounded-[2rem] border border-[#20211f]/10 bg-[#20211f] p-6 text-white shadow-[0_24px_80px_rgba(32,33,31,0.16)]">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0b44c]">Nueva compra</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">Confirmar entrada al inventario receptor</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/70">Captura proveedor, ubicación operativa e items. El backend confirma la compra, registra movimientos y devuelve saldos actualizados.</p>
          <Link className="mt-5 inline-flex font-black text-[#f0b44c]" to="/purchases">Volver a compras</Link>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <SupplierSelector error={errors.find((error) => error.includes('Proveedor'))} onChange={setSupplier} value={supplier?.id ?? ''} />
          <PurchaseLocationSelector error={errors.find((error) => error.includes('Ubicación'))} onChange={setLocation} value={location?.id ?? ''} />
        </div>

        <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5">
          <label className="flex items-start gap-3 text-sm font-bold text-[#68645c]">
            <input checked={allowCostUpdate && isAdmin} className="mt-1" disabled={!isAdmin} onChange={(event) => setAllowCostUpdate(event.target.checked)} type="checkbox" />
            <span><strong className="block text-[#20211f]">Actualizar costo del producto</strong>Solo ADMIN puede autorizar actualización de costo; WAREHOUSE debe registrar la compra sin modificar catálogo.</span>
          </label>
        </section>

        {products.isLoading && <p className="rounded-2xl bg-[#39798b]/10 p-3 text-sm font-bold text-[#39798b]">Cargando productos...</p>}
        {products.error && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">No se pudieron cargar productos activos.</p>}
        <PurchaseItemsTable errors={errors.filter((error) => !error.includes('Proveedor') && !error.includes('Ubicación'))} items={items} onAddItem={(item) => setItems((current) => [...current, item])} onRemoveItem={(productId) => setItems((current) => current.filter((item) => item.productId !== productId))} onUpdateItem={(productId, patch) => setItems((current) => current.map((item) => item.productId === productId ? { ...item, ...patch } : item))} products={products.data ?? []} />

        {submitError && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-4 text-sm font-bold text-[#9d2d24]">{submitError}</p>}
        <div className="flex justify-end gap-3">
          <Link className="rounded-2xl border border-[#20211f]/15 px-5 py-3 font-black" to="/purchases">Cancelar captura</Link>
          <button className="rounded-2xl bg-[#9d2d24] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={createPurchase.isPending || errors.length > 0} onClick={submit} type="button">Registrar compra</button>
        </div>
      </section>
    </main>
  )
}
