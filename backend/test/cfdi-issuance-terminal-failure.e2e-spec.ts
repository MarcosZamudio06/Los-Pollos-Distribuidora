import { Prisma, PrismaClient } from '@prisma/client';

import { PrismaService } from '../src/database/prisma.service';
import { CfdiIssuanceRepository } from '../src/modules/cfdi/cfdi-issuance.repository';
import { CfdiIssuanceService } from '../src/modules/cfdi/cfdi-issuance.service';
import { FiscalProviderError } from '../src/modules/cfdi/domain/fiscal-provider.port';
import { FakeFiscalProvider } from '../src/modules/cfdi/testing/fake-fiscal-provider';
import { assertDisposableE2eEnvironment } from './e2e-environment';
import { seedFixture } from './fixtures/cfdi-reconciliation.fixture';

const CERTIFICATE_SERIAL = '30001000000500003416';

describe('CFDI terminal STAMP failure integrity (e2e)', () => {
  let prisma: PrismaClient | undefined;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.E2E_DATABASE_URL } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('commits FAILED while preserving ACTIVE invoice applications and totals', async () => {
    const fixture = await seedFixture(prisma!, {
      sandbox: {
        issuer: {
          taxId: 'TFA010101AAA',
          legalName: 'TERMINAL FAILURE ISSUER',
          fiscalPostalCode: '64000',
          fiscalRegime: '601',
        },
        receiver: {
          taxId: 'TFR010101AA1',
          fiscalName: 'TERMINAL FAILURE RECEIVER',
          fiscalPostalCode: '64000',
          fiscalRegime: '601',
          fiscalUseCode: 'G03',
        },
        certificateSerial: CERTIFICATE_SERIAL,
      },
    });
    const prepared = fixture.prepared!;
    const repository = new CfdiIssuanceRepository(
      prisma as unknown as PrismaService,
      undefined as never,
    );
    const preparation = jest
      .spyOn(repository, 'prepare')
      .mockResolvedValueOnce(prepared);
    const provider = new FakeFiscalProvider({
      stamp: (command) => {
        throw new FiscalProviderError(
          'FISCAL_PROVIDER_VALIDATION',
          'STAMP',
          command.correlationId,
          422,
          false,
        );
      },
    });
    const service = new CfdiIssuanceService(repository, provider);

    try {
      await expect(
        service.issue(
          fixture.billingRequestId,
          {
            expectedVersion: 1,
            cfdiUse: 'G03',
            paymentMethod: 'PUE',
            paymentForm: '01',
            exportCode: '01',
          },
          { id: prepared.actorUserId, role: 'ADMIN' },
          prepared.idempotencyKey,
        ),
      ).resolves.toMatchObject({
        fiscalStatus: 'FAILED',
        operationStatus: 'TERMINAL_FAILURE',
      });
    } finally {
      preparation.mockRestore();
    }

    const invoice = await prisma!.invoice.findUniqueOrThrow({
      where: { id: fixture.invoiceId },
      include: {
        documents: { include: { itemApplications: true } },
      },
    });
    const attempt = await prisma!.fiscalOperationAttempt.findUniqueOrThrow({
      where: { id: fixture.stampAttemptId },
    });
    const activeDocuments = invoice.documents.filter(
      (document) => document.reversedAt === null,
    );
    const activeItemApplications = activeDocuments.flatMap((document) =>
      document.itemApplications.filter(
        (application) => application.reversedAt === null,
      ),
    );
    const appliedSubtotal = activeDocuments.reduce(
      (total, document) => total.plus(document.subtotalApplied),
      new Prisma.Decimal(0),
    );
    const appliedTax = activeDocuments.reduce(
      (total, document) => total.plus(document.taxApplied),
      new Prisma.Decimal(0),
    );
    const appliedTotal = activeDocuments.reduce(
      (total, document) => total.plus(document.totalApplied),
      new Prisma.Decimal(0),
    );

    expect(invoice).toMatchObject({
      status: 'ACTIVE',
      fiscalStatus: 'FAILED',
      lastFiscalErrorCode: 'FISCAL_PROVIDER_VALIDATION',
      lastFiscalErrorMessage: 'FISCAL_PROVIDER_VALIDATION',
    });
    expect(attempt).toMatchObject({
      status: 'TERMINAL_FAILURE',
      httpStatus: 422,
      errorCode: 'FISCAL_PROVIDER_VALIDATION',
      errorMessage: 'FISCAL_PROVIDER_VALIDATION',
    });
    expect(activeDocuments).toHaveLength(1);
    expect(activeDocuments[0]?.reversedAt).toBeNull();
    expect(activeItemApplications).toHaveLength(1);
    expect(activeItemApplications[0]?.reversedAt).toBeNull();
    expect(
      appliedSubtotal.equals(invoice.subtotal.minus(invoice.discount)),
    ).toBe(true);
    expect(appliedTax.equals(invoice.tax)).toBe(true);
    expect(appliedTotal.equals(invoice.total)).toBe(true);
    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(1);
  });
});
