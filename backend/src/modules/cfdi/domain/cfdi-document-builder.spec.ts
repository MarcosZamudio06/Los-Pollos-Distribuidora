import { Prisma } from '@prisma/client';
import { CfdiDocumentBuilder } from './cfdi-document-builder';
import { CfdiDomainError } from './cfdi-domain.error';
import type { CfdiDocumentBuildInput } from './cfdi-document.types';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

function buildInput(): CfdiDocumentBuildInput {
  return {
    request: {
      id: 'request-1',
      status: 'APPROVED',
      version: 3,
      customerId: 'customer-1',
    },
    issuedAt: new Date('2026-08-22T18:00:00.000Z'),
    customer: {
      id: 'customer-1',
      fiscalName: '  COMERCIALIZADORA DEL NORTE SA DE CV ',
      taxId: 'cdn010101ab1',
      fiscalPostalCode: '64000',
      fiscalRegime: '601',
      fiscalUseCode: 'G03',
      billingEmail: 'billing@example.test',
    },
    issuer: {
      id: 'issuer-1',
      isActive: true,
      cfdiEnabled: true,
      legalName: '  LOS POLLOS DISTRIBUIDORA SA DE CV ',
      taxId: 'lpd010101ab1',
      fiscalPostalCode: '64000',
      fiscalRegime: '601',
      defaultSeries: 'A',
      certificateSerialNumber: '30001000000500003416',
      certificateFingerprint: 'a'.repeat(64),
      certificateValidFrom: new Date('2026-01-01T00:00:00.000Z'),
      certificateValidTo: new Date('2027-01-01T00:00:00.000Z'),
    },
    payment: {
      exportCode: '01',
      paymentFormCode: '01',
      paymentMethodCode: 'PUE',
      exchangeRate: d(1),
    },
    documents: [
      {
        id: 'request-document-1',
        saleDocumentId: 'sale-document-1',
        requestedSubtotal: d('100.00'),
        requestedTax: d('16.00'),
        requestedTotal: d('116.00'),
        activeInvoicedSubtotal: d(0),
        activeInvoicedTax: d(0),
        activeInvoicedTotal: d(0),
        sale: {
          id: 'sale-1',
          customerId: 'customer-1',
          currencyCode: 'MXN',
          legalEntityId: 'issuer-1',
          subtotal: d('110.00'),
          discount: d('10.00'),
          tax: d('16.00'),
          total: d('116.00'),
        },
        items: [
          {
            id: 'request-item-1',
            saleItemId: 'sale-item-1',
            requestedSubtotal: d('100.00'),
            requestedTax: d('16.00'),
            requestedTotal: d('116.00'),
            activeAppliedSubtotal: d(0),
            activeAppliedTax: d(0),
            activeAppliedTotal: d(0),
            source: {
              saleId: 'sale-1',
              productId: 'product-1',
              productNameSnapshot: 'Pollo entero',
              productSkuSnapshot: 'POLLO-1',
              quantitySnapshot: d('10.000'),
              unitPriceSnapshot: d('11.00'),
              subtotal: d('110.00'),
              discount: d('10.00'),
              taxableBase: d('100.00'),
              tax: d('16.00'),
              total: d('116.00'),
              productFiscalProfile: {
                satProductServiceCode: '50111500',
                satUnitCode: 'KGM',
                taxObjectCode: '02',
                defaultTaxCode: '002',
                defaultFactorType: 'Tasa',
                defaultRateOrQuota: d('0.160000'),
              },
            },
          },
        ],
      },
    ],
  };
}

