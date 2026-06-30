import { useState, type FormEvent } from 'react'
import { useSaveProduct } from '../hooks/useProducts'
import type { EquivalentPolicyStatus, Product, ProductFormValues } from '../types'

type Props = { product?: Product | null; onClose: () => void }

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
    <div className="fixed inset-0 z-20 overflow-y-auto bg-[#20211f]/50 px-4 py-8">
      <form onSubmit={handleSubmit} className="mx-auto grid max-w-3xl gap-4 rounded-[2rem] bg-white p-6 shadow-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#9d2d24]">Catálogo de productos</p>
            <h2 className="text-3xl font-black tracking-[-0.05em]">{product ? 'Editar producto' : 'Nuevo producto'}</h2>
            <p className="mt-2 text-sm text-[#68645c]">Solo campos de catálogo. El stock se controla mediante movimientos por ubicación.</p>
          </div>
          <button type="button" onClick={onClose} className="font-bold text-[#68645c]">Cerrar</button>
        </header>
        {error && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
        <label className="grid gap-1 text-sm font-bold">Nombre<input className="rounded-xl border p-3" value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required /></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">SKU<input className="rounded-xl border p-3" value={values.sku} onChange={(event) => setValues({ ...values, sku: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">ID de categoría<input className="rounded-xl border p-3" value={values.categoryId} onChange={(event) => setValues({ ...values, categoryId: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Precio de venta<input className="rounded-xl border p-3" min="0.01" step="0.01" type="number" value={values.salePrice} onChange={(event) => setValues({ ...values, salePrice: Number(event.target.value) })} required /></label>
          <label className="grid gap-1 text-sm font-bold">Costo de compra<input className="rounded-xl border p-3" min="0" step="0.01" type="number" value={values.purchaseCost} onChange={(event) => setValues({ ...values, purchaseCost: Number(event.target.value) })} /></label>
          <label className="grid gap-1 text-sm font-bold">Presentación<select className="rounded-xl border p-3" value={values.presentationType} onChange={(event) => setValues({ ...values, presentationType: event.target.value as ProductFormValues['presentationType'] })}><option value="KG">Kilo</option><option value="WHOLE">Unidad entera</option><option value="CUT">Corte</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Unidad operativa<select className="rounded-xl border p-3" value={values.unit} onChange={(event) => setValues({ ...values, unit: event.target.value as ProductFormValues['unit'] })}><option value="KG">Kilo</option><option value="PIECE">Pieza</option><option value="KG_AND_PIECE">Kilo y pieza</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Mínimo comercial<input className="rounded-xl border p-3" min="0" step="0.01" type="number" value={values.minStock} onChange={(event) => setValues({ ...values, minStock: Number(event.target.value) })} /></label>
          <label className="grid gap-1 text-sm font-bold">Equivalencia kg por pieza<input className="rounded-xl border p-3" min="0" step="0.001" type="number" value={values.pieceWeightEquivalent ?? ''} onChange={(event) => setValues({ ...values, pieceWeightEquivalent: event.target.value ? Number(event.target.value) : null })} /></label>
          <label className="grid gap-1 text-sm font-bold">Política de equivalencia<select className="rounded-xl border p-3" value={values.equivalentPolicyStatus ?? 'DRAFT'} onChange={(event) => setValues({ ...values, equivalentPolicyStatus: event.target.value as ProductFormValues['equivalentPolicyStatus'] })}><option value="DRAFT">Borrador</option><option value="ACTIVE">Activo</option><option value="INACTIVE">Inactivo</option></select></label>
        </div>
        {values.unit === 'KG_AND_PIECE' && <p className="rounded-2xl bg-[#f0b44c]/20 p-3 text-sm text-[#6b4a10]">La equivalencia oficial se gestiona en el flujo autorizado de equivalencias; este formulario no modifica saldos operativos.</p>}
        <label className="grid gap-1 text-sm font-bold">Descripción<textarea className="rounded-xl border p-3" value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label>
        <button disabled={saveProduct.isPending} className="rounded-2xl bg-[#20211f] px-5 py-3 font-black text-white disabled:opacity-60">Guardar producto</button>
      </form>
    </div>
  )
}
