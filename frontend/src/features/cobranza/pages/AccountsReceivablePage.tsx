import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth'
import { BillingRequestBadge } from '../components/BillingRequestBadge'
import { CustomerBalanceView } from '../components/CustomerBalanceView'
import { OverdueAccountsView } from '../components/OverdueAccountsView'
import { PaymentRegistrationDialog } from '../components/PaymentRegistrationDialog'
import { formatDate, formatMoney } from '../components/formatters'
import { useAccountsReceivable } from '../hooks/useAccountsReceivable'
import type { AccountReceivable, AccountsReceivableFilters, AgingStatus, CollectionStatus } from '../types'

function canAccessReceivables(role?: string | null) { return role === 'ADMIN' || role === 'COLLECTIONS' || role === 'SELLER' }
function canRegisterPayment(role?: string | null) { return role === 'ADMIN' || role === 'COLLECTIONS' }

function AsyncState({ children, empty, error, isLoading }: { children: ReactNode; empty: boolean; error: unknown; isLoading: boolean }) {
  if (isLoading) return <div className="rounded-3xl bg-white p-6 text-sm font-bold text-[#39798b]">Cargando cuentas por cobrar...</div>
  if (error) return <div role="alert" className="rounded-3xl border border-[#d43f2f]/30 bg-[#d43f2f]/10 p-6 text-sm font-bold text-[#9d2d24]">{error instanceof Error ? error.message : 'No se pudo completar la solicitud de cobranza.'}</div>
  if (empty) return <div className="rounded-3xl border border-dashed border-[#20211f]/20 bg-white p-6 text-sm text-[#68645c]">No hay cuentas por cobrar para estos filtros.</div>
  return children
}

