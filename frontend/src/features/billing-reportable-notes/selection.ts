import type { BillingReportItem } from './types'

type CompatibleNote = Pick<BillingReportItem, 'saleDocumentId' | 'customerId' | 'currencyCode' | 'legalEntityId' | 'billingStatus' | 'activeRequested' | 'pendingTotal'>

export function isRequestableNote(note: CompatibleNote) {
  return ['BILLABLE', 'PARTIALLY_INVOICED'].includes(note.billingStatus)
    && Number(note.pendingTotal) > 0
    && Number(note.activeRequested) === 0
}

export function areNotesCompatible(anchor: CompatibleNote, candidate: CompatibleNote) {
  return anchor.customerId === candidate.customerId && anchor.currencyCode === candidate.currencyCode && anchor.legalEntityId === candidate.legalEntityId && isRequestableNote(candidate)
}
