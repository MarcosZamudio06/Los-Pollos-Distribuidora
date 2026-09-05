import {
  BillingRequestStatus,
  CfdiDocumentType,
  CollectionStatus,
  CostSnapshotSource,
  CreditStatus,
  CustomerType,
  FiscalCancellationStatus,
  FiscalOperationStatus,
  InventoryMovementType,
  InvoiceFiscalStatus,
  InvoiceOrigin,
  InvoiceStatus,
  OperationalLocationType,
  PaymentInvoiceApplicationStatus,
  PaymentMethod,
  PaymentStatus,
  PointOfSaleDailyCloseLineConcept,
  PointOfSaleDailyCloseLineSection,
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
import { createHash, randomUUID } from 'node:crypto';

import { PrismaService } from '../src/database/prisma.service';
import { RepIssuanceRepository } from '../src/modules/cfdi/rep-issuance.repository';
import { RepIssuanceService } from '../src/modules/cfdi/rep-issuance.service';
import { FakeFiscalProvider } from '../src/modules/cfdi/testing/fake-fiscal-provider';
import { assertDisposableE2eEnvironment } from './e2e-environment';

const decimal = (value: Prisma.Decimal.Value): Prisma.Decimal =>
  new Prisma.Decimal(value);

const operationalDomains = [
  'Payment',
  'AccountReceivable',
  'Sale',
  'SaleItem',
  'CashShift',
  'PointOfSaleDailyClose',
  'PointOfSaleDailyCloseLine',
  'RouteSettlement',
  'InventoryBalance',
  'InventoryMovement',
] as const;

type OperationalDomain = (typeof operationalDomains)[number];
type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };
type OperationalSnapshot = Record<OperationalDomain, readonly CanonicalValue[]>;

function canonicalize(value: unknown): CanonicalValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toFixed();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  throw new Error(`Unsupported operational snapshot value: ${typeof value}`);
}

async function captureOperationalSnapshot(
  prisma: PrismaClient,
): Promise<OperationalSnapshot> {
  const [
    payments,
    accountReceivables,
    sales,
    saleItems,
    cashShifts,
    dailyCloses,
    dailyCloseLines,
    routeSettlements,
    inventoryBalances,
    inventoryMovements,
  ] = await Promise.all([
    prisma.payment.findMany({ orderBy: { id: 'asc' } }),
    prisma.accountReceivable.findMany({ orderBy: { id: 'asc' } }),
    prisma.sale.findMany({ orderBy: { id: 'asc' } }),
    prisma.saleItem.findMany({ orderBy: { id: 'asc' } }),
    prisma.cashShift.findMany({ orderBy: { id: 'asc' } }),
    prisma.pointOfSaleDailyClose.findMany({ orderBy: { id: 'asc' } }),
    prisma.pointOfSaleDailyCloseLine.findMany({ orderBy: { id: 'asc' } }),
    prisma.routeSettlement.findMany({ orderBy: { id: 'asc' } }),
    prisma.inventoryBalance.findMany({ orderBy: { id: 'asc' } }),
    prisma.inventoryMovement.findMany({ orderBy: { id: 'asc' } }),
  ]);

  return {
    Payment: canonicalize(payments) as readonly CanonicalValue[],
    AccountReceivable: canonicalize(
      accountReceivables,
    ) as readonly CanonicalValue[],
    Sale: canonicalize(sales) as readonly CanonicalValue[],
    SaleItem: canonicalize(saleItems) as readonly CanonicalValue[],
    CashShift: canonicalize(cashShifts) as readonly CanonicalValue[],
    PointOfSaleDailyClose: canonicalize(
      dailyCloses,
    ) as readonly CanonicalValue[],
    PointOfSaleDailyCloseLine: canonicalize(
      dailyCloseLines,
    ) as readonly CanonicalValue[],
    RouteSettlement: canonicalize(
      routeSettlements,
    ) as readonly CanonicalValue[],
    InventoryBalance: canonicalize(
      inventoryBalances,
    ) as readonly CanonicalValue[],
    InventoryMovement: canonicalize(
      inventoryMovements,
    ) as readonly CanonicalValue[],
  };
}

function operationalSnapshotSummary(snapshot: OperationalSnapshot) {
  return Object.fromEntries(
    operationalDomains.map((domain) => {
      const serialized = JSON.stringify(snapshot[domain]);
      return [
        domain,
        {
          count: snapshot[domain].length,
          sha256: createHash('sha256').update(serialized).digest('hex'),
        },
      ];
    }),
  ) as Record<OperationalDomain, { count: number; sha256: string }>;
}

