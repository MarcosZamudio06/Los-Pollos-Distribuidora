import { Prisma } from '@prisma/client';
import { CfdiDomainError } from './domain/cfdi-domain.error';
import { CfdiIssuanceRepository } from './cfdi-issuance.repository';

const d = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

const dto = {
  expectedVersion: 3,
  cfdiUse: 'G03',
  paymentMethod: 'PUE',
  paymentForm: '01',
  exportCode: '01',
};

const concept = {
  lineNumber: 1,
  sourceBillingRequestItemId: 'request-item-1',
  sourceSaleItemId: 'sale-item-1',
  sourceProductId: 'product-1',
  productServiceCode: '50111500',
  identificationNumber: 'POLLO-1',
  description: 'Pollo entero',
  quantity: '10.000000',
  unitCode: 'KGM',
  unitValue: '10.000000',
  amount: '100.00',
  discount: '0.00',
  taxableBase: '100.00',
  taxObjectCode: '02',
  taxCode: '002',
  factorType: 'Tasa',
  rateOrQuota: '0.160000',
  taxAmount: '16.00',
  total: '116.00',
  snapshotHash: 'b'.repeat(64),
};

const snapshot = {
  cfdiVersion: '4.0',
  cfdiType: 'INCOME',
  billingRequestId: 'request-1',
  billingRequestVersion: 3,
  issuedAt: '2026-08-23T18:00:00.000Z',
  currencyCode: 'MXN',
  exchangeRate: '1.000000',
  exportCode: '01',
  paymentFormCode: '01',
  paymentMethodCode: 'PUE',
  sourceDocumentIds: ['sale-document-1'],
  issuer: {
    legalEntityId: 'issuer-1',
    legalName: 'Issuer SA de CV',
    taxId: 'ISS010101AB1',
    fiscalPostalCode: '64000',
    fiscalRegime: '601',
    series: 'A',
    certificateSerialNumber: '30001000000500003416',
    certificateFingerprint: 'a'.repeat(64),
  },
  receiver: {
    customerId: 'customer-1',
    fiscalName: 'Receiver SA de CV',
    taxId: 'REC010101AB1',
    fiscalPostalCode: '64000',
    fiscalRegime: '601',
    fiscalUseCode: 'G03',
    billingEmail: 'billing@example.test',
  },
  concepts: [concept],
  totals: {
    subtotal: '100.00',
    discount: '0.00',
    taxableBase: '100.00',
    tax: '16.00',
    total: '116.00',
  },
  snapshotHash: 'c'.repeat(64),
} as const;

function sourceDocument() {
  return {
    id: 'request-document-1',
    billingRequestId: 'request-1',
    saleDocumentId: 'sale-document-1',
    requestedSubtotal: d(100),
    requestedTax: d(16),
    requestedTotal: d(116),
    requestedItems: [
      {
        id: 'request-item-1',
        saleItemId: 'sale-item-1',
        requestedSubtotal: d(100),
        requestedTax: d(16),
        requestedTotal: d(116),
      },
    ],
  };
}

