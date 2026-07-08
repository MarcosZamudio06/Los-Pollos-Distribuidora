import { useMemo, useState } from 'react'
import { Bar, BarChart as RechartsBarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, ChartContainer, type ChartConfig } from '../../components/ui'
import { canAccessWithRole, getKnownRole, getRoleLabel, ROUTE_ACCESS_ROLES, type KnownRole } from '../../components/layout/routeAccess'
import { ApiClientError } from '../../lib/api'
import { useAuth } from '../auth'
import { useDashboardReport } from '../reportes'
import type { DashboardDeliverySummary, DashboardLowStockItem, DashboardReport, DashboardReportFilters, DashboardTopProduct } from '../reportes'
import {
  AlertRow,
  CompactTable,
  DataPanel,
  EmptyState,
  FieldLabel,
  FilterPanel,
  FreshnessBar,
  Input,
  KpiCard,
  LoadingState,
  StatusBadge,
  Td,
} from './dashboardComponents'
import { BadgeDollarSign, Boxes, CircleDollarSign, ClipboardList, PackageSearch, ReceiptText, Route, Truck } from 'lucide-react'

const moneyFormatter = new Intl.NumberFormat('es-MX', { currency: 'MXN', style: 'currency' })
const numberFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })
const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

type DashboardRole = KnownRole | null

type ChartItem = {
  amount: number
  label: string
}

type QuickAction = {
  label: string
  to: string
  roles: readonly KnownRole[]
}

const quickActions: QuickAction[] = [
  { label: 'Nueva venta POS', roles: ROUTE_ACCESS_ROLES.salesPos, to: '/sales' },
  { label: 'Historial de ventas', roles: ROUTE_ACCESS_ROLES.salesHistory, to: '/sales/history' },
  { label: 'Clientes', roles: ROUTE_ACCESS_ROLES.customers, to: '/customers' },
  { label: 'Cuentas por cobrar', roles: ROUTE_ACCESS_ROLES.accountsReceivable, to: '/accounts-receivable' },
  { label: 'Inventario', roles: ROUTE_ACCESS_ROLES.inventory, to: '/inventory' },
  { label: 'Compras', roles: ROUTE_ACCESS_ROLES.purchases, to: '/purchases' },
  { label: 'Nueva compra', roles: ROUTE_ACCESS_ROLES.purchaseNew, to: '/purchases/new' },
  { label: 'Mis rutas', roles: ROUTE_ACCESS_ROLES.myRoutes, to: '/my-routes' },
  { label: 'Reparto / Rutas', roles: ROUTE_ACCESS_ROLES.deliveryRoutes, to: '/delivery-routes' },
  { label: 'Reportes', roles: ROUTE_ACCESS_ROLES.reports, to: '/reports' },
]

function formatMoney(value?: number | null) {
  return moneyFormatter.format(Number(value ?? 0))
}

function formatQuantity(value?: number | null) {
  return numberFormatter.format(Number(value ?? 0))
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin fecha reportada'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return dateFormatter.format(date)
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiClientError && [401, 403].includes(error.statusCode)
}

function canAccess(role: DashboardRole, roles: readonly KnownRole[]) {
  return canAccessWithRole(role, roles)
}

function getAllowedActions(role: DashboardRole) {
  return quickActions.filter((action) => canAccess(role, action.roles))
}

function getAction(role: DashboardRole, to: string, label: string) {
  const action = quickActions.find((item) => item.to === to)
  return action && canAccess(role, action.roles) ? { label, to } : undefined
}

function getRoleCapabilities(role: DashboardRole) {
  return {
    collections: canAccess(role, ROUTE_ACCESS_ROLES.accountsReceivable),
    deliveryGlobal: canAccess(role, ROUTE_ACCESS_ROLES.deliveryRoutes),
    driverOwnRoutes: canAccess(role, ROUTE_ACCESS_ROLES.myRoutes),
    inventory: canAccess(role, ROUTE_ACCESS_ROLES.inventory) && role !== 'SELLER',
    reports: canAccess(role, ROUTE_ACCESS_ROLES.reports),
    sales: canAccess(role, ROUTE_ACCESS_ROLES.salesPos) || canAccess(role, ROUTE_ACCESS_ROLES.salesHistory),
    sellerInventoryRead: role === 'SELLER' && canAccess(role, ROUTE_ACCESS_ROLES.inventory),
  }
}

