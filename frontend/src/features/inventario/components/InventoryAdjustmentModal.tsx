import { useState, type FormEvent } from 'react'
import { useCreateInventoryAdjustment } from '../hooks/useProducts'
import type { InventoryAdjustmentValues } from '../types'

type Props = { onClose: () => void; productId?: string; locationId?: string }
const fieldClass =
  'rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 py-2.5 text-sm text-[var(--erp-foreground)] shadow-sm outline-none transition placeholder:text-[var(--erp-muted-foreground)] focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)]'
const labelClass = 'grid gap-1.5 text-sm font-semibold text-[var(--erp-foreground)]'

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
    <div className="fixed inset-0 z-20 overflow-y-auto bg-[rgba(16,24,32,0.56)] px-4 py-8 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="mx-auto grid max-w-2xl gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-6 shadow-[0_30px_90px_rgba(16,24,32,0.22)]">
        <header className="flex justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--erp-info)]">Movimiento de inventario</p>
            <h2 className="text-3xl font-bold tracking-[-0.04em] text-[var(--erp-foreground)]">Registrar ajuste</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Cada corrección queda registrada contra una ubicación operativa.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--erp-muted-foreground)] transition hover:bg-[var(--erp-surface-muted)]">Cerrar</button>
        </header>
        {error && <p role="alert" className="rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]">{error}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>ID del producto<input className={fieldClass} value={values.productId} onChange={(event) => setValues({ ...values, productId: event.target.value })} required /></label>
          <label className={labelClass}>ID de ubicación<input className={fieldClass} value={values.locationId} onChange={(event) => setValues({ ...values, locationId: event.target.value })} required /></label>
          <label className={labelClass}>Tipo de movimiento<select className={fieldClass} value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value as InventoryAdjustmentValues['type'] })}><option value="ADJUSTMENT">Ajuste</option><option value="SHRINKAGE">Merma</option><option value="RETURN">Devolución</option><option value="IN">Entrada de stock</option><option value="OUT">Salida de stock</option></select></label>
          <label className={labelClass}>Unidad<select className={fieldClass} value={values.unit} onChange={(event) => setValues({ ...values, unit: event.target.value as InventoryAdjustmentValues['unit'] })}><option value="KG">Kilo</option><option value="PIECE">Pieza</option><option value="KG_AND_PIECE">Kilo y pieza</option></select></label>
          <label className={labelClass}>Kilos<input className={fieldClass} min="0" step="0.001" type="number" value={values.quantityKg ?? 0} onChange={(event) => setValues({ ...values, quantityKg: Number(event.target.value) })} /></label>
          <label className={labelClass}>Piezas<input className={fieldClass} min="0" step="1" type="number" value={values.quantityPieces ?? 0} onChange={(event) => setValues({ ...values, quantityPieces: Number(event.target.value) })} /></label>
        </div>
        <label className={labelClass}>Motivo<textarea className={`${fieldClass} min-h-24`} value={values.reason} onChange={(event) => setValues({ ...values, reason: event.target.value })} required /></label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={labelClass}>Tipo de referencia<input className={fieldClass} value={values.referenceType ?? ''} onChange={(event) => setValues({ ...values, referenceType: event.target.value })} /></label>
          <label className={labelClass}>ID de referencia<input className={fieldClass} value={values.referenceId ?? ''} onChange={(event) => setValues({ ...values, referenceId: event.target.value })} /></label>
        </div>
        <button disabled={createAdjustment.isPending} className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] px-5 text-sm font-semibold text-[var(--erp-on-brand)] shadow-[0_14px_32px_rgba(157,45,36,0.18)] transition hover:bg-[var(--erp-brand-red-strong)] disabled:opacity-60">Crear ajuste</button>
      </form>
    </div>
  )
}
