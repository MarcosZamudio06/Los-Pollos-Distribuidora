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
  const marker = `cfdi-issue-${randomUUID()}`;
  let prisma: PrismaClient;
  let service: CfdiIssuanceService;
  let provider: FakeFiscalProvider;
  let actorId: string;
  let billingRequestId: string;
  let saleDocumentId: string;
  let saleItemId: string;
  let customerId: string;

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

    const legalEntity = await prisma.legalEntity.create({
      data: {
        legalName: 'EMPRESA DEMO SA DE CV',
        taxId: 'AAA010101AAA',
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
    const customer = await prisma.customer.create({
      data: {
        customerNumber: marker,
        name: `${marker} customer`,
        customerType: CustomerType.RETAIL,
        creditStatus: CreditStatus.ACTIVE,
        requiresBilling: true,
        fiscalName: 'PUBLICO EN GENERAL',
        taxId: 'XAXX010101000',
        fiscalPostalCode: '64000',
        fiscalRegime: '616',
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
  });

  afterAll(async () => {
    await prisma?.$disconnect();
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
});

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
