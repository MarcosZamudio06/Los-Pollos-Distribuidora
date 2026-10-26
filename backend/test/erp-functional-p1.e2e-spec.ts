import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID, createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureHttpApplication } from '../src/bootstrap/configure-http-application';
import { PrismaService } from '../src/database/prisma.service';
import { AccountsReceivableAgingJob } from '../src/modules/accounts-receivable/accounts-receivable-aging.job';
import {
  seed,
  DEVELOPMENT_ADMIN_PASSWORD,
  DEVELOPMENT_ROLE_TEST_PASSWORD,
} from '../prisma/seed';
import { assertDisposableE2eEnvironment } from './e2e-environment';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
type Fixture = {
  routeId: string;
  orderId: string;
  arId: string;
  saleId: string;
  stockId: string;
  productId: string;
};

describe('ERP P1 permanent regressions (real HTTP, PostgreSQL and object storage)', () => {
  const marker = `p1-${randomUUID()}`;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let cedisId: string;
  let driverId: string;
  const tokens: Record<string, string> = {};
  let sequence = 0;
  const key = () => `${marker}:${++sequence}`;
  const api = () => request(app.getHttpServer());
  const auth = (role = 'admin') => ({
    Authorization: `Bearer ${tokens[role]}`,
  });

  async function boot() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AccountsReceivableAgingJob)
      .useValue({ onApplicationBootstrap() {} })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttpApplication(app, module.get(ConfigService));
    await app.init();
    prisma = module.get(PrismaService);
  }
  async function login(role: string) {
    const response = await api()
      .post('/api/auth/login')
      .send({
        email: `dev.${role}@pollos.local`,
        password:
          role === 'admin'
            ? DEVELOPMENT_ADMIN_PASSWORD
            : DEVELOPMENT_ROLE_TEST_PASSWORD,
      })
      .expect(200);
    tokens[role] = response.body.data.accessToken;
  }
  async function post(
    path: string,
    body: object = {},
    role = 'admin',
    idempotencyKey = key(),
  ) {
    return api()
      .post(`/api/${path}`)
      .set(auth(role))
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
  }
  async function fixture(initialAmount = 0): Promise<Fixture> {
    const label = key();
    const product = await prisma.product.create({
      data: {
        name: label,
        sku: label,
        presentationType: 'CUT',
        unit: 'PIECE',
        salePrice: 100,
        purchaseCost: 60,
      },
    });
    const customer = await prisma.customer.create({
      data: {
        customerNumber: label,
        name: label,
        customerType: 'RETAIL',
        creditLimit: 10000,
        creditDays: 30,
        creditStatus: 'ACTIVE',
      },
    });
    const supplier = await prisma.supplier.create({ data: { name: label } });
    const stock = await prisma.operationalLocation.create({
      data: { name: label, code: label, type: 'ROUTE_STOCK' },
    });
    await post('purchases', {
      supplierId: supplier.id,
      locationId: cedisId,
      items: [
        {
          productId: product.id,
          unit: 'PIECE',
          quantityPieces: 10,
          unitCost: 60,
        },
      ],
    }).then((r) => expect(r.status).toBe(201));
    async function transfer(
      originLocationId: string,
      destinationLocationId: string,
      pieces: number,
    ) {
      const created = await post('inventory-transfers', {
        originLocationId,
        destinationLocationId,
        items: [
          {
            productId: product.id,
            unit: 'PIECE',
            quantityPieces: pieces,
            quantityKg: 0,
          },
        ],
      });
      expect(created.status).toBe(201);
      const confirmed = await post(
        `inventory-transfers/${created.body.data.id}/confirm`,
      );
      expect(confirmed.status).toBe(201);
    }
    await transfer(cedisId, stock.id, 10);
    const sale = await post('sales', {
      locationId: stock.id,
      saleChannel: 'ROUTE',
      documentType: 'INTERNAL_RECEIPT',
      customerId: customer.id,
      paymentType: 'CREDIT_SALE',
      payments: initialAmount
        ? [
            {
              amount: String(initialAmount),
              paymentMethod: 'TRANSFER',
              bankName: 'Test bank',
              referenceNumber: marker,
            },
          ]
        : [],
      items: [
        {
          productId: product.id,
          unit: 'PIECE',
          quantityPieces: 1,
          quantityKg: 0,
        },
      ],
    });
    expect(sale.status).toBe(201);
    const ar = await prisma.accountReceivable.findUniqueOrThrow({
      where: { saleId: sale.body.data.sale.id },
    });
    const route = await post('delivery-routes', {
      name: label,
      driverId,
      scheduledDate: new Date().toISOString(),
      originLocationId: cedisId,
      routeStockLocationId: stock.id,
      orders: [
        {
          saleId: sale.body.data.sale.id,
          deliveryAddress: 'Disposable test address',
        },
      ],
    });
    expect(route.status).toBe(201);
    const routeId = route.body.data.id;
    const order = await prisma.deliveryOrder.findUniqueOrThrow({
      where: { saleId: sale.body.data.sale.id },
    });
    await api()
      .patch(`/api/delivery-routes/${routeId}/status`)
      .set(auth())
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    const evidence = await post(`delivery-orders/${order.id}/evidence`, {
      type: 'PHOTO',
      value: png,
      capturedAt: new Date().toISOString(),
    });
    expect(evidence.status).toBe(201);
    const photo = await prisma.deliveryEvidence.findFirstOrThrow({
      where: { deliveryOrderId: order.id },
    });
    expect(photo.value).toBeNull();
    const downloaded = await fetch(evidence.body.data.contentUrl);
    expect(downloaded.status).toBe(200);
    expect(
      createHash('sha256')
        .update(Buffer.from(await downloaded.arrayBuffer()))
        .digest('hex'),
    ).toBe(photo.sha256);
    await api()
      .patch(`/api/delivery-orders/${order.id}/status`)
      .set(auth())
      .send({ status: 'DELIVERED' })
      .expect(200);
    await api()
      .patch(`/api/delivery-routes/${routeId}/status`)
      .set(auth())
      .send({ status: 'COMPLETED' })
      .expect(200);
    await transfer(stock.id, cedisId, 9);
    expect(
      await prisma.inventoryMovement.count({
        where: { productId: product.id },
      }),
    ).toBe(6);
    expect(
      (
        await prisma.inventoryBalance.findUniqueOrThrow({
          where: {
            productId_locationId: {
              productId: product.id,
              locationId: stock.id,
            },
          },
        })
      ).quantityPieces,
    ).toBe(0);
    return {
      routeId,
      orderId: order.id,
      arId: ar.id,
      saleId: sale.body.data.sale.id,
      stockId: stock.id,
      productId: product.id,
    };
  }
  async function collect(
    f: Fixture,
    amount: number,
    paymentMethod = 'CASH',
    pass = 1,
    role = 'driver',
    idempotencyKey = key(),
  ) {
    const ar = await prisma.accountReceivable.findUniqueOrThrow({
      where: { id: f.arId },
    });
    return post(
      `delivery-orders/${f.orderId}/collections`,
      {
        accountReceivableId: f.arId,
        amount,
        paymentMethod,
        collectionPass: pass,
        expectedVersion: ar.version,
        reference: 'local-test',
      },
      role,
      idempotencyKey,
    );
  }
  async function open(f: Fixture, idempotencyKey = key()) {
    const response = await post(
      `delivery-routes/${f.routeId}/settlement`,
      {},
      'admin',
      idempotencyKey,
    );
    expect(response.status).toBe(201);
    return response.body.data;
  }
  async function close(
    id: string,
    expectedVersion: number,
    idempotencyKey = key(),
  ) {
    return post(
      `route-settlements/${id}/close`,
      { expectedVersion, notes: marker },
      'admin',
      idempotencyKey,
    );
  }

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    if (!process.env.NODE_OPTIONS?.includes('no-local-env.cjs'))
      throw new Error(
        'Use scripts/test-erp-functional-p1.sh to exclude workstation dotenv files',
      );
    const db = new URL(process.env.DATABASE_URL!);
    if (db.hostname !== '127.0.0.1' || db.pathname !== '/pollos_p1_e2e')
      throw new Error('Dedicated loopback p1 database required');
    if (
      process.env.CFDI_ENABLED !== 'false' ||
      process.env.FISCAL_PROVIDER !== 'NONE'
    )
      throw new Error('External fiscal integration must be disabled');
    const storage = new S3Client({
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
      },
    });
    await storage.send(
      new CreateBucketCommand({ Bucket: process.env.OBJECT_STORAGE_BUCKET }),
    );
    storage.destroy();
    await boot();
    await seed(prisma as never);
    cedisId = (
      await prisma.operationalLocation.findUniqueOrThrow({
        where: { code: 'CEDIS-VER' },
      })
    ).id;
    driverId = (
      await prisma.user.findUniqueOrThrow({
        where: { email: 'dev.driver@pollos.local' },
      })
    ).id;
    for (const role of [
      'admin',
      'driver',
      'collections',
      'seller',
      'warehouse',
    ])
      await login(role);
  }, 60000);
  afterAll(async () => {
    await app?.close();
  });

  it('FUNC-002: fully collected physical route100 reconciles without a fictitious difference', async () => {
    const f = await fixture();
    expect((await collect(f, 100)).status).toBe(201);
    const s = await open(f);
    expect(s).toMatchObject({
      expectedCashAmount: 100,
      derivedCollectedCashAmount: 100,
      expectedTransferAmount: 0,
      differenceAmount: 0,
      creditAmount: 0,
      status: 'OPEN',
    });
  });
  it('FUNC-002: pending60 is receivable, not cash expected or a close blocker', async () => {
    const f = await fixture();
    expect((await collect(f, 40)).status).toBe(201);
    const s = await open(f);
    expect(s).toMatchObject({
      expectedCashAmount: 40,
      differenceAmount: 0,
      creditAmount: 60,
      overdueAmount: 0,
    });
    expect((await close(s.id, s.version)).body.data.status).toBe('CLOSED');
    expect(
      Number(
        (
          await prisma.accountReceivable.findUniqueOrThrow({
            where: { id: f.arId },
          })
        ).outstandingAmount,
      ),
    ).toBe(60);
  });
  it('FUNC-003: recalculation persists40+60, second pass and a new version; replay is immutable', async () => {
    const f = await fixture();
    await collect(f, 40);
    const firstKey = key();
    const first = await open(f, firstKey);
    await collect(f, 60, 'TRANSFER', 2);
    const second = await open(f);
    expect(second).toMatchObject({
      id: first.id,
      expectedCashAmount: 40,
      expectedTransferAmount: 60,
      derivedCollectedTransferAmount: 60,
      paidAtDeliveryAmount: 40,
      secondPassCollectionsAmount: 60,
      differenceAmount: 0,
      creditAmount: 0,
    });
    expect(second.version).toBe(first.version + 1);
    expect(await open(f, firstKey)).toEqual(first);
    expect((await close(second.id, first.version)).status).toBe(409);
    const closed = await close(second.id, second.version);
    expect(closed.status).toBe(201);
    expect(closed.body.data).toMatchObject({
      expectedTransferAmount: 60,
      derivedCollectedTransferAmount: 60,
      secondPassCollectionsAmount: 60,
    });
    const row = await prisma.routeSettlement.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(Number(row.expectedTransferAmount)).toBe(60);
    expect(Number(row.secondPassCollectionsAmount)).toBe(60);
  });
  it('FUNC-003: close recalculates payments even without an explicit second calculation', async () => {
    const f = await fixture();
    await collect(f, 40);
    const s = await open(f);
    await collect(f, 60, 'TRANSFER', 2);
    const closed = await close(s.id, s.version);
    expect(closed.status).toBe(201);
    expect(closed.body.data).toMatchObject({
      expectedTransferAmount: 60,
      derivedCollectedTransferAmount: 60,
      secondPassCollectionsAmount: 60,
      creditAmount: 0,
    });
  });
  it('FUNC-004: route reversal and new collection require reopen; completed order cannot regress', async () => {
    const f = await fixture();
    const payment = (await collect(f, 40)).body.data.payment;
    const s = await open(f);
    const closed = await close(s.id, s.version);
    expect(closed.status).toBe(201);
    expect(
      (
        await post(`payments/${payment.id}/cancel`, {
          expectedVersion: 1,
          reason: marker,
        })
      ).status,
    ).toBe(409);
    expect((await collect(f, 60, 'CASH', 2)).status).toBe(409);
    const ar = await prisma.accountReceivable.findUniqueOrThrow({
      where: { id: f.arId },
    });
    expect(
      (
        await post(`accounts-receivable/${f.arId}/payments`, {
          accountReceivableId: f.arId,
          amount: 60,
          paymentMethod: 'TRANSFER',
          referenceNumber: marker,
          routeId: f.routeId,
          expectedVersion: ar.version,
        })
      ).status,
    ).toBe(409);
    for (const role of ['admin', 'driver'])
      await api()
        .patch(`/api/delivery-orders/${f.orderId}/status`)
        .set(auth(role))
        .send({ status: 'IN_ROUTE' })
        .expect(409);
    expect(
      (
        await prisma.deliveryOrder.findUniqueOrThrow({
          where: { id: f.orderId },
        })
      ).status,
    ).toBe('DELIVERED');
    expect(
      Number(
        (
          await prisma.accountReceivable.findUniqueOrThrow({
            where: { id: f.arId },
          })
        ).outstandingAmount,
      ),
    ).toBe(60);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe('APPLIED');
    const reopened = await post(`route-settlements/${s.id}/reopen`, {
      expectedVersion: closed.body.data.version,
      reason: marker,
    });
    expect(reopened.status).toBe(201);
    expect(
      (
        await post(`payments/${payment.id}/cancel`, {
          expectedVersion: 1,
          reason: marker,
        })
      ).status,
    ).toBe(201);
    expect((await collect(f, 100, 'TRANSFER', 2)).status).toBe(201);
  });
  it('FUNC-004: independent later collection does not mutate the closed snapshot or block debt collection', async () => {
    const f = await fixture();
    await collect(f, 40);
    const s = await open(f);
    const closed = await close(s.id, s.version);
    expect(closed.status).toBe(201);
    const before = await prisma.routeSettlement.findUniqueOrThrow({
      where: { id: s.id },
    });
    const ar = await prisma.accountReceivable.findUniqueOrThrow({
      where: { id: f.arId },
    });
    const payment = await post(
      `accounts-receivable/${f.arId}/payments`,
      {
        accountReceivableId: f.arId,
        amount: 60,
        paymentMethod: 'TRANSFER',
        referenceNumber: marker,
        expectedVersion: ar.version,
      },
      'collections',
    );
    expect(payment.status).toBe(201);
    expect(
      await prisma.routeSettlement.findUniqueOrThrow({ where: { id: s.id } }),
    ).toEqual(before);
    const detail = await api()
      .get(`/api/route-settlements/${s.id}`)
      .set(auth())
      .expect(200);
    expect(detail.body.data.creditAmount).toBe(60);
    expect(detail.body.data.orders[0].outstandingAmount).toBe(60);
  });
  it('FUNC-004: collection versus close serializes into current closed money or a rejected collection', async () => {
    const f = await fixture();
    await collect(f, 40);
    const s = await open(f);
    const [payment, closed] = await Promise.all([
      collect(f, 60, 'TRANSFER', 2),
      close(s.id, s.version),
    ]);
    expect([201, 409]).toContain(payment.status);
    expect(closed.status).toBe(201);
    const row = await prisma.routeSettlement.findUniqueOrThrow({
      where: { id: s.id },
    });
    const sum = await prisma.payment.aggregate({
      where: { routeId: f.routeId, status: 'APPLIED' },
      _sum: { amount: true },
    });
    expect(
      Number(row.expectedCashAmount) + Number(row.expectedTransferAmount),
    ).toBe(Number(sum._sum.amount));
    expect(Number(row.secondPassCollectionsAmount)).toBe(
      payment.status === 201 ? 60 : 0,
    );
  });
  it('FUNC-001: ADMIN/COLLECTIONS list and read versioned detail, invalid roles cannot read/close/reopen', async () => {
    const f = await fixture();
    await collect(f, 100);
    const s = await open(f);
    for (const role of ['admin', 'collections']) {
      const list = await api()
        .get('/api/route-settlements')
        .set(auth(role))
        .query({ routeId: f.routeId, page: 1, limit: 1 })
        .expect(200);
      expect(list.body.data.items).toHaveLength(1);
      expect(list.body.data.total).toBe(1);
      const detail = await api()
        .get(`/api/route-settlements/${s.id}`)
        .set(auth(role))
        .expect(200);
      expect(detail.body.data).toMatchObject({
        id: s.id,
        version: s.version,
        routeStockLocationId: f.stockId,
      });
      expect(detail.body.data.orders).toHaveLength(1);
      expect(detail.body.data.payments).toHaveLength(1);
    }
    for (const role of ['driver', 'seller', 'warehouse']) {
      await api().get('/api/route-settlements').set(auth(role)).expect(403);
      await api()
        .get(`/api/route-settlements/${s.id}`)
        .set(auth(role))
        .expect(403);
      expect(
        (
          await post(
            `route-settlements/${s.id}/close`,
            { expectedVersion: s.version },
            role,
          )
        ).status,
      ).toBe(403);
    }
    await api().get(`/api/route-settlements/${s.id}`).expect(401);
    await api().get('/api/route-settlements/missing').set(auth()).expect(404);
    await api()
      .get('/api/route-settlements')
      .set(auth())
      .query({ limit: -1 })
      .expect(400);
    expect(
      (
        await post(
          `route-settlements/${s.id}/reopen`,
          { expectedVersion: s.version, reason: marker },
          'collections',
        )
      ).status,
    ).toBe(403);
  });
  it('FUNC-001/003: application restart preserves detail, totals and close replay without duplicating version', async () => {
    const f = await fixture();
    await collect(f, 40);
    const s = await open(f);
    await collect(f, 60, 'TRANSFER', 2);
    const recalculated = await open(f);
    const closeKey = key();
    const closed = await close(s.id, recalculated.version, closeKey);
    expect(closed.status).toBe(201);
    await app.close();
    await boot();
    await login('admin');
    const detail = await api()
      .get(`/api/route-settlements/${s.id}`)
      .set(auth())
      .expect(200);
    expect(detail.body.data).toMatchObject({
      status: 'CLOSED',
      version: closed.body.data.version,
      expectedCashAmount: 40,
      expectedTransferAmount: 60,
      secondPassCollectionsAmount: 60,
    });
    expect(
      (await close(s.id, recalculated.version, closeKey)).body.data.version,
    ).toBe(closed.body.data.version);
    expect(
      await prisma.routeSettlement.count({ where: { routeId: f.routeId } }),
    ).toBe(1);
  });
  it('FUNC-005: POS businessDate survives evening, midnight and a shift crossing days', async () => {
    const label = key();
    const branch = await prisma.operationalLocation.create({
      data: { name: label, code: label, type: 'BRANCH', parentId: cedisId },
    });
    const product = await prisma.product.create({
      data: {
        name: label,
        sku: label,
        presentationType: 'CUT',
        unit: 'PIECE',
        salePrice: 100,
        purchaseCost: 60,
      },
    });
    await prisma.inventoryBalance.create({
      data: { productId: product.id, locationId: branch.id, quantityPieces: 6 },
    });
    const terminal = await prisma.cashTerminal.create({
      data: {
        name: label,
        code: label,
        deviceId: label,
        operationalLocationId: branch.id,
      },
    });
    const shift = await post('cash-shifts', {
      terminalId: terminal.id,
      deviceId: label,
      businessDate: '2026-10-23',
      initialCashFund: 0,
    });
    expect(shift.status).toBe(201);
    const instants = [
      '2026-10-23T23:59:00Z',
      '2026-10-24T00:00:00Z',
      '2026-10-24T02:30:00Z',
      '2026-10-24T05:59:00Z',
      '2026-10-24T06:00:00Z',
      '2026-10-24T06:01:00Z',
    ];
    const ids: string[] = [];
    for (const instant of instants) {
      const sale = await post('sales', {
        locationId: branch.id,
        cashShiftId: shift.body.data.id,
        deviceId: label,
        saleChannel: 'COUNTER',
        documentType: 'INTERNAL_RECEIPT',
        paymentType: 'CASH_SALE',
        payments: [
          { amount: '40.00', paymentMethod: 'CASH', cashTendered: '40.00' },
          {
            amount: '60.00',
            paymentMethod: 'TRANSFER',
            bankName: 'Test bank',
            referenceNumber: marker,
          },
        ],
        items: [
          {
            productId: product.id,
            unit: 'PIECE',
            quantityPieces: 1,
            quantityKg: 0,
          },
        ],
      });
      expect(sale.status).toBe(201);
      const id = sale.body.data.sale.id as string;
      ids.push(id);
      await prisma.sale.update({
        where: { id },
        data: { createdAt: new Date(instant), registeredAt: new Date(instant) },
      });
      await prisma.payment.updateMany({
        where: { saleId: id },
        data: { paidAt: new Date(instant) },
      });
    }
    await prisma.cashShift.update({
      where: { id: shift.body.data.id },
      data: { openedAt: new Date('2026-10-23T12:00:00Z') },
    });
    const daily = await api()
      .get('/api/reports/sales-daily')
      .set(auth())
      .query({ date: '2026-10-23', locationId: branch.id })
      .expect(200);
    expect(daily.body.data.summary).toMatchObject({
      count: 6,
      total: '600.00',
    });
    const following = await api()
      .get('/api/reports/sales-daily')
      .set(auth())
      .query({ date: '2026-10-24', locationId: branch.id })
      .expect(200);
    expect(following.body.data.summary.count).toBe(0);
    const cash = await api()
      .get('/api/reports/cash-closing')
      .set(auth())
      .query({ date: '2026-10-23', locationId: branch.id })
      .expect(200);
    expect(cash.body.data.totalsByPaymentMethod).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ paymentMethod: 'CASH', amount: '240.00' }),
        expect.objectContaining({
          paymentMethod: 'TRANSFER',
          amount: '360.00',
        }),
      ]),
    );
    const nextCash = await api()
      .get('/api/reports/cash-closing')
      .set(auth())
      .query({ date: '2026-10-24', locationId: branch.id })
      .expect(200);
    expect(nextCash.body.data.totalsByPaymentMethod).toHaveLength(0);
    const closeRow = await prisma.pointOfSaleDailyClose.findUniqueOrThrow({
      where: { id: shift.body.data.pointOfSaleDailyClose.id },
    });
    expect(Number(closeRow.grossSalesTotal)).toBe(600);
    expect(Number(closeRow.cashTotal)).toBe(240);
    expect(Number(closeRow.transferTotal)).toBe(360);
    expect(
      (
        await prisma.sale.findUniqueOrThrow({ where: { id: ids[4] } })
      ).createdAt.toISOString(),
    ).toBe('2026-10-24T06:00:00.000Z');
  });
  it('FUNC-005: unshifted route payments follow local paidAt and APP_TIMEZONE, not historical sale date', async () => {
    const f = await fixture();
    const payment = (await collect(f, 40)).body.data.payment;
    await prisma.sale.update({
      where: { id: f.saleId },
      data: { createdAt: new Date('2026-10-24T02:30:00Z') },
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        paidAt: new Date('2026-10-25T05:59:59Z'),
        operationalLocationId: f.stockId,
      },
    });
    const sales = await api()
      .get('/api/reports/sales-daily')
      .set(auth())
      .query({ date: '2026-10-23', locationId: f.stockId })
      .expect(200);
    expect(sales.body.data.summary.total).toBe('100.00');
    const cash23 = await api()
      .get('/api/reports/cash-closing')
      .set(auth())
      .query({ date: '2026-10-23', locationId: f.stockId })
      .expect(200);
    expect(cash23.body.data.routeCollections).toHaveLength(0);
    const cash24 = await api()
      .get('/api/reports/cash-closing')
      .set(auth())
      .query({ date: '2026-10-24', locationId: f.stockId })
      .expect(200);
    expect(cash24.body.data.routeCollections).toEqual(
      expect.arrayContaining([expect.objectContaining({ amount: '40.00' })]),
    );
    const before = process.env.APP_TIMEZONE;
    try {
      process.env.APP_TIMEZONE = 'America/Cancun';
      const cancun = await api()
        .get('/api/reports/cash-closing')
        .set(auth())
        .query({ date: '2026-10-25', locationId: f.stockId })
        .expect(200);
      expect(cancun.body.data.routeCollections).toEqual(
        expect.arrayContaining([expect.objectContaining({ amount: '40.00' })]),
      );
    } finally {
      process.env.APP_TIMEZONE = before;
    }
  });

  it('FUNC-002: an initial payment outside driver custody is not counted twice', async () => {
    const f = await fixture(40);
    expect((await collect(f, 60)).status).toBe(201);
    const s = await open(f);
    expect(s).toMatchObject({
      expectedCashAmount: 60,
      expectedTransferAmount: 0,
      paidAtDeliveryAmount: 60,
      creditAmount: 0,
      differenceAmount: 0,
    });
    expect(
      Number(
        (
          await prisma.accountReceivable.findUniqueOrThrow({
            where: { id: f.arId },
          })
        ).outstandingAmount,
      ),
    ).toBe(0);
  });
  it('FUNC-003/004: collection replay survives later settlement assignment; close and reopen commands stay idempotent', async () => {
    const f = await fixture();
    const paymentKey = key();
    const body = {
      accountReceivableId: f.arId,
      amount: 40,
      paymentMethod: 'CASH',
      collectionPass: 1,
      expectedVersion: 1,
    };
    const payment = await post(
      `delivery-orders/${f.orderId}/collections`,
      body,
      'driver',
      paymentKey,
    );
    expect(payment.status).toBe(201);
    const s = await open(f);
    const replay = await post(
      `delivery-orders/${f.orderId}/collections`,
      body,
      'driver',
      paymentKey,
    );
    expect(replay.status).toBe(201);
    expect(replay.body.data.payment.id).toBe(payment.body.data.payment.id);
    const closeKey = key();
    const [a, b] = await Promise.all([
      close(s.id, s.version, closeKey),
      close(s.id, s.version, closeKey),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data).toEqual(b.body.data);
    const reopenKey = key();
    const reopenBody = { expectedVersion: a.body.data.version, reason: marker };
    const reopened = await post(
      `route-settlements/${s.id}/reopen`,
      reopenBody,
      'admin',
      reopenKey,
    );
    expect(reopened.status).toBe(201);
    await open(f);
    const replayReopen = await post(
      `route-settlements/${s.id}/reopen`,
      reopenBody,
      'admin',
      reopenKey,
    );
    expect(replayReopen.body.data).toEqual(reopened.body.data);
    const oldClose = await close(s.id, s.version, closeKey);
    expect(oldClose.body.data).toEqual(a.body.data);
    const history =
      await prisma.routeSettlementOpeningCommand.findUniqueOrThrow({
        where: { idempotencyKey: closeKey },
      });
    expect(history.responseSnapshot).toMatchObject({
      creditAmount: 60,
      snapshot: {
        orders: [expect.objectContaining({ outstandingAmount: 60 })],
      },
    });
    const row = await prisma.routeSettlement.findUniqueOrThrow({
      where: { id: s.id },
    });
    expect(row.reopenedByUserId).toBeTruthy();
    expect(row.reopenedReason).toBe(marker);
    expect(row.reopenedAt).toBeInstanceOf(Date);
  });
  it('FUNC-003: physical stock remains in review rather than being hidden by zero cash difference', async () => {
    const f = await fixture();
    await collect(f, 100);
    const transfer = await post('inventory-transfers', {
      originLocationId: cedisId,
      destinationLocationId: f.stockId,
      items: [
        {
          productId: f.productId,
          unit: 'PIECE',
          quantityPieces: 1,
          quantityKg: 0,
        },
      ],
    });
    expect(
      (await post(`inventory-transfers/${transfer.body.data.id}/confirm`))
        .status,
    ).toBe(201);
    const s = await open(f);
    expect(s.status).toBe('REVIEW_REQUIRED');
    const closed = await close(s.id, s.version);
    expect(closed.status).toBe(201);
    expect(closed.body.data).toMatchObject({
      status: 'REVIEW_REQUIRED',
      closedAt: null,
      differenceAmount: 0,
    });
  });
  it('FUNC-001: another real database and JWT authority cannot read or close a company settlement', async () => {
    const f = await fixture();
    await collect(f, 100);
    const s = await open(f);
    const secondUrl = process.env.E2E_SECOND_DATABASE_URL;
    if (!secondUrl || !secondUrl.endsWith('/pollos_p1_e2e_other'))
      throw new Error('Dedicated second database required');
    const firstApp = app;
    const firstPrisma = prisma;
    const firstToken = tokens.admin;
    try {
      const config = new ConfigService({
        ...process.env,
        NODE_ENV: 'test',
        SWAGGER_ENABLED: false,
        JWT_ACCESS_SECRET: randomUUID() + randomUUID(),
        JWT_REFRESH_SECRET: randomUUID() + randomUUID(),
        OBJECT_STORAGE_BUCKET: 'p1-other',
        app: { apiPrefix: 'api' },
      });
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useFactory({
          factory: () =>
            new PrismaService({ datasources: { db: { url: secondUrl } } }),
        })
        .overrideProvider(ConfigService)
        .useValue(config)
        .overrideProvider(AccountsReceivableAgingJob)
        .useValue({ onApplicationBootstrap() {} })
        .compile();
      app = module.createNestApplication<NestExpressApplication>();
      configureHttpApplication(app, config);
      await app.init();
      prisma = module.get(PrismaService);
      await seed(prisma as never);
      await login('admin');
      await api().get(`/api/route-settlements/${s.id}`).set(auth()).expect(404);
      await api()
        .get(`/api/route-settlements/${s.id}`)
        .set({ Authorization: `Bearer ${firstToken}` })
        .expect(401);
      expect(
        (
          await post(`route-settlements/${s.id}/close`, {
            expectedVersion: s.version,
          })
        ).status,
      ).toBe(404);
      const list = await api()
        .get('/api/route-settlements')
        .set(auth())
        .query({ routeId: f.routeId })
        .expect(200);
      expect(list.body.data.items).toHaveLength(0);
      expect(await prisma.routeSettlement.count()).toBe(0);
    } finally {
      if (app !== firstApp) await app.close();
      app = firstApp;
      prisma = firstPrisma;
      tokens.admin = firstToken;
    }
    expect(
      (await prisma.routeSettlement.findUniqueOrThrow({ where: { id: s.id } }))
        .status,
    ).not.toBe('CLOSED');
  });
  it('FUNC-002: no route payment leaves100 in receivables without a cash close obligation', async () => {
    const f = await fixture();
    const s = await open(f);
    expect(s).toMatchObject({
      expectedCashAmount: 0,
      expectedTransferAmount: 0,
      creditAmount: 100,
      differenceAmount: 0,
    });
    expect((await close(s.id, s.version)).body.data.status).toBe('CLOSED');
  });
  it('FUNC-003/004: one global key cannot close two routes concurrently', async () => {
    const f = await fixture();
    const g = await fixture();
    const a = await open(f);
    const b = await open(g);
    const commandKey = key();
    const results = await Promise.all([
      close(a.id, a.version, commandKey),
      close(b.id, b.version, commandKey),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await prisma.routeSettlement.count({
        where: { id: { in: [a.id, b.id] }, status: 'CLOSED' },
      }),
    ).toBe(1);
  });
  it('FUNC-004: reversal versus close never leaves accepted money out of its closed snapshot', async () => {
    const f = await fixture();
    const payment = (await collect(f, 40)).body.data.payment;
    const s = await open(f);
    const [reversed, closed] = await Promise.all([
      post(`payments/${payment.id}/cancel`, {
        expectedVersion: 1,
        reason: marker,
      }),
      close(s.id, s.version),
    ]);
    expect([201, 409]).toContain(reversed.status);
    expect(closed.status).toBe(201);
    const row = await prisma.routeSettlement.findUniqueOrThrow({
      where: { id: s.id },
    });
    const applied = await prisma.payment.aggregate({
      where: { routeId: f.routeId, status: 'APPLIED' },
      _sum: { amount: true },
    });
    expect(Number(row.expectedCashAmount)).toBe(
      Number(applied._sum.amount ?? 0),
    );
    expect(Number(row.expectedCashAmount)).toBe(
      reversed.status === 201 ? 0 : 40,
    );
  });
  it('preserves nonnegative physical balances and reservations after all fixtures', async () => {
    expect(
      await prisma.inventoryBalance.count({
        where: {
          OR: [
            { quantityKg: { lt: 0 } },
            { quantityPieces: { lt: 0 } },
            { reservedQuantityKg: { lt: 0 } },
            { reservedQuantityPieces: { lt: 0 } },
          ],
        },
      }),
    ).toBe(0);
  });
});