describe('CfdiDocumentBuilder', () => {
  const builder = new CfdiDocumentBuilder();

  it('builds a deeply immutable, normalized snapshot using Prisma.Decimal', () => {
    const snapshot = builder.build(buildInput());

    expect(snapshot).toMatchObject({
      cfdiVersion: '4.0',
      cfdiType: 'INCOME',
      billingRequestId: 'request-1',
      currencyCode: 'MXN',
      issuer: {
        legalEntityId: 'issuer-1',
        legalName: 'LOS POLLOS DISTRIBUIDORA SA DE CV',
        taxId: 'LPD010101AB1',
      },
      receiver: {
        customerId: 'customer-1',
        fiscalName: 'COMERCIALIZADORA DEL NORTE SA DE CV',
        taxId: 'CDN010101AB1',
        fiscalUseCode: 'G03',
      },
      totals: {
        subtotal: '110.00',
        discount: '10.00',
        taxableBase: '100.00',
        tax: '16.00',
        total: '116.00',
      },
    });
    expect(snapshot.concepts[0]).toMatchObject({
      sourceSaleItemId: 'sale-item-1',
      quantity: '10.000000',
      unitValue: '11.000000',
      amount: '110.00',
      discount: '10.00',
      taxableBase: '100.00',
      taxAmount: '16.00',
      total: '116.00',
    });
    expect(snapshot.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.concepts[0].snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.issuer)).toBe(true);
    expect(Object.isFrozen(snapshot.concepts)).toBe(true);
    expect(Object.isFrozen(snapshot.concepts[0])).toBe(true);
    expect('uuid' in snapshot).toBe(false);
    expect('cfdiSeal' in snapshot).toBe(false);
    expect('satSeal' in snapshot).toBe(false);
  });

  it('keeps issuedAt as an unambiguous instant in the internal snapshot', () => {
    expect(builder.build(buildInput()).issuedAt).toBe(
      '2026-08-22T18:00:00.000Z',
    );
  });

  it('includes one server-resolved type 04 relationship for an income substitution', () => {
    const input = buildInput();
    input.substitution = {
      originalInvoiceId: 'invoice-original-1',
      originalUuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
    };

    const snapshot = builder.build(input);

    expect(snapshot.relationships).toEqual([
      {
        typeCode: '04',
        relatedInvoiceId: 'invoice-original-1',
        relatedUuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
      },
    ]);
    expect(Object.isFrozen(snapshot.relationships)).toBe(true);
  });

  it('builds an explicit valid global invoice with canonical receiver and period data', () => {
    const input = buildInput();
    input.customer.fiscalName = 'PUBLICO EN GENERAL';
    input.customer.taxId = 'XAXX010101000';
    input.customer.fiscalPostalCode = input.issuer.fiscalPostalCode;
    input.customer.fiscalRegime = '616';
    input.customer.fiscalUseCode = 'S01';
    input.globalInformation = {
      periodicity: '04',
      months: '08',
      year: 2026,
    };
    input.documents[0].operationDate = '2026-08-15';

    const snapshot = builder.build(input);

    expect(snapshot.globalInformation).toEqual({
      periodicity: '04',
      months: '08',
      year: 2026,
    });
    expect(snapshot.receiver).toMatchObject({
      taxId: 'XAXX010101000',
      fiscalName: 'PUBLICO EN GENERAL',
      fiscalRegime: '616',
      fiscalUseCode: 'S01',
      fiscalPostalCode: '64000',
    });
    expect(snapshot.paymentMethodCode).toBe('PUE');
    expect(snapshot.exportCode).toBe('01');
    expect(Object.isFrozen(snapshot.globalInformation)).toBe(true);
  });

  it.each([
    [
      'ordinary use',
      (input: CfdiDocumentBuildInput) => (input.customer.fiscalUseCode = 'G03'),
      'GLOBAL_INVOICE_RECEIVER_INVALID',
    ],
    [
      'wrong regime',
      (input: CfdiDocumentBuildInput) => (input.customer.fiscalRegime = '601'),
      'GLOBAL_INVOICE_RECEIVER_INVALID',
    ],
    [
      'wrong name',
      (input: CfdiDocumentBuildInput) =>
        (input.customer.fiscalName = 'PUBLICO GENERAL'),
      'GLOBAL_INVOICE_RECEIVER_INVALID',
    ],
    [
      'wrong postal code',
      (input: CfdiDocumentBuildInput) =>
        (input.customer.fiscalPostalCode = '64100'),
      'GLOBAL_INVOICE_RECEIVER_INVALID',
    ],
    [
      'PPD',
      (input: CfdiDocumentBuildInput) => {
        input.payment.paymentMethodCode = 'PPD';
        input.payment.paymentFormCode = '99';
      },
      'GLOBAL_INVOICE_PAYMENT_INVALID',
    ],
    [
      'exportation',
      (input: CfdiDocumentBuildInput) => (input.payment.exportCode = '02'),
      'GLOBAL_INVOICE_EXPORTATION_INVALID',
    ],
    [
      'invalid periodicity',
      (input: CfdiDocumentBuildInput) =>
        (input.globalInformation!.periodicity = '06' as never),
      'GLOBAL_INVOICE_PERIOD_INVALID',
    ],
    [
      'invalid months',
      (input: CfdiDocumentBuildInput) =>
        (input.globalInformation!.months = '13'),
      'GLOBAL_INVOICE_PERIOD_INVALID',
    ],
    [
      'invalid year',
      (input: CfdiDocumentBuildInput) => (input.globalInformation!.year = 2020),
      'GLOBAL_INVOICE_PERIOD_INVALID',
    ],
  ])('rejects a global invoice with %s', (_case, mutate, code) => {
    const input = buildInput();
    input.customer = {
      ...input.customer,
      fiscalName: 'PUBLICO EN GENERAL',
      taxId: 'XAXX010101000',
      fiscalPostalCode: '64000',
      fiscalRegime: '616',
      fiscalUseCode: 'S01',
    };
    input.globalInformation = {
      periodicity: '04',
      months: '08',
      year: 2026,
    };
    input.documents[0].operationDate = '2026-08-15';
    mutate(input);

    expectDomainError(() => builder.build(input), code);
  });

  it('rejects the generic domestic RFC when global information is absent', () => {
    const input = buildInput();
    input.customer.taxId = 'XAXX010101000';
    input.customer.fiscalName = 'PUBLICO EN GENERAL';
    input.customer.fiscalRegime = '616';
    input.customer.fiscalUseCode = 'G03';

    expectDomainError(
      () => builder.build(input),
      'GLOBAL_INVOICE_INFORMATION_REQUIRED',
    );
  });

  it('rejects global information for a nominative receiver', () => {
    const input = buildInput();
    input.globalInformation = {
      periodicity: '04',
      months: '08',
      year: 2026,
    };
    input.documents[0].operationDate = '2026-08-15';

    expectDomainError(
      () => builder.build(input),
      'GLOBAL_INVOICE_RECEIVER_INVALID',
    );
  });

  it('rejects global period metadata that does not match the operation dates', () => {
    const input = buildInput();
    input.customer = {
      ...input.customer,
      fiscalName: 'PUBLICO EN GENERAL',
      taxId: 'XAXX010101000',
      fiscalPostalCode: '64000',
      fiscalRegime: '616',
      fiscalUseCode: 'S01',
    };
    input.globalInformation = {
      periodicity: '04',
      months: '07',
      year: 2026,
    };
    input.documents[0].operationDate = '2026-08-15';

    expectDomainError(
      () => builder.build(input),
      'GLOBAL_INVOICE_PERIOD_INVALID',
    );
  });

  it('allocates partial quantities and discount without floating-point drift', () => {
    const input = buildInput();
    const item = input.documents[0].items[0];
    item.requestedSubtotal = d('25.00');
    item.requestedTax = d('4.00');
    item.requestedTotal = d('29.00');
    input.documents[0].requestedSubtotal = d('25.00');
    input.documents[0].requestedTax = d('4.00');
    input.documents[0].requestedTotal = d('29.00');

    const snapshot = builder.build(input);

    expect(snapshot.concepts[0]).toMatchObject({
      quantity: '2.500000',
      amount: '27.50',
      discount: '2.50',
      taxableBase: '25.00',
      taxAmount: '4.00',
      total: '29.00',
    });
    expect(snapshot.totals.total).toBe('29.00');
  });

  it('produces the same canonical hashes for the same normalized snapshot', () => {
    const first = builder.build(buildInput());
    const second = builder.build(buildInput());

    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(second.concepts[0].snapshotHash).toBe(
      first.concepts[0].snapshotHash,
    );
  });

  it('calculates Cuota tax from allocated quantity using Decimal', () => {
    const input = buildInput();
    const profile = input.documents[0].items[0].source.productFiscalProfile;
    profile.defaultFactorType = 'Cuota';
    profile.defaultRateOrQuota = d('1.600000');

    expect(builder.build(input).totals.tax).toBe('16.00');
  });

  it('builds an Exento concept without tax', () => {
    const input = buildInput();
    const document = input.documents[0];
    const item = document.items[0];
    item.source.productFiscalProfile.defaultFactorType = 'Exento';
    item.source.productFiscalProfile.defaultRateOrQuota = d(0);
    item.source.tax = d(0);
    item.source.total = d(100);
    item.requestedTax = d(0);
    item.requestedTotal = d(100);
    document.sale.tax = d(0);
    document.sale.total = d(100);
    document.requestedTax = d(0);
    document.requestedTotal = d(100);

    expect(builder.build(input)).toMatchObject({
      totals: { tax: '0.00', total: '100.00' },
      concepts: [
        {
          factorType: 'Exento',
          rateOrQuota: '0.000000',
          taxAmount: '0.00',
        },
      ],
    });
  });

  it.each([
    ['customer', 'fiscalName'],
    ['customer', 'taxId'],
    ['customer', 'fiscalPostalCode'],
    ['customer', 'fiscalRegime'],
    ['customer', 'billingEmail'],
  ] as const)('rejects missing receiver fiscal field %s.%s', (scope, field) => {
    const input = buildInput();
    Object.assign(input[scope], { [field]: null });
    expectDomainError(() => builder.build(input), 'MISSING_FISCAL_PROFILE');
  });

  it('rejects an unknown UsoCFDI with a stable code', () => {
    const input = buildInput();
    input.customer.fiscalUseCode = 'ZZZ';
    expectDomainError(() => builder.build(input), 'INVALID_CFDI_USE');
  });

  it('rejects an unknown RégimenFiscalReceptor with a stable code', () => {
    const input = buildInput();
    input.customer.fiscalRegime = '999';
    expectDomainError(() => builder.build(input), 'MISSING_FISCAL_PROFILE');
  });

  it.each([
    [
      'a regime not allowed by the selected use',
      { fiscalRegime: '616', fiscalUseCode: 'G03' },
    ],
    [
      'a physical-person use for a moral-person receiver',
      { fiscalRegime: '605', fiscalUseCode: 'D01' },
    ],
    [
      'a payroll use for a moral-person receiver',
      { fiscalRegime: '601', fiscalUseCode: 'CN01' },
    ],
  ])(
    'rejects %s before building the fiscal snapshot',
    (_case, fiscalFields) => {
      const input = buildInput();
      Object.assign(input.customer, fiscalFields);

      expectDomainError(
        () => builder.build(input),
        'CFDI_USE_REGIME_INCOMPATIBLE',
      );
    },
  );

  it('accepts a physical-person regime and personal-use combination', () => {
    const input = buildInput();
    input.customer.taxId = 'ABCD010101AB1';
    input.customer.fiscalRegime = '605';
    input.customer.fiscalUseCode = 'D01';

    expect(builder.build(input).receiver).toMatchObject({
      taxId: 'ABCD010101AB1',
      fiscalRegime: '605',
      fiscalUseCode: 'D01',
    });
  });

  it('keeps XEXX restricted to regime 616 and S01', () => {
    const input = buildInput();
    input.customer.taxId = 'XEXX010101000';
    input.customer.fiscalRegime = '616';
    input.customer.fiscalUseCode = 'S01';
    expect(builder.build(input).receiver.taxId).toBe('XEXX010101000');

    const invalid = buildInput();
    invalid.customer.taxId = 'XEXX010101000';
    invalid.customer.fiscalRegime = '616';
    invalid.customer.fiscalUseCode = 'G03';
    expectDomainError(
      () => builder.build(invalid),
      'CFDI_USE_REGIME_INCOMPATIBLE',
    );
  });

  it('rejects issuer certificate fingerprints that cannot satisfy the persisted SHA-256 contract', () => {
    const input = buildInput();
    input.issuer.certificateFingerprint = 'sha256:not-a-hex-digest';
    expectDomainError(() => builder.build(input), 'MISSING_FISCAL_PROFILE');
  });

  it('rejects an incomplete or structurally invalid product fiscal profile', () => {
    const input = buildInput();
    input.documents[0].items[0].source.productFiscalProfile.satUnitCode = null;
    expectDomainError(
      () => builder.build(input),
      'MISSING_PRODUCT_FISCAL_PROFILE',
    );

    const invalid = buildInput();
    invalid.documents[0].items[0].source.productFiscalProfile.satProductServiceCode =
      'CHICKEN';
    expectDomainError(
      () => builder.build(invalid),
      'MISSING_PRODUCT_FISCAL_PROFILE',
    );
  });

  it.each([
    [
      'requested item equation',
      (input: CfdiDocumentBuildInput) => {
        input.documents[0].items[0].requestedTotal = d('115.99');
      },
    ],
    [
      'source item equation',
      (input: CfdiDocumentBuildInput) => {
        input.documents[0].items[0].source.total = d('115.99');
      },
    ],
    [
      'document/item sum',
      (input: CfdiDocumentBuildInput) => {
        input.documents[0].requestedTotal = d('115.99');
      },
    ],
    [
      'tax rate',
      (input: CfdiDocumentBuildInput) => {
        input.documents[0].items[0].requestedTax = d('15.99');
        input.documents[0].items[0].requestedTotal = d('115.99');
        input.documents[0].requestedTax = d('15.99');
        input.documents[0].requestedTotal = d('115.99');
      },
    ],
  ] as const)('rejects %s mismatches', (_name, mutate) => {
    const input = buildInput();
    mutate(input);
    expectDomainError(() => builder.build(input), 'TOTAL_MISMATCH');
  });

  it('rejects requested item and document amounts over available balances', () => {
    const itemInput = buildInput();
    itemInput.documents[0].items[0].activeAppliedTotal = d('1.00');
    expectDomainError(() => builder.build(itemInput), 'OVER_INVOICED');

    const documentInput = buildInput();
    documentInput.documents[0].activeInvoicedTotal = d('1.00');
    expectDomainError(() => builder.build(documentInput), 'OVER_INVOICED');
  });

  it.each([
    [
      'MIXED_CUSTOMERS',
      (input: CfdiDocumentBuildInput) => {
        input.documents[0].sale.customerId = 'customer-2';
      },
    ],
    [
      'MIXED_LEGAL_ENTITIES',
      (input: CfdiDocumentBuildInput) => {
        input.documents[0].sale.legalEntityId = 'issuer-2';
      },
    ],
  ] as const)('rejects %s', (code, mutate) => {
    const input = buildInput();
    mutate(input);
    expectDomainError(() => builder.build(input), code);
  });

  it('rejects currencies mixed across source sales', () => {
    const input = buildInput();
    const secondDocument = buildInput().documents[0];
    secondDocument.id = 'request-document-2';
    secondDocument.saleDocumentId = 'sale-document-2';
    secondDocument.sale.id = 'sale-2';
    secondDocument.sale.currencyCode = 'USD';
    secondDocument.items[0].id = 'request-item-2';
    secondDocument.items[0].saleItemId = 'sale-item-2';
    secondDocument.items[0].source.saleId = 'sale-2';
    input.documents.push(secondDocument);

    expectDomainError(() => builder.build(input), 'MIXED_CURRENCIES');
  });

  it.each([
    [
      'wrong payment method',
      (input: CfdiDocumentBuildInput) => {
        input.payment.paymentMethodCode = 'PPD';
      },
    ],
    [
      'invalid form code',
      (input: CfdiDocumentBuildInput) => {
        input.payment.paymentFormCode = 'CASH';
      },
    ],
    [
      'invalid export code',
      (input: CfdiDocumentBuildInput) => {
        input.payment.exportCode = '99';
      },
    ],
    [
      'invalid MXN exchange rate',
      (input: CfdiDocumentBuildInput) => {
        input.payment.exchangeRate = d('1.01');
      },
    ],
  ] as const)('rejects %s payment configuration', (_name, mutate) => {
    const input = buildInput();
    mutate(input);
    expectDomainError(
      () => builder.build(input),
      'INVALID_PAYMENT_CONFIGURATION',
    );
  });
});

function expectDomainError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CfdiDomainError);
    expect((error as CfdiDomainError).code).toBe(code);
  }
}
