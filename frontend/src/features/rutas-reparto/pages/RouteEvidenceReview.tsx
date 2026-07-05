import { useParams } from 'react-router-dom'
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
          eyebrow="Evidencia"
          title="Revisión de entregas"
          subtitle="Valida fotos, firmas, geolocalización y notas sin imponer combinaciones obligatorias que el negocio todavía no ha cerrado."
        />

        {route.isLoading && <StatusMessage>Cargando evidencia...</StatusMessage>}
        {route.error && <StatusMessage tone="error">No se pudo cargar la evidencia de la ruta.</StatusMessage>}

        {detail && (
          <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <Card className="p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8b2f2a]">Resumen</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">{detail.name}</h2>
              <p className="mt-3 text-sm leading-6 text-[#6f786f]">La evidencia forma parte del MVP. Esta vista es de revisión administrativa; no asume operación offline ni obliga una mezcla final de evidencia.</p>
              <div className="mt-5 grid gap-3">
                <div className="border-l-4 border-[#2f6f73] bg-[#f7f5ef] p-3"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Evidencias</p><p className="text-2xl font-black">{evidence.length}</p></div>
                <div className="border-l-4 border-[#d69b2d] bg-[#f7f5ef] p-3"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Pedidos</p><p className="text-2xl font-black">{detail.orders?.length ?? detail.ordersCount ?? 0}</p></div>
              </div>
            </Card>

            <Card className="p-5">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Evidencias capturadas</h2>
              {evidence.length === 0 ? <div className="mt-4"><StatusMessage tone="empty">Esta ruta aún no reporta evidencia capturada.</StatusMessage></div> : (
                <div className="mt-5 grid gap-3">
                  {evidence.map((item, index) => (
                    <article className="grid gap-3 border border-[#1d2420]/10 p-4 md:grid-cols-[0.7fr_1fr_1fr]" key={`${item.deliveryOrderId ?? item.orderId ?? index}-${item.type}`}>
                      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Tipo</p><p className="mt-1 text-lg font-black">{evidenceTypeLabel(item.type)}</p></div>
                      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Pedido</p><p className="mt-1 font-bold">{item.saleNumber ?? shortId(item.deliveryOrderId ?? item.orderId)}</p></div>
                      <div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Captura</p><p className="mt-1 font-bold">{dateTime(item.capturedAt)}</p><p className="text-xs text-[#6f786f]">{item.capturedByUserName ?? 'Sin usuario'}</p></div>
                      {item.value && <p className="md:col-span-3 border-t border-[#1d2420]/10 pt-3 text-sm text-[#6f786f]">{item.value}</p>}
                    </article>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 lg:col-span-2">
              <h2 className="text-2xl font-black tracking-[-0.05em]">Pedidos y estado operativo</h2>
              {(detail.orders ?? []).length === 0 ? <div className="mt-4"><StatusMessage tone="empty">No hay pedidos para revisar.</StatusMessage></div> : (
                <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.14em] text-[#6f786f]"><tr className="border-b border-[#1d2420]/10"><th className="px-3 py-3">Venta</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Notas</th><th className="px-3 py-3">Entregado</th></tr></thead><tbody>{(detail.orders ?? []).map((order) => <tr className="border-b border-[#1d2420]/8 align-top" key={order.id}><td className="px-3 py-4 font-black">{order.saleNumber ?? shortId(order.saleId)}</td><td className="px-3 py-4">{order.customerName ?? 'Cliente no incluido'}</td><td className="px-3 py-4"><OrderStatusBadge status={order.status} /></td><td className="px-3 py-4 text-[#6f786f]">{order.notes ?? 'Sin notas'}</td><td className="px-3 py-4">{dateTime(order.deliveredAt)}</td></tr>)}</tbody></table></div>
              )}
            </Card>
          </section>
        )}
      </PageFrame>
    </PageShell>
  )
}
