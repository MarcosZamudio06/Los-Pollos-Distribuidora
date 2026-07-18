import type { Customer, CustomerCreditSummary } from '../types'

const money = (value: string | number | null | undefined) => Number(value ?? 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

const statusLabels = { ACTIVE: 'Activo', BLOCKED: 'Bloqueado', SUSPENDED: 'Suspendido', WARNING: 'Advertencia' } as const
const reasonLabels: Record<string, string> = {
  CREDIT_ADMINISTRATIVELY_BLOCKED: 'Bloqueo administrativo',
  CREDIT_LIMIT_EXCEEDED: 'Límite de crédito excedido',
  CREDIT_OVERDUE_BLOCKED: 'Saldo vencido bloquea crédito nuevo',
  CREDIT_OVERDUE_WARNING: 'Saldo vencido con advertencia',
}

function policyLabel(mode?: CustomerCreditSummary['overdueBlockingMode']) {
  if (mode === 'BLOCK_NEW_CREDIT') return 'Bloquea crédito nuevo'
  if (mode === 'WARN_ONLY') return 'Solo advertencia'
  return 'Sin bloqueo automático'
}

export function CreditStateDetails({ customer, summary }: { customer: Customer; summary?: CustomerCreditSummary | null }) {
  const effective = summary?.effectiveCreditStatus ?? customer.effectiveCreditStatus ?? (customer.creditStatus === 'ACTIVE' ? 'ACTIVE' : 'BLOCKED')
  const reasons = summary?.blockingReasons ?? []
  return (
    <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 text-sm shadow-[var(--erp-shadow)]">
      <div className="mb-4 flex items-center justify-between gap-3"><h3 className="font-black">Decisión de crédito</h3><span className={`rounded-full px-3 py-1 text-xs font-black ${effective === 'BLOCKED' ? 'bg-[rgba(157,45,36,0.10)] text-[var(--erp-danger)]' : effective === 'WARNING' ? 'bg-amber-50 text-amber-800' : 'bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]'}`}>{statusLabels[effective]}</span></div>
      <dl className="grid gap-3">
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Estado administrativo</dt><dd className="font-black">{statusLabels[(summary?.creditStatus ?? customer.creditStatus ?? 'ACTIVE') as keyof typeof statusLabels]}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Límite</dt><dd className="font-black">{money(summary?.creditLimit ?? customer.creditLimit)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Días de crédito</dt><dd className="font-black">{summary?.creditDays ?? customer.creditDays ?? '—'}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Saldo global</dt><dd className="font-black">{money(summary?.globalBalance)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Saldo vencido</dt><dd className="font-black text-[var(--erp-danger)]">{money(summary?.overdueAmount)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Crédito disponible</dt><dd className="font-black">{summary?.availableCredit == null ? '—' : money(summary.availableCredit)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Atraso máximo</dt><dd className="font-black">{summary?.maximumDaysOverdue ?? summary?.daysOverdue ?? 0} días</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Política de mora</dt><dd className="font-black">{policyLabel(summary?.overdueBlockingMode)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Motivos</dt><dd className="text-right font-black">{reasons.length ? reasons.map((reason) => reasonLabels[reason] ?? reason).join(' · ') : 'Sin restricciones'}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Último pago</dt><dd className="font-black">{summary?.lastPaymentDate ? new Date(summary.lastPaymentDate).toLocaleDateString('es-MX') : '—'}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[var(--erp-muted-foreground)]">Política aplicada</dt><dd className="font-black">{summary?.commercialPolicyApplied ?? customer.commercialPolicyId ?? '—'}</dd></div>
      </dl>
      {summary?.canAdministrativeOverride && <p className="mt-4 rounded-xl bg-[rgba(47,111,115,0.08)] p-3 font-bold text-[var(--erp-info)]">Autorización administrativa disponible</p>}
    </section>
  )
}