function ReceivableTable({ accounts, canPay, onRegisterPayment, onViewDetail }: { accounts: AccountReceivable[]; canPay: boolean; onRegisterPayment: (account: AccountReceivable) => void; onViewDetail: (account: AccountReceivable) => void }) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-[#20211f]/10 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#20211f] text-xs uppercase tracking-[0.16em] text-white/80">
            <tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Venta</th><th className="px-4 py-3">Solicitud administrativa</th><th className="px-4 py-3">Monto original</th><th className="px-4 py-3">Saldo pendiente</th><th className="px-4 py-3">Saldo final</th><th className="px-4 py-3">Venta</th><th className="px-4 py-3">Vencimiento</th><th className="px-4 py-3">Días</th><th className="px-4 py-3">Último pago</th><th className="px-4 py-3">Folio</th><th className="px-4 py-3">Política</th><th className="px-4 py-3">Envejecimiento</th><th className="px-4 py-3">Cobranza</th><th className="px-4 py-3">Acciones</th></tr>
          </thead>
          <tbody>
            {accounts.map((account) => {
              const paymentDisabled = !canPay || account.status === 'PAID' || account.status === 'CANCELLED'
              return <tr className="border-t border-[#20211f]/10 align-top" key={account.id}>
                <td className="px-4 py-4 font-bold">{account.customerName ?? account.customerId}</td>
                <td className="px-4 py-4">{account.saleNumber ?? account.saleId ?? '—'}</td>
                <td className="px-4 py-4"><BillingRequestBadge billingRequestId={account.billingRequestId} /></td>
                <td className="px-4 py-4">{formatMoney(account.originalAmount)}</td>
                <td className="px-4 py-4 font-black text-[#9d2d24]">{formatMoney(account.outstandingAmount)}</td>
                <td className="px-4 py-4">{formatMoney(account.outstandingAmount)}</td>
                <td className="px-4 py-4">{formatDate(account.saleDate)}</td>
                <td className="px-4 py-4">{formatDate(account.dueDate)}</td>
                <td className="px-4 py-4">{account.paymentTermsDays ?? '—'}</td>
                <td className="px-4 py-4">{formatDate(account.lastPaymentDate)}</td>
                <td className="px-4 py-4">{account.physicalDocumentFolio ?? '—'}</td>
                <td className="px-4 py-4">{account.commercialPolicyId ?? '—'}</td>
                <td className="px-4 py-4">{account.agingStatus}</td>
                <td className="px-4 py-4">{account.status}</td>
                <td className="px-4 py-4"><div className="flex flex-col gap-2"><button className="rounded-xl border border-[#20211f]/15 px-3 py-2 font-bold" onClick={() => onViewDetail(account)} type="button">Detalle</button><button className="rounded-xl bg-[#20211f] px-3 py-2 font-bold text-white disabled:opacity-50" disabled={paymentDisabled} onClick={() => onRegisterPayment(account)} type="button">Pago</button></div></td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
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
    return <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] p-6"><section className="max-w-xl rounded-[2rem] bg-white p-8"><h1 className="text-3xl font-black">Acceso no autorizado</h1><p className="mt-3 text-[#68645c]">Tu rol no tiene acceso directo al módulo de cobranza.</p><Link className="mt-6 inline-flex font-bold text-[#9d2d24]" to="/">Volver</Link></section></main>
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-8">
        <header className="rounded-[2rem] border border-[#20211f]/10 bg-white p-6 shadow-[0_24px_80px_rgba(32,33,31,0.08)]"><div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#39798b]">Cobranza</p><h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">Cuentas por cobrar</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#68645c]">Seguimiento de cartera, saldos vencidos, saldos por vencer y registro de pagos sobre una sola cuenta por cobrar.</p></div><Link className="font-bold text-[#9d2d24]" to="/">Volver al centro operativo</Link></div></header>
        <section className="grid gap-4 md:grid-cols-3"><article className="rounded-[1.75rem] bg-[#20211f] p-5 text-white"><p className="text-xs font-bold uppercase tracking-[0.20em] text-[#f0b44c]">Vencido</p><strong className="mt-3 block text-3xl">{formatMoney(balances.overdue)}</strong></article><article className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.20em] text-[#39798b]">Por vencer</p><strong className="mt-3 block text-3xl">{formatMoney(balances.upcoming)}</strong></article><article className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5"><p className="text-xs font-bold uppercase tracking-[0.20em] text-[#68645c]">Vigente</p><strong className="mt-3 block text-3xl">{formatMoney(balances.current)}</strong></article></section>
        <section className="grid gap-3 rounded-[1.75rem] border border-[#20211f]/10 bg-white p-4 md:grid-cols-8"><input className="rounded-xl border border-[#20211f]/15 p-3" placeholder="Cliente ID" value={filters.customerId ?? ''} onChange={(event) => setFilters({ ...filters, customerId: event.target.value })} /><input className="rounded-xl border border-[#20211f]/15 p-3" placeholder="Venta ID" value={filters.saleId ?? ''} onChange={(event) => setFilters({ ...filters, saleId: event.target.value })} /><input className="rounded-xl border border-[#20211f]/15 p-3" placeholder="Solicitud administrativa" value={filters.billingRequestId ?? ''} onChange={(event) => setFilters({ ...filters, billingRequestId: event.target.value })} /><select className="rounded-xl border border-[#20211f]/15 p-3" value={filters.status ?? ''} onChange={(event) => setFilters({ ...filters, status: event.target.value as CollectionStatus | '' })}><option value="">Estado</option><option value="UNPAID">No pagada</option><option value="PARTIALLY_PAID">Parcial</option><option value="PAID">Pagada</option><option value="CANCELLED">Cancelada</option></select><select className="rounded-xl border border-[#20211f]/15 p-3" value={filters.agingStatus ?? ''} onChange={(event) => setFilters({ ...filters, agingStatus: event.target.value as AgingStatus | '' })}><option value="">Envejecimiento</option><option value="CURRENT">Vigente</option><option value="DUE_SOON">Por vencer</option><option value="OVERDUE">Vencida</option></select><input className="rounded-xl border border-[#20211f]/15 p-3" type="date" value={filters.dueDateFrom ?? ''} onChange={(event) => setFilters({ ...filters, dueDateFrom: event.target.value })} /><input className="rounded-xl border border-[#20211f]/15 p-3" type="date" value={filters.dueDateTo ?? ''} onChange={(event) => setFilters({ ...filters, dueDateTo: event.target.value })} /><div className="flex flex-col gap-2 text-xs font-bold"><label><input checked={Boolean(filters.onlyOverdue)} type="checkbox" onChange={(event) => setFilters({ ...filters, onlyOverdue: event.target.checked, onlyUpcoming: false })} /> Solo vencidas</label><label><input checked={Boolean(filters.onlyUpcoming)} type="checkbox" onChange={(event) => setFilters({ ...filters, onlyUpcoming: event.target.checked, onlyOverdue: false })} /> Solo por vencer</label></div></section>
        <OverdueAccountsView accounts={accounts.data ?? []} canPay={canPay} onRegisterPayment={setPaymentAccount} onViewDetail={setSelectedAccount} />
        <AsyncState empty={!accounts.data?.length} error={accounts.error} isLoading={accounts.isLoading}><ReceivableTable accounts={accounts.data ?? []} canPay={canPay} onRegisterPayment={setPaymentAccount} onViewDetail={setSelectedAccount} /></AsyncState>
      </section>
      {selectedAccount && <CustomerBalanceView accountId={selectedAccount.id} fallbackAccount={selectedAccount} onClose={() => setSelectedAccount(null)} />}
      {paymentAccount && <PaymentRegistrationDialog account={paymentAccount} onClose={() => setPaymentAccount(null)} />}
    </main>
  )
}