function transaction() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    billingRequest: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'request-1',
        status: 'APPROVED',
        version: 3,
        nativeInvoice: null,
      }),
      update: jest.fn().mockResolvedValue({ id: 'request-1', version: 4 }),
    },
    billingRequestSaleDocument: {
      findMany: jest.fn().mockResolvedValue([sourceDocument()]),
    },
    invoice: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'invoice-1', version: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'invoice-1' }),
    },
    legalEntity: {
      findUnique: jest.fn().mockResolvedValue({
        certificateSubject: 'CN=Issuer',
        certificateValidFrom: new Date('2026-01-01T00:00:00.000Z'),
        certificateValidTo: new Date('2027-01-01T00:00:00.000Z'),
      }),
    },
    fiscalCertificate: {
      upsert: jest.fn().mockResolvedValue({ id: 'certificate-1' }),
    },
    fiscalFolioSequence: {
      upsert: jest.fn().mockResolvedValue({ nextValue: 2n }),
    },
    invoiceConcept: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    invoiceSaleDocument: {
      create: jest.fn().mockResolvedValue({ id: 'invoice-document-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    invoiceSaleItemApplication: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    fiscalOperationAttempt: {
      findUnique: jest.fn().mockResolvedValue({ status: 'PROCESSING' }),
      create: jest.fn().mockResolvedValue({
        id: 'attempt-1',
        correlationId: 'correlation-1',
      }),
      update: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
    },
    fiscalArtifact: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    billingAuditLog: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  return tx;
}

function harness() {
  const tx = transaction();
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const validation = {
    buildApprovedRequestWithClient: jest.fn().mockResolvedValue(snapshot),
  };
  return {
    tx,
    prisma,
    validation,
    repository: new CfdiIssuanceRepository(
      prisma as never,
      validation as never,
    ),
  };
}

describe('CfdiIssuanceRepository preparation', () => {
  it('reserves one root, folio, immutable snapshot, applications and PROCESSING attempt in one short transaction', async () => {
    const { repository, tx, validation } = harness();

    const result = await repository.prepare(
      'request-1',
      dto,
      { id: 'admin-1', role: 'ADMIN' },
      'stamp-1',
      'FACTURAMA',
    );

    expect(result).toMatchObject({
      replayed: false,
      invoiceId: 'invoice-1',
      attemptId: 'attempt-1',
      series: 'A',
      folio: '1',
      fiscalStatus: 'STAMPING',
      operationStatus: 'PROCESSING',
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(validation.buildApprovedRequestWithClient).toHaveBeenCalledWith(
      tx,
      'request-1',
      expect.objectContaining({
        payment: expect.objectContaining({ paymentMethodCode: 'PUE' }),
        cfdiUse: 'G03',
      }),
    );
    expect(tx.invoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          origin: 'NATIVE_CFDI',
          sourceBillingRequestId: 'request-1',
          fiscalStatus: 'READY',
          series: 'A',
          folio: '1',
        }),
      }),
    );
    expect(tx.invoiceConcept.createMany).toHaveBeenCalledTimes(1);
    expect(tx.invoiceSaleDocument.create).toHaveBeenCalledTimes(1);
    expect(tx.invoiceSaleItemApplication.createMany).toHaveBeenCalledTimes(1);
    expect(tx.fiscalOperationAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'PENDING',
          operation: 'STAMP',
        }),
      }),
    );
    expect(tx.fiscalOperationAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PROCESSING' }),
      }),
    );
  });

  it('replays the same key/hash and rejects payload drift or another issuance root', async () => {
    const same = harness();
    const requestHash = CfdiIssuanceRepository.requestHash('request-1', dto);
    same.tx.invoice.findUnique.mockResolvedValueOnce({
      id: 'invoice-1',
      sourceBillingRequestId: 'request-1',
      fiscalIdempotencyKey: 'stamp-1',
      fiscalRequestHash: requestHash,
      fiscalStatus: 'UNKNOWN',
      uuid: null,
      series: 'A',
      folio: '1',
      version: 1,
      fiscalOperationAttempts: [
        {
          id: 'attempt-1',
          correlationId: 'correlation-1',
          idempotencyKey: 'stamp-1',
          status: 'UNKNOWN',
        },
      ],
    });

    await expect(
      same.repository.prepare(
        'request-1',
        dto,
        { id: 'admin-1', role: 'ADMIN' },
        'stamp-1',
        'FACTURAMA',
      ),
    ).resolves.toMatchObject({ replayed: true, fiscalStatus: 'UNKNOWN' });
    expect(same.tx.invoice.create).not.toHaveBeenCalled();

    const drift = harness();
    drift.tx.invoice.findUnique.mockResolvedValueOnce({
      id: 'invoice-1',
      sourceBillingRequestId: 'request-1',
      fiscalIdempotencyKey: 'stamp-1',
      fiscalRequestHash: 'd'.repeat(64),
      fiscalOperationAttempts: [],
    });
    await expect(
      drift.repository.prepare(
        'request-1',
        dto,
        { id: 'admin-1', role: 'ADMIN' },
        'stamp-1',
        'FACTURAMA',
      ),
    ).rejects.toMatchObject({ message: 'IDEMPOTENCY_CONFLICT' });

    const another = harness();
    another.tx.billingRequest.findUnique.mockResolvedValueOnce({
      id: 'request-1',
      status: 'APPROVED',
      version: 3,
      nativeInvoice: { id: 'invoice-other' },
    });
    await expect(
      another.repository.prepare(
        'request-1',
        dto,
        { id: 'admin-1', role: 'ADMIN' },
        'stamp-other',
        'FACTURAMA',
      ),
    ).rejects.toMatchObject({ message: 'CFDI_OPERATION_ALREADY_EXISTS' });
  });

  it('rejects version/status/validation failures before reserving a stamp', async () => {
    const version = harness();
    version.tx.billingRequest.findUnique.mockResolvedValueOnce({
      id: 'request-1',
      status: 'APPROVED',
      version: 4,
      nativeInvoice: null,
    });
    await expect(
      version.repository.prepare(
        'request-1',
        dto,
        { id: 'admin-1', role: 'ADMIN' },
        'stamp-1',
        'FACTURAMA',
      ),
    ).rejects.toMatchObject({ message: 'VERSION_CONFLICT' });

    const status = harness();
    status.tx.billingRequest.findUnique.mockResolvedValueOnce({
      id: 'request-1',
      status: 'IN_REVIEW',
      version: 3,
      nativeInvoice: null,
    });
    await expect(
      status.repository.prepare(
        'request-1',
        dto,
        { id: 'admin-1', role: 'ADMIN' },
        'stamp-1',
        'FACTURAMA',
      ),
    ).rejects.toMatchObject({ message: 'BILLING_REQUEST_NOT_APPROVED' });

    const invalid = harness();
    invalid.validation.buildApprovedRequestWithClient.mockRejectedValue(
      new CfdiDomainError('OVER_INVOICED'),
    );
    await expect(
      invalid.repository.prepare(
        'request-1',
        dto,
        { id: 'admin-1', role: 'ADMIN' },
        'stamp-1',
        'FACTURAMA',
      ),
    ).rejects.toMatchObject({ message: 'OVER_INVOICED' });
    expect(invalid.tx.invoice.create).not.toHaveBeenCalled();
  });
});

