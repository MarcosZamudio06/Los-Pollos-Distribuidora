import { useAccountReceivableDetail } from '../hooks/useAccountsReceivable'
import { BillingRequestBadge } from './BillingRequestBadge'
import { CreditBlockedCustomerBadge } from './CreditBlockedCustomerBadge'
import { formatDate, formatMoney } from './formatters'
import type { AccountReceivable } from '../types'

type CustomerBalanceViewProps = {
  accountId?: string
  fallbackAccount?: AccountReceivable | null
  onClose: () => void
}

export function CustomerBalanceView({ accountId, fallbackAccount, onClose }: CustomerBalanceViewProps) {
  const detail = useAccountReceivableDetail(accountId)
  const account = detail.data ?? fallbackAccount

  return (
    <aside className="fixed inset-y-0 right-0 z-30 w-full overflow-y-auto bg-[#f5f3ee] p-6 shadow-2xl md:w-[36rem]">
      <button className="font-bold text-[#68645c]" onClick={onClose} type="button">Cerrar detalle</button>
      {detail.isLoading && <p className="mt-6 rounded-2xl bg-white p-4 font-bold text-[#39798b]">Cargando cuenta por cobrar...</p>}
      {detail.error && <p role="alert" className="mt-6 rounded-2xl bg-[#d43f2f]/10 p-4 font-bold text-[#9d2d24]">No se pudo cargar el detalle de la cuenta.</p>}
      {account && <div className="mt-6 grid gap-5">
        <header className="rounded-[1.75rem] bg-[#20211f] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#f0b44c]">{account.saleNumber ?? account.saleId ?? 'Cuenta por cobrar'}</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em]">{detail.data?.customer?.name ?? account.customerName ?? account.customerId}</h2>
          <p className="mt-2 text-sm text-white/70">Saldo pendiente {formatMoney(account.outstandingAmount)} · Estado {account.status}</p>
        </header>
        <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 text-sm">
          <div className="mb-4 flex flex-wrap gap-2"><BillingRequestBadge billingRequestId={account.billingRequestId} /><CreditBlockedCustomerBadge creditStatus={detail.data?.customer?.creditStatus} daysOverdue={account.daysOverdue} outstandingAmount={account.outstandingAmount} /></div>
          <div className="grid gap-3">
            <p className="flex justify-between"><span>Monto original</span><strong>{formatMoney(account.originalAmount)}</strong></p>
            <p className="flex justify-between"><span>Saldo final</span><strong>{formatMoney(account.outstandingAmount)}</strong></p>
            <p className="flex justify-between"><span>Fecha de venta</span><strong>{formatDate(account.saleDate)}</strong></p>
            <p className="flex justify-between"><span>Fecha de vencimiento</span><strong>{formatDate(account.dueDate)}</strong></p>
            <p className="flex justify-between"><span>Días de crédito</span><strong>{account.paymentTermsDays ?? '—'}</strong></p>
            <p className="flex justify-between"><span>Días de atraso</span><strong>{account.daysOverdue ?? 0}</strong></p>
            <p className="flex justify-between"><span>Último pago</span><strong>{formatDate(account.lastPaymentDate)}</strong></p>
            <p className="flex justify-between"><span>Ubicación operativa</span><strong>{detail.data?.sale?.locationId ?? '—'}</strong></p>
            <p className="flex justify-between"><span>Tipo documental</span><strong>{detail.data?.sale?.documentType ?? '—'}</strong></p>
          </div>
        </section>
        <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 text-sm">
          <h3 className="font-black">Pagos registrados</h3>
          {!detail.data?.payments?.length && <p className="mt-3 text-[#68645c]">Sin pagos registrados.</p>}
          <div className="mt-3 grid gap-2">{detail.data?.payments?.map((payment) => <article className="rounded-2xl bg-[#f5f3ee] p-3" key={payment.id}><p className="font-bold">{formatMoney(payment.amount)} · {payment.paymentMethod} · {payment.status}</p><p className="text-[#68645c]">CxC {payment.accountReceivableId} · Banco {payment.bankName ?? '—'} · Ref {payment.referenceNumber ?? '—'}</p><p className="text-[#68645c]">Documento {payment.appliedDocumentId ?? '—'} · Ruta {payment.routeId ?? '—'} · Liquidación {payment.routeSettlementId ?? '—'} · Vuelta {payment.collectionPass ?? '—'}</p><p className="text-[#68645c]">Fecha {formatDate(payment.paidAt)}</p></article>)}</div>
        </section>
      </div>}
    </aside>
  )
}
