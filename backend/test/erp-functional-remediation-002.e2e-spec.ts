import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
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

type Fixture = {
  productId: string;
  stockId: string;
  saleId: string;
  routeId: string;
  orderId: string;
  arId: string;
};
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('Remediation002: cancellation, customer return and execution invariants (real PG/S3)', () => {
  const marker = `rem002-${randomUUID()}`;
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let cedisId: string;
  let driverId: string;
  const tokens: Record<string, string> = {};
  let sequence = 0;
  let storage: S3Client;
  const key = () => `${marker}:${++sequence}`;
  const api = () => request(app.getHttpServer());
  const auth = (role = 'admin') => ({
    Authorization: `Bearer ${tokens[role]}`,
  });
  const post = (
    path: string,
    body: object = {},
    role = 'admin',
    command = key(),
  ) =>
    api()
      .post(`/api/${path}`)
      .set(auth(role))
      .set('Idempotency-Key', command)
      .send(body);
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
  async function fixture(
    sold = 1,
    unit: 'PIECE' | 'KG' = 'PIECE',
    assign = true,
    differentReturnCustody = false,
  ): Promise<Fixture> {
    const label = key();
    const product = await prisma.product.create({
      data: {
        name: label,
        sku: label,
        presentationType: 'CUT',
        unit,
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
    const quantity = (amount: number) =>
      unit === 'PIECE'
        ? { quantityPieces: amount, quantityKg: 0 }
        : { quantityKg: amount, quantityPieces: 0 };
    expect(
      (
        await post('purchases', {
          supplierId: supplier.id,
          locationId: cedisId,
          items: [
            { productId: product.id, unit, ...quantity(10), unitCost: 60 },
          ],
        })
      ).status,
    ).toBe(201);
    const transfer = await post('inventory-transfers', {
      originLocationId: cedisId,
      destinationLocationId: stock.id,
      items: [{ productId: product.id, unit, ...quantity(10) }],
    });
    expect(transfer.status).toBe(201);
    const reserved = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        productId_locationId: { productId: product.id, locationId: cedisId },
      },
    });
    expect(
      Number(unit === 'KG' ? reserved.quantityKg : reserved.quantityPieces),
    ).toBe(10);
    expect(
      Number(
        unit === 'KG'
          ? reserved.reservedQuantityKg
          : reserved.reservedQuantityPieces,
      ),
    ).toBe(10);
    expect(
      (await post(`inventory-transfers/${transfer.body.data.id}/confirm`))
        .status,
    ).toBe(201);
    const released = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        productId_locationId: { productId: product.id, locationId: cedisId },
      },
    });
    expect(
      Number(unit === 'KG' ? released.quantityKg : released.quantityPieces),
    ).toBe(0);
    expect(
      Number(
        unit === 'KG'
          ? released.reservedQuantityKg
          : released.reservedQuantityPieces,
      ),
    ).toBe(0);
    const sale = await post('sales', {
      locationId: stock.id,
      saleChannel: 'ROUTE',
      documentType: 'INTERNAL_RECEIPT',
      customerId: customer.id,
      paymentType: 'CREDIT_SALE',
      payments: [],
      items: [{ productId: product.id, unit, ...quantity(sold) }],
    });
    expect(sale.status).toBe(201);
    const saleId = sale.body.data.sale.id;
    if (!assign)
      return {
        productId: product.id,
        stockId: stock.id,
        saleId,
        routeId: '',
        orderId: '',
        arId: (
          await prisma.accountReceivable.findUniqueOrThrow({
            where: { saleId },
          })
        ).id,
      };
    const returnStock = differentReturnCustody
      ? await prisma.operationalLocation.create({
          data: {
            name: `${label}-returns`,
            code: `${label}-returns`,
            type: 'ROUTE_STOCK',
          },
        })
      : stock;
    const route = await post('delivery-routes', {
      name: label,
      driverId,
      scheduledDate: new Date().toISOString(),
      originLocationId: cedisId,
      routeStockLocationId: returnStock.id,
      orders: [{ saleId, deliveryAddress: 'Disposable test address' }],
    });
    expect(route.status).toBe(201);
    await api()
      .patch(`/api/delivery-routes/${route.body.data.id}/status`)
      .set(auth())
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    const order = await prisma.deliveryOrder.findUniqueOrThrow({
      where: { saleId },
    });
    const ar = await prisma.accountReceivable.findUniqueOrThrow({
      where: { saleId },
    });
    return {
      productId: product.id,
      stockId: stock.id,
      saleId,
      routeId: route.body.data.id,
      orderId: order.id,
      arId: ar.id,
    };
  }
  const returned = (
    f: Fixture,
    amount = 1,
    command = key(),
    unit: 'PIECE' | 'KG' = 'PIECE',
  ) =>
    post(
      `delivery-orders/${f.orderId}/incidents`,
      {
        status: 'RETURNED',
        reason: marker,
        returnedItems: [
          {
            productId: f.productId,
            unit,
            quantityKg: unit === 'KG' ? amount : 0,
            quantityPieces: unit === 'PIECE' ? amount : 0,
            reason: marker,
          },
        ],
      },
      'driver',
      command,
    );
  const voided = (f: Fixture, command = key()) =>
    post(
      `sales/${f.saleId}/void`,
      { expectedVersion: 1, reason: marker },
      'admin',
      command,
    );
  const balance = (f: Fixture) =>
    prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        productId_locationId: { productId: f.productId, locationId: f.stockId },
      },
    });
  const evidence = (f: Fixture) =>
    post(
      `delivery-orders/${f.orderId}/evidence`,
      { type: 'PHOTO', value: png, capturedAt: new Date().toISOString() },
      'driver',
    );
  const delivered = (f: Fixture) =>
    api()
      .patch(`/api/delivery-orders/${f.orderId}/status`)
      .set(auth('driver'))
      .send({ status: 'DELIVERED' });
  async function assertCancelled(f: Fixture) {
    expect(
      (await prisma.sale.findUniqueOrThrow({ where: { id: f.saleId } })).status,
    ).toBe('CANCELLED');
    expect(
      (
        await prisma.accountReceivable.findUniqueOrThrow({
          where: { id: f.arId },
        })
      ).status,
    ).toBe('CANCELLED');
    expect(
      Number(
        (
          await prisma.accountReceivable.findUniqueOrThrow({
            where: { id: f.arId },
          })
        ).outstandingAmount,
      ),
    ).toBe(0);
    expect(
      (
        await prisma.deliveryOrder.findUniqueOrThrow({
          where: { id: f.orderId },
        })
      ).status,
    ).toBe('CANCELLED');
    expect(
      await prisma.saleDocument.count({
        where: { saleId: f.saleId, status: { not: 'CANCELLED' } },
      }),
    ).toBe(0);
  }
  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    const url = new URL(process.env.DATABASE_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/pollos_rem002_e2e' ||
      process.env.CFDI_ENABLED !== 'false' ||
      process.env.FISCAL_PROVIDER !== 'NONE'
    )
      throw new Error(
        'Dedicated loopback remediation002 database and disabled fiscal integration required',
      );
    storage = new S3Client({
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
      },
    });
    await storage
      .send(
        new HeadBucketCommand({ Bucket: process.env.OBJECT_STORAGE_BUCKET }),
      )
      .catch(async (error: { $metadata?: { httpStatusCode?: number } }) => {
        if (error.$metadata?.httpStatusCode !== 404) throw error;
        await storage.send(
          new CreateBucketCommand({
            Bucket: process.env.OBJECT_STORAGE_BUCKET,
          }),
        );
      });
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
    for (const role of ['admin', 'driver', 'collections']) await login(role);
  }, 60000);
  afterAll(async () => {
    await app?.close();
    storage?.destroy();
  });

  it('FUNC-006: return1 then void and HTTP replays restore only1, not2', async () => {
    const f = await fixture();
    const returnKey = key();
    const voidKey = key();
    expect((await balance(f)).quantityPieces).toBe(9);
    expect((await returned(f, 1, returnKey)).status).toBe(201);
    expect((await returned(f, 1, returnKey)).status).toBe(201);
    expect((await balance(f)).quantityPieces).toBe(10);
    const preview = await api()
      .get(`/api/sales/${f.saleId}/void-preview`)
      .set(auth())
      .expect(200);
    expect((await voided(f, voidKey)).status).toBe(201);
    expect((await voided(f, voidKey)).status).toBe(201);
    expect((await balance(f)).quantityPieces).toBe(10);
    expect(preview.body.data.inventory[0].quantityPieces).toBe(0);
    const rows = await prisma.inventoryMovement.findMany({
      where: { saleId: f.saleId, type: { in: ['RETURN', 'CANCEL_SALE'] } },
    });
    expect(rows.reduce((sum, row) => sum + (row.quantityPieces ?? 0), 0)).toBe(
      1,
    );
    expect(
      rows.every(
        (row) => Number(row.quantityKg) > 0 || (row.quantityPieces ?? 0) > 0,
      ),
    ).toBe(true);
    await assertCancelled(f);
  });
  it.each(['PIECE', 'KG'] as const)(
    'FUNC-006: partial return then void only restores the remaining quantity (%s)',
    async (unit) => {
      const f = await fixture(3, unit);
      expect((await returned(f, 1, key(), unit)).status).toBe(201);
      expect((await voided(f)).status).toBe(201);
      const row = await balance(f);
      expect(Number(unit === 'KG' ? row.quantityKg : row.quantityPieces)).toBe(
        10,
      );
      const compensation = await prisma.inventoryMovement.findMany({
        where: { saleId: f.saleId, type: 'CANCEL_SALE' },
      });
      expect(compensation).toHaveLength(1);
      expect(
        Number(
          unit === 'KG'
            ? compensation[0].quantityKg
            : compensation[0].quantityPieces,
        ),
      ).toBe(2);
    },
  );
  it('FUNC-007: void invalidates execution without deleting earlier evidence', async () => {
    const f = await fixture();
    expect((await evidence(f)).status).toBe(201);
    const historical = await prisma.deliveryEvidence.findFirstOrThrow({
      where: { deliveryOrderId: f.orderId },
    });
    expect((await voided(f)).status).toBe(201);
    expect((await evidence(f)).status).toBe(409);
    expect((await delivered(f)).status).toBe(409);
    expect((await returned(f)).status).toBe(409);
    const payment = await post(
      `delivery-orders/${f.orderId}/collections`,
      {
        accountReceivableId: f.arId,
        amount: 10,
        paymentMethod: 'CASH',
        expectedVersion: 2,
      },
      'driver',
    );
    expect([400, 409]).toContain(payment.status);
    expect(
      await prisma.deliveryEvidence.count({
        where: { deliveryOrderId: f.orderId },
      }),
    ).toBe(1);
    expect(
      await prisma.deliveryEvidence.findUnique({
        where: { id: historical.id },
      }),
    ).toEqual(historical);
    await assertCancelled(f);
    expect((await balance(f)).quantityPieces).toBe(10);
  });
  it('FUNC-007: cancellation and delivery compete without leaving a cancelled sale executable', async () => {
    const f = await fixture();
    await evidence(f);
    const [cancel, delivery] = await Promise.all([voided(f), delivered(f)]);
    expect([201, 409]).toContain(cancel.status);
    expect([200, 409]).toContain(delivery.status);
    if (cancel.status !== 201) expect((await voided(f)).status).toBe(201);
    await assertCancelled(f);
    expect((await balance(f)).quantityPieces).toBe(10);
  });
  it('FUNC-006: cancellation and customer return compete without increasing custody twice', async () => {
    const f = await fixture();
    const [cancel, physical] = await Promise.all([voided(f), returned(f)]);
    expect([201, 409]).toContain(cancel.status);
    expect([201, 409]).toContain(physical.status);
    if (cancel.status !== 201) expect((await voided(f)).status).toBe(201);
    expect((await balance(f)).quantityPieces).toBe(10);
    await assertCancelled(f);
  });
  it('FUNC-007: an already delivered completed route retains history but its voided sale cannot execute again', async () => {
    const f = await fixture();
    await evidence(f);
    expect((await delivered(f)).status).toBe(200);
    await api()
      .patch(`/api/delivery-routes/${f.routeId}/status`)
      .set(auth())
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect((await voided(f)).status).toBe(201);
    await assertCancelled(f);
    const order = await prisma.deliveryOrder.findUniqueOrThrow({
      where: { id: f.orderId },
    });
    expect(order.deliveredAt).not.toBeNull();
    expect((await evidence(f)).status).toBe(409);
    expect((await delivered(f)).status).toBe(409);
  });

  it('FUNC-006: legacy cancellation and retries compensate only the unreturned remainder', async () => {
    const f = await fixture(3);
    expect((await returned(f)).status).toBe(201);
    const command = key();
    const payload = { expectedVersion: 1, reason: marker };
    expect(
      (await post(`sales/${f.saleId}/cancel`, payload, 'admin', command))
        .status,
    ).toBe(201);
    expect(
      (await post(`sales/${f.saleId}/cancel`, payload, 'admin', command))
        .status,
    ).toBe(201);
    expect((await balance(f)).quantityPieces).toBe(10);
    expect(
      (
        await prisma.deliveryOrder.findUniqueOrThrow({
          where: { id: f.orderId },
        })
      ).status,
    ).toBe('CANCELLED');
    expect(
      await prisma.inventoryMovement.count({
        where: { saleId: f.saleId, type: 'CANCEL_SALE' },
      }),
    ).toBe(1);
  });
  it('FUNC-006: same-key incident replay remains historical after void; new keys cannot restore it twice', async () => {
    const f = await fixture();
    const command = key();
    const original = await returned(f, 1, command);
    expect(original.status).toBe(201);
    expect((await returned(f, 1, key())).status).toBe(409);
    expect((await voided(f)).status).toBe(201);
    const replay = await returned(f, 1, command);
    expect(replay.status).toBe(201);
    expect(replay.body.data.incident.id).toBe(original.body.data.incident.id);
    expect((await returned(f)).status).toBe(409);
    expect(
      await prisma.deliveryIncident.count({
        where: { deliveryOrderId: f.orderId },
      }),
    ).toBe(1);
    expect((await balance(f)).quantityPieces).toBe(10);
  });
  it('FUNC-006: a new command cannot reopen a final return; void restores only its remaining sold quantity', async () => {
    const f = await fixture(3);
    expect((await returned(f, 1)).status).toBe(201);
    expect((await returned(f, 2)).status).toBe(409);
    expect((await returned(f, 1)).status).toBe(409);
    expect((await voided(f)).status).toBe(201);
    expect((await balance(f)).quantityPieces).toBe(10);
    expect(
      await prisma.inventoryMovement.count({
        where: { saleId: f.saleId, type: 'CANCEL_SALE' },
      }),
    ).toBe(1);
  });
  it('FUNC-006: fractional kilograms retain three-decimal compensation identity', async () => {
    const f = await fixture(1.234, 'KG');
    expect((await returned(f, 0.111, key(), 'KG')).status).toBe(201);
    expect((await voided(f)).status).toBe(201);
    expect(Number((await balance(f)).quantityKg)).toBe(10);
    const compensation = await prisma.inventoryMovement.findFirstOrThrow({
      where: { saleId: f.saleId, type: 'CANCEL_SALE' },
    });
    expect(compensation.quantityKg?.toString()).toBe('1.123');
    expect(compensation.idempotencyKey).toBe(
      `cancel-sale:${f.saleId}:${f.productId}`,
    );
  });
  it('FUNC-006: competing cancellations and HTTP retries never produce a second restitution', async () => {
    const f = await fixture();
    const command = key();
    const results = await Promise.all([
      voided(f, command),
      voided(f, command),
      voided(f),
    ]);
    for (const result of results)
      expect([201, 400, 409]).toContain(result.status);
    expect(results.some((result) => result.status === 201)).toBe(true);
    // The successfully committed command remains replayable after the race.
    const winning = await prisma.sale.findUniqueOrThrow({
      where: { id: f.saleId },
    });
    expect((await voided(f, winning.cancellationIdempotencyKey!)).status).toBe(
      201,
    );
    expect((await balance(f)).quantityPieces).toBe(10);
    expect(
      await prisma.inventoryMovement.count({
        where: { saleId: f.saleId, type: 'CANCEL_SALE' },
      }),
    ).toBe(1);
  });
  async function assign(f: Fixture) {
    return post('delivery-routes', {
      name: key(),
      driverId,
      scheduledDate: new Date().toISOString(),
      originLocationId: cedisId,
      routeStockLocationId: f.stockId,
      orders: [
        { saleId: f.saleId, deliveryAddress: 'Disposable test address' },
      ],
    });
  }
  it('FUNC-007: an unassigned cancelled sale cannot enter a new route', async () => {
    const f = await fixture(1, 'PIECE', false);
    expect((await voided(f)).status).toBe(201);
    expect((await assign(f)).status).toBe(400);
    expect(
      await prisma.deliveryOrder.count({ where: { saleId: f.saleId } }),
    ).toBe(0);
  });
  it('FUNC-007: assignment versus void cannot attach an executable order to a cancelled sale', async () => {
    const f = await fixture(1, 'PIECE', false);
    const [cancel, assigned] = await Promise.all([voided(f), assign(f)]);
    expect([201, 409]).toContain(cancel.status);
    expect([201, 400, 409]).toContain(assigned.status);
    if (cancel.status !== 201) expect((await voided(f)).status).toBe(201);
    const order = await prisma.deliveryOrder.findUnique({
      where: { saleId: f.saleId },
    });
    if (order) expect(order.status).toBe('CANCELLED');
    expect((await balance(f)).quantityPieces).toBe(10);
  });
  const collect = async (
    f: Fixture,
    amount = 20,
    command = key(),
    paidAt?: string,
  ) => {
    const ar = await prisma.accountReceivable.findUniqueOrThrow({
      where: { id: f.arId },
    });
    return post(
      `delivery-orders/${f.orderId}/collections`,
      {
        accountReceivableId: f.arId,
        amount,
        paymentMethod: 'TRANSFER',
        reference: marker,
        expectedVersion: ar.version,
        ...(paidAt ? { paidAt } : {}),
      },
      'driver',
      command,
    );
  };
  it('FUNC-007: later payment after delivery is allowed, while void cancels its money atomically', async () => {
    const f = await fixture();
    await evidence(f);
    expect((await delivered(f)).status).toBe(200);
    expect((await collect(f)).status).toBe(201);
    expect(
      Number(
        (
          await prisma.accountReceivable.findUniqueOrThrow({
            where: { id: f.arId },
          })
        ).outstandingAmount,
      ),
    ).toBe(80);
    expect((await voided(f)).status).toBe(201);
    const payments = await prisma.payment.findMany({
      where: { accountReceivableId: f.arId },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('CANCELLED');
    expect((await collect(f)).status).toBe(409);
    await assertCancelled(f);
  });
  it('FUNC-007: collection versus void never leaves APPLIED money on a cancelled receivable', async () => {
    const f = await fixture();
    const [cancel, payment] = await Promise.all([voided(f), collect(f)]);
    expect([201, 409]).toContain(cancel.status);
    expect([201, 400, 409]).toContain(payment.status);
    if (cancel.status !== 201) expect((await voided(f)).status).toBe(201);
    expect(
      await prisma.payment.count({
        where: { accountReceivableId: f.arId, status: 'APPLIED' },
      }),
    ).toBe(0);
    await assertCancelled(f);
    expect((await balance(f)).quantityPieces).toBe(10);
  });
  it('FUNC-007: route completion versus void retains only terminal cancelled execution', async () => {
    const f = await fixture();
    expect((await returned(f)).status).toBe(201);
    const [cancel, close] = await Promise.all([
      voided(f),
      api()
        .patch(`/api/delivery-routes/${f.routeId}/status`)
        .set(auth())
        .send({ status: 'COMPLETED' }),
    ]);
    expect([201, 409]).toContain(cancel.status);
    expect([200, 409]).toContain(close.status);
    if (cancel.status !== 201) expect((await voided(f)).status).toBe(201);
    await assertCancelled(f);
    expect((await balance(f)).quantityPieces).toBe(10);
  });
  it('FUNC-007: racing PHOTO and void preserves accepted MinIO history and removes losing uploads', async () => {
    const f = await fixture();
    expect((await evidence(f)).status).toBe(201);
    const historical = await prisma.deliveryEvidence.findFirstOrThrow({
      where: { deliveryOrderId: f.orderId },
    });
    const [cancel, photo] = await Promise.all([voided(f), evidence(f)]);
    expect([201, 409]).toContain(cancel.status);
    expect([201, 409]).toContain(photo.status);
    if (cancel.status !== 201) expect((await voided(f)).status).toBe(201);
    const stored = await storage.send(
      new GetObjectCommand({
        Bucket: process.env.OBJECT_STORAGE_BUCKET,
        Key: historical.storageKey!,
      }),
    );
    expect(Buffer.from(await stored.Body!.transformToByteArray())).toEqual(
      Buffer.from(png.split(',')[1], 'base64'),
    );
    const prefix = historical.storageKey!.slice(
      0,
      historical.storageKey!.lastIndexOf('/') + 1,
    );
    const objects = await storage.send(
      new ListObjectsV2Command({
        Bucket: process.env.OBJECT_STORAGE_BUCKET,
        Prefix: prefix,
      }),
    );
    const rows = await prisma.deliveryEvidence.findMany({
      where: { deliveryOrderId: f.orderId },
    });
    expect((objects.Contents ?? []).map((object) => object.Key).sort()).toEqual(
      rows.map((row) => row.storageKey!).sort(),
    );
    await assertCancelled(f);
  });
  it('FUNC-005/008: route collections use paidAt local boundaries on older delivered sales', async () => {
    const f = await fixture();
    await evidence(f);
    await delivered(f);
    // Fixture history only: no production timestamps are rewritten by application code.
    await prisma.sale.update({
      where: { id: f.saleId },
      data: { createdAt: new Date('2026-10-20T12:00:00Z') },
    });
    const instants = [
      '2026-10-24T23:59:00Z',
      '2026-10-25T00:00:00Z',
      '2026-10-25T05:59:59Z',
      '2026-10-25T06:00:00Z',
    ];
    for (const instant of instants)
      expect((await collect(f, 10, key(), instant)).status).toBe(201);
    for (const [date, expected] of [
      ['2026-10-24', 3],
      ['2026-10-25', 1],
    ] as const) {
      const report = await api()
        .get('/api/reports/cash-closing')
        .set(auth())
        .query({ date, locationId: f.stockId })
        .expect(200);
      expect(report.body.data.routeCollections).toEqual([
        expect.objectContaining({
          count: expected,
          amount: `${expected * 10}.00`,
          paymentMethod: 'TRANSFER',
        }),
      ]);
    }
    const rows = await prisma.payment.findMany({
      where: { accountReceivableId: f.arId },
      orderBy: { paidAt: 'asc' },
    });
    expect(rows.map((row) => row.paidAt.toISOString())).toEqual(
      instants.map((instant) => new Date(instant).toISOString()),
    );
  });

  it('FUNC-006: customer return followed by physical route unloading does not gain stock on void', async () => {
    const f = await fixture();
    expect((await returned(f)).status).toBe(201);
    const transfer = await post('inventory-transfers', {
      originLocationId: f.stockId,
      destinationLocationId: cedisId,
      items: [{ productId: f.productId, unit: 'PIECE', quantityPieces: 10 }],
    });
    expect(transfer.status).toBe(201);
    expect((await balance(f)).reservedQuantityPieces).toBe(10);
    expect(
      (await post(`inventory-transfers/${transfer.body.data.id}/confirm`))
        .status,
    ).toBe(201);
    expect((await voided(f)).status).toBe(201);
    expect((await balance(f)).quantityPieces).toBe(0);
    expect((await balance(f)).reservedQuantityPieces).toBe(0);
    const total = await prisma.inventoryBalance.aggregate({
      where: { productId: f.productId },
      _sum: { quantityPieces: true },
    });
    expect(total._sum.quantityPieces).toBe(10);
  });

  it('FUNC-006: returned custody may differ from sale origin without global stock or a second restoration', async () => {
    const f = await fixture(1, 'PIECE', true, true);
    const route = await prisma.deliveryRoute.findUniqueOrThrow({
      where: { id: f.routeId },
    });
    expect((await returned(f)).status).toBe(201);
    expect((await voided(f)).status).toBe(201);
    expect((await balance(f)).quantityPieces).toBe(9);
    const physicalReturn = await prisma.inventoryBalance.findUniqueOrThrow({
      where: {
        productId_locationId: {
          productId: f.productId,
          locationId: route.routeStockLocationId!,
        },
      },
    });
    expect(physicalReturn.quantityPieces).toBe(1);
    const movements = await prisma.inventoryMovement.findMany({
      where: { saleId: f.saleId, type: { in: ['RETURN', 'CANCEL_SALE'] } },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0].locationId).toBe(route.routeStockLocationId);
    expect(
      await prisma.inventoryBalance.aggregate({
        where: { productId: f.productId },
        _sum: { quantityPieces: true },
      }),
    ).toMatchObject({ _sum: { quantityPieces: 10 } });
  });

  it('FUNC-007: independent receivable payment versus void leaves no applied money after cancellation', async () => {
    const f = await fixture();
    const [cancel, payment] = await Promise.all([
      voided(f),
      post(
        `accounts-receivable/${f.arId}/payments`,
        {
          accountReceivableId: f.arId,
          expectedVersion: 1,
          amount: 20,
          paymentMethod: 'TRANSFER',
          bankName: 'Disposable bank',
          referenceNumber: marker,
        },
        'collections',
      ),
    ]);
    expect([201, 409]).toContain(cancel.status);
    expect([201, 400, 409]).toContain(payment.status);
    if (cancel.status !== 201) expect((await voided(f)).status).toBe(201);
    expect(
      await prisma.payment.count({
        where: { accountReceivableId: f.arId, status: 'APPLIED' },
      }),
    ).toBe(0);
    await assertCancelled(f);
  });

  it('FUNC-007: independent payment reversal versus void cannot deadlock or reactivate cancelled debt', async () => {
    const f = await fixture();
    const payment = await post(
      `accounts-receivable/${f.arId}/payments`,
      {
        accountReceivableId: f.arId,
        expectedVersion: 1,
        amount: 20,
        paymentMethod: 'TRANSFER',
        bankName: 'Disposable bank',
        referenceNumber: marker,
      },
      'collections',
    );
    expect(payment.status).toBe(201);
    let release!: () => void;
    let held!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const acquired = new Promise<void>((resolve) => {
      held = resolve;
    });
    // A real third PG transaction provides a deterministic scheduling barrier, not an API/DB mock.
    const blocker = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "AccountReceivable" WHERE "id" = ${f.arId} FOR UPDATE`;
        held();
        await released;
      },
      { timeout: 15000 },
    );
    async function waitForBlocked(count: number) {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const rows = await prisma.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
        if (Number(rows[0].count) >= count) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw new Error(`Expected ${count} real PostgreSQL lock waiters`);
    }
    await acquired;
    const reversal = post(`payments/${payment.body.data.payment.id}/cancel`, {
      expectedVersion: 1,
      reason: marker,
    }).then((response) => response);
    let cancel: Promise<request.Response> | undefined;
    try {
      await waitForBlocked(1);
      cancel = voided(f).then((response) => response);
      await waitForBlocked(2);
    } finally {
      release();
      await blocker;
    }
    const [cancelResult, reversalResult] = await Promise.all([
      cancel!,
      reversal,
    ]);
    expect([201, 409]).toContain(cancelResult.status);
    expect([201, 400, 409]).toContain(reversalResult.status);
    if (cancelResult.status !== 201) expect((await voided(f)).status).toBe(201);
    await assertCancelled(f);
    expect(
      await prisma.payment.count({
        where: { accountReceivableId: f.arId, status: 'APPLIED' },
      }),
    ).toBe(0);
  });

  it('restart reconstructs cancelled sale, net movements and persistent balances without in-memory state', async () => {
    const f = await fixture(3);
    await returned(f);
    await voided(f);
    const before = await balance(f);
    await app.close();
    await boot();
    for (const role of ['admin', 'driver', 'collections']) await login(role);
    await assertCancelled(f);
    expect(await balance(f)).toEqual(before);
    expect((await delivered(f)).status).toBe(409);
    expect(
      await prisma.inventoryMovement.count({
        where: { saleId: f.saleId, type: { in: ['RETURN', 'CANCEL_SALE'] } },
      }),
    ).toBe(2);
  });

  it('retains nonnegative physical/reserved balances after the transactional regressions', async () => {
    const overReserved = await prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM "InventoryBalance" WHERE "reservedQuantityKg" > "quantityKg" OR "reservedQuantityPieces" > "quantityPieces"`;
    expect(Number(overReserved[0].count)).toBe(0);
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
