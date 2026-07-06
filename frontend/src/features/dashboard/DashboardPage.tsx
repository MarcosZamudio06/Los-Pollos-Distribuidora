import { useMemo, useState } from 'react'
import { Bar, BarChart as RechartsBarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { Link } from 'react-router-dom'
import { ApiClientError } from '../../lib/api'
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ChartContainer, Input, Skeleton, Table, Td, Th, type ChartConfig } from '../../components/ui'
import { useAuth } from '../auth'
import { useDashboardReport } from '../reportes'
import type { DashboardDeliverySummary, DashboardLowStockItem, DashboardReport, DashboardReportFilters, DashboardTopProduct } from '../reportes'

const moneyFormatter = new Intl.NumberFormat('es-MX', { currency: 'MXN', style: 'currency' })
const numberFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })
const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

type Role = 'ADMIN' | 'SELLER' | 'WAREHOUSE' | 'COLLECTIONS' | 'DRIVER' | string

type MetricCardProps = {
  accent?: 'amber' | 'blue' | 'green' | 'red'
  detail: string
  label: string
  value: string
}

const roleLabels: Record<string, string> = {
  ADMIN: 'Administración',
  COLLECTIONS: 'Cobranza',
  DRIVER: 'Reparto',
  SELLER: 'Ventas',
  WAREHOUSE: 'Almacén',
}

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

function hasRole(role: Role | undefined, roles: string[]) {
  return Boolean(role && roles.includes(role))
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiClientError && [401, 403].includes(error.statusCode)
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

function MetricCard({ accent = 'blue', detail, label, value }: MetricCardProps) {
  const accentClasses = {
    amber: 'from-[#f0b44c]/20 to-transparent text-[#815512]',
    blue: 'from-[#39798b]/18 to-transparent text-[#275969]',
    green: 'from-[#4d7f4a]/18 to-transparent text-[#315f2e]',
    red: 'from-[#d43f2f]/16 to-transparent text-[#9d2d24]',
  }

  return (
    <Card className="overflow-hidden p-5">
      <div className={`-mx-5 -mt-5 h-2 bg-gradient-to-r ${accentClasses[accent]}`} />
      <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[#68645c]">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-[-0.06em] text-[#20211f]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[#68645c]">{detail}</p>
    </Card>
  )
}

function DashboardLoading() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <Card className="p-5" key={index}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-5 h-9 w-36" />
          <Skeleton className="mt-4 h-4 w-full" />
        </Card>
      ))}
    </div>
  )
}

function UnauthorizedState() {
  return (
    <Card className="p-8 text-center">
      <Badge tone="red">Sin autorización</Badge>
      <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#20211f]">No tienes permisos para este tablero</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#68645c]">
        Tu sesión no puede consultar las métricas del tablero. Revisa tu rol o vuelve a iniciar sesión si cambió tu acceso.
      </p>
      <Link className="mt-6 inline-flex font-bold text-[#9d2d24]" to="/logout">Cerrar sesión</Link>
    </Card>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert tone="error">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black">No se pudo cargar el tablero</p>
          <p className="mt-1 text-sm">Verifica la conexión con reportes y vuelve a intentarlo.</p>
        </div>
        <Button onClick={onRetry} variant="secondary">Reintentar</Button>
      </div>
    </Alert>
  )
}

function EmptyState() {
  return (
    <Card className="p-8 text-center">
      <Badge tone="amber">Sin actividad</Badge>
      <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#20211f]">No hay operaciones para los filtros seleccionados</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#68645c]">
        Cambia la fecha o la ubicación operativa para consultar ventas, inventario, cobranza y reparto disponibles.
      </p>
    </Card>
  )
}

function FreshnessBanner({ data }: { data: DashboardReport }) {
  const stale = Boolean(data.isStale)
  return (
    <Alert tone={stale ? 'warning' : 'info'}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-bold">Generado: {formatDateTime(data.generatedAt)}</p>
        <p className="text-sm">
          Datos al: {formatDateTime(data.dataAsOf)} · Frescura: {data.freshnessSeconds}s {stale ? '· Requiere revisión' : '· Dentro del objetivo de 60s'}
        </p>
      </div>
    </Alert>
  )
}

