import { ReceiptText } from 'lucide-react'
import type { BillingSummary, CustomerCreditSummary } from '../types'
import { formatMoney } from '../../../lib/money'

function toMoney(value: string | number | null | undefined) {
  if (value === undefined || value === null) return '—'
  return formatMoney(value)
}

export function BillingSummaryCard({ billingSummary, creditSummary }: { billingSummary?: BillingSummary | null; creditSummary?: CustomerCreditSummary | null }) {
  const billedAmount = billingSummary?.billedAmount ?? creditSummary?.billedAmount
  const paidAmount = billingSummary?.paidAmount ?? creditSummary?.paidAmount
  const finalBalance = billingSummary?.finalBalance ?? creditSummary?.finalBalance ?? creditSummary?.globalBalance

  return (
    <aside className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 shadow-[var(--erp-shadow)]">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--erp-info)]">Resumen administrativo</p><h3 className="mt-2 text-lg font-black">Documentos y saldo</h3></div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(47,111,115,0.22)] bg-[rgba(47,111,115,0.10)] text-[var(--erp-info)]"><ReceiptText className="h-5 w-5" /></span>
      </div>
      <div className="mt-4 grid gap-3 text-sm">
        <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Facturado</span><strong>{toMoney(billedAmount)}</strong></p>
        <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Pagado</span><strong>{toMoney(paidAmount)}</strong></p>
        <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Saldo final</span><strong className="text-[var(--erp-danger)]">{toMoney(finalBalance)}</strong></p>
        <p className="flex justify-between gap-4"><span className="text-[var(--erp-muted-foreground)]">Órdenes administrativas abiertas</span><strong>{billingSummary?.openAdministrativeOrders ?? '—'}</strong></p>
      </div>
    </aside>
  )
}
