import { Badge } from '@/components/ui'
import { billingRequestStatusLabel, billingRequestStatusTone } from './status'
import type { BillingRequestStatus } from './types'

export function BillingRequestStatusBadge({ status }: { status: BillingRequestStatus }) {
  return <Badge tone={billingRequestStatusTone(status)}>{billingRequestStatusLabel(status)}</Badge>
}
