import { Prisma } from '@prisma/client';
import {
  BillingBalanceError,
  evaluateBillability,
  type BillabilityInput,
  validateAppliedAmount,
  validateRequestedAmount,
} from './billability-evaluator';

const decimal = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const baseInput = (): BillabilityInput => ({
  sale: {
    status: 'CONFIRMED' as const,
    total: decimal('1000.00'),
    customerId: 'customer-1',
    currencyCode: 'MXN',
    legalEntityId: 'legal-entity-1',
    createdAt: new Date('2026-07-01T12:00:00.000Z'),
  },
  document: {
    documentType: 'SIMPLE_NOTE' as const,
    status: 'ISSUED' as const,
    issuedAt: new Date('2026-07-01T12:00:00.000Z'),
  },
  customer: {
    isActive: true,
    taxId: 'XAXX010101000',
    fiscalName: 'Cliente de prueba',
    fiscalPostalCode: '06000',
    fiscalRegime: '601',
    fiscalUseCode: 'G03',
    billingEmail: 'billing@example.com',
  },
  delivery: { status: 'DELIVERED' as const, deliveredAt: new Date('2026-07-02T12:00:00.000Z') },
  policy: {
    billableDocumentTypes: ['SIMPLE_NOTE', 'LARGE_NOTE'] as const,
    allowInternalReceipt: false,
    requireConfirmedDelivery: false,
    deadlineDays: 30,
    deadlineBasis: 'ISSUED_AT' as const,
    timezone: 'America/Mexico_City',
  },
  requests: [],
  applications: [],
  payments: [],
  evaluatedAt: new Date('2026-07-18T12:00:00.000Z'),
});

