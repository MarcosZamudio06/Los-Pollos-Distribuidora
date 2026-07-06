import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiClientError } from '../../lib/api'
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Table, Td, Th } from '../../components/ui'
import { useAuth } from '../auth'
import {
  useAccountsReceivableReport,
  useCashClosingReport,
  useDeliveryOperationsReport,
  useInventoryByLocationReport,
  useInventoryLowStockReport,
  useSalesDailyReport,
} from './hooks'
import type {
  AccountsReceivableReport,
  CashClosingReport,
  DeliveryOperationsReport,
  InventoryReport,
  MoneyGroup,
  ReportFreshness,
  SalesDailyReport,
} from './types'

const moneyFormatter = new Intl.NumberFormat('es-MX', { currency: 'MXN', style: 'currency' })
const numberFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })
const dateTimeFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

type ReportKey = 'sales' | 'cash' | 'low-stock' | 'inventory' | 'receivables' | 'delivery'

type ReportQuery<TData> = {
  data?: TData
  error: unknown
  isError: boolean
  isFetching: boolean
  isLoading: boolean
  refetch: () => void
}

const reportTabs: Array<{ key: ReportKey; label: string; roles: string[] }> = [
  { key: 'sales', label: 'Ventas diarias', roles: ['ADMIN', 'SELLER'] },
  { key: 'cash', label: 'Corte operativo', roles: ['ADMIN', 'SELLER'] },
  { key: 'low-stock', label: 'Bajo inventario', roles: ['ADMIN', 'WAREHOUSE'] },
  { key: 'inventory', label: 'Inventario por ubicación', roles: ['ADMIN', 'WAREHOUSE', 'SELLER'] },
  { key: 'receivables', label: 'Cobranza', roles: ['ADMIN', 'COLLECTIONS'] },
  { key: 'delivery', label: 'Reparto', roles: ['ADMIN', 'COLLECTIONS', 'DRIVER'] },
]

const paymentTypes = [
  { label: 'Todos', value: '' },
  { label: 'Contado', value: 'CASH_SALE' },
  { label: 'Crédito', value: 'CREDIT_SALE' },
]

const collectionStatuses = [
  { label: 'Todos', value: '' },
  { label: 'Vigente / sin pagar', value: 'UNPAID' },
  { label: 'Parcialmente pagada', value: 'PARTIALLY_PAID' },
  { label: 'Pagada', value: 'PAID' },
  { label: 'Cancelada', value: 'CANCELLED' },
]

const agingStatuses = [
  { label: 'Todas', value: '' },
  { label: 'Vigente', value: 'CURRENT' },
  { label: 'Por vencer', value: 'DUE_SOON' },
  { label: 'Atrasada', value: 'OVERDUE' },
]

const deliveryStatuses = [
  { label: 'Todos', value: '' },
  { label: 'Pendiente', value: 'PENDING' },
  { label: 'En ruta', value: 'IN_ROUTE' },
  { label: 'Entregado', value: 'DELIVERED' },
  { label: 'Con incidencia', value: 'INCIDENT' },
]

function today() {
  return new Date().toISOString().slice(0, 10)
}

function formatMoney(value?: number | null) {
  return moneyFormatter.format(Number(value ?? 0))
}

function formatNumber(value?: number | null) {
  return numberFormatter.format(Number(value ?? 0))
}

function formatDateTime(value?: string | null) {
  if (!value) return 'Sin dato'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function hasAccess(role: string | undefined, allowedRoles: string[]) {
  return Boolean(role && allowedRoles.includes(role))
}

function isUnauthorized(error: unknown) {
  return error instanceof ApiClientError && [401, 403].includes(error.statusCode)
}

function reportHasData(data?: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  return Object.values(data).some((value) => {
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'number') return value > 0
    if (value && typeof value === 'object') return Object.values(value).some((nestedValue) => {
      if (Array.isArray(nestedValue)) return nestedValue.length > 0
      if (typeof nestedValue === 'number') return nestedValue > 0
      return false
    })
    return false
  })
}

