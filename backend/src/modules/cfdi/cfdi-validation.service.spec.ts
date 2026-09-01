import { Prisma } from '@prisma/client';
import { CfdiDocumentBuilder } from './domain/cfdi-document-builder';
import { CfdiDomainError } from './domain/cfdi-domain.error';
import { CfdiValidationService } from './cfdi-validation.service';
import { SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA } from '../../../../shared/fiscal-catalog';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

function loadedRequest(status = 'APPROVED') {
  return {
    id: 'request-1',
    status,
    version: 2,
    customerId: 'customer-1',
    customer: {
      id: 'customer-1',
      fiscalName: 'Receiver SA de CV',
      taxId: 'REC010101AB1',
      fiscalPostalCode: '64000',
      fiscalRegime: '601',
      fiscalUseCode: 'G03',
      billingEmail: 'billing@example.test',
    },
    nativeInvoice: null,
    documents: [
      {
        id: 'request-document-1',
        saleDocumentId: 'sale-document-1',
        requestedSubtotal: d(100),
        requestedTax: d(16),
        requestedTotal: d(116),
        saleDocument: {
          invoiceDocuments: [],
          sale: {
            id: 'sale-1',
            customerId: 'customer-1',
            currencyCode: 'MXN',
            legalEntityId: 'issuer-1',
            subtotal: d(110),
            discount: d(10),
            tax: d(16),
            total: d(116),
            businessDate: new Date('2026-08-15T00:00:00.000Z'),
            registeredAt: new Date('2026-08-15T17:30:00.000Z'),
            createdAt: new Date('2026-08-15T17:29:00.000Z'),
            legalEntity: {
              id: 'issuer-1',
              isActive: true,
              cfdiEnabled: true,
              legalName: 'Issuer SA de CV',
              taxId: 'ISS010101AB1',
              fiscalPostalCode: '64000',
              fiscalRegime: '601',
              defaultSeries: 'A',
              certificateSerialNumber: '30001000000500003416',
              certificateFingerprint: 'a'.repeat(64),
              certificateValidFrom: new Date('2026-01-01T00:00:00.000Z'),
              certificateValidTo: new Date('2027-01-01T00:00:00.000Z'),
            },
          },
        },
        requestedItems: [
          {
            id: 'request-item-1',
            saleItemId: 'sale-item-1',
            requestedSubtotal: d(100),
            requestedTax: d(16),
            requestedTotal: d(116),
            saleItem: {
              saleId: 'sale-1',
              productId: 'product-1',
              productNameSnapshot: 'Pollo entero',
              productSkuSnapshot: 'POLLO-1',
              quantitySnapshot: d(10),
              unitPriceSnapshot: d(11),
              subtotal: d(110),
              discount: d(10),
              taxableBase: d(100),
              tax: d(16),
              total: d(116),
              product: {
                satProductServiceCode: '50111500',
                satUnitCode: 'KGM',
                taxObjectCode: '02',
                defaultTaxCode: '002',
                defaultFactorType: 'Tasa',
                defaultRateOrQuota: d('0.16'),
              },
              invoiceApplications: [],
            },
          },
        ],
      },
    ],
  };
}

