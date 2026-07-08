import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Search, ShieldAlert, SlidersHorizontal, UserPlus, Users, X } from 'lucide-react'
import { useAuth } from '../../auth'
import { BillingSummaryCard } from '../components/BillingSummaryCard'
import { CreditStatusSummary } from '../components/CreditStatusSummary'
import { CustomerFormModal } from '../components/CustomerFormModal'
import { CustomerTable } from '../components/CustomerTable'
import { CustomerTypeFilter } from '../components/CustomerTypeFilter'
import { useCustomerCreditSummary, useCustomerDetail, useCustomerPayments, useCustomers, useCustomerSales, useDeactivateCustomer } from '../hooks/useCustomers'
import type { CreditStatus, Customer, CustomerFilters } from '../types'

function canAccessCustomers(role?: string | null) { return role === 'ADMIN' || role === 'SELLER' || role === 'COLLECTIONS' }
function canManageCustomers(role?: string | null) { return role === 'ADMIN' || role === 'SELLER' }
function canDeactivateCustomers(role?: string | null) { return role === 'ADMIN' }
function canManageCommercialTerms(role?: string | null) { return role === 'ADMIN' }
function canReadCredit(role?: string | null) { return role === 'ADMIN' || role === 'SELLER' || role === 'COLLECTIONS' }
function canReadPayments(role?: string | null) { return role === 'ADMIN' || role === 'COLLECTIONS' }

const fieldClass = 'h-11 rounded-xl border border-[color:var(--erp-border)] bg-white px-3.5 text-sm text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition placeholder:text-[var(--erp-muted-foreground)]/70 focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]'
const softButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-4 text-sm font-semibold text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:bg-[var(--erp-surface-muted)]'

function formatMoney(value: unknown) {
  if (value === undefined || value === null) return '—'
  return Number(value).toLocaleString('es-MX', { currency: 'MXN', style: 'currency' })
}

function AsyncState({ children, empty, error, isLoading }: { children: React.ReactNode; empty: boolean; error: unknown; isLoading: boolean }) {
  if (isLoading) return <div className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-6 text-sm font-semibold text-[var(--erp-info)] shadow-[var(--erp-shadow)]">Cargando clientes...</div>
  if (error) return <div role="alert" className="rounded-[1.4rem] border border-[rgba(157,45,36,0.28)] bg-[rgba(157,45,36,0.08)] p-6 text-sm font-semibold text-[var(--erp-danger)]">{error instanceof Error ? error.message : 'No se pudo completar la solicitud de clientes.'}</div>
  if (empty) return <div className="rounded-[1.4rem] border border-dashed border-[color:var(--erp-border)] bg-white p-8 text-center text-sm text-[var(--erp-muted-foreground)] shadow-[var(--erp-shadow)]">No hay clientes para estos filtros.</div>
  return children
}

