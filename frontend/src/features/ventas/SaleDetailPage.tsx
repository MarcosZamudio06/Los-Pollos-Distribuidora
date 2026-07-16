import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Ban, CalendarDays, CircleDollarSign, Clock3, FileText, MapPin, PackageCheck, Printer, ReceiptText, Ruler, ShieldCheck, Truck, UserRound, WalletCards } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { useAuth } from '../auth'
import { TicketModal } from './components'
import { CancelSaleDialog } from './CancelSaleDialog'
import { DriverRouteMap } from '../rutas-reparto/components/DriverRouteMap'
import { useSale, useSaleDocuments, useSaleTicket } from './hooks'
import { collectionStatusLabel, dateTime, documentTypeLabel, money, paymentMethodLabel, paymentTypeLabel, saleChannelLabel, saleStatusLabel } from './saleLabels'
import type { BadgeTone } from '@/components/ui'
import type { SaleDetail, SaleDocument, TicketData } from './types'

function saleStatusTone(status?: string | null): BadgeTone {
  if (status === 'CONFIRMED') return 'green'
  if (status === 'CANCELLED') return 'red'
  return 'slate'
}

function collectionStatusTone(status?: string | null): BadgeTone {
  if (status === 'PAID') return 'green'
  if (status === 'CANCELLED') return 'red'
  if (status === 'PARTIALLY_PAID') return 'blue'
  return 'amber'
}

function distanceLabel(meters?: number | null) {
  if (meters == null) return 'Distancia no disponible'
  return `${(meters / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} km`
}

