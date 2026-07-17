import type { BadgeTone } from '@/components/ui'
import type { BillingRequestStatus } from './types'

const labels: Record<BillingRequestStatus, string> = {
  REQUESTED: 'Solicitada',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
}

export function billingRequestStatusLabel(status: BillingRequestStatus) { return labels[status] }

export function billingRequestStatusTone(status: BillingRequestStatus): BadgeTone {
  if (status === 'APPROVED') return 'green'
  if (status === 'REJECTED' || status === 'CANCELLED') return 'red'
  if (status === 'IN_REVIEW') return 'blue'
  return 'amber'
}

export function availableBillingRequestActions(status: BillingRequestStatus, role?: string | null): BillingRequestStatus[] {
  if (role !== 'ADMIN') return []
  if (status === 'REQUESTED') return ['IN_REVIEW', 'CANCELLED']
  if (status === 'IN_REVIEW') return ['APPROVED', 'REJECTED', 'CANCELLED']
  return []
}