function DetailPanel({ canReadPayments, customerId, onClose }: { canReadPayments: boolean; customerId?: string; onClose: () => void }) {
  const detail = useCustomerDetail(customerId)
  const creditSummary = useCustomerCreditSummary(customerId)
  const sales = useCustomerSales(customerId)
  const payments = useCustomerPayments(canReadPayments ? customerId : undefined)
  const customer = detail.data
  const summary = creditSummary.data ?? customer?.creditSummary

  return (
    <aside className="fixed inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-[color:var(--erp-border)] bg-[var(--erp-background)] p-5 shadow-2xl md:w-[36rem] md:p-6">
      <div className="sticky top-0 z-10 -mx-5 -mt-5 border-b border-[color:var(--erp-border)] bg-[color-mix(in_srgb,var(--erp-background)_92%,white)]/95 px-5 py-4 backdrop-blur md:-mx-6 md:-mt-6 md:px-6">
        <button className={softButtonClass} onClick={onClose} type="button"><X className="h-4 w-4" /> Cerrar resumen</button>
      </div>
      {(detail.isLoading || creditSummary.isLoading) && <p className="mt-6 rounded-2xl border border-[color:var(--erp-border)] bg-white p-4 font-semibold text-[var(--erp-info)]">Cargando resumen de crédito...</p>}
      {(detail.error || creditSummary.error) && <p role="alert" className="mt-6 rounded-2xl bg-[rgba(157,45,36,0.10)] p-4 font-semibold text-[var(--erp-danger)]">No se pudo cargar el resumen del cliente.</p>}
      {customer && <div className="mt-6 grid gap-5">
        <header className="overflow-hidden rounded-[1.4rem] bg-[var(--erp-charcoal)] p-5 text-white shadow-[var(--erp-shadow-elevated)]">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--erp-brand-gold-soft)]">{customer.customerType}</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">{customer.name}</h2>
          <p className="mt-2 text-sm text-white/70">Estado de crédito: {summary?.creditStatus ?? customer.creditStatus ?? '—'}</p>
        </header>
        <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 text-sm shadow-[var(--erp-shadow)]"><div className="grid gap-3"><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Límite</span><strong>{formatMoney(summary?.creditLimit ?? customer.creditLimit)}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Días</span><strong>{summary?.creditDays ?? customer.creditDays ?? '—'}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Saldo global</span><strong>{formatMoney(summary?.globalBalance)}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Saldo vencido</span><strong className="text-[var(--erp-danger)]">{formatMoney(summary?.overdueAmount)}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Crédito disponible</span><strong>{formatMoney(summary?.availableCredit)}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Indicador de mora</span><strong>{summary?.hasOverdueBalance ? 'Con mora' : 'Sin mora'}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Días de atraso</span><strong>{summary?.daysOverdue ?? 0}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Último pago</span><strong>{summary?.lastPaymentDate ? new Date(summary.lastPaymentDate).toLocaleDateString('es-MX') : '—'}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Motivo de bloqueo</span><strong>{summary?.blockingReason ?? summary?.blockReason ?? (summary?.isBlocked || customer.isBlockedForCredit ? 'Bloqueo administrativo' : '—')}</strong></p><p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Política aplicada</span><strong>{summary?.commercialPolicyApplied ?? customer.commercialPolicyId ?? '—'}</strong></p></div></section>
        <BillingSummaryCard billingSummary={summary?.billingSummary ?? customer.billingSummary} creditSummary={summary} />
        <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 text-sm shadow-[var(--erp-shadow)]"><h3 className="font-black">Historial de ventas</h3>{sales.isLoading && <p className="mt-3 text-[var(--erp-muted-foreground)]">Cargando ventas...</p>}{sales.error && <p className="mt-3 font-semibold text-[var(--erp-danger)]">No se pudo cargar el historial de ventas.</p>}{!sales.isLoading && !sales.data?.length && <p className="mt-3 text-[var(--erp-muted-foreground)]">Sin ventas registradas.</p>}<div className="mt-3 grid gap-2">{sales.data?.slice(0, 5).map((sale) => <article className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3" key={sale.id}><p className="font-semibold">{sale.saleNumber} · {sale.paymentType}</p><p className="text-[var(--erp-muted-foreground)]">Total {sale.total} · Cobranza {sale.collectionStatus}</p><p className="text-[var(--erp-muted-foreground)]">CxC {sale.accountReceivableId ?? '—'} · Billing {sale.billingRequestId ?? '—'}</p></article>)}</div></section>
        {canReadPayments && <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 text-sm shadow-[var(--erp-shadow)]"><h3 className="font-black">Historial de pagos</h3>{payments.isLoading && <p className="mt-3 text-[var(--erp-muted-foreground)]">Cargando pagos...</p>}{payments.error && <p className="mt-3 font-semibold text-[var(--erp-danger)]">No se pudo cargar el historial de pagos.</p>}{!payments.isLoading && !payments.data?.length && <p className="mt-3 text-[var(--erp-muted-foreground)]">Sin pagos registrados.</p>}<div className="mt-3 grid gap-2">{payments.data?.slice(0, 5).map((payment) => <article className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3" key={payment.id}><p className="font-semibold">{payment.amount} · {payment.paymentMethod}</p><p className="text-[var(--erp-muted-foreground)]">CxC {payment.accountReceivableId ?? '—'} · Venta {payment.saleId ?? '—'}</p><p className="text-[var(--erp-muted-foreground)]">Ruta {payment.routeId ?? '—'} · Liquidación {payment.routeSettlementId ?? '—'}</p><p className="text-[var(--erp-muted-foreground)]">Banco {payment.bankName ?? '—'} · Ref {payment.referenceNumber ?? '—'}</p></article>)}</div></section>}
      </div>}
    </aside>
  )
}