function expectOperationalSnapshotsEqual(
  before: OperationalSnapshot,
  after: OperationalSnapshot,
): void {
  const beforeSummary = operationalSnapshotSummary(before);
  const afterSummary = operationalSnapshotSummary(after);
  for (const domain of operationalDomains) {
    expect({ domain, ...afterSummary[domain] }).toEqual({
      domain,
      ...beforeSummary[domain],
    });
  }
}

describe('CFDI REP 2.0 PostgreSQL runtime contract (e2e)', () => {
  const runId = randomUUID().replaceAll('-', '').toUpperCase();
  const marker = `rep20-${runId}`;
  const legalEntityTaxId = `REP010101${(BigInt(`0x${runId}`) % 36n ** 3n)
    .toString(36)
    .toUpperCase()
    .padStart(3, '0')}`;
  const actor = { id: '', role: 'ADMIN' as const };
  let prisma: PrismaClient;
  let repository: RepIssuanceRepository;
  let legalEntityId: string;
  let certificateId: string;
  let customerId: string;
  let locationId: string;
  let actorId: string;
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
    actorId = user.id;
    actor.id = user.id;

    const legalEntity = await prisma.legalEntity.create({
      data: {
        legalName: `${marker} legal entity`,
        taxId: legalEntityTaxId,
        fiscalPostalCode: '64000',
        fiscalRegime: '601',
        cfdiEnabled: true,
        defaultSeries: 'A',
        certificateSerialNumber: '30001000000500003416',
        certificateFingerprint: 'a'.repeat(64),
        certificateSubject: `CN=${marker}`,
        certificateValidFrom: new Date('2025-01-01T00:00:00.000Z'),
        certificateValidTo: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    legalEntityId = legalEntity.id;
    const certificate = await prisma.fiscalCertificate.create({
      data: {
        legalEntityId,
        serialNumber: '30001000000500003416',
        fingerprintSha256: 'a'.repeat(64),
        subject: `CN=${marker}`,
        validFrom: new Date('2025-01-01T00:00:00.000Z'),
        validTo: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    certificateId = certificate.id;

    const customer = await prisma.customer.create({
      data: {
        customerNumber: marker,
        name: `${marker} customer`,
        customerType: CustomerType.RETAIL,
        creditStatus: CreditStatus.ACTIVE,
        requiresBilling: true,
        fiscalName: `${marker} CUSTOMER SA DE CV`,
        taxId: 'URE180429TM6',
        fiscalPostalCode: '86991',
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
        salePrice: decimal(100),
        purchaseCost: decimal(35),
        unit: ProductUnit.KG,
        satProductServiceCode: '50111500',
        satUnitCode: 'ACT',
        taxObjectCode: '01',
      },
    });
    productId = product.id;

    repository = new RepIssuanceRepository(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('persists the first partiality and keeps applications reserved until stamp confirmation', async () => {
    const fixture = await createScenario({
      invoiceTotals: ['100.00'],
      paymentAmount: '40.00',
      paymentPaidAt: '2026-08-24T10:00:00.000Z',
    });
    const sourceInvoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: fixture.invoiceIds[0] },
      select: {
        cfdiType: true,
        fiscalStatus: true,
        status: true,
        uuid: true,
        folio: true,
        fiscalUseCode: true,
        paymentMethodCode: true,
      },
    });
    expect(sourceInvoice).toMatchObject({
      cfdiType: CfdiDocumentType.INCOME,
      fiscalStatus: InvoiceFiscalStatus.STAMPED,
      status: InvoiceStatus.ACTIVE,
      uuid: fixture.invoiceUuids[0],
      folio: fixture.invoices[0]?.folio,
      fiscalUseCode: 'G03',
      paymentMethodCode: 'PPD',
    });
    let reservationObserved = false;
    const provider = new FakeFiscalProvider({
      stamp: async (command) => {
        const detail = await prisma.paymentReceiptDetail.findUnique({
          where: { paymentId: fixture.paymentId },
          include: {
            applications: true,
            paymentReceipt: { include: { invoice: true } },
          },
        });
        expect(detail).not.toBeNull();
        expect(detail?.applications).toHaveLength(1);
        expect(detail?.applications[0]?.status).toBe(
          PaymentInvoiceApplicationStatus.RESERVED,
        );
        expect(detail?.paymentReceipt.invoice.fiscalStatus).toBe(
          InvoiceFiscalStatus.STAMPING,
        );
        reservationObserved = true;
        return new FakeFiscalProvider().stamp(command);
      },
    });

    const result = await serviceFor(provider).issue(
      fixture.paymentId,
      { expectedVersion: 1 },
      actor,
      `${marker}:first:${fixture.paymentId}`,
    );

    expect(result.fiscalStatus).toBe(InvoiceFiscalStatus.STAMPED);
    expect(reservationObserved).toBe(true);
    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(1);

    const detail = await receiptDetailFor(fixture.paymentId);
    const application = detail.applications[0];
    expect(detail.paymentDate.toISOString()).toBe(
      fixture.paymentPaidAt.toISOString(),
    );
    expect(detail.paymentFormCode).toBe('03');
    expect(detail.amount.toFixed(2)).toBe('40.00');
    expect(detail.paymentReceipt.invoice).toMatchObject({
      cfdiType: CfdiDocumentType.PAYMENT_RECEIPT,
      fiscalStatus: InvoiceFiscalStatus.STAMPED,
      fiscalUseCode: 'CP01',
    });
    expect(detail.paymentReceipt.invoice.total.toFixed(2)).toBe('0.00');
    expect(BigInt(detail.paymentReceipt.invoice.folio)).toBe(
      BigInt(sourceInvoice.folio) + 1n,
    );
    expect(application).toMatchObject({
      relatedInvoiceId: fixture.invoiceIds[0],
      relatedUuid: fixture.invoiceUuids[0],
      partialityNumber: 1,
      status: PaymentInvoiceApplicationStatus.EFFECTIVE,
    });
    expect(application.previousBalanceAmount.toFixed(2)).toBe('100.00');
    expect(application.amountPaid.toFixed(2)).toBe('40.00');
    expect(application.remainingBalance.toFixed(2)).toBe('60.00');
  });

  it('derives the second partiality and prior balance from EFFECTIVE applications', async () => {
    const fixture = await createScenario({
      invoiceTotals: ['100.00'],
      paymentAmount: '40.00',
      paymentPaidAt: '2026-08-25T10:00:00.000Z',
    });
    const provider = new FakeFiscalProvider();
    await serviceFor(provider).issue(
      fixture.paymentId,
      { expectedVersion: 1 },
      actor,
      `${marker}:partiality-1:${fixture.paymentId}`,
    );

    const secondPayment = await createPayment(fixture, {
      amount: '60.00',
      paidAt: '2026-08-26T10:00:00.000Z',
    });
    const second = await serviceFor(provider).issue(
      secondPayment.id,
      { expectedVersion: 1 },
      actor,
      `${marker}:partiality-2:${secondPayment.id}`,
    );

    expect(second.fiscalStatus).toBe(InvoiceFiscalStatus.STAMPED);
    const details = await prisma.paymentReceiptDetail.findMany({
      where: { paymentId: { in: [fixture.paymentId, secondPayment.id] } },
      include: { applications: true },
      orderBy: { paymentDate: 'asc' },
    });
    expect(details).toHaveLength(2);
    expect(details.map((detail) => detail.applications[0]?.status)).toEqual([
      PaymentInvoiceApplicationStatus.EFFECTIVE,
      PaymentInvoiceApplicationStatus.EFFECTIVE,
    ]);

    const application = details[1]?.applications[0];
    expect(application?.partialityNumber).toBe(2);
    expect(application?.relatedInvoiceId).toBe(fixture.invoiceIds[0]);
    expect(application?.previousBalanceAmount.toFixed(2)).toBe('60.00');
    expect(application?.amountPaid.toFixed(2)).toBe('60.00');
    expect(application?.remainingBalance.toFixed(2)).toBe('0.00');
    expect(
      await prisma.paymentInvoiceApplication.count({
        where: {
          relatedInvoiceId: fixture.invoiceIds[0],
          status: PaymentInvoiceApplicationStatus.EFFECTIVE,
        },
      }),
    ).toBe(2);
  });

  it('serializes one concurrent stamp, persists one effective root, and replays the winning key', async () => {
    const fixture = await createScenario({
      invoiceTotals: ['100.00'],
      paymentAmount: '25.00',
      paymentPaidAt: '2026-08-27T10:00:00.000Z',
    });
    await createOperationalSentinels(fixture);
    const operationalBefore = await captureOperationalSnapshot(prisma);
    const fiscalBefore = await captureFiscalCounts(fixture.paymentId);
    const provider = new FakeFiscalProvider({
      stamp: async (command) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return new FakeFiscalProvider().stamp(command);
      },
    });
    const service = serviceFor(provider);
    const firstKey = `${marker}:concurrent-a:${fixture.paymentId}`;
    const secondKey = `${marker}:concurrent-b:${fixture.paymentId}`;
    const results = await Promise.allSettled([
      service.issue(fixture.paymentId, { expectedVersion: 1 }, actor, firstKey),
      service.issue(
        fixture.paymentId,
        { expectedVersion: 1 },
        actor,
        secondKey,
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
    const winnerResult = results.find(
      (result) => result.status === 'fulfilled',
    );
    expect(winnerResult).toBeDefined();
    if (!winnerResult || winnerResult.status !== 'fulfilled') {
      throw new Error('Expected one successful concurrent REP issuance');
    }
    const winner = winnerResult.value;

    const replayKey =
      results.findIndex((result) => result.status === 'fulfilled') === 0
        ? firstKey
        : secondKey;
    const replay = await service.issue(
      fixture.paymentId,
      { expectedVersion: 1 },
      actor,
      replayKey,
    );
    expect(replay).toMatchObject({
      replayed: true,
      fiscalStatus: InvoiceFiscalStatus.STAMPED,
      invoiceId: winner?.invoiceId,
      uuid: winner?.uuid,
    });
    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(1);

    const detailCount = await prisma.paymentReceiptDetail.count({
      where: { paymentId: fixture.paymentId },
    });
    const allApplications = await prisma.paymentInvoiceApplication.findMany({
      where: { paymentId: fixture.paymentId },
    });
    const effectiveApplications =
      await prisma.paymentInvoiceApplication.findMany({
        where: {
          paymentId: fixture.paymentId,
          status: PaymentInvoiceApplicationStatus.EFFECTIVE,
        },
      });
    const attempts = await prisma.fiscalOperationAttempt.count({
      where: {
        invoice: {
          paymentReceipt: {
            details: { some: { paymentId: fixture.paymentId } },
          },
        },
        operation: 'STAMP',
        status: FiscalOperationStatus.SUCCEEDED,
      },
    });
    const roots = await prisma.paymentReceipt.findMany({
      where: { details: { some: { paymentId: fixture.paymentId } } },
      select: { invoiceId: true },
    });
    expect(detailCount).toBe(1);
    expect(allApplications).toHaveLength(1);
    expect(effectiveApplications).toHaveLength(1);
    expect(effectiveApplications[0]?.amountPaid.toFixed(2)).toBe('25.00');
    expect(effectiveApplications[0]?.previousBalanceAmount.toFixed(2)).toBe(
      '100.00',
    );
    expect(effectiveApplications[0]?.remainingBalance.toFixed(2)).toBe('75.00');
    expect(attempts).toBe(1);
    expect(roots).toHaveLength(1);

    const fiscalAfter = await captureFiscalCounts(fixture.paymentId);
    expect(fiscalAfter).toEqual({
      paymentReceipts: fiscalBefore.paymentReceipts + 1,
      paymentReceiptDetails: fiscalBefore.paymentReceiptDetails + 1,
      effectiveApplications: fiscalBefore.effectiveApplications + 1,
      paymentReceiptInvoices: fiscalBefore.paymentReceiptInvoices + 1,
      succeededStampAttempts: fiscalBefore.succeededStampAttempts + 1,
    });

    const operationalAfter = await captureOperationalSnapshot(prisma);
    expectOperationalSnapshotsEqual(operationalBefore, operationalAfter);
    console.info(
      JSON.stringify({
        contract: 'REP_NON_INTERFERENCE',
        operationalBefore: operationalSnapshotSummary(operationalBefore),
        operationalAfter: operationalSnapshotSummary(operationalAfter),
        fiscalBefore,
        fiscalAfter,
        providerStampCount: provider.calls.filter(
          (call) => call.operation === 'stamp',
        ).length,
      }),
    );
  });

  it('rejects a stale Payment version before creating fiscal state or stamping', async () => {
    const fixture = await createScenario({
      invoiceTotals: ['100.00'],
      paymentAmount: '25.00',
    });
    const paymentBefore = canonicalize(
      await prisma.payment.findUniqueOrThrow({
        where: { id: fixture.paymentId },
      }),
    );
    const fiscalBefore = await captureFiscalCounts(fixture.paymentId);
    const provider = new FakeFiscalProvider();

    await expect(
      serviceFor(provider).issue(
        fixture.paymentId,
        { expectedVersion: 0 },
        actor,
        `${marker}:stale-version:${fixture.paymentId}`,
      ),
    ).rejects.toThrow('VERSION_CONFLICT');

    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(0);
    expect(await captureFiscalCounts(fixture.paymentId)).toEqual(fiscalBefore);
    expect(
      canonicalize(
        await prisma.payment.findUniqueOrThrow({
          where: { id: fixture.paymentId },
        }),
      ),
    ).toEqual(paymentBefore);
  });

  it.each([
    [
      'PUE invoice',
      { invoicePaymentMethodCode: 'PUE' },
      'REP_ORIGINAL_INVOICE_NOT_PPD',
    ],
    [
      'not stamped invoice',
      { invoiceFiscalStatus: InvoiceFiscalStatus.READY },
      'REP_ORIGINAL_INVOICE_NOT_STAMPED',
    ],
    [
      'inactive invoice',
      { invoiceStatus: InvoiceStatus.CANCELLED },
      'REP_ORIGINAL_INVOICE_NOT_STAMPED',
    ],
    [
      'overpayment',
      { paymentAmount: '101.00' },
      'REP_UNALLOCATED_PAYMENT_AMOUNT',
    ],
    [
      'registered payment',
      { paymentStatus: PaymentStatus.REGISTERED },
      'PAYMENT_NOT_APPLIED',
    ],
    [
      'missing SAT payment form',
      { paymentFormCode: null },
      'REP_PAYMENT_FORM_MISSING',
    ],
  ] as const)('fails closed for %s', async (_label, options, expectedCode) => {
    const fixture = await createScenario({
      invoiceTotals: ['100.00'],
      ...options,
    });
    const provider = new FakeFiscalProvider();

    await expect(
      serviceFor(provider).issue(
        fixture.paymentId,
        { expectedVersion: 1 },
        actor,
        `${marker}:reject:${_label}:${fixture.paymentId}`,
      ),
    ).rejects.toThrow(expectedCode);
    expect(
      provider.calls.filter((call) => call.operation === 'stamp'),
    ).toHaveLength(0);
    await expect(
      prisma.paymentReceiptDetail.count({
        where: { paymentId: fixture.paymentId },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.paymentInvoiceApplication.count({
        where: { paymentId: fixture.paymentId },
      }),
    ).resolves.toBe(0);
  });

  it('distributes one applied payment across two PPD invoices and calculates each UUID independently', async () => {
    const fixture = await createScenario({
      invoiceTotals: ['60.00', '40.00'],
      paymentAmount: '100.00',
      paymentPaidAt: '2026-08-28T10:00:00.000Z',
    });
    const provider = new FakeFiscalProvider();
    await expect(
      serviceFor(provider).issue(
        fixture.paymentId,
        { expectedVersion: 1 },
        actor,
        `${marker}:multi-invoice:${fixture.paymentId}`,
      ),
    ).resolves.toMatchObject({ fiscalStatus: InvoiceFiscalStatus.STAMPED });

    const applications = await prisma.paymentInvoiceApplication.findMany({
      where: { paymentId: fixture.paymentId },
      orderBy: { relatedUuid: 'asc' },
    });
    expect(applications).toHaveLength(2);
    for (const invoice of fixture.invoices) {
      const application = applications.find(
        (candidate) => candidate.relatedUuid === invoice.uuid,
      );
      expect(application).toMatchObject({
        relatedInvoiceId: invoice.id,
        partialityNumber: 1,
        status: PaymentInvoiceApplicationStatus.EFFECTIVE,
      });
      expect(application?.previousBalanceAmount.toFixed(2)).toBe(invoice.total);
      expect(application?.amountPaid.toFixed(2)).toBe(invoice.total);
      expect(application?.remainingBalance.toFixed(2)).toBe('0.00');
    }
  });

  function serviceFor(provider: FakeFiscalProvider): RepIssuanceService {
    return new RepIssuanceService(repository, provider);
  }

  async function createOperationalSentinels(scenario: Scenario) {
    const suffix = `${marker}-sentinel-${randomUUID()
      .replaceAll('-', '')
      .slice(0, 12)}`;
    const businessDate = new Date('2026-08-27T00:00:00.000Z');
    return prisma.$transaction(async (tx) => {
      const dailyClose = await tx.pointOfSaleDailyClose.create({
        data: {
          operationalLocationId: locationId,
          businessDate,
          openedByUserId: actorId,
          terminalIdentifier: suffix,
          initialCashFund: decimal('100.00'),
          transferTotal: decimal('25.00'),
        },
      });
      const terminal = await tx.cashTerminal.create({
        data: {
          operationalLocationId: locationId,
          code: suffix,
          name: `${suffix} terminal`,
          deviceId: suffix,
        },
      });
      const cashShift = await tx.cashShift.create({
        data: {
          terminalId: terminal.id,
          operationalLocationId: locationId,
          pointOfSaleDailyCloseId: dailyClose.id,
          cashierUserId: actorId,
          businessDate,
          initialCashFund: decimal('100.00'),
        },
      });
      await tx.pointOfSaleDailyCloseLine.create({
        data: {
          pointOfSaleDailyCloseId: dailyClose.id,
          operationalLocationId: locationId,
          section: PointOfSaleDailyCloseLineSection.INCOME,
          conceptType: PointOfSaleDailyCloseLineConcept.TRANSFER_INCOME,
          saleId: scenario.saleId,
          amount: decimal('25.00'),
          notes: `${suffix} daily-close sentinel`,
          createdByUserId: actorId,
        },
      });
      const routeStockLocation = await tx.operationalLocation.create({
        data: {
          name: `${suffix} route stock`,
          code: `${suffix}-stock`,
          type: OperationalLocationType.ROUTE_STOCK,
          parentId: locationId,
        },
      });
      const route = await tx.deliveryRoute.create({
        data: {
          name: `${suffix} route`,
          driverId: actorId,
          scheduledDate: businessDate,
          originLocationId: locationId,
          routeStockLocationId: routeStockLocation.id,
        },
      });
      const routeSettlement = await tx.routeSettlement.create({
        data: {
          routeId: route.id,
          driverId: actorId,
          expectedTransferAmount: decimal('25.00'),
          secondPassCollectionsAmount: decimal('25.00'),
          routeCollectionsSummary: { sentinel: suffix },
        },
      });
      await tx.inventoryBalance.create({
        data: {
          productId,
          locationId,
          quantityKg: decimal('50.000'),
          reservedQuantityKg: decimal('5.000'),
          minQuantityKg: decimal('10.000'),
        },
      });
      await tx.inventoryMovement.create({
        data: {
          productId,
          locationId,
          userId: actorId,
          type: InventoryMovementType.ADJUSTMENT,
          quantity: decimal('50.000'),
          quantityKg: decimal('50.000'),
          quantityPieces: 0,
          previousStock: decimal('0.000'),
          newStock: decimal('50.000'),
          previousQuantityKg: decimal('0.000'),
          newQuantityKg: decimal('50.000'),
          previousQuantityPieces: 0,
          newQuantityPieces: 0,
          reason: `${suffix} inventory sentinel`,
          referenceType: 'REP_NON_INTERFERENCE_SENTINEL',
          referenceId: scenario.saleId,
          saleId: scenario.saleId,
        },
      });
      await tx.sale.update({
        where: { id: scenario.saleId },
        data: {
          routeId: route.id,
          pointOfSaleDailyCloseId: dailyClose.id,
          terminalId: terminal.id,
          cashShiftId: cashShift.id,
          cashierUserId: actorId,
          businessDate,
          registeredAt: new Date('2026-08-27T09:00:00.000Z'),
        },
      });
      await tx.payment.update({
        where: { id: scenario.paymentId },
        data: {
          collectedByUserId: actorId,
          collectionPass: 1,
          routeId: route.id,
          routeSettlementId: routeSettlement.id,
          pointOfSaleDailyCloseId: dailyClose.id,
          cashShiftId: cashShift.id,
          bankName: 'REP E2E SENTINEL BANK',
          referenceNumber: suffix,
          appliedDocumentId: scenario.accountReceivableId,
          appliedDocumentType: 'ACCOUNT_RECEIVABLE',
        },
      });
    });
  }

  async function captureFiscalCounts(paymentId: string) {
    const [
      paymentReceipts,
      paymentReceiptDetails,
      effectiveApplications,
      paymentReceiptInvoices,
      succeededStampAttempts,
    ] = await Promise.all([
      prisma.paymentReceipt.count({
        where: { details: { some: { paymentId } } },
      }),
      prisma.paymentReceiptDetail.count({ where: { paymentId } }),
      prisma.paymentInvoiceApplication.count({
        where: {
          paymentId,
          status: PaymentInvoiceApplicationStatus.EFFECTIVE,
        },
      }),
      prisma.invoice.count({
        where: {
          cfdiType: CfdiDocumentType.PAYMENT_RECEIPT,
          paymentReceipt: { details: { some: { paymentId } } },
        },
      }),
      prisma.fiscalOperationAttempt.count({
        where: {
          operation: 'STAMP',
          status: FiscalOperationStatus.SUCCEEDED,
          invoice: {
            paymentReceipt: { details: { some: { paymentId } } },
          },
        },
      }),
    ]);
    return {
      paymentReceipts,
      paymentReceiptDetails,
      effectiveApplications,
      paymentReceiptInvoices,
      succeededStampAttempts,
    };
  }

  async function receiptDetailFor(paymentId: string) {
    return prisma.paymentReceiptDetail.findUniqueOrThrow({
      where: { paymentId },
      include: {
        applications: true,
        paymentReceipt: { include: { invoice: true } },
      },
    });
  }

  async function createScenario(options: ScenarioOptions): Promise<Scenario> {
    const invoiceTotals = options.invoiceTotals ?? ['100.00'];
    const saleTotal = invoiceTotals.reduce(
      (sum, total) => sum.plus(total),
      decimal(0),
    );
    const suffix = `${marker}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    return prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          saleNumber: suffix,
          customerId,
          userId: actorId,
          locationId,
          legalEntityId,
          saleChannel: SaleChannel.COUNTER,
          documentType: SaleDocumentType.SIMPLE_NOTE,
          currencyCode: 'MXN',
          subtotal: saleTotal,
          discount: decimal(0),
          tax: decimal(0),
          total: saleTotal,
          paymentType: SalePaymentType.CREDIT_SALE,
          status: SaleStatus.CONFIRMED,
        },
      });
      const invoices: ScenarioInvoice[] = [];
      for (const [index, requestedTotal] of invoiceTotals.entries()) {
        const subtotal = decimal(requestedTotal);
        const discount = decimal(0);
        const taxableBase = subtotal.minus(discount);
        const tax = decimal(0);
        const total = taxableBase.plus(tax);
        const saleItem = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId,
            quantity: decimal(1),
            quantityKg: decimal(1),
            unit: ProductUnit.KG,
            unitPrice: subtotal,
            productNameSnapshot: `${marker} product`,
            productSkuSnapshot: marker,
            unitPriceSnapshot: subtotal,
            quantitySnapshot: decimal(1),
            subtotal,
            discount,
            taxableBase,
            tax,
            total,
            unitCostSnapshot: decimal(35),
            costSubtotalSnapshot: decimal(35),
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
        const billingRequest = await tx.billingRequest.create({
          data: {
            customerId,
            saleId: sale.id,
            requestedByUserId: actorId,
            reviewedByUserId: actorId,
            reviewedAt: new Date(),
            status: BillingRequestStatus.APPROVED,
            reason: `${suffix}:invoice:${index}`,
          },
        });
        const requestDocument = await tx.billingRequestSaleDocument.create({
          data: {
            billingRequestId: billingRequest.id,
            saleDocumentId: saleDocument.id,
            requestedSubtotal: taxableBase,
            requestedTax: tax,
            requestedTotal: total,
            createdByUserId: actorId,
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

        invoiceSequence += 1;
        const series = 'A';
        const sequence = await tx.fiscalFolioSequence.upsert({
          where: {
            legalEntityId_series: { legalEntityId, series },
          },
          update: { nextValue: { increment: 1 } },
          create: { legalEntityId, series, nextValue: 2 },
          select: { nextValue: true },
        });
        const folio = (sequence.nextValue - 1n).toString();
        const issuedAt = new Date(Date.UTC(2026, 7, 23, 8, index, 0));
        const invoiceIsStamped =
          options.invoiceFiscalStatus !== InvoiceFiscalStatus.READY;
        const invoiceUuid = invoiceIsStamped
          ? randomUUID().toUpperCase()
          : null;
        const invoice = await tx.invoice.create({
          data: {
            legalEntityId,
            sourceBillingRequestId: billingRequest.id,
            fiscalCertificateId: certificateId,
            fiscalIdempotencyKey: `${suffix}:invoice:${invoiceSequence}`,
            fiscalRequestHash: 'b'.repeat(64),
            currencyCode: 'MXN',
            exchangeRate: decimal(1),
            series,
            folio,
            uuid: invoiceUuid,
            origin: InvoiceOrigin.NATIVE_CFDI,
            cfdiVersion: '4.0',
            cfdiType: CfdiDocumentType.INCOME,
            issuedAt,
            stampedAt: invoiceIsStamped ? issuedAt : null,
            tfdVersion: invoiceIsStamped ? '1.1' : null,
            issuerSnapshot: {
              legalEntityId,
              legalName: `${marker} legal entity`,
              taxId: legalEntityTaxId,
              fiscalPostalCode: '64000',
              fiscalRegime: '601',
              series,
              certificateSerialNumber: '30001000000500003416',
              certificateFingerprint: 'a'.repeat(64),
            },
            receiverSnapshot: {
              customerId,
              fiscalName: `${marker} CUSTOMER SA DE CV`,
              taxId: 'URE180429TM6',
              fiscalPostalCode: '86991',
              fiscalRegime: '601',
              fiscalUseCode: 'G03',
              billingEmail: `${marker}-billing@example.test`,
            },
            fiscalSnapshotHash: 'c'.repeat(64),
            fiscalUseCode: 'G03',
            exportCode: '01',
            paymentFormCode: '99',
            paymentMethodCode: options.invoicePaymentMethodCode ?? 'PPD',
            certificateNumber: invoiceIsStamped ? '30001000000500003416' : null,
            satCertificateNumber: invoiceIsStamped ? 'SAT-CERTIFICATE' : null,
            certificationProviderTaxId: invoiceIsStamped
              ? 'PAC010101AAA'
              : null,
            cfdiSeal: invoiceIsStamped ? 'cfdi-seal' : null,
            satSeal: invoiceIsStamped ? 'sat-seal' : null,
            fiscalStatus:
              options.invoiceFiscalStatus ?? InvoiceFiscalStatus.STAMPED,
            cancellationStatus: FiscalCancellationStatus.NOT_REQUESTED,
            subtotal,
            discount,
            tax,
            total,
            status: InvoiceStatus.ACTIVE,
            createdByUserId: actorId,
          },
        });
        await tx.invoiceConcept.create({
          data: {
            invoiceId: invoice.id,
            sourceSaleItemId: saleItem.id,
            lineNumber: 1,
            productServiceCode: '50111500',
            description: 'REP PostgreSQL fixture',
            quantity: decimal(1),
            unitCode: 'ACT',
            unitValue: subtotal,
            amount: subtotal,
            discount,
            taxObjectCode: '01',
            taxAmount: tax,
            total,
            snapshotHash: 'd'.repeat(64),
          },
        });
        const invoiceSaleDocument = await tx.invoiceSaleDocument.create({
          data: {
            invoiceId: invoice.id,
            saleDocumentId: saleDocument.id,
            billingRequestSaleDocumentId: requestDocument.id,
            subtotalApplied: taxableBase,
            taxApplied: tax,
            totalApplied: total,
            createdByUserId: actorId,
          },
        });
        await tx.invoiceSaleItemApplication.create({
          data: {
            invoiceSaleDocumentId: invoiceSaleDocument.id,
            saleItemId: saleItem.id,
            subtotalApplied: taxableBase,
            taxApplied: tax,
            totalApplied: total,
            createdByUserId: actorId,
          },
        });

        if (options.invoiceStatus === InvoiceStatus.CANCELLED) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              status: InvoiceStatus.CANCELLED,
              cancellationStatus: FiscalCancellationStatus.ACCEPTED,
              cancelledAt: new Date(),
            },
          });
        }
        invoices.push({
          id: invoice.id,
          uuid: invoiceUuid ?? '',
          folio,
          total: total.toFixed(2),
        });
      }

      const accountReceivable = await tx.accountReceivable.create({
        data: {
          customerId,
          saleId: sale.id,
          originalSaleId: sale.id,
          originalAmount: saleTotal,
          outstandingAmount: saleTotal,
          saleDate: new Date('2026-08-23T00:00:00.000Z'),
          dueDate: new Date('2026-09-22T00:00:00.000Z'),
          paymentTermsDays: 30,
          status: CollectionStatus.UNPAID,
        },
      });
      const payment = await tx.payment.create({
        data: {
          accountReceivableId: accountReceivable.id,
          saleId: sale.id,
          customerId,
          userId: actorId,
          amount: decimal(options.paymentAmount ?? saleTotal),
          currencyCode: 'MXN',
          exchangeRateToMxn: decimal(1),
          fiscalPaymentFormCode:
            options.paymentFormCode === undefined
              ? '03'
              : options.paymentFormCode,
          paymentMethod: PaymentMethod.TRANSFER,
          operationalLocationId: locationId,
          status: options.paymentStatus ?? PaymentStatus.APPLIED,
          paidAt: options.paymentPaidAt
            ? new Date(options.paymentPaidAt)
            : new Date('2026-08-24T10:00:00.000Z'),
        },
      });

      return {
        saleId: sale.id,
        accountReceivableId: accountReceivable.id,
        paymentId: payment.id,
        paymentPaidAt: payment.paidAt,
        invoices,
        invoiceIds: invoices.map((invoice) => invoice.id),
        invoiceUuids: invoices.map((invoice) => invoice.uuid),
      };
    });
  }

  async function createPayment(
    scenario: Scenario,
    options: { amount: string; paidAt: string },
  ) {
    return prisma.payment.create({
      data: {
        accountReceivableId: scenario.accountReceivableId,
        saleId: scenario.saleId,
        customerId,
        userId: actorId,
        amount: decimal(options.amount),
        currencyCode: 'MXN',
        exchangeRateToMxn: decimal(1),
        fiscalPaymentFormCode: '03',
        paymentMethod: PaymentMethod.TRANSFER,
        operationalLocationId: locationId,
        status: PaymentStatus.APPLIED,
        paidAt: new Date(options.paidAt),
      },
    });
  }
});

interface ScenarioOptions {
  readonly invoiceTotals?: readonly string[];
  readonly paymentAmount?: Prisma.Decimal.Value;
  readonly paymentPaidAt?: Date | string;
  readonly paymentFormCode?: string | null;
  readonly paymentStatus?: PaymentStatus;
  readonly invoicePaymentMethodCode?: string;
  readonly invoiceFiscalStatus?: InvoiceFiscalStatus;
  readonly invoiceStatus?: InvoiceStatus;
}

interface ScenarioInvoice {
  readonly id: string;
  readonly uuid: string;
  readonly folio: string;
  readonly total: string;
}

interface Scenario {
  readonly saleId: string;
  readonly accountReceivableId: string;
  readonly paymentId: string;
  readonly paymentPaidAt: Date;
  readonly invoices: readonly ScenarioInvoice[];
  readonly invoiceIds: readonly string[];
  readonly invoiceUuids: readonly string[];
}