function isDashboardEmpty(data?: DashboardReport) {
  if (!data) return true
  return (
    data.salesToday.count === 0 &&
    data.collectionsToday === 0 &&
    data.overdueReceivables.count === 0 &&
    data.lowStockByLocation.length === 0 &&
    data.deliverySummary.pending === 0 &&
    data.deliverySummary.inRoute === 0 &&
    data.deliverySummary.delivered === 0 &&
    data.deliverySummary.incident === 0 &&
    data.routeCollectionsPendingSettlement === 0 &&
    data.topProducts.length === 0
  )
}

function UnauthorizedState() {
  return (
    <Card className="p-8 text-center">
      <StatusBadge tone="red">Sin autorización</StatusBadge>
      <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-[var(--erp-foreground)]">No tienes permisos para este tablero</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--erp-muted-foreground)]">
        Tu sesión no puede consultar las métricas del tablero. Revisa tu rol o vuelve a iniciar sesión si cambió tu acceso.
      </p>
      <Link className="mt-6 inline-flex font-bold text-[var(--erp-danger)]" to="/logout">Cerrar sesión</Link>
    </Card>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="border-[rgba(157,45,36,0.25)] p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <StatusBadge tone="red">Error</StatusBadge>
          <p className="mt-3 font-black">No se pudo cargar el dashboard</p>
          <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Verifica la conexión con reportes y vuelve a intentarlo.</p>
        </div>
        <Button onClick={onRetry} variant="secondary">Reintentar</Button>
      </div>
    </Card>
  )
}

function SimpleBarChart({ items, money = true }: { items: ChartItem[]; money?: boolean }) {
  const chartConfig = {
    amount: { color: '#2f6f73', label: 'Valor' },
  } satisfies ChartConfig

  if (items.length === 0) {
    return <EmptyState description="El contrato actual de reportes no devolvió datos para esta gráfica." />
  }

  return (
    <ChartContainer config={chartConfig}>
      <ResponsiveContainer height={224} width="100%">
        <RechartsBarChart accessibilityLayer data={items.slice(0, 6)} layout="vertical" margin={{ bottom: 8, left: 8, right: 20, top: 8 }}>
          <CartesianGrid horizontal={false} strokeDasharray="4 4" />
          <XAxis axisLine={false} tickFormatter={(value) => (money ? formatMoney(Number(value)) : formatQuantity(Number(value)))} tickLine={false} type="number" />
          <YAxis axisLine={false} dataKey="label" tickLine={false} type="category" width={118} />
          <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 10, 10, 0]} />
        </RechartsBarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

function TopProductsChart({ items }: { items: DashboardTopProduct[] }) {
  const normalized = items.map((item) => ({
    amount: item.total ?? item.amount ?? item.quantityKg ?? item.quantityPieces ?? item.count ?? 0,
    label: item.productName ?? item.productId ?? 'Producto sin nombre',
  }))

  return <SimpleBarChart items={normalized} />
}

function DeliveryChart({ summary }: { summary: DashboardDeliverySummary }) {
  return (
    <SimpleBarChart
      items={[
        { amount: summary.pending, label: 'Pendientes' },
        { amount: summary.inRoute, label: 'En ruta' },
        { amount: summary.delivered, label: 'Entregadas' },
        { amount: summary.incident, label: 'Incidencias' },
      ]}
      money={false}
    />
  )
}

