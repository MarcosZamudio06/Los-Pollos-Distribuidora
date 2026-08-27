import { Prisma } from '@prisma/client';
import { CfdiDomainError } from './cfdi-domain.error';
import { buildCreditNoteDocument } from './credit-note-document-builder';

const decimal = (value: string) => new Prisma.Decimal(value);

function input(creditTotal = '116.00', availableTotal = '116.00') {
  return {
    creditAdjustmentId: 'adjustment-1',
    creditAdjustmentVersion: 2,
    issuedAt: new Date('2026-08-24T12:00:00.000Z'),
    sourceType: 'BONUS' as const,
    currencyCode: 'MXN',
    exchangeRate: decimal('1'),
    paymentFormCode: '03',
    issuer: {
      legalEntityId: 'legal-entity-1',
      legalName: 'EMISOR DE PRUEBA',
      taxId: 'EKU9003173C9',
      fiscalPostalCode: '78240',
      fiscalRegime: '601',
      series: 'E',
      certificateSerialNumber: '30001000000300023708',
      certificateFingerprint: 'fingerprint',
    },
    receiver: {
      customerId: 'customer-1',
      fiscalName: 'RECEPTOR DE PRUEBA',
      taxId: 'URE180429TM6',
      fiscalPostalCode: '65000',
      fiscalRegime: '601',
      billingEmail: 'billing@example.test',
    },
    applications: [
      {
        originalInvoiceId: 'invoice-1',
        originalUuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
        relationshipTypeCode: '01' as const,
        concepts: [
          {
            creditAdjustmentLineId: 'line-1',
            originalInvoiceConceptId: 'concept-1',
            creditTotal: decimal(creditTotal),
            availableTotal: decimal(availableTotal),
            original: {
              sourceSaleItemId: 'sale-item-1',
              productServiceCode: '10101504',
              identificationNumber: 'SKU-1',
              description: 'PRODUCTO DE PRUEBA',
              quantity: decimal('2'),
              unitCode: 'H87',
              unitValue: decimal('50'),
              amount: decimal('100'),
              discount: decimal('0'),
              taxableBase: decimal('100'),
              taxObjectCode: '02',
              taxCode: '002',
              factorType: 'Tasa',
              rateOrQuota: decimal('0.16'),
              taxAmount: decimal('16'),
              total: decimal('116'),
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
          },
        ],
      },
    ],
  };
}

describe('buildCreditNoteDocument', () => {
  it('builds a full CFDI E snapshot from the immutable original concept', () => {
    const result = buildCreditNoteDocument(input());

    expect(result.snapshot).toMatchObject({
      cfdiType: 'CREDIT_NOTE',
      fiscalUseCode: 'G02',
      paymentMethodCode: 'PUE',
      relationships: [
        {
          typeCode: '01',
          relatedInvoiceId: 'invoice-1',
          relatedUuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
        },
      ],
      totals: {
        subtotal: '100.00',
        discount: '0.00',
        taxableBase: '100.00',
        tax: '16.00',
        total: '116.00',
      },
    });
    expect(result.snapshot.concepts[0]).toMatchObject({
      amount: '100.00',
      taxAmount: '16.00',
      total: '116.00',
    });
  });

  it('prorates a partial credit with Prisma.Decimal', () => {
    const result = buildCreditNoteDocument(input('58.00'));

    expect(result.snapshot.concepts[0]).toMatchObject({
      amount: '50.00',
      taxableBase: '50.00',
      taxAmount: '8.00',
      total: '58.00',
    });
    expect(result.snapshot.totals.total).toBe('58.00');
  });

  it('rejects credit above the currently accreditable concept balance', () => {
    expect(() => buildCreditNoteDocument(input('58.00', '57.99'))).toThrow(
      expect.objectContaining<CfdiDomainError>({
        code: 'CREDIT_NOTE_OVER_CREDITED',
      }),
    );
  });

  it('uses a credit-note-specific error when the original tax snapshot is missing', () => {
    const missingTaxSnapshot = input();
    missingTaxSnapshot.applications[0].concepts[0].original.taxesSnapshot = [];

    expect(() => buildCreditNoteDocument(missingTaxSnapshot)).toThrow(
      expect.objectContaining<CfdiDomainError>({
        code: 'CREDIT_NOTE_TAX_SNAPSHOT_MISSING',
      }),
    );
  });
});
