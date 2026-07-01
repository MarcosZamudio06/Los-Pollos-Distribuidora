import { useState } from 'react'
import { Link } from 'react-router-dom'
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

function AsyncState({ children, empty, error, isLoading }: { children: React.ReactNode; empty: boolean; error: unknown; isLoading: boolean }) {
  if (isLoading) return <div className="rounded-3xl bg-white p-6 text-sm font-bold text-[#39798b]">Cargando clientes...</div>
  if (error) return <div role="alert" className="rounded-3xl border border-[#d43f2f]/30 bg-[#d43f2f]/10 p-6 text-sm font-bold text-[#9d2d24]">{error instanceof Error ? error.message : 'No se pudo completar la solicitud de clientes.'}</div>
  if (empty) return <div className="rounded-3xl border border-dashed border-[#20211f]/20 bg-white p-6 text-sm text-[#68645c]">No hay clientes para estos filtros.</div>
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
    <aside className="fixed inset-y-0 right-0 z-30 w-full overflow-y-auto bg-[#f5f3ee] p-6 shadow-2xl md:w-[34rem]">
      <button className="font-bold text-[#68645c]" onClick={onClose} type="button">Cerrar resumen</button>
      {(detail.isLoading || creditSummary.isLoading) && <p className="mt-6 rounded-2xl bg-white p-4 font-bold text-[#39798b]">Cargando resumen de crédito...</p>}
      {(detail.error || creditSummary.error) && <p role="alert" className="mt-6 rounded-2xl bg-[#d43f2f]/10 p-4 font-bold text-[#9d2d24]">No se pudo cargar el resumen del cliente.</p>}
      {customer && <div className="mt-6 grid gap-5">
        <header className="rounded-[1.75rem] bg-[#20211f] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#f0b44c]">{customer.customerType}</p><h2 className="mt-3 text-3xl font-black tracking-[-0.05em]">{customer.name}</h2><p className="mt-2 text-sm text-white/70">Estado de crédito: {summary?.creditStatus ?? customer.creditStatus ?? '—'}</p></header>
        <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 text-sm"><div className="grid gap-3"><p className="flex justify-between"><span>Límite</span><strong>{summary?.creditLimit ?? customer.creditLimit ?? '—'}</strong></p><p className="flex justify-between"><span>Días</span><strong>{summary?.creditDays ?? customer.creditDays ?? '—'}</strong></p><p className="flex justify-between"><span>Saldo global</span><strong>{summary?.globalBalance ?? '—'}</strong></p><p className="flex justify-between"><span>Saldo vencido</span><strong>{summary?.overdueAmount ?? '—'}</strong></p><p className="flex justify-between"><span>Crédito disponible</span><strong>{summary?.availableCredit ?? '—'}</strong></p><p className="flex justify-between"><span>Indicador de mora</span><strong>{summary?.hasOverdueBalance ? 'Con mora' : 'Sin mora'}</strong></p><p className="flex justify-between"><span>Días de atraso</span><strong>{summary?.daysOverdue ?? 0}</strong></p><p className="flex justify-between"><span>Último pago</span><strong>{summary?.lastPaymentDate ? new Date(summary.lastPaymentDate).toLocaleDateString('es-MX') : '—'}</strong></p><p className="flex justify-between"><span>Motivo de bloqueo</span><strong>{summary?.blockingReason ?? summary?.blockReason ?? (summary?.isBlocked || customer.isBlockedForCredit ? 'Bloqueo administrativo' : '—')}</strong></p><p className="flex justify-between"><span>Política aplicada</span><strong>{summary?.commercialPolicyApplied ?? customer.commercialPolicyId ?? '—'}</strong></p></div></section>
        <BillingSummaryCard billingSummary={summary?.billingSummary ?? customer.billingSummary} creditSummary={summary} />
        <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 text-sm"><h3 className="font-black">Historial de ventas</h3>{sales.isLoading && <p className="mt-3 text-[#68645c]">Cargando ventas...</p>}{sales.error && <p className="mt-3 font-bold text-[#9d2d24]">No se pudo cargar el historial de ventas.</p>}{!sales.isLoading && !sales.data?.length && <p className="mt-3 text-[#68645c]">Sin ventas registradas.</p>}<div className="mt-3 grid gap-2">{sales.data?.slice(0, 5).map((sale) => <article className="rounded-2xl bg-[#f5f3ee] p-3" key={sale.id}><p className="font-bold">{sale.saleNumber} · {sale.paymentType}</p><p className="text-[#68645c]">Total {sale.total} · Cobranza {sale.collectionStatus}</p><p className="text-[#68645c]">CxC {sale.accountReceivableId ?? '—'} · Billing {sale.billingRequestId ?? '—'}</p></article>)}</div></section>
        {canReadPayments && <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 text-sm"><h3 className="font-black">Historial de pagos</h3>{payments.isLoading && <p className="mt-3 text-[#68645c]">Cargando pagos...</p>}{payments.error && <p className="mt-3 font-bold text-[#9d2d24]">No se pudo cargar el historial de pagos.</p>}{!payments.isLoading && !payments.data?.length && <p className="mt-3 text-[#68645c]">Sin pagos registrados.</p>}<div className="mt-3 grid gap-2">{payments.data?.slice(0, 5).map((payment) => <article className="rounded-2xl bg-[#f5f3ee] p-3" key={payment.id}><p className="font-bold">{payment.amount} · {payment.paymentMethod}</p><p className="text-[#68645c]">CxC {payment.accountReceivableId ?? '—'} · Venta {payment.saleId ?? '—'}</p><p className="text-[#68645c]">Ruta {payment.routeId ?? '—'} · Liquidación {payment.routeSettlementId ?? '—'}</p><p className="text-[#68645c]">Banco {payment.bankName ?? '—'} · Ref {payment.referenceNumber ?? '—'}</p></article>)}</div></section>}
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
    return <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] p-6"><section className="max-w-xl rounded-[2rem] bg-white p-8"><h1 className="text-3xl font-black">Acceso no autorizado</h1><p className="mt-3 text-[#68645c]">Tu rol no tiene acceso al módulo de clientes.</p><Link className="mt-6 inline-flex font-bold text-[#9d2d24]" to="/">Volver</Link></section></main>
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-8">
        <header className="overflow-hidden rounded-[2rem] border border-[#20211f]/10 bg-white shadow-[0_24px_80px_rgba(32,33,31,0.08)]"><div className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#9d2d24]">Cartera de clientes</p><h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">Clientes, crédito y perfil administrativo</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#68645c]">Controla clientes minoristas, mayoristas e institucionales sin confundir datos fiscales administrativos con emisión CFDI.</p></div>{canManage ? <button className="rounded-2xl bg-[#20211f] px-5 py-3 font-black text-white" onClick={() => setEditingCustomer(null)} type="button">Nuevo cliente</button> : <div className="rounded-2xl border border-[#20211f]/10 bg-[#f5f3ee] p-4 text-sm font-bold text-[#68645c]">Sesión de consulta. La edición requiere ADMIN o SELLER.</div>}</div></header>
        {canReadCredit(user?.role) && <CreditStatusSummary customers={customers.data ?? []} />}
        <section className="grid gap-3 rounded-[1.75rem] border border-[#20211f]/10 bg-white p-4 md:grid-cols-7"><input className="rounded-xl border border-[#20211f]/15 p-3 md:col-span-2" placeholder="Buscar nombre, teléfono o email" value={filters.search ?? ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /><CustomerTypeFilter value={filters.customerType} onChange={(customerType) => setFilters({ ...filters, customerType })} /><select className="rounded-xl border border-[#20211f]/15 p-3" value={filters.creditStatus ?? ''} onChange={(event) => setFilters({ ...filters, creditStatus: event.target.value as CreditStatus | '' })}><option value="">Estado de crédito</option><option value="ACTIVE">Activo</option><option value="BLOCKED">Bloqueado</option><option value="SUSPENDED">Suspendido</option></select><select className="rounded-xl border border-[#20211f]/15 p-3" value={filters.agingStatus ?? ''} onChange={(event) => setFilters({ ...filters, agingStatus: event.target.value as CustomerFilters['agingStatus'] })}><option value="">Cartera</option><option value="CURRENT">Vigente</option><option value="DUE_SOON">Por vencer</option><option value="OVERDUE">Vencido</option><option value="LATE">Atrasado</option></select><input className="rounded-xl border border-[#20211f]/15 p-3" placeholder="Política comercial" value={filters.commercialPolicyId ?? ''} onChange={(event) => setFilters({ ...filters, commercialPolicyId: event.target.value })} /><input className="rounded-xl border border-[#20211f]/15 p-3" placeholder="Ruta asignada" value={filters.assignedRouteId ?? ''} onChange={(event) => setFilters({ ...filters, assignedRouteId: event.target.value })} /><select className="rounded-xl border border-[#20211f]/15 p-3" value={filters.isActive ?? ''} onChange={(event) => setFilters({ ...filters, isActive: event.target.value })}><option value="">Activo/inactivo</option><option value="true">Activo</option><option value="false">Inactivo</option></select></section>
        <AsyncState empty={!customers.data?.length} error={customers.error} isLoading={customers.isLoading}><CustomerTable canDeactivate={canDeactivate} canManage={canManage} customers={customers.data ?? []} onDeactivate={(customer) => void deactivateCustomer.mutateAsync(customer.id)} onEdit={setEditingCustomer} onSelect={(customer) => setSelectedCustomerId(customer.id)} /></AsyncState>
      </section>
      {canManage && editingCustomer !== undefined && <CustomerFormModal canManageCommercialTerms={canManageTerms} customer={editingCustomer} onClose={() => setEditingCustomer(undefined)} />}
      {selectedCustomerId && <DetailPanel canReadPayments={canReadPayments(user?.role)} customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(undefined)} />}
    </main>
  )
}