function LowStockTable({ canLinkInventory, items }: { canLinkInventory: boolean; items: DashboardLowStockItem[] }) {
  if (items.length === 0) {
    return <EmptyState description="No hay productos en bajo stock para el alcance autorizado." title="Inventario sin alertas críticas" />
  }

  return (
    <CompactTable headers={['Ubicación', 'Producto', 'Unidad', 'Kg actuales', 'Piezas', 'Mínimo kg', 'Mínimo piezas', 'Estado', 'Acción']}>
      {items.map((item) => (
        <tr className="hover:bg-[var(--erp-surface)]" key={`${item.locationId}-${item.productId}`}>
          <Td>{item.locationName || item.locationId}</Td>
          <Td>
            <span className="font-bold">{item.productName || item.productId}</span>
            {item.sku && <span className="block text-xs text-[var(--erp-muted-foreground)]">SKU {item.sku}</span>}
          </Td>
          <Td>{item.unit || 'Sin unidad'}</Td>
          <Td className="text-right">{formatQuantity(item.quantityKg)}</Td>
          <Td className="text-right">{formatQuantity(item.quantityPieces)}</Td>
          <Td className="text-right">{formatQuantity(item.minQuantityKg)}</Td>
          <Td className="text-right">{formatQuantity(item.minQuantityPieces)}</Td>
          <Td><StatusBadge tone={item.isLowStock === false ? 'green' : 'red'}>{item.isLowStock === false ? 'Suficiente' : 'Crítico'}</StatusBadge></Td>
          <Td>{canLinkInventory ? <Link className="font-bold text-[var(--erp-info)]" to="/inventory">Revisar</Link> : <span className="text-sm text-[var(--erp-muted-foreground)]">Sin acceso</span>}</Td>
        </tr>
      ))}
    </CompactTable>
  )
}

function DashboardFilters({ filters, onChange }: { filters: DashboardReportFilters; onChange: (filters: DashboardReportFilters) => void }) {
  return (
    <FilterPanel onClear={() => onChange({})}>
      <FieldLabel>
        Fecha
        <Input
          className="normal-case tracking-normal"
          onChange={(event) => onChange({ ...filters, date: event.target.value || undefined })}
          type="date"
          value={filters.date ?? ''}
        />
      </FieldLabel>
      <FieldLabel>
        Ubicación operativa
        <Input
          className="normal-case tracking-normal"
          onChange={(event) => onChange({ ...filters, locationId: event.target.value || undefined })}
          placeholder="Clave de ubicación autorizada"
          value={filters.locationId ?? ''}
        />
      </FieldLabel>
    </FilterPanel>
  )
}

function RoleKpis({ data, role }: { data: DashboardReport; role: DashboardRole }) {
  const capabilities = getRoleCapabilities(role)
  const isDriver = role === 'DRIVER'

  if (isDriver) {
    return (
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard action={getAction(role, '/my-routes', 'Ver mis rutas')} detail="Rutas propias asignadas al usuario autenticado." icon={Route} label="Rutas asignadas" tone="blue" value={formatQuantity(data.deliverySummary.inRoute + data.deliverySummary.pending)} />
        <KpiCard detail="Entregas marcadas como completadas en el día." icon={Truck} label="Entregas del día" tone="green" value={formatQuantity(data.deliverySummary.delivered)} />
        <KpiCard detail="Pendientes de atención en ruta." icon={ClipboardList} label="Entregas pendientes" tone="amber" value={formatQuantity(data.deliverySummary.pending)} />
        <KpiCard detail="Rutas o entregas con incidencia registrada." icon={PackageSearch} label="Incidencias" tone="red" value={formatQuantity(data.deliverySummary.incident)} />
      </div>
    )
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {capabilities.sales && (
        <>
          <KpiCard action={getAction(role, '/sales/history', 'Ver ventas')} detail={`${data.salesToday.count} ventas · contado ${formatMoney(data.salesToday.cash)} · crédito ${formatMoney(data.salesToday.credit)}`} icon={BadgeDollarSign} label="Ventas del día" tone="green" value={formatMoney(data.salesToday.total)} />
          <KpiCard detail="Promedio calculado con ventas del día disponibles." icon={ReceiptText} label="Ticket promedio" tone="amber" value={formatMoney(data.salesToday.count > 0 ? data.salesToday.total / data.salesToday.count : 0)} />
        </>
      )}
      {(capabilities.deliveryGlobal || role === 'ADMIN') && <KpiCard action={getAction(role, '/delivery-routes', 'Ver reparto')} detail="Pedidos pendientes y en ruta dentro del alcance autorizado." icon={Truck} label="Pedidos por surtir" tone="blue" value={formatQuantity(data.deliverySummary.pending + data.deliverySummary.inRoute)} />}
      {capabilities.collections && <KpiCard action={getAction(role, '/accounts-receivable', 'Ver cobranza')} detail={`${data.overdueReceivables.count} cuentas vencidas · ${data.customersBlockedForCredit ?? 0} clientes bloqueados`} icon={CircleDollarSign} label="Cobranza próxima" tone="red" value={formatMoney(data.overdueReceivables.balance)} />}
      {capabilities.inventory && <KpiCard action={getAction(role, '/inventory', 'Ver inventario')} detail="Productos críticos por ubicación operativa." icon={Boxes} label="Inventario crítico" tone="red" value={formatQuantity(data.lowStockByLocation.length)} />}
      {(capabilities.deliveryGlobal || role === 'ADMIN') && <KpiCard detail="Relación de entregas completadas contra operación activa." icon={Route} label="Eficiencia de reparto" tone="green" value={`${formatQuantity((data.deliverySummary.delivered / Math.max(1, data.deliverySummary.delivered + data.deliverySummary.pending + data.deliverySummary.inRoute + data.deliverySummary.incident)) * 100)}%`} />}
      {capabilities.sellerInventoryRead && <KpiCard action={getAction(role, '/inventory', 'Consultar')} detail="Consulta permitida de inventario sin acciones administrativas." icon={Boxes} label="Inventario consultable" tone="blue" value={formatQuantity(data.lowStockByLocation.length)} />}
    </div>
  )
}

