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
    <Card className="p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <span className="border border-[#1d2420]/10 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-[#6f786f]">Venta {order.saleNumber ?? shortId(order.saleId)}</span>
          </div>
          <h3 className="mt-3 text-2xl font-black tracking-[-0.05em]">{order.customerName ?? 'Cliente no incluido'}</h3>
          <p className="mt-2 text-sm leading-6 text-[#6f786f]">{order.deliveryAddress ?? 'Sin dirección registrada'}</p>
          {order.notes && <p className="mt-3 border-l-4 border-[#d69b2d] bg-[#f7f5ef] p-3 text-sm font-semibold text-[#4f5a52]">{order.notes}</p>}
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-72 lg:grid-cols-1">
          <div className="border border-[#1d2420]/10 bg-[#f7f5ef] p-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Saldo por cobrar</p>
            <p className="mt-1 text-xl font-black">{order.accountReceivableId ? money(order.outstandingAmount) : 'Sin CxC'}</p>
          </div>
          <div className="border border-[#1d2420]/10 bg-[#f7f5ef] p-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Cobrado Payment</p>
            <p className="mt-1 text-xl font-black">{money(order.derivedCollectedAmount)}</p>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-[#1d2420]/10 pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="font-black text-[#4f5a52]">Entregado por</dt><dd className="mt-1 text-[#6f786f]">{order.deliveredByUserName ?? shortId(order.deliveredByUserId)}</dd></div>
        <div><dt className="font-black text-[#4f5a52]">Entrega</dt><dd className="mt-1 text-[#6f786f]">{dateTime(order.deliveredAt)}</dd></div>
        <div><dt className="font-black text-[#4f5a52]">Cobrado por</dt><dd className="mt-1 text-[#6f786f]">{order.collectedByUserName ?? shortId(order.collectedByUserId)}</dd></div>
        <div><dt className="font-black text-[#4f5a52]">Vuelta</dt><dd className="mt-1 text-[#6f786f]">{order.collectionPass === 'SECOND' ? 'Segunda vuelta' : order.collectionPass === 'FIRST' ? 'Primera vuelta' : 'Sin cobro'}</dd></div>
      </dl>

      <div className="mt-4 grid gap-3 border-t border-[#1d2420]/10 pt-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2f6f73]">Evidencias</p>
          {evidenceForOrder.length === 0 ? (
            <p className="mt-1 text-sm text-[#6f786f]">Sin evidencia capturada.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {evidenceForOrder.map((item, index) => (
                <span className="bg-[#2f6f73]/10 px-2 py-1 text-xs font-black text-[#2f6f73]" key={`${item.type}-${item.capturedAt ?? index}`}>{evidenceTypeLabel(item.type)}</span>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs font-semibold text-[#6f786f]">Liquidación: {routeSettlementId ? `asociada ${shortId(routeSettlementId)}` : 'aún sin liquidación asociada'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => onUpdateStatus(order)}>Estado</SecondaryButton>
          <SecondaryButton onClick={() => onCaptureEvidence(order)}>Evidencia</SecondaryButton>
          <SecondaryButton disabled={!hasCollectibleBalance} onClick={() => onCollect(order)}>Cobro</SecondaryButton>
          <SecondaryButton disabled={!hasCollectibleBalance} onClick={() => onSecondPassCollect(order)}>2ª vuelta</SecondaryButton>
          <SecondaryButton onClick={() => onIncident(order)}>Incidencia</SecondaryButton>
        </div>
      </div>
    </Card>
  )
}
