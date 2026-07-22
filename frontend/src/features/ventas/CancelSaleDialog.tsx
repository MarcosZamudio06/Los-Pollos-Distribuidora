import { useState } from 'react'
import { ApiClientError } from '../../lib/api'
import { useCancelSale } from './hooks'
import type { SaleDetail } from './types'

type CancelSaleDialogProps = {
  onClose: () => void
  sale: SaleDetail
}

function getExpectedVersion(sale: SaleDetail) {
  return typeof sale.version === 'number' ? sale.version : undefined
}

export function CancelSaleDialog({ onClose, sale }: CancelSaleDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const cancelSale = useCancelSale(sale.id)
  const expectedVersion = getExpectedVersion(sale)
  const canSubmit = reason.trim().length > 0 && expectedVersion !== undefined && Number.isInteger(expectedVersion) && expectedVersion >= 0 && sale.status !== 'CANCELLED'

  async function handleCancelSale() {
    if (!canSubmit || expectedVersion === undefined) return
    setError(null)
    try {
      await cancelSale.mutateAsync({ idempotencyKey, payload: { expectedVersion, reason: reason.trim() } })
      onClose()
    } catch (caughtError) {
      setError(caughtError instanceof ApiClientError || caughtError instanceof Error ? caughtError.message : 'No se pudo cancelar la venta.')
    }
  }

  return (
    <aside className="fixed inset-0 z-50 grid place-items-center bg-[#20211f]/65 p-4">
      <section aria-modal="true" className="w-full max-w-xl rounded-[2rem] border border-[#d43f2f]/20 bg-white p-6 text-[#20211f] shadow-2xl" role="dialog">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d2d24]">Cancelación auditada</p>
        <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Cancelar venta {sale.saleNumber ?? sale.id}</h2>
        <p className="mt-3 text-sm leading-6 text-[#68645c]">
          La cancelación revierte efectos operativos cuando el backend lo permite. Si existen pagos aplicados, cierre de caja cerrado o liquidación cerrada, la API debe bloquear la operación.
        </p>
        {getExpectedVersion(sale) === undefined && (
          <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">
            No se puede cancelar desde esta pantalla porque el detalle recibido no incluye la versión de concurrencia requerida por la API. Actualiza la venta o solicita soporte operativo.
          </p>
        )}
        <label className="mt-5 grid gap-2 text-sm font-bold text-[#68645c]">
          Motivo de cancelación
          <textarea
            className="min-h-28 rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej. Cliente canceló el pedido antes de entregar."
            value={reason}
          />
        </label>
        {error && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button className="rounded-2xl border border-[#20211f]/15 px-5 py-3 font-bold" onClick={onClose} type="button">Cerrar sin cancelar</button>
          <button
            className="rounded-2xl bg-[#9d2d24] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-[#68645c]/40"
            disabled={!canSubmit || cancelSale.isPending}
            onClick={() => void handleCancelSale()}
            type="button"
          >
            {cancelSale.isPending ? 'Cancelando venta...' : 'Confirmar cancelación'}
          </button>
        </div>
      </section>
    </aside>
  )
}