function NativeSelect({ className = '', label, onChange, options, value }: {
  className?: string
  label: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value?: string
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs font-black uppercase tracking-[0.14em] text-[#68645c] ${className}`}>
      {label}
      <select
        className="rounded-xl border border-[#20211f]/15 bg-white px-3 py-2.5 text-sm font-semibold normal-case tracking-normal text-[#20211f] transition focus:border-[#39798b] focus:outline-none focus:ring-4 focus:ring-[#39798b]/15"
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ''}
      >
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

function TextFilter({ label, onChange, placeholder, value }: {
  label: string
  onChange: (value: string) => void
  placeholder?: string
  value?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-[0.14em] text-[#68645c]">
      {label}
      <Input
        className="normal-case tracking-normal"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value ?? ''}
      />
    </label>
  )
}

function DateFilter({ label, onChange, value }: { label: string; onChange: (value: string) => void; value?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-black uppercase tracking-[0.14em] text-[#68645c]">
      {label}
      <Input className="normal-case tracking-normal" onChange={(event) => onChange(event.target.value)} type="date" value={value ?? ''} />
    </label>
  )
}

function AdminUserFilter({ isAdmin, onChange, value }: { isAdmin: boolean; onChange: (value: string) => void; value?: string }) {
  if (!isAdmin) return null
  return <TextFilter label="Usuario" onChange={onChange} placeholder="ID de vendedor o usuario" value={value} />
}

function FreshnessNotice({ data }: { data?: ReportFreshness }) {
  if (!data?.generatedAt && !data?.dataAsOf) return null
  const isStale = Boolean(data.isStale || Number(data.freshnessSeconds ?? 0) > 60)

  return (
    <Alert tone={isStale ? 'warning' : 'info'}>
      <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
        <p className="font-bold">Generado: {formatDateTime(data.generatedAt)}</p>
        <p className="text-sm">
          Datos al: {formatDateTime(data.dataAsOf)} · Frescura: {formatNumber(data.freshnessSeconds)}s {isStale ? '· Datos fuera del objetivo de 60s' : '· Dentro del objetivo de 60s'}
        </p>
      </div>
    </Alert>
  )
}

function LoadingReport() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <Card className="p-5" key={index}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-8 w-36" />
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
      <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#20211f]">No tienes permisos para este reporte</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#68645c]">Revisa tu rol o vuelve a iniciar sesión si el acceso cambió.</p>
      <Link className="mt-6 inline-flex font-bold text-[#9d2d24]" to="/logout">Cerrar sesión</Link>
    </Card>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert tone="error">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black">No se pudo cargar el reporte</p>
          <p className="mt-1 text-sm">Verifica los filtros y la conexión con la API de reportes.</p>
        </div>
        <Button onClick={onRetry} variant="secondary">Reintentar</Button>
      </div>
    </Alert>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <Card className="p-8 text-center">
      <Badge tone="amber">Sin resultados</Badge>
      <h2 className="mt-4 text-3xl font-black tracking-[-0.05em] text-[#20211f]">No hay datos para estos filtros</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#68645c]">{children}</p>
    </Card>
  )
}

function StatCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#68645c]">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-[-0.06em] text-[#20211f]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[#68645c]">{detail}</p>
    </Card>
  )
}

