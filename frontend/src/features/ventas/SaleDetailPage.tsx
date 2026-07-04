import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { TicketModal } from './components'
import { CancelSaleDialog } from './CancelSaleDialog'
import { useSale, useSaleDocuments, useSaleTicket } from './hooks'
import { collectionStatusLabel, dateTime, documentTypeLabel, money, paymentMethodLabel, paymentTypeLabel, saleChannelLabel, saleStatusLabel } from './saleLabels'
import type { SaleDetail, SaleDocument, TicketData } from './types'

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-[#f5f3ee] p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-[#68645c]">{label}</dt><dd className="mt-1 font-bold text-[#20211f]">{value}</dd></div>
}

type SaleDetailAsyncState<T> = {
  data?: T | null
  error: unknown
  isLoading: boolean
}

type SaleDetailViewProps = {
  canCancel: boolean
  documents: SaleDetailAsyncState<{ items?: SaleDocument[] }>
  onCloseCancelDialog: () => void
  onCloseTicket: () => void
  onShowCancelDialog: () => void
  onShowTicket: () => void
  sale: SaleDetailAsyncState<SaleDetail>
  saleId?: string
  showCancelDialog: boolean
  showTicket: boolean
  ticket: SaleDetailAsyncState<TicketData>
}

export function SaleDetailPage() {
  const { saleId } = useParams()
  const { user } = useAuth()
  const sale = useSale(saleId)
  const documents = useSaleDocuments(saleId)
  const ticket = useSaleTicket(saleId)
  const [showTicket, setShowTicket] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const canCancel = user?.role === 'ADMIN' && sale.data?.status === 'CONFIRMED'

  return (
    <SaleDetailView
      canCancel={canCancel}
      documents={documents}
      onCloseCancelDialog={() => setShowCancelDialog(false)}
      onCloseTicket={() => setShowTicket(false)}
      onShowCancelDialog={() => setShowCancelDialog(true)}
      onShowTicket={() => setShowTicket(true)}
      sale={sale}
      saleId={saleId}
      showCancelDialog={showCancelDialog}
      showTicket={showTicket}
      ticket={ticket}
    />
  )
}

