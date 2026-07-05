import { useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { Card, Field, OrderStatusBadge, PageFrame, PageShell, PrimaryButton, RouteHero, SecondaryLink, SettlementStatusBadge, StatusMessage, TextInput } from '../components/RouteUi'
import { dateTime, money, paymentMethodLabel, shortId } from '../labels'
import { useCloseRouteSettlement, useRouteSettlement } from '../hooks'

export function RouteSettlementView() {
  const { settlementId } = useParams()
  const settlement = useRouteSettlement(settlementId)
  const closeSettlement = useCloseRouteSettlement(settlementId ?? '')
  const [notes, setNotes] = useState('')
  const [expectedVersion, setExpectedVersion] = useState('')
  const detail = settlement.data
  const version = useMemo(() => Number(expectedVersion || detail?.expectedVersion || detail?.version || 0), [detail?.expectedVersion, detail?.version, expectedVersion])
  const canClose = Boolean(settlementId && version > 0 && detail?.status !== 'CLOSED')

  async function handleClose(event: FormEvent) {
    event.preventDefault()
    if (!settlementId || !canClose) return
    await closeSettlement.mutateAsync({ expectedVersion: version, notes: notes.trim() || undefined })
  }

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          action={<SecondaryLink to="/delivery-routes">Volver a rutas</SecondaryLink>}
          eyebrow="Liquidación"
          title="Liquidación de ruta"
          subtitle="Compara pedidos entregados, incidencias, devoluciones, pagos con accountReceivableId y diferencias contra ROUTE_STOCK."
        />

        {settlement.isLoading && <StatusMessage>Cargando liquidación...</StatusMessage>}
        {settlement.error && <StatusMessage tone="error">No se pudo cargar la liquidación.</StatusMessage>}
        {!settlement.isLoading && !settlement.error && !detail && <StatusMessage tone="empty">No se encontró la liquidación solicitada.</StatusMessage>}

        {detail && (
          <>
            <section className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
              <Card className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8b2f2a]">Ruta {shortId(detail.routeId)}</p>
                    <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">{detail.route?.name ?? 'Liquidación operativa'}</h2>
                    <p className="mt-2 text-sm text-[#6f786f]">ROUTE_STOCK: {detail.route?.routeStockLocationName ?? shortId(detail.routeStockLocationId ?? detail.route?.routeStockLocationId)}</p>
                  </div>
                  <SettlementStatusBadge status={detail.status} />
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="border-l-4 border-[#d69b2d] bg-[#f7f5ef] p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Diferencia</dt><dd className="mt-1 text-2xl font-black">{money(detail.differenceAmount)}</dd></div>
                  <div className="border-l-4 border-[#2f6f73] bg-[#f7f5ef] p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Cobro entrega</dt><dd className="mt-1 text-2xl font-black">{money(detail.paidAtDeliveryAmount)}</dd></div>
                  <div className="border-l-4 border-[#8b2f2a] bg-[#f7f5ef] p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Segunda vuelta</dt><dd className="mt-1 text-2xl font-black">{money(detail.secondPassCollectionsAmount)}</dd></div>
                </dl>
              </Card>

              <Card className="p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2f6f73]">Cierre</p>
                {detail.status === 'CLOSED' ? <StatusMessage tone="success">Liquidación cerrada el {dateTime(detail.closedAt)}.</StatusMessage> : (
                  <form className="mt-4 grid gap-4" onSubmit={(event) => void handleClose(event)}>
                    <Field label="Versión esperada" hint="Requerida para evitar cierres con datos obsoletos."><TextInput min="1" onChange={(event) => setExpectedVersion(event.target.value)} placeholder={String(detail.expectedVersion ?? detail.version ?? '')} type="number" value={expectedVersion} /></Field>
                    <Field label="Notas de cierre"><TextInput onChange={(event) => setNotes(event.target.value)} placeholder="Liquidación revisada" value={notes} /></Field>
                    {closeSettlement.error && <StatusMessage tone="error">No se pudo cerrar. Backend puede bloquear por pedidos sin estado final, diferencias, permisos o versión obsoleta.</StatusMessage>}
                    <PrimaryButton disabled={!canClose || closeSettlement.isPending} type="submit">{closeSettlement.isPending ? 'Cerrando...' : 'Cerrar liquidación'}</PrimaryButton>
                  </form>
                )}
              </Card>
            </section>

            <Card className="grid gap-4 p-5 md:grid-cols-4">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f786f]">Efectivo esperado</p><p className="mt-1 text-2xl font-black">{money(detail.expectedCashAmount)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f786f]">Efectivo cobrado</p><p className="mt-1 text-2xl font-black">{money(detail.derivedCollectedCashAmount)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f786f]">Transferencia esperada</p><p className="mt-1 text-2xl font-black">{money(detail.expectedTransferAmount)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f786f]">Transferencia cobrada</p><p className="mt-1 text-2xl font-black">{money(detail.derivedCollectedTransferAmount)}</p></div>
            </Card>

            <section className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="text-2xl font-black tracking-[-0.05em]">Pedidos conciliados</h2>
                {(detail.orders ?? []).length === 0 ? <div className="mt-4"><StatusMessage tone="empty">La liquidación no incluye pedidos.</StatusMessage></div> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.14em] text-[#6f786f]"><tr className="border-b border-[#1d2420]/10"><th className="px-3 py-3">Venta</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Esperado</th><th className="px-3 py-3">Cobrado</th></tr></thead><tbody>{(detail.orders ?? []).map((order) => <tr className="border-b border-[#1d2420]/8" key={order.id}><td className="px-3 py-4 font-black">{order.saleNumber ?? shortId(order.id)}</td><td className="px-3 py-4"><OrderStatusBadge status={order.status} /></td><td className="px-3 py-4">{money(order.expectedAmount)}</td><td className="px-3 py-4 font-black">{money(order.derivedCollectedAmount)}</td></tr>)}</tbody></table></div>}
              </Card>

              <Card className="p-5">
                <h2 className="text-2xl font-black tracking-[-0.05em]">Pagos asociados</h2>
                {(detail.payments ?? []).length === 0 ? <div className="mt-4"><StatusMessage tone="empty">No hay pagos asociados a esta liquidación.</StatusMessage></div> : <div className="mt-5 grid gap-3">{(detail.payments ?? []).map((payment) => <article className="border border-[#1d2420]/10 p-4" key={payment.id}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{money(payment.amount)} · {paymentMethodLabel(payment.paymentMethod)}</p><p className="mt-1 text-xs text-[#6f786f]">CxC {shortId(payment.accountReceivableId)} · {payment.collectionPass ?? 'Sin vuelta'}</p></div><span className="text-xs font-black text-[#2f6f73]">{payment.status ?? 'Registrado'}</span></div><p className="mt-2 text-xs text-[#6f786f]">{dateTime(payment.paidAt)}</p></article>)}</div>}
              </Card>
            </section>

            <Card className="p-5">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Movimientos por devoluciones o rechazos</h2>
              {(detail.inventoryMovements ?? []).length === 0 ? <div className="mt-4"><StatusMessage tone="empty">No hay movimientos de inventario reportados para diferencias físicas.</StatusMessage></div> : <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.14em] text-[#6f786f]"><tr className="border-b border-[#1d2420]/10"><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Kilos</th><th className="px-3 py-3">Piezas</th><th className="px-3 py-3">Motivo</th></tr></thead><tbody>{(detail.inventoryMovements ?? []).map((movement) => <tr className="border-b border-[#1d2420]/8" key={movement.id}><td className="px-3 py-4 font-black">{movement.productName ?? shortId(movement.id)}</td><td className="px-3 py-4">{movement.type ?? 'Movimiento'}</td><td className="px-3 py-4">{movement.quantityKg ?? 0}</td><td className="px-3 py-4">{movement.quantityPieces ?? 0}</td><td className="px-3 py-4 text-[#6f786f]">{movement.reason ?? 'Sin motivo'}</td></tr>)}</tbody></table></div>}
            </Card>
          </>
        )}
      </PageFrame>
    </PageShell>
  )
}
