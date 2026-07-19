import type { BillingReportItem } from './types'

type CompatibleNote = Pick<BillingReportItem, 'saleDocumentId' | 'customerId' | 'currencyCode' | 'legalEntityId' | 'billingStatus' | 'pendingInvoice'>
export function areNotesCompatible(anchor: CompatibleNote, candidate: CompatibleNote) {
  return anchor.customerId === candidate.customerId && anchor.currencyCode === candidate.currencyCode && anchor.legalEntityId === candidate.legalEntityId && Number(candidate.pendingInvoice) > 0 && !['BLOCKED', 'CANCELLED', 'NOT_BILLABLE', 'FULLY_INVOICED'].includes(candidate.billingStatus)
}
