import type { CreditStatus } from '../types'

type CreditBlockedCustomerBadgeProps = {
  creditStatus?: CreditStatus | null
  daysOverdue?: number | null
  outstandingAmount?: string | number | null
}

export function CreditBlockedCustomerBadge({ creditStatus, daysOverdue = 0, outstandingAmount }: CreditBlockedCustomerBadgeProps) {
  const normalizedStatus = String(creditStatus ?? '').toUpperCase()
  const balance = Number(outstandingAmount ?? 0)
  const label = !normalizedStatus
    ? 'Estado de crédito no informado'
    : normalizedStatus === 'SUSPENDED'
    ? 'Crédito suspendido'
    : normalizedStatus === 'BLOCKED' && (daysOverdue ?? 0) > 0
      ? 'Bloqueo por mora'
      : normalizedStatus === 'BLOCKED' && balance > 0
        ? 'Bloqueo por límite excedido'
        : 'Crédito activo'
  const blocked = label !== 'Crédito activo' && label !== 'Estado de crédito no informado'

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.14em] ${blocked ? 'bg-[#d43f2f]/10 text-[#9d2d24]' : 'bg-[#39798b]/10 text-[#39798b]'}`}>
      {label}
    </span>
  )
}
