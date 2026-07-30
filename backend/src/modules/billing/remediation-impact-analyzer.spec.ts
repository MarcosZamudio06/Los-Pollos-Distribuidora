import { RemediationImpactAnalyzer } from './remediation-impact-analyzer';

describe('RemediationImpactAnalyzer', () => {
  const analyzer = new RemediationImpactAnalyzer();

  function sale(overrides: Record<string, unknown> = {}) {
    return {
      status: 'CONFIRMED',
      paymentType: 'CREDIT_SALE',
      payments: [],
      accountReceivable: null,
      pointOfSaleDailyClose: null,
      cashShift: null,
      route: null,
      documents: [],
      ...overrides,
    };
  }

  it('blocks monetary edits to cancelled sales and closed accounting periods or documents', () => {
    const blockers = analyzer.analyze(
      sale({
        status: 'CANCELLED',
        pointOfSaleDailyClose: { status: 'CLOSED' },
        cashShift: { status: 'CLOSED' },
        route: { settlement: { status: 'CLOSED' } },
        documents: [
          {
            status: 'ISSUED',
            customerSnapshot: { name: 'Customer' },
            productSnapshot: null,
            priceSnapshot: null,
            billingRequestDocuments: [],
            invoiceDocuments: [],
          },
        ],
      }),
      '900.00',
    );

    expect(blockers.map((blocker) => blocker.code)).toEqual([
      'SALE_CANCELLED',
      'DAILY_CLOSE_CLOSED',
      'CASH_SHIFT_CLOSED',
      'ROUTE_SETTLEMENT_CLOSED',
      'PRINTED_DOCUMENT_IMMUTABLE',
    ]);
  });

  it('blocks incompatible payments, receivables, active requests, reservations and invoice applications', () => {
    const blockers = analyzer.analyze(
      sale({
        payments: [{ status: 'APPLIED', amount: '1000.00' }],
        accountReceivable: {
          originalAmount: '400.00',
          outstandingAmount: '350.00',
          payments: [{ status: 'APPLIED', amount: '100.00' }],
        },
        documents: [
          {
            status: 'DRAFT',
            customerSnapshot: null,
            productSnapshot: null,
            priceSnapshot: null,
            billingRequestDocuments: [
              {
                reversedAt: null,
                billingRequest: { status: 'APPROVED' },
                requestedItems: [{ reversedAt: null }],
              },
            ],
            invoiceDocuments: [
              {
                reversedAt: null,
                invoice: { status: 'SUBSTITUTED' },
                itemApplications: [{ reversedAt: null }],
              },
            ],
          },
        ],
      }),
      '900.00',
    );

    expect(blockers.map((blocker) => blocker.code)).toEqual([
      'APPLIED_PAYMENT_INCOMPATIBLE',
      'ACCOUNT_RECEIVABLE_INCOMPATIBLE',
      'ACTIVE_BILLING_REQUEST',
      'ACTIVE_BILLING_RESERVATION',
      'ACTIVE_INVOICE_APPLICATION',
      'ACTIVE_INVOICE_ITEM_APPLICATION',
      'RELATED_INVOICE_IMMUTABLE',
    ]);
  });

  it('allows a compatible open credit sale without billing history', () => {
    const blockers = analyzer.analyze(
      sale({
        payments: [{ status: 'APPLIED', amount: '100.00' }],
        accountReceivable: {
          originalAmount: '800.00',
          outstandingAmount: '750.00',
          payments: [{ status: 'APPLIED', amount: '50.00' }],
        },
      }),
      '900.00',
    );

    expect(blockers).toEqual([]);
  });

  it('does not count a receivable payment twice when it also references the sale', () => {
    const blockers = analyzer.analyze(
      sale({
        payments: [
          { status: 'APPLIED', amount: '100.00', accountReceivableId: null },
          { status: 'APPLIED', amount: '50.00', accountReceivableId: 'ar-1' },
        ],
        accountReceivable: {
          originalAmount: '800.00',
          outstandingAmount: '750.00',
          payments: [
            { status: 'APPLIED', amount: '50.00', accountReceivableId: 'ar-1' },
          ],
        },
      }),
      '900.00',
    );

    expect(blockers).toEqual([]);
  });

  it('requires applied cash payments to equal the corrected total', () => {
    const blockers = analyzer.analyze(
      sale({
        paymentType: 'CASH_SALE',
        payments: [{ status: 'APPLIED', amount: '850.00' }],
      }),
      '900.00',
    );

    expect(blockers).toEqual([
      expect.objectContaining({ code: 'APPLIED_PAYMENT_INCOMPATIBLE' }),
    ]);
  });
});
