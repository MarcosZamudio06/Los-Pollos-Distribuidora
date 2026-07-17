import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ClipboardList, FilterX, MapPin, PackageCheck, Plus, Route, Search, Truck } from 'lucide-react'
import { AssignOrdersModal } from '../components/AssignOrdersModal'
import { Card, Field, PageFrame, PageShell, PrimaryButton, RouteHero, RouteStatusBadge, SecondaryButton, SecondaryLink, SelectInput, StatusMessage, TextInput } from '../components/RouteUi'
import { date, shortId } from '../labels'
import { useDeliveryRoutes, useOpenRouteSettlement, useRoutePlannerCatalog } from '../hooks'
import type { DeliveryRouteListItem, DeliveryRouteStatus } from '../types'

export function DeliveryRoutesPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ driverId: '', originLocationId: '', scheduledDate: '', status: '' as DeliveryRouteStatus | '' })
  const [routeToAssign, setRouteToAssign] = useState<DeliveryRouteListItem | null>(null)
  const queryFilters = useMemo(() => ({ ...filters, limit: 50, page: 1 }), [filters])
  const routes = useDeliveryRoutes(queryFilters)
  const openSettlement = useOpenRouteSettlement()
  const catalog = useRoutePlannerCatalog()
  const items = routes.data?.items ?? []
  const hasFilters = Object.values(filters).some(Boolean)
  const inProgressCount = items.filter((route) => route.status === 'IN_PROGRESS').length
  const pendingCount = items.filter((route) => route.status === 'PENDING').length
  const totalOrders = items.reduce((sum, route) => sum + Number(route.ordersCount ?? 0), 0)

  async function handleOpenSettlement(routeId: string) {
    const settlement = await openSettlement.mutateAsync(routeId)
    navigate(`/route-settlements/${settlement.id}`)
  }

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          action={<PrimaryButton onClick={() => navigate('/delivery-routes/new')}><Plus className="h-4 w-4" />Crear ruta</PrimaryButton>}
          eyebrow="Torre de reparto"
          title="Mesa de control de rutas"
          subtitle="Administra salidas, pedidos confirmados, evidencias y liquidación operativa sin perder trazabilidad con ROUTE_STOCK."
          surface="white"
        />

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="p-5"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><Route className="h-4 w-4 text-[var(--erp-info)]" />Rutas visibles</p><p className="mt-3 text-2xl font-black tracking-[-0.05em] tabular-nums">{items.length}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Según filtros actuales</p></Card>
          <Card className="p-5"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><Truck className="h-4 w-4 text-[var(--erp-success)]" />En operación</p><p className="mt-3 text-2xl font-black tracking-[-0.05em] tabular-nums">{inProgressCount}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Rutas actualmente en camino</p></Card>
          <Card className="p-5"><p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><ClipboardList className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Pedidos asignados</p><p className="mt-3 text-2xl font-black tracking-[-0.05em] tabular-nums">{totalOrders}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">{pendingCount} rutas pendientes</p></Card>
        </section>


        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><Search className="h-4 w-4" />Filtros operativos</div>
              <p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">Filtra repartidor, estado, fecha y origen sin alterar la consulta existente.</p>
            </div>
            <SecondaryButton disabled={!hasFilters} onClick={() => setFilters({ driverId: '', originLocationId: '', scheduledDate: '', status: '' })}><FilterX className="h-4 w-4" />Limpiar filtros</SecondaryButton>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Repartidor"><SelectInput disabled={catalog.drivers.isLoading || Boolean(catalog.drivers.error)} onChange={(event) => setFilters({ ...filters, driverId: event.target.value })} value={filters.driverId}><option value="">{catalog.drivers.error ? 'Catálogo no disponible' : catalog.drivers.isLoading ? 'Cargando…' : 'Todos los repartidores'}</option>{catalog.drivers.data?.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</SelectInput></Field>
            <Field label="Estado"><SelectInput onChange={(event) => setFilters({ ...filters, status: event.target.value as DeliveryRouteStatus | '' })} value={filters.status}><option value="">Todos</option><option value="PENDING">Pendiente</option><option value="IN_PROGRESS">En ruta</option><option value="COMPLETED">Completada</option><option value="CANCELLED">Cancelada</option></SelectInput></Field>
            <Field label="Fecha programada"><TextInput onChange={(event) => setFilters({ ...filters, scheduledDate: event.target.value })} type="date" value={filters.scheduledDate} /></Field>
            <Field label="Ubicación origen"><SelectInput disabled={catalog.locations.isLoading || Boolean(catalog.locations.error)} onChange={(event) => setFilters({ ...filters, originLocationId: event.target.value })} value={filters.originLocationId}><option value="">{catalog.locations.error ? 'Catálogo no disponible' : catalog.locations.isLoading ? 'Cargando…' : 'Todas las ubicaciones'}</option>{catalog.locations.data?.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</SelectInput></Field>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">Operación del día</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">Rutas programadas</h2>
            </div>
            <span className="rounded-full border border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">{items.length} resultado(s)</span>
          </div>

          <div className="p-5">
            {routes.isLoading && <StatusMessage>Cargando rutas de reparto...</StatusMessage>}
            {routes.error && <StatusMessage tone="error">No se pudieron cargar las rutas. Revisa sesión, permisos o disponibilidad del backend.</StatusMessage>}
            {!routes.isLoading && !routes.error && items.length === 0 && <StatusMessage tone="empty">No hay rutas para los filtros seleccionados. Crea una ruta con ventas confirmadas para iniciar operación.</StatusMessage>}

            {items.length > 0 && (
              <>
                <div className="grid gap-3 lg:hidden">
                  {items.map((route) => (
                    <article className="rounded-2xl border border-[color:var(--erp-border)] bg-white p-4" key={route.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0"><p className="font-black">{route.name}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">{route.driverName ?? shortId(route.driverId)}</p></div>
                        <RouteStatusBadge status={route.status} />
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-[var(--erp-muted-foreground)]">
                        <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{date(route.scheduledDate)}</span>
                        <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />Origen {route.originLocationName ?? shortId(route.originLocationId)}</span>
                        <span className="flex items-center gap-2"><PackageCheck className="h-4 w-4" />ROUTE_STOCK {route.routeStockLocationName ?? shortId(route.routeStockLocationId)}</span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--erp-surface)] p-3 text-sm"><span><strong className="block text-lg text-[var(--erp-foreground)]">{route.ordersCount ?? 0}</strong>pedidos</span><span><strong className="block text-lg text-[var(--erp-foreground)]">{route.pendingOrdersCount ?? 0}</strong>pendientes</span></div>
                      {route.optimizationStatus === 'OPTIMIZED' && <p className="mt-3 rounded-xl border border-[rgba(214,155,45,.28)] bg-[rgba(214,155,45,.09)] px-3 py-2 text-xs font-bold text-[var(--erp-brand-gold-deep)]">Mapa disponible · {route.distanceMeters == null ? 'Distancia pendiente' : `${(route.distanceMeters / 1000).toFixed(1)} km`} · {route.durationSeconds == null ? 'Tiempo pendiente' : `${Math.round(route.durationSeconds / 60)} min`}</p>}
                      <div className="mt-4 flex flex-wrap gap-2"><SecondaryLink to={`/delivery-routes/${route.id}`}>Detalle</SecondaryLink><SecondaryLink to={`/delivery-routes/${route.id}/evidence`}>Evidencia</SecondaryLink>{!route.routeSettlementId && !['COMPLETED', 'CANCELLED'].includes(route.status) && (route.optimizationStatus === 'OPTIMIZED' ? <SecondaryLink to={`/delivery-routes/${route.id}/reoptimize`}>Agregar y reoptimizar</SecondaryLink> : <SecondaryButton onClick={() => setRouteToAssign(route)}>Asignar pedido</SecondaryButton>)}{!route.routeSettlementId && route.status !== 'CANCELLED' && <SecondaryButton disabled={openSettlement.isPending} onClick={() => void handleOpenSettlement(route.id)}>Abrir liquidación</SecondaryButton>}</div>
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-[1.2rem] border border-[color:var(--erp-border)] lg:block">
                  <table className="min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]"><tr><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Nombre</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Repartidor</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Fecha</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Origen</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">ROUTE_STOCK</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Estado</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Optimización</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Pedidos</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3">Liquidación</th><th className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3 text-right">Acciones</th></tr></thead>
                    <tbody>
                      {items.map((route) => (
                        <tr className="transition hover:bg-[var(--erp-surface)]" key={route.id}>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4 font-black">{route.name}</td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4">{route.driverName ?? shortId(route.driverId)}</td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4 text-[var(--erp-muted-foreground)]">{date(route.scheduledDate)}</td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4">{route.originLocationName ?? shortId(route.originLocationId)}</td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4 font-bold text-[var(--erp-info)]">{route.routeStockLocationName ?? shortId(route.routeStockLocationId)}</td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4"><RouteStatusBadge status={route.status} /></td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4">{route.optimizationStatus === 'OPTIMIZED' ? <span className="font-bold text-[var(--erp-brand-gold-deep)]">Mapa · {route.distanceMeters == null ? '—' : `${(route.distanceMeters / 1000).toFixed(1)} km`}<small className="block text-[var(--erp-muted-foreground)]">{route.durationSeconds == null ? '—' : `${Math.round(route.durationSeconds / 60)} min`}</small></span> : <span className="text-[var(--erp-muted-foreground)]">Histórica</span>}</td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4"><span className="font-black">{route.ordersCount ?? 0}</span><span className="block text-xs text-[var(--erp-muted-foreground)]">{route.pendingOrdersCount ?? 0} pendientes</span></td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4">{route.routeSettlementId ? <SecondaryLink to={`/route-settlements/${route.routeSettlementId}`}>{shortId(route.routeSettlementId)}</SecondaryLink> : <span className="text-[var(--erp-muted-foreground)]">Sin liquidación</span>}</td>
                          <td className="border-b border-[color:var(--erp-border)] px-4 py-4"><div className="flex min-w-48 flex-wrap justify-end gap-2"><SecondaryLink to={`/delivery-routes/${route.id}`}>Detalle</SecondaryLink><SecondaryLink to={`/delivery-routes/${route.id}/evidence`}>Evidencia</SecondaryLink>{!route.routeSettlementId && !['COMPLETED', 'CANCELLED'].includes(route.status) && (route.optimizationStatus === 'OPTIMIZED' ? <SecondaryLink to={`/delivery-routes/${route.id}/reoptimize`}>Agregar y reoptimizar</SecondaryLink> : <SecondaryButton onClick={() => setRouteToAssign(route)}>Asignar pedido</SecondaryButton>)}{!route.routeSettlementId && route.status !== 'CANCELLED' && <SecondaryButton disabled={openSettlement.isPending} onClick={() => void handleOpenSettlement(route.id)}>Abrir liquidación</SecondaryButton>}</div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Card>
      </PageFrame>
      {routeToAssign && <AssignOrdersModal onClose={() => setRouteToAssign(null)} routeId={routeToAssign.id} routeName={routeToAssign.name} />}
    </PageShell>
  )
}
