import { ConfigService } from '@nestjs/config';
import { FiscalProviderError } from '../../domain/fiscal-provider.port';
import type {
  CfdiCreditNoteSnapshot,
  CfdiDocumentSnapshot,
  CfdiPaymentReceiptSnapshot,
} from '../../domain/cfdi-document.types';
import type { FiscalCredentialResolver } from '../fiscal-credential.resolver';
import {
  fiscalProviderContract,
  type FiscalProviderContractScenario,
} from '../../testing/fiscal-provider.contract';
import { FacturamaAdapter } from './facturama.adapter';

function snapshot(): CfdiDocumentSnapshot {
  return {
    cfdiVersion: '4.0',
    cfdiType: 'INCOME',
    billingRequestId: 'billing-request-1',
    billingRequestVersion: 1,
    issuedAt: '2026-08-22T10:00:00.000Z',
    currencyCode: 'MXN',
    exchangeRate: '1.000000',
    exportCode: '01',
    paymentFormCode: '03',
    paymentMethodCode: 'PUE',
    sourceDocumentIds: ['sale-document-1'],
    issuer: {
      legalEntityId: 'legal-entity-1',
      legalName: 'EMISOR DE PRUEBA',
      taxId: 'EKU9003173C9',
      fiscalPostalCode: '78240',
      fiscalRegime: '601',
      series: 'A',
      certificateSerialNumber: '30001000000300023708',
      certificateFingerprint: 'fingerprint',
    },
    receiver: {
      customerId: 'customer-1',
      fiscalName: 'RECEPTOR DE PRUEBA',
      taxId: 'URE180429TM6',
      fiscalPostalCode: '86991',
      fiscalRegime: '601',
      fiscalUseCode: 'G03',
      billingEmail: 'billing@example.test',
    },
    concepts: [
      {
        lineNumber: 1,
        sourceBillingRequestItemId: 'billing-item-1',
        sourceSaleItemId: 'sale-item-1',
        sourceProductId: 'product-1',
        productServiceCode: '10101504',
        identificationNumber: 'SKU-1',
        description: 'PRODUCTO DE PRUEBA',
        quantity: '2.000000',
        unitCode: 'H87',
        unitValue: '50.00',
        amount: '100.00',
        discount: '0.00',
        taxableBase: '100.00',
        taxObjectCode: '02',
        taxCode: '002',
        factorType: 'Tasa',
        rateOrQuota: '0.160000',
        taxAmount: '16.00',
        total: '116.00',
        snapshotHash: 'hash',
      },
    ],
    totals: {
      subtotal: '100.00',
      discount: '0.00',
      taxableBase: '100.00',
      tax: '16.00',
      total: '116.00',
    },
    snapshotHash: 'snapshot-hash',
  };
}

function creditNoteSnapshot(
  relationshipType: '01' | '03' = '01',
): CfdiCreditNoteSnapshot {
  const income = snapshot();
  return {
    cfdiVersion: '4.0',
    cfdiType: 'CREDIT_NOTE',
    creditAdjustmentId: 'credit-adjustment-1',
    creditAdjustmentVersion: 2,
    issuedAt: '2026-08-24T10:00:00.000Z',
    currencyCode: income.currencyCode,
    exchangeRate: income.exchangeRate,
    exportCode: '01',
    fiscalUseCode: 'G02',
    paymentFormCode: '03',
    paymentMethodCode: 'PUE',
    sourceDocumentIds: ['invoice-1'],
    issuer: { ...income.issuer, series: 'E' },
    receiver: { ...income.receiver, fiscalUseCode: 'G02' },
    relationships: [
      {
        typeCode: relationshipType,
        relatedInvoiceId: 'invoice-1',
        relatedUuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
      },
    ],
    concepts: income.concepts,
    totals: income.totals,
    snapshotHash: 'credit-snapshot-hash',
  };
}

function substitutionSnapshot(): CfdiDocumentSnapshot {
  return {
    ...snapshot(),
    relationships: [
      {
        typeCode: '04',
        relatedInvoiceId: 'invoice-original-1',
        relatedUuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
      },
    ],
  };
}

function globalSnapshot(): CfdiDocumentSnapshot {
  return {
    ...snapshot(),
    paymentMethodCode: 'PUE',
    exportCode: '01',
    receiver: {
      ...snapshot().receiver,
      fiscalName: 'PUBLICO EN GENERAL',
      taxId: 'XAXX010101000',
      fiscalPostalCode: '78240',
      fiscalRegime: '616',
      fiscalUseCode: 'S01',
    },
    globalInformation: {
      periodicity: '04',
      months: '08',
      year: 2026,
    },
  };
}

