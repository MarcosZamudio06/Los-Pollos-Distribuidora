import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import {
  CreditStatus,
  CustomerType,
  InventoryMovementType,
  PaymentMethod,
  ProductPresentationType,
  ProductUnit,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { configureHttpApplication } from '../src/bootstrap/configure-http-application';
import { PrismaService } from '../src/database/prisma.service';
import { AppModule } from '../src/app.module';
import { AccountsReceivableAgingJob } from '../src/modules/accounts-receivable/accounts-receivable-aging.job';
import { seed } from '../prisma/seed';
import { assertDisposableE2eEnvironment } from './e2e-environment';

const routingEnvironment = {
  OSRM_URL: 'http://localhost:5000',
  PHOTON_URL: 'http://localhost:2322',
  VROOM_URL: 'http://localhost:3000',
} as const;

function currentBusinessDate(): string {
  const timeZone = process.env.APP_TIMEZONE ?? 'America/Mexico_City';
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function decimalToFixed(
  value: unknown,
  scale: number,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  return Number(value).toFixed(scale);
}

describe('Operational day journey (e2e)', () => {
  const marker = `e2e-operational-day-${randomUUID()}`;
  const businessDate = currentBusinessDate();
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let productId: string;
  let supplierId: string;
  let customerId: string;
  let cedisLocationId: string;
  let branchLocationId: string;
  let terminalId: string;
  let deviceId: string;

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    process.env.JWT_ACCESS_SECRET ??=
      'e2e-access-secret-at-least-32-characters';
    process.env.JWT_REFRESH_SECRET ??=
      'e2e-refresh-secret-at-least-32-characters';
    process.env.SWAGGER_ENABLED = 'false';
    Object.assign(process.env, routingEnvironment);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AccountsReceivableAgingJob)
      .useValue({ onApplicationBootstrap: jest.fn() })
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureHttpApplication(app, moduleFixture.get(ConfigService));
    await app.init();

    prisma = moduleFixture.get(PrismaService);
    await seed(prisma as never);

    const [cedis, branch] = await Promise.all([
      prisma.operationalLocation.findUnique({ where: { code: 'CEDIS-VER' } }),
      prisma.operationalLocation.findUnique({ where: { code: 'VER' } }),
    ]);
    if (!cedis || !branch)
      throw new Error('Base operational locations missing');
    cedisLocationId = cedis.id;
    branchLocationId = branch.id;

    const businessDateValue = new Date(`${businessDate}T00:00:00.000Z`);
    const existingClose = await prisma.pointOfSaleDailyClose.findFirst({
      where: {
        operationalLocationId: branchLocationId,
        businessDate: businessDateValue,
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
    });
    if (existingClose) {
      throw new Error(
        `Disposable E2E database already contains a daily close for ${businessDate}`,
      );
    }

    const product = await prisma.product.create({
      data: {
        name: `${marker} wings`,
        sku: marker,
        presentationType: ProductPresentationType.CUT,
        salePrice: 12,
        purchaseCost: 8,
        unit: ProductUnit.PIECE,
        isActive: true,
      },
    });
    productId = product.id;

    const supplier = await prisma.supplier.create({
      data: { name: `${marker} supplier` },
    });
    supplierId = supplier.id;

    const customer = await prisma.customer.create({
      data: {
        customerNumber: marker,
        name: `${marker} customer`,
        customerType: CustomerType.RETAIL,
        creditLimit: 1000,
        creditDays: 30,
        creditStatus: CreditStatus.ACTIVE,
        isActive: true,
      },
    });
    customerId = customer.id;

    deviceId = `${marker}-device`;
    const terminal = await prisma.cashTerminal.create({
      data: {
        operationalLocationId: branchLocationId,
        code: `${marker}-terminal`,
        name: `${marker} terminal`,
        deviceId,
      },
    });
    terminalId = terminal.id;

    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'dev.admin@pollos.local',
        password: 'DevOnly-ChangeMe-2026!',
      })
      .expect(200);
    accessToken = loginResponse.body.data.accessToken as string;
  });

  it('reconciles purchase, CEDIS supply/receipt, PIECE sales, collection, return, and coordinated close', async () => {
    const auth = { Authorization: `Bearer ${accessToken}` };

    const purchasePayload = {
      supplierId,
      locationId: cedisLocationId,
      items: [
        {
          productId,
          unit: ProductUnit.PIECE,
          quantityPieces: 10,
          unitCost: 8,
        },
      ],
    };
    const purchase = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth)
      .set('Idempotency-Key', `${marker}:purchase`)
      .send(purchasePayload)
      .expect(201);
    expect(purchase.body.data.status).toBe('CONFIRMED');
    expect(purchase.body.data.total).toBe('80.00');

    const purchaseRetry = await request(app.getHttpServer())
      .post('/api/purchases')
      .set(auth)
      .set('Idempotency-Key', `${marker}:purchase`)
      .send(purchasePayload)
      .expect(201);
    expect(purchaseRetry.body.data.id).toBe(purchase.body.data.id);

    const cedisBalanceAfterPurchase = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: {
          productId,
          locationId: cedisLocationId,
        },
      },
    });
    expect(cedisBalanceAfterPurchase?.quantityPieces).toBe(10);

    const cycle = await request(app.getHttpServer())
      .post('/api/cedis/branch-supply-cycles')
      .set(auth)
      .set('Idempotency-Key', `${marker}:cycle-open`)
      .send({
        distributionCenterLocationId: cedisLocationId,
        branchLocationId,
        businessDate,
        notes: marker,
      })
      .expect(201);
    const cycleId = cycle.body.data.id as string;

    const supply = await request(app.getHttpServer())
      .post(`/api/cedis/branch-supply-cycles/${cycleId}/supplies`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply`)
      .send({
        expectedVersion: cycle.body.data.version,
        items: [
          {
            productId,
            unit: ProductUnit.PIECE,
            quantityKg: 0,
            quantityPieces: 10,
          },
        ],
      })
      .expect(201);
    const supplyTransferId = supply.body.data.transfer.id as string;
    expect(supply.body.data.transfer.status).toBe('REQUESTED');

    await request(app.getHttpServer())
      .post(`/api/inventory-transfers/${supplyTransferId}/confirm`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:invalid-supply-confirm`)
      .expect(400)
      .expect(({ body }) => {
        expect(body.error).toBe('BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED');
      });
    expect(
      await prisma.inventoryMovement.count({
        where: { transferId: supplyTransferId },
      }),
    ).toBe(0);

    await request(app.getHttpServer())
      .post(`/api/cedis/branch-supply-cycles/${cycleId}/supplies`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:stale-supply`)
      .send({
        expectedVersion: cycle.body.data.version,
        items: [
          {
            productId,
            unit: ProductUnit.PIECE,
            quantityKg: 0,
            quantityPieces: 10,
          },
        ],
      })
      .expect(409);
    expect(
      await prisma.branchSupplyCycleTransfer.count({
        where: { branchSupplyCycleId: cycleId },
      }),
    ).toBe(1);

    const incoming = await request(app.getHttpServer())
      .get(`/api/cedis/incoming-supplies/${supplyTransferId}`)
      .set(auth)
      .expect(200);
    const incomingItem = incoming.body.data.items[0] as {
      transferItemId: string;
      quantityKg: number;
      quantityPieces: number;
    };
    expect(incoming.body.data.status).toBe('PENDING');

    const received = await request(app.getHttpServer())
      .post(`/api/cedis/incoming-supplies/${supplyTransferId}/receive`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:supply-receive`)
      .send({
        expectedCycleVersion: incoming.body.data.cycleVersion,
        items: [
          {
            transferItemId: incomingItem.transferItemId,
            quantityKg: incomingItem.quantityKg,
            quantityPieces: incomingItem.quantityPieces,
          },
        ],
      })
      .expect(201);
    expect(received.body.data.status).toBe('RECEIVED');

    const branchBalanceAfterReceipt = await prisma.inventoryBalance.findUnique({
      where: {
        productId_locationId: { productId, locationId: branchLocationId },
      },
    });
    expect(branchBalanceAfterReceipt?.quantityPieces).toBe(10);

    const shiftResponse = await request(app.getHttpServer())
      .post('/api/cash-shifts')
      .set(auth)
      .send({
        terminalId,
        deviceId,
        businessDate,
        initialCashFund: 100,
      })
      .expect(201);
    const shiftId = shiftResponse.body.data.id as string;
    const dailyCloseId = shiftResponse.body.data.pointOfSaleDailyClose
      .id as string;

    const cashSalePayload = {
      locationId: branchLocationId,
      cashShiftId: shiftId,
      deviceId,
      saleChannel: 'COUNTER',
      documentType: 'INTERNAL_RECEIPT',
      paymentType: 'CASH_SALE',
      payments: [
        {
          amount: '12.00',
          paymentMethod: PaymentMethod.CASH,
          cashTendered: '12.00',
        },
      ],
      items: [
        {
          productId,
          unit: ProductUnit.PIECE,
          quantityKg: 0,
          quantityPieces: 1,
        },
      ],
    };
    const cashSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set(auth)
      .set('Idempotency-Key', `${marker}:cash-sale`)
      .send(cashSalePayload)
      .expect(201);
    const cashSaleId = cashSale.body.data.sale.id as string;
    expect(cashSale.body.data.sale.total).toBe('12.00');
    expect(cashSale.body.data.sale.collectionStatus).toBe('PAID');

    const cashSaleRetry = await request(app.getHttpServer())
      .post('/api/sales')
      .set(auth)
      .set('Idempotency-Key', `${marker}:cash-sale`)
      .send(cashSalePayload)
      .expect(201);
    expect(cashSaleRetry.body.data.sale.id).toBe(cashSaleId);

    const creditSale = await request(app.getHttpServer())
      .post('/api/sales')
      .set(auth)
      .set('Idempotency-Key', `${marker}:credit-sale`)
      .send({
        ...cashSalePayload,
        customerId,
        paymentType: 'CREDIT_SALE',
        payments: [],
        items: [
          {
            productId,
            unit: ProductUnit.PIECE,
            quantityKg: 0,
            quantityPieces: 2,
          },
        ],
      })
      .expect(201);
    const creditSaleId = creditSale.body.data.sale.id as string;
    const receivableId = creditSale.body.data.accountReceivable.id as string;
    expect(creditSale.body.data.sale.total).toBe('24.00');
    expect(creditSale.body.data.accountReceivable.originalAmount).toBe('24.00');
    expect(creditSale.body.data.accountReceivable.outstandingAmount).toBe(
      '24.00',
    );

    const paymentPayload = {
      accountReceivableId: receivableId,
      amount: '15.00',
      paymentMethod: PaymentMethod.TRANSFER,
      bankName: 'E2E Bank',
      referenceNumber: `${marker}:transfer`,
    };
    const racePaymentPayload = {
      ...paymentPayload,
      referenceNumber: `${marker}:transfer-race`,
    };
    const paymentIdempotencyKeys = [
      `${marker}:collection-a`,
      `${marker}:collection-b`,
    ];
    const collectionAttempts = await Promise.all(
      [paymentPayload, racePaymentPayload].map((payload, index) =>
        request(app.getHttpServer())
          .post(`/api/accounts-receivable/${receivableId}/payments`)
          .set(auth)
          .set('Idempotency-Key', paymentIdempotencyKeys[index])
          .send(payload),
      ),
    );
    expect(
      collectionAttempts.map((response) => response.status).sort(),
    ).toEqual([201, 400]);
    expect(
      collectionAttempts.find((response) => response.status === 400)?.body
        .message,
    ).toBe('Payment amount cannot exceed outstanding balance');
    const winningIndex = collectionAttempts.findIndex(
      (response) => response.status === 201,
    );
    expect(winningIndex).toBeGreaterThanOrEqual(0);
    const collection = collectionAttempts[winningIndex]!;
    const winningPaymentPayload = [paymentPayload, racePaymentPayload][
      winningIndex
    ]!;
    const winningIdempotencyKey = paymentIdempotencyKeys[winningIndex]!;
    expect(collection.body.data.payment.paymentMethod).toBe(
      PaymentMethod.TRANSFER,
    );
    expect(collection.body.data.payment.pointOfSaleDailyCloseId).toBeNull();
    expect(collection.body.data.accountReceivable.outstandingAmount).toBe(
      '9.00',
    );

    const collectionRetry = await request(app.getHttpServer())
      .post(`/api/accounts-receivable/${receivableId}/payments`)
      .set(auth)
      .set('Idempotency-Key', winningIdempotencyKey)
      .send(winningPaymentPayload)
      .expect(201);
    expect(collectionRetry.body.data.payment.id).toBe(
      collection.body.data.payment.id,
    );

    const returnCycle = await request(app.getHttpServer())
      .get(`/api/cedis/branch-supply-cycles/${cycleId}`)
      .set(auth)
      .expect(200);
    const returned = await request(app.getHttpServer())
      .post(`/api/cedis/branch-supply-cycles/${cycleId}/returns`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:return`)
      .send({
        expectedVersion: returnCycle.body.data.version,
        items: [
          {
            productId,
            unit: ProductUnit.PIECE,
            quantityKg: 0,
            quantityPieces: 7,
          },
        ],
      })
      .expect(201);
    const returnTransferId = returned.body.data.transfer.id as string;
    await request(app.getHttpServer())
      .post(`/api/inventory-transfers/${returnTransferId}/confirm`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:return-confirm`)
      .expect(201);

    const beforeRefresh = await request(app.getHttpServer())
      .get(`/api/cedis/branch-supply-cycles/${cycleId}`)
      .set(auth)
      .expect(200);
    const refreshed = await request(app.getHttpServer())
      .post(`/api/cedis/branch-supply-cycles/${cycleId}/refresh`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:cycle-refresh`)
      .send({ expectedVersion: beforeRefresh.body.data.version })
      .expect(201);
    expect(refreshed.body.data.status).toBe('READY_FOR_REVIEW');
    expect(refreshed.body.data.totals.suppliedPieces).toBe(10);
    expect(refreshed.body.data.totals.returnedPieces).toBe(7);
    expect(refreshed.body.data.totals.expectedSoldPieces).toBe(3);
    expect(refreshed.body.data.totals.actualSoldPieces).toBe(3);
    expect(refreshed.body.data.totals.expectedSalesTotal).toBe(36);
    expect(refreshed.body.data.totals.actualSalesTotal).toBe(36);

    const closedShift = await request(app.getHttpServer())
      .patch(`/api/cash-shifts/${shiftId}/close`)
      .set(auth)
      .send({ deviceId, cashCountedTotal: 112 })
      .expect(200);
    expect(closedShift.body.data.status).toBe('CLOSED');

    const validated = await request(app.getHttpServer())
      .post(`/api/point-of-sale-daily-closes/${dailyCloseId}/validate`)
      .set(auth)
      .expect(201);
    expect(validated.body.data.valid).toBe(true);

    const reviewed = await request(app.getHttpServer())
      .patch(`/api/point-of-sale-daily-closes/${dailyCloseId}/review`)
      .set(auth)
      .send({ version: validated.body.data.close.version })
      .expect(200);
    expect(reviewed.body.data.status).toBe('REVIEWED');

    const beforeCloseRefresh = await request(app.getHttpServer())
      .get(`/api/cedis/branch-supply-cycles/${cycleId}`)
      .set(auth)
      .expect(200);
    const finalRefresh = await request(app.getHttpServer())
      .post(`/api/cedis/branch-supply-cycles/${cycleId}/refresh`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:cycle-close-refresh`)
      .send({ expectedVersion: beforeCloseRefresh.body.data.version })
      .expect(201);
    expect(finalRefresh.body.data.status).toBe('READY_FOR_REVIEW');

    const closedCycle = await request(app.getHttpServer())
      .post(`/api/cedis/branch-supply-cycles/${cycleId}/close`)
      .set(auth)
      .set('Idempotency-Key', `${marker}:cycle-close`)
      .send({ expectedVersion: finalRefresh.body.data.version })
      .expect(201);
    expect(closedCycle.body.data.status).toBe('CLOSED');

    const [
      balances,
      movements,
      persistedSales,
      receivable,
      persistedPayments,
      finalClose,
      finalCycle,
    ] = await Promise.all([
      prisma.inventoryBalance.findMany({
        where: {
          productId,
          locationId: { in: [cedisLocationId, branchLocationId] },
        },
      }),
      prisma.inventoryMovement.findMany({
        where: { productId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.sale.findMany({
        where: { id: { in: [cashSaleId, creditSaleId] } },
        select: { id: true, total: true, status: true },
      }),
      prisma.accountReceivable.findUnique({
        where: { id: receivableId },
        select: { outstandingAmount: true, status: true },
      }),
      prisma.payment.findMany({
        where: {
          OR: [{ saleId: cashSaleId }, { accountReceivableId: receivableId }],
        },
        select: {
          amount: true,
          paymentMethod: true,
          pointOfSaleDailyCloseId: true,
        },
      }),
      prisma.pointOfSaleDailyClose.findUnique({
        where: { id: dailyCloseId },
        select: {
          status: true,
          grossSalesTotal: true,
          cashTotal: true,
          cashCountedTotal: true,
          cashDifferenceTotal: true,
        },
      }),
      prisma.branchSupplyCycle.findUnique({
        where: { id: cycleId },
        select: {
          status: true,
          totalExpectedSoldPieces: true,
          totalActualSoldPieces: true,
          expectedSalesTotal: true,
          actualSalesTotal: true,
        },
      }),
    ]);

    const balanceByLocation = new Map(
      balances.map((balance) => [balance.locationId, balance]),
    );
    expect(balanceByLocation.get(cedisLocationId)?.quantityPieces).toBe(7);
    expect(balanceByLocation.get(branchLocationId)?.quantityPieces).toBe(0);
    expect(
      movements.reduce<Record<string, number>>((counts, movement) => {
        counts[movement.type] = (counts[movement.type] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({
      [InventoryMovementType.PURCHASE]: 1,
      [InventoryMovementType.SALE]: 2,
      [InventoryMovementType.TRANSFER_IN]: 2,
      [InventoryMovementType.TRANSFER_OUT]: 2,
    });
    expect(
      persistedSales.map((sale) => ({
        ...sale,
        total: decimalToFixed(sale.total, 2),
      })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ total: '12.00', status: 'CONFIRMED' }),
        expect.objectContaining({ total: '24.00', status: 'CONFIRMED' }),
      ]),
    );
    expect({
      outstandingAmount: decimalToFixed(receivable?.outstandingAmount, 2),
      status: receivable?.status,
    }).toEqual({
      outstandingAmount: '9.00',
      status: 'PARTIALLY_PAID',
    });
    expect(persistedPayments).toHaveLength(2);
    expect(
      persistedPayments.map((payment) => ({
        ...payment,
        amount: decimalToFixed(payment.amount, 2),
      })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: '12.00',
          paymentMethod: PaymentMethod.CASH,
          pointOfSaleDailyCloseId: dailyCloseId,
        }),
        expect.objectContaining({
          amount: '15.00',
          paymentMethod: PaymentMethod.TRANSFER,
          pointOfSaleDailyCloseId: null,
        }),
      ]),
    );
    expect({
      status: finalClose?.status,
      grossSalesTotal: decimalToFixed(finalClose?.grossSalesTotal, 2),
      cashTotal: decimalToFixed(finalClose?.cashTotal, 2),
      cashCountedTotal: decimalToFixed(finalClose?.cashCountedTotal, 2),
      cashDifferenceTotal: decimalToFixed(finalClose?.cashDifferenceTotal, 2),
    }).toEqual({
      status: 'CLOSED',
      grossSalesTotal: '36.00',
      cashTotal: '12.00',
      cashCountedTotal: '112.00',
      cashDifferenceTotal: '0.00',
    });
    expect({
      status: finalCycle?.status,
      totalExpectedSoldPieces: decimalToFixed(
        finalCycle?.totalExpectedSoldPieces,
        3,
      ),
      totalActualSoldPieces: decimalToFixed(
        finalCycle?.totalActualSoldPieces,
        3,
      ),
      expectedSalesTotal: decimalToFixed(finalCycle?.expectedSalesTotal, 2),
      actualSalesTotal: decimalToFixed(finalCycle?.actualSalesTotal, 2),
    }).toEqual({
      status: 'CLOSED',
      totalExpectedSoldPieces: '3.000',
      totalActualSoldPieces: '3.000',
      expectedSalesTotal: '36.00',
      actualSalesTotal: '36.00',
    });
  });

  afterAll(async () => {
    await app?.close();
  });
});
