import { useState, type FormEvent } from 'react'
import { useSaveProduct } from '../hooks/useProducts'
import type { EquivalentPolicyStatus, Product, ProductFormValues } from '../types'

type Props = { product?: Product | null; onClose: () => void }
const fieldClass =
  'rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 py-2.5 text-sm text-[var(--erp-foreground)] shadow-sm outline-none transition placeholder:text-[var(--erp-muted-foreground)] focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)]'
const labelClass = 'grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]'

function equivalentPolicyStatus(product?: Product | null): EquivalentPolicyStatus | null {
  const value = product?.equivalentPolicyStatus ?? product?.equivalencePolicyStatus ?? 'DRAFT'
  return value === 'ACTIVE' || value === 'INACTIVE' || value === 'DRAFT' ? value : 'DRAFT'
}

function toValues(product?: Product | null): ProductFormValues {
  return {
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    description: product?.description ?? '',
    categoryId: product?.categoryId ?? '',
    presentationType: product?.presentationType ?? product?.presentation ?? 'KG',
    salePrice: product?.salePrice ?? 0,
    purchaseCost: product?.purchaseCost ?? product?.cost ?? 0,
    minStock: product?.minStock ?? 0,
    unit: product?.unit ?? product?.operationalUnit ?? 'KG',
    pieceWeightEquivalent: product?.pieceWeightEquivalent ?? product?.equivalentWeightKg ?? null,
    equivalentPolicyStatus: equivalentPolicyStatus(product),
  }
}

export function ProductFormModal({ product, onClose }: Props) {
  const [values, setValues] = useState<ProductFormValues>(() => toValues(product))
  const [error, setError] = useState<string | null>(null)
  const saveProduct = useSaveProduct(product?.id)

  function validate() {
    if (!values.name.trim()) return 'El nombre del producto es obligatorio.'
    if (values.salePrice <= 0) return 'El precio de venta debe ser mayor que cero.'
    if (values.purchaseCost < 0) return 'El costo de compra no puede ser negativo.'
    if (!values.unit) return 'La unidad operativa es obligatoria.'
    if (values.pieceWeightEquivalent !== null && values.pieceWeightEquivalent !== undefined && values.pieceWeightEquivalent <= 0) {
      return 'La equivalencia de kg por pieza debe ser mayor que cero cuando se captura.'
    }
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    try {
      await saveProduct.mutateAsync({
        ...values,
        sku: values.sku.trim(),
        description: values.description.trim(),
        categoryId: values.categoryId.trim(),
      })
      onClose()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No se pudo guardar el producto.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(16,24,32,0.56)] px-4 py-8 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="mx-auto grid max-w-3xl gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-6 shadow-[0_30px_90px_rgba(16,24,32,0.22)]">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--erp-danger)]">Catálogo de productos</p>
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-[var(--erp-foreground)]">{product ? 'Editar producto' : 'Nuevo producto'}</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Solo campos de catálogo. El stock se controla mediante movimientos por ubicación.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--erp-muted-foreground)] transition hover:bg-[var(--erp-surface-muted)]">Cerrar</button>
        </header>
        {error && <p role="alert" className="rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]">{error}</p>}
        <label className={labelClass}>Nombre<input className={fieldClass} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required /></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>SKU<input className={fieldClass} value={values.sku} onChange={(event) => setValues({ ...values, sku: event.target.value })} /></label>
          <label className={labelClass}>ID de categoría<input className={fieldClass} value={values.categoryId} onChange={(event) => setValues({ ...values, categoryId: event.target.value })} /></label>
          <label className={labelClass}>Precio de venta<input className={fieldClass} min="0.01" step="0.01" type="number" value={values.salePrice} onChange={(event) => setValues({ ...values, salePrice: Number(event.target.value) })} required /></label>
          <label className={labelClass}>Costo de compra<input className={fieldClass} min="0" step="0.01" type="number" value={values.purchaseCost} onChange={(event) => setValues({ ...values, purchaseCost: Number(event.target.value) })} /></label>
          <label className={labelClass}>Presentación<select className={fieldClass} value={values.presentationType} onChange={(event) => setValues({ ...values, presentationType: event.target.value as ProductFormValues['presentationType'] })}><option value="KG">Kilo</option><option value="WHOLE">Unidad entera</option><option value="CUT">Corte</option></select></label>
          <label className={labelClass}>Unidad operativa<select className={fieldClass} value={values.unit} onChange={(event) => setValues({ ...values, unit: event.target.value as ProductFormValues['unit'] })}><option value="KG">Kilo</option><option value="PIECE">Pieza</option><option value="KG_AND_PIECE">Kilo y pieza</option></select></label>
          <label className={labelClass}>Mínimo comercial<input className={fieldClass} min="0" step="0.01" type="number" value={values.minStock} onChange={(event) => setValues({ ...values, minStock: Number(event.target.value) })} /></label>
          <label className={labelClass}>Equivalencia kg por pieza<input className={fieldClass} min="0" step="0.001" type="number" value={values.pieceWeightEquivalent ?? ''} onChange={(event) => setValues({ ...values, pieceWeightEquivalent: event.target.value ? Number(event.target.value) : null })} /></label>
          <label className={labelClass}>Política de equivalencia<select className={fieldClass} value={values.equivalentPolicyStatus ?? 'DRAFT'} onChange={(event) => setValues({ ...values, equivalentPolicyStatus: event.target.value as ProductFormValues['equivalentPolicyStatus'] })}><option value="DRAFT">Borrador</option><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label>
        </div>
        {values.unit === 'KG_AND_PIECE' && <p className="rounded-xl border border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] p-3 text-sm text-[var(--erp-brand-gold-deep)]">La equivalencia oficial se gestiona en el flujo autorizado de equivalencias; este formulario no modifica saldos operativos.</p>}
        <label className={labelClass}>Descripción<textarea className={`${fieldClass} min-h-24`} value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label>
        <button disabled={saveProduct.isPending} className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] px-5 text-sm font-semibold text-[var(--erp-on-brand)] shadow-[0_14px_32px_rgba(157,45,36,0.18)] transition hover:bg-[var(--erp-brand-red-strong)] disabled:opacity-60">Guardar producto</button>
      </form>
    </div>
  )
}
