import { useParams } from 'react-router-dom'
import { Camera, CalendarDays, ClipboardList, FileText, Images, UserRound } from 'lucide-react'
import { Card, OrderStatusBadge, PageFrame, PageShell, RouteHero, SecondaryLink, StatusMessage } from '../components/RouteUi'
import { dateTime, evidenceTypeLabel, shortId } from '../labels'
import { useDeliveryRoute } from '../hooks'

export function RouteEvidenceReview() {
  const { routeId } = useParams()
  const route = useDeliveryRoute(routeId)
  const detail = route.data
  const evidence = detail?.evidenceSummary ?? []

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          action={<SecondaryLink to={routeId ? `/delivery-routes/${routeId}` : '/delivery-routes'}>Volver al detalle</SecondaryLink>}
          eyebrow="Revisión de evidencia"
          title="Centro de evidencias de entrega"
          subtitle="Valida fotos, firmas, geolocalización y notas con una lectura administrativa clara, sin alterar reglas de evidencia ni operación offline."
        />

        {route.isLoading && <StatusMessage>Cargando evidencia...</StatusMessage>}
        {route.error && <StatusMessage tone="error">No se pudo cargar la evidencia de la ruta.</StatusMessage>}

        {detail && (
          <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <Card className="p-5">
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]"><ClipboardList className="h-4 w-4" />Resumen</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">{detail.name}</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--erp-muted-foreground)]">La evidencia forma parte del MVP. Esta vista es de revisión administrativa; no asume operación offline ni obliga una mezcla final de evidencia.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><Images className="h-4 w-4 text-[var(--erp-info)]" />Evidencias</p><p className="mt-2 text-2xl font-black">{evidence.length}</p></div>
                <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><ClipboardList className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Pedidos</p><p className="mt-2 text-2xl font-black">{detail.orders?.length ?? detail.ordersCount ?? 0}</p></div>
              </div>
            </Card>

            <Card className="overflow-hidden p-0">
              <div className="border-b border-[color:var(--erp-border)] bg-white/70 p-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><Camera className="h-4 w-4" />Evidencias capturadas</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">Bitácora de prueba de entrega</h2>
              </div>
              {evidence.length === 0 ? <div className="p-5"><StatusMessage tone="empty">Esta ruta aún no reporta evidencia capturada.</StatusMessage></div> : (
                <div className="grid gap-3 p-5">
                  {evidence.map((item, index) => (
                    <article className="grid gap-4 rounded-2xl border border-[color:var(--erp-border)] bg-white p-4 md:grid-cols-[0.7fr_1fr_1fr]" key={`${item.deliveryOrderId ?? item.orderId ?? index}-${item.type}`}>
                      <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><Camera className="h-4 w-4 text-[var(--erp-info)]" />Tipo</p><p className="mt-1 text-lg font-black">{evidenceTypeLabel(item.type)}</p></div>
                      <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><FileText className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Pedido</p><p className="mt-1 font-bold">{item.saleNumber ?? shortId(item.deliveryOrderId ?? item.orderId)}</p></div>
                      <div><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><CalendarDays className="h-4 w-4 text-[var(--erp-danger)]" />Captura</p><p className="mt-1 font-bold">{dateTime(item.capturedAt)}</p><p className="mt-1 flex items-center gap-1 text-xs text-[var(--erp-muted-foreground)]"><UserRound className="h-3.5 w-3.5" />{item.capturedByUserName ?? 'Sin usuario'}</p></div>
                      {item.value && <p className="border-t border-[color:var(--erp-border)] pt-3 text-sm text-[var(--erp-muted-foreground)] md:col-span-3">{item.value}</p>}
                    </article>
                  ))}
                </div>
              )}
            </Card>

            <Card className="overflow-hidden p-0 lg:col-span-2">
              <div className="border-b border-[color:var(--erp-border)] bg-white/70 p-5"><h2 className="text-xl font-black tracking-[-0.04em]">Pedidos y estado operativo</h2></div>
              {(detail.orders ?? []).length === 0 ? <div className="p-5"><StatusMessage tone="empty">No hay pedidos para revisar.</StatusMessage></div> : (
                <>
                  <div className="grid gap-3 p-5 md:hidden">{(detail.orders ?? []).map((order) => <article className="rounded-2xl border border-[color:var(--erp-border)] bg-white p-4" key={order.id}><div className="flex items-start justify-between gap-3"><div><p className="font-black">{order.saleNumber ?? shortId(order.saleId)}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">{order.customerName ?? 'Cliente no incluido'}</p></div><OrderStatusBadge status={order.status} /></div><p className="mt-3 text-sm text-[var(--erp-muted-foreground)]">{order.notes ?? 'Sin notas'}</p><p className="mt-3 text-xs font-semibold text-[var(--erp-muted-foreground)]">Entregado: {dateTime(order.deliveredAt)}</p></article>)}</div>
                  <div className="hidden overflow-x-auto p-5 md:block"><div className="rounded-[1.2rem] border border-[color:var(--erp-border)]"><table className="min-w-[860px] border-separate border-spacing-0 text-left text-sm"><thead className="text-xs uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]"><tr><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Venta</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Cliente</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Estado</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Notas</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Entregado</th></tr></thead><tbody>{(detail.orders ?? []).map((order) => <tr className="transition hover:bg-[var(--erp-surface)]" key={order.id}><td className="border-b border-[color:var(--erp-border)] px-4 py-4 font-black">{order.saleNumber ?? shortId(order.saleId)}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4">{order.customerName ?? 'Cliente no incluido'}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4"><OrderStatusBadge status={order.status} /></td><td className="border-b border-[color:var(--erp-border)] px-4 py-4 text-[var(--erp-muted-foreground)]">{order.notes ?? 'Sin notas'}</td><td className="border-b border-[color:var(--erp-border)] px-4 py-4">{dateTime(order.deliveredAt)}</td></tr>)}</tbody></table></div></div>
                </>
              )}
            </Card>
          </section>
        )}
      </PageFrame>
    </PageShell>
  )
}