function AlertsPanel({ data, role }: { data: DashboardReport; role: DashboardRole }) {
  const capabilities = getRoleCapabilities(role)
  const alerts = [
    capabilities.inventory && data.lowStockByLocation.length > 0 ? <AlertRow action={getAction(role, '/inventory', 'Revisar')} description="Requieren reposición o validación por ubicación operativa." key="stock" severity="red" title={`${data.lowStockByLocation.length} productos con inventario crítico`} /> : null,
    capabilities.collections && data.overdueReceivables.balance > 0 ? <AlertRow action={getAction(role, '/accounts-receivable', 'Dar seguimiento')} description={`${data.overdueReceivables.count} cuentas vencidas necesitan seguimiento.`} key="collections" severity="amber" title="Cobranza por atender" /> : null,
    (capabilities.deliveryGlobal || capabilities.driverOwnRoutes) && data.deliverySummary.incident > 0 ? <AlertRow action={capabilities.driverOwnRoutes ? getAction(role, '/my-routes', 'Ver mis rutas') : getAction(role, '/delivery-routes', 'Ver rutas')} description="Hay entregas o rutas con incidencia operativa." key="delivery" severity="red" title={`${data.deliverySummary.incident} incidencias de reparto`} /> : null,
    capabilities.sales && data.billingRequestsToday ? <AlertRow action={getAction(role, '/reports', 'Ver reportes')} description="Solicitudes administrativas registradas hoy." key="billing" severity="blue" title={`${data.billingRequestsToday} solicitudes internas`} /> : null,
  ].filter(Boolean)

  return (
    <DataPanel action={getAction(role, '/reports', 'Ver todas')} description="Solo se muestran alertas ligadas a módulos permitidos para el rol." eyebrow="Alertas" title="Alertas operativas">
      {alerts.length > 0 ? alerts : <EmptyState description="No hay alertas operativas visibles para tu rol con los filtros actuales." />}
    </DataPanel>
  )
}

function SalesSummaryPanel({ data, role }: { data: DashboardReport; role: DashboardRole }) {
  const cashCreditChart = [
    { amount: data.salesToday.cash, label: 'Contado' },
    { amount: data.salesToday.credit, label: 'Crédito' },
  ]

  return (
    <DataPanel action={getAction(role, '/sales/history', 'Ver historial')} description="Resumen comercial con los agregados reales disponibles en reportes." eyebrow="Ventas" title="Últimas ventas">
      <CompactTable headers={['Tipo', 'Monto', 'Operaciones', 'Estado']}>
        <tr>
          <Td>Ventas de contado</Td>
          <Td className="text-right font-bold">{formatMoney(data.salesToday.cash)}</Td>
          <Td className="text-right">{formatQuantity(data.salesToday.count)}</Td>
          <Td><StatusBadge tone="green">Confirmado</StatusBadge></Td>
        </tr>
        <tr>
          <Td>Ventas a crédito</Td>
          <Td className="text-right font-bold">{formatMoney(data.salesToday.credit)}</Td>
          <Td className="text-right">Incluidas en total</Td>
          <Td><StatusBadge tone="amber">Seguimiento</StatusBadge></Td>
        </tr>
      </CompactTable>
      <div className="mt-5">
        <p className="mb-3 text-sm font-black">Ventas por canal</p>
        <SimpleBarChart items={cashCreditChart} />
      </div>
    </DataPanel>
  )
}

