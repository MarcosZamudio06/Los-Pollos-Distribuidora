import { useMemo, useState } from 'react'
import { ApiClientError } from '../../../lib/api'
import { DeliveryEvidenceCapture } from '../components/DeliveryEvidenceCapture'
import { DeliveryIncidentDialog } from '../components/DeliveryIncidentDialog'
import { DeliveryOrderCard } from '../components/DeliveryOrderCard'
import { RouteCollectionDialog, RouteSecondPassCollectionDialog } from '../components/RouteCollectionDialog'
import { Card, PageFrame, PageShell, RouteHero, RouteStatusBadge, StatusMessage } from '../components/RouteUi'
import { UpdateDeliveryStatusDialog } from '../components/UpdateDeliveryStatusDialog'
import { useDeliveryRoute, useDeliveryRoutes } from '../hooks'
import { date, money, shortId } from '../labels'
import type { DeliveryOrder, DeliveryRouteListItem, RouteCollectionResponse } from '../types'

function routeSortValue(route: DeliveryRouteListItem) {
  return route.scheduledDate ? new Date(route.scheduledDate).getTime() : 0
}

function isUnauthorizedRemoteError(error: unknown) {
  return error instanceof ApiClientError && (error.statusCode === 401 || error.statusCode === 403)
}

export function MyRoutesPage() {
  const routes = useDeliveryRoutes({ limit: 50 })
  const routeItems = useMemo(() => [...(routes.data?.items ?? [])].sort((a, b) => routeSortValue(b) - routeSortValue(a)), [routes.data?.items])
  const [selectedRouteId, setSelectedRouteId] = useState<string | undefined>()
  const [statusOrder, setStatusOrder] = useState<DeliveryOrder | null>(null)
  const [evidenceOrder, setEvidenceOrder] = useState<DeliveryOrder | null>(null)
  const [collectionOrder, setCollectionOrder] = useState<DeliveryOrder | null>(null)
  const [secondPassCollectionOrder, setSecondPassCollectionOrder] = useState<DeliveryOrder | null>(null)
  const [incidentOrder, setIncidentOrder] = useState<DeliveryOrder | null>(null)
  const [lastCollection, setLastCollection] = useState<RouteCollectionResponse | null>(null)

  const activeRouteId = selectedRouteId ?? routeItems[0]?.id
  const route = useDeliveryRoute(activeRouteId)
  const detail = route.data
  const orders = detail?.orders ?? []
  const finalOrders = orders.filter((order) => ['DELIVERED', 'NOT_DELIVERED', 'CANCELLED', 'PARTIALLY_REJECTED', 'RETURNED'].includes(order.status)).length
  const routesUnauthorized = isUnauthorizedRemoteError(routes.error)
  const routeUnauthorized = isUnauthorizedRemoteError(route.error)

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          eyebrow="Mis rutas"
          title="Entregas asignadas"
          subtitle="Consulta tus rutas, actualiza pedidos, captura evidencia, registra cobros permitidos e incidencias sin operación offline. La API ya limita DRIVER a rutas propias."
        />

        {routes.isLoading && <StatusMessage>Cargando rutas asignadas...</StatusMessage>}
        {routes.error && <StatusMessage tone="error">{routesUnauthorized ? 'Tu sesión no tiene permisos para consultar estas rutas. Ingresa nuevamente o solicita acceso DRIVER.' : 'No se pudieron cargar tus rutas. Revisa sesión y permisos DRIVER.'}</StatusMessage>}
        {!routes.isLoading && !routes.error && routeItems.length === 0 && <StatusMessage tone="empty">No tienes rutas asignadas por el momento.</StatusMessage>}

        {lastCollection && (
          <StatusMessage tone="success">
            Cobro registrado por {money(lastCollection.payment.amount)}. {lastCollection.payment.routeSettlementId ? `Quedó relacionado con la liquidación ${shortId(lastCollection.payment.routeSettlementId)}.` : 'Quedó asociado a la ruta, aún sin liquidación asociada.'}
          </StatusMessage>
        )}

        {routeItems.length > 0 && (
          <section className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
            <Card className="p-4">
              <div className="border-b border-[#1d2420]/10 pb-4">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#8b2f2a]">Rutas</p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">Trabajo del día</h2>
              </div>
              <div className="mt-4 grid gap-3">
                {routeItems.map((item) => {
                  const selected = item.id === activeRouteId
                  return (
                    <button
                      className={`border p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-[#d69b2d]/25 ${selected ? 'border-[#2f6f73] bg-[#2f6f73]/8' : 'border-[#1d2420]/10 bg-white hover:border-[#2f6f73]/40'}`}
                      key={item.id}
                      onClick={() => { setSelectedRouteId(item.id); setLastCollection(null) }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black">{item.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[#6f786f]">Programada: {date(item.scheduledDate)}</p>
                        </div>
                        <RouteStatusBadge status={item.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#6f786f]">
                        <span><strong className="text-[#1d2420]">{item.ordersCount ?? 0}</strong> pedidos</span>
                        <span><strong className="text-[#1d2420]">{item.pendingOrdersCount ?? 0}</strong> pendientes</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </Card>

            <div className="grid gap-5">
              {route.isLoading && <StatusMessage>Cargando detalle de ruta...</StatusMessage>}
              {route.error && <StatusMessage tone="error">{routeUnauthorized ? 'No tienes autorización para consultar el detalle de esta ruta.' : 'No se pudo cargar el detalle de la ruta seleccionada.'}</StatusMessage>}
              {detail && (
                <>
                  <Card className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2f6f73]">Ruta seleccionada</p>
                        <h2 className="mt-1 text-3xl font-black tracking-[-0.055em]">{detail.name}</h2>
                        <p className="mt-2 text-sm leading-6 text-[#6f786f]">Origen {detail.originLocationName ?? shortId(detail.originLocationId)} · ROUTE_STOCK {detail.routeStockLocationName ?? shortId(detail.routeStockLocationId)}</p>
                      </div>
                      <RouteStatusBadge status={detail.status} />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-4">
                      <div className="border-l-4 border-[#d69b2d] bg-[#f7f5ef] p-3"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Pedidos cerrados</p><p className="mt-1 text-xl font-black">{finalOrders}/{orders.length}</p></div>
                      <div className="border-l-4 border-[#2f6f73] bg-[#f7f5ef] p-3"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Esperado</p><p className="mt-1 text-xl font-black">{money(detail.collectionsSummary?.expectedAmount)}</p></div>
                      <div className="border-l-4 border-[#1d2420] bg-[#f7f5ef] p-3"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Cobrado</p><p className="mt-1 text-xl font-black">{money(detail.collectionsSummary?.derivedCollectedAmount)}</p></div>
                      <div className="border-l-4 border-[#8b2f2a] bg-[#f7f5ef] p-3"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#6f786f]">Liquidación</p><p className="mt-1 text-xl font-black">{detail.routeSettlementId ? shortId(detail.routeSettlementId) : 'Sin asociar'}</p></div>
                    </div>
                  </Card>

                  {orders.length === 0 ? <StatusMessage tone="empty">Esta ruta no muestra pedidos asignados.</StatusMessage> : (
                    <div className="grid gap-4">
                      {orders.map((order) => (
                        <DeliveryOrderCard
                          evidence={detail.evidenceSummary ?? []}
                          key={order.id}
                          onCaptureEvidence={setEvidenceOrder}
                          onCollect={setCollectionOrder}
                          onIncident={setIncidentOrder}
                          onSecondPassCollect={setSecondPassCollectionOrder}
                          onUpdateStatus={setStatusOrder}
                          order={order}
                          routeSettlementId={detail.routeSettlementId}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </PageFrame>
      {detail && statusOrder && <UpdateDeliveryStatusDialog onClose={() => setStatusOrder(null)} order={statusOrder} routeId={detail.id} />}
      {detail && evidenceOrder && <DeliveryEvidenceCapture onClose={() => setEvidenceOrder(null)} order={evidenceOrder} routeId={detail.id} />}
      {detail && collectionOrder && <RouteCollectionDialog onClose={() => setCollectionOrder(null)} onCollected={setLastCollection} order={collectionOrder} routeId={detail.id} />}
      {detail && secondPassCollectionOrder && <RouteSecondPassCollectionDialog onClose={() => setSecondPassCollectionOrder(null)} onCollected={setLastCollection} order={secondPassCollectionOrder} routeId={detail.id} />}
      {detail && incidentOrder && <DeliveryIncidentDialog onClose={() => setIncidentOrder(null)} order={incidentOrder} routeId={detail.id} />}
    </PageShell>
  )
}
