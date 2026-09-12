import {
  FiscalOperationStatus,
  FiscalOperationType,
  InvoiceFiscalStatus,
  PaymentInvoiceApplicationStatus,
  PrismaClient,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../src/database/prisma.service';
import {
  FiscalProviderError,
  type FiscalArtifactContent,
  type FiscalProviderPort,
  type FiscalStatusResponse,
} from '../src/modules/cfdi/domain/fiscal-provider.port';
import { FiscalArtifactService } from '../src/modules/cfdi/fiscal-artifact.service';
import { StampReconciliationJob } from '../src/modules/cfdi/stamp-reconciliation.job';
import { assertDisposableE2eEnvironment } from './e2e-environment';
import {
  seedFixture,
  type Fixture,
} from './fixtures/cfdi-reconciliation.fixture';

jest.setTimeout(30_000);

const LOCK_ID = 71823043;
const STAMPED_UUID = 'A8098C1A-F86E-11DA-BD1A-00112444BE1E';
const MISMATCHED_UUID = '00000000-0000-4000-8000-000000000000';
const STAMPED_AT = '2026-08-30T18:00:01.000Z';
const CERTIFICATE_SERIAL = '30001000000500003416';

type ProviderDouble = jest.Mocked<FiscalProviderPort>;

describe('CFDI STAMP reconciliation PostgreSQL (e2e)', () => {
  let fixtureClient: PrismaClient | undefined;
  let firstJobClient: PrismaClient | undefined;
  let secondJobClient: PrismaClient | undefined;
  let blockerClient: PrismaClient | undefined;
  let observerClient: PrismaClient | undefined;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    fixtureClient = createE2eClient();
    firstJobClient = createE2eClient();
    secondJobClient = createE2eClient();
    blockerClient = createE2eClient();
    observerClient = createE2eClient();
    await Promise.all(
      [
        fixtureClient,
        firstJobClient,
        secondJobClient,
        blockerClient,
        observerClient,
      ].map((client) => client.$connect()),
    );
  });

  afterAll(async () => {
    await Promise.all(
      [
        fixtureClient,
        firstJobClient,
        secondJobClient,
        blockerClient,
        observerClient,
      ].map((client) => (client ? client.$disconnect() : Promise.resolve())),
    );
  });

  it('uses two independent PostgreSQL sessions to claim once and never STAMP again', async () => {
    const fixture = await seedFixture(fixtureClient!, {
      priorRecoveryAttempts: 0,
    });
    const provider = createProvider();
    provider.getStatus.mockRejectedValueOnce(
      new FiscalProviderError(
        'FISCAL_PROVIDER_TIMEOUT',
        'STATUS',
        `${fixture.marker}:recovery`,
        null,
        true,
      ),
    );
    const config = createConfig();
    const jobA = createJob(firstJobClient!, provider, config);
    const jobB = createJob(secondJobClient!, provider, config);

    // The blocker holds the original STAMP row. Job A must first acquire the
    // real transaction-scoped advisory lock and then wait on that row. The
    // observer reads pg_locks from a separate session before Job B starts, so
    // Job B's false result is PostgreSQL contention, not a mocked boolean or a
    // Promise.all timing assumption.
    let releaseBlocker!: () => void;
    let announceBlockerReady!: () => void;
    const blockerReady = new Promise<void>((resolve) => {
      announceBlockerReady = resolve;
    });
    const blockerRelease = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const blockerTransaction = blockerClient!.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "FiscalOperationAttempt"
        WHERE "id" = ${fixture.stampAttemptId}
        FOR UPDATE
      `;
      announceBlockerReady();
      await blockerRelease;
    });
    await blockerReady;

    const jobAPromise = jobA.reconcile(new Date('2026-08-30T19:00:00.000Z'));
    const jobBPromise = (async () => {
      await waitForAdvisoryLock(observerClient!);
      return jobB.reconcile(new Date('2026-08-30T19:00:00.000Z'));
    })();
    const concurrentResults = Promise.all([jobAPromise, jobBPromise]);

    try {
      const secondResult = await jobBPromise;
      releaseBlocker();
      const [firstResult, repeatedSecondResult] = await concurrentResults;

      expect(firstResult).toMatchObject({
        skipped: false,
        started: 1,
        stillUnknown: 1,
      });
      expect(secondResult).toMatchObject({
        skipped: true,
        started: 0,
      });
      expect(repeatedSecondResult).toEqual(secondResult);
      expect(provider.getStatus.mock.calls).toHaveLength(1);
      expect(provider.stamp.mock.calls).toHaveLength(0);

      const state = await readState(fixtureClient!, fixture);
      expect(state.invoice).toMatchObject({
        fiscalStatus: InvoiceFiscalStatus.UNKNOWN,
        uuid: null,
      });
      expect(state.stampAttempts).toHaveLength(1);
      expect(state.stampAttempts[0]).toMatchObject({
        status: FiscalOperationStatus.UNKNOWN,
      });
      expect(state.recoveryAttempts).toHaveLength(1);
      expect(state.recoveryAttempts[0]).toMatchObject({
        status: FiscalOperationStatus.UNKNOWN,
      });
      await expectSingleInvoiceAndStamp(fixtureClient!, fixture);
    } finally {
      releaseBlocker();
      await blockerTransaction.catch(() => undefined);
      await jobAPromise.catch(() => undefined);
      await jobBPromise.catch(() => undefined);
    }
  });

  it('persists one successful recovery, TFD metadata, and effective fiscal applications', async () => {
    const fixture = await seedFixture(fixtureClient!, {
      includePaymentApplication: true,
    });
    const provider = createProvider();
    provider.getStatus.mockResolvedValueOnce(
      statusResponse(fixture.providerReference, fixture.recoveryUuid),
    );
    provider.getXml.mockResolvedValueOnce(
      xmlArtifact(fixture.providerReference, fixture.recoveryUuid),
    );
    provider.getPdf.mockResolvedValueOnce(
      pdfArtifact(fixture.providerReference),
    );
    const artifacts = {
      persistStampedArtifacts: jest.fn().mockResolvedValue({
        XML: 'AVAILABLE',
        PDF: 'AVAILABLE',
      }),
    };
    const logs = silenceLogger();

    try {
      const job = createJob(
        firstJobClient!,
        provider,
        createConfig(),
        artifacts,
      );
      await expect(
        job.reconcile(new Date('2026-08-30T19:00:00.000Z')),
      ).resolves.toMatchObject({
        skipped: false,
        started: 1,
        recovered: 1,
      });

      expect(provider.getStatus.mock.calls).toHaveLength(1);
      expect(provider.getXml.mock.calls).toHaveLength(1);
      expect(provider.getPdf.mock.calls).toHaveLength(1);
      expect(provider.stamp.mock.calls).toHaveLength(0);
      expect(artifacts.persistStampedArtifacts).toHaveBeenCalledWith(
        fixture.invoiceId,
        expect.objectContaining({
          outcome: 'STAMPED',
          uuid: fixture.recoveryUuid,
        }),
        expect.objectContaining({
          XML: expect.objectContaining({ artifactType: 'XML' }),
          PDF: expect.objectContaining({ artifactType: 'PDF' }),
        }),
      );

      const state = await readState(fixtureClient!, fixture);
      expect(state.invoice).toMatchObject({
        fiscalStatus: InvoiceFiscalStatus.STAMPED,
        uuid: fixture.recoveryUuid,
        tfdVersion: '1.1',
        certificateNumber: CERTIFICATE_SERIAL,
        satCertificateNumber: 'SAT-CERT-0001',
        certificationProviderTaxId: 'PAC010101AAA',
        cfdiSeal: 'CFDI-SEAL-RECOVERED',
        satSeal: 'SAT-SEAL-RECOVERED',
      });
      expect(state.invoice.stampedAt).toEqual(new Date(STAMPED_AT));
      expect(state.stampAttempts).toHaveLength(1);
      expect(state.stampAttempts[0]).toMatchObject({
        status: FiscalOperationStatus.SUCCEEDED,
        providerReference: fixture.providerReference,
      });
      expect(state.recoveryAttempts).toHaveLength(1);
      expect(state.recoveryAttempts[0]).toMatchObject({
        status: FiscalOperationStatus.SUCCEEDED,
        providerReference: fixture.providerReference,
      });
      expect(state.applications).toHaveLength(1);
      expect(state.applications[0].status).toBe(
        PaymentInvoiceApplicationStatus.EFFECTIVE,
      );
      expect(state.remediations).toHaveLength(0);
      await expectSingleInvoiceAndStamp(fixtureClient!, fixture);

      const logged = JSON.stringify(logs.flatMap((spy) => spy.mock.calls));
      expect(logged).not.toContain('<tfd:TimbreFiscalDigital');
      expect(logged).not.toContain('secret-pdf-marker');
      expect(logged).not.toContain('Authorization');
      expect(logged).not.toContain('Bearer');
      expect(logged).not.toContain('pac-secret');
    } finally {
      restoreLogger(logs);
    }
  });

  it('keeps UNKNOWN after a status timeout and schedules the next bounded recovery', async () => {
    const fixture = await seedFixture(fixtureClient!);
    const provider = createProvider();
    provider.getStatus.mockRejectedValueOnce(
      new FiscalProviderError(
        'FISCAL_PROVIDER_TIMEOUT',
        'STATUS',
        `${fixture.marker}:recovery`,
        null,
        true,
      ),
    );

    await expect(
      createJob(firstJobClient!, provider, createConfig()).reconcile(
        new Date('2026-08-30T19:00:00.000Z'),
      ),
    ).resolves.toMatchObject({
      skipped: false,
      started: 1,
      stillUnknown: 1,
    });

    expect(provider.getStatus.mock.calls).toHaveLength(1);
    expect(provider.stamp.mock.calls).toHaveLength(0);
    expect(provider.getXml.mock.calls).toHaveLength(0);
    expect(provider.getPdf.mock.calls).toHaveLength(0);
    const state = await readState(fixtureClient!, fixture);
    expect(state.invoice).toMatchObject({
      fiscalStatus: InvoiceFiscalStatus.UNKNOWN,
      uuid: null,
      lastFiscalErrorCode: 'FISCAL_PROVIDER_TIMEOUT',
    });
    expect(state.stampAttempts[0]).toMatchObject({
      status: FiscalOperationStatus.UNKNOWN,
      nextRetryAt: expect.any(Date),
    });
    expect(state.recoveryAttempts[0]).toMatchObject({
      status: FiscalOperationStatus.UNKNOWN,
      nextRetryAt: expect.any(Date),
    });
    expect(state.remediations).toHaveLength(0);
    await expectSingleInvoiceAndStamp(fixtureClient!, fixture);
  });

  it('keeps NOT_FOUND UNKNOWN and opens remediation only after the bounded recovery budget', async () => {
    const fixture = await seedFixture(fixtureClient!, {
      priorRecoveryAttempts: 3,
    });
    const provider = createProvider();
    provider.getStatus.mockRejectedValueOnce(
      new FiscalProviderError(
        'FISCAL_PROVIDER_NOT_FOUND',
        'STATUS',
        `${fixture.marker}:recovery`,
        404,
        false,
      ),
    );

    await expect(
      createJob(
        firstJobClient!,
        provider,
        createConfig({ maxRetries: 3 }),
      ).reconcile(new Date('2026-08-30T19:00:00.000Z')),
    ).resolves.toMatchObject({
      skipped: false,
      started: 1,
      notFound: 1,
    });

    expect(provider.getStatus.mock.calls).toHaveLength(1);
    expect(provider.stamp.mock.calls).toHaveLength(0);
    const state = await readState(fixtureClient!, fixture);
    expect(state.invoice).toMatchObject({
      fiscalStatus: InvoiceFiscalStatus.UNKNOWN,
      uuid: null,
      lastFiscalErrorCode: 'FISCAL_PROVIDER_NOT_FOUND',
    });
    expect(state.recoveryAttempts).toHaveLength(4);
    expect(state.recoveryAttempts.at(-1)).toMatchObject({
      status: FiscalOperationStatus.SUCCEEDED,
      errorCode: 'FISCAL_PROVIDER_NOT_FOUND',
    });
    expect(state.remediations).toHaveLength(1);
    expect(state.remediations[0].code).toBe(
      'CFDI_STAMP_RECONCILIATION_INCONSISTENT',
    );
    await expectSingleInvoiceAndStamp(fixtureClient!, fixture);
  });

  it('stops at CFDI_MAX_RETRIES for repeated timeouts without an infinite RECOVERY loop', async () => {
    const fixture = await seedFixture(fixtureClient!, {
      priorRecoveryAttempts: 3,
    });
    const provider = createProvider();
    provider.getStatus.mockRejectedValueOnce(
      new FiscalProviderError(
        'FISCAL_PROVIDER_TIMEOUT',
        'STATUS',
        `${fixture.marker}:recovery`,
        null,
        true,
      ),
    );

    const now = new Date('2026-08-30T19:00:00.000Z');
    const job = createJob(
      firstJobClient!,
      provider,
      createConfig({ maxRetries: 3 }),
    );
    await expect(job.reconcile(now)).resolves.toMatchObject({
      skipped: false,
      started: 1,
      stillUnknown: 1,
    });

    expect(provider.getStatus.mock.calls).toHaveLength(1);
    expect(provider.stamp.mock.calls).toHaveLength(0);
    const state = await readState(fixtureClient!, fixture);
    expect(state.invoice).toMatchObject({
      fiscalStatus: InvoiceFiscalStatus.UNKNOWN,
      uuid: null,
      lastFiscalErrorCode: 'FISCAL_PROVIDER_TIMEOUT',
    });
    expect(state.recoveryAttempts).toHaveLength(4);
    expect(state.recoveryAttempts.at(-1)).toMatchObject({
      status: FiscalOperationStatus.TERMINAL_FAILURE,
      errorCode: 'FISCAL_PROVIDER_TIMEOUT',
    });
    expect(state.remediations).toHaveLength(1);
    expect(state.remediations[0].code).toBe(
      'CFDI_STAMP_RECONCILIATION_INCONSISTENT',
    );
    await expect(job.reconcile(now)).resolves.toMatchObject({
      skipped: false,
      started: 0,
    });
    expect(provider.getStatus.mock.calls).toHaveLength(1);
    expect(provider.stamp.mock.calls).toHaveLength(0);
    const terminalState = await readState(fixtureClient!, fixture);
    expect(terminalState.recoveryAttempts).toHaveLength(4);
    expect(terminalState.remediations).toHaveLength(1);
    expect(terminalState.auditLogs).toHaveLength(state.auditLogs.length);
    await expectSingleInvoiceAndStamp(fixtureClient!, fixture);
  });

  it('leaves UNKNOWN and remediates inconsistent status/XML UUID without a second STAMP', async () => {
    const fixture = await seedFixture(fixtureClient!);
    const provider = createProvider();
    provider.getStatus.mockResolvedValueOnce(
      statusResponse(fixture.providerReference, STAMPED_UUID),
    );
    provider.getXml.mockResolvedValueOnce(
      xmlArtifact(fixture.providerReference, MISMATCHED_UUID),
    );

    const now = new Date('2026-08-30T19:00:00.000Z');
    const job = createJob(firstJobClient!, provider, createConfig());
    await expect(job.reconcile(now)).resolves.toMatchObject({
      skipped: false,
      started: 1,
      stillUnknown: 1,
    });

    expect(provider.getStatus.mock.calls).toHaveLength(1);
    expect(provider.getXml.mock.calls).toHaveLength(1);
    expect(provider.getPdf.mock.calls).toHaveLength(0);
    expect(provider.stamp.mock.calls).toHaveLength(0);
    const state = await readState(fixtureClient!, fixture);
    expect(state.invoice).toMatchObject({
      fiscalStatus: InvoiceFiscalStatus.UNKNOWN,
      uuid: null,
      lastFiscalErrorCode: 'CFDI_RECONCILIATION_UUID_MISMATCH',
    });
    expect(state.stampAttempts[0]).toMatchObject({
      status: FiscalOperationStatus.UNKNOWN,
    });
    expect(state.recoveryAttempts[0]).toMatchObject({
      status: FiscalOperationStatus.TERMINAL_FAILURE,
      errorCode: 'CFDI_RECONCILIATION_UUID_MISMATCH',
    });
    expect(state.remediations).toHaveLength(1);
    expect(state.remediations[0].code).toBe(
      'CFDI_RECONCILIATION_UUID_MISMATCH',
    );
    await expect(job.reconcile(now)).resolves.toMatchObject({
      skipped: false,
      started: 0,
    });
    expect(provider.getStatus.mock.calls).toHaveLength(1);
    expect(provider.stamp.mock.calls).toHaveLength(0);
    const terminalState = await readState(fixtureClient!, fixture);
    expect(terminalState.recoveryAttempts).toHaveLength(1);
    expect(terminalState.remediations).toHaveLength(1);
    expect(terminalState.auditLogs).toHaveLength(state.auditLogs.length);
    await expectSingleInvoiceAndStamp(fixtureClient!, fixture);
  });
});

function createE2eClient(): PrismaClient {
  const url = process.env.E2E_DATABASE_URL?.trim();
  if (!url) throw new Error('E2E_DATABASE_URL is required');
  return new PrismaClient({ datasources: { db: { url } } });
}

function createProvider(): ProviderDouble {
  return {
    providerKey: 'FACTURAMA',
    capabilities: { providerSideIdempotency: false },
    stamp: jest.fn(),
    cancel: jest.fn(),
    getStatus: jest.fn(),
    getXml: jest.fn(),
    getPdf: jest.fn(),
    getCancellationStatus: jest.fn(),
  } as unknown as ProviderDouble;
}

function createConfig(overrides: { maxRetries?: number } = {}): ConfigService {
  return {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'CFDI_MAX_RETRIES' && overrides.maxRetries !== undefined
        ? overrides.maxRetries
        : fallback,
    ),
  } as unknown as ConfigService;
}

function createJob(
  client: PrismaClient,
  provider: ProviderDouble,
  config: ConfigService,
  artifacts = {
    persistStampedArtifacts: jest.fn().mockResolvedValue({
      XML: 'AVAILABLE',
      PDF: 'FAILED',
    }),
  },
): StampReconciliationJob {
  return new StampReconciliationJob(
    client as unknown as PrismaService,
    provider as unknown as FiscalProviderPort,
    artifacts as unknown as FiscalArtifactService,
    config,
  );
}

function statusResponse(
  providerDocumentId: string,
  uuid: string,
): FiscalStatusResponse {
  return {
    correlationId: 'provider-status-correlation',
    provider: 'FACTURAMA',
    providerDocumentId,
    status: 'ACTIVE',
    uuid,
    issuedAt: '2026-08-30T18:00:00.000Z',
    cancelledAt: null,
  };
}

function xmlArtifact(
  providerDocumentId: string,
  uuid: string,
): FiscalArtifactContent {
  const xml = Buffer.from(
    `<cfdi:Comprobante><tfd:TimbreFiscalDigital UUID="${uuid}" FechaTimbrado="${STAMPED_AT}" NoCertificadoSAT="SAT-CERT-0001" RfcProvCertif="PAC010101AAA" SelloCFD="CFDI-SEAL-RECOVERED" SelloSAT="SAT-SEAL-RECOVERED" /></cfdi:Comprobante>`,
  );
  return {
    correlationId: 'provider-xml-correlation',
    provider: 'FACTURAMA',
    providerDocumentId,
    artifactType: 'XML',
    contentType: 'application/xml',
    content: xml,
    sha256: createHash('sha256').update(xml).digest('hex'),
  };
}

function pdfArtifact(providerDocumentId: string): FiscalArtifactContent {
  const pdf = Buffer.from('%PDF-1.4\\nsecret-pdf-marker');
  return {
    correlationId: 'provider-pdf-correlation',
    provider: 'FACTURAMA',
    providerDocumentId,
    artifactType: 'PDF',
    contentType: 'application/pdf',
    content: pdf,
    sha256: createHash('sha256').update(pdf).digest('hex'),
  };
}

async function waitForAdvisoryLock(client: PrismaClient): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const rows = await client.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND granted = true
        AND (objid::bigint = ${LOCK_ID} OR classid::bigint = ${LOCK_ID})
    `;
    if (Number(rows[0]?.count ?? 0) > 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for the reconciliation advisory lock');
}

async function readState(prisma: PrismaClient, fixture: Fixture) {
  const [
    invoice,
    stampAttempts,
    recoveryAttempts,
    remediations,
    applications,
    auditLogs,
  ] = await Promise.all([
    prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoiceId },
      select: {
        fiscalStatus: true,
        uuid: true,
        stampedAt: true,
        tfdVersion: true,
        certificateNumber: true,
        satCertificateNumber: true,
        certificationProviderTaxId: true,
        cfdiSeal: true,
        satSeal: true,
        lastFiscalErrorCode: true,
      },
    }),
    prisma.fiscalOperationAttempt.findMany({
      where: {
        invoiceId: fixture.invoiceId,
        operation: FiscalOperationType.STAMP,
      },
      orderBy: { attemptNumber: 'asc' },
    }),
    prisma.fiscalOperationAttempt.findMany({
      where: {
        invoiceId: fixture.invoiceId,
        operation: FiscalOperationType.RECOVERY,
      },
      orderBy: { attemptNumber: 'asc' },
    }),
    prisma.billingDataRemediation.findMany({
      where: { entityType: 'Invoice', entityId: fixture.invoiceId },
      orderBy: { createdAt: 'asc' },
    }),
    fixture.applicationId
      ? prisma.paymentInvoiceApplication.findMany({
          where: { id: fixture.applicationId },
          select: { status: true },
        })
      : Promise.resolve([]),
    prisma.billingAuditLog.findMany({
      where: { entityType: 'Invoice', entityId: fixture.invoiceId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return {
    invoice,
    stampAttempts,
    recoveryAttempts,
    remediations,
    applications,
    auditLogs,
  };
}

async function expectSingleInvoiceAndStamp(
  prisma: PrismaClient,
  fixture: Fixture,
): Promise<void> {
  await expect(
    prisma.invoice.count({
      where: { sourceBillingRequestId: fixture.billingRequestId },
    }),
  ).resolves.toBe(1);
  await expect(
    prisma.fiscalOperationAttempt.count({
      where: {
        invoiceId: fixture.invoiceId,
        operation: FiscalOperationType.STAMP,
      },
    }),
  ).resolves.toBe(1);
}

function silenceLogger(): jest.SpyInstance[] {
  return [
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined),
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined),
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined),
  ];
}

function restoreLogger(spies: jest.SpyInstance[]): void {
  for (const spy of spies) spy.mockRestore();
}
