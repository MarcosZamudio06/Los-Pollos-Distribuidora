import { useMemo, useState, type ElementType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CalendarClock, CircleDollarSign, Eye, FileText, ReceiptText, Search, ShieldAlert, SlidersHorizontal, WalletCards } from 'lucide-react'
import { useAuth } from '../../auth'
import { BillingRequestBadge } from '../components/BillingRequestBadge'
import { CustomerBalanceView } from '../components/CustomerBalanceView'
import { OverdueAccountsView } from '../components/OverdueAccountsView'
import { PaymentRegistrationDialog } from '../components/PaymentRegistrationDialog'
import { formatDate, formatMoney } from '../components/formatters'
import { useAccountsReceivable } from '../hooks/useAccountsReceivable'
import type { AccountReceivable, AccountsReceivableFilters, AgingStatus, CollectionStatus } from '../types'
import { TablePagination, useTablePagination } from '../../../components/shared/table-pagination'

function canAccessReceivables(role?: string | null) { return role === 'ADMIN' || role === 'COLLECTIONS' || role === 'SELLER' }
function canRegisterPayment(role?: string | null) { return role === 'ADMIN' || role === 'COLLECTIONS' }

const fieldClass = 'h-11 rounded-xl border border-[color:var(--erp-border)] bg-white px-3.5 text-sm text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition placeholder:text-[var(--erp-muted-foreground)]/70 focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]'
const headerCell = 'px-4 py-3 text-left text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]'
const bodyCell = 'px-4 py-4 text-sm text-[var(--erp-foreground)]'
const actionClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-3 text-xs font-semibold transition hover:border-[var(--erp-brand-gold)] hover:bg-[var(--erp-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50'

function AsyncState({ children, empty, error, isLoading }: { children: ReactNode; empty: boolean; error: unknown; isLoading: boolean }) {
  if (isLoading) return <div className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-6 text-sm font-semibold text-[var(--erp-info)] shadow-[var(--erp-shadow)]">Cargando cuentas por cobrar...</div>
  if (error) return <div role="alert" className="rounded-[1.4rem] border border-[rgba(157,45,36,0.28)] bg-[rgba(157,45,36,0.08)] p-6 text-sm font-semibold text-[var(--erp-danger)]">{error instanceof Error ? error.message : 'No se pudo completar la solicitud de cobranza.'}</div>
  if (empty) return <div className="rounded-[1.4rem] border border-dashed border-[color:var(--erp-border)] bg-white p-8 text-center text-sm text-[var(--erp-muted-foreground)] shadow-[var(--erp-shadow)]">No hay cuentas por cobrar para estos filtros.</div>
  return children
}

function AgingBadge({ value }: { value?: string | null }) {
  const styles = value === 'OVERDUE' ? 'border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.10)] text-[var(--erp-danger)]' : value === 'DUE_SOON' ? 'border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] text-[var(--erp-brand-gold-deep)]' : 'border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>{value ?? '—'}</span>
}

function StatusBadge({ value }: { value?: string | null }) {
  const styles = value === 'PAID' ? 'border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]' : value === 'CANCELLED' ? 'border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-[var(--erp-muted-foreground)]' : value === 'PARTIALLY_PAID' ? 'border-[rgba(47,111,115,0.25)] bg-[rgba(47,111,115,0.10)] text-[var(--erp-info)]' : 'border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] text-[var(--erp-brand-gold-deep)]'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles}`}>{value ?? '—'}</span>
}

function ReceivableTable({ accounts, canPay, onRegisterPayment, onViewDetail }: { accounts: AccountReceivable[]; canPay: boolean; onRegisterPayment: (account: AccountReceivable) => void; onViewDetail: (account: AccountReceivable) => void }) {
  const pagination = useTablePagination(accounts)
  return (
    <section className="overflow-hidden rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow)]">
      <div className="flex flex-col gap-2 border-b border-[color:var(--erp-border)] bg-[color-mix(in_srgb,var(--erp-surface)_70%,white)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--erp-muted-foreground)]">Cartera operativa</p><h2 className="mt-1 text-lg font-bold">Tabla de cuentas por cobrar</h2></div>
        <span className="rounded-full border border-[color:var(--erp-border)] bg-white px-3 py-1 text-xs font-semibold text-[var(--erp-muted-foreground)]">{accounts.length} cuentas</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1320px] w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-[var(--erp-surface)]">
            <tr><th className={headerCell}>Cliente</th><th className={headerCell}>Venta</th><th className={headerCell}>Solicitud administrativa</th><th className={`${headerCell} text-right`}>Monto original</th><th className={`${headerCell} text-right`}>Saldo pendiente</th><th className={`${headerCell} text-right`}>Saldo final</th><th className={headerCell}>Fechas</th><th className={headerCell}>Días</th><th className={headerCell}>Folio</th><th className={headerCell}>Política</th><th className={headerCell}>Envejecimiento</th><th className={headerCell}>Cobranza</th><th className={headerCell}>Acciones</th></tr>
          </thead>
          <tbody>
            {pagination.pageItems.map((account) => {
              const paymentDisabled = !canPay || account.status === 'PAID' || account.status === 'CANCELLED'
              return <tr className="align-top transition hover:bg-[var(--erp-surface)]/70" key={account.id}>
                <td className={`${bodyCell} font-black`}>{account.customerName ?? account.customerId}</td>
                <td className={bodyCell}><span className="inline-flex items-center gap-2"><ReceiptText className="h-4 w-4 text-[var(--erp-muted-foreground)]" />{account.saleNumber ?? account.saleId ?? '—'}</span></td>
                <td className={bodyCell}><BillingRequestBadge billingRequestId={account.billingRequestId} /></td>
                <td className={`${bodyCell} text-right font-semibold tabular-nums`}>{formatMoney(account.originalAmount)}</td>
                <td className={`${bodyCell} text-right font-black tabular-nums text-[var(--erp-danger)]`}>{formatMoney(account.outstandingAmount)}</td>
                <td className={`${bodyCell} text-right font-semibold tabular-nums`}>{formatMoney(account.outstandingAmount)}</td>
                <td className={bodyCell}><p>Venta {formatDate(account.saleDate)}</p><p className="mt-1 text-[var(--erp-muted-foreground)]">Vence {formatDate(account.dueDate)}</p><p className="mt-1 text-[var(--erp-muted-foreground)]">Último pago {formatDate(account.lastPaymentDate)}</p></td>
                <td className={bodyCell}>{account.paymentTermsDays ?? '—'}</td>
                <td className={bodyCell}><span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-[var(--erp-muted-foreground)]" />{account.physicalDocumentFolio ?? '—'}</span></td>
                <td className={bodyCell}>{account.commercialPolicyId ?? '—'}</td>
                <td className={bodyCell}><AgingBadge value={account.agingStatus} /></td>
                <td className={bodyCell}><StatusBadge value={account.status} /></td>
                <td className={bodyCell}><div className="flex flex-wrap gap-2"><button className={actionClass} onClick={() => onViewDetail(account)} type="button"><Eye className="h-4 w-4" /> Detalle</button><button className={`${actionClass} bg-[var(--erp-charcoal)] text-white hover:bg-[var(--erp-graphite)]`} disabled={paymentDisabled} onClick={() => onRegisterPayment(account)} type="button"><CircleDollarSign className="h-4 w-4" /> Pago</button></div></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <TablePagination {...pagination} total={accounts.length} onPageChange={pagination.setPage} />
    </section>
  )
}

function BalanceCard({ description, icon: Icon, label, tone, value }: { description: string; icon: ElementType; label: string; tone: 'dark' | 'red' | 'amber' | 'green'; value: string }) {
  const dark = tone === 'dark'
  const iconTone = tone === 'red' ? 'text-[var(--erp-danger)] bg-[rgba(157,45,36,0.10)] border-[rgba(157,45,36,0.22)]' : tone === 'amber' ? 'text-[var(--erp-brand-gold-deep)] bg-[rgba(214,155,45,0.12)] border-[rgba(214,155,45,0.30)]' : tone === 'green' ? 'text-[var(--erp-success)] bg-[rgba(63,123,65,0.10)] border-[rgba(63,123,65,0.20)]' : 'text-[var(--erp-brand-gold-soft)] bg-white/10 border-white/10'
  return <article className={`rounded-[1.4rem] border p-5 shadow-[var(--erp-shadow)] ${dark ? 'border-[var(--erp-charcoal)] bg-[var(--erp-charcoal)] text-white' : 'border-[color:var(--erp-border)] bg-white'}`}><div className="flex items-start justify-between gap-4"><div><p className={`text-xs font-bold uppercase tracking-[0.18em] ${dark ? 'text-white/62' : 'text-[var(--erp-muted-foreground)]'}`}>{label}</p><strong className="mt-3 block text-2xl font-black tracking-[-0.04em] tabular-nums">{value}</strong></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${iconTone}`}><Icon className="h-5 w-5" /></span></div><p className={`mt-3 text-xs ${dark ? 'text-white/62' : 'text-[var(--erp-muted-foreground)]'}`}>{description}</p></article>
}