function durationLabel(seconds?: number | null) {
  if (seconds == null) return 'Duración no disponible'
  return `${Math.round(seconds / 60)} min`
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4">
      <dt className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">{label}</dt>
      <dd className="mt-1 font-bold text-[var(--erp-foreground)] break-words">{value}</dd>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, tone = 'slate' }: { icon: typeof ReceiptText; label: string; value: string; tone?: BadgeTone }) {
  const toneClass = {
    amber: 'text-[var(--erp-brand-gold-deep)]',
    blue: 'text-[var(--erp-info)]',
    gold: 'text-[var(--erp-brand-gold-deep)]',
    green: 'text-[var(--erp-success)]',
    red: 'text-[var(--erp-danger)]',
    slate: 'text-[var(--erp-info)]',
  }[tone ?? 'slate']

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">{label}</p>
          <p className="mt-2 text-xl font-black tracking-[-0.05em] text-[var(--erp-foreground)]">{value}</p>
        </div>
        <span className={`grid size-10 shrink-0 place-items-center rounded-2xl bg-[var(--erp-surface-muted)] ${toneClass}`}><Icon className="h-5 w-5" /></span>
      </div>
    </Card>
  )
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
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-5">
        <header className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-[var(--erp-charcoal)] p-6 text-white shadow-[0_24px_80px_rgba(17,24,21,0.18)] sm:p-7">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-[rgba(214,155,45,0.16)]" />
          <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-soft)]">
                <ReceiptText className="h-4 w-4" />
                Detalle de venta
              </div>
              <h1 className="mt-4 break-words text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">{sale.data?.saleNumber ?? saleId ?? 'Venta'}</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">Consulta comprobante interno, cobranza relacionada, productos y acciones permitidas sin alterar la venta base.</p>
            </div>
            <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-5 text-sm font-black text-[var(--erp-brand-gold-soft)] transition hover:bg-white/12 focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]" to="/sales/history">
              <ArrowLeft className="h-4 w-4" />
              Volver al historial
            </Link>
          </div>
        </header>

        {sale.isLoading && <p className="rounded-2xl border border-[rgba(47,111,115,0.20)] bg-white p-4 text-sm font-bold text-[var(--erp-info)]">Cargando detalle de venta...</p>}
        {Boolean(sale.error) && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">No se pudo cargar el detalle de la venta.</p>}
        {!sale.isLoading && !sale.error && !sale.data && <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] bg-white p-5 text-sm text-[var(--erp-muted-foreground)]">No se encontró la venta solicitada.</p>}

        {sale.data && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <SummaryCard icon={ShieldCheck} label="Estado comercial" tone={saleStatusTone(sale.data.status)} value={saleStatusLabel(sale.data.status)} />
              <SummaryCard icon={Truck} label="Asignación de ruta" tone={sale.data.routeId ? 'blue' : 'amber'} value={sale.data.routeId ? 'Ruta asignada' : 'Sin ruta asignada'} />
              <SummaryCard icon={WalletCards} label="Cobranza" tone={collectionStatusTone(sale.data.collectionStatus)} value={collectionStatusLabel(sale.data.collectionStatus)} />
              <SummaryCard icon={CircleDollarSign} label="Total" value={money(sale.data.total)} />
              <SummaryCard icon={CalendarDays} label="Fecha" value={dateTime(sale.data.createdAt)} />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <div className="grid content-start gap-5">
                <Card className="p-5">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><UserRound className="h-4 w-4" />Información comercial</div>
                      <CardTitle className="mt-2">Cliente y operación</CardTitle>
                      <CardDescription>Contexto de la venta, ubicación, canal y documento interno.</CardDescription>
                    </div>
                    <Badge tone={sale.data.paymentType === 'CREDIT_SALE' ? 'amber' : 'green'}>{paymentTypeLabel(sale.data.paymentType)}</Badge>
                  </CardHeader>
                  <CardContent className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <DetailRow label="Cliente" value={sale.data.customerName ?? 'Público general'} />
                    <DetailRow label="Ubicación" value={sale.data.locationId ?? '—'} />
                    <DetailRow label="Canal" value={saleChannelLabel(sale.data.saleChannel)} />
                    <DetailRow label="Documento" value={`${documentTypeLabel(sale.data.documentType)}${sale.data.physicalFolio ? ` · ${sale.data.physicalFolio}` : ''}`} />
                  </CardContent>
                </Card>

                {sale.data.routePreview && (
                  <Card className="grid gap-4 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><MapPin className="h-4 w-4" />{sale.data.routePreview.mapAvailable ? 'Ruta optimizada asignada' : 'Ruta asignada'}</p>
                        <CardTitle className="mt-1">{sale.data.routePreview.name}</CardTitle>
                        <CardDescription>Recorrido operativo asignado a este pedido.</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm font-black">
                        <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(47,111,115,0.10)] px-3 py-2 text-[var(--erp-info)]"><Ruler className="h-4 w-4" />{distanceLabel(sale.data.routePreview.distanceMeters)}</span>
                        <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(214,155,45,0.14)] px-3 py-2 text-[var(--erp-brand-gold-deep)]"><Clock3 className="h-4 w-4" />{durationLabel(sale.data.routePreview.durationSeconds)}</span>
                      </div>
                    </div>
                    {sale.data.routePreview.mapAvailable && sale.data.routePreview.geometry ? (
                      <DriverRouteMap
                        compact
                        currentOrder={sale.data.routePreview.order ?? undefined}
                        geometry={sale.data.routePreview.geometry}
                        routeName={sale.data.routePreview.name}
                      />
                    ) : (
                      <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm font-semibold text-[var(--erp-muted-foreground)]">El trazado optimizado no está disponible para esta ruta.</p>
                    )}
                  </Card>
                )}

                <Card className="overflow-hidden p-0">
                  <div className="flex flex-col gap-2 border-b border-[color:var(--erp-border)] bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]"><PackageCheck className="h-4 w-4" />Productos vendidos</p>
                      <CardTitle className="mt-1">Partidas de la venta</CardTitle>
                    </div>
                    <Badge tone="slate">{sale.data.items?.length ?? 0} partida(s)</Badge>
                  </div>
                  <CardContent className="grid gap-3 p-5">
                    {sale.data.items?.length ? sale.data.items.map((item, index) => (
                      <article className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4 transition hover:border-[rgba(47,111,115,0.34)]" key={item.id ?? `${item.productId}-${index}`}>
                        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
                          <div className="min-w-0">
                            <p className="break-words text-lg font-black tracking-[-0.03em]">{item.productName ?? item.productId ?? 'Producto'}</p>
                            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">{item.unit ?? '—'} · {item.quantityKg ?? 0} kg · {item.quantityPieces ?? 0} piezas</p>
                            {item.appliedEquivalentFactor && <p className="mt-2 text-xs font-bold text-[var(--erp-muted-foreground)]">Equivalencia aplicada: {item.appliedEquivalentFactor}</p>}
                          </div>
                          <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Subtotal</p>
                            <p className="mt-1 font-black tabular-nums">{money(item.subtotal)}</p>
                          </div>
                        </div>
                      </article>
                    )) : <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] p-5 text-sm text-[var(--erp-muted-foreground)]">Sin partidas en el detalle recibido.</p>}
                  </CardContent>
                </Card>
              </div>

              <aside className="grid content-start gap-5">
                <Card className="p-5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5 text-[var(--erp-info)]" />Acciones</CardTitle>
                    <CardDescription>Acciones disponibles según el estado actual y permisos del usuario.</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-4 grid gap-3">
                    <Button disabled={ticket.isLoading} onClick={onShowTicket} variant="primary">
                      <Printer className="h-4 w-4" />
                      {ticket.isLoading ? 'Cargando ticket...' : 'Reimprimir ticket interno'}
                    </Button>
                    <Button disabled={!canCancel} onClick={onShowCancelDialog} variant="destructive">
                      <Ban className="h-4 w-4" />
                      Cancelar venta
                    </Button>
                    {!canCancel && <p className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 text-sm text-[var(--erp-muted-foreground)]">Solo ADMIN puede cancelar ventas confirmadas y la API validará pagos, cierres y liquidaciones.</p>}
                  </CardContent>
                </Card>

                <Card className="p-5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5 text-[var(--erp-success)]" />Pago y saldo</CardTitle>
                    <CardDescription>Resumen monetario y trazabilidad administrativa relacionada.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="mt-4 grid gap-3 text-sm">
                      <DetailRow label="Tipo" value={paymentTypeLabel(sale.data.paymentType)} />
                      <DetailRow label="Métodos aplicados" value={sale.data.paymentsSummary?.methods?.map(paymentMethodLabel).join(', ') || 'Sin pago registrado'} />
                      <DetailRow label="Pagado" value={money(sale.data.paymentsSummary?.totalPaid)} />
                      <DetailRow label="Último pago" value={dateTime(sale.data.paymentsSummary?.lastPaidAt)} />
                      <DetailRow label="Cuenta por cobrar" value={sale.data.accountReceivableId ?? '—'} />
                      <DetailRow label="Solicitud administrativa" value={sale.data.billingRequestId ?? '—'} />
                    </dl>
                    {sale.data.requiresAdministrativeInvoice && <p className="mt-4 rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-3 text-sm font-bold text-[var(--erp-info)]">Solicitud administrativa interna; no es CFDI ni comprobante fiscal.</p>}
                  </CardContent>
                </Card>
              </aside>
            </div>

            <Card className="p-5">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-[var(--erp-brand-gold-deep)]" />Documentos internos</CardTitle>
                  <CardDescription>Comprobantes operativos asociados a la venta. No representan CFDI.</CardDescription>
                </div>
                <Badge tone="slate">{saleDocuments.length} documento(s)</Badge>
              </CardHeader>
              {documents.isLoading && <p className="mt-4 rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-3 text-sm font-bold text-[var(--erp-info)]">Consultando documentos internos...</p>}
              {Boolean(documents.error) && <p role="alert" className="mt-4 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-bold text-[var(--erp-danger)]">No se pudieron consultar los documentos internos de la venta.</p>}
              <CardContent className="mt-4 grid gap-3 md:grid-cols-2">
                {saleDocuments.length ? saleDocuments.map((document) => (
                  <article className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm" key={document.id ?? `${document.documentType}-${document.createdAt}`}>
                    <p className="font-black">{documentTypeLabel(document.documentType)}</p>
                    <p className="mt-2 text-[var(--erp-muted-foreground)]">Folio: {document.physicalFolio ?? '—'} · Estado: {document.status ?? '—'}</p>
                    <p className="mt-1 flex items-center gap-2 text-[var(--erp-muted-foreground)]"><CalendarDays className="h-4 w-4" />Creado: {dateTime(document.createdAt)}</p>
                  </article>
                )) : <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] p-5 text-sm text-[var(--erp-muted-foreground)]">Sin documentos internos asociados en el detalle recibido.</p>}
              </CardContent>
              <p className="mt-4 text-xs font-bold text-[var(--erp-muted-foreground)]">La reapertura documental requiere autorización explícita y se gestiona solo cuando la API habilita el cambio de estado correspondiente.</p>
            </Card>
          </>
        )}
      </section>
      {showTicket && <TicketModal isLoading={ticket.isLoading} onClose={onCloseTicket} ticket={ticket.data ?? undefined} />}
      {showCancelDialog && sale.data && <CancelSaleDialog onClose={onCloseCancelDialog} sale={sale.data} />}
    </main>
  )
}