function LowStockTable({ items }: { items: DashboardLowStockItem[] }) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-[#f5f3ee] p-4 text-sm text-[#68645c]">Sin productos en bajo stock para el alcance autorizado.</p>
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#20211f]/10">
      <Table>
        <thead className="bg-[#f5f3ee]">
          <tr>
            <Th>Ubicación operativa</Th>
            <Th>Producto</Th>
            <Th>Unidad</Th>
            <Th>Kilos actuales</Th>
            <Th>Piezas actuales</Th>
            <Th>Mínimo kg</Th>
            <Th>Mínimo piezas</Th>
            <Th>Estado</Th>
            <Th>Acción</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.locationId}-${item.productId}`}>
              <Td>{item.locationName || item.locationId}</Td>
              <Td>
                <span className="font-bold">{item.productName || item.productId}</span>
                {item.sku && <span className="block text-xs text-[#68645c]">SKU {item.sku}</span>}
              </Td>
              <Td>{item.unit || 'Sin unidad'}</Td>
              <Td>{formatQuantity(item.quantityKg)}</Td>
              <Td>{formatQuantity(item.quantityPieces)}</Td>
              <Td>{formatQuantity(item.minQuantityKg)}</Td>
              <Td>{formatQuantity(item.minQuantityPieces)}</Td>
              <Td><Badge tone={item.isLowStock === false ? 'green' : 'red'}>{item.isLowStock === false ? 'Suficiente' : 'Bajo stock'}</Badge></Td>
              <Td><Link className="font-bold text-[#39798b]" to="/inventory">Revisar</Link></Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  )
}

function SimpleBarChart({ items, labelKey, valueKey }: { items: Record<string, unknown>[]; labelKey: string; valueKey: string }) {
  const chartConfig = {
    value: { color: '#39798b', label: 'Valor' },
  } satisfies ChartConfig

  if (items.length === 0) {
    return <p className="rounded-2xl bg-[#f5f3ee] p-4 text-sm text-[#68645c]">Sin datos suficientes para graficar.</p>
  }

  const chartData = items.slice(0, 5).map((item) => ({
    label: String(item[labelKey] ?? 'Sin clasificar'),
    value: Number(item[valueKey] ?? 0),
  }))

  return (
    <ChartContainer config={chartConfig}>
      <ResponsiveContainer height={220} width="100%">
        <RechartsBarChart accessibilityLayer data={chartData} layout="vertical" margin={{ bottom: 8, left: 8, right: 20, top: 8 }}>
          <CartesianGrid horizontal={false} strokeDasharray="4 4" />
          <XAxis axisLine={false} tickFormatter={(value) => formatMoney(Number(value))} tickLine={false} type="number" />
          <YAxis axisLine={false} dataKey="label" tickLine={false} type="category" width={104} />
          <Bar dataKey="value" fill="var(--color-value)" radius={[0, 10, 10, 0]} />
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

  return <SimpleBarChart items={normalized} labelKey="label" valueKey="amount" />
}

function DeliveryChart({ summary }: { summary: DashboardDeliverySummary }) {
  return (
    <SimpleBarChart
      items={[
        { amount: summary.pending, label: 'Pendientes' },
        { amount: summary.inRoute, label: 'En ruta' },
        { amount: summary.delivered, label: 'Entregados' },
        { amount: summary.incident, label: 'Con incidencia' },
      ]}
      labelKey="label"
      valueKey="amount"
    />
  )
}

function DashboardFilters({ filters, onChange }: { filters: DashboardReportFilters; onChange: (filters: DashboardReportFilters) => void }) {
  return (
    <form className="grid gap-3 rounded-[1.35rem] border border-[#20211f]/10 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto]">
      <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-[0.14em] text-[#68645c]">
        Fecha
        <Input
          className="normal-case tracking-normal"
          onChange={(event) => onChange({ ...filters, date: event.target.value || undefined })}
          type="date"
          value={filters.date ?? ''}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-[0.14em] text-[#68645c]">
        Ubicación operativa
        <Input
          className="normal-case tracking-normal"
          onChange={(event) => onChange({ ...filters, locationId: event.target.value || undefined })}
          placeholder="Clave de ubicación autorizada"
          value={filters.locationId ?? ''}
        />
      </label>
      <Button className="self-end" onClick={() => onChange({})} variant="secondary">Limpiar filtros</Button>
    </form>
  )
}

function RoleCards({ data, role }: { data: DashboardReport; role?: Role }) {
  const canSeeCollections = hasRole(role, ['ADMIN', 'COLLECTIONS'])
  const canSeeDelivery = hasRole(role, ['ADMIN', 'COLLECTIONS', 'DRIVER'])

  if (!canSeeCollections && !canSeeDelivery) return null

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {canSeeCollections && (
        <Card className="p-6">
          <CardHeader>
            <Badge tone="red">Cobranza</Badge>
            <CardTitle>Cartera que necesita seguimiento</CardTitle>
            <CardDescription>Incluye saldos vencidos y cobros autorizados del día, sin mezclarlos con venta de contado.</CardDescription>
          </CardHeader>
          <CardContent className="mt-5 grid gap-4 sm:grid-cols-3">
            <MetricCard accent="red" detail={`${data.overdueReceivables.count} cuentas vencidas`} label="Saldo vencido" value={formatMoney(data.overdueReceivables.balance)} />
            <MetricCard accent="green" detail="Pagos de cuentas por cobrar registrados hoy" label="Cobros del día" value={formatMoney(data.collectionsToday)} />
            <MetricCard accent="amber" detail="Cobros de ruta aún sin liquidación cerrada" label="Pendiente de liquidar" value={formatMoney(data.routeCollectionsPendingSettlement)} />
          </CardContent>
        </Card>
      )}
      {canSeeDelivery && (
        <Card className="p-6">
          <CardHeader>
            <Badge tone="blue">Reparto</Badge>
            <CardTitle>Estado operativo de rutas</CardTitle>
            <CardDescription>Vista autorizada de pedidos pendientes, en ruta, entregados y con incidencia.</CardDescription>
          </CardHeader>
          <CardContent className="mt-5">
            <DeliveryChart summary={data.deliverySummary} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function DashboardContent({ data, role }: { data: DashboardReport; role?: Role }) {
  const canSeeSales = hasRole(role, ['ADMIN', 'SELLER'])
  const canSeeInventory = hasRole(role, ['ADMIN', 'WAREHOUSE'])
  const paymentMethodChart = useMemo(() => data.paymentsByMethodToday?.map((item) => ({ amount: item.amount, label: item.paymentMethod ?? 'Sin método' })) ?? [], [data.paymentsByMethodToday])
  const cashCreditChart = useMemo(() => [
    { amount: data.salesToday.cash, label: 'Contado' },
    { amount: data.salesToday.credit, label: 'Crédito' },
  ], [data.salesToday.cash, data.salesToday.credit])

  return (
    <div className="space-y-6">
      <FreshnessBanner data={data} />
      {isDashboardEmpty(data) && <EmptyState />}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {canSeeSales && (
          <>
            <MetricCard accent="green" detail={`${data.salesToday.count} ventas · contado ${formatMoney(data.salesToday.cash)} · crédito ${formatMoney(data.salesToday.credit)}`} label="Ventas del día" value={formatMoney(data.salesToday.total)} />
            <MetricCard accent="amber" detail="Ingresos confirmados por venta de contado" label="Caja por ventas" value={formatMoney(data.cashSalesToday)} />
            <MetricCard accent="blue" detail={`${data.billingRequestsToday ?? 0} solicitudes administrativas hoy`} label="Solicitudes internas" value={numberFormatter.format(data.billingRequestsToday ?? 0)} />
          </>
        )}
        {canSeeInventory && <MetricCard accent="red" detail="Agrupados por ubicación operativa, nunca como stock global" label="Productos en bajo stock" value={numberFormatter.format(data.lowStockByLocation.length)} />}
        {hasRole(role, ['ADMIN', 'COLLECTIONS']) && <MetricCard accent="red" detail={`${data.customersBlockedForCredit ?? 0} clientes bloqueados por crédito`} label="Saldo vencido" value={formatMoney(data.overdueReceivables.balance)} />}
        {hasRole(role, ['ADMIN', 'DRIVER', 'COLLECTIONS']) && <MetricCard accent="blue" detail="Pedidos pendientes, en ruta, entregados o con incidencia" label="Rutas activas" value={numberFormatter.format(data.deliverySummary.pending + data.deliverySummary.inRoute)} />}
      </div>

      <RoleCards data={data} role={role} />

      {canSeeInventory && (
        <Card className="p-6">
          <CardHeader>
            <Badge tone="red">Inventario</Badge>
            <CardTitle>Bajo stock por ubicación</CardTitle>
            <CardDescription>La tabla conserva ubicación operativa, kilos y piezas para evitar decisiones con stock global.</CardDescription>
          </CardHeader>
          <CardContent className="mt-5">
            <LowStockTable items={data.lowStockByLocation} />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {canSeeSales && (
          <Card className="p-6">
            <CardHeader>
              <CardTitle>Contado contra crédito</CardTitle>
              <CardDescription>Distribución de ventas confirmadas del día.</CardDescription>
            </CardHeader>
            <CardContent className="mt-5"><SimpleBarChart items={cashCreditChart} labelKey="label" valueKey="amount" /></CardContent>
          </Card>
        )}
        {hasRole(role, ['ADMIN', 'SELLER', 'COLLECTIONS']) && (
          <Card className="p-6">
            <CardHeader>
              <CardTitle>Pagos por método</CardTitle>
              <CardDescription>Agrupación derivada de pagos registrados, sin duplicar ventas.</CardDescription>
            </CardHeader>
            <CardContent className="mt-5"><SimpleBarChart items={paymentMethodChart} labelKey="label" valueKey="amount" /></CardContent>
          </Card>
        )}
        {hasRole(role, ['ADMIN', 'SELLER']) && (
          <Card className="p-6">
            <CardHeader>
              <CardTitle>Top productos</CardTitle>
              <CardDescription>Productos con mayor movimiento en el periodo autorizado.</CardDescription>
            </CardHeader>
            <CardContent className="mt-5"><TopProductsChart items={data.topProducts} /></CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<DashboardReportFilters>({})
  const dashboard = useDashboardReport(filters)
  const roleLabel = roleLabels[user?.role ?? ''] ?? user?.role ?? 'Sin rol'

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-5 py-6 text-[#20211f] sm:px-8 lg:px-10">
      <section className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="relative overflow-hidden rounded-[2rem] border border-[#20211f]/10 bg-[#20211f] p-6 text-white shadow-[0_24px_80px_rgba(32,33,31,0.16)] sm:p-8">
          <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(240,180,76,0.34),transparent_36%),linear-gradient(135deg,transparent,rgba(57,121,139,0.26))]" />
          <div className="relative grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0b44c]">Tablero operativo</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.07em] sm:text-5xl">Pulso diario por ventas, inventario, cobranza y reparto</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72">
                Consulta métricas casi en tiempo real según tu rol. La información financiera global permanece restringida.
              </p>
            </div>
            <div className="rounded-[1.35rem] border border-white/15 bg-white/8 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">Sesión</p>
              <p className="mt-2 text-xl font-black">{user?.name ?? 'Usuario'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="amber">{roleLabel}</Badge>
                {user?.mustChangePassword && <Badge tone="red">Cambiar contraseña</Badge>}
              </div>
            </div>
          </div>
        </header>

        {user?.mustChangePassword && (
          <Alert tone="warning">
            <p className="font-black">Cambio de contraseña requerido</p>
            <p className="mt-1 text-sm">Completa el cambio antes de operar módulos normales.</p>
          </Alert>
        )}

        <DashboardFilters filters={filters} onChange={setFilters} />

        {dashboard.isLoading && <DashboardLoading />}
        {isUnauthorized(dashboard.error) && <UnauthorizedState />}
        {dashboard.error && !isUnauthorized(dashboard.error) && <ErrorState onRetry={() => void dashboard.refetch()} />}
        {dashboard.data && !dashboard.isLoading && !dashboard.error && <DashboardContent data={dashboard.data} role={user?.role} />}
      </section>
    </main>
  )
}