export function AccountsReceivablePage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<AccountsReceivableFilters>({})
  const [selectedAccount, setSelectedAccount] = useState<AccountReceivable | null>(null)
  const [paymentAccount, setPaymentAccount] = useState<AccountReceivable | null>(null)
  const accounts = useAccountsReceivable(filters)
  const canAccess = canAccessReceivables(user?.role)
  const canPay = canRegisterPayment(user?.role)
  const balances = useMemo(() => {
    const items = accounts.data ?? []
    return {
      overdue: items.filter((account) => account.agingStatus === 'OVERDUE').reduce((sum, account) => sum + (Number(account.outstandingAmount) || 0), 0),
      upcoming: items.filter((account) => account.agingStatus === 'DUE_SOON').reduce((sum, account) => sum + (Number(account.outstandingAmount) || 0), 0),
      current: items.filter((account) => account.agingStatus === 'CURRENT').reduce((sum, account) => sum + (Number(account.outstandingAmount) || 0), 0),
    }
  }, [accounts.data])

  if (!canAccess) {
    return <main className="flex min-h-screen items-center justify-center bg-[var(--erp-background)] p-6"><section className="max-w-xl rounded-[1.5rem] border border-[color:var(--erp-border)] bg-white p-8 shadow-[var(--erp-shadow)]"><ShieldAlert className="h-9 w-9 text-[var(--erp-danger)]" /><h1 className="mt-4 text-3xl font-black">Acceso no autorizado</h1><p className="mt-3 text-[var(--erp-muted-foreground)]">Tu rol no tiene acceso directo al módulo de cobranza.</p><Link className="mt-6 inline-flex items-center gap-2 font-bold text-[var(--erp-danger)]" to="/"><ArrowLeft className="h-4 w-4" /> Volver</Link></section></main>
  }

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow)]">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] px-3 py-1 text-xs font-bold uppercase tracking-[0.20em] text-[var(--erp-info)]"><WalletCards className="h-3.5 w-3.5" /> Cobranza</div>
              <h1 className="mt-4 text-3xl font-black tracking-[-0.06em] sm:text-4xl">Cuentas por cobrar</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--erp-muted-foreground)]">Seguimiento financiero de cartera, vencimientos y pagos sobre una sola cuenta por cobrar.</p>
            </div>
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-4 text-sm font-semibold text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:bg-[var(--erp-surface-muted)]" to="/"><ArrowLeft className="h-4 w-4" /> Volver al centro operativo</Link>
          </div>
        </header>
        <section className="grid gap-4 md:grid-cols-3"><BalanceCard description="Monto que requiere atención inmediata" icon={CircleDollarSign} label="Vencido" tone="dark" value={formatMoney(balances.overdue)} /><BalanceCard description="Cartera próxima a vencimiento" icon={CalendarClock} label="Por vencer" tone="amber" value={formatMoney(balances.upcoming)} /><BalanceCard description="Saldo vigente de los filtros actuales" icon={WalletCards} label="Vigente" tone="green" value={formatMoney(balances.current)} /></section>
        <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-4 shadow-[var(--erp-shadow)]">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--erp-muted-foreground)]"><SlidersHorizontal className="h-4 w-4" /> Filtros financieros</p><h2 className="mt-1 text-lg font-bold">Búsqueda de cartera</h2></div></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--erp-muted-foreground)]" aria-hidden="true" />
              <input className={`${fieldClass} w-full pl-9`} placeholder="Cliente ID" value={filters.customerId ?? ''} onChange={(event) => setFilters({ ...filters, customerId: event.target.value })} />
            </label>
            <input className={fieldClass} placeholder="Venta ID" value={filters.saleId ?? ''} onChange={(event) => setFilters({ ...filters, saleId: event.target.value })} />
            <input className={fieldClass} placeholder="Solicitud administrativa" value={filters.billingRequestId ?? ''} onChange={(event) => setFilters({ ...filters, billingRequestId: event.target.value })} />
            <select className={fieldClass} value={filters.status ?? ''} onChange={(event) => setFilters({ ...filters, status: event.target.value as CollectionStatus | '' })}><option value="">Estado</option><option value="UNPAID">No pagada</option><option value="PARTIALLY_PAID">Parcial</option><option value="PAID">Pagada</option><option value="CANCELLED">Cancelada</option></select>
            <select className={fieldClass} value={filters.agingStatus ?? ''} onChange={(event) => setFilters({ ...filters, agingStatus: event.target.value as AgingStatus | '' })}><option value="">Envejecimiento</option><option value="CURRENT">Vigente</option><option value="DUE_SOON">Por vencer</option><option value="OVERDUE">Vencida</option></select>
            <input className={fieldClass} type="date" value={filters.dueDateFrom ?? ''} onChange={(event) => setFilters({ ...filters, dueDateFrom: event.target.value })} />
            <input className={fieldClass} type="date" value={filters.dueDateTo ?? ''} onChange={(event) => setFilters({ ...filters, dueDateTo: event.target.value })} />
            <div className="flex flex-col justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-3 py-2 text-xs font-semibold text-[var(--erp-muted-foreground)] sm:col-span-2 lg:col-span-1">
              <label className="inline-flex items-center gap-2"><input checked={Boolean(filters.onlyOverdue)} type="checkbox" onChange={(event) => setFilters({ ...filters, onlyOverdue: event.target.checked, onlyUpcoming: false })} /> Solo vencidas</label>
              <label className="inline-flex items-center gap-2"><input checked={Boolean(filters.onlyUpcoming)} type="checkbox" onChange={(event) => setFilters({ ...filters, onlyUpcoming: event.target.checked, onlyOverdue: false })} /> Solo por vencer</label>
            </div>
          </div>
        </section>
        <OverdueAccountsView accounts={accounts.data ?? []} canPay={canPay} onRegisterPayment={setPaymentAccount} onViewDetail={setSelectedAccount} />
        <AsyncState empty={!accounts.data?.length} error={accounts.error} isLoading={accounts.isLoading}><ReceivableTable accounts={accounts.data ?? []} canPay={canPay} onRegisterPayment={setPaymentAccount} onViewDetail={setSelectedAccount} /></AsyncState>
      </section>
      {selectedAccount && <CustomerBalanceView accountId={selectedAccount.id} fallbackAccount={selectedAccount} onClose={() => setSelectedAccount(null)} />}
      {paymentAccount && <PaymentRegistrationDialog account={paymentAccount} onClose={() => setPaymentAccount(null)} />}
    </main>
  )
}