export function CustomersPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<CustomerFilters>({})
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>()
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>()
  const customers = useCustomers(filters)
  const deactivateCustomer = useDeactivateCustomer()
  const canAccess = canAccessCustomers(user?.role)
  const canManage = canManageCustomers(user?.role)
  const canDeactivate = canDeactivateCustomers(user?.role)
  const canManageTerms = canManageCommercialTerms(user?.role)

  if (!canAccess) {
    return <main className="flex min-h-screen items-center justify-center bg-[var(--erp-background)] p-6"><section className="max-w-xl rounded-[1.5rem] border border-[color:var(--erp-border)] bg-white p-8 shadow-[var(--erp-shadow)]"><ShieldAlert className="h-9 w-9 text-[var(--erp-danger)]" /><h1 className="mt-4 text-3xl font-black">Acceso no autorizado</h1><p className="mt-3 text-[var(--erp-muted-foreground)]">Tu rol no tiene acceso al módulo de clientes.</p><Link className="mt-6 inline-flex items-center gap-2 font-bold text-[var(--erp-danger)]" to="/"><ArrowLeft className="h-4 w-4" /> Volver</Link></section></main>
  }

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(182,42,34,0.18)] bg-[rgba(182,42,34,0.07)] px-3 py-1 text-xs font-bold uppercase tracking-[0.20em] text-[var(--erp-danger)]"><Users className="h-3.5 w-3.5" /> Cartera de clientes</div>
              <h1 className="mt-4 max-w-3xl text-3xl font-black tracking-[-0.06em] sm:text-4xl">Clientes, crédito y perfil administrativo</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--erp-muted-foreground)]">Control operativo de clientes minoristas, mayoristas e institucionales con lectura rápida de crédito, cartera y perfil comercial.</p>
            </div>
            <div className="grid gap-3 lg:justify-items-end">
              {canManage ? <button className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--erp-charcoal)] px-5 text-sm font-black text-white shadow-[0_14px_36px_rgba(17,24,21,0.18)] transition hover:bg-[var(--erp-graphite)]" onClick={() => setEditingCustomer(null)} type="button"><UserPlus className="h-4 w-4" /> Nuevo cliente</button> : <div className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm font-semibold text-[var(--erp-muted-foreground)]">Sesión de consulta. La edición requiere ADMIN o SELLER.</div>}
              <p className="text-xs text-[var(--erp-muted-foreground)]">La presentación conserva filtros, acciones y contratos existentes.</p>
            </div>
          </div>
        </header>
        {canReadCredit(user?.role) && <CreditStatusSummary customers={customers.data ?? []} />}
        <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-4 shadow-[var(--erp-shadow)]">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--erp-muted-foreground)]"><SlidersHorizontal className="h-4 w-4" /> Filtros operativos</p><h2 className="mt-1 text-lg font-bold">Búsqueda y segmentación</h2></div>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            <label className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-muted-foreground)]" /><input className={`${fieldClass} w-full pl-9`} placeholder="Buscar nombre, teléfono o email" value={filters.search ?? ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
            <CustomerTypeFilter value={filters.customerType} onChange={(customerType) => setFilters({ ...filters, customerType })} />
            <select className={fieldClass} value={filters.creditStatus ?? ''} onChange={(event) => setFilters({ ...filters, creditStatus: event.target.value as CreditStatus | '' })}><option value="">Estado de crédito</option><option value="ACTIVE">Activo</option><option value="BLOCKED">Bloqueado</option><option value="SUSPENDED">Suspendido</option></select>
            <select className={fieldClass} value={filters.agingStatus ?? ''} onChange={(event) => setFilters({ ...filters, agingStatus: event.target.value as CustomerFilters['agingStatus'] })}><option value="">Cartera</option><option value="CURRENT">Vigente</option><option value="DUE_SOON">Por vencer</option><option value="OVERDUE">Vencido</option><option value="LATE">Atrasado</option></select>
            <input className={fieldClass} placeholder="Política comercial" value={filters.commercialPolicyId ?? ''} onChange={(event) => setFilters({ ...filters, commercialPolicyId: event.target.value })} />
            <input className={fieldClass} placeholder="Ruta asignada" value={filters.assignedRouteId ?? ''} onChange={(event) => setFilters({ ...filters, assignedRouteId: event.target.value })} />
            <select className={fieldClass} value={filters.isActive ?? ''} onChange={(event) => setFilters({ ...filters, isActive: event.target.value })}><option value="">Activo/inactivo</option><option value="true">Activo</option><option value="false">Inactivo</option></select>
          </div>
        </section>
        <AsyncState empty={!customers.data?.length} error={customers.error} isLoading={customers.isLoading}><CustomerTable canDeactivate={canDeactivate} canManage={canManage} customers={customers.data ?? []} onDeactivate={(customer) => void deactivateCustomer.mutateAsync(customer.id)} onEdit={setEditingCustomer} onSelect={(customer) => setSelectedCustomerId(customer.id)} /></AsyncState>
      </section>
      {canManage && editingCustomer !== undefined && <CustomerFormModal canManageCommercialTerms={canManageTerms} customer={editingCustomer} onClose={() => setEditingCustomer(undefined)} />}
      {selectedCustomerId && <DetailPanel canReadPayments={canReadPayments(user?.role)} customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(undefined)} />}
    </main>
  )
}
