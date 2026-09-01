import {
  BillingRequestStatus,
  CostSnapshotSource,
  CreditStatus,
  CustomerType,
  OperationalLocationType,
  Prisma,
  PrismaClient,
  ProductPresentationType,
  ProductUnit,
  SaleChannel,
  SaleDocumentStatus,
  SaleDocumentType,
  SalePaymentType,
  SaleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/database/prisma.service';
import { CfdiDocumentBuilder } from '../src/modules/cfdi/domain/cfdi-document-builder';
import { CfdiIssuanceRepository } from '../src/modules/cfdi/cfdi-issuance.repository';
import { CfdiIssuanceService } from '../src/modules/cfdi/cfdi-issuance.service';
import { CfdiValidationService } from '../src/modules/cfdi/cfdi-validation.service';
import { FakeFiscalProvider } from '../src/modules/cfdi/testing/fake-fiscal-provider';
import { assertDisposableE2eEnvironment } from './e2e-environment';

describe('CFDI issuance PostgreSQL concurrency (e2e)', () => {
  const fixtureRunId = randomUUID().replaceAll('-', '').toUpperCase();
  const marker = `cfdi-issue-${fixtureRunId}`;
  let prisma: PrismaClient;
  let service: CfdiIssuanceService;
  let provider: FakeFiscalProvider;
  let actorId: string;
  let billingRequestId: string;
  let saleDocumentId: string;
  let saleItemId: string;
  let customerId: string;
  let globalBillingRequestId: string;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    prisma = new PrismaClient();
    await prisma.$connect();

    const distributionCenter = await prisma.operationalLocation.create({
      data: {
        name: `${marker} distribution center`,
        code: `${marker}-cedis`,
        type: OperationalLocationType.DISTRIBUTION_CENTER,
      },
    });
    const location = await prisma.operationalLocation.create({
      data: {
        name: `${marker} branch`,
        code: marker,
        type: OperationalLocationType.BRANCH,
        parentId: distributionCenter.id,
      },
    });
    const role = await prisma.role.create({
      data: { name: `${marker}-admin` },
    });
    const actor = await prisma.user.create({
      data: {
        name: `${marker} actor`,
        email: `${marker}@example.test`,
        controlNumber: marker,
        phone: marker,
        passwordHash: 'not-used-in-repository-test',
        roleId: role.id,
        operationalLocationId: location.id,
      },
    });
    actorId = actor.id;

    const legalEntity = await createFixtureLegalEntity(prisma, fixtureRunId);
    const customer = await prisma.customer.create({
      data: {
        customerNumber: marker,
        name: `${marker} customer`,
        customerType: CustomerType.RETAIL,
        creditStatus: CreditStatus.ACTIVE,
        requiresBilling: true,
        fiscalName: 'USUARIO DE PRUEBA SA DE CV',
        taxId: 'URE180429TM6',
        fiscalPostalCode: '64000',
        fiscalRegime: '601',
        fiscalUseCode: 'G03',
        billingEmail: `${marker}-billing@example.test`,
      },
    });
    customerId = customer.id;
    const product = await prisma.product.create({
      data: {
        name: `${marker} product`,
        sku: marker,
        presentationType: ProductPresentationType.KG,
        salePrice: new Prisma.Decimal(10),
        purchaseCost: new Prisma.Decimal(7),
        unit: ProductUnit.KG,
        satProductServiceCode: '50111500',
        satUnitCode: 'KGM',
        taxObjectCode: '02',
        defaultTaxCode: '002',
        defaultFactorType: 'Tasa',
        defaultRateOrQuota: new Prisma.Decimal('0.16'),
      },
    });
    const sale = await prisma.sale.create({
      data: {
        saleNumber: marker,
        customerId: customer.id,
        userId: actor.id,
        locationId: location.id,
        legalEntityId: legalEntity.id,
        saleChannel: SaleChannel.COUNTER,
        documentType: SaleDocumentType.SIMPLE_NOTE,
        currencyCode: 'MXN',
        subtotal: new Prisma.Decimal(100),
        discount: new Prisma.Decimal(0),
        tax: new Prisma.Decimal(16),
        total: new Prisma.Decimal(116),
        paymentType: SalePaymentType.CASH_SALE,
        status: SaleStatus.CONFIRMED,
      },
    });
    const item = await prisma.saleItem.create({
      data: {
        saleId: sale.id,
        productId: product.id,
        quantity: new Prisma.Decimal(10),
        quantityKg: new Prisma.Decimal(10),
        unit: ProductUnit.KG,
        unitPrice: new Prisma.Decimal(10),
        productNameSnapshot: product.name,
        productSkuSnapshot: product.sku,
        unitPriceSnapshot: new Prisma.Decimal(10),
        quantitySnapshot: new Prisma.Decimal(10),
        subtotal: new Prisma.Decimal(100),
        discount: new Prisma.Decimal(0),
        taxableBase: new Prisma.Decimal(100),
        tax: new Prisma.Decimal(16),
        total: new Prisma.Decimal(116),
        unitCostSnapshot: new Prisma.Decimal(7),
        costSubtotalSnapshot: new Prisma.Decimal(70),
        costSnapshotSource: CostSnapshotSource.SALE_CONFIRMATION,
      },
    });
    saleItemId = item.id;
    const document = await prisma.saleDocument.create({
      data: {
        saleId: sale.id,
        documentType: SaleDocumentType.SIMPLE_NOTE,
        operationalLocationId: location.id,
        status: SaleDocumentStatus.ISSUED,
      },
    });
    saleDocumentId = document.id;
    billingRequestId = await createApprovedRequest(prisma, {
      marker,
      customerId: customer.id,
      actorId: actor.id,
      saleId: sale.id,
      saleDocumentId: document.id,
      saleItemId: item.id,
    });

    const prismaService = prisma as unknown as PrismaService;
    const validation = new CfdiValidationService(
      prismaService,
      new CfdiDocumentBuilder(),
    );
    const repository = new CfdiIssuanceRepository(prismaService, validation);
    provider = new FakeFiscalProvider({
      stamp: async (command) => {
        await new Promise((resolve) => setTimeout(resolve, 75));
        return new FakeFiscalProvider().stamp(command);
      },
    });
    service = new CfdiIssuanceService(repository, provider);

    globalBillingRequestId = await createGlobalApprovedRequest(prisma, {
      marker: `${marker}-global`,
      actorId,
      locationId: location.id,
      legalEntityId: legalEntity.id,
      productId: product.id,
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('rejects an incompatible receiver combination before provider or fiscal persistence', async () => {
    const beforeStampCalls = provider.calls.filter(
      (call) => call.operation === 'stamp',
    ).length;
    const payload = {
      expectedVersion: 1,
      cfdiUse: 'D01',
      paymentMethod: 'PUE',
      paymentForm: '01',
      exportCode: '01',
    };

    await expect(
      service.issue(
        billingRequestId,
        payload,
        { id: actorId, role: 'ADMIN' },
        `${marker}:incompatible`,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CFDI_USE_REGIME_INCOMPATIBLE',
        cfdiUse: 'D01',
        fiscalRegime: '601',
        receiverPersonType: 'moral',
      }),
    });

    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(beforeStampCalls);
    await expect(
      prisma.invoice.count({
        where: { sourceBillingRequestId: billingRequestId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.fiscalOperationAttempt.count({
        where: { invoice: { sourceBillingRequestId: billingRequestId } },
      }),
    ).resolves.toBe(0);
  });

  it('dispatches at most one effective STAMP for two concurrent keys', async () => {
    const payload = {
      expectedVersion: 1,
      cfdiUse: 'G03',
      paymentMethod: 'PUE',
      paymentForm: '01',
      exportCode: '01',
    };

    const results = await Promise.allSettled([
      service.issue(
        billingRequestId,
        payload,
        { id: actorId, role: 'ADMIN' },
        `${marker}:stamp-a`,
      ),
      service.issue(
        billingRequestId,
        payload,
        { id: actorId, role: 'ADMIN' },
        `${marker}:stamp-b`,
      ),
    ]);

    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.invoice.count({
        where: { sourceBillingRequestId: billingRequestId },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.fiscalOperationAttempt.count({
        where: { invoice: { sourceBillingRequestId: billingRequestId } },
      }),
    ).resolves.toBe(1);
  });

  it('prevents another request after the document is fully invoiced', async () => {
    const existingSale = await prisma.saleDocument.findUniqueOrThrow({
      where: { id: saleDocumentId },
      select: { saleId: true },
    });
    await expect(
      createApprovedRequest(prisma, {
        marker: `${marker}-second`,
        customerId,
        actorId,
        saleId: existingSale.saleId,
        saleDocumentId,
        saleItemId,
      }),
    ).rejects.toThrow('OVER_REQUESTED');
    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(1);
  });

  it('persists one explicit global snapshot and dispatches one stamp across concurrent keys', async () => {
    const beforeCalls = provider.calls.filter(
      (call) => call.operation === 'stamp',
    ).length;
    const payload = {
      expectedVersion: 1,
      cfdiUse: 'S01',
      paymentMethod: 'PUE',
      paymentForm: '01',
      exportCode: '01',
      globalInformation: {
        periodicity: '04' as const,
        months: '08' as const,
        year: 2026,
      },
    };

    const results = await Promise.allSettled([
      service.issue(
        globalBillingRequestId,
        payload,
        { id: actorId, role: 'ADMIN' },
        `${marker}:global-a`,
      ),
      service.issue(
        globalBillingRequestId,
        payload,
        { id: actorId, role: 'ADMIN' },
        `${marker}:global-b`,
      ),
    ]);

    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(beforeCalls + 1);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { sourceBillingRequestId: globalBillingRequestId },
      select: {
        globalInformationSnapshot: true,
        receiverSnapshot: true,
        paymentMethodCode: true,
        exportCode: true,
      },
    });
    expect(stored).toMatchObject({
      globalInformationSnapshot: {
        periodicity: '04',
        months: '08',
        year: 2026,
      },
      receiverSnapshot: {
        taxId: 'XAXX010101000',
        fiscalName: 'PUBLICO EN GENERAL',
        fiscalRegime: '616',
        fiscalUseCode: 'S01',
        fiscalPostalCode: '64000',
      },
      paymentMethodCode: 'PUE',
      exportCode: '01',
    });
  });
});

async function createGlobalApprovedRequest(
  prisma: PrismaClient,
  input: {
    marker: string;
    actorId: string;
    locationId: string;
    legalEntityId: string;
    productId: string;
  },
): Promise<string> {
  const customer = await prisma.customer.create({
    data: {
      customerNumber: input.marker,
      name: 'Público en general',
      customerType: CustomerType.RETAIL,
      creditStatus: CreditStatus.ACTIVE,
      requiresBilling: true,
      fiscalName: 'PUBLICO EN GENERAL',
      taxId: 'XAXX010101000',
      fiscalPostalCode: '64000',
      fiscalRegime: '616',
      fiscalUseCode: 'S01',
      billingEmail: `${input.marker}@example.test`,
    },
  });
  const sale = await prisma.sale.create({
    data: {
      saleNumber: input.marker,
      customerId: customer.id,
      userId: input.actorId,
      locationId: input.locationId,
      legalEntityId: input.legalEntityId,
      saleChannel: SaleChannel.COUNTER,
      documentType: SaleDocumentType.SIMPLE_NOTE,
      currencyCode: 'MXN',
      businessDate: new Date('2026-08-20T00:00:00.000Z'),
      subtotal: new Prisma.Decimal(100),
      discount: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(16),
      total: new Prisma.Decimal(116),
      paymentType: SalePaymentType.CASH_SALE,
      status: SaleStatus.CONFIRMED,
    },
  });
  const item = await prisma.saleItem.create({
    data: {
      saleId: sale.id,
      productId: input.productId,
      quantity: new Prisma.Decimal(10),
      quantityKg: new Prisma.Decimal(10),
      unit: ProductUnit.KG,
      unitPrice: new Prisma.Decimal(10),
      productNameSnapshot: 'Global product',
      unitPriceSnapshot: new Prisma.Decimal(10),
      quantitySnapshot: new Prisma.Decimal(10),
      subtotal: new Prisma.Decimal(100),
      discount: new Prisma.Decimal(0),
      taxableBase: new Prisma.Decimal(100),
      tax: new Prisma.Decimal(16),
      total: new Prisma.Decimal(116),
      unitCostSnapshot: new Prisma.Decimal(7),
      costSubtotalSnapshot: new Prisma.Decimal(70),
      costSnapshotSource: CostSnapshotSource.SALE_CONFIRMATION,
    },
  });
  const document = await prisma.saleDocument.create({
    data: {
      saleId: sale.id,
      documentType: SaleDocumentType.SIMPLE_NOTE,
      operationalLocationId: input.locationId,
      status: SaleDocumentStatus.ISSUED,
    },
  });
  return createApprovedRequest(prisma, {
    marker: input.marker,
    customerId: customer.id,
    actorId: input.actorId,
    saleId: sale.id,
    saleDocumentId: document.id,
    saleItemId: item.id,
  });
}

const RFC_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const RFC_PREFIX_SPACE = 26n ** 3n;
const RFC_SUFFIX_SPACE = 36n ** 3n;

/**
 * Produces a structurally valid, deterministic RFC-shaped fixture value from
 * the per-run UUID. The bounded retry in createFixtureLegalEntity handles the
 * (extremely unlikely) collision with a previous disposable-database run.
 */
function fixtureLegalEntityTaxId(seed: string, attempt: number): string {
  const normalizedSeed = seed.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const seedValue = BigInt(`0x${normalizedSeed}`);
  const value =
    (seedValue + BigInt(attempt)) % (RFC_PREFIX_SPACE * RFC_SUFFIX_SPACE);
  const prefixValue = Number(value / RFC_SUFFIX_SPACE);
  const suffixValue = value % RFC_SUFFIX_SPACE;

  let prefix = '';
  let remainingPrefixValue = prefixValue;
  for (let index = 0; index < 3; index += 1) {
    prefix = `${RFC_LETTERS[remainingPrefixValue % 26]}${prefix}`;
    remainingPrefixValue = Math.floor(remainingPrefixValue / 26);
  }

  return `${prefix}010101${suffixValue.toString(36).toUpperCase().padStart(3, '0')}`;
}

function isTaxIdUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== 'P2002'
  ) {
    return false;
  }

  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.includes('taxId')
    : typeof target === 'string' && target.includes('taxId');
}

async function createFixtureLegalEntity(
  prisma: PrismaClient,
  fixtureRunId: string,
) {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    try {
      return await prisma.legalEntity.create({
        data: {
          legalName: 'EMPRESA DEMO SA DE CV',
          taxId: fixtureLegalEntityTaxId(fixtureRunId, attempt),
          fiscalPostalCode: '64000',
          fiscalRegime: '601',
          cfdiEnabled: true,
          defaultSeries: 'A',
          certificateSerialNumber: '30001000000500003416',
          certificateFingerprint: 'a'.repeat(64),
          certificateSubject: 'CN=EMPRESA DEMO SA DE CV',
          certificateValidFrom: new Date('2025-01-01T00:00:00.000Z'),
          certificateValidTo: new Date('2030-01-01T00:00:00.000Z'),
        },
      });
    } catch (error) {
      if (!isTaxIdUniqueViolation(error)) throw error;
    }
  }

  throw new Error(
    'Unable to allocate a unique RFC-shaped LegalEntity fixture after 128 attempts',
  );
}

