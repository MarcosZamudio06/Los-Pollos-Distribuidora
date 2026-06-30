import { useState, type FormEvent } from 'react'
import { useCreateInventoryAdjustment } from '../hooks/useProducts'
import type { InventoryAdjustmentValues } from '../types'

type Props = { onClose: () => void; productId?: string; locationId?: string }

const initialReferenceType = 'MANUAL'

export function InventoryAdjustmentModal({ locationId = '', onClose, productId = '' }: Props) {
  const [values, setValues] = useState<InventoryAdjustmentValues>({
    productId,
    locationId,
    type: 'ADJUSTMENT',
    unit: 'KG',
    quantityKg: 0,
    quantityPieces: 0,
    reason: '',
    referenceType: initialReferenceType,
    referenceId: '',
  })
  const [error, setError] = useState<string | null>(null)
  const createAdjustment = useCreateInventoryAdjustment()

  function validate() {
    const quantityKg = values.quantityKg ?? 0
    const quantityPieces = values.quantityPieces ?? 0

    if (!values.productId) return 'El producto es obligatorio.'
    if (!values.locationId) return 'La ubicación operativa es obligatoria.'
    if (quantityKg < 0 || quantityPieces < 0) return 'Las cantidades no pueden ser negativas.'
    if (!Number.isInteger(quantityPieces)) return 'Las piezas deben ser números enteros.'
    if (values.unit === 'KG' && (quantityKg <= 0 || quantityPieces !== 0)) return 'Los ajustes por kilo requieren kilos positivos y cero piezas.'
    if (values.unit === 'PIECE' && (quantityPieces <= 0 || quantityKg !== 0)) return 'Los ajustes por pieza requieren piezas positivas y cero kilos.'
    if (values.unit === 'KG_AND_PIECE' && quantityKg <= 0 && quantityPieces <= 0) return 'Los ajustes por kilo y pieza requieren kilos, piezas o ambos.'
    if (!values.reason.trim()) return 'El motivo es obligatorio.'
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) return setError(validationError)
    try {
      await createAdjustment.mutateAsync({
        ...values,
        reason: values.reason.trim(),
        referenceType: values.referenceType?.trim() || undefined,
        referenceId: values.referenceId?.trim() || undefined,
      })
      onClose()
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No se pudo registrar el ajuste.')
    }
  }

  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-[#20211f]/50 px-4 py-8">
      <form onSubmit={handleSubmit} className="mx-auto grid max-w-2xl gap-4 rounded-[2rem] bg-white p-6 shadow-2xl">
        <header className="flex justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#39798b]">Movimiento de inventario</p>
            <h2 className="text-3xl font-black tracking-[-0.05em]">Registrar ajuste</h2>
            <p className="mt-2 text-sm text-[#68645c]">Cada corrección queda registrada contra una ubicación operativa.</p>
          </div>
          <button type="button" onClick={onClose} className="font-bold text-[#68645c]">Cerrar</button>
        </header>
        {error && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">ID del producto<input className="rounded-xl border p-3" value={values.productId} onChange={(event) => setValues({ ...values, productId: event.target.value })} required /></label>
          <label className="grid gap-1 text-sm font-bold">ID de ubicación<input className="rounded-xl border p-3" value={values.locationId} onChange={(event) => setValues({ ...values, locationId: event.target.value })} required /></label>
          <label className="grid gap-1 text-sm font-bold">Tipo de movimiento<select className="rounded-xl border p-3" value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value as InventoryAdjustmentValues['type'] })}><option value="ADJUSTMENT">Ajuste</option><option value="SHRINKAGE">Merma</option><option value="RETURN">Devolución</option><option value="IN">Entrada de stock</option><option value="OUT">Salida de stock</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Unidad<select className="rounded-xl border p-3" value={values.unit} onChange={(event) => setValues({ ...values, unit: event.target.value as InventoryAdjustmentValues['unit'] })}><option value="KG">Kilo</option><option value="PIECE">Pieza</option><option value="KG_AND_PIECE">Kilo y pieza</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Kilos<input className="rounded-xl border p-3" min="0" step="0.001" type="number" value={values.quantityKg ?? 0} onChange={(event) => setValues({ ...values, quantityKg: Number(event.target.value) })} /></label>
          <label className="grid gap-1 text-sm font-bold">Piezas<input className="rounded-xl border p-3" min="0" step="1" type="number" value={values.quantityPieces ?? 0} onChange={(event) => setValues({ ...values, quantityPieces: Number(event.target.value) })} /></label>
        </div>
        <label className="grid gap-1 text-sm font-bold">Motivo<textarea className="rounded-xl border p-3" value={values.reason} onChange={(event) => setValues({ ...values, reason: event.target.value })} required /></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold">Tipo de referencia<input className="rounded-xl border p-3" value={values.referenceType ?? ''} onChange={(event) => setValues({ ...values, referenceType: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">ID de referencia<input className="rounded-xl border p-3" value={values.referenceId ?? ''} onChange={(event) => setValues({ ...values, referenceId: event.target.value })} /></label>
        </div>
        <button disabled={createAdjustment.isPending} className="rounded-2xl bg-[#20211f] px-5 py-3 font-black text-white disabled:opacity-60">Crear ajuste</button>
      </form>
    </div>
  )
}
