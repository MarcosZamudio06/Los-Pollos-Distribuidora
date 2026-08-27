import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { FiscalProviderError } from './domain/fiscal-provider.port';
import { StampReconciliationJob } from './stamp-reconciliation.job';

const uuid = 'A8098C1A-F86E-11DA-BD1A-00112444BE1E';

function xmlContent(value = uuid, prefix = '') {
  const content = Buffer.from(
    `${prefix}<tfd:TimbreFiscalDigital UUID="${value}" FechaTimbrado="2026-08-23T18:00:01" NoCertificadoSAT="SAT-CERT" RfcProvCertif="PAC010101AAA" SelloCFD="CFDI-SEAL" SelloSAT="SAT-SEAL" />`,
  );
  return {
    correlationId: 'recovery-correlation-1',
    provider: 'FACTURAMA' as const,
    providerDocumentId: 'provider-document-1',
    artifactType: 'XML' as const,
    contentType: 'application/xml',
    content,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function status(overrides: Record<string, unknown> = {}) {
  return {
    correlationId: 'recovery-correlation-1',
    provider: 'FACTURAMA' as const,
    providerDocumentId: 'provider-document-1',
    status: 'ACTIVE' as const,
    uuid,
    issuedAt: '2026-08-23T18:00:00.000Z',
    cancelledAt: null,
    ...overrides,
  };
}

function candidate() {
  return {
    id: 'stamp-attempt-1',
    invoiceId: 'invoice-1',
    operation: 'STAMP' as const,
    status: 'UNKNOWN' as const,
    attemptNumber: 1,
    correlationId: 'stamp-correlation-1',
    idempotencyKey: 'stamp-key-1',
    requestHash: 'a'.repeat(64),
    providerKey: 'FACTURAMA',
    providerReference: 'provider-document-1',
    nextRetryAt: null,
    invoice: {
      id: 'invoice-1',
      uuid: null,
      legalEntityId: 'legal-entity-1',
      series: 'A',
      folio: '1',
      issuedAt: new Date('2026-08-23T18:00:00.000Z'),
      stampedAt: null,
      fiscalStatus: 'UNKNOWN' as const,
      certificateNumber: null,
      fiscalCertificate: { serialNumber: 'CSD-CERT' },
      issuerSnapshot: { certificateSerialNumber: 'CSD-CERT' },
      fiscalOperationAttempts: [],
      createdByUserId: 'admin-1',
      sourceCreditAdjustmentId: null,
    },
    recoveryAttemptId: 'recovery-attempt-1',
    recoveryCorrelationId: 'recovery-correlation-1',
    recoveryAttemptNumber: 1,
  };
}

function harness() {
  const tx = {
    $queryRawUnsafe: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
    fiscalOperationAttempt: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({
        id: 'recovery-attempt-1',
        correlationId: 'recovery-correlation-1',
      }),
    },
    invoice: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        id: 'invoice-1',
        uuid: null,
        fiscalStatus: 'UNKNOWN',
        certificateNumber: null,
        fiscalCertificate: { serialNumber: 'CSD-CERT' },
        issuerSnapshot: { certificateSerialNumber: 'CSD-CERT' },
        createdByUserId: 'admin-1',
        sourceCreditAdjustmentId: null,
      }),
    },
    paymentInvoiceApplication: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    creditAdjustment: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    billingDataRemediation: { upsert: jest.fn().mockResolvedValue({}) },
    billingAuditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  };
  const provider = {
    getStatus: jest.fn(),
    getXml: jest.fn().mockResolvedValue(xmlContent()),
    getPdf: jest.fn().mockResolvedValue(null),
  };
  const artifacts = {
    persistStampedArtifacts: jest
      .fn()
      .mockResolvedValue({ XML: 'AVAILABLE', PDF: 'FAILED' }),
  };
  const config = {
    get: jest
      .fn()
      .mockImplementation((_key: string, fallback?: unknown) => fallback),
  };
  const job = new StampReconciliationJob(
    prisma as never,
    provider as never,
    artifacts as never,
    config as never,
  );
  return { job, prisma, tx, provider, artifacts, config };
}

