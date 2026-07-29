import { SaleConsistencyValidator } from './sale-consistency-validator';

describe('SaleConsistencyValidator', () => {
  const validator = new SaleConsistencyValidator();

  function sale(overrides: Record<string, unknown> = {}) {
    return {
      subtotal: '100.00', discount: '0.00', discountPercentage: '0.00', tax: '0.00', total: '100.00',
      discountAuthorizationId: null, discountAuthorization: null, paymentType: 'CASH_SALE',
      items: [{ id: 'item-1', subtotal: '100.00', discount: '0.00', taxableBase: '100.00', tax: '0.00', total: '100.00' }],
      payments: [{ status: 'APPLIED', amount: '100.00' }], accountReceivable: null, documents: [],
      ...overrides,
    };
  }

  it('accepts a sale whose complete monetary graph is consistent', () => {
    expect(validator.validate(sale())).toEqual([]);
  });

  it('reports item equations, header sums, taxable base, taxes and discount authorization', () => {
    const findings = validator.validate(sale({
      subtotal: '100.00', discount: '10.00', discountPercentage: '10.00', tax: '16.00', total: '106.00',
      discountAuthorizationId: null, discountAuthorization: null,
      items: [{ id: 'item-1', subtotal: '90.00', discount: '10.00', taxableBase: '85.00', tax: '15.00', total: '99.00' }],
      payments: [{ status: 'APPLIED', amount: '106.00' }],
    }));

    expect(findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'INVALID_ITEM_EQUATION',
      'ITEM_TOTALS_MISMATCH',
      'TAXABLE_BASE_MISMATCH',
      'TAX_AMOUNTS_MISMATCH',
      'UNAUTHORIZED_DISCOUNT',
    ]));
  });

  it('reports incompatible applied payments and receivable balances', () => {
    const findings = validator.validate(sale({
      paymentType: 'CREDIT_SALE',
      payments: [{ status: 'APPLIED', amount: '20.00' }],
      accountReceivable: {
        originalAmount: '80.00', outstandingAmount: '70.00',
        payments: [{ status: 'APPLIED', amount: '5.00' }],
      },
    }));

    expect(findings.map((finding) => finding.code)).toEqual(['RECEIVABLE_BALANCE_MISMATCH']);
    expect(validator.validate(sale({ payments: [{ status: 'APPLIED', amount: '90.00' }] })))
      .toEqual([expect.objectContaining({ code: 'APPLIED_PAYMENTS_MISMATCH' })]);

    expect(validator.validate(sale({
      paymentType: 'CREDIT_SALE',
      payments: [
        { status: 'APPLIED', amount: '20.00', accountReceivableId: null },
        { status: 'APPLIED', amount: '5.00', accountReceivableId: 'ar-1' },
      ],
      accountReceivable: {
        originalAmount: '80.00', outstandingAmount: '75.00',
        payments: [{ status: 'APPLIED', amount: '5.00', accountReceivableId: 'ar-1' }],
      },
    }))).toEqual([]);
  });

  it('reports requested and invoiced amounts that contradict document or item sources', () => {
    const findings = validator.validate(sale({
      documents: [{
        billingRequestDocuments: [{
          reversedAt: null, requestedSubtotal: '90.00', requestedTax: '0.00', requestedTotal: '90.00',
          billingRequest: { status: 'APPROVED' },
          requestedItems: [{ saleItemId: 'item-1', reversedAt: null, requestedSubtotal: '80.00', requestedTax: '0.00', requestedTotal: '80.00' }],
        }],
        invoiceDocuments: [{
          reversedAt: null, subtotalApplied: '90.00', taxApplied: '0.00', totalApplied: '90.00',
          invoice: { status: 'ACTIVE', subtotal: '90.00', discount: '0.00', tax: '0.00', total: '90.00' },
          itemApplications: [{ saleItemId: 'item-1', reversedAt: null, subtotalApplied: '80.00', taxApplied: '0.00', totalApplied: '80.00' }],
        }],
      }],
    }));

    expect(findings.map((finding) => finding.code)).toEqual([
      'REQUESTED_AMOUNTS_MISMATCH',
      'INVOICED_AMOUNTS_MISMATCH',
    ]);
  });
});
