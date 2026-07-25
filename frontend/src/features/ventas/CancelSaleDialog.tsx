import { useState } from 'react'
import { AlertTriangle, FileText, LoaderCircle, PackageCheck, ShieldCheck, WalletCards } from 'lucide-react'
import { ApiClientError } from '../../lib/api'
import { useAuth } from '../auth'
import { useSaleVoidPreview, useVoidSale } from './hooks'
import { documentTypeLabel, money, paymentMethodLabel } from './saleLabels'
import type { SaleDetail } from './types'

type CancelSaleDialogProps = {
  onClose: () => void
  sale: SaleDetail
}

function getExpectedVersion(sale: SaleDetail) {
  return typeof sale.version === 'number' ? sale.version : undefined
}

function quantityLabel(quantityKg?: number | string | null, quantityPieces?: number | null) {
  const values: string[] = []
  if (Number(quantityKg ?? 0) > 0) values.push(`${quantityKg} kg`)
  if (Number(quantityPieces ?? 0) > 0) values.push(`${quantityPieces} pieza(s)`)
  return values.join(' · ') || 'Sin cantidad'
}

export function CancelSaleDialog({ onClose, sale }: CancelSaleDialogProps) {
  const { user } = useAuth()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const preview = useSaleVoidPreview(sale.id)
  const voidSale = useVoidSale(sale.id)
  const expectedVersion = preview.data?.sale.version ?? getExpectedVersion(sale)
  const canSubmit = reason.trim().length > 0 && preview.data?.canExecute === true && expectedVersion !== undefined && Number.isInteger(expectedVersion) && expectedVersion >= 0

  async function handleVoidSale() {
    if (!canSubmit || expectedVersion === undefined) return
    setError(null)
    try {
      await voidSale.mutateAsync({ idempotencyKey, payload: { expectedVersion, reason: reason.trim() } })
      onClose()
    } catch (caughtError) {
      setError(caughtError instanceof ApiClientError || caughtError instanceof Error ? caughtError.message : 'No se pudo anular la venta.')
    }
  }

  const previewData = preview.data

  return (
    <aside className="fixed inset-0 z-50 grid place-items-center bg-[#20211f]/65 p-4">
      <section aria-modal="true" className="max-h-[min(92vh,900px)] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-[#d43f2f]/20 bg-white p-6 text-[#20211f] shadow-2xl sm:p-7" role="dialog">
        <div className="flex items-start gap-4">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#d43f2f]/10 text-[#9d2d24]"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d2d24]">Operación administrativa</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-0.05em]">Anular venta {sale.saleNumber ?? sale.id}</h2>
            <p className="mt-3 text-sm leading-6 text-[#68645c]">Esta operación revierte el cobro, restaura el inventario, actualiza la cartera y cancela los documentos internos en una sola transacción.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl border border-[#20211f]/10 bg-[#f6f4ee] p-4 text-sm">
          <p><span className="font-black">Usuario autorizador:</span> {user?.name ?? previewData?.authorization.authorizedBy.name ?? user?.id ?? 'Usuario administrativo'} ({user?.role ?? previewData?.authorization.authorizedBy.role ?? 'ADMIN'})</p>
          <p><span className="font-black">Versión operativa:</span> {expectedVersion ?? 'No disponible'}</p>
        </div>

        {preview.isLoading && <p className="mt-5 flex items-center gap-2 rounded-2xl border border-[#2f6f73]/20 bg-[#2f6f73]/8 p-4 text-sm font-bold text-[#2f6f73]"><LoaderCircle className="h-4 w-4 animate-spin" />Calculando impacto de la anulación...</p>}
        {preview.error && <p role="alert" className="mt-5 rounded-2xl bg-[#d43f2f]/10 p-4 text-sm font-bold text-[#9d2d24]">No se pudo consultar el impacto de la anulación. Actualiza la venta e inténtalo nuevamente.</p>}

        {previewData && (
          <div className="mt-5 grid gap-4">
            {previewData.blockers.length > 0 && <div className="rounded-2xl border border-[#d43f2f]/25 bg-[#d43f2f]/8 p-4 text-sm text-[#9d2d24]" role="alert">
              <p className="flex items-center gap-2 font-black"><AlertTriangle className="h-4 w-4" />La operación requiere atención antes de confirmar</p>
              <ul className="mt-2 grid gap-1.5 pl-5 list-disc">{previewData.blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul>
            </div>}

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-2xl border border-[#20211f]/10 bg-[#fbfaf7] p-4">
                <h3 className="flex items-center gap-2 text-sm font-black"><WalletCards className="h-4 w-4 text-[#9d2d24]" />Pago que será revertido</h3>
                {previewData.payments.length ? <div className="mt-3 grid gap-2">{previewData.payments.map((payment) => <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm" key={payment.id}><span>{paymentMethodLabel(payment.paymentMethod)}<small className="mt-1 block text-xs text-[#68645c]">{payment.id}</small></span><strong>{money(payment.amount)}</strong></div>)}</div> : <p className="mt-3 text-sm text-[#68645c]">No hay pagos pendientes de reversa.</p>}
              </section>

              <section className="rounded-2xl border border-[#20211f]/10 bg-[#fbfaf7] p-4">
                <h3 className="flex items-center gap-2 text-sm font-black"><PackageCheck className="h-4 w-4 text-[#2f6f73]" />Inventario que será restaurado</h3>
                {previewData.inventory.length ? <div className="mt-3 grid gap-2">{previewData.inventory.map((item) => <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm" key={`${item.productId}-${item.quantityKg}-${item.quantityPieces}`}><span>{item.productName ?? item.productId}<small className="mt-1 block text-xs text-[#68645c]">{item.locationId}</small></span><strong>{quantityLabel(item.quantityKg, item.quantityPieces)}</strong></div>)}</div> : <p className="mt-3 text-sm text-[#68645c]">La venta no tiene partidas de inventario.</p>}
              </section>
            </div>

            <section className="rounded-2xl border border-[#20211f]/10 bg-[#fbfaf7] p-4">
              <h3 className="flex items-center gap-2 text-sm font-black"><WalletCards className="h-4 w-4 text-[#a56d12]" />Cuenta por cobrar afectada</h3>
              {previewData.accountReceivable ? <p className="mt-3 rounded-xl bg-white p-3 text-sm"><span className="font-black">{previewData.accountReceivable.id}</span><span className="ml-3">Saldo actual {money(previewData.accountReceivable.outstandingAmount)}</span><span className="ml-3 text-[#68645c]">La cuenta quedará cancelada.</span></p> : <p className="mt-3 text-sm text-[#68645c]">No hay cuenta por cobrar relacionada.</p>}
            </section>

            <section className="rounded-2xl border border-[#20211f]/10 bg-[#fbfaf7] p-4">
              <h3 className="flex items-center gap-2 text-sm font-black"><FileText className="h-4 w-4 text-[#a56d12]" />Documentos que quedarán cancelados</h3>
              {previewData.documents.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{previewData.documents.map((document) => <div className="rounded-xl bg-white p-3 text-sm" key={document.id}><p className="font-black">{documentTypeLabel(document.documentType)}</p><p className="mt-1 text-xs text-[#68645c]">Folio {document.physicalFolio ?? '—'} · {document.willCancel ? 'Se cancelará' : 'Ya cancelado'}</p></div>)}</div> : <p className="mt-3 text-sm text-[#68645c]">No hay documentos internos relacionados.</p>}
              {previewData.billingRequest && <p className="mt-3 rounded-xl border border-[#a56d12]/20 bg-[#a56d12]/8 p-3 text-xs font-bold text-[#7a5312]">La solicitud administrativa {previewData.billingRequest.id} {previewData.billingRequest.willCancel ? 'también se cancelará.' : `conservará su estado histórico ${previewData.billingRequest.status ?? 'actual'}.`}</p>}
            </section>
          </div>
        )}

        <label className="mt-5 grid gap-2 text-sm font-bold text-[#68645c]">
          Motivo de autorización
          <textarea className="min-h-24 rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setReason(event.target.value)} placeholder="Ej. Cliente devolvió el pedido y se verificó el efectivo." value={reason} />
        </label>
        {getExpectedVersion(sale) === undefined && !previewData?.sale.version && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">No se encontró la versión de concurrencia requerida para confirmar la anulación.</p>}
        {error && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button className="rounded-2xl border border-[#20211f]/15 px-5 py-3 font-bold" onClick={onClose} type="button">Cerrar sin anular</button>
          <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#9d2d24] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-[#68645c]/40" disabled={!canSubmit || voidSale.isPending} onClick={() => void handleVoidSale()} type="button">
            {voidSale.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
            {voidSale.isPending ? 'Anulando venta...' : 'Confirmar anulación'}
          </button>
        </div>
      </section>
    </aside>
  )
}
