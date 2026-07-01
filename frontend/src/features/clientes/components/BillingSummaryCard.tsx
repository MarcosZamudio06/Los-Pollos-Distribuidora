import type { BillingSummary, CustomerCreditSummary } from '../types'

function toMoney(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString('es-MX', { currency: 'MXN', style: 'currency' })
}

export function BillingSummaryCard({ billingSummary, creditSummary }: { billingSummary?: BillingSummary | null; creditSummary?: CustomerCreditSummary | null }) {
  const billedAmount = billingSummary?.billedAmount ?? creditSummary?.billedAmount
  const paidAmount = billingSummary?.paidAmount ?? creditSummary?.paidAmount
  const finalBalance = billingSummary?.finalBalance ?? creditSummary?.finalBalance ?? creditSummary?.globalBalance

  return (
    <aside className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#39798b]">Resumen administrativo</p>
      <div className="mt-4 grid gap-3 text-sm">
        <p className="flex justify-between"><span>Facturado</span><strong>{toMoney(billedAmount)}</strong></p>
        <p className="flex justify-between"><span>Pagado</span><strong>{toMoney(paidAmount)}</strong></p>
        <p className="flex justify-between"><span>Saldo final</span><strong>{toMoney(finalBalance)}</strong></p>
        <p className="flex justify-between"><span>Órdenes administrativas abiertas</span><strong>{billingSummary?.openAdministrativeOrders ?? '—'}</strong></p>
      </div>
    </aside>
  )
}