function DeliveryPanel({ data, role }: { data: DashboardReport; role: DashboardRole }) {
  const ownRoutes = role === 'DRIVER'

  return (
    <DataPanel action={ownRoutes ? getAction(role, '/my-routes', 'Abrir mis rutas') : getAction(role, '/delivery-routes', 'Ver rutas')} description={ownRoutes ? 'Vista operativa limitada a rutas propias permitidas.' : 'Resumen autorizado de pedidos pendientes, en ruta, entregados y con incidencia.'} eyebrow="Reparto" title={ownRoutes ? 'Próxima ruta y entregas' : 'Pedidos por surtir'}>
      <DeliveryChart summary={data.deliverySummary} />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <StatusBadge tone="amber">Pendientes: {formatQuantity(data.deliverySummary.pending)}</StatusBadge>
        <StatusBadge tone="blue">En ruta: {formatQuantity(data.deliverySummary.inRoute)}</StatusBadge>
        <StatusBadge tone="green">Entregadas: {formatQuantity(data.deliverySummary.delivered)}</StatusBadge>
        <StatusBadge tone="red">Incidencias: {formatQuantity(data.deliverySummary.incident)}</StatusBadge>
      </div>
    </DataPanel>
  )
}

function CollectionsPanel({ data, role }: { data: DashboardReport; role: DashboardRole }) {
  return (
    <DataPanel action={getAction(role, '/accounts-receivable', 'Abrir cobranza')} description="Cobranza visible únicamente para roles con acceso real al módulo." eyebrow="Cobranza" title="Cobranza próxima">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard detail={`${data.overdueReceivables.count} cuentas vencidas`} icon={CircleDollarSign} label="Saldo vencido" tone="red" value={formatMoney(data.overdueReceivables.balance)} />
        <KpiCard detail="Pagos de cuentas por cobrar registrados hoy" icon={ReceiptText} label="Cobros del día" tone="green" value={formatMoney(data.collectionsToday)} />
        <KpiCard detail="Cobros de ruta aún sin liquidación cerrada" icon={Route} label="Pendiente de liquidar" tone="amber" value={formatMoney(data.routeCollectionsPendingSettlement)} />
      </div>
    </DataPanel>
  )
}

function TopProductsPanel({ data }: { data: DashboardReport }) {
  return (
    <DataPanel description="Productos con mayor movimiento en el periodo autorizado." eyebrow="Productos" title="Top productos">
      <TopProductsChart items={data.topProducts} />
    </DataPanel>
  )
}

function QuickActionsPanel({ role }: { role: DashboardRole }) {
  const actions = getAllowedActions(role)

  return (
    <DataPanel description="Accesos rápidos filtrados con las mismas reglas de rutas protegidas." eyebrow="Acciones" title="Acciones por rol">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-4 py-2.5 text-sm font-semibold text-[var(--erp-foreground)] transition duration-200 hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)]" key={action.to} to={action.to}>
            {action.label}
          </Link>
        ))}
      </div>
    </DataPanel>
  )
}

