import { AlertTriangle, CircleDollarSign, Eye } from 'lucide-react'
import { CreditBlockedCustomerBadge } from './CreditBlockedCustomerBadge'
import { formatMoney, formatDate } from './formatters'
import type { AccountReceivable } from '../types'

type OverdueAccountsViewProps = {
  accounts: AccountReceivable[]
  canPay: boolean
  onRegisterPayment: (account: AccountReceivable) => void
  onViewDetail: (account: AccountReceivable) => void
}

const actionClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-4 text-sm font-semibold transition hover:border-[var(--erp-brand-gold)] hover:bg-[var(--erp-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50'

export function OverdueAccountsView({ accounts, canPay, onRegisterPayment, onViewDetail }: OverdueAccountsViewProps) {
  const overdueAccounts = accounts.filter((account) => account.agingStatus === 'OVERDUE')

  return (
    <section className="rounded-[1.4rem] border border-[rgba(157,45,36,0.22)] bg-white p-5 shadow-[var(--erp-shadow)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[var(--erp-danger)]"><AlertTriangle className="h-4 w-4" /> Cuentas vencidas</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Cobranza prioritaria</h2>
          <p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Cuentas con vencimiento detectado en los filtros actuales.</p>
        </div>
        <strong className="rounded-full border border-[rgba(157,45,36,0.22)] bg-[rgba(157,45,36,0.08)] px-3 py-1 text-sm text-[var(--erp-danger)]">{overdueAccounts.length} vencidas</strong>
      </div>
      {!overdueAccounts.length && <p className="mt-4 rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4 text-sm text-[var(--erp-muted-foreground)]">No hay cuentas vencidas con los filtros actuales.</p>}
      <div className="mt-4 grid gap-3">
        {overdueAccounts.slice(0, 6).map((account) => (
          <article className="grid gap-4 rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4 transition hover:border-[rgba(157,45,36,0.26)] md:grid-cols-[1fr_auto] md:items-center" key={account.id}>
            <div>
              <p className="font-black tracking-[-0.02em]">{account.customerName ?? account.customerId}</p>
              <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Saldo vencido <strong className="text-[var(--erp-danger)]">{formatMoney(account.outstandingAmount)}</strong> · Vence {formatDate(account.dueDate)} · Folio {account.physicalDocumentFolio ?? '—'}</p>
              <div className="mt-2"><CreditBlockedCustomerBadge creditStatus={account.customerCreditStatus} daysOverdue={account.daysOverdue} outstandingAmount={account.outstandingAmount} /></div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <button className={actionClass} onClick={() => onViewDetail(account)} type="button"><Eye className="h-4 w-4" /> Ver detalle</button>
              <button className={`${actionClass} bg-[var(--erp-charcoal)] text-white hover:bg-[var(--erp-graphite)]`} disabled={!canPay || account.status === 'PAID' || account.status === 'CANCELLED'} onClick={() => onRegisterPayment(account)} type="button"><CircleDollarSign className="h-4 w-4" /> Registrar pago</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
