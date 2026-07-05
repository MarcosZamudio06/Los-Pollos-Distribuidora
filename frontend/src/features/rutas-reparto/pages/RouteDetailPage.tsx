import { useNavigate, useParams } from 'react-router-dom'
import { Card, OrderStatusBadge, PageFrame, PageShell, PrimaryButton, RouteHero, RouteStatusBadge, SecondaryLink, StatusMessage } from '../components/RouteUi'
import { date, dateTime, money, shortId } from '../labels'
import { useDeliveryRoute, useOpenRouteSettlement } from '../hooks'

export function RouteDetailPage() {
  const { routeId } = useParams()
  const navigate = useNavigate()
  const route = useDeliveryRoute(routeId)
  const openSettlement = useOpenRouteSettlement()
  const detail = route.data
  const collections = detail?.collectionsSummary

  async function handleOpenSettlement() {
    if (!routeId) return
    const settlement = await openSettlement.mutateAsync(routeId)
    navigate(`/route-settlements/${settlement.id}`)
  }

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          action={<SecondaryLink to="/delivery-routes">Volver a rutas</SecondaryLink>}
          eyebrow="Detalle de ruta"
          title={detail?.name ?? 'Ruta de reparto'}
          subtitle="Consulta pedidos, ubicación ROUTE_STOCK, evidencia capturada, cobros derivados de Payment y liquidación asociada solo cuando la API la devuelve."
        />

        {route.isLoading && <StatusMessage>Cargando detalle de ruta...</StatusMessage>}
        {route.error && <StatusMessage tone="error">No se pudo cargar el detalle de la ruta.</StatusMessage>}
        {!route.isLoading && !route.error && !detail && <StatusMessage tone="empty">No se encontró la ruta solicitada.</StatusMessage>}

        {detail && (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8b2f2a]">Encabezado</p>
                    <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">{detail.name}</h2>
                    <p className="mt-2 text-sm text-[#6f786f]">Programada: {date(detail.scheduledDate)}</p>
                  </div>
                  <RouteStatusBadge status={detail.status} />
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="border-l-4 border-[#d69b2d] bg-[#f7f5ef] p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Repartidor</dt><dd className="mt-1 font-black">{detail.driverName ?? shortId(detail.driverId)}</dd></div>
                  <div className="border-l-4 border-[#2f6f73] bg-[#f7f5ef] p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">ROUTE_STOCK</dt><dd className="mt-1 font-black">{detail.routeStockLocationName ?? shortId(detail.routeStockLocationId)}</dd></div>
                  <div className="border-l-4 border-[#1d2420] bg-[#f7f5ef] p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Origen</dt><dd className="mt-1 font-black">{detail.originLocationName ?? shortId(detail.originLocationId)}</dd></div>
                  <div className="border-l-4 border-[#8b2f2a] bg-[#f7f5ef] p-3"><dt className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Pedidos pendientes</dt><dd className="mt-1 font-black">{detail.pendingOrdersCount ?? 0} de {detail.ordersCount ?? detail.orders?.length ?? 0}</dd></div>
                </dl>
              </Card>

              <Card className="p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2f6f73]">Liquidación</p>
                {detail.routeSettlementId ? (
                  <div className="mt-3 grid gap-4">
                    <h2 className="text-2xl font-black tracking-[-0.05em]">Liquidación asociada</h2>
                    <p className="text-sm leading-6 text-[#6f786f]">La ruta ya reporta una liquidación. No se captura manualmente desde esta vista.</p>
                    <SecondaryLink to={`/route-settlements/${detail.routeSettlementId}`}>Consultar {shortId(detail.routeSettlementId)}</SecondaryLink>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-4">
                    <h2 className="text-2xl font-black tracking-[-0.05em]">Sin liquidación asociada</h2>
                    <p className="text-sm leading-6 text-[#6f786f]">Puedes abrirla cuando la ruta sea elegible; backend valida pedidos sin estado final, diferencias y permisos.</p>
                    <PrimaryButton disabled={openSettlement.isPending || detail.status === 'CANCELLED'} onClick={() => void handleOpenSettlement()}>{openSettlement.isPending ? 'Abriendo...' : 'Abrir liquidación'}</PrimaryButton>
                  </div>
                )}
              </Card>
            </section>

            <Card className="grid gap-4 p-5 md:grid-cols-4">
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f786f]">Esperado</p><p className="mt-1 text-2xl font-black">{money(collections?.expectedAmount)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f786f]">Cobrado</p><p className="mt-1 text-2xl font-black">{money(collections?.derivedCollectedAmount)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f786f]">Primera vuelta</p><p className="mt-1 text-2xl font-black">{money(collections?.firstPassAmount)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#6f786f]">Segunda vuelta</p><p className="mt-1 text-2xl font-black">{money(collections?.secondPassAmount)}</p></div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between gap-4 border-b border-[#1d2420]/10 pb-4"><h2 className="text-2xl font-black tracking-[-0.05em]">Pedidos asignados</h2><SecondaryLink to={`/delivery-routes/${detail.id}/evidence`}>Revisar evidencias</SecondaryLink></div>
              {(detail.orders ?? []).length === 0 ? <div className="mt-4"><StatusMessage tone="empty">La ruta no muestra pedidos asignados.</StatusMessage></div> : (
                <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.14em] text-[#6f786f]"><tr className="border-b border-[#1d2420]/10"><th className="px-3 py-3">Venta</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Dirección</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Saldo</th><th className="px-3 py-3">Cobrado</th><th className="px-3 py-3">Entregado por</th><th className="px-3 py-3">Cobrado por</th><th className="px-3 py-3">Vuelta</th></tr></thead><tbody>{(detail.orders ?? []).map((order) => <tr className="border-b border-[#1d2420]/8 align-top" key={order.id}><td className="px-3 py-4 font-black">{order.saleNumber ?? shortId(order.saleId)}</td><td className="px-3 py-4">{order.customerName ?? 'Cliente no incluido'}</td><td className="px-3 py-4 text-[#6f786f]">{order.deliveryAddress ?? 'Sin dirección'}</td><td className="px-3 py-4"><OrderStatusBadge status={order.status} /></td><td className="px-3 py-4">{order.accountReceivableId ? money(order.outstandingAmount) : 'Sin CxC'}</td><td className="px-3 py-4 font-black">{money(order.derivedCollectedAmount)}</td><td className="px-3 py-4">{order.deliveredByUserName ?? shortId(order.deliveredByUserId)}<span className="block text-xs text-[#6f786f]">{dateTime(order.deliveredAt)}</span></td><td className="px-3 py-4">{order.collectedByUserName ?? shortId(order.collectedByUserId)}</td><td className="px-3 py-4">{order.collectionPass ?? 'Sin cobro'}</td></tr>)}</tbody></table></div>
              )}
            </Card>
          </>
        )}
      </PageFrame>
    </PageShell>
  )
}
