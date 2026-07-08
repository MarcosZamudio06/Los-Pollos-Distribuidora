import { BadgeDollarSign, Camera, Clock, MapPin, MessageSquareWarning, ReceiptText, UserRound } from 'lucide-react'
import { dateTime, evidenceTypeLabel, money, shortId } from '../labels'
import type { DeliveryOrder, EvidenceSummaryItem } from '../types'
import { Card, OrderStatusBadge, SecondaryButton } from './RouteUi'

type Props = {
  evidence: EvidenceSummaryItem[]
  onCaptureEvidence: (order: DeliveryOrder) => void
  onCollect: (order: DeliveryOrder) => void
  onIncident: (order: DeliveryOrder) => void
  onSecondPassCollect: (order: DeliveryOrder) => void
  onUpdateStatus: (order: DeliveryOrder) => void
  order: DeliveryOrder
  routeSettlementId?: string | null
}

export function DeliveryOrderCard({ evidence, onCaptureEvidence, onCollect, onIncident, onSecondPassCollect, onUpdateStatus, order, routeSettlementId }: Props) {
  const outstandingAmount = Number(order.outstandingAmount ?? 0)
  const hasCollectibleBalance = Boolean(order.accountReceivableId && outstandingAmount > 0)
  const evidenceForOrder = evidence.filter((item) => (item.deliveryOrderId ?? item.orderId) === order.id)

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]"><ReceiptText className="h-3.5 w-3.5" />Venta {order.saleNumber ?? shortId(order.saleId)}</span>
          </div>
          <h3 className="mt-3 text-2xl font-black tracking-[-0.05em]">{order.customerName ?? 'Cliente no incluido'}</h3>
          <p className="mt-2 flex items-start gap-2 text-sm leading-6 text-[var(--erp-muted-foreground)]"><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{order.deliveryAddress ?? 'Sin dirección registrada'}</p>
          {order.notes && <p className="mt-3 rounded-2xl border border-[rgba(214,155,45,0.28)] bg-[rgba(214,155,45,0.12)] p-3 text-sm font-semibold text-[var(--erp-brand-gold-deep)]">{order.notes}</p>}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-72 lg:grid-cols-1">
          <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><BadgeDollarSign className="h-4 w-4 text-[var(--erp-danger)]" />Saldo por cobrar</p>
            <p className="mt-2 text-xl font-black tabular-nums">{order.accountReceivableId ? money(order.outstandingAmount) : 'Sin CxC'}</p>
          </div>
          <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><BadgeDollarSign className="h-4 w-4 text-[var(--erp-info)]" />Cobrado Payment</p>
            <p className="mt-2 text-xl font-black tabular-nums">{money(order.derivedCollectedAmount)}</p>
          </div>
        </div>
      </div>

      <dl className="grid gap-3 border-y border-[color:var(--erp-border)] bg-white/70 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="flex items-center gap-2 font-black text-[var(--erp-foreground)]"><UserRound className="h-4 w-4 text-[var(--erp-info)]" />Entregado por</dt><dd className="mt-1 text-[var(--erp-muted-foreground)]">{order.deliveredByUserName ?? shortId(order.deliveredByUserId)}</dd></div>
        <div><dt className="flex items-center gap-2 font-black text-[var(--erp-foreground)]"><Clock className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Entrega</dt><dd className="mt-1 text-[var(--erp-muted-foreground)]">{dateTime(order.deliveredAt)}</dd></div>
        <div><dt className="flex items-center gap-2 font-black text-[var(--erp-foreground)]"><UserRound className="h-4 w-4 text-[var(--erp-info)]" />Cobrado por</dt><dd className="mt-1 text-[var(--erp-muted-foreground)]">{order.collectedByUserName ?? shortId(order.collectedByUserId)}</dd></div>
        <div><dt className="flex items-center gap-2 font-black text-[var(--erp-foreground)]"><BadgeDollarSign className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Vuelta</dt><dd className="mt-1 text-[var(--erp-muted-foreground)]">{order.collectionPass === 'SECOND' ? 'Segunda vuelta' : order.collectionPass === 'FIRST' ? 'Primera vuelta' : 'Sin cobro'}</dd></div>
      </dl>

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><Camera className="h-4 w-4" />Evidencias</p>
          {evidenceForOrder.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Sin evidencia capturada.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {evidenceForOrder.map((item, index) => (
                <span className="rounded-full border border-[rgba(47,111,115,0.22)] bg-[rgba(47,111,115,0.10)] px-2.5 py-1 text-xs font-black text-[var(--erp-info)]" key={`${item.type}-${item.capturedAt ?? index}`}>{evidenceTypeLabel(item.type)}</span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs font-semibold text-[var(--erp-muted-foreground)]">Liquidación: {routeSettlementId ? `asociada ${shortId(routeSettlementId)}` : 'aún sin liquidación asociada'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => onUpdateStatus(order)}>Estado</SecondaryButton>
          <SecondaryButton onClick={() => onCaptureEvidence(order)}><Camera className="h-4 w-4" />Evidencia</SecondaryButton>
          <SecondaryButton disabled={!hasCollectibleBalance} onClick={() => onCollect(order)}>Cobro</SecondaryButton>
          <SecondaryButton disabled={!hasCollectibleBalance} onClick={() => onSecondPassCollect(order)}>2ª vuelta</SecondaryButton>
          <SecondaryButton onClick={() => onIncident(order)}><MessageSquareWarning className="h-4 w-4" />Incidencia</SecondaryButton>
        </div>
      </div>
    </Card>
  )
}
