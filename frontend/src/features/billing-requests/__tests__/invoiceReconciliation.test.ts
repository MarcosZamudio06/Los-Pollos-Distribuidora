import { describe, expect, it } from 'vitest'
import { buildInvoiceReconciliation, reconciliationBalances } from '../invoiceReconciliation'

describe('invoice reconciliation', () => {
  it('prepares document and item applications from the approved request', () => {
    const draft = buildInvoiceReconciliation({
      id: 'request-1', version: 2, status: 'APPROVED', customerId: 'customer-1', saleId: 'sale-1', requestedByUserId: 'admin-1', requestedAt: '', createdAt: '', updatedAt: '',
      sale: { id: 'sale-1', legalEntityId: 'legal-1', currencyCode: 'MXN' },
      documents: [{ id: 'relation-1', saleDocumentId: 'document-1', requestedSubtotal: '90.00', requestedTax: '10.00', requestedTotal: '100.00', requestedItems: [{ saleItemId: 'item-1', requestedSubtotal: '90.00', requestedTax: '10.00', requestedTotal: '100.00', saleItem: { id: 'item-1', productNameSnapshot: 'Pollo' } }], saleDocument: { id: 'document-1', documentType: 'SIMPLE_NOTE', sale: { id: 'sale-1', legalEntityId: 'legal-1', currencyCode: 'MXN', items: [{ id: 'item-1', productNameSnapshot: 'Pollo', subtotal: '90.00', tax: '10.00', total: '100.00' }, { id: 'item-2', productNameSnapshot: 'Pechuga', subtotal: '90.00', tax: '10.00', total: '100.00' }] } } }],
    })

    expect(draft.applications[0].items[0]).toEqual(expect.objectContaining({ saleItemId: 'item-1', totalApplied: '100.00' }))
    expect(draft.applications[0].items).toHaveLength(1)
    expect(reconciliationBalances(draft)).toEqual({ subtotalDifference: 0, taxDifference: 0, totalDifference: 0, itemDifference: 0 })
  })
})
