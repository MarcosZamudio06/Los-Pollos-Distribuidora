import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssignOrdersModal } from '../components/AssignOrdersModal'
import { CreateRouteModal } from '../components/CreateRouteModal'
import { Card, Field, PageFrame, PageShell, PrimaryButton, RouteHero, RouteStatusBadge, SecondaryButton, SecondaryLink, SelectInput, StatusMessage, TextInput } from '../components/RouteUi'
import { date, shortId } from '../labels'
import { useDeliveryRoutes, useOpenRouteSettlement } from '../hooks'
import type { DeliveryRouteListItem, DeliveryRouteStatus } from '../types'

export function DeliveryRoutesPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ driverId: '', originLocationId: '', scheduledDate: '', status: '' as DeliveryRouteStatus | '' })
  const [showCreate, setShowCreate] = useState(false)
  const [routeToAssign, setRouteToAssign] = useState<DeliveryRouteListItem | null>(null)
  const queryFilters = useMemo(() => ({ ...filters, limit: 50, page: 1 }), [filters])
  const routes = useDeliveryRoutes(queryFilters)
  const openSettlement = useOpenRouteSettlement()
  const items = routes.data?.items ?? []

  async function handleOpenSettlement(routeId: string) {
    const settlement = await openSettlement.mutateAsync(routeId)
    navigate(`/route-settlements/${settlement.id}`)
  }

  return (
    <PageShell>
      <PageFrame>
        <RouteHero
          action={<PrimaryButton onClick={() => setShowCreate(true)}>Crear ruta</PrimaryButton>}
          eyebrow="Rutas"
          title="Mesa de control de reparto"
          subtitle="Administra salidas, pedidos confirmados, evidencias y liquidación operativa sin perder la relación con ROUTE_STOCK. Diseño empresarial, compacto y sin bordes excesivamente redondos."
        />

        <Card className="grid gap-4 p-5 md:grid-cols-4">
          <Field label="Repartidor"><TextInput onChange={(event) => setFilters({ ...filters, driverId: event.target.value })} placeholder="driverId" value={filters.driverId} /></Field>
          <Field label="Estado"><SelectInput onChange={(event) => setFilters({ ...filters, status: event.target.value })} value={filters.status}><option value="">Todos</option><option value="PENDING">Pendiente</option><option value="IN_PROGRESS">En ruta</option><option value="COMPLETED">Completada</option><option value="CANCELLED">Cancelada</option></SelectInput></Field>
          <Field label="Fecha programada"><TextInput onChange={(event) => setFilters({ ...filters, scheduledDate: event.target.value })} type="date" value={filters.scheduledDate} /></Field>
          <Field label="Ubicación origen"><TextInput onChange={(event) => setFilters({ ...filters, originLocationId: event.target.value })} placeholder="originLocationId" value={filters.originLocationId} /></Field>
        </Card>

        <Card className="p-5">
          <div className="flex flex-col gap-3 border-b border-[#1d2420]/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8b2f2a]">Operación del día</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">Rutas programadas</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-2 text-sm font-black text-[#6f786f]">{items.length} resultado(s)</span>
            </div>
          </div>

          {routes.isLoading && <div className="mt-4"><StatusMessage>Cargando rutas de reparto...</StatusMessage></div>}
          {routes.error && <div className="mt-4"><StatusMessage tone="error">No se pudieron cargar las rutas. Revisa sesión, permisos o disponibilidad del backend.</StatusMessage></div>}
          {!routes.isLoading && !routes.error && items.length === 0 && <div className="mt-4"><StatusMessage tone="empty">No hay rutas para los filtros seleccionados. Crea una ruta con ventas confirmadas para iniciar operación.</StatusMessage></div>}

          {items.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.14em] text-[#6f786f]"><tr className="border-b border-[#1d2420]/10"><th className="px-3 py-3">Nombre</th><th className="px-3 py-3">Repartidor</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Origen</th><th className="px-3 py-3">ROUTE_STOCK</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Pedidos</th><th className="px-3 py-3">Liquidación</th><th className="px-3 py-3">Acciones</th></tr></thead>
                <tbody>
                  {items.map((route) => (
                    <tr className="border-b border-[#1d2420]/8 align-top" key={route.id}>
                      <td className="px-3 py-4 font-black">{route.name}</td>
                      <td className="px-3 py-4">{route.driverName ?? shortId(route.driverId)}</td>
                      <td className="px-3 py-4 text-[#6f786f]">{date(route.scheduledDate)}</td>
                      <td className="px-3 py-4">{route.originLocationName ?? shortId(route.originLocationId)}</td>
                      <td className="px-3 py-4 font-bold text-[#2f6f73]">{route.routeStockLocationName ?? shortId(route.routeStockLocationId)}</td>
                      <td className="px-3 py-4"><RouteStatusBadge status={route.status} /></td>
                      <td className="px-3 py-4"><span className="font-black">{route.ordersCount ?? 0}</span><span className="block text-xs text-[#6f786f]">{route.pendingOrdersCount ?? 0} pendientes</span></td>
                      <td className="px-3 py-4">{route.routeSettlementId ? <SecondaryLink to={`/route-settlements/${route.routeSettlementId}`}>{shortId(route.routeSettlementId)}</SecondaryLink> : <span className="text-[#6f786f]">Sin liquidación</span>}</td>
                      <td className="px-3 py-4">
                        <div className="flex min-w-48 flex-wrap gap-2">
                          <SecondaryLink to={`/delivery-routes/${route.id}`}>Detalle</SecondaryLink>
                          <SecondaryLink to={`/delivery-routes/${route.id}/evidence`}>Evidencia</SecondaryLink>
                          {!route.routeSettlementId && !['COMPLETED', 'CANCELLED'].includes(route.status) && <SecondaryButton onClick={() => setRouteToAssign(route)}>Asignar pedido</SecondaryButton>}
                          {!route.routeSettlementId && route.status !== 'CANCELLED' && <SecondaryButton disabled={openSettlement.isPending} onClick={() => void handleOpenSettlement(route.id)}>Abrir liquidación</SecondaryButton>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </PageFrame>
      {showCreate && <CreateRouteModal onClose={() => setShowCreate(false)} onCreated={(routeId) => navigate(`/delivery-routes/${routeId}`)} />}
      {routeToAssign && <AssignOrdersModal onClose={() => setRouteToAssign(null)} routeId={routeToAssign.id} routeName={routeToAssign.name} />}
    </PageShell>
  )
}
