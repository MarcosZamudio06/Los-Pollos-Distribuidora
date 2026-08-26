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
import { InvoiceCancellationService } from '../src/modules/billing/invoice-cancellation.service';
import { CfdiIssuanceRepository } from '../src/modules/cfdi/cfdi-issuance.repository';
import { CfdiIssuanceService } from '../src/modules/cfdi/cfdi-issuance.service';
import { CfdiValidationService } from '../src/modules/cfdi/cfdi-validation.service';
import { CfdiDocumentBuilder } from '../src/modules/cfdi/domain/cfdi-document-builder';
import { FakeFiscalProvider } from '../src/modules/cfdi/testing/fake-fiscal-provider';
import { assertDisposableE2eEnvironment } from './e2e-environment';

describe('CFDI cancellation PostgreSQL semantics (e2e)', () => {
  const marker = `cfdi-cancel-${randomUUID()}`;
  const actor = { id: '', role: 'ADMIN' as const };
  let prisma: PrismaClient;
  let issuance: CfdiIssuanceService;
  let customerId: string;
  let productId: string;
  let locationId: string;
  let legalEntityId: string;
  let sequence = 0;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    prisma = new PrismaClient();
    await prisma.$connect();

    const location = await prisma.operationalLocation.create({
      data: {
        name: `${marker} branch`,
        code: marker,
        type: OperationalLocationType.BRANCH,
      },
    });
    locationId = location.id;
    const role = await prisma.role.create({
      data: { name: `${marker}-admin` },
    });
    const user = await prisma.user.create({
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
    actor.id = user.id;
    const legalEntity = await prisma.legalEntity.create({
      data: {
        legalName: 'CFDI CANCELLATION TEST SA DE CV',
        taxId: 'AAA010101AAA',
        fiscalPostalCode: '64000',
        fiscalRegime: '601',
        cfdiEnabled: true,
        defaultSeries: `C${marker.slice(-4)}`,
        certificateSerialNumber: '30001000000500003416',
        certificateFingerprint: 'a'.repeat(64),
        certificateSubject: 'CN=CFDI CANCELLATION TEST',
        certificateValidFrom: new Date('2025-01-01T00:00:00.000Z'),
        certificateValidTo: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    legalEntityId = legalEntity.id;
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
    productId = product.id;

    const prismaService = prisma as unknown as PrismaService;
    issuance = new CfdiIssuanceService(
      new CfdiIssuanceRepository(
        prismaService,
        new CfdiValidationService(prismaService, new CfdiDocumentBuilder()),
      ),
      new FakeFiscalProvider(),
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('releases billable applications only after a confirmed cancellation', async () => {
    const issued = await createIssuedInvoice('success');
    const provider = new FakeFiscalProvider();
    const service = cancellationService(provider);

    await service.cancel(
      issued.invoiceId,
      cancellationDto(issued.version),
      actor,
      `${marker}:cancel-success`,
    );

    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: issued.invoiceId },
      include: { documents: { include: { itemApplications: true } } },
    });
    expect(stored.status).toBe('CANCELLED');
    expect(stored.cancellationStatus).toBe('ACCEPTED');
    expect(stored.uuid).toBe(issued.uuid);
    expect(stored.documents[0]?.reversedAt).not.toBeNull();
    expect(stored.documents[0]?.itemApplications[0]?.reversedAt).not.toBeNull();
  });

  it('keeps applications reserved while receptor acceptance is pending', async () => {
    const issued = await createIssuedInvoice('pending');
    const provider = new FakeFiscalProvider({
      cancel: (command) => ({
        correlationId: command.correlationId,
        provider: 'FACTURAMA',
        providerDocumentId: command.providerDocumentId,
        status: 'PENDING',
        uuid: command.uuid,
        requestedAt: new Date().toISOString(),
        cancelledAt: null,
      }),
    });

    await cancellationService(provider).cancel(
      issued.invoiceId,
      cancellationDto(issued.version),
      actor,
      `${marker}:cancel-pending`,
    );

    await expectCancellationState(issued.invoiceId, 'PENDING', false);
  });

  it('keeps applications reserved after provider rejection', async () => {
    const issued = await createIssuedInvoice('rejected');
    const provider = new FakeFiscalProvider({
      cancel: (command) => ({
        correlationId: command.correlationId,
        provider: 'FACTURAMA',
        providerDocumentId: command.providerDocumentId,
        status: 'REJECTED',
        uuid: command.uuid,
        requestedAt: new Date().toISOString(),
        cancelledAt: null,
      }),
    });

    await cancellationService(provider).cancel(
      issued.invoiceId,
      cancellationDto(issued.version),
      actor,
      `${marker}:cancel-rejected`,
    );

    await expectCancellationState(issued.invoiceId, 'REJECTED', false);
  });

  it('keeps applications reserved after an ambiguous timeout', async () => {
    const issued = await createIssuedInvoice('timeout');
    const provider = new FakeFiscalProvider({
      cancel: () =>
        Promise.reject(
          Object.assign(new Error('FISCAL_PROVIDER_TIMEOUT'), {
            code: 'FISCAL_PROVIDER_TIMEOUT',
            retryable: true,
          }),
        ),
    });

    await cancellationService(provider).cancel(
      issued.invoiceId,
      cancellationDto(issued.version),
      actor,
      `${marker}:cancel-timeout`,
    );

    await expectCancellationState(issued.invoiceId, 'UNKNOWN', false);
  });

  it('replays one key without dispatching a second cancellation', async () => {
    const issued = await createIssuedInvoice('replay');
    const provider = new FakeFiscalProvider();
    const service = cancellationService(provider);
    const dto = cancellationDto(issued.version);

    await service.cancel(
      issued.invoiceId,
      dto,
      actor,
      `${marker}:cancel-replay`,
    );
    const replay = await service.cancel(
      issued.invoiceId,
      dto,
      actor,
      `${marker}:cancel-replay`,
    );

    expect(replay.replayed).toBe(true);
    expect(
      provider.calls.filter((call) => call.operation === 'cancel'),
    ).toHaveLength(1);
  });

  it('allows at most one effective cancellation for concurrent keys', async () => {
    const issued = await createIssuedInvoice('concurrent');
    const provider = new FakeFiscalProvider({
      cancel: async (command) => {
        await new Promise((resolve) => setTimeout(resolve, 75));
        return {
          correlationId: command.correlationId,
          provider: 'FACTURAMA',
          providerDocumentId: command.providerDocumentId,
          status: 'CANCELLED',
          uuid: command.uuid,
          requestedAt: new Date().toISOString(),
          cancelledAt: new Date().toISOString(),
        };
      },
    });
    const service = cancellationService(provider);

    const results = await Promise.allSettled([
      service.cancel(
        issued.invoiceId,
        cancellationDto(issued.version),
        actor,
        `${marker}:cancel-concurrent-a`,
      ),
      service.cancel(
        issued.invoiceId,
        cancellationDto(issued.version),
        actor,
        `${marker}:cancel-concurrent-b`,
      ),
    ]);

    expect(
      provider.calls.filter((call) => call.operation === 'cancel'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('requires and persists a previously stamped replacement for motive 01', async () => {
    const original = await createIssuedInvoice('replacement-original');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const replacement = await createIssuedInvoice('replacement-new');
    const provider = new FakeFiscalProvider();
    const service = cancellationService(provider);

    await expect(
      service.cancel(
        original.invoiceId,
        { ...cancellationDto(original.version), cancellationMotiveCode: '01' },
        actor,
        `${marker}:cancel-replacement-missing`,
      ),
    ).rejects.toMatchObject({ message: 'CANCELLATION_REPLACEMENT_REQUIRED' });

    await service.cancel(
      original.invoiceId,
      {
        ...cancellationDto(original.version),
        cancellationMotiveCode: '01',
        replacementInvoiceId: replacement.invoiceId,
      },
      actor,
      `${marker}:cancel-replacement`,
    );

    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: original.invoiceId },
    });
    expect(stored.replacementInvoiceId).toBe(replacement.invoiceId);
    expect(stored.replacementUuid).toBe(replacement.uuid);
    expect(stored.uuid).toBe(original.uuid);
  });

  function cancellationService(provider: FakeFiscalProvider) {
    return new InvoiceCancellationService(
      prisma as unknown as PrismaService,
      provider,
    );
  }

  function cancellationDto(expectedVersion: number) {
    return {
      expectedVersion,
      cancellationMotiveCode: '02' as const,
      internalReason: 'PostgreSQL fiscal cancellation test',
    };
  }

  async function expectCancellationState(
    invoiceId: string,
    cancellationStatus: 'PENDING' | 'REJECTED' | 'UNKNOWN',
    reversed: boolean,
  ) {
    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { documents: { include: { itemApplications: true } } },
    });
    expect(stored.status).toBe('ACTIVE');
    expect(stored.cancellationStatus).toBe(cancellationStatus);
    expect(Boolean(stored.documents[0]?.reversedAt)).toBe(reversed);
    expect(Boolean(stored.documents[0]?.itemApplications[0]?.reversedAt)).toBe(
      reversed,
    );
  }

  async function createIssuedInvoice(label: string) {
    sequence += 1;
    const suffix = `${marker}-${sequence}-${label}`;
    const sale = await prisma.sale.create({
      data: {
        saleNumber: suffix,
        customerId,
        userId: actor.id,
        locationId,
        legalEntityId,
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
        productId,
        quantity: new Prisma.Decimal(10),
        quantityKg: new Prisma.Decimal(10),
        unit: ProductUnit.KG,
        unitPrice: new Prisma.Decimal(10),
        productNameSnapshot: suffix,
        productSkuSnapshot: marker,
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
        operationalLocationId: locationId,
        status: SaleDocumentStatus.ISSUED,
      },
    });
    const request = await prisma.billingRequest.create({
      data: {
        customerId,
        saleId: sale.id,
        requestedByUserId: actor.id,
        reviewedByUserId: actor.id,
        reviewedAt: new Date(),
        status: BillingRequestStatus.APPROVED,
        reason: suffix,
      },
    });
    const requestDocument = await prisma.billingRequestSaleDocument.create({
      data: {
        billingRequestId: request.id,
        saleDocumentId: document.id,
        requestedSubtotal: new Prisma.Decimal(100),
        requestedTax: new Prisma.Decimal(16),
        requestedTotal: new Prisma.Decimal(116),
        createdByUserId: actor.id,
      },
    });
    await prisma.billingRequestSaleItem.create({
      data: {
        billingRequestSaleDocumentId: requestDocument.id,
        saleItemId: item.id,
        requestedSubtotal: new Prisma.Decimal(100),
        requestedTax: new Prisma.Decimal(16),
        requestedTotal: new Prisma.Decimal(116),
      },
    });

    const result = await issuance.issue(
      request.id,
      {
        expectedVersion: 1,
        cfdiUse: 'G03',
        paymentMethod: 'PUE',
        paymentForm: '01',
        exportCode: '01',
      },
      actor,
      `${suffix}:stamp`,
    );
    const stored = await prisma.invoice.findUniqueOrThrow({
      where: { id: result.invoiceId },
      select: { id: true, uuid: true, version: true },
    });
    return {
      invoiceId: stored.id,
      uuid: stored.uuid!,
      version: stored.version,
    };
  }
});