describe('CfdiValidationService', () => {
  const payment = {
    exportCode: '01' as const,
    paymentFormCode: '01',
    paymentMethodCode: 'PUE' as const,
    exchangeRate: d(1),
  };

  it('loads an approved request and builds a provider-neutral snapshot', async () => {
    const prisma = {
      billingRequest: {
        findUnique: jest.fn().mockResolvedValue(loadedRequest()),
      },
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
    );

    const result = await service.buildApprovedRequest('request-1', {
      issuedAt: new Date('2026-08-22T18:00:00.000Z'),
      payment,
    });

    expect(result.billingRequestId).toBe('request-1');
    expect(result.totals.total).toBe('116.00');
    expect(prisma.billingRequest.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'request-1' } }),
    );
    expect(Object.keys(prisma)).toEqual(['billingRequest']);
  });

  it('derives global period consistency from the server-owned sale business date', async () => {
    const request = loadedRequest();
    request.customer = {
      ...request.customer,
      fiscalName: 'PUBLICO EN GENERAL',
      taxId: 'XAXX010101000',
      fiscalPostalCode: '64000',
      fiscalRegime: '616',
      fiscalUseCode: 'S01',
    };
    const prisma = {
      billingRequest: { findUnique: jest.fn().mockResolvedValue(request) },
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
    );

    const result = await service.buildApprovedRequest('request-1', {
      issuedAt: new Date('2026-08-22T18:00:00.000Z'),
      payment,
      globalInformation: {
        periodicity: '04',
        months: '08',
        year: 2026,
      },
    });

    expect(result.globalInformation).toEqual({
      periodicity: '04',
      months: '08',
      year: 2026,
    });
  });

  it('returns stable errors for missing, unapproved or already-rooted requests', async () => {
    const prisma = {
      billingRequest: { findUnique: jest.fn() },
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
    );

    prisma.billingRequest.findUnique.mockResolvedValueOnce(null);
    await expectDomainError(
      service.buildApprovedRequest('missing', {
        issuedAt: new Date(),
        payment,
      }),
      'BILLING_REQUEST_NOT_FOUND',
    );

    prisma.billingRequest.findUnique.mockResolvedValueOnce(
      loadedRequest('IN_REVIEW'),
    );
    await expectDomainError(
      service.buildApprovedRequest('request-1', {
        issuedAt: new Date(),
        payment,
      }),
      'BILLING_REQUEST_NOT_APPROVED',
    );

    const existing = loadedRequest() as ReturnType<typeof loadedRequest> & {
      nativeInvoice: { id: string } | null;
    };
    existing.nativeInvoice = { id: 'invoice-1' };
    prisma.billingRequest.findUnique.mockResolvedValueOnce(existing);
    await expectDomainError(
      service.buildApprovedRequest('request-1', {
        issuedAt: new Date(),
        payment,
      }),
      'CFDI_ALREADY_EXISTS',
    );

    const empty = loadedRequest();
    empty.documents = [] as never;
    prisma.billingRequest.findUnique.mockResolvedValueOnce(empty);
    await expectDomainError(
      service.buildApprovedRequest('request-1', {
        issuedAt: new Date(),
        payment,
      }),
      'EMPTY_BILLING_REQUEST',
    );
  });

  it('subtracts only active, non-reversed invoice applications from available balance', async () => {
    const source = loadedRequest();
    source.documents[0].saleDocument.invoiceDocuments.push({
      reversedAt: null,
      subtotalApplied: d(10),
      taxApplied: d('1.60'),
      totalApplied: d('11.60'),
      invoice: { status: 'CANCELLED' },
    } as never);
    source.documents[0].requestedItems[0].saleItem.invoiceApplications.push({
      reversedAt: null,
      subtotalApplied: d(10),
      taxApplied: d('1.60'),
      totalApplied: d('11.60'),
      invoiceSaleDocument: {
        reversedAt: null,
        invoice: { status: 'CANCELLED' },
      },
    } as never);
    const prisma = {
      billingRequest: {
        findUnique: jest.fn().mockResolvedValue(source),
      },
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
    );

    await expect(
      service.buildApprovedRequest('request-1', {
        issuedAt: new Date('2026-08-22T18:00:00.000Z'),
        payment,
      }),
    ).resolves.toMatchObject({ totals: { total: '116.00' } });
  });

  it('rejects an approved request whose amount is already consumed by an active invoice', async () => {
    const source = loadedRequest();
    source.documents[0].saleDocument.invoiceDocuments.push({
      reversedAt: null,
      subtotalApplied: d(1),
      taxApplied: d(0),
      totalApplied: d(1),
      invoice: { status: 'ACTIVE' },
    } as never);
    source.documents[0].requestedItems[0].saleItem.invoiceApplications.push({
      reversedAt: null,
      subtotalApplied: d(1),
      taxApplied: d(0),
      totalApplied: d(1),
      invoiceSaleDocument: {
        reversedAt: null,
        invoice: { status: 'ACTIVE' },
      },
    } as never);
    const prisma = {
      billingRequest: {
        findUnique: jest.fn().mockResolvedValue(source),
      },
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
    );

    await expectDomainError(
      service.buildApprovedRequest('request-1', {
        issuedAt: new Date('2026-08-22T18:00:00.000Z'),
        payment,
      }),
      'OVER_INVOICED',
    );
  });

  it('blocks fiscal construction when the active SAT catalog has not been imported', async () => {
    const prisma = {
      billingRequest: {
        findUnique: jest.fn().mockResolvedValue(loadedRequest()),
      },
    };
    const catalogs = {
      get: jest.fn().mockResolvedValue({ configured: false, entries: [] }),
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
      catalogs as never,
    );

    await expectDomainError(
      service.buildApprovedRequest('request-1', {
        issuedAt: new Date('2026-08-22T18:00:00.000Z'),
        payment,
      }),
      'SAT_CATALOG_NOT_CONFIGURED',
    );
  });

  it('rejects a code absent from an active catalog before provider issuance', async () => {
    const prisma = {
      billingRequest: {
        findUnique: jest.fn().mockResolvedValue(loadedRequest()),
      },
    };
    const catalogs = {
      get: jest.fn().mockResolvedValue({ configured: true, entries: [] }),
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
      catalogs as never,
    );

    await expectDomainError(
      service.buildApprovedRequest('request-1', {
        issuedAt: new Date('2026-08-22T18:00:00.000Z'),
        payment,
      }),
      'SAT_CATALOG_CODE_NOT_FOUND',
    );
  });

  it('uses active versioned compatibility metadata instead of the static fallback', async () => {
    const prisma = {
      billingRequest: {
        findUnique: jest.fn().mockResolvedValue(loadedRequest()),
      },
    };
    const issuedAt = new Date('2026-08-22T18:00:00.000Z');
    const catalogs = {
      get: jest.fn((key: string, query: { code: string; asOf: Date }) =>
        Promise.resolve({
          key,
          configured: true,
          entries: [
            {
              code: query.code,
              validFrom: null,
              validTo: null,
              metadata:
                key === 'c_UsoCFDI'
                  ? {
                      schema: SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA,
                      appliesTo: { physical: true, moral: true },
                      fiscalRegimes: ['603'],
                    }
                  : {
                      schema: SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA,
                      appliesTo: { physical: false, moral: true },
                    },
            },
          ],
        }),
      ),
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
      catalogs as never,
    );

    await expectDomainError(
      service.buildApprovedRequest('request-1', {
        issuedAt,
        payment,
      }),
      'CFDI_USE_REGIME_INCOMPATIBLE',
    );
    expect(catalogs.get).toHaveBeenNthCalledWith(1, 'c_UsoCFDI', {
      code: 'G03',
      asOf: issuedAt,
    });
  });

  it('fails closed when the active compatibility metadata is malformed', async () => {
    const prisma = {
      billingRequest: {
        findUnique: jest.fn().mockResolvedValue(loadedRequest()),
      },
    };
    const catalogs = {
      get: jest.fn((_key: string, query: { code: string }) =>
        Promise.resolve({
          configured: true,
          entries: [
            {
              code: query.code,
              validFrom: null,
              validTo: null,
              metadata: null,
            },
          ],
        }),
      ),
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
      catalogs as never,
    );

    await expectDomainError(
      service.buildApprovedRequest('request-1', {
        issuedAt: new Date('2026-08-22T18:00:00.000Z'),
        payment,
      }),
      'SAT_CATALOG_COMPATIBILITY_METADATA_INVALID',
    );
  });

  it('validates global periodicity and months against active SAT catalogs', async () => {
    const request = loadedRequest();
    request.customer = {
      ...request.customer,
      fiscalName: 'PUBLICO EN GENERAL',
      taxId: 'XAXX010101000',
      fiscalPostalCode: '64000',
      fiscalRegime: '616',
      fiscalUseCode: 'S01',
    };
    const prisma = {
      billingRequest: { findUnique: jest.fn().mockResolvedValue(request) },
    };
    const catalogs = {
      get: jest.fn((key: string, query: { code: string }) =>
        Promise.resolve({
          key,
          configured: true,
          entries: [
            {
              code: query.code,
              validFrom: null,
              validTo: null,
              metadata:
                key === 'c_UsoCFDI'
                  ? {
                      schema: SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA,
                      appliesTo: { physical: true, moral: true },
                      fiscalRegimes: query.code === 'S01' ? ['616'] : ['601'],
                    }
                  : key === 'c_RegimenFiscal'
                    ? {
                        schema: SAT_FISCAL_COMPATIBILITY_METADATA_SCHEMA,
                        appliesTo:
                          query.code === '616'
                            ? { physical: true, moral: false }
                            : { physical: false, moral: true },
                      }
                    : null,
            },
          ],
        }),
      ),
    };
    const service = new CfdiValidationService(
      prisma as never,
      new CfdiDocumentBuilder(),
      catalogs as never,
    );

    await service.buildApprovedRequest('request-1', {
      issuedAt: new Date('2026-08-22T18:00:00.000Z'),
      payment,
      globalInformation: {
        periodicity: '04',
        months: '08',
        year: 2026,
      },
    });

    expect(catalogs.get).toHaveBeenCalledWith('c_Periodicidad', { code: '04' });
    expect(catalogs.get).toHaveBeenCalledWith('c_Meses', { code: '08' });
  });
});

async function expectDomainError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CfdiDomainError);
    expect((error as CfdiDomainError).code).toBe(code);
  }
}