function MoneyGroupsTable({ emptyLabel, groups, title }: { emptyLabel: string; groups?: MoneyGroup[]; title: string }) {
  return (
    <Card className="overflow-hidden p-5">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{emptyLabel}</CardDescription>
      </CardHeader>
      <CardContent className="mt-4 overflow-x-auto rounded-2xl border border-[#20211f]/10">
        <Table>
          <thead className="bg-[#f5f3ee]">
            <tr>
              <Th>Clasificación</Th>
              <Th>Conteo</Th>
              <Th>Monto</Th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).length === 0 ? (
              <tr><Td colSpan={3}>Sin movimientos registrados.</Td></tr>
            ) : groups?.map((group, index) => (
              <tr key={`${group.paymentMethod ?? group.method ?? group.bankName ?? 'grupo'}-${index}`}>
                <Td>{group.paymentMethod ?? group.method ?? group.bankName ?? 'Sin clasificar'}</Td>
                <Td>{formatNumber(group.count)}</Td>
                <Td>{formatMoney(group.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </CardContent>
    </Card>
  )
}

function ReportSection<TData extends ReportFreshness>({ children, emptyMessage, query }: {
  children: (data: TData) => ReactNode
  emptyMessage: ReactNode
  query: ReportQuery<TData>
}) {
  if (query.isLoading) return <LoadingReport />
  if (isUnauthorized(query.error)) return <UnauthorizedState />
  if (query.isError) return <ErrorState onRetry={query.refetch} />
  if (!reportHasData(query.data)) return <EmptyState>{emptyMessage}</EmptyState>

  return (
    <div className="space-y-5">
      <FreshnessNotice data={query.data} />
      {query.isFetching && <Alert tone="info">Actualizando datos del reporte…</Alert>}
      {query.data ? children(query.data) : null}
    </div>
  )
}

function SalesDailyReport({ isAdmin }: { isAdmin: boolean }) {
  const [filters, setFilters] = useState({ date: today(), documentType: '', locationId: '', paymentMethod: '', paymentType: '', userId: '' })
  const query = useSalesDailyReport(filters)

  return (
    <ReportPanel
      filters={
        <>
          <DateFilter label="Fecha" onChange={(date) => setFilters({ ...filters, date })} value={filters.date} />
          <AdminUserFilter isAdmin={isAdmin} onChange={(userId) => setFilters({ ...filters, userId })} value={filters.userId} />
          <TextFilter label="Ubicación" onChange={(locationId) => setFilters({ ...filters, locationId })} placeholder="ID de ubicación" value={filters.locationId} />
          <NativeSelect label="Tipo de venta" onChange={(paymentType) => setFilters({ ...filters, paymentType })} options={paymentTypes} value={filters.paymentType} />
          <TextFilter label="Método de pago" onChange={(paymentMethod) => setFilters({ ...filters, paymentMethod })} placeholder="Efectivo, transferencia…" value={filters.paymentMethod} />
          <TextFilter label="Documento" onChange={(documentType) => setFilters({ ...filters, documentType })} placeholder="Ticket, nota…" value={filters.documentType} />
        </>
      }
      subtitle="Ventas confirmadas separadas por contado, crédito, cobranza y documento."
      title="Reporte de ventas diarias"
    >
      <ReportSection<SalesDailyReport> emptyMessage="Cambia la fecha, ubicación o vendedor para consultar operaciones confirmadas." query={query}>
        {(data) => (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard detail="Ventas confirmadas" label="Total" value={formatMoney(data.summary?.total)} />
              <StatCard detail="Solo ventas de contado" label="Contado" value={formatMoney(data.summary?.cash)} />
              <StatCard detail="No se trata como efectivo" label="Crédito" value={formatMoney(data.summary?.credit)} />
              <StatCard detail="Notas separadas" label="Cancelado" value={formatMoney(data.summary?.canceled)} />
            </div>
            <MoneyGroupsTable emptyLabel="Importes derivados de pagos no cancelados." groups={data.byPaymentMethod} title="Métodos de pago" />
            <Card className="overflow-hidden p-5">
              <CardHeader>
                <CardTitle>Ventas</CardTitle>
                <CardDescription>Cliente, vendedor, ubicación, documento, método y total.</CardDescription>
              </CardHeader>
              <CardContent className="mt-4 overflow-x-auto rounded-2xl border border-[#20211f]/10">
                <Table>
                  <thead className="bg-[#f5f3ee]"><tr><Th>Venta</Th><Th>Cliente</Th><Th>Vendedor</Th><Th>Ubicación</Th><Th>Tipo</Th><Th>Documento</Th><Th>Métodos</Th><Th>Total</Th></tr></thead>
                  <tbody>
                    {(data.items ?? []).map((item, index) => (
                      <tr key={item.saleId ?? item.saleNumber ?? index}>
                        <Td>{item.saleNumber ?? 'Sin folio'}</Td>
                        <Td>{item.customerName ?? item.clientName ?? 'Público general'}</Td>
                        <Td>{item.sellerName ?? 'Sin vendedor'}</Td>
                        <Td>{item.locationName ?? 'Sin ubicación'}</Td>
                        <Td><Badge tone={item.paymentType === 'CREDIT_SALE' ? 'amber' : 'green'}>{item.paymentType === 'CREDIT_SALE' ? 'Crédito' : 'Contado'}</Badge></Td>
                        <Td>{item.documentType ?? item.documentNumber ?? 'Sin documento'}</Td>
                        <Td>{item.paymentMethods?.length ? item.paymentMethods.join(', ') : 'Sin pagos'}</Td>
                        <Td>{formatMoney(item.total)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </ReportSection>
    </ReportPanel>
  )
}

function CashClosingReport({ isAdmin }: { isAdmin: boolean }) {
  const [filters, setFilters] = useState({ date: today(), locationId: '', userId: '' })
  const query = useCashClosingReport(filters)

  return (
    <ReportPanel
      filters={<><DateFilter label="Fecha" onChange={(date) => setFilters({ ...filters, date })} value={filters.date} /><AdminUserFilter isAdmin={isAdmin} onChange={(userId) => setFilters({ ...filters, userId })} value={filters.userId} /><TextFilter label="Ubicación" onChange={(locationId) => setFilters({ ...filters, locationId })} placeholder="ID de ubicación" value={filters.locationId} /></>}
      subtitle="Corte operativo; no sustituye cierre contable ni liquidación de ruta."
      title="Corte operativo de caja"
    >
      <ReportSection<CashClosingReport> emptyMessage="No hay ventas, pagos o cobros de ruta para los filtros seleccionados." query={query}>
        {(data) => (
          <div className="grid gap-5 xl:grid-cols-2">
            <MoneyGroupsTable emptyLabel="Ventas de contado por método." groups={data.cashSales} title="Ventas de contado" />
            <MoneyGroupsTable emptyLabel="Crédito separado de efectivo recibido." groups={data.creditSales} title="Ventas a crédito" />
            <MoneyGroupsTable emptyLabel="Pagos directos de cuentas por cobrar." groups={data.accountsReceivablePayments} title="Cobranza en caja" />
            <MoneyGroupsTable emptyLabel="Cobros pendientes o liquidados de rutas." groups={data.routeCollections} title="Cobros en ruta" />
            <MoneyGroupsTable emptyLabel="Transferencias y depósitos confirmados." groups={data.bankTransfersAndDeposits} title="Transferencias y depósitos" />
            <MoneyGroupsTable emptyLabel="Resumen agrupado por banco." groups={data.paymentsByBank} title="Pagos por banco" />
          </div>
        )}
      </ReportSection>
    </ReportPanel>
  )
}

function LowStockReport() {
  const [filters, setFilters] = useState({ categoryId: '', locationId: '', productId: '', search: '' })
  const query = useInventoryLowStockReport(filters)

  return (
    <InventoryPanel
      filters={filters}
      onChange={setFilters}
      query={query}
      subtitle="Productos bajo mínimo por ubicación operativa; nunca stock global."
      title="Reporte de bajo inventario"
    />
  )
}

function InventoryByLocationReport() {
  const [filters, setFilters] = useState({ categoryId: '', locationId: '', productId: '', search: '' })
  const query = useInventoryByLocationReport(filters)

  return (
    <InventoryPanel
      filters={filters}
      onChange={setFilters}
      query={query}
      showSearch
      subtitle="Saldos disponibles agrupados claramente por ubicación."
      title="Inventario por ubicación"
    />
  )
}

type InventoryPanelFilters = { categoryId: string; locationId: string; productId: string; search: string }

function InventoryPanel({ filters, onChange, query, showSearch = false, subtitle, title }: {
  filters: InventoryPanelFilters
  onChange: (filters: InventoryPanelFilters) => void
  query: ReportQuery<InventoryReport>
  showSearch?: boolean
  subtitle: string
  title: string
}) {
  return (
    <ReportPanel
      filters={<><TextFilter label="Ubicación" onChange={(locationId) => onChange({ ...filters, locationId })} placeholder="ID de ubicación" value={filters.locationId} /><TextFilter label="Producto" onChange={(productId) => onChange({ ...filters, productId })} placeholder="ID de producto" value={filters.productId} /><TextFilter label="Categoría" onChange={(categoryId) => onChange({ ...filters, categoryId })} placeholder="ID de categoría" value={filters.categoryId} />{showSearch && <TextFilter label="Búsqueda" onChange={(search) => onChange({ ...filters, search })} placeholder="Producto o SKU" value={filters.search} />}</>}
      subtitle={subtitle}
      title={title}
    >
      <ReportSection<InventoryReport> emptyMessage="No hay saldos para los filtros seleccionados." query={query}>
        {(data) => (
          <Card className="overflow-hidden p-5">
            <CardHeader><CardTitle>{title}</CardTitle><CardDescription>Kilos, piezas, mínimos y último movimiento.</CardDescription></CardHeader>
            <CardContent className="mt-4 overflow-x-auto rounded-2xl border border-[#20211f]/10">
              <Table>
                <thead className="bg-[#f5f3ee]"><tr><Th>Ubicación</Th><Th>Producto</Th><Th>Unidad</Th><Th>Kilos</Th><Th>Piezas</Th><Th>Mínimo kg</Th><Th>Mínimo piezas</Th><Th>Estado</Th><Th>Último movimiento</Th></tr></thead>
                <tbody>
                  {(data.items ?? []).map((item) => (
                    <tr key={`${item.locationId}-${item.productId}`}>
                      <Td>{item.locationName ?? item.locationId}</Td>
                      <Td><span className="font-bold">{item.productName ?? item.productId}</span>{item.sku && <span className="block text-xs text-[#68645c]">SKU {item.sku}</span>}</Td>
                      <Td>{item.unit ?? 'Sin unidad'}</Td>
                      <Td>{formatNumber(item.quantityKg)}</Td>
                      <Td>{formatNumber(item.quantityPieces)}</Td>
                      <Td>{formatNumber(item.minQuantityKg)}</Td>
                      <Td>{formatNumber(item.minQuantityPieces)}</Td>
                      <Td><Badge tone={item.isLowStock ? 'red' : 'green'}>{item.isLowStock ? 'Bajo stock' : 'Suficiente'}</Badge></Td>
                      <Td>{formatDateTime(item.lastMovementAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        )}
      </ReportSection>
    </ReportPanel>
  )
}

function AccountsReceivableReport() {
  const [filters, setFilters] = useState({ agingStatus: '', customerId: '', dueDateFrom: '', dueDateTo: '', status: '' })
  const query = useAccountsReceivableReport(filters)

  return (
    <ReportPanel
      filters={<><TextFilter label="Cliente" onChange={(customerId) => setFilters({ ...filters, customerId })} placeholder="ID de cliente" value={filters.customerId} /><NativeSelect label="Estado de cobranza" onChange={(status) => setFilters({ ...filters, status })} options={collectionStatuses} value={filters.status} /><NativeSelect label="Antigüedad" onChange={(agingStatus) => setFilters({ ...filters, agingStatus })} options={agingStatuses} value={filters.agingStatus} /><DateFilter label="Vence desde" onChange={(dueDateFrom) => setFilters({ ...filters, dueDateFrom })} value={filters.dueDateFrom} /><DateFilter label="Vence hasta" onChange={(dueDateTo) => setFilters({ ...filters, dueDateTo })} value={filters.dueDateTo} /></>}
      subtitle="Saldo original, pendiente, vencido y pagos conservando accountReceivableId."
      title="Reporte de cuentas por cobrar"
    >
      <ReportSection<AccountsReceivableReport> emptyMessage="No hay cuentas por cobrar para los filtros seleccionados." query={query}>
        {(data) => (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <StatCard detail="Saldo de origen" label="Original" value={formatMoney(data.summary?.originalBalance)} />
              <StatCard detail="Pendiente por cobrar" label="Pendiente" value={formatMoney(data.summary?.pendingBalance)} />
              <StatCard detail="Crédito atrasado" label="Vencido" value={formatMoney(data.summary?.overdueBalance)} />
              <StatCard detail="Pagos del periodo" label="Pagado" value={formatMoney(data.summary?.paymentsInPeriod)} />
            </div>
            <Card className="overflow-hidden p-5">
              <CardHeader><CardTitle>Cuentas por cobrar</CardTitle><CardDescription>Cliente, venta, vencimiento, folio físico, saldo y estado.</CardDescription></CardHeader>
              <CardContent className="mt-4 overflow-x-auto rounded-2xl border border-[#20211f]/10">
                <Table>
                  <thead className="bg-[#f5f3ee]"><tr><Th>Cliente</Th><Th>Venta</Th><Th>Vencimiento</Th><Th>Folio físico</Th><Th>Saldo</Th><Th>Estado</Th><Th>Antigüedad</Th></tr></thead>
                  <tbody>{(data.items ?? []).map((item, index) => (<tr key={item.accountReceivableId ?? index}><Td>{item.customerName ?? item.clientName ?? 'Sin cliente'}</Td><Td>{item.saleNumber ?? item.saleId ?? 'Sin venta'}</Td><Td>{formatDateTime(item.dueDate)}</Td><Td>{item.physicalFolio ?? 'Sin folio'}</Td><Td>{formatMoney(item.balance)}</Td><Td>{item.status ?? 'Sin estado'}</Td><Td>{item.agingStatus ?? 'Sin antigüedad'}</Td></tr>))}</tbody>
                </Table>
              </CardContent>
            </Card>
            <div className="grid gap-5 xl:grid-cols-2"><MoneyGroupsTable emptyLabel="Pagos por método." groups={data.paymentsByMethod} title="Pagos por método" /><MoneyGroupsTable emptyLabel="Pagos agrupados por banco." groups={data.paymentsByBank} title="Pagos por banco" /></div>
          </>
        )}
      </ReportSection>
    </ReportPanel>
  )
}

function DeliveryOperationsReport() {
  const [filters, setFilters] = useState({ dateFrom: today(), dateTo: today(), driverId: '', routeId: '', status: '' })
  const query = useDeliveryOperationsReport(filters)

  return (
    <ReportPanel
      filters={<><DateFilter label="Desde" onChange={(dateFrom) => setFilters({ ...filters, dateFrom })} value={filters.dateFrom} /><DateFilter label="Hasta" onChange={(dateTo) => setFilters({ ...filters, dateTo })} value={filters.dateTo} /><TextFilter label="Ruta" onChange={(routeId) => setFilters({ ...filters, routeId })} placeholder="ID de ruta" value={filters.routeId} /><TextFilter label="Repartidor" onChange={(driverId) => setFilters({ ...filters, driverId })} placeholder="ID de repartidor" value={filters.driverId} /><NativeSelect label="Estado" onChange={(status) => setFilters({ ...filters, status })} options={deliveryStatuses} value={filters.status} /></>}
      subtitle="Cobros en ruta separados de contado y cobranza directa."
      title="Reporte de operaciones de reparto"
    >
      <ReportSection<DeliveryOperationsReport> emptyMessage="No hay pedidos, cobros o incidencias para el rango seleccionado." query={query}>
        {(data) => (
          <>
            <div className="grid gap-5 xl:grid-cols-2">
              <SummaryMapCard entries={data.deliverySummary} title="Pedidos por estado" />
              <SummaryMapCard entries={data.evidenceSummary} title="Evidencias por tipo" />
              <SummaryMapCard entries={data.settlementsSummary} title="Liquidaciones" />
              <MoneyGroupsTable emptyLabel="Cobros por ruta, método y vuelta." groups={data.collectionsSummary} title="Cobros en ruta" />
            </div>
            <Card className="overflow-hidden p-5">
              <CardHeader><CardTitle>Incidencias</CardTitle><CardDescription>Devoluciones, rechazos parciales, no entregas y créditos atrasados.</CardDescription></CardHeader>
              <CardContent className="mt-4 overflow-x-auto rounded-2xl border border-[#20211f]/10">
                <Table>
                  <thead className="bg-[#f5f3ee]"><tr><Th>Ruta</Th><Th>Tipo</Th><Th>Estado</Th><Th>Severidad</Th><Th>Descripción</Th></tr></thead>
                  <tbody>{(data.incidents ?? []).map((incident, index) => (<tr key={`${incident.type ?? 'incidencia'}-${index}`}><Td>{incident.routeName ?? 'Sin ruta'}</Td><Td>{incident.type ?? 'Sin tipo'}</Td><Td>{incident.status ?? 'Sin estado'}</Td><Td>{incident.severity ?? 'Sin severidad'}</Td><Td>{incident.description ?? 'Sin descripción'}</Td></tr>))}</tbody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </ReportSection>
    </ReportPanel>
  )
}

function SummaryMapCard({ entries, title }: { entries?: Record<string, number>; title: string }) {
  const rows = Object.entries(entries ?? {})
  return (
    <Card className="p-5">
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>Conteo operativo confirmado.</CardDescription></CardHeader>
      <CardContent className="mt-4 space-y-3">
        {rows.length === 0 ? <p className="rounded-2xl bg-[#f5f3ee] p-4 text-sm text-[#68645c]">Sin datos registrados.</p> : rows.map(([label, value]) => (
          <div className="flex items-center justify-between rounded-2xl bg-[#f5f3ee] px-4 py-3" key={label}>
            <span className="font-bold text-[#20211f]">{label}</span>
            <span className="text-2xl font-black tracking-[-0.05em] text-[#39798b]">{formatNumber(value)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ReportPanel({ children, filters, subtitle, title }: { children: ReactNode; filters: ReactNode; subtitle: string; title: string }) {
  return (
    <section className="space-y-5">
      <Card className="p-5">
        <CardHeader>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{filters}</CardContent>
      </Card>
      {children}
    </section>
  )
}

export function ReportsPage() {
  const { user } = useAuth()
  const [activeReport, setActiveReport] = useState<ReportKey>('sales')
  const role = user?.role
  const isAdmin = role === 'ADMIN'
  const visibleTabs = useMemo(() => reportTabs.filter((tab) => hasAccess(role, tab.roles)), [role])
  const selectedReport = visibleTabs.some((tab) => tab.key === activeReport) ? activeReport : visibleTabs[0]?.key

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-4 py-6 text-[#20211f] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-[#20211f]/10 bg-[#20211f] text-white shadow-[0_30px_100px_rgba(32,33,31,0.18)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0b44c]">TASK-092 · Reportes operativos</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.07em] sm:text-5xl">Mesa de control para vender, cobrar, surtir y repartir sin perder trazabilidad.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70">Reportes casi en tiempo real basados en operaciones confirmadas. El diseño separa caja, crédito, inventario y reparto para que nadie confunda ingreso recibido con saldo por cobrar.</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Frescura operativa</p>
              <p className="mt-3 text-5xl font-black tracking-[-0.08em] text-[#f0b44c]">60s</p>
              <p className="mt-3 text-sm leading-6 text-white/70">Cada reporte muestra generación, datos incluidos y advertencia cuando el dato está viejo.</p>
            </div>
          </div>
        </div>

        {visibleTabs.length === 0 ? <UnauthorizedState /> : (
          <>
            <nav aria-label="Reportes disponibles" className="flex gap-2 overflow-x-auto rounded-[1.35rem] border border-[#20211f]/10 bg-white p-2 shadow-sm">
              {visibleTabs.map((tab) => (
                <Button
                  aria-pressed={selectedReport === tab.key}
                  className={selectedReport === tab.key ? '' : 'whitespace-nowrap'}
                  key={tab.key}
                  onClick={() => setActiveReport(tab.key)}
                  variant={selectedReport === tab.key ? 'primary' : 'ghost'}
                >
                  {tab.label}
                </Button>
              ))}
            </nav>

            {selectedReport === 'sales' && <SalesDailyReport isAdmin={isAdmin} />}
            {selectedReport === 'cash' && <CashClosingReport isAdmin={isAdmin} />}
            {selectedReport === 'low-stock' && <LowStockReport />}
            {selectedReport === 'inventory' && <InventoryByLocationReport />}
            {selectedReport === 'receivables' && <AccountsReceivableReport />}
            {selectedReport === 'delivery' && <DeliveryOperationsReport />}
          </>
        )}
      </section>
    </main>
  )
}
