import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileText,
  Filter,
  LineChart,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Truck,
  WalletCards,
} from 'lucide-react'
import { ApiClientError } from '../../lib/api'
import { formatMoney } from '../../lib/money'
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
  CountAmountSummary,
  DeliveryOperationsReport,
  InventoryReport,
  MoneyGroup,
  ReportFreshness,
  SalesDailyReport,
} from './types'
import { CatalogSelect, MiniAjaxSelect, useOperationalCatalog } from '../../components/shared/operational-catalogs'
import { useRoutePlannerCatalog } from '../rutas-reparto/hooks'

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

const filterLabelClass = 'grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]'
const tableShellClass = 'mt-4 overflow-x-auto rounded-[1.2rem] border border-[color:var(--erp-border)] bg-white/70'
const tableRowClass = 'transition hover:bg-[var(--erp-surface)]'
const numericCellClass = 'text-right font-semibold tabular-nums'

const reportTabIcons: Record<ReportKey, ReactNode> = {
  sales: <BadgeDollarSign className="h-4 w-4" />,
  cash: <Banknote className="h-4 w-4" />,
  'low-stock': <AlertTriangle className="h-4 w-4" />,
  inventory: <Boxes className="h-4 w-4" />,
  receivables: <WalletCards className="h-4 w-4" />,
  delivery: <Truck className="h-4 w-4" />,
}

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
    <label className={`${filterLabelClass} ${className}`}>
      {label}
      <select
        className="h-10 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3.5 text-sm font-semibold normal-case tracking-normal text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition focus:border-[rgba(47,111,115,0.42)] focus:outline-none focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]"
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
    <label className={filterLabelClass}>
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
    <label className={filterLabelClass}>
      {label}
      <Input className="normal-case tracking-normal" onChange={(event) => onChange(event.target.value)} type="date" value={value ?? ''} />
    </label>
  )
}

function AdminUserFilter({ isAdmin, onChange, value }: { isAdmin: boolean; onChange: (value: string) => void; value?: string }) {
  if (!isAdmin) return null
  return <label className={filterLabelClass}>Usuario<MiniAjaxSelect className="h-10 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3.5 text-sm font-semibold normal-case tracking-normal" endpoint="/users?status=active" label="Usuario" onChange={onChange} placeholder="Escribe nombre o usuario" value={value} /></label>
}

function CatalogFilter({ constrainWidth = false, endpoint, label, onChange, value }: { constrainWidth?: boolean; endpoint: string; label: string; onChange: (value: string) => void; value?: string }) {
  const catalog = useOperationalCatalog(endpoint)
  return <label className={`${filterLabelClass} ${constrainWidth ? 'min-w-0' : ''}`}>{label}<CatalogSelect className={`h-10 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3.5 text-sm font-semibold normal-case tracking-normal ${constrainWidth ? 'w-full min-w-0 max-w-full' : ''}`} error={catalog.error} isLoading={catalog.isLoading} label={label} onChange={onChange} options={catalog.data} placeholder="Todos" value={value} /></label>
}

function FreshnessNotice({ data }: { data?: ReportFreshness }) {
  if (!data?.generatedAt && !data?.dataAsOf) return null
  const isStale = Boolean(data.isStale || Number(data.freshnessSeconds ?? 0) > 60)

  return (
    <Alert tone={isStale ? 'warning' : 'info'}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="flex items-center gap-2 font-bold"><RefreshCw className="h-4 w-4" />Generado: {formatDateTime(data.generatedAt)}</p>
        <p className="text-sm leading-6">
          Datos al: {formatDateTime(data.dataAsOf)} · Frescura: {formatNumber(data.freshnessSeconds)}s {isStale ? '· Datos fuera del objetivo de 60s' : '· Dentro del objetivo de 60s'}
        </p>
      </div>
    </Alert>
  )
}

function LoadingReport() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <Card className="overflow-hidden p-5" key={index}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-4 h-8 w-36" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-3 h-4 w-2/3" />
        </Card>
      ))}
    </div>
  )
}

