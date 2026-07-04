import { useState } from 'react'
import { useCancelPurchase } from './hooks'
import { dateTime, money, purchaseStatusLabel } from './purchaseLabels'
import type { PurchaseDetail } from './types'

type CancelPurchaseDialogProps = {
  onClose: () => void
  purchase: PurchaseDetail
}

export function CancelPurchaseDialog({ onClose, purchase }: CancelPurchaseDialogProps) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const cancelPurchase = useCancelPurchase(purchase.id)
  const isDisabled = purchase.status === 'CANCELLED' || reason.trim().length < 5 || cancelPurchase.isPending

  async function submit() {
    setError(null)
    try {
      await cancelPurchase.mutateAsync({ reason: reason.trim() })
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo cancelar la compra.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#20211f]/55 px-4 py-6">
      <section className="w-full max-w-xl rounded-[2rem] bg-white p-6 text-[#20211f] shadow-[0_30px_120px_rgba(32,33,31,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d2d24]">Cancelación de compra</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.06em]">Reversar entrada de inventario</h2>
          </div>
          <button className="rounded-full border border-[#20211f]/15 px-3 py-1 font-black" onClick={onClose} type="button">×</button>
        </div>
        <div className="mt-5 rounded-2xl bg-[#f5f3ee] p-4 text-sm text-[#68645c]">
          <p><strong className="text-[#20211f]">Compra:</strong> {purchase.purchaseNumber ?? purchase.id}</p>
          <p><strong className="text-[#20211f]">Estado:</strong> {purchaseStatusLabel(purchase.status)}</p>
          <p><strong className="text-[#20211f]">Total:</strong> {money(purchase.total)} · {dateTime(purchase.createdAt)}</p>
          <p className="mt-3 font-bold text-[#9d2d24]">El backend rechazará la reversa si deja inventario negativo en la ubicación receptora.</p>
        </div>
        <label className="mt-5 grid gap-2 text-sm font-bold text-[#68645c]">
          Motivo obligatorio
          <textarea className="min-h-28 rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/35" onChange={(event) => setReason(event.target.value)} placeholder="Describe el error de captura o la razón operativa." value={reason} />
        </label>
        {purchase.status === 'CANCELLED' && <p role="alert" className="mt-3 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">Esta compra ya está cancelada.</p>}
        {error && <p role="alert" className="mt-3 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button className="rounded-2xl border border-[#20211f]/15 px-5 py-3 font-black" onClick={onClose} type="button">Cerrar</button>
          <button className="rounded-2xl bg-[#9d2d24] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={isDisabled} onClick={submit} type="button">Confirmar cancelación</button>
        </div>
      </section>
    </div>
  )
}
