import { useNavigate, useParams } from 'react-router-dom'
import { BadgeDollarSign, CalendarDays, ClipboardList, MapPin, PackageCheck, Route, Truck, UserRound } from 'lucide-react'
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
          subtitle="Consulta pedidos, ROUTE_STOCK, evidencia capturada, cobros derivados de Payment y liquidación asociada cuando la API la devuelve."
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
                    <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]"><Route className="h-4 w-4" />Encabezado</p>
                    <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">{detail.name}</h2>
                    <p className="mt-2 flex items-center gap-2 text-sm text-[var(--erp-muted-foreground)]"><CalendarDays className="h-4 w-4" />Programada: {date(detail.scheduledDate)}</p>
                  </div>
                  <RouteStatusBadge status={detail.status} />
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><dt className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><UserRound className="h-4 w-4 text-[var(--erp-info)]" />Repartidor</dt><dd className="mt-2 font-black">{detail.driverName ?? shortId(detail.driverId)}</dd></div>
                  <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><dt className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><PackageCheck className="h-4 w-4 text-[var(--erp-info)]" />ROUTE_STOCK</dt><dd className="mt-2 font-black">{detail.routeStockLocationName ?? shortId(detail.routeStockLocationId)}</dd></div>
                  <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><dt className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><MapPin className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Origen</dt><dd className="mt-2 font-black">{detail.originLocationName ?? shortId(detail.originLocationId)}</dd></div>
                  <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><dt className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><ClipboardList className="h-4 w-4 text-[var(--erp-danger)]" />Pedidos pendientes</dt><dd className="mt-2 font-black">{detail.pendingOrdersCount ?? 0} de {detail.ordersCount ?? detail.orders?.length ?? 0}</dd></div>
                </dl>
              </Card>

              <Card className="p-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><Truck className="h-4 w-4" />Liquidación</p>
                {detail.routeSettlementId ? (
                  <div className="mt-3 grid gap-4">
                    <h2 className="text-2xl font-black tracking-[-0.05em]">Liquidación asociada</h2>
                    <p className="text-sm leading-6 text-[var(--erp-muted-foreground)]">La ruta ya reporta una liquidación. No se captura manualmente desde esta vista.</p>
                    <SecondaryLink to={`/route-settlements/${detail.routeSettlementId}`}>Consultar {shortId(detail.routeSettlementId)}</SecondaryLink>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-4">
                    <h2 className="text-2xl font-black tracking-[-0.05em]">Sin liquidación asociada</h2>
                    <p className="text-sm leading-6 text-[var(--erp-muted-foreground)]">Puedes abrirla cuando la ruta sea elegible; backend valida pedidos sin estado final, diferencias y permisos.</p>
                    <PrimaryButton disabled={openSettlement.isPending || detail.status === 'CANCELLED'} onClick={() => void handleOpenSettlement()}>{openSettlement.isPending ? 'Abriendo...' : 'Abrir liquidación'}</PrimaryButton>
                  </div>
                )}
              </Card>
            </section>

            <Card className="grid gap-4 p-5 md:grid-cols-4">
              <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><BadgeDollarSign className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Esperado</p><p className="mt-2 text-2xl font-black tabular-nums">{money(collections?.expectedAmount)}</p></div>
              <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><BadgeDollarSign className="h-4 w-4 text-[var(--erp-info)]" />Cobrado</p><p className="mt-2 text-2xl font-black tabular-nums">{money(collections?.derivedCollectedAmount)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Primera vuelta</p><p className="mt-2 text-2xl font-black tabular-nums">{money(collections?.firstPassAmount)}</p></div>
              <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Segunda vuelta</p><p className="mt-2 text-2xl font-black tabular-nums">{money(collections?.secondPassAmount)}</p></div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-xl font-black tracking-[-0.04em]">Pedidos asignados</h2><SecondaryLink to={`/delivery-routes/${detail.id}/evidence`}>Revisar evidencias</SecondaryLink></div>
              {(detail.orders ?? []).length === 0 ? <div className="p-5"><StatusMessage tone="empty">La ruta no muestra pedidos asignados.</StatusMessage></div> : (
                <>
                  <div className="grid gap-3 p-5 lg:hidden">{(detail.orders ?? []).map((order) => <article className="rounded-2xl border border-[color:var(--erp-border)] bg-white p-4" key={order.id}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{order.saleNumber ?? shortId(order.saleId)}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">{order.customerName ?? 'Cliente no incluido'}</p></div><OrderStatusBadge status={order.status} /></div><p className="mt-3 text-sm text-[var(--erp-muted-foreground)]">{order.deliveryAddress ?? 'Sin dirección'}</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><span>Saldo<strong className="block text-[var(--erp-foreground)]">{order.accountReceivableId ? money(order.outstandingAmount) : 'Sin CxC'}</strong></span><span>Cobrado<strong className="block text-[var(--erp-foreground)]">{money(order.derivedCollectedAmount)}</strong></span></div></article>)}</div>
                  <div className="hidden overflow-x-auto p-5 lg:block"><div className="rounded-[1.2rem] border border-[color:var(--erp-border)]"><table className="min-w-[1180px] border-separate border-spacing-0 text-left text-sm"><thead className="text-xs uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]"><tr><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Venta</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Cliente</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Dirección</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Estado</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Saldo</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Cobrado</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Entregado por</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Cobrado por</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Vuelta</th></tr></thead><tbody>{(detail.orders ?? []).map((order) => <tr className="transition hover:bg-[var(--erp-surface)]" key={order.id}><td className="border-b border-[color:var(--erp-border)] px-4 py-4 font-black">{order.saleNumber ?? shortId(order.saleId)}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4">{order.customerName ?? 'Cliente no incluido'}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4 text-[var(--erp-muted-foreground)]">{order.deliveryAddress ?? 'Sin dirección'}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4"><OrderStatusBadge status={order.status} /></td><td className="border-b border-[color:var(--erp-border)] px-4 py-4">{order.accountReceivableId ? money(order.outstandingAmount) : 'Sin CxC'}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4 font-black">{money(order.derivedCollectedAmount)}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4">{order.deliveredByUserName ?? shortId(order.deliveredByUserId)}<span className="block text-xs text-[var(--erp-muted-foreground)]">{dateTime(order.deliveredAt)}</span></td><td className="border-b border-[color:var(--erp-border)] px-4 py-4">{order.collectedByUserName ?? shortId(order.collectedByUserId)}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4">{order.collectionPass ?? 'Sin cobro'}</td></tr>)}</tbody></table></div></div>
                </>
              )}
            </Card>
          </>
        )}
      </PageFrame>
    </PageShell>
  )
}