function UnauthorizedState() {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] text-[var(--erp-danger)]">
        <ShieldAlert className="h-6 w-6" />
      </div>
      <Badge className="mt-5" tone="red">Sin autorización</Badge>
      <h2 className="mx-auto mt-4 max-w-2xl text-2xl font-black tracking-[-0.05em] text-[var(--erp-foreground)] sm:text-3xl">No tienes permisos para este reporte</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--erp-muted-foreground)]">Revisa tu rol o vuelve a iniciar sesión si el acceso cambió.</p>
      <Link className="mt-6 inline-flex font-bold text-[var(--erp-danger)]" to="/logout">Cerrar sesión</Link>
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
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(214,155,45,0.24)] bg-[rgba(214,155,45,0.10)] text-[var(--erp-brand-gold-deep)]">
        <Search className="h-6 w-6" />
      </div>
      <Badge className="mt-5" tone="amber">Sin resultados</Badge>
      <h2 className="mx-auto mt-4 max-w-2xl text-2xl font-black tracking-[-0.05em] text-[var(--erp-foreground)] sm:text-3xl">No hay datos para estos filtros</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[var(--erp-muted-foreground)]">{children}</p>
    </Card>
  )
}

function StatCard({ detail, icon, label, tone = 'info', value }: { detail: string; icon?: ReactNode; label: string; tone?: 'danger' | 'gold' | 'info' | 'success'; value: string }) {
  const toneClass = {
    danger: 'text-[var(--erp-danger)] bg-[rgba(157,45,36,0.08)] border-[rgba(157,45,36,0.18)]',
    gold: 'text-[var(--erp-brand-gold-deep)] bg-[rgba(214,155,45,0.10)] border-[rgba(214,155,45,0.22)]',
    info: 'text-[var(--erp-info)] bg-[rgba(47,111,115,0.08)] border-[rgba(47,111,115,0.20)]',
    success: 'text-[var(--erp-success)] bg-[rgba(63,123,65,0.08)] border-[rgba(63,123,65,0.20)]',
  }[tone]

  return (
    <Card className="p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--erp-shadow-elevated)]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">{label}</p>
        {icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneClass}`}>{icon}</span>}
      </div>
      <p className="mt-4 break-words text-2xl font-black tracking-[-0.06em] text-[var(--erp-foreground)] sm:text-3xl">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">{detail}</p>
    </Card>
  )
}

export function CreditSalesSummary({ creditSales }: { creditSales?: CountAmountSummary }) {
  return (
    <StatCard
      detail={`${formatNumber(creditSales?.count)} venta(s) a crédito; no representa efectivo recibido.`}
      icon={<CreditCard className="h-5 w-5" />}
      label="Ventas a crédito"
      value={formatMoney(creditSales?.amount)}
    />
  )
}

export function CashClosingSummary({ data }: { data: CashClosingReport }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <MoneyGroupsTable emptyLabel="Ventas de contado por método." groups={data.cashSales} title="Ventas de contado" />
      <CreditSalesSummary creditSales={data.creditSales} />
      <MoneyGroupsTable emptyLabel="Pagos directos de cuentas por cobrar." groups={data.accountsReceivablePayments} title="Cobranza en caja" />
      <MoneyGroupsTable emptyLabel="Cobros pendientes o liquidados de rutas." groups={data.routeCollections} title="Cobros en ruta" />
      <MoneyGroupsTable emptyLabel="Transferencias y depósitos confirmados." groups={data.bankTransfersAndDeposits} title="Transferencias y depósitos" />
      <MoneyGroupsTable emptyLabel="Resumen agrupado por banco." groups={data.paymentsByBank} title="Pagos por banco" />
    </div>
  )
}

function MoneyGroupsTable({ emptyLabel, groups, title }: { emptyLabel: string; groups?: MoneyGroup[]; title: string }) {
  return (
    <Card className="overflow-hidden p-5">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{emptyLabel}</CardDescription>
      </CardHeader>
      <CardContent className={tableShellClass}>
        <Table className="min-w-[520px]">
          <thead>
            <tr>
              <Th>Clasificación</Th>
              <Th className="text-right">Conteo</Th>
              <Th className="text-right">Monto</Th>
            </tr>
          </thead>
          <tbody>
            {(groups ?? []).length === 0 ? (
              <tr><Td colSpan={3}>Sin movimientos registrados.</Td></tr>
            ) : groups?.map((group, index) => (
              <tr className={tableRowClass} key={`${group.paymentMethod ?? group.method ?? group.bankName ?? 'grupo'}-${index}`}>
                <Td className="font-bold">{group.paymentMethod ?? group.method ?? group.bankName ?? 'Sin clasificar'}</Td>
                <Td className={numericCellClass}>{formatNumber(group.count)}</Td>
                <Td className={numericCellClass}>{formatMoney(group.amount)}</Td>
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
          <CatalogFilter constrainWidth endpoint="/locations?isActive=true&limit=100" label="Ubicación" onChange={(locationId) => setFilters({ ...filters, locationId })} value={filters.locationId} />
          <NativeSelect label="Tipo de venta" onChange={(paymentType) => setFilters({ ...filters, paymentType })} options={paymentTypes} value={filters.paymentType} />
          <NativeSelect label="Método de pago" onChange={(paymentMethod) => setFilters({ ...filters, paymentMethod })} options={[{label:'Todos',value:''},{label:'Efectivo',value:'CASH'},{label:'Transferencia',value:'TRANSFER'},{label:'Depósito',value:'DEPOSIT'},{label:'Tarjeta',value:'CARD'},{label:'Cheque',value:'CHECK'}]} value={filters.paymentMethod} />
          <NativeSelect label="Documento" onChange={(documentType) => setFilters({ ...filters, documentType })} options={[{label:'Todos',value:''},{label:'Ticket de báscula',value:'SCALE_TICKET'},{label:'Nota sencilla',value:'SIMPLE_NOTE'},{label:'Nota grande',value:'LARGE_NOTE'},{label:'Comprobante interno',value:'INTERNAL_RECEIPT'}]} value={filters.documentType} />
        </>
      }
      subtitle="Ventas confirmadas separadas por contado, crédito, cobranza y documento."
      title="Reporte de ventas diarias"
    >
      <ReportSection<SalesDailyReport> emptyMessage="Cambia la fecha, ubicación o vendedor para consultar operaciones confirmadas." query={query}>
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard detail="Ventas confirmadas" icon={<LineChart className="h-5 w-5" />} label="Total" tone="gold" value={formatMoney(data.summary?.total)} />
              <StatCard detail="Solo ventas de contado" icon={<Banknote className="h-5 w-5" />} label="Contado" tone="success" value={formatMoney(data.summary?.cash)} />
              <StatCard detail="No se trata como efectivo" icon={<CreditCard className="h-5 w-5" />} label="Crédito" value={formatMoney(data.summary?.credit)} />
              <StatCard detail="Notas separadas" icon={<FileText className="h-5 w-5" />} label="Cancelado" tone="danger" value={formatMoney(data.summary?.canceled)} />
            </div>
            <MoneyGroupsTable emptyLabel="Importes derivados de pagos no cancelados." groups={data.byPaymentMethod} title="Métodos de pago" />
            <Card className="overflow-hidden p-5">
              <CardHeader>
                <CardTitle>Ventas</CardTitle>
                <CardDescription>Cliente, vendedor, ubicación, documento, método y total.</CardDescription>
              </CardHeader>
              <CardContent className={tableShellClass}>
                <Table className="min-w-[1080px]">
                  <thead><tr><Th>Venta</Th><Th>Cliente</Th><Th>Vendedor</Th><Th>Ubicación</Th><Th>Tipo</Th><Th>Documento</Th><Th>Métodos</Th><Th className="text-right">Total</Th></tr></thead>
                  <tbody>
                    {(data.items ?? []).map((item, index) => (
                      <tr className={tableRowClass} key={item.saleId ?? item.saleNumber ?? index}>
                        <Td className="font-black">{item.saleNumber ?? 'Sin folio'}</Td>
                        <Td>{item.customerName ?? item.clientName ?? 'Público general'}</Td>
                        <Td>{item.sellerName ?? 'Sin vendedor'}</Td>
                        <Td>{item.locationName ?? 'Sin ubicación'}</Td>
                        <Td><Badge tone={item.paymentType === 'CREDIT_SALE' ? 'amber' : 'green'}>{item.paymentType === 'CREDIT_SALE' ? 'Crédito' : 'Contado'}</Badge></Td>
                        <Td>{item.documentType ?? item.documentNumber ?? 'Sin documento'}</Td>
                        <Td>{item.paymentMethods?.length ? item.paymentMethods.join(', ') : 'Sin pagos'}</Td>
                        <Td className={numericCellClass}>{formatMoney(item.total)}</Td>
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
      filters={<><DateFilter label="Fecha" onChange={(date) => setFilters({ ...filters, date })} value={filters.date} /><AdminUserFilter isAdmin={isAdmin} onChange={(userId) => setFilters({ ...filters, userId })} value={filters.userId} /><CatalogFilter constrainWidth endpoint="/locations?isActive=true&limit=100" label="Ubicación" onChange={(locationId) => setFilters({ ...filters, locationId })} value={filters.locationId} /></>}
      subtitle="Corte operativo; no sustituye cierre contable ni liquidación de ruta."
      title="Corte operativo de caja"
    >
      <ReportSection<CashClosingReport> emptyMessage="No hay ventas, pagos o cobros de ruta para los filtros seleccionados." query={query}>
        {(data) => <CashClosingSummary data={data} />}
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
      filters={<><CatalogFilter constrainWidth endpoint="/locations?isActive=true&limit=100" label="Ubicación" onChange={(locationId) => onChange({ ...filters, locationId })} value={filters.locationId} /><CatalogFilter endpoint="/products?isActive=true&limit=100" label="Producto" onChange={(productId) => onChange({ ...filters, productId })} value={filters.productId} /><CatalogFilter endpoint="/categories?isActive=true&limit=100" label="Categoría" onChange={(categoryId) => onChange({ ...filters, categoryId })} value={filters.categoryId} />{showSearch && <TextFilter label="Búsqueda" onChange={(search) => onChange({ ...filters, search })} placeholder="Producto o SKU" value={filters.search} />}</>}
      subtitle={subtitle}
      title={title}
    >
      <ReportSection<InventoryReport> emptyMessage="No hay saldos para los filtros seleccionados." query={query}>
        {(data) => (
          <Card className="overflow-hidden p-5">
            <CardHeader><CardTitle>{title}</CardTitle><CardDescription>Kilos, piezas, mínimos y último movimiento.</CardDescription></CardHeader>
            <CardContent className={tableShellClass}>
              <Table className="min-w-[1080px]">
                <thead><tr><Th>Ubicación</Th><Th>Producto</Th><Th>Unidad</Th><Th className="text-right">Kilos</Th><Th className="text-right">Piezas</Th><Th className="text-right">Mínimo kg</Th><Th className="text-right">Mínimo piezas</Th><Th>Estado</Th><Th>Último movimiento</Th></tr></thead>
                <tbody>
                  {(data.items ?? []).map((item) => (
                    <tr className={tableRowClass} key={`${item.locationId}-${item.productId}`}>
                      <Td>{item.locationName ?? item.locationId}</Td>
                      <Td><span className="font-bold">{item.productName ?? item.productId}</span>{item.sku && <span className="block text-xs text-[var(--erp-muted-foreground)]">SKU {item.sku}</span>}</Td>
                      <Td>{item.unit ?? 'Sin unidad'}</Td>
                      <Td className={numericCellClass}>{formatNumber(item.quantityKg)}</Td>
                      <Td className={numericCellClass}>{formatNumber(item.quantityPieces)}</Td>
                      <Td className={numericCellClass}>{formatNumber(item.minQuantityKg)}</Td>
                      <Td className={numericCellClass}>{formatNumber(item.minQuantityPieces)}</Td>
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
      filters={<><label className={filterLabelClass}>Cliente<MiniAjaxSelect className="h-10 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3.5 text-sm font-semibold normal-case tracking-normal" endpoint="/customers?isActive=true" label="Cliente" onChange={(customerId) => setFilters({ ...filters, customerId })} placeholder="Escribe nombre o número" value={filters.customerId} /></label><NativeSelect label="Estado de cobranza" onChange={(status) => setFilters({ ...filters, status })} options={collectionStatuses} value={filters.status} /><NativeSelect label="Antigüedad" onChange={(agingStatus) => setFilters({ ...filters, agingStatus })} options={agingStatuses} value={filters.agingStatus} /><DateFilter label="Vence desde" onChange={(dueDateFrom) => setFilters({ ...filters, dueDateFrom })} value={filters.dueDateFrom} /><DateFilter label="Vence hasta" onChange={(dueDateTo) => setFilters({ ...filters, dueDateTo })} value={filters.dueDateTo} /></>}
      subtitle="Saldo original, pendiente, vencido y pagos conservando accountReceivableId."
      title="Reporte de cuentas por cobrar"
    >
      <ReportSection<AccountsReceivableReport> emptyMessage="No hay cuentas por cobrar para los filtros seleccionados." query={query}>
        {(data) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard detail="Saldo de origen" icon={<ClipboardList className="h-5 w-5" />} label="Original" value={formatMoney(data.summary?.originalBalance)} />
              <StatCard detail="Pendiente por cobrar" icon={<CircleDollarSign className="h-5 w-5" />} label="Pendiente" tone="gold" value={formatMoney(data.summary?.pendingBalance)} />
              <StatCard detail="Crédito atrasado" icon={<AlertTriangle className="h-5 w-5" />} label="Vencido" tone="danger" value={formatMoney(data.summary?.overdueBalance)} />
              <StatCard detail="Pagos del periodo" icon={<WalletCards className="h-5 w-5" />} label="Pagado" tone="success" value={formatMoney(data.summary?.paymentsInPeriod)} />
            </div>
            <Card className="overflow-hidden p-5">
              <CardHeader><CardTitle>Cuentas por cobrar</CardTitle><CardDescription>Cliente, venta, vencimiento, folio físico, saldo y estado.</CardDescription></CardHeader>
              <CardContent className={tableShellClass}>
                <Table className="min-w-[960px]">
                  <thead><tr><Th>Cliente</Th><Th>Venta</Th><Th>Vencimiento</Th><Th>Folio físico</Th><Th className="text-right">Saldo</Th><Th>Estado</Th><Th>Antigüedad</Th></tr></thead>
                  <tbody>{(data.items ?? []).map((item, index) => (<tr className={tableRowClass} key={item.accountReceivableId ?? index}><Td className="font-bold">{item.customerName ?? item.clientName ?? 'Sin cliente'}</Td><Td>{item.saleNumber ?? item.saleId ?? 'Sin venta'}</Td><Td>{formatDateTime(item.dueDate)}</Td><Td>{item.physicalFolio ?? 'Sin folio'}</Td><Td className={numericCellClass}>{formatMoney(item.balance)}</Td><Td>{item.status ?? 'Sin estado'}</Td><Td>{item.agingStatus ?? 'Sin antigüedad'}</Td></tr>))}</tbody>
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
  const catalog = useRoutePlannerCatalog()

  return (
    <ReportPanel
      filters={<><DateFilter label="Desde" onChange={(dateFrom) => setFilters({ ...filters, dateFrom })} value={filters.dateFrom} /><DateFilter label="Hasta" onChange={(dateTo) => setFilters({ ...filters, dateTo })} value={filters.dateTo} /><TextFilter label="Ruta" onChange={(routeId) => setFilters({ ...filters, routeId })} placeholder="ID de ruta" value={filters.routeId} /><NativeSelect label="Repartidor" onChange={(driverId) => setFilters({ ...filters, driverId })} options={[{ label: catalog.drivers.error ? 'Catálogo no disponible' : catalog.drivers.isLoading ? 'Cargando…' : 'Todos', value: '' }, ...(catalog.drivers.data ?? []).map((driver) => ({ label: driver.name, value: driver.id }))]} value={filters.driverId} /><NativeSelect label="Estado" onChange={(status) => setFilters({ ...filters, status })} options={deliveryStatuses} value={filters.status} /></>}
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
              <CardContent className={tableShellClass}>
                <Table className="min-w-[760px]">
                  <thead><tr><Th>Ruta</Th><Th>Tipo</Th><Th>Estado</Th><Th>Severidad</Th><Th>Descripción</Th></tr></thead>
                  <tbody>{(data.incidents ?? []).map((incident, index) => (<tr className={tableRowClass} key={`${incident.type ?? 'incidencia'}-${index}`}><Td className="font-bold">{incident.routeName ?? 'Sin ruta'}</Td><Td>{incident.type ?? 'Sin tipo'}</Td><Td>{incident.status ?? 'Sin estado'}</Td><Td>{incident.severity ?? 'Sin severidad'}</Td><Td>{incident.description ?? 'Sin descripción'}</Td></tr>))}</tbody>
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
    <Card className="overflow-hidden p-5">
      <CardHeader><CardTitle>{title}</CardTitle><CardDescription>Conteo operativo confirmado.</CardDescription></CardHeader>
      <CardContent className="mt-4 space-y-3">
        {rows.length === 0 ? <p className="rounded-2xl bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-muted-foreground)]">Sin datos registrados.</p> : rows.map(([label, value]) => (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3" key={label}>
            <span className="font-bold text-[var(--erp-foreground)]">{label}</span>
            <span className="text-2xl font-black tracking-[-0.05em] text-[var(--erp-info)] tabular-nums">{formatNumber(value)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ReportPanel({ children, filters, subtitle, title }: { children: ReactNode; filters: ReactNode; subtitle: string; title: string }) {
  return (
    <section className="space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-[color:var(--erp-border)] bg-white/70 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]"><Filter className="h-4 w-4" />Filtros del reporte</p>
              <CardTitle className="mt-2 text-2xl">{title}</CardTitle>
              <CardDescription className="mt-1">{subtitle}</CardDescription>
            </div>
            <Badge tone="blue">Consulta actual</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-5 sm:p-6 md:grid-cols-2 xl:grid-cols-4">{filters}</CardContent>
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
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto max-w-7xl space-y-6">
        <div className="relative overflow-hidden rounded-[2rem] border border-[color:var(--erp-border)] bg-white text-[var(--erp-foreground)] shadow-[var(--erp-shadow-elevated)]">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(214,155,45,0.16),transparent_36%),linear-gradient(135deg,transparent,rgba(182,42,34,0.05))] lg:block" />
          <div className="relative grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
            <div className="max-w-4xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(214,155,45,0.28)] bg-[rgba(214,155,45,0.10)] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
                <BarChart3 className="h-4 w-4" />Reportes ejecutivos
              </div>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-[-0.07em] sm:text-5xl">Mesa ejecutiva para ventas, caja, inventario, cobranza y reparto.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--erp-muted-foreground)]">Reportes casi en tiempo real basados en operaciones confirmadas. La vista separa caja, crédito, inventario y reparto sin cambiar cálculos ni permisos existentes.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Badge className="border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-[var(--erp-foreground)]" tone="slate">Trazabilidad</Badge>
                <Badge className="border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-[var(--erp-foreground)]" tone="slate">Todo en uno</Badge>
                <Badge className="border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-[var(--erp-foreground)]" tone="slate"></Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-[1.5rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]/90 p-5 backdrop-blur">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-muted-foreground)]"><RefreshCw className="h-4 w-4" />Frescura operativa</p>
                <p className="mt-3 text-4xl font-black tracking-[-0.08em] text-[var(--erp-brand-gold-deep)] sm:text-5xl">60s</p>
                <p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">Cada reporte conserva su indicador de generación y datos incluidos.</p>
              </div>
              <div className="rounded-[1.5rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]/90 p-5 backdrop-blur sm:col-span-2 lg:col-span-1">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-muted-foreground)]"><Sparkles className="h-4 w-4" />Panel visible</p>
                <p className="mt-3 text-xl font-black tracking-[-0.04em] text-[var(--erp-foreground)]">{visibleTabs.length} reporte(s) autorizados</p>
              </div>
            </div>
          </div>
        </div>

        {visibleTabs.length === 0 ? <UnauthorizedState /> : (
          <>
            <nav aria-label="Reportes disponibles" className="flex gap-2 overflow-x-auto rounded-[1.35rem] border border-[color:var(--erp-border)] bg-white/85 p-2 shadow-[var(--erp-shadow)] backdrop-blur">
              {visibleTabs.map((tab) => (
                <Button
                  aria-pressed={selectedReport === tab.key}
                  className="shrink-0 whitespace-nowrap"
                  key={tab.key}
                  onClick={() => setActiveReport(tab.key)}
                  variant={selectedReport === tab.key ? 'primary' : 'ghost'}
                >
                  {reportTabIcons[tab.key]}{tab.label}
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
