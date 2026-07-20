import type { BillingRequestDetail, InvoiceReconciliationInput } from './types'

const money = (value: string | number | undefined) => Number(value ?? 0).toFixed(2)
const sum = (values: string[]) => values.reduce((total, value) => total + Number(value || 0), 0)

export function buildInvoiceReconciliation(request: BillingRequestDetail): InvoiceReconciliationInput {
  const applications = (request.documents ?? []).map((document) => ({
    saleDocumentId: document.saleDocumentId,
    label: `${document.saleDocument.documentType}${document.saleDocument.physicalFolio ? ` · ${document.saleDocument.physicalFolio}` : ''}`,
    subtotalApplied: money(document.requestedSubtotal), taxApplied: money(document.requestedTax), totalApplied: money(document.requestedTotal),
    items: document.saleDocument.sale.items.map((item) => ({ saleItemId: item.id, productName: item.productNameSnapshot, subtotalApplied: money(item.subtotal), taxApplied: money(item.tax), totalApplied: money(item.total) })),
  }))
  return { expectedVersion: request.version, invoice: {
    legalEntityId: request.sale?.legalEntityId ?? request.documents?.[0]?.saleDocument.sale.legalEntityId ?? '',
    currencyCode: request.sale?.currencyCode ?? request.documents?.[0]?.saleDocument.sale.currencyCode ?? 'MXN',
    series: '', folio: '', uuid: '', discount: '0.00', subtotal: money(sum(applications.map((item) => item.subtotalApplied))), tax: money(sum(applications.map((item) => item.taxApplied))), total: money(sum(applications.map((item) => item.totalApplied))),
  }, applications }
}

export function reconciliationBalances(draft: InvoiceReconciliationInput) {
  const documentSubtotal = sum(draft.applications.map((item) => item.subtotalApplied)); const documentTax = sum(draft.applications.map((item) => item.taxApplied)); const documentTotal = sum(draft.applications.map((item) => item.totalApplied))
  const itemDifference = draft.applications.reduce((difference, document) => difference + Math.abs(sum(document.items.map((item) => item.subtotalApplied)) - Number(document.subtotalApplied || 0)) + Math.abs(sum(document.items.map((item) => item.taxApplied)) - Number(document.taxApplied || 0)) + Math.abs(sum(document.items.map((item) => item.totalApplied)) - Number(document.totalApplied || 0)), 0)
  return { subtotalDifference: Number((documentSubtotal - (Number(draft.invoice.subtotal || 0) - Number(draft.invoice.discount || 0))).toFixed(2)), taxDifference: Number((documentTax - Number(draft.invoice.tax || 0)).toFixed(2)), totalDifference: Number((documentTotal - Number(draft.invoice.total || 0)).toFixed(2)), itemDifference: Number(itemDifference.toFixed(2)) }
}
