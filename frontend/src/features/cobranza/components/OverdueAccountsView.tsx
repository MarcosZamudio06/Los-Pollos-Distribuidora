import { CreditBlockedCustomerBadge } from './CreditBlockedCustomerBadge'
import { formatMoney, formatDate } from './formatters'
import type { AccountReceivable } from '../types'

type OverdueAccountsViewProps = {
  accounts: AccountReceivable[]
  canPay: boolean
  onRegisterPayment: (account: AccountReceivable) => void
  onViewDetail: (account: AccountReceivable) => void
}

export function OverdueAccountsView({ accounts, canPay, onRegisterPayment, onViewDetail }: OverdueAccountsViewProps) {
  const overdueAccounts = accounts.filter((account) => account.agingStatus === 'OVERDUE')

  return (
    <section className="rounded-[1.75rem] border border-[#d43f2f]/20 bg-white p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#9d2d24]">Cuentas vencidas</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Cobranza prioritaria</h2>
        </div>
        <strong className="text-[#9d2d24]">{overdueAccounts.length} vencidas</strong>
      </div>
      {!overdueAccounts.length && <p className="mt-4 rounded-2xl bg-[#f5f3ee] p-4 text-sm text-[#68645c]">No hay cuentas vencidas con los filtros actuales.</p>}
      <div className="mt-4 grid gap-3">
        {overdueAccounts.slice(0, 6).map((account) => (
          <article className="grid gap-3 rounded-2xl border border-[#20211f]/10 bg-[#f5f3ee] p-4 md:grid-cols-[1fr_auto] md:items-center" key={account.id}>
            <div>
              <p className="font-black">{account.customerName ?? account.customerId}</p>
              <p className="text-sm text-[#68645c]">Saldo vencido {formatMoney(account.outstandingAmount)} · Vence {formatDate(account.dueDate)} · Folio {account.physicalDocumentFolio ?? '—'}</p>
              <div className="mt-2"><CreditBlockedCustomerBadge creditStatus={account.customerCreditStatus} daysOverdue={account.daysOverdue} outstandingAmount={account.outstandingAmount} /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-xl border border-[#20211f]/15 px-4 py-2 text-sm font-bold" onClick={() => onViewDetail(account)} type="button">Ver detalle</button>
              <button className="rounded-xl bg-[#20211f] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={!canPay || account.status === 'PAID' || account.status === 'CANCELLED'} onClick={() => onRegisterPayment(account)} type="button">Registrar pago</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