function DashboardContent({ data, role }: { data: DashboardReport; role: DashboardRole }) {
  const capabilities = getRoleCapabilities(role)
  const paymentMethodChart = useMemo(() => data.paymentsByMethodToday?.map((item) => ({ amount: item.amount, label: item.paymentMethod ?? item.method ?? 'Sin método' })) ?? [], [data.paymentsByMethodToday])
  const isDriver = role === 'DRIVER'

  return (
    <div className="space-y-6">
      <FreshnessBar dataAsOf={formatDateTime(data.dataAsOf)} freshnessSeconds={data.freshnessSeconds} generatedAt={formatDateTime(data.generatedAt)} isStale={data.isStale} />
      {isDashboardEmpty(data) && <EmptyState description="Cambia la fecha o la ubicación operativa para consultar datos disponibles para tu rol." title="No hay operaciones para los filtros seleccionados" />}

      <RoleKpis data={data} role={role} />

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          {capabilities.sales && !isDriver && <SalesSummaryPanel data={data} role={role} />}
          {(capabilities.deliveryGlobal || capabilities.driverOwnRoutes || role === 'ADMIN') && <DeliveryPanel data={data} role={role} />}
          {capabilities.collections && <CollectionsPanel data={data} role={role} />}
          {capabilities.inventory && (
            <DataPanel action={getAction(role, '/inventory', 'Ver inventario')} description="Inventario crítico agrupado por ubicación operativa, nunca como stock global." eyebrow="Inventario" title="Inventario crítico">
              <LowStockTable canLinkInventory={canAccess(role, ROUTE_ACCESS_ROLES.inventory)} items={data.lowStockByLocation} />
            </DataPanel>
          )}
        </div>
        <div className="space-y-6">
          <QuickActionsPanel role={role} />
          <AlertsPanel data={data} role={role} />
          {capabilities.sales && !isDriver && (
            <DataPanel description="El endpoint actual no expone serie diaria; se conserva el espacio sin fabricar datos." eyebrow="Tendencia" title="Ventas últimos 7 días">
              <EmptyState description="Para graficar siete días se requiere que el contrato de reportes entregue la serie temporal. No se usan datos simulados." />
            </DataPanel>
          )}
          {capabilities.sales && !isDriver && <TopProductsPanel data={data} />}
          {(role === 'ADMIN' || role === 'COLLECTIONS') && (
            <DataPanel description="Métodos de pago agregados por el reporte existente." eyebrow="Pagos" title="Pagos por método">
              <SimpleBarChart items={paymentMethodChart} />
            </DataPanel>
          )}
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<DashboardReportFilters>({})
  const dashboard = useDashboardReport(filters)
  const role = getKnownRole(user?.role)
  const roleLabel = getRoleLabel(user?.role)
  const isDriver = role === 'DRIVER'

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-5 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-[92rem] flex-col gap-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-[var(--erp-charcoal)] p-6 text-white shadow-[0_24px_80px_rgba(17,24,21,0.18)] sm:p-8">
          <div className="absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(214,155,45,0.34),transparent_34%),linear-gradient(135deg,transparent,rgba(182,42,34,0.22))]" />
          <div className="relative grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--erp-brand-gold-soft)]">Dashboard Ejecutivo</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.07em] text-white sm:text-5xl">
                {isDriver ? 'Operación diaria de reparto' : 'Pulso ejecutivo del ERP'}
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/74">
                Vista profesional sensible al rol autenticado. KPIs, acciones y enlaces respetan permisos reales de rutas protegidas.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/15 bg-white/8 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Sesión</p>
              <p className="mt-2 text-xl font-black text-white">{user?.name ?? 'Usuario'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="amber">{roleLabel}</Badge>
                {user?.mustChangePassword && <Badge tone="red">Cambiar contraseña</Badge>}
              </div>
            </div>
          </div>
        </header>

        {user?.mustChangePassword && (
          <Card className="border-[rgba(214,155,45,0.32)] p-4">
            <p className="font-black">Cambio de contraseña requerido</p>
            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Completa el cambio antes de operar módulos normales.</p>
          </Card>
        )}

        <DashboardFilters filters={filters} onChange={setFilters} />

        {dashboard.isLoading && <LoadingState cards={8} />}
        {isUnauthorized(dashboard.error) && <UnauthorizedState />}
        {dashboard.error && !isUnauthorized(dashboard.error) && <ErrorState onRetry={() => void dashboard.refetch()} />}
        {dashboard.data && !dashboard.isLoading && !dashboard.error && <DashboardContent data={dashboard.data} role={role} />}
      </section>
    </main>
  )
}
