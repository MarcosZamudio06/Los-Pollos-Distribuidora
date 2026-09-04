import { Prisma } from '@prisma/client';
import { buildRepDocument, type RepCandidate } from './rep-document-builder';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const issuer = {
  legalEntityId: 'legal-1',
  legalName: 'EMISOR',
  taxId: 'AAA010101AAA',
  fiscalPostalCode: '64000',
  fiscalRegime: '601',
  series: 'P',
  certificateSerialNumber: 'CERT-1',
  certificateFingerprint: 'f'.repeat(64),
} as const;
const receiver = {
  customerId: 'customer-1',
  fiscalName: 'CLIENTE',
  taxId: 'BBB010101BBB',
  fiscalPostalCode: '64000',
  fiscalRegime: '601',
  billingEmail: 'billing@example.test',
} as const;

function candidate(
  id: string,
  total: string,
  issuedAt: string,
  effective = '0',
  partiality = 0,
): RepCandidate {
  return {
    invoiceId: id,
    uuid: `00000000-0000-4000-8000-${id.padStart(12, '0')}`,
    issuedAt: new Date(issuedAt),
    series: 'A',
    folio: id,
    currencyCode: 'MXN',
    total: d(total),
    effectiveAppliedTotal: d(effective),
    effectiveAppliedForSale: d(effective),
    maxEffectivePartiality: partiality,
    taxObjectCode: '01',
    issuer,
    receiver,
    sourceDocuments: [
      {
        id: `isd-${id}`,
        saleDocumentId: `sd-${id}`,
        saleId: 'sale-1',
        totalApplied: d(total),
      },
    ],
  };
}

function input(amount: string, candidates: RepCandidate[]) {
  return {
    paymentId: 'payment-1',
    paymentReceiptId: 'receipt-1',
    issuedAt: new Date('2026-08-23T12:00:00.000Z'),
    paidAt: new Date('2026-08-23T10:00:00.000Z'),
    amount: d(amount),
    currencyCode: 'MXN',
    exchangeRateToMxn: d(1),
    paymentFormCode: '03',
    candidates,
  } as const;
}

describe('buildRepDocument', () => {
  it('calculates the first partial payment with Decimal and NumParcialidad 1', () => {
    const result = buildRepDocument(
      input('40.00', [candidate('1', '100.00', '2026-08-01T00:00:00Z')]),
    );
    expect(result.allocations[0]).toMatchObject({ partialityNumber: 1 });
    expect(result.allocations[0].previousBalanceAmount.toFixed(2)).toBe(
      '100.00',
    );
    expect(result.allocations[0].amountPaid.toFixed(2)).toBe('40.00');
    expect(result.allocations[0].remainingBalance.toFixed(2)).toBe('60.00');
    expect(result.snapshot.payment.relatedDocuments[0]).toMatchObject({
      previousBalanceAmount: '100.00',
      amountPaid: '40.00',
      remainingBalance: '60.00',
    });
    expect(result.snapshot.issuedAt).toBe('2026-08-23T12:00:00.000Z');
    expect(result.snapshot.payment.paidAt).toBe('2026-08-23T10:00:00.000Z');
  });

  it('calculates the second payment and liquidation from the prior effective balance', () => {
    const result = buildRepDocument(
      input('60.00', [
        candidate('1', '100.00', '2026-08-01T00:00:00Z', '40.00', 1),
      ]),
    );
    expect(result.allocations[0].partialityNumber).toBe(2);
    expect(result.allocations[0].previousBalanceAmount.toFixed(2)).toBe(
      '60.00',
    );
    expect(result.allocations[0].remainingBalance.toFixed(2)).toBe('0.00');
  });

  it('prorates immutable invoice taxes for a partial payment', () => {
    const result = buildRepDocument(
      input('50.00', [
        {
          ...candidate('taxed', '116.00', '2026-08-01T00:00:00Z'),
          taxObjectCode: '02',
          taxesSnapshot: [
            {
              taxCode: '002',
              factorType: 'Tasa',
              rateOrQuota: '0.160000',
              base: '100.00',
              amount: '16.00',
            },
          ],
        },
      ]),
    );
    expect(result.snapshot.payment.relatedDocuments[0].taxesSnapshot).toEqual([
      expect.objectContaining({ base: '43.10', amount: '6.90' }),
    ]);
    expect(result.snapshot.payment.taxes).toEqual([
      expect.objectContaining({ base: '43.10', amount: '6.90' }),
    ]);
  });

  it('blocks a tax-object invoice when its immutable tax snapshot is missing', () => {
    expect(() =>
      buildRepDocument(
        input('10.00', [
          {
            ...candidate('taxed-missing', '100.00', '2026-08-01T00:00:00Z'),
            taxObjectCode: '02',
          },
        ]),
      ),
    ).toThrow('REP_TAX_SNAPSHOT_MISSING');
  });

  it('splits one payment deterministically across two invoices ordered by issuedAt', () => {
    const result = buildRepDocument(
      input('100.00', [
        candidate('2', '40.00', '2026-08-02T00:00:00Z'),
        candidate('1', '60.00', '2026-08-01T00:00:00Z'),
      ]),
    );
    expect(result.allocations.map((item) => item.candidate.invoiceId)).toEqual([
      '1',
      '2',
    ]);
    expect(
      result.allocations.map((item) => item.amountPaid.toFixed(2)),
    ).toEqual(['60.00', '40.00']);
  });

  it('rejects an amount that cannot be allocated without over-invoicing', () => {
    expect(() =>
      buildRepDocument(
        input('101.00', [candidate('1', '100.00', '2026-08-01T00:00:00Z')]),
      ),
    ).toThrow('REP_UNALLOCATED_PAYMENT_AMOUNT');
  });

  it('rejects mixed currencies before creating any fiscal snapshot', () => {
    expect(() =>
      buildRepDocument(
        input('10.00', [
          candidate('1', '10.00', '2026-08-01T00:00:00Z'),
          {
            ...candidate('2', '10.00', '2026-08-02T00:00:00Z'),
            currencyCode: 'USD',
          },
        ]),
      ),
    ).toThrow('REP_CURRENCY_MISMATCH');
  });

  it('rejects an MXN payment with a non-unit exchange rate', () => {
    expect(() =>
      buildRepDocument({
        ...input('10.00', [candidate('1', '10.00', '2026-08-01T00:00:00Z')]),
        exchangeRateToMxn: d('17.5'),
      }),
    ).toThrow('INVALID_PAYMENT_CONFIGURATION');
  });

  it('rejects a payment economically later than the REP issue instant', () => {
    expect(() =>
      buildRepDocument({
        ...input('10.00', [candidate('1', '10.00', '2026-08-01T00:00:00Z')]),
        issuedAt: new Date('2026-08-23T10:00:00.000Z'),
        paidAt: new Date('2026-08-23T10:00:00.001Z'),
      }),
    ).toThrow('REP_PAYMENT_DATE_AFTER_ISSUANCE');
  });
});