export function SaleDetailView({
  canCancel,
  documents,
  onCloseCancelDialog,
  onCloseTicket,
  onShowCancelDialog,
  onShowTicket,
  sale,
  saleId,
  showCancelDialog,
  showTicket,
  ticket,
}: SaleDetailViewProps) {
  const saleDocuments = documents.data?.items ?? sale.data?.documents ?? []

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="overflow-hidden rounded-[2rem] border border-[#20211f]/10 bg-[#20211f] text-white shadow-[0_24px_80px_rgba(32,33,31,0.16)]">
          <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0b44c]">Detalle de venta</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">{sale.data?.saleNumber ?? saleId ?? 'Venta'}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Consulta el comprobante interno, la cobranza relacionada y los movimientos sin alterar la venta base.</p>
            </div>
            <Link className="rounded-2xl border border-white/15 px-5 py-3 text-center text-sm font-black text-[#f0b44c]" to="/sales/history">Volver al historial</Link>
          </div>
        </header>

        {sale.isLoading && <p className="rounded-2xl bg-white p-4 text-sm font-bold text-[#39798b]">Cargando detalle de venta...</p>}
        {Boolean(sale.error) && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-4 text-sm font-bold text-[#9d2d24]">No se pudo cargar el detalle de la venta.</p>}
        {!sale.isLoading && !sale.error && !sale.data && <p className="rounded-2xl border border-dashed border-[#20211f]/20 bg-white p-5 text-sm text-[#68645c]">No se encontró la venta solicitada.</p>}

        {sale.data && (
          <>
            <section className="grid gap-4 rounded-[2rem] border border-[#20211f]/10 bg-white p-5 shadow-[0_20px_60px_rgba(32,33,31,0.07)] md:grid-cols-4">
              <DetailRow label="Estado" value={saleStatusLabel(sale.data.status)} />
              <DetailRow label="Cobranza" value={collectionStatusLabel(sale.data.collectionStatus)} />
              <DetailRow label="Total" value={money(sale.data.total)} />
              <DetailRow label="Fecha" value={dateTime(sale.data.createdAt)} />
              <DetailRow label="Cliente" value={sale.data.customerName ?? 'Público general'} />
              <DetailRow label="Ubicación" value={sale.data.locationId ?? '—'} />
              <DetailRow label="Canal" value={saleChannelLabel(sale.data.saleChannel)} />
              <DetailRow label="Documento" value={`${documentTypeLabel(sale.data.documentType)}${sale.data.physicalFolio ? ` · ${sale.data.physicalFolio}` : ''}`} />
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
                <h2 className="text-2xl font-black tracking-[-0.05em]">Productos vendidos</h2>
                <div className="mt-4 grid gap-3">
                  {sale.data.items?.length ? sale.data.items.map((item, index) => (
                    <article className="rounded-[1.5rem] bg-[#f5f3ee] p-4" key={item.id ?? `${item.productId}-${index}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-black tracking-[-0.03em]">{item.productName ?? item.productId ?? 'Producto'}</p>
                          <p className="text-sm text-[#68645c]">{item.unit ?? '—'} · {item.quantityKg ?? 0} kg · {item.quantityPieces ?? 0} piezas</p>
                          {item.appliedEquivalentFactor && <p className="text-xs font-bold text-[#68645c]">Equivalencia aplicada: {item.appliedEquivalentFactor}</p>}
                        </div>
                        <p className="font-black">{money(item.subtotal)}</p>
                      </div>
                    </article>
                  )) : <p className="rounded-2xl border border-dashed border-[#20211f]/20 p-4 text-sm text-[#68645c]">Sin partidas en el detalle recibido.</p>}
                </div>
              </section>

              <aside className="grid content-start gap-6">
                <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
                  <h2 className="text-xl font-black tracking-[-0.04em]">Acciones</h2>
                  <div className="mt-4 grid gap-3">
                    <button className="rounded-2xl bg-[#20211f] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-[#68645c]/40" disabled={ticket.isLoading} onClick={onShowTicket} type="button">
                      {ticket.isLoading ? 'Cargando ticket...' : 'Reimprimir ticket interno'}
                    </button>
                    <button className="rounded-2xl bg-[#9d2d24] px-5 py-3 font-black text-white disabled:cursor-not-allowed disabled:bg-[#68645c]/40" disabled={!canCancel} onClick={onShowCancelDialog} type="button">Cancelar venta</button>
                    {!canCancel && <p className="text-sm text-[#68645c]">Solo ADMIN puede cancelar ventas confirmadas y la API validará pagos, cierres y liquidaciones.</p>}
                  </div>
                </section>

                <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
                  <h2 className="text-xl font-black tracking-[-0.04em]">Pago y saldo</h2>
                  <dl className="mt-4 grid gap-3 text-sm">
                    <DetailRow label="Tipo" value={paymentTypeLabel(sale.data.paymentType)} />
                    <DetailRow label="Métodos aplicados" value={sale.data.paymentsSummary?.methods?.map(paymentMethodLabel).join(', ') || 'Sin pago registrado'} />
                    <DetailRow label="Pagado" value={money(sale.data.paymentsSummary?.totalPaid)} />
                    <DetailRow label="Último pago" value={dateTime(sale.data.paymentsSummary?.lastPaidAt)} />
                    <DetailRow label="Cuenta por cobrar" value={sale.data.accountReceivableId ?? '—'} />
                    <DetailRow label="Solicitud administrativa" value={sale.data.billingRequestId ?? '—'} />
                  </dl>
                  {sale.data.requiresAdministrativeInvoice && <p className="mt-4 rounded-2xl border border-[#39798b]/20 bg-[#39798b]/10 p-3 text-sm font-bold text-[#39798b]">Solicitud administrativa interna; no es CFDI ni comprobante fiscal.</p>}
                </section>
              </aside>
            </div>

            <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Documentos internos</h2>
              {documents.isLoading && <p className="mt-4 rounded-2xl bg-[#39798b]/10 p-3 text-sm font-bold text-[#39798b]">Consultando documentos internos...</p>}
              {Boolean(documents.error) && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">No se pudieron consultar los documentos internos de la venta.</p>}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {saleDocuments.length ? saleDocuments.map((document) => (
                  <article className="rounded-[1.5rem] bg-[#f5f3ee] p-4 text-sm" key={document.id ?? `${document.documentType}-${document.createdAt}`}>
                    <p className="font-black">{documentTypeLabel(document.documentType)}</p>
                    <p className="mt-1 text-[#68645c]">Folio: {document.physicalFolio ?? '—'} · Estado: {document.status ?? '—'}</p>
                    <p className="text-[#68645c]">Creado: {dateTime(document.createdAt)}</p>
                  </article>
                )) : <p className="rounded-2xl border border-dashed border-[#20211f]/20 p-4 text-sm text-[#68645c]">Sin documentos internos asociados en el detalle recibido.</p>}
              </div>
              <p className="mt-4 text-xs font-bold text-[#68645c]">La reapertura documental requiere autorización explícita y se gestiona solo cuando la API habilita el cambio de estado correspondiente.</p>
            </section>
          </>
        )}
      </section>
      {showTicket && <TicketModal isLoading={ticket.isLoading} onClose={onCloseTicket} ticket={ticket.data ?? undefined} />}
      {showCancelDialog && sale.data && <CancelSaleDialog onClose={onCloseCancelDialog} sale={sale.data} />}
    </main>
  )
}
