import { Link } from 'react-router-dom'
import { BillingRequestStatusBadge } from '../../billing-requests'
import type { BillingRequestStatus } from '../../billing-requests/types'

type BillingRequestBadgeProps = { billingRequestId?: string | null; status?: string | null }

export function BillingRequestBadge({ billingRequestId, status }: BillingRequestBadgeProps) {
  if (!billingRequestId) return <span className="inline-flex rounded-full bg-[#20211f]/8 px-3 py-1 text-xs font-bold text-[#68645c]">Sin solicitud administrativa</span>
  return <Link aria-label={`Ver solicitud ${billingRequestId}`} className="inline-flex" to={`/billing-requests/${billingRequestId}`}>{status ? <BillingRequestStatusBadge status={status as BillingRequestStatus} /> : <span className="rounded-full bg-[#f0b44c]/20 px-3 py-1 text-xs font-bold text-[#79520f]">Ver solicitud</span>}</Link>
}
