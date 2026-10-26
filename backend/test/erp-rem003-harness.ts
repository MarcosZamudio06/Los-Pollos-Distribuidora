import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { LoggerService } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request, { type Response } from 'supertest';
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

export function assertRem003Environment() {
  assertDisposableE2eEnvironment();
  const db = new URL(process.env.DATABASE_URL!);
  const storage = new URL(process.env.OBJECT_STORAGE_ENDPOINT!);
  if (
    db.hostname !== '127.0.0.1' ||
    db.pathname !== '/pollos_rem003_e2e' ||
    storage.hostname !== '127.0.0.1' ||
    storage.protocol !== 'http:' ||
    process.env.OBJECT_STORAGE_BUCKET !== 'rem003-evidence' ||
    process.env.CFDI_ENABLED !== 'false' ||
    process.env.FISCAL_PROVIDER !== 'NONE'
  )
    throw new Error(
      'Dedicated local remediation003 database and storage required',
    );
}

export function data<T>(response: Response): T {
  return (response.body as { data: T }).data;
}

export function proof(name: string, value: unknown) {
  const dir = process.env.REM003_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, name + '.json'), JSON.stringify(value, null, 2));
}

export type RouteFixture = {
  productId: string;
  stockId: string;
  saleId: string;
  saleNumber: string;
  arId: string;
  customerId: string;
  routeId?: string;
  orderId?: string;
};

export class Rem003Harness {
  app!: NestExpressApplication;
  configureApp?: (app: NestExpressApplication) => void;
  prisma!: PrismaService;
  url!: string;
  cedisId!: string;
  driverId!: string;
  tokens: Record<string, string> = {};
  events: Array<{ path: string; http: number; ms: number; error?: unknown }> =
    [];
  retryEvents: Record<string, unknown>[] = [];
  createdProductIds: string[] = [];
  key = () => `rem003:${randomUUID()}`;

