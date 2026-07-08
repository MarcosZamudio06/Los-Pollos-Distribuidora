import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ClipboardList, PackagePlus, ShieldCheck } from 'lucide-react'
import { Button, Card } from '@/components/ui'
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
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-5">
        <header className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-[var(--erp-charcoal)] p-6 text-white shadow-[0_24px_80px_rgba(17,24,21,0.18)] sm:p-7">
          <div className="absolute right-0 top-0 h-36 w-36 rounded-bl-full bg-[rgba(214,155,45,0.16)]" />
          <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-soft)]">
                <PackagePlus className="h-4 w-4" />
                Nueva compra
              </div>
              <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Confirmar entrada al inventario receptor</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">Captura proveedor, ubicación operativa e items. La confirmación, movimientos y saldos siguen controlados por el backend actual.</p>
            </div>
            <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-5 text-sm font-black text-[var(--erp-brand-gold-soft)] transition hover:bg-white/12 focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]" to="/purchases">
              <ArrowLeft className="h-4 w-4" />
              Volver a compras
            </Link>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><ShieldCheck className="h-4 w-4 text-[var(--erp-info)]" />Permiso de costo</p><p className="mt-3 text-lg font-black">{isAdmin ? 'ADMIN autorizado' : 'Sin actualización de costo'}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Se respeta el RBAC existente.</p></Card>
          <Card className="p-5"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><ClipboardList className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Productos</p><p className="mt-3 text-2xl font-black tabular-nums">{items.length}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Partidas en captura</p></Card>
          <Card className="p-5"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><CheckCircle2 className="h-4 w-4 text-[var(--erp-success)]" />Validación</p><p className="mt-3 text-lg font-black">{errors.length === 0 ? 'Lista para registrar' : `${errors.length} pendiente(s)`}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Sin cambiar reglas de validación.</p></Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <SupplierSelector error={errors.find((error) => error.includes('Proveedor'))} onChange={setSupplier} value={supplier?.id ?? ''} />
          <PurchaseLocationSelector error={errors.find((error) => error.includes('Ubicación'))} onChange={setLocation} value={location?.id ?? ''} />
        </div>

        <Card className="p-5">
          <label className="flex items-start gap-3 text-sm font-semibold text-[var(--erp-muted-foreground)]">
            <input checked={allowCostUpdate && isAdmin} className="mt-1 h-4 w-4 rounded border-[color:var(--erp-border)] accent-[var(--erp-brand-red)]" disabled={!isAdmin} onChange={(event) => setAllowCostUpdate(event.target.checked)} type="checkbox" />
            <span><strong className="block text-[var(--erp-foreground)]">Actualizar costo del producto</strong>Solo ADMIN puede autorizar actualización de costo; WAREHOUSE debe registrar la compra sin modificar catálogo.</span>
          </label>
        </Card>

        {products.isLoading && <p className="rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-4 text-sm font-bold text-[var(--erp-info)]">Cargando productos...</p>}
        {products.error && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">No se pudieron cargar productos activos.</p>}
        <PurchaseItemsTable errors={errors.filter((error) => !error.includes('Proveedor') && !error.includes('Ubicación'))} items={items} onAddItem={(item) => setItems((current) => [...current, item])} onRemoveItem={(productId) => setItems((current) => current.filter((item) => item.productId !== productId))} onUpdateItem={(productId, patch) => setItems((current) => current.map((item) => item.productId === productId ? { ...item, ...patch } : item))} products={products.data ?? []} />

        {submitError && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">{submitError}</p>}
        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-[color:var(--erp-border)] bg-white/90 p-3 shadow-[var(--erp-shadow-elevated)] backdrop-blur sm:flex-row sm:justify-end">
          <Link className="inline-flex h-11 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-white px-5 text-sm font-black transition hover:border-[var(--erp-brand-gold)]" to="/purchases">Cancelar captura</Link>
          <Button className="h-11" disabled={createPurchase.isPending || errors.length > 0} onClick={submit} type="button">Registrar compra</Button>
        </div>
      </section>
    </main>
  )
}
