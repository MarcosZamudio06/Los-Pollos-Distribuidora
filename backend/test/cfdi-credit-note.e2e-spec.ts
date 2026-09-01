import {
  BillingRequestStatus,
  CfdiDocumentType,
  CostSnapshotSource,
  CreditAdjustmentStatus,
  CreditStatus,
  CustomerType,
  FiscalCancellationStatus,
  InvoiceFiscalStatus,
  InvoiceOrigin,
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
import { CreditAdjustmentRepository } from '../src/modules/cfdi/credit-adjustment.repository';
import { CreditAdjustmentService } from '../src/modules/cfdi/credit-adjustment.service';
import { FakeFiscalProvider } from '../src/modules/cfdi/testing/fake-fiscal-provider';
import { assertDisposableE2eEnvironment } from './e2e-environment';

describe('CFDI E credit adjustment PostgreSQL concurrency (e2e)', () => {
  const marker = `cfdi-credit-${randomUUID()}`;
  const actor = { id: '', role: 'ADMIN' as const };
  let prisma: PrismaClient;
  let repository: CreditAdjustmentRepository;
  let legalEntityId: string;
  let customerId: string;
  let fiscalCertificateId: string;
  let locationId: string;
  let productId: string;
  let invoiceSequence = 0;

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
        legalName: 'CFDI CREDIT NOTE TEST SA DE CV',
        taxId: `CNE010101${randomUUID().replaceAll('-', '').slice(0, 3).toUpperCase()}`,
        fiscalPostalCode: '64000',
        fiscalRegime: '601',
        cfdiEnabled: true,
        defaultSeries: `E${marker.slice(-6).toUpperCase()}`,
        certificateSerialNumber: '30001000000500003416',
        certificateFingerprint: 'a'.repeat(64),
        certificateSubject: 'CN=CFDI CREDIT NOTE TEST',
        certificateValidFrom: new Date('2025-01-01T00:00:00.000Z'),
        certificateValidTo: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    legalEntityId = legalEntity.id;
    const fiscalCertificate = await prisma.fiscalCertificate.create({
      data: {
        legalEntityId,
        serialNumber: '30001000000500003416',
        fingerprintSha256: 'a'.repeat(64),
        subject: 'CN=CFDI CREDIT NOTE TEST',
        validFrom: new Date('2025-01-01T00:00:00.000Z'),
        validTo: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    fiscalCertificateId = fiscalCertificate.id;
    const customer = await prisma.customer.create({
      data: {
        customerNumber: marker,
        name: `${marker} customer`,
        customerType: CustomerType.RETAIL,
        creditStatus: CreditStatus.ACTIVE,
        requiresBilling: true,
        fiscalName: 'RECEPTOR DE PRUEBA',
        taxId: `CNR010101${randomUUID().replaceAll('-', '').slice(0, 3).toUpperCase()}`,
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
        salePrice: new Prisma.Decimal(50),
        purchaseCost: new Prisma.Decimal(35),
        unit: ProductUnit.KG,
        satProductServiceCode: '10101504',
        satUnitCode: 'H87',
        taxObjectCode: '02',
        defaultTaxCode: '002',
        defaultFactorType: 'Tasa',
        defaultRateOrQuota: new Prisma.Decimal('0.16'),
      },
    });
    productId = product.id;
    repository = new CreditAdjustmentRepository(
      prisma as unknown as PrismaService,
    );
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function createOriginalInvoice() {
    invoiceSequence += 1;
    const uuid = randomUUID().toUpperCase();
    const sequence = invoiceSequence;
    const quantity = new Prisma.Decimal(2);
    const unitValue = new Prisma.Decimal(50);
    const subtotal = quantity.mul(unitValue);
    const discount = new Prisma.Decimal(0);
    const taxableBase = subtotal.minus(discount);
    const taxRate = new Prisma.Decimal('0.16');
    const tax = taxableBase.mul(taxRate);
    const total = taxableBase.plus(tax);

    return prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          saleNumber: `${marker}-sale-${sequence}`,
          customerId,
          userId: actor.id,
          locationId,
          legalEntityId,
          saleChannel: SaleChannel.COUNTER,
          documentType: SaleDocumentType.SIMPLE_NOTE,
          currencyCode: 'MXN',
          subtotal,
          discount,
          tax,
          total,
          paymentType: SalePaymentType.CASH_SALE,
          status: SaleStatus.CONFIRMED,
        },
      });
      const saleItem = await tx.saleItem.create({
        data: {
          saleId: sale.id,
          productId,
          quantity,
          quantityKg: quantity,
          unit: ProductUnit.KG,
          unitPrice: unitValue,
          productNameSnapshot: `${marker} product`,
          productSkuSnapshot: marker,
          unitPriceSnapshot: unitValue,
          quantitySnapshot: quantity,
          subtotal,
          discount,
          taxableBase,
          tax,
          total,
          unitCostSnapshot: new Prisma.Decimal(35),
          costSubtotalSnapshot: quantity.mul(35),
          costSnapshotSource: CostSnapshotSource.SALE_CONFIRMATION,
        },
      });
      const saleDocument = await tx.saleDocument.create({
        data: {
          saleId: sale.id,
          documentType: SaleDocumentType.SIMPLE_NOTE,
          operationalLocationId: locationId,
          status: SaleDocumentStatus.ISSUED,
        },
      });
      const sourceBillingRequest = await tx.billingRequest.create({
        data: {
          saleId: sale.id,
          customerId,
          requestedByUserId: actor.id,
          reviewedByUserId: actor.id,
          reviewedAt: new Date('2026-08-24T11:00:00.000Z'),
          status: BillingRequestStatus.APPROVED,
        },
      });
      const requestDocument = await tx.billingRequestSaleDocument.create({
        data: {
          billingRequestId: sourceBillingRequest.id,
          saleDocumentId: saleDocument.id,
          requestedSubtotal: taxableBase,
          requestedTax: tax,
          requestedTotal: total,
          createdByUserId: actor.id,
        },
      });
      await tx.billingRequestSaleItem.create({
        data: {
          billingRequestSaleDocumentId: requestDocument.id,
          saleItemId: saleItem.id,
          requestedSubtotal: taxableBase,
          requestedTax: tax,
          requestedTotal: total,
        },
      });
      const invoice = await tx.invoice.create({
        data: {
          legalEntityId,
          sourceBillingRequestId: sourceBillingRequest.id,
          fiscalCertificateId,
          fiscalIdempotencyKey: `${marker}-original-${sequence}`,
          fiscalRequestHash: 'c'.repeat(64),
          currencyCode: 'MXN',
          exchangeRate: new Prisma.Decimal(1),
          series: `I${marker.slice(-5)}`,
          folio: String(sequence),
          uuid,
          origin: InvoiceOrigin.NATIVE_CFDI,
          cfdiVersion: '4.0',
          cfdiType: CfdiDocumentType.INCOME,
          issuedAt: new Date('2026-08-24T12:00:00.000Z'),
          stampedAt: new Date('2026-08-24T12:00:00.000Z'),
          tfdVersion: '1.1',
          issuerSnapshot: {
            legalEntityId,
            legalName: 'CFDI CREDIT NOTE TEST SA DE CV',
            taxId: 'EKU9003173C9',
            fiscalPostalCode: '64000',
            fiscalRegime: '601',
            series: `E${marker.slice(-6)}`,
            certificateSerialNumber: '30001000000500003416',
            certificateFingerprint: 'a'.repeat(64),
          },
          receiverSnapshot: {
            customerId,
            fiscalName: 'RECEPTOR DE PRUEBA',
            taxId: 'URE180429TM6',
            fiscalPostalCode: '64000',
            fiscalRegime: '601',
            billingEmail: `${marker}-billing@example.test`,
          },
          fiscalSnapshotHash: 'd'.repeat(64),
          fiscalUseCode: 'G03',
          exportCode: '01',
          paymentFormCode: '03',
          paymentMethodCode: 'PUE',
          certificateNumber: '30001000000500003416',
          satCertificateNumber: '30001000000500003417',
          certificationProviderTaxId: 'EKU9003173C9',
          cfdiSeal: 'test-cfdi-seal',
          satSeal: 'test-sat-seal',
          fiscalStatus: InvoiceFiscalStatus.STAMPED,
          cancellationStatus: FiscalCancellationStatus.NOT_REQUESTED,
          subtotal,
          discount,
          tax,
          total,
          createdByUserId: actor.id,
          concepts: {
            create: {
              lineNumber: 1,
              sourceSaleItemId: saleItem.id,
              productServiceCode: '10101504',
              identificationNumber: `${marker}-${sequence}`,
              description: 'PRODUCTO DE PRUEBA',
              quantity,
              unitCode: 'H87',
              unitValue,
              amount: subtotal,
              discount,
              taxObjectCode: '02',
              taxCode: '002',
              factorType: 'Tasa',
              rateOrQuota: taxRate,
              taxBase: taxableBase,
              taxAmount: tax,
              total,
              taxesSnapshot: [
                {
                  taxCode: '002',
                  factorType: 'Tasa',
                  rateOrQuota: taxRate.toFixed(6),
                  base: taxableBase.toFixed(2),
                  amount: tax.toFixed(2),
                },
              ],
              snapshotHash: 'b'.repeat(64),
            },
          },
        },
        include: { concepts: true },
      });
      const application = await tx.invoiceSaleDocument.create({
        data: {
          invoiceId: invoice.id,
          saleDocumentId: saleDocument.id,
          billingRequestSaleDocumentId: requestDocument.id,
          subtotalApplied: taxableBase,
          taxApplied: tax,
          totalApplied: total,
          createdByUserId: actor.id,
        },
      });
      await tx.invoiceSaleItemApplication.create({
        data: {
          invoiceSaleDocumentId: application.id,
          saleItemId: saleItem.id,
          subtotalApplied: taxableBase,
          taxApplied: tax,
          totalApplied: total,
          createdByUserId: actor.id,
        },
      });
      return { invoice, concept: invoice.concepts[0] };
    });
  }

  async function createAdjustment(
    invoiceId: string,
    conceptId: string,
    creditTotal: string,
    key: string,
    sourceType: 'BONUS' | 'APPROVED_RETURN' = 'BONUS',
  ) {
    return repository.create(
      {
        sourceType,
        ...(sourceType === 'APPROVED_RETURN'
          ? { sourceReference: `${marker}:return-${key}` }
          : {}),
        internalReason: 'Bonificación comercial autorizable',
        paymentFormCode: '03',
        applications: [
          {
            invoiceId,
            lines: [{ invoiceConceptId: conceptId, creditTotal }],
          },
        ],
      },
      actor,
      key,
    );
  }

  it('persists and issues relationship 03 for an approved return', async () => {
    const { invoice, concept } = await createOriginalInvoice();
    const draft = await createAdjustment(
      invoice.id,
      concept.id,
      '58.00',
      `${marker}:create-return`,
      'APPROVED_RETURN',
    );
    const approved = await repository.approve(
      draft.id,
      { expectedVersion: 1 },
      actor,
    );
    const provider = new FakeFiscalProvider();
    const service = new CreditAdjustmentService(repository, provider);

    await expect(
      service.issue(
        approved.id,
        { expectedVersion: approved.version },
        actor,
        `${marker}:issue-return`,
      ),
    ).resolves.toMatchObject({
      adjustmentStatus: CreditAdjustmentStatus.ISSUED,
      fiscalStatus: 'STAMPED',
    });

    const stampCall = provider.calls.find((call) => call.operation === 'stamp');
    expect(stampCall?.command).toMatchObject({
      snapshot: {
        cfdiType: 'CREDIT_NOTE',
        fiscalUseCode: 'G02',
        relationships: [
          {
            typeCode: '03',
            relatedUuid: invoice.uuid,
          },
        ],
      },
    });
    await expect(
      prisma.creditAdjustmentInvoice.findFirstOrThrow({
        where: { creditAdjustmentId: approved.id },
        select: { relationshipTypeCode: true },
      }),
    ).resolves.toMatchObject({ relationshipTypeCode: '03' });
  });

  it('allows only one concurrent authorization when two drafts would over-credit', async () => {
    const { invoice, concept } = await createOriginalInvoice();
    const first = await createAdjustment(
      invoice.id,
      concept.id,
      '80.00',
      `${marker}:create-over-a`,
    );
    const second = await createAdjustment(
      invoice.id,
      concept.id,
      '80.00',
      `${marker}:create-over-b`,
    );
    const inventoryBefore = await prisma.inventoryMovement.count();

    const results = await Promise.allSettled([
      repository.approve(first.id, { expectedVersion: 1 }, actor),
      repository.approve(second.id, { expectedVersion: 1 }, actor),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await expect(
      prisma.creditAdjustment.count({
        where: {
          id: { in: [first.id, second.id] },
          status: CreditAdjustmentStatus.APPROVED,
        },
      }),
    ).resolves.toBe(1);
    await expect(prisma.inventoryMovement.count()).resolves.toBe(
      inventoryBefore,
    );
  });

  it('dispatches at most one STAMP for two concurrent issuance keys and replays the winner', async () => {
    const { invoice, concept } = await createOriginalInvoice();
    const draft = await createAdjustment(
      invoice.id,
      concept.id,
      '58.00',
      `${marker}:create-issue`,
    );
    const approved = await repository.approve(
      draft.id,
      { expectedVersion: 1 },
      actor,
    );
    const fallback = new FakeFiscalProvider();
    const provider = new FakeFiscalProvider({
      stamp: async (command) => {
        await new Promise((resolve) => setTimeout(resolve, 75));
        return fallback.stamp(command);
      },
    });
    const service = new CreditAdjustmentService(repository, provider);
    const inventoryBefore = await prisma.inventoryMovement.count();

    const results = await Promise.allSettled([
      service.issue(
        approved.id,
        { expectedVersion: approved.version },
        actor,
        `${marker}:issue-a`,
      ),
      service.issue(
        approved.id,
        { expectedVersion: approved.version },
        actor,
        `${marker}:issue-b`,
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
    const expense = await prisma.invoice.findUniqueOrThrow({
      where: { sourceCreditAdjustmentId: approved.id },
    });
    expect(expense.cfdiType).toBe(CfdiDocumentType.EXPENSE);
    expect(expense.fiscalStatus).toBe(InvoiceFiscalStatus.STAMPED);
    expect(expense.total.toFixed(2)).toBe('58.00');
    const winningKey = expense.fiscalIdempotencyKey!;
    await expect(
      service.issue(
        approved.id,
        { expectedVersion: approved.version },
        actor,
        winningKey,
      ),
    ).resolves.toMatchObject({ replayed: true, adjustmentStatus: 'ISSUED' });
    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(1);
    await expect(prisma.inventoryMovement.count()).resolves.toBe(
      inventoryBefore,
    );
  });

  it('rejects a credit operation for a fiscally cancelled original invoice', async () => {
    const { invoice, concept } = await createOriginalInvoice();
    const draft = await createAdjustment(
      invoice.id,
      concept.id,
      '58.00',
      `${marker}:cancelled-original`,
    );
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'CANCELLED',
        cancellationStatus: FiscalCancellationStatus.ACCEPTED,
      },
    });

    await expect(
      repository.approve(draft.id, { expectedVersion: 1 }, actor),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'CREDIT_NOTE_ORIGINAL_INVOICE_CANCELLED',
      }),
    });
  });
});