describe('evaluateBillability', () => {
  it('returns BILLABLE and exact Decimal balances for an eligible document', () => {
    const result = evaluateBillability(baseInput());

    expect(result.status).toBe('BILLABLE');
    expect(result.blockingCodes).toEqual([]);
    expect(result.amounts).toEqual({
      billable: decimal('1000.00'),
      activeRequested: decimal(0),
      activeInvoiced: decimal(0),
      pendingInvoice: decimal('1000.00'),
      activePaid: decimal(0),
      collectionBalance: decimal('1000.00'),
    });
  });

  it('excludes terminal requests, non-active invoices, reversals, and cancelled payments', () => {
    const input = baseInput();
    input.requests = [
      { status: 'REQUESTED', requestedTotal: decimal(200) },
      { status: 'REJECTED', requestedTotal: decimal(300) },
      { status: 'APPROVED', requestedTotal: decimal(50), reversedAt: new Date() },
    ];
    input.applications = [
      { invoiceStatus: 'ACTIVE', totalApplied: decimal(250) },
      { invoiceStatus: 'CANCELLED', totalApplied: decimal(150) },
      { invoiceStatus: 'SUBSTITUTED', totalApplied: decimal(100) },
      { invoiceStatus: 'ACTIVE', totalApplied: decimal(50), reversedAt: new Date() },
    ];
    input.payments = [
      { status: 'APPLIED', amount: decimal(400) },
      { status: 'REGISTERED', amount: decimal(100) },
      { status: 'CANCELLED', amount: decimal(200) },
    ];

    const result = evaluateBillability(input);

    expect(result.status).toBe('PARTIALLY_INVOICED');
    expect(result.amounts.activeRequested).toEqual(decimal(200));
    expect(result.amounts.activeInvoiced).toEqual(decimal(250));
    expect(result.amounts.pendingInvoice).toEqual(decimal(750));
    expect(result.amounts.activePaid).toEqual(decimal(500));
    expect(result.amounts.collectionBalance).toEqual(decimal(500));
  });

  it.each([
    ['REQUESTED', 'REQUESTED'],
    ['IN_REVIEW', 'IN_PROCESS'],
    ['APPROVED', 'IN_PROCESS'],
  ] as const)('derives %s requests as %s', (requestStatus, expectedStatus) => {
    const input = baseInput();
    input.requests = [{ status: requestStatus, requestedTotal: decimal(100) }];

    expect(evaluateBillability(input).status).toBe(expectedStatus);
  });

  it('returns PENDING_INFORMATION with stable codes for an incomplete fiscal profile', () => {
    const input = baseInput();
    if (!input.customer) throw new Error('base input requires a customer');
    input.customer.taxId = null;
    input.customer.fiscalPostalCode = '   ';

    const result = evaluateBillability(input);

    expect(result.status).toBe('PENDING_INFORMATION');
    expect(result.blockingCodes).toEqual(['MISSING_TAX_ID', 'MISSING_FISCAL_PROFILE']);
  });

  it('enforces document, delivery, and calendar deadline policy', () => {
    const input = baseInput();
    input.document.documentType = 'INTERNAL_RECEIPT';
    input.policy.billableDocumentTypes = ['SIMPLE_NOTE', 'LARGE_NOTE', 'INTERNAL_RECEIPT'];
    expect(evaluateBillability(input).status).toBe('NOT_BILLABLE');

    input.policy.allowInternalReceipt = true;
    input.policy.requireConfirmedDelivery = true;
    input.delivery = { status: 'PENDING', deliveredAt: null };
    expect(evaluateBillability(input)).toMatchObject({
      status: 'PENDING_INFORMATION',
      blockingCodes: ['DELIVERY_PENDING'],
    });

    input.delivery = { status: 'DELIVERED', deliveredAt: new Date('2026-07-02T12:00:00.000Z') };
    input.policy.deadlineDays = 5;
    input.policy.deadlineBasis = 'DELIVERED_AT';
    input.evaluatedAt = new Date('2026-07-08T06:01:00.000Z');
    expect(evaluateBillability(input)).toMatchObject({
      status: 'BLOCKED',
      blockingCodes: ['BILLING_DEADLINE_EXPIRED'],
    });
  });

  it('prioritizes cancellation, full invoicing, and monetary inconsistencies', () => {
    const cancelled = baseInput();
    cancelled.document.status = 'CANCELLED';
    expect(evaluateBillability(cancelled).status).toBe('CANCELLED');

    const fullyInvoiced = baseInput();
    fullyInvoiced.applications = [{ invoiceStatus: 'ACTIVE', totalApplied: decimal(1000) }];
    expect(evaluateBillability(fullyInvoiced).status).toBe('FULLY_INVOICED');

    const overInvoiced = baseInput();
    overInvoiced.applications = [{ invoiceStatus: 'ACTIVE', totalApplied: decimal(1000.01) }];
    expect(evaluateBillability(overInvoiced)).toMatchObject({
      status: 'BLOCKED',
      blockingCodes: ['OVER_INVOICED'],
    });

    const overRequested = baseInput();
    overRequested.requests = [{ status: 'REQUESTED', requestedTotal: decimal(1000.01) }];
    expect(evaluateBillability(overRequested)).toMatchObject({
      status: 'BLOCKED',
      blockingCodes: ['OVER_REQUESTED'],
    });
  });

  it('keeps exact decimal precision for fractional requests, invoices, and payments', () => {
    const input = baseInput();
    input.sale.total = decimal('0.30');
    input.requests = [{ status: 'REQUESTED', requestedTotal: decimal('0.10') }];
    input.applications = [{ invoiceStatus: 'ACTIVE', totalApplied: decimal('0.20') }];
    input.payments = [
      { status: 'APPLIED', amount: decimal('0.10') },
      { status: 'APPLIED', amount: decimal('0.20') },
    ];

    const result = evaluateBillability(input);

    expect(result.status).toBe('PARTIALLY_INVOICED');
    expect(result.amounts.pendingInvoice.toFixed(2)).toBe('0.10');
    expect(result.amounts.activePaid.toFixed(2)).toBe('0.30');
    expect(result.amounts.collectionBalance.toFixed(2)).toBe('0.00');
  });
});

describe('billing balance validation', () => {
  it('rejects non-positive and over-requested amounts with stable codes', () => {
    expect(() => validateRequestedAmount(decimal(0), decimal(100))).toThrow(
      expect.objectContaining<Partial<BillingBalanceError>>({ code: 'INVALID_REQUESTED_AMOUNT' }),
    );
    expect(() => validateRequestedAmount(decimal(100.01), decimal(100))).toThrow(
      expect.objectContaining<Partial<BillingBalanceError>>({ code: 'OVER_REQUESTED' }),
    );
  });

  it('rejects non-positive and over-applied amounts with stable codes', () => {
    expect(() => validateAppliedAmount(decimal(-1), decimal(100))).toThrow(
      expect.objectContaining<Partial<BillingBalanceError>>({ code: 'INVALID_APPLIED_AMOUNT' }),
    );
    expect(() => validateAppliedAmount(decimal(100.01), decimal(100))).toThrow(
      expect.objectContaining<Partial<BillingBalanceError>>({ code: 'OVER_INVOICED' }),
    );
  });
});