  async boot(seedDatabase = false) {
    assertRem003Environment();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AccountsReceivableAgingJob)
      .useValue({ onApplicationBootstrap() {} })
      .compile();
    this.app = module.createNestApplication<NestExpressApplication>();
    const record = (message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'event' in message &&
        String(message.event).startsWith('purchase_transaction_')
      )
        this.retryEvents.push(message as Record<string, unknown>);
    };
    const logger: LoggerService = { log: record, warn: record, error: record };
    this.app.useLogger(logger);
    configureHttpApplication(this.app, module.get(ConfigService));
    const dist = process.env.REM003_FRONTEND_DIST;
    if (dist) {
      this.app.useStaticAssets(dist);
      this.app.use(
        (
          req: { method: string; path: string },
          res: { sendFile(path: string): void },
          next: () => void,
        ) =>
          req.method === 'GET' &&
          !req.path.startsWith('/api') &&
          !req.path.startsWith('/maps')
            ? res.sendFile(resolve(dist, 'index.html'))
            : next(),
      );
    }
    this.configureApp?.(this.app);
    await this.app.listen(0, '127.0.0.1');
    this.url = await this.app.getUrl();
    this.prisma = module.get(PrismaService);
    if (seedDatabase) await seed(this.prisma);
    this.cedisId = (
      await this.prisma.operationalLocation.findUniqueOrThrow({
        where: { code: 'CEDIS-VER' },
      })
    ).id;
    this.driverId = (
      await this.prisma.user.findUniqueOrThrow({
        where: { email: 'dev.driver@pollos.local' },
      })
    ).id;
    for (const role of [
      'admin',
      'warehouse',
      'seller',
      'collections',
      'driver',
      'billing',
    ]) {
      const response = await request(this.url)
        .post('/api/auth/login')
        .send({
          email: `dev.${role}@pollos.local`,
          password:
            role === 'admin'
              ? DEVELOPMENT_ADMIN_PASSWORD
              : DEVELOPMENT_ROLE_TEST_PASSWORD,
        })
        .expect(200);
      this.tokens[role] = data<{ accessToken: string }>(response).accessToken;
    }
  }

  async start() {
    assertRem003Environment();
    const storage = new S3Client({
      endpoint: process.env.OBJECT_STORAGE_ENDPOINT,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
      },
    });
    try {
      await storage.send(
        new CreateBucketCommand({ Bucket: process.env.OBJECT_STORAGE_BUCKET! }),
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name)
      )
        throw error;
    } finally {
      storage.destroy();
    }
    await this.boot(true);
  }

  async post(
    path: string,
    body: object = {},
    role = 'admin',
    key = this.key(),
  ) {
    const start = performance.now();
    const response = await request(this.url)
      .post('/api/' + path)
      .set('Authorization', 'Bearer ' + this.tokens[role])
      .set('Idempotency-Key', key)
      .send(body);
    this.events.push({
      path,
      http: response.status,
      ms: performance.now() - start,
      ...(response.status >= 400 ? { error: response.body as unknown } : {}),
    });
    return response;
  }
  async patch(path: string, body: object, role = 'admin') {
    const start = performance.now();
    const response = await request(this.url)
      .patch('/api/' + path)
      .set('Authorization', 'Bearer ' + this.tokens[role])
      .send(body);
    this.events.push({
      path,
      http: response.status,
      ms: performance.now() - start,
      ...(response.status >= 400 ? { error: response.body as unknown } : {}),
    });
    return response;
  }
  async get(path: string, role = 'admin') {
    const start = performance.now();
    const response = await request(this.url)
      .get('/api/' + path)
      .set('Authorization', 'Bearer ' + this.tokens[role]);
    this.events.push({
      path,
      http: response.status,
      ms: performance.now() - start,
    });
    return response;
  }
  async product() {
    const product = await this.prisma.product.create({
      data: {
        sku: this.key(),
        name: this.key(),
        presentationType: 'CUT',
        unit: 'PIECE',
        salePrice: 100,
        purchaseCost: 5,
      },
    });
    this.createdProductIds.push(product.id);
    return product;
  }
  async purchaseBody(productId: string, quantityPieces = 10) {
    const supplier = await this.prisma.supplier.create({
      data: { name: this.key() },
    });
    return {
      supplierId: supplier.id,
      locationId: this.cedisId,
      items: [
        {
          productId,
          unit: 'PIECE',
          quantityPieces,
          quantityKg: 0,
          unitCost: 5,
        },
      ],
    };
  }
  async transfer(
    productId: string,
    originLocationId: string,
    destinationLocationId: string,
    quantityPieces: number,
  ) {
    const response = await this.post('inventory-transfers', {
      originLocationId,
      destinationLocationId,
      items: [{ productId, unit: 'PIECE', quantityPieces, quantityKg: 0 }],
    });
    expect(response.status).toBe(201);
    const id = data<{ id: string }>(response).id;
    expect((await this.post(`inventory-transfers/${id}/confirm`)).status).toBe(
      201,
    );
  }
  async fixture(
    assign = false,
    complete = false,
    purchaseRole = 'admin',
  ): Promise<RouteFixture> {
    const product = await this.product();
    const customer = await this.prisma.customer.create({
      data: {
        name: this.key(),
        customerType: 'RETAIL',
        creditLimit: 100000,
        creditDays: 30,
        creditStatus: 'ACTIVE',
      },
    });
    const stock = await this.prisma.operationalLocation.create({
      data: {
        name: this.key(),
        code: this.key(),
        type: 'ROUTE_STOCK',
      },
    });
    expect(
      (
        await this.post(
          'purchases',
          await this.purchaseBody(product.id),
          purchaseRole,
        )
      ).status,
    ).toBe(201);
    await this.transfer(product.id, this.cedisId, stock.id, 10);
    const response = await this.post('sales', {
      locationId: stock.id,
      saleChannel: 'ROUTE',
      documentType: 'INTERNAL_RECEIPT',
      paymentType: 'CREDIT_SALE',
      customerId: customer.id,
      payments: [],
      items: [
        {
          productId: product.id,
          unit: 'PIECE',
          quantityPieces: 1,
          quantityKg: 0,
        },
      ],
    });
    expect(response.status).toBe(201);
    const sale = data<{
      sale: { id: string; saleNumber: string };
      accountReceivable: { id: string };
    }>(response);
    const f: RouteFixture = {
      productId: product.id,
      customerId: customer.id,
      stockId: stock.id,
      saleId: sale.sale.id,
      saleNumber: sale.sale.saleNumber,
      arId: sale.accountReceivable.id,
    };
    if (assign) {
      const route = await this.post('delivery-routes', {
        name: this.key(),
        driverId: this.driverId,
        scheduledDate: new Date().toISOString(),
        originLocationId: this.cedisId,
        routeStockLocationId: stock.id,
        orders: [
          { saleId: f.saleId, deliveryAddress: 'Audit only destination' },
        ],
      });
      expect(route.status).toBe(201);
      f.routeId = data<{ id: string }>(route).id;
      f.orderId = (
        await this.prisma.deliveryOrder.findUniqueOrThrow({
          where: { saleId: f.saleId },
        })
      ).id;
      expect(
        (
          await this.patch(`delivery-routes/${f.routeId}/status`, {
            status: 'IN_PROGRESS',
          })
        ).status,
      ).toBe(200);
      if (complete) {
        const value =
          'data:image/png;base64,' +
          readFileSync(
            resolve(
              __dirname,
              '../../frontend/e2e/fixtures/driver-delivery.png',
            ),
          ).toString('base64');
        expect(
          (
            await this.post(
              `delivery-orders/${f.orderId}/evidence`,
              { type: 'PHOTO', value, capturedAt: new Date().toISOString() },
              'driver',
            )
          ).status,
        ).toBe(201);
        expect(
          (
            await this.patch(
              `delivery-orders/${f.orderId}/status`,
              { status: 'DELIVERED' },
              'driver',
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await this.patch(`delivery-routes/${f.routeId}/status`, {
              status: 'COMPLETED',
            })
          ).status,
        ).toBe(200);
        await this.transfer(product.id, stock.id, this.cedisId, 9);
      }
    }
    return f;
  }
  async collect(
    f: RouteFixture,
    amount: number,
    pass = 1,
    method = 'CASH',
    role = 'driver',
  ) {
    const ar = await this.prisma.accountReceivable.findUniqueOrThrow({
      where: { id: f.arId },
    });
    return this.post(
      `delivery-orders/${f.orderId}/collections`,
      {
        accountReceivableId: f.arId,
        amount,
        paymentMethod: method,
        collectionPass: pass,
        expectedVersion: ar.version,
        ...(method === 'TRANSFER'
          ? { bankName: 'AUDIT ONLY', reference: 'NO REAL TRANSFER' }
          : {}),
      },
      role,
    );
  }
  async restart() {
    await this.app.close();
    await this.boot();
  }
  async close() {
    await this.app?.close();
  }
}
