import { ReceiptText, X } from 'lucide-react'
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

const softButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-4 text-sm font-semibold text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:bg-[var(--erp-surface-muted)]'

export function CustomerBalanceView({ accountId, fallbackAccount, onClose }: CustomerBalanceViewProps) {
  const detail = useAccountReceivableDetail(accountId)
  const account = detail.data ?? fallbackAccount

  return (
    <aside className="fixed inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-[color:var(--erp-border)] bg-[var(--erp-background)] p-5 shadow-2xl md:w-[38rem] md:p-6">
      <div className="sticky top-0 z-10 -mx-5 -mt-5 border-b border-[color:var(--erp-border)] bg-[color-mix(in_srgb,var(--erp-background)_92%,white)]/95 px-5 py-4 backdrop-blur md:-mx-6 md:-mt-6 md:px-6">
        <button className={softButtonClass} onClick={onClose} type="button"><X className="h-4 w-4" /> Cerrar detalle</button>
      </div>
      {detail.isLoading && <p className="mt-6 rounded-2xl border border-[color:var(--erp-border)] bg-white p-4 font-semibold text-[var(--erp-info)]">Cargando cuenta por cobrar...</p>}
      {detail.error && <p role="alert" className="mt-6 rounded-2xl bg-[rgba(157,45,36,0.10)] p-4 font-semibold text-[var(--erp-danger)]">No se pudo cargar el detalle de la cuenta.</p>}
      {account && <div className="mt-6 grid gap-5">
        <header className="rounded-[1.4rem] bg-[var(--erp-charcoal)] p-5 text-white shadow-[var(--erp-shadow-elevated)]">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--erp-brand-gold-soft)]">{account.saleNumber ?? account.saleId ?? 'Cuenta por cobrar'}</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">{detail.data?.customer?.name ?? account.customerName ?? account.customerId}</h2>
          <p className="mt-2 text-sm text-white/70">Saldo pendiente {formatMoney(account.outstandingAmount)} · Estado {account.status}</p>
        </header>
        <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 text-sm shadow-[var(--erp-shadow)]">
          <div className="mb-4 flex flex-wrap gap-2"><BillingRequestBadge billingRequestId={account.billingRequestId} /><CreditBlockedCustomerBadge creditStatus={detail.data?.customer?.creditStatus} daysOverdue={account.daysOverdue} outstandingAmount={account.outstandingAmount} /></div>
          <div className="grid gap-3">
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Monto original</span><strong>{formatMoney(account.originalAmount)}</strong></p>
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Saldo final</span><strong className="text-[var(--erp-danger)]">{formatMoney(account.outstandingAmount)}</strong></p>
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Fecha de venta</span><strong>{formatDate(account.saleDate)}</strong></p>
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Fecha de vencimiento</span><strong>{formatDate(account.dueDate)}</strong></p>
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Días de crédito</span><strong>{account.paymentTermsDays ?? '—'}</strong></p>
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Días de atraso</span><strong>{account.daysOverdue ?? 0}</strong></p>
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Último pago</span><strong>{formatDate(account.lastPaymentDate)}</strong></p>
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Ubicación operativa</span><strong>{detail.data?.sale?.locationId ?? '—'}</strong></p>
            <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Tipo documental</span><strong>{detail.data?.sale?.documentType ?? '—'}</strong></p>
          </div>
        </section>
        <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 text-sm shadow-[var(--erp-shadow)]">
          <div className="flex items-center justify-between gap-4"><h3 className="font-black">Pagos registrados</h3><ReceiptText className="h-5 w-5 text-[var(--erp-muted-foreground)]" /></div>
          {!detail.data?.payments?.length && <p className="mt-3 rounded-2xl bg-[var(--erp-surface)] p-3 text-[var(--erp-muted-foreground)]">Sin pagos registrados.</p>}
          <div className="mt-3 grid gap-2">{detail.data?.payments?.map((payment) => <article className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3" key={payment.id}><p className="font-semibold">{formatMoney(payment.amount)} · {payment.paymentMethod} · {payment.status}</p><p className="text-[var(--erp-muted-foreground)]">CxC {payment.accountReceivableId} · Banco {payment.bankName ?? '—'} · Ref {payment.referenceNumber ?? '—'}</p><p className="text-[var(--erp-muted-foreground)]">Documento {payment.appliedDocumentId ?? '—'} · Ruta {payment.routeId ?? '—'} · Liquidación {payment.routeSettlementId ?? '—'} · Vuelta {payment.collectionPass ?? '—'}</p><p className="text-[var(--erp-muted-foreground)]">Fecha {formatDate(payment.paidAt)}</p></article>)}</div>
        </section>
      </div>}
    </aside>
  )
}