function paymentReceiptSnapshot(): CfdiPaymentReceiptSnapshot {
  return {
    cfdiVersion: '4.0',
    cfdiType: 'PAYMENT_RECEIPT',
    paymentId: 'payment-1',
    paymentReceiptId: 'receipt-1',
    issuedAt: '2026-08-23T10:00:00.000Z',
    currencyCode: 'XXX',
    exchangeRate: '1.000000',
    exportCode: '01',
    paymentFormCode: null,
    paymentMethodCode: null,
    sourceDocumentIds: ['sale-document-1'],
    issuer: {
      legalEntityId: 'legal-entity-1',
      legalName: 'EMISOR DE PRUEBA',
      taxId: 'EKU9003173C9',
      fiscalPostalCode: '78240',
      fiscalRegime: '601',
      series: 'P',
      certificateSerialNumber: '30001000000300023708',
      certificateFingerprint: 'fingerprint',
    },
    receiver: {
      customerId: 'customer-1',
      fiscalName: 'RECEPTOR DE PRUEBA',
      taxId: 'URE180429TM6',
      fiscalPostalCode: '86991',
      fiscalRegime: '601',
      fiscalUseCode: 'CP01',
      billingEmail: 'billing@example.test',
    },
    payment: {
      paidAt: '2026-08-23T09:00:00.000Z',
      paymentFormCode: '03',
      currencyCode: 'MXN',
      exchangeRateToMxn: '1.000000',
      amount: '1500.00',
      relatedDocuments: [
        {
          relatedInvoiceId: 'invoice-1',
          relatedUuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
          relatedSeries: 'A',
          relatedFolio: '100',
          documentCurrencyCode: 'MXN',
          equivalenceDr: '1.000000',
          paymentMethodDr: 'PPD',
          partialityNumber: 1,
          previousBalanceAmount: '2000.00',
          amountPaid: '1500.00',
          remainingBalance: '500.00',
          taxObjectCode: '01',
          taxesSnapshot: null,
        },
      ],
    },
    concepts: [],
    totals: {
      subtotal: '0.00',
      discount: '0.00',
      taxableBase: '0.00',
      tax: '0.00',
      total: '0.00',
    },
    snapshotHash: 'snapshot-hash',
  };
}

function config(overrides: Record<string, unknown> = {}) {
  return new ConfigService({
    FACTURAMA_API_BASE_URL: 'https://apisandbox.facturama.mx',
    FACTURAMA_API_MODE: 'MULTI_ISSUER',
    FACTURAMA_CREDENTIAL_REF: 'secret://facturama/sandbox',
    FISCAL_PROVIDER: 'FACTURAMA',
    FISCAL_PROVIDER_ENVIRONMENT: 'SANDBOX',
    CFDI_REQUEST_TIMEOUT_MS: 1_000,
    ...overrides,
  });
}

const resolver: FiscalCredentialResolver = {
  resolve: jest.fn(() =>
    Promise.resolve({
      username: 'api-user',
      password: 'api-password',
    }),
  ),
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.toString() : input.url;
}

function stampResponse(providerDocumentId = 'facturama-document-1') {
  return {
    Id: providerDocumentId,
    Date: '2026-08-22T10:00:00',
    Complement: {
      TaxStamp: {
        Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
        Date: '2026-08-22T10:00:01',
        CfdiSign: 'cfdi-seal',
        SatSign: 'sat-seal',
        SatCertNumber: '20001000000300022323',
        RfcProvCertif: 'FLI081010EK2',
      },
    },
  };
}

function contractResponse(scenario: FiscalProviderContractScenario) {
  if (scenario === 'STAMP') return stampResponse();
  if (scenario === 'STATUS_ACTIVE') {
    return { ...stampResponse(), Status: 'active' };
  }
  if (scenario === 'STATUS_UNKNOWN') {
    return { ...stampResponse(), Status: 'provider-specific-new-state' };
  }
  if (scenario === 'CANCEL') {
    return {
      Status: 'canceled',
      RequestDate: '2026-08-24T10:01:00',
      CancelationDate: '2026-08-24T10:01:01',
    };
  }
  return {
    ContentEncoding: 'base64',
    ContentType: 'xml',
    Content: Buffer.from('<cfdi:Comprobante />').toString('base64'),
  };
}

