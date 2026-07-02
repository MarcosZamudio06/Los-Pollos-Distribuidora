type BillingRequestBadgeProps = { billingRequestId?: string | null }

export function BillingRequestBadge({ billingRequestId }: BillingRequestBadgeProps) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${billingRequestId ? 'bg-[#f0b44c]/20 text-[#79520f]' : 'bg-[#20211f]/8 text-[#68645c]'}`}>
      {billingRequestId ? `Solicitud ${billingRequestId}` : 'Sin solicitud administrativa'}
    </span>
  )
}