async function createApprovedRequest(
  prisma: PrismaClient,
  input: {
    marker: string;
    customerId: string;
    actorId: string;
    saleId: string;
    saleDocumentId: string;
    saleItemId: string;
  },
): Promise<string> {
  const request = await prisma.billingRequest.create({
    data: {
      customerId: input.customerId,
      saleId: input.saleId,
      requestedByUserId: input.actorId,
      reviewedByUserId: input.actorId,
      reviewedAt: new Date(),
      status: BillingRequestStatus.APPROVED,
      reason: input.marker,
    },
  });
  const document = await prisma.billingRequestSaleDocument.create({
    data: {
      billingRequestId: request.id,
      saleDocumentId: input.saleDocumentId,
      requestedSubtotal: new Prisma.Decimal(100),
      requestedTax: new Prisma.Decimal(16),
      requestedTotal: new Prisma.Decimal(116),
      createdByUserId: input.actorId,
    },
  });
  await prisma.billingRequestSaleItem.create({
    data: {
      billingRequestSaleDocumentId: document.id,
      saleItemId: input.saleItemId,
      requestedSubtotal: new Prisma.Decimal(100),
      requestedTax: new Prisma.Decimal(16),
      requestedTotal: new Prisma.Decimal(116),
    },
  });
  return request.id;
}