describe('StampReconciliationJob', () => {
  beforeEach(() => jest.resetAllMocks());

  it('skips when another instance owns the PostgreSQL advisory lock', async () => {
    const { job, tx } = harness();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: false }]);

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({
      skipped: true,
      started: 0,
      recovered: 0,
    });
    expect(tx.fiscalOperationAttempt.findMany).not.toHaveBeenCalled();
  });

  it('allows only the instance granted the advisory lock to reconcile a shared candidate', async () => {
    const first = harness();
    const second = harness();
    first.tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    second.tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: false }]);
    first.tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([
      candidate(),
    ]);
    first.provider.getStatus.mockResolvedValueOnce(status());

    const [firstResult, secondResult] = await Promise.all([
      first.job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
      second.job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ]);

    expect(firstResult).toMatchObject({ started: 1, recovered: 1 });
    expect(secondResult).toMatchObject({ skipped: true, started: 0 });
    expect(first.provider.getStatus).toHaveBeenCalledTimes(1);
    expect(second.provider.getStatus).not.toHaveBeenCalled();
  });

  it('recovers a provider-found CFDI and asks artifact storage to persist XML/PDF', async () => {
    const { job, tx, provider, artifacts } = harness();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([candidate()]);
    provider.getStatus.mockResolvedValueOnce(status());

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({
      skipped: false,
      started: 1,
      recovered: 1,
    });
    expect(provider.getStatus).toHaveBeenCalledWith({
      correlationId: 'recovery-correlation-1',
      providerKey: 'FACTURAMA',
      providerDocumentId: 'provider-document-1',
      uuid: undefined,
    });
    expect(artifacts.persistStampedArtifacts).toHaveBeenCalledWith(
      'invoice-1',
      expect.objectContaining({ uuid }),
      expect.objectContaining({ XML: expect.any(Object) }),
    );
    expect(tx.paymentInvoiceApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'UNKNOWN',
        }),
        data: { status: 'EFFECTIVE' },
      }),
    );
  });

  it('marks the source credit adjustment issued when an unknown CFDI E is recovered', async () => {
    const { job, tx, provider } = harness();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([
      {
        ...candidate(),
        invoice: {
          ...candidate().invoice,
          sourceCreditAdjustmentId: 'credit-adjustment-1',
        },
      },
    ]);
    tx.invoice.findUnique.mockResolvedValueOnce({
      id: 'invoice-1',
      uuid: null,
      fiscalStatus: 'UNKNOWN',
      certificateNumber: null,
      fiscalCertificate: { serialNumber: 'CSD-CERT' },
      issuerSnapshot: { certificateSerialNumber: 'CSD-CERT' },
      createdByUserId: 'admin-1',
      sourceCreditAdjustmentId: 'credit-adjustment-1',
    });
    provider.getStatus.mockResolvedValueOnce(status());

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({ recovered: 1 });
    expect(tx.creditAdjustment.updateMany).toHaveBeenCalledWith({
      where: { id: 'credit-adjustment-1', status: 'UNKNOWN' },
      data: { status: 'ISSUED', version: { increment: 1 } },
    });
  });

  it('keeps the operation uncertain after a provider timeout and schedules another status query', async () => {
    const { job, tx, provider } = harness();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([candidate()]);
    provider.getStatus.mockRejectedValueOnce(
      new FiscalProviderError(
        'FISCAL_PROVIDER_TIMEOUT',
        'STATUS',
        'recovery-correlation-1',
        null,
        true,
      ),
    );

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({
      stillUnknown: 1,
    });
    expect(tx.fiscalOperationAttempt.updateMany).toHaveBeenCalled();
    expect(tx.billingDataRemediation.upsert).not.toHaveBeenCalled();
  });

  it('keeps repeated timeouts unknown and opens remediation when the status retry budget is exhausted', async () => {
    const { job, tx, provider, config } = harness();
    config.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'CFDI_MAX_RETRIES' ? 3 : fallback,
    );
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([
      {
        ...candidate(),
        invoice: {
          ...candidate().invoice,
          fiscalOperationAttempts: [{ attemptNumber: 3 }],
        },
      },
    ]);
    provider.getStatus.mockRejectedValueOnce(
      new FiscalProviderError(
        'FISCAL_PROVIDER_TIMEOUT',
        'STATUS',
        'recovery-correlation-1',
        null,
        true,
      ),
    );

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({ stillUnknown: 1 });
    expect(tx.billingDataRemediation.upsert).toHaveBeenCalled();
    expect(provider).not.toHaveProperty('stamp');
  });

  it('records a bounded not-found retry policy without issuing a second stamp concurrently', async () => {
    const { job, tx, provider, config } = harness();
    config.get.mockImplementation((key: string, fallback?: unknown) =>
      key === 'CFDI_MAX_RETRIES' ? 1 : fallback,
    );
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([
      {
        ...candidate(),
        invoice: {
          ...candidate().invoice,
          fiscalOperationAttempts: [{ attemptNumber: 1 }],
        },
      },
    ]);
    provider.getStatus.mockRejectedValueOnce(
      new FiscalProviderError(
        'FISCAL_PROVIDER_NOT_FOUND',
        'STATUS',
        'recovery-correlation-1',
        404,
        false,
      ),
    );

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({
      notFound: 1,
    });
    expect(provider).not.toHaveProperty('stamp');
    expect(tx.billingDataRemediation.upsert).toHaveBeenCalled();
  });

  it('opens remediation and does not stamp when XML UUID disagrees with provider status', async () => {
    const { job, tx, provider } = harness();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([candidate()]);
    provider.getStatus.mockResolvedValueOnce(status());
    provider.getXml.mockResolvedValueOnce(
      xmlContent('00000000-0000-4000-8000-000000000000'),
    );

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({
      stillUnknown: 1,
    });
    expect(tx.billingDataRemediation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code_entityType_entityId: expect.any(Object),
        }),
      }),
    );
    expect(tx.invoice.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fiscalStatus: 'STAMPED' }),
      }),
    );
  });

  it('rejects provider XML containing DTD or external entity declarations', async () => {
    const { job, tx, provider } = harness();
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ acquired: true }]);
    tx.fiscalOperationAttempt.findMany.mockResolvedValueOnce([candidate()]);
    provider.getStatus.mockResolvedValueOnce(status());
    provider.getXml.mockResolvedValueOnce(
      xmlContent(
        uuid,
        '<!DOCTYPE cfdi [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
      ),
    );

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).resolves.toMatchObject({ stillUnknown: 1, recovered: 0 });
    expect(tx.billingDataRemediation.upsert).toHaveBeenCalled();
    expect(tx.invoice.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fiscalStatus: 'STAMPED' }),
      }),
    );
  });

  it('never logs raw unexpected error stacks containing credentials or tokens', async () => {
    const errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { job, tx } = harness();
    const failure = new Error(
      'Authorization: Bearer jwt-secret; password PAC=pac-secret',
    );
    tx.$queryRawUnsafe.mockRejectedValueOnce(failure);

    await expect(
      job.reconcile(new Date('2026-08-23T19:00:00.000Z')),
    ).rejects.toBe(failure);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain('jwt-secret');
    expect(logged).not.toContain('pac-secret');
    expect(logged).not.toContain('Authorization');
  });
});