fiscalProviderContract('FacturamaAdapter', (scenario) => {
  const fetcher = jest.fn(() =>
    response(contractResponse(scenario)),
  ) as unknown as typeof fetch;
  const provider = new FacturamaAdapter(config(), resolver, fetcher);
  const uuid = '215CEC43-7E57-44AC-9D63-B54BBC4745BD';
  return {
    provider,
    issue: {
      correlationId: 'contract-stamp',
      idempotencyKey: 'contract-idempotency',
      folio: '100',
      series: 'A',
      snapshot: snapshot(),
    },
    status: {
      correlationId: `contract-${scenario.toLowerCase()}`,
      providerKey: provider.providerKey,
      providerDocumentId: 'facturama-document-1',
      uuid,
    },
    cancel: {
      correlationId: 'contract-cancel',
      providerKey: provider.providerKey,
      providerDocumentId: 'facturama-document-1',
      uuid,
      motive: '02',
    },
    artifact: {
      correlationId: 'contract-download-xml',
      providerKey: provider.providerKey,
      providerDocumentId: 'facturama-document-1',
    },
  };
});

describe('FacturamaAdapter', () => {
  it('rejects a historical operation addressed to a different provider', async () => {
    const fetcher = jest.fn() as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.getStatus({
        correlationId: 'corr-wrong-provider',
        providerKey: 'FUTURE_PAC',
        providerDocumentId: 'provider-document-1',
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_CONFIGURATION' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps the official Facturama CFDI E credit-note payload and relations', async () => {
    const fetcher = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(init?.body as string);
      expect(payload).toMatchObject({
        CfdiType: 'E',
        NameId: 2,
        PaymentForm: '03',
        PaymentMethod: 'PUE',
        Receiver: { CfdiUse: 'G02' },
        Relations: {
          Type: '01',
          Cfdis: [{ Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD' }],
        },
      });
      expect(payload).not.toHaveProperty('Date');
      expect(payload.Items).toHaveLength(1);
      return response(stampResponse());
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-credit-note-1',
        idempotencyKey: 'credit-note-idem-1',
        series: 'E',
        folio: '1',
        snapshot: creditNoteSnapshot(),
      }),
    ).resolves.toMatchObject({ outcome: 'STAMPED' });
  });

  it('maps an approved-return CFDI E to Facturama relation type 03', async () => {
    const fetcher = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestUrl(input)).toBe(
        'https://apisandbox.facturama.mx/api-lite/3/cfdis',
      );
      const payload = JSON.parse(init?.body as string);
      expect(payload).toMatchObject({
        CfdiType: 'E',
        NameId: 2,
        Receiver: { CfdiUse: 'G02' },
        Relations: {
          Type: '03',
          Cfdis: [{ Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD' }],
        },
      });
      return response(stampResponse());
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-credit-return-1',
        idempotencyKey: 'credit-return-idem-1',
        series: 'E',
        folio: '2',
        snapshot: creditNoteSnapshot('03'),
      }),
    ).resolves.toMatchObject({ outcome: 'STAMPED' });
  });

  it('maps an income substitution to Facturama Relations type 04', async () => {
    const fetcher = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestUrl(input)).toBe(
        'https://apisandbox.facturama.mx/api-lite/3/cfdis',
      );
      const payload = JSON.parse(init?.body as string);
      expect(payload).toMatchObject({
        CfdiType: 'I',
        Relations: {
          Type: '04',
          Cfdis: [{ Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD' }],
        },
      });
      return response(stampResponse());
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-income-substitution-1',
        idempotencyKey: 'income-substitution-idem-1',
        series: 'A',
        folio: '101',
        snapshot: substitutionSnapshot(),
      }),
    ).resolves.toMatchObject({ outcome: 'STAMPED' });
  });

  it('maps GlobalInformation exactly for an explicit global invoice only', async () => {
    const fetcher = jest.fn(() =>
      response(stampResponse()),
    ) as unknown as jest.MockedFunction<typeof fetch>;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await adapter.stamp({
      correlationId: 'corr-global-1',
      idempotencyKey: 'global-idem-1',
      folio: '102',
      series: 'A',
      snapshot: globalSnapshot(),
    });
    await adapter.stamp({
      correlationId: 'corr-nominative-1',
      idempotencyKey: 'nominative-idem-1',
      folio: '103',
      series: 'A',
      snapshot: snapshot(),
    });

    const globalPayload = JSON.parse(
      fetcher.mock.calls[0]?.[1]?.body as string,
    ) as Record<string, unknown>;
    const nominativePayload = JSON.parse(
      fetcher.mock.calls[1]?.[1]?.body as string,
    ) as Record<string, unknown>;
    expect(globalPayload.GlobalInformation).toEqual({
      Periodicity: '04',
      Months: '08',
      Year: 2026,
    });
    expect(globalPayload.Receiver).toEqual({
      CfdiUse: 'S01',
      Rfc: 'XAXX010101000',
      Name: 'PUBLICO EN GENERAL',
      FiscalRegime: '616',
      TaxZipCode: '78240',
    });
    expect(nominativePayload).not.toHaveProperty('GlobalInformation');
  });

  it.each([
    [
      'generic receiver without global information',
      () => {
        const value = globalSnapshot();
        delete (value as { globalInformation?: unknown }).globalInformation;
        return value;
      },
    ],
    [
      'global receiver with an ordinary use',
      () => ({
        ...globalSnapshot(),
        receiver: { ...globalSnapshot().receiver, fiscalUseCode: 'G03' },
      }),
    ],
  ])('rejects %s before Facturama network I/O', async (_case, factory) => {
    const fetcher = jest.fn() as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-invalid-global',
        idempotencyKey: 'invalid-global-idem',
        folio: '104',
        series: 'A',
        snapshot: factory(),
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_VALIDATION' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stamps the real multi-issuer payload and normalizes the TFD', async () => {
    const fetcher = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        input instanceof URL
          ? input.toString()
          : typeof input === 'string'
            ? input
            : input.url;
      expect(url).toBe('https://apisandbox.facturama.mx/api-lite/3/cfdis');
      const payload = JSON.parse(init?.body as string);
      expect(payload).toMatchObject({
        CfdiType: 'I',
        Folio: '100',
        Issuer: { Rfc: 'EKU9003173C9', FiscalRegime: '601' },
        Receiver: {
          Rfc: 'URE180429TM6',
          CfdiUse: 'G03',
          TaxZipCode: '86991',
        },
      });
      expect(payload).not.toHaveProperty('Relations');
      expect(payload.Items[0]).toMatchObject({
        ProductCode: '10101504',
        UnitCode: 'H87',
        TaxObject: '02',
        Taxes: [{ Name: 'IVA', Rate: '0.160000', Total: '16.00' }],
      });
      const headers = init?.headers as Record<string, string>;
      expect(headers['X-Correlation-ID']).toBe('corr-stamp-1');
      expect(headers.Authorization).toBe(
        `Basic ${Buffer.from('api-user:api-password').toString('base64')}`,
      );
      return response(stampResponse());
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    const result = await adapter.stamp({
      correlationId: 'corr-stamp-1',
      idempotencyKey: 'idem-1',
      series: 'A',
      folio: '100',
      snapshot: snapshot(),
    });

    expect(result).toMatchObject({
      provider: 'FACTURAMA',
      providerDocumentId: 'facturama-document-1',
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
      tfd: {
        providerCertificateRfc: 'FLI081010EK2',
        satCertificateNumber: '20001000000300022323',
      },
      xmlReference: { artifactType: 'XML' },
      pdfReference: { artifactType: 'PDF' },
    });
  });

  it('accepts and preserves an opaque Facturama provider document ID', async () => {
    const providerDocumentId = 'opaque/provider+document=?#%';
    const fetcher = jest.fn(() =>
      response(stampResponse(providerDocumentId)),
    ) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    const result = await adapter.stamp({
      correlationId: 'corr-opaque-provider-id',
      idempotencyKey: 'opaque-provider-id-idem',
      series: 'A',
      folio: '105',
      snapshot: snapshot(),
    });

    expect(result.providerDocumentId).toBe(providerDocumentId);
  });

  it('encodes an opaque provider document ID in every Facturama URL', async () => {
    const providerDocumentId = 'opaque/provider+document=?#%';
    const encodedProviderDocumentId = encodeURIComponent(providerDocumentId);
    const urls: string[] = [];
    const fetcher = jest.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      urls.push(url);
      if (url.includes('/api-lite/cfdis/')) {
        return response({
          Status: 'canceled',
          RequestDate: '2026-08-22T10:01:00',
          CancelationDate: '2026-08-22T10:01:02',
        });
      }
      if (url.includes('/Cfdi/xml/')) {
        return response({
          ContentEncoding: 'base64',
          ContentType: 'xml',
          Content: Buffer.from('<cfdi:Comprobante />').toString('base64'),
        });
      }
      if (url.includes('/Cfdi/pdf/')) {
        return response({
          ContentEncoding: 'base64',
          ContentType: 'pdf',
          Content: Buffer.from('%PDF-fake').toString('base64'),
        });
      }
      return response({
        Status: 'active',
        Complement: {
          TaxStamp: { Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD' },
        },
      });
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);
    const command = {
      providerDocumentId,
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
    };

    await adapter.cancel({
      correlationId: 'corr-opaque-cancel',
      ...command,
      motive: '02',
    });
    await adapter.getStatus({
      correlationId: 'corr-opaque-status',
      ...command,
    });
    await adapter.getCancellationStatus({
      correlationId: 'corr-opaque-cancellation-status',
      ...command,
    });
    await adapter.getXml({
      correlationId: 'corr-opaque-xml',
      providerDocumentId,
    });
    await adapter.getPdf({
      correlationId: 'corr-opaque-pdf',
      providerDocumentId,
    });

    expect(urls).toEqual([
      `https://apisandbox.facturama.mx/api-lite/cfdis/${encodedProviderDocumentId}?motive=02`,
      `https://apisandbox.facturama.mx/cfdi/${encodedProviderDocumentId}?type=issuedLite`,
      `https://apisandbox.facturama.mx/cfdi/${encodedProviderDocumentId}?type=issuedLite`,
      `https://apisandbox.facturama.mx/Cfdi/xml/issuedLite/${encodedProviderDocumentId}`,
      `https://apisandbox.facturama.mx/Cfdi/pdf/issuedLite/${encodedProviderDocumentId}`,
    ]);
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', ' \t\n'],
    ['NUL', 'opaque\u0000provider-id'],
    ['CR/LF', 'opaque\r\nprovider-id'],
    ['other control', 'opaque\u0007provider-id'],
    ['non-string', 123],
    ['oversized', 'x'.repeat(4097)],
  ] as const)(
    'rejects an invalid provider document ID: %s',
    async (_label, value) => {
      const fetcher = jest.fn() as unknown as typeof fetch;
      const adapter = new FacturamaAdapter(config(), resolver, fetcher);

      await expect(
        adapter.getStatus({
          correlationId: 'corr-invalid-provider-id',
          providerDocumentId: value as unknown as string,
        }),
      ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_RESPONSE_INVALID' });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it.each(['UTC', 'America/Mexico_City'] as const)(
    'omits Facturama generation Date for an immediate income stamp from host timezone %s',
    async (hostTimezone) => {
      const previousTimezone = process.env.TZ;
      process.env.TZ = hostTimezone;
      const issuedAt = '2026-08-30T03:16:54.000Z';
      const issueSnapshot = { ...snapshot(), issuedAt };
      let payload: Record<string, unknown> | undefined;

      try {
        const fetcher = jest.fn(
          (input: RequestInfo | URL, init?: RequestInit) => {
            expect(requestUrl(input)).toBe(
              'https://apisandbox.facturama.mx/api-lite/3/cfdis',
            );
            payload = JSON.parse(init?.body as string) as Record<
              string,
              unknown
            >;
            return response(stampResponse());
          },
        ) as unknown as typeof fetch;
        const adapter = new FacturamaAdapter(config(), resolver, fetcher);

        await expect(
          adapter.stamp({
            correlationId: 'corr-date-1',
            idempotencyKey: 'date-idem-1',
            folio: '103',
            snapshot: issueSnapshot,
          }),
        ).resolves.toMatchObject({ outcome: 'STAMPED' });
        expect(payload).toBeDefined();
        expect(payload).not.toHaveProperty('Date');
        expect(payload!.ExpeditionPlace).toBe(
          issueSnapshot.issuer.fiscalPostalCode,
        );
        expect(JSON.stringify(payload)).not.toContain('2026-08-30 03:16:54');
      } finally {
        if (previousTimezone === undefined) delete process.env.TZ;
        else process.env.TZ = previousTimezone;
      }
    },
  );

  it('maps the official Facturama Payment Receipt 2.0 payload without inventing totals', async () => {
    const fetcher = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestUrl(input)).toBe(
        'https://apisandbox.facturama.mx/api-lite/3/cfdis',
      );
      const payload = JSON.parse(init?.body as string);
      expect(payload).toMatchObject({
        CfdiType: 'P',
        NameId: 14,
        Folio: '93',
        Exportation: '01',
        Receiver: { CfdiUse: 'CP01', Rfc: 'URE180429TM6' },
      });
      expect(payload).not.toHaveProperty('Date');
      expect(payload).not.toHaveProperty('Currency');
      expect(payload).not.toHaveProperty('Items');
      expect(payload.ExpeditionPlace).toBe(
        paymentReceiptSnapshot().issuer.fiscalPostalCode,
      );
      expect(payload).not.toHaveProperty('PaymentForm');
      expect(payload).not.toHaveProperty('PaymentMethod');
      expect(payload.Complemento.Payments[0]).toMatchObject({
        Date: paymentReceiptSnapshot().payment.paidAt,
        PaymentForm: '03',
        Amount: '1500.00',
        Currency: 'MXN',
        RelatedDocuments: [
          {
            Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
            PaymentMethod: 'PPD',
            PartialityNumber: 1,
            PreviousBalanceAmount: '2000.00',
            AmountPaid: '1500.00',
            ImpSaldoInsoluto: '500.00',
          },
        ],
      });
      return response(stampResponse());
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-rep-1',
        idempotencyKey: 'rep-idem-1',
        series: 'P',
        folio: '93',
        snapshot: paymentReceiptSnapshot(),
      }),
    ).resolves.toMatchObject({ outcome: 'STAMPED' });
  });

  it('maps Pagos 2.0 tax snapshots to RelatedDocuments and payment tax nodes', async () => {
    const fetcher = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      expect(requestUrl(input)).toBe(
        'https://apisandbox.facturama.mx/api-lite/3/cfdis',
      );
      const payload = JSON.parse(init?.body as string);
      const related = payload.Complemento.Payments[0].RelatedDocuments[0];
      expect(related).toMatchObject({ TaxObject: '02' });
      expect(related.Taxes).toEqual([
        expect.objectContaining({
          Name: 'IVA',
          Rate: '0.160000',
          Base: '100.00',
          Total: '16.00',
          IsRetention: false,
        }),
      ]);
      expect(payload.Complemento.Payments[0].Taxes).toEqual([
        expect.objectContaining({ Name: 'IVA', Total: '16.00' }),
      ]);
      return response(stampResponse());
    }) as unknown as typeof fetch;
    const snapshot = paymentReceiptSnapshot();
    const taxedApplication = {
      ...snapshot.payment.relatedDocuments[0],
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
    } as const;
    const taxedSnapshot = {
      ...snapshot,
      payment: {
        ...snapshot.payment,
        taxes: taxedApplication.taxesSnapshot,
        relatedDocuments: [taxedApplication],
      },
    };
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-rep-tax',
        idempotencyKey: 'rep-tax-idem',
        series: 'P',
        folio: '94',
        snapshot: taxedSnapshot,
      }),
    ).resolves.toMatchObject({ outcome: 'STAMPED' });
  });

  it('sends the payment exchange rate only for a non-MXN payment currency', async () => {
    const fetcher = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const payload = JSON.parse(init?.body as string);
      expect(payload.Complemento.Payments[0]).toMatchObject({
        Currency: 'USD',
        ExchangeRate: '17.500000',
      });
      return response(stampResponse());
    }) as unknown as typeof fetch;
    const snapshot = paymentReceiptSnapshot();
    const foreignSnapshot = {
      ...snapshot,
      payment: {
        ...snapshot.payment,
        currencyCode: 'USD',
        exchangeRateToMxn: '17.500000',
        relatedDocuments: snapshot.payment.relatedDocuments.map((document) => ({
          ...document,
          documentCurrencyCode: 'USD',
        })),
      },
    };
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-rep-usd',
        idempotencyKey: 'rep-usd-idem',
        series: 'P',
        folio: '95',
        snapshot: foreignSnapshot,
      }),
    ).resolves.toMatchObject({ outcome: 'STAMPED' });
  });

  it('selects the configured production endpoint and passes the environment to the secret resolver', async () => {
    const fetcher = jest.fn(() =>
      response(stampResponse()),
    ) as unknown as typeof fetch;
    const resolve = jest.fn(() =>
      Promise.resolve({
        username: 'production-user',
        password: 'production-password',
      }),
    );
    const productionResolver: FiscalCredentialResolver = { resolve };
    const adapter = new FacturamaAdapter(
      config({
        FACTURAMA_API_BASE_URL: 'https://api.facturama.mx',
        FISCAL_PROVIDER_ENVIRONMENT: 'PRODUCTION',
      }),
      productionResolver,
      fetcher,
    );

    await adapter.stamp({
      correlationId: 'corr-production',
      idempotencyKey: 'idem-production',
      folio: '101',
      snapshot: snapshot(),
    });

    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://api.facturama.mx/api-lite/3/cfdis',
      }),
      expect.any(Object),
    );
    expect(resolve).toHaveBeenCalledWith(
      'secret://facturama/sandbox',
      'PRODUCTION',
    );
  });

  it('rejects a non-HTTPS production endpoint before network I/O', async () => {
    const fetcher = jest.fn(() =>
      response(stampResponse()),
    ) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(
      config({
        FACTURAMA_API_BASE_URL: 'http://api.facturama.mx',
        FISCAL_PROVIDER_ENVIRONMENT: 'PRODUCTION',
      }),
      resolver,
      fetcher,
    );

    await expect(
      adapter.stamp({
        correlationId: 'corr-production-http',
        idempotencyKey: 'idem-production-http',
        folio: '102',
        snapshot: snapshot(),
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_CONFIGURATION' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an unallowlisted endpoint before resolving credentials or network I/O', async () => {
    const fetcher = jest.fn(() =>
      response(stampResponse()),
    ) as unknown as typeof fetch;
    const resolve = jest.fn(() =>
      Promise.resolve({ username: 'api-user', password: 'api-password' }),
    );
    const adapter = new FacturamaAdapter(
      config({ FACTURAMA_API_BASE_URL: 'https://attacker.example' }),
      { resolve },
      fetcher,
    );

    await expect(
      adapter.stamp({
        correlationId: 'corr-unallowlisted',
        idempotencyKey: 'idem-unallowlisted',
        folio: '102',
        snapshot: snapshot(),
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_CONFIGURATION' });
    expect(resolve).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [422, 'FISCAL_PROVIDER_VALIDATION'],
    [401, 'FISCAL_PROVIDER_AUTHENTICATION'],
    [503, 'FISCAL_PROVIDER_UNAVAILABLE'],
  ] as const)(
    'maps HTTP %s to a stable internal code',
    async (status, code) => {
      const fetcher = jest.fn(() =>
        response({ error: 'do not expose me' }, status),
      ) as unknown as typeof fetch;
      const adapter = new FacturamaAdapter(config(), resolver, fetcher);

      await expect(
        adapter.stamp({
          correlationId: `corr-${status}`,
          idempotencyKey: 'idem-1',
          folio: '100',
          snapshot: snapshot(),
        }),
      ).rejects.toMatchObject({ code, correlationId: `corr-${status}` });
    },
  );

  it('maps an aborted request to timeout without exposing provider data', async () => {
    const fetcher = jest.fn(() => {
      throw Object.assign(new Error('password=do-not-log'), {
        name: 'AbortError',
      });
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    let error: FiscalProviderError | undefined;
    try {
      await adapter.stamp({
        correlationId: 'corr-timeout',
        idempotencyKey: 'idem-1',
        folio: '100',
        snapshot: snapshot(),
      });
    } catch (value) {
      error = value as FiscalProviderError;
    }

    expect(error).toBeDefined();
    expect(error).toMatchObject({
      code: 'FISCAL_PROVIDER_TIMEOUT',
      retryable: true,
      correlationId: 'corr-timeout',
    });
    expect(error!.message).not.toContain('password');
  });

  it('rejects an incomplete stamp response instead of fabricating UUID or TFD data', async () => {
    const fetcher = jest.fn(() =>
      response({ Id: 'facturama-document-1', Date: '2026-08-22T10:00:00' }),
    ) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-incomplete',
        idempotencyKey: 'idem-1',
        folio: '100',
        snapshot: snapshot(),
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_RESPONSE_INVALID' });
  });

  it('rejects an oversized provider response before reading its body', async () => {
    const text = jest.fn(() =>
      Promise.resolve(JSON.stringify(stampResponse())),
    );
    const oversizedResponse = {
      ok: true,
      status: 200,
      headers: new Headers({
        'content-length': String(16 * 1024 * 1024 + 1),
      }),
      body: null,
      text,
    } as unknown as Response;
    const fetcher = jest.fn(() =>
      Promise.resolve(oversizedResponse),
    ) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-oversized',
        idempotencyKey: 'idem-oversized',
        folio: '100',
        snapshot: snapshot(),
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_RESPONSE_INVALID' });
    expect(text).not.toHaveBeenCalled();
  });

  it('cancels a chunked provider body when it exceeds the response limit', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let pulls = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 20) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetcher = jest.fn(() =>
      Promise.resolve(
        new Response(stream, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    ) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.stamp({
        correlationId: 'corr-chunked-oversized',
        idempotencyKey: 'idem-chunked-oversized',
        folio: '100',
        snapshot: snapshot(),
      }),
    ).rejects.toMatchObject({ code: 'FISCAL_PROVIDER_RESPONSE_INVALID' });
    expect(cancelled).toBe(true);
  });

  it.each(['02', '03', '04'] as const)(
    'sends cancellation motive %s through the exact DELETE contract without uuidReplacement',
    async (motive) => {
      const fetcher = jest.fn(
        (input: RequestInfo | URL, init?: RequestInit) => {
          expect(requestUrl(input)).toBe(
            `https://apisandbox.facturama.mx/api-lite/cfdis/facturama-document-1?motive=${motive}`,
          );
          expect(init?.method).toBe('DELETE');
          return response({
            Status: 'canceled',
            RequestDate: '2026-08-22T10:01:00',
            CancelationDate: '2026-08-22T10:01:02',
          });
        },
      ) as unknown as typeof fetch;
      const adapter = new FacturamaAdapter(config(), resolver, fetcher);

      await expect(
        adapter.cancel({
          correlationId: `corr-cancel-${motive}`,
          providerDocumentId: 'facturama-document-1',
          uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
          motive,
        }),
      ).resolves.toMatchObject({ status: 'CANCELLED' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );

  it('normalizes a cancellation request that is pending receptor acceptance', async () => {
    const fetcher = jest.fn((input: RequestInfo | URL) => {
      const url =
        input instanceof URL
          ? input.toString()
          : typeof input === 'string'
            ? input
            : input.url;
      expect(url).toContain(
        '/api-lite/cfdis/facturama-document-1?motive=01&uuidReplacement=REPLACEMENT-UUID',
      );
      return response({
        Status: 'pending',
        RequestDate: '2026-08-22T10:01:00',
      });
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    await expect(
      adapter.cancel({
        correlationId: 'corr-cancel-pending',
        providerDocumentId: 'facturama-document-1',
        uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
        motive: '01',
        replacementUuid: 'REPLACEMENT-UUID',
      }),
    ).resolves.toMatchObject({
      status: 'PENDING',
      requestedAt: '2026-08-22T10:01:00',
    });
  });

  it('normalizes completed cancellation and decodes the SAT acknowledgment', async () => {
    const ack = Buffer.from('<Cancelacion />', 'utf8').toString('base64');
    const fetcher = jest.fn(() =>
      response({
        Status: 'canceled',
        RequestDate: '2026-08-22T10:01:00',
        CancelationDate: '2026-08-22T10:01:02',
        AcuseXmlBase64: ack,
      }),
    ) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    const result = await adapter.cancel({
      correlationId: 'corr-cancel-completed',
      providerDocumentId: 'facturama-document-1',
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
      motive: '02',
    });

    expect(result.status).toBe('CANCELLED');
    expect(Buffer.from(result.acknowledgment!.content).toString('utf8')).toBe(
      '<Cancelacion />',
    );
    expect(result.acknowledgment).toMatchObject({
      artifactType: 'CANCELLATION_ACK',
    });
  });

  it('retrieves normalized XML/PDF artifacts and status without exposing raw envelopes', async () => {
    const xml = Buffer.from('<cfdi:Comprobante />').toString('base64');
    const pdf = Buffer.from('%PDF-fake').toString('base64');
    const fetcher = jest.fn((input: RequestInfo | URL) => {
      const url =
        input instanceof URL
          ? input.toString()
          : typeof input === 'string'
            ? input
            : input.url;
      if (url.includes('/Cfdi/xml/'))
        return response({
          ContentEncoding: 'base64',
          ContentType: 'xml',
          Content: xml,
        });
      if (url.includes('/Cfdi/pdf/'))
        return response({
          ContentEncoding: 'base64',
          ContentType: 'pdf',
          Content: pdf,
        });
      return response({
        Id: 'facturama-document-1',
        Date: '2026-08-22T10:00:00',
        Status: 'pending',
        Complement: {
          TaxStamp: { Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD' },
        },
      });
    }) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    const status = await adapter.getStatus({
      correlationId: 'corr-status',
      providerDocumentId: 'facturama-document-1',
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
    });
    const xmlResult = await adapter.getXml({
      correlationId: 'corr-xml',
      providerDocumentId: 'facturama-document-1',
    });
    const pdfResult = await adapter.getPdf({
      correlationId: 'corr-pdf',
      providerDocumentId: 'facturama-document-1',
    });

    expect(status.status).toBe('CANCEL_PENDING');
    expect(Buffer.from(xmlResult.content).toString('utf8')).toBe(
      '<cfdi:Comprobante />',
    );
    expect(Buffer.from(pdfResult.content).toString('utf8')).toBe('%PDF-fake');
    expect(xmlResult.sha256).toHaveLength(64);
    expect(pdfResult.sha256).toHaveLength(64);
  });

  it('normalizes a cancellation status response and carries its SAT acknowledgment', async () => {
    const ack = Buffer.from('<Acuse />', 'utf8').toString('base64');
    const fetcher = jest.fn(() =>
      response({
        Id: 'facturama-document-1',
        Status: 'canceled',
        CancelationDate: '2026-08-22T10:02:00',
        AcuseXmlBase64: ack,
        Complement: {
          TaxStamp: {
            Uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
          },
        },
      }),
    ) as unknown as typeof fetch;
    const adapter = new FacturamaAdapter(config(), resolver, fetcher);

    const result = await adapter.getCancellationStatus({
      correlationId: 'corr-cancel-status',
      providerDocumentId: 'facturama-document-1',
      uuid: '215CEC43-7E57-44AC-9D63-B54BBC4745BD',
    });

    expect(result).toMatchObject({
      status: 'CANCELLED',
      providerDocumentId: 'facturama-document-1',
      acknowledgment: {
        artifactType: 'CANCELLATION_ACK',
        contentType: 'application/xml',
      },
    });
    expect(Buffer.from(result.acknowledgment!.content).toString('utf8')).toBe(
      '<Acuse />',
    );
  });
});
