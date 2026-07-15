import { useMemo, useState } from 'react'
import { ApiClientError } from '../../../lib/api'
import { BadgeDollarSign, CheckCircle2, ClipboardList, Clock3, MapPin, Route, Ruler, Truck } from 'lucide-react'
import { DeliveryEvidenceCapture } from '../components/DeliveryEvidenceCapture'
import { DeliveryIncidentDialog } from '../components/DeliveryIncidentDialog'
import { DeliveryOrderCard } from '../components/DeliveryOrderCard'
import { DriverRouteMap } from '../components/DriverRouteMap'
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

function distanceLabel(meters?: number | null) {
  if (meters == null) return 'Sin estimación'
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`
}

function durationLabel(seconds?: number | null) {
  if (seconds == null) return 'Sin estimación'
  const minutes = Math.round(seconds / 60)
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`
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
          eyebrow="Cabina del repartidor"
          title="Entregas asignadas"
          subtitle="Consulta tus rutas, actualiza pedidos, captura evidencia, registra cobros permitidos e incidencias con una vista enfocada en la operación del día."
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
            <Card className="overflow-hidden p-0">
              <div className="border-b border-[color:var(--erp-border)] bg-white/70 p-5">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]"><Route className="h-4 w-4" />Rutas</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">Trabajo del día</h2>
              </div>
              <div className="grid gap-3 p-4">
                {routeItems.map((item) => {
                  const selected = item.id === activeRouteId
                  return (
                    <button
                      className={`rounded-2xl border p-4 text-left transition focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)] ${selected ? 'border-[var(--erp-info)] bg-[rgba(47,111,115,0.08)] shadow-[var(--erp-shadow)]' : 'border-[color:var(--erp-border)] bg-white hover:border-[rgba(47,111,115,0.40)]'}`}
                      key={item.id}
                      onClick={() => { setSelectedRouteId(item.id); setLastCollection(null) }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black">{item.name}</p>
                          <p className="mt-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">Programada: {date(item.scheduledDate)}</p>
                        </div>
                        <RouteStatusBadge status={item.status} />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--erp-muted-foreground)]">
                        <span><strong className="text-[var(--erp-foreground)]">{item.ordersCount ?? 0}</strong> pedidos</span>
                        <span><strong className="text-[var(--erp-foreground)]">{item.pendingOrdersCount ?? 0}</strong> pendientes</span>
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
                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><Truck className="h-4 w-4" />Ruta seleccionada</p>
                        <h2 className="mt-1 text-2xl font-black tracking-[-0.05em] sm:text-3xl">{detail.name}</h2>
                        <p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">Origen {detail.originLocationName ?? shortId(detail.originLocationId)} · ROUTE_STOCK {detail.routeStockLocationName ?? shortId(detail.routeStockLocationId)}</p>
                      </div>
                      <RouteStatusBadge status={detail.status} />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><CheckCircle2 className="h-4 w-4 text-[var(--erp-success)]" />Pedidos cerrados</p><p className="mt-2 text-xl font-black">{finalOrders}/{orders.length}</p></div>
                      <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><BadgeDollarSign className="h-4 w-4 text-[var(--erp-info)]" />Esperado</p><p className="mt-2 text-xl font-black">{money(detail.collectionsSummary?.expectedAmount)}</p></div>
                      <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><BadgeDollarSign className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Cobrado</p><p className="mt-2 text-xl font-black">{money(detail.collectionsSummary?.derivedCollectedAmount)}</p></div>
                      <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><ClipboardList className="h-4 w-4 text-[var(--erp-danger)]" />Liquidación</p><p className="mt-2 text-xl font-black">{detail.routeSettlementId ? shortId(detail.routeSettlementId) : 'Sin asociar'}</p></div>
                    </div>
                  </Card>

                  {detail.mapAvailable && detail.geometry ? (
                    <Card className="grid gap-4 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]"><MapPin className="h-4 w-4" />Recorrido aprobado</p>
                          <h3 className="mt-1 text-xl font-black tracking-[-0.04em]">Secuencia de reparto</h3>
                          <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Este trazado es el mismo aprobado por administración. No utiliza la ubicación del dispositivo ni recalcula desvíos.</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-sm font-black">
                          <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(47,111,115,0.10)] px-3 py-2 text-[var(--erp-info)]"><Ruler className="h-4 w-4" />{distanceLabel(detail.distanceMeters)}</span>
                          <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(214,155,45,0.14)] px-3 py-2 text-[var(--erp-brand-gold-deep)]"><Clock3 className="h-4 w-4" />{durationLabel(detail.durationSeconds)}</span>
                        </div>
                      </div>
                      <DriverRouteMap geometry={detail.geometry} orders={orders} routeName={detail.name} />
                    </Card>
                  ) : (
                    <StatusMessage tone="empty">Esta ruta histórica no tiene un trazado disponible. Consulta la secuencia textual de entregas.</StatusMessage>
                  )}

                  {orders.length === 0 ? <StatusMessage tone="empty">Esta ruta no muestra pedidos asignados.</StatusMessage> : (
                    <div className="grid gap-4">
                      {orders.map((order) => (
                        <div className="grid gap-2" key={order.id}>
                          <div className="flex flex-wrap items-center gap-2 px-1 text-xs font-black uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--erp-danger)] text-white">{order.stopSequence ?? '—'}</span>
                            <span>{distanceLabel(order.legDistanceMeters)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{durationLabel(order.legDurationSeconds)}</span>
                          </div>
                          <DeliveryOrderCard
                            evidence={detail.evidenceSummary ?? []}
                            onCaptureEvidence={setEvidenceOrder}
                            onCollect={setCollectionOrder}
                            onIncident={setIncidentOrder}
                            onSecondPassCollect={setSecondPassCollectionOrder}
                            onUpdateStatus={setStatusOrder}
                            order={order}
                            routeSettlementId={detail.routeSettlementId}
                          />
                        </div>
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