describe('CfdiIssuanceRepository finalization', () => {
  const prepared = {
    replayed: false,
    billingRequestId: 'request-1',
    invoiceId: 'invoice-1',
    attemptId: 'attempt-1',
    correlationId: 'correlation-1',
    idempotencyKey: 'stamp-1',
    actorUserId: 'admin-1',
    series: 'A',
    folio: '1',
    version: 1,
    fiscalStatus: 'STAMPING',
    operationStatus: 'PROCESSING',
    snapshot,
  } as const;

  it('persists the server-owned TFD identity and pending artifact references atomically', async () => {
    const { repository, tx } = harness();
    const response = {
      correlationId: 'correlation-1',
      provider: 'FACTURAMA',
      providerDocumentId: 'provider-1',
      outcome: 'STAMPED',
      uuid: '123E4567-E89B-42D3-A456-426614174000',
      issuedAt: snapshot.issuedAt,
      stampedAt: '2026-08-23T18:00:01.000Z',
      tfd: {
        uuid: '123E4567-E89B-42D3-A456-426614174000',
        stampedAt: '2026-08-23T18:00:01.000Z',
        cfdiSeal: 'cfdi-seal',
        satSeal: 'sat-seal',
        satCertificateNumber: 'sat-cert',
        providerCertificateRfc: 'AAA010101AAA',
      },
      xmlReference: { artifactType: 'XML', providerDocumentId: 'provider-1' },
      pdfReference: { artifactType: 'PDF', providerDocumentId: 'provider-1' },
    } as const;

    await expect(
      repository.finalizeStamped(prepared, response),
    ).resolves.toMatchObject({
      fiscalStatus: 'STAMPED',
      operationStatus: 'SUCCEEDED',
      uuid: response.uuid,
    });
    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uuid: response.uuid,
          fiscalStatus: 'STAMPED',
          cfdiSeal: 'cfdi-seal',
          satSeal: 'sat-seal',
        }),
      }),
    );
    expect(tx.fiscalArtifact.createMany).toHaveBeenCalledTimes(1);
  });

  it('keeps applications reserved for UNKNOWN and reverses them only for terminal failure', async () => {
    const unknown = harness();
    await unknown.repository.finalizeFailure(prepared, 'UNKNOWN', {
      code: 'FISCAL_PROVIDER_TIMEOUT',
      statusCode: null,
    });
    expect(unknown.tx.invoiceSaleDocument.updateMany).not.toHaveBeenCalled();
    expect(unknown.tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fiscalStatus: 'UNKNOWN' }),
      }),
    );

    const terminal = harness();
    await terminal.repository.finalizeFailure(prepared, 'TERMINAL_FAILURE', {
      code: 'FISCAL_PROVIDER_VALIDATION',
      statusCode: 400,
    });
    expect(
      terminal.tx.invoiceSaleItemApplication.updateMany,
    ).toHaveBeenCalled();
    expect(terminal.tx.invoiceSaleDocument.updateMany).toHaveBeenCalled();
    expect(terminal.tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fiscalStatus: 'FAILED' }),
      }),
    );
  });

  it('does not downgrade a STAMPED invoice when the client observed an ambiguous commit', async () => {
    const { repository, tx } = harness();
    tx.invoice.findUnique.mockResolvedValueOnce({
      fiscalStatus: 'STAMPED',
      uuid: '123E4567-E89B-42D3-A456-426614174000',
    });
    tx.fiscalOperationAttempt.findUnique.mockResolvedValueOnce({
      status: 'SUCCEEDED',
    });

    await expect(
      repository.markPersistenceUnknown(
        prepared,
        'STAMP_RESULT_PERSISTENCE_FAILED',
      ),
    ).resolves.toMatchObject({
      fiscalStatus: 'STAMPED',
      operationStatus: 'SUCCEEDED',
      uuid: '123E4567-E89B-42D3-A456-426614174000',
    });
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.fiscalOperationAttempt.update).not.toHaveBeenCalled();
  });
});
