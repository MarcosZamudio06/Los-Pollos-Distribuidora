import { Test } from '@nestjs/testing';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { configureHttpApplication } from '../src/bootstrap/configure-http-application';
import { AccountsReceivableAgingJob } from '../src/modules/accounts-receivable/accounts-receivable-aging.job';
import {
  seed,
  DEVELOPMENT_ADMIN_PASSWORD,
  DEVELOPMENT_ROLE_TEST_PASSWORD,
} from '../prisma/seed';
import { assertDisposableE2eEnvironment } from './e2e-environment';

// Runtime loading is delegated to the installed frontend package, not a second Playwright version.
const frontendRequire = createRequire(
  resolve(__dirname, '../../frontend/package.json'),
);
const { chromium, expect: browserExpect } = frontendRequire('@playwright/test');

describe('Remediation002 browser: real Linux Chromium, UI, API and PostgreSQL (no API mocks)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let browser: Awaited<ReturnType<typeof chromium.connect>>;
  let baseURL: string;
  let token: string;
  let cedisId: string;
  let sequence = 0;
  const marker = `browser-rem002-${randomUUID()}`;
  const proof: Record<string, unknown>[] = [];
  const evidenceDir = process.env.REM002_EVIDENCE_DIR;
  async function screenshot(
    page: {
      screenshot(options: {
        path: string;
        fullPage: boolean;
      }): Promise<unknown>;
    },
    name: string,
  ) {
    if (!evidenceDir) return;
    mkdirSync(evidenceDir, { recursive: true });
    await page.screenshot({ path: resolve(evidenceDir, name), fullPage: true });
  }
  const key = () => `${marker}:${++sequence}`;
  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/api/${path}`)
      .set({ Authorization: `Bearer ${token}`, 'Idempotency-Key': key() })
      .send(body);
  async function fixture() {
    const label = key();
    const product = await prisma.product.create({
      data: {
        name: label,
        sku: label,
        presentationType: 'CUT',
        unit: 'PIECE',
        salePrice: 60,
        purchaseCost: 30,
      },
    });
    const customer = await prisma.customer.create({
      data: {
        name: label,
        customerNumber: label,
        customerType: 'RETAIL',
        creditStatus: 'ACTIVE',
        creditLimit: 10000,
        creditDays: 30,
      },
    });
    const stock = await prisma.operationalLocation.create({
      data: { name: label, code: label, type: 'ROUTE_STOCK' },
    });
    const supplier = await prisma.supplier.create({ data: { name: label } });
    expect(
      (
        await post('purchases', {
          supplierId: supplier.id,
          locationId: cedisId,
          items: [
            {
              productId: product.id,
              unit: 'PIECE',
              quantityPieces: 10,
              unitCost: 30,
            },
          ],
        })
      ).status,
    ).toBe(201);
    const transfer = await post('inventory-transfers', {
      originLocationId: cedisId,
      destinationLocationId: stock.id,
      items: [{ productId: product.id, unit: 'PIECE', quantityPieces: 10 }],
    });
    expect(
      (await post(`inventory-transfers/${transfer.body.data.id}/confirm`, {}))
        .status,
    ).toBe(201);
    const sale = await post('sales', {
      locationId: stock.id,
      saleChannel: 'ROUTE',
      documentType: 'INTERNAL_RECEIPT',
      paymentType: 'CREDIT_SALE',
      customerId: customer.id,
      payments: [],
      items: [{ productId: product.id, unit: 'PIECE', quantityPieces: 1 }],
    });
    expect(sale.status).toBe(201);
    await prisma.sale.update({
      where: { id: sale.body.data.sale.id },
      data: { createdAt: new Date('2026-10-20T12:00:00Z') },
    });
    return {
      saleId: sale.body.data.sale.id as string,
      arId: sale.body.data.accountReceivable.id as string,
      locationId: stock.id,
      customerName: label,
    };
  }
  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    const database = new URL(process.env.DATABASE_URL!);
    if (
      database.hostname !== '127.0.0.1' ||
      database.pathname !== '/pollos_rem002_e2e' ||
      process.env.CFDI_ENABLED !== 'false' ||
      process.env.FISCAL_PROVIDER !== 'NONE'
    )
      throw new Error('Dedicated local remediation database required');
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
        new CreateBucketCommand({ Bucket: process.env.OBJECT_STORAGE_BUCKET }),
      );
    } finally {
      storage.destroy();
    }
    const endpoint = new URL(process.env.REM002_BROWSER_WS ?? '');
    const dist = process.env.REM002_FRONTEND_DIST ?? '';
    if (
      endpoint.protocol !== 'ws:' ||
      endpoint.hostname !== '127.0.0.1' ||
      !existsSync(resolve(dist, 'index.html'))
    )
      throw new Error('Use REM002_BROWSER=true with the isolated runner');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AccountsReceivableAgingJob)
      .useValue({ onApplicationBootstrap() {} })
      .compile();
    app = module.createNestApplication<NestExpressApplication>();
    configureHttpApplication(app, module.get(ConfigService));
    app.useStaticAssets(dist);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/api') ||
        req.path.startsWith('/socket.io')
      )
        return next();
      res.sendFile(resolve(dist, 'index.html'));
    });
    await app.listen(0, '127.0.0.1');
    baseURL = await app.getUrl();
    prisma = module.get(PrismaService);
    await seed(prisma as never);
    cedisId = (
      await prisma.operationalLocation.findUniqueOrThrow({
        where: { code: 'CEDIS-VER' },
      })
    ).id;
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'dev.admin@pollos.local',
        password: DEVELOPMENT_ADMIN_PASSWORD,
      })
      .expect(200);
    token = login.body.data.accessToken;
    // Connecting is bounded; no unsafe launch flags, host mounts or non-loopback URLs.
    let last: unknown;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        browser = await chromium.connect(endpoint.toString(), {
          exposeNetwork: '<loopback>',
          timeout: 2000,
        });
        break;
      } catch (error) {
        last = error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!browser) throw last;
    console.log(
      `Linux Chromium ${browser.version()}; API mocks=0; frontend=fresh production build`,
    );
  }, 120000);
  afterAll(async () => {
    if (evidenceDir) {
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(
        resolve(evidenceDir, 'payments.json'),
        JSON.stringify(
          { browser: browser?.version(), apiMocks: 0, proof },
          null,
          2,
        ),
      );
    }
    await browser?.close();
    await app?.close();
  });

  const boundaries = [
    ['2026-10-24T23:59:00Z', '2026-10-24'],
    ['2026-10-25T00:00:00Z', '2026-10-24'],
    ['2026-10-25T05:59:00Z', '2026-10-24'],
    ['2026-10-25T06:00:00Z', '2026-10-25'],
  ];
  it.each(['America/Mexico_City', 'UTC', 'Asia/Tokyo'])(
    'FUNC-005/008: unedited collections reconcile operational boundaries with browser zone %s',
    async (timezoneId) => {
      const context = await browser.newContext({ baseURL, timezoneId });
      const page = await context.newPage();
      try {
        await page.goto('/login');
        await page
          .getByLabel('Correo', { exact: true })
          .fill('dev.collections@pollos.local');
        await page
          .getByLabel(/^Contraseña/)
          .fill(DEVELOPMENT_ROLE_TEST_PASSWORD);
        await page.getByRole('button', { name: 'Entrar al sistema' }).click();
        await browserExpect(page).toHaveURL(`${baseURL}/`);
        for (const [instant, date] of boundaries) {
          const f = await fixture();
          await page.clock.setFixedTime(new Date(instant));
          await page.goto('/accounts-receivable');
          await page.getByPlaceholder('Venta ID').fill(f.saleId);
          const button = page.getByRole('button', {
            name: `Registrar pago de ${f.customerName}`,
            exact: true,
          });
          await browserExpect(button).toBeVisible();
          await button.click();
          await browserExpect(
            page.getByLabel('Fecha de pago', { exact: true }),
          ).toHaveValue(date);
          if (timezoneId === 'UTC' && instant === '2026-10-25T05:59:00Z') {
            await screenshot(page, 'collections-desktop.png');
            await page.setViewportSize({ width: 390, height: 844 });
            await screenshot(page, 'collections-mobile.png');
            await page.setViewportSize({ width: 1280, height: 720 });
          }
          await page.getByLabel('Monto', { exact: true }).fill('20');
          await page.getByLabel(/^Método/).selectOption('TRANSFER');
          await page
            .getByLabel('Banco', { exact: true })
            .fill('Disposable bank');
          await page.getByLabel('Referencia', { exact: true }).fill(marker);
          await page
            .getByRole('button', { name: 'Registrar pago', exact: true })
            .click();
          const response = page.waitForResponse(
            (r: { url(): string; request(): { method(): string } }) =>
              new URL(r.url()).pathname ===
                `/api/accounts-receivable/${f.arId}/payments` &&
              r.request().method() === 'POST',
          );
          await page
            .getByRole('button', { name: 'Confirmar registro', exact: true })
            .click();
          expect((await response).status()).toBe(201);
          const payment = await prisma.payment.findFirstOrThrow({
            where: { accountReceivableId: f.arId },
          });
          expect(payment.paidAt.toISOString()).toBe(
            new Date(instant).toISOString(),
          );
          proof.push({
            timezoneId,
            instant,
            operationalDate: date,
            paymentId: payment.id,
            paidAt: payment.paidAt.toISOString(),
            amount: payment.amount.toString(),
            saleId: f.saleId,
            apiStatus: 201,
          });
          expect(
            Number(
              (
                await prisma.accountReceivable.findUniqueOrThrow({
                  where: { id: f.arId },
                })
              ).outstandingAmount,
            ),
          ).toBe(40);
          const report = await request(app.getHttpServer())
            .get('/api/reports/cash-closing')
            .set({ Authorization: `Bearer ${token}` })
            .query({ date, locationId: f.locationId })
            .expect(200);
          expect(report.body.data.accountsReceivablePayments).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ amount: '20.00' }),
            ]),
          );
          expect(
            await prisma.payment.count({
              where: { accountReceivableId: f.arId },
            }),
          ).toBe(1);
          await page.reload();
          await page.getByPlaceholder('Venta ID').fill(f.saleId);
          await browserExpect(
            page.getByRole('button', {
              name: `Registrar pago de ${f.customerName}`,
              exact: true,
            }),
          ).toBeVisible();
        }
      } finally {
        await context.close();
      }
    },
    120000,
  );
  it('FUNC-008: an unedited date does not become an invented historical midnight when the dialog crosses midnight', async () => {
    const f = await fixture();
    const context = await browser.newContext({ baseURL, timezoneId: 'UTC' });
    const page = await context.newPage();
    try {
      await page.clock.setFixedTime(new Date('2026-10-25T05:59:00Z'));
      await page.goto('/login');
      await page
        .getByLabel('Correo', { exact: true })
        .fill('dev.collections@pollos.local');
      await page.getByLabel(/^Contraseña/).fill(DEVELOPMENT_ROLE_TEST_PASSWORD);
      await page.getByRole('button', { name: 'Entrar al sistema' }).click();
      await browserExpect(page).toHaveURL(`${baseURL}/`);
      await page.goto('/accounts-receivable');
      await page.getByPlaceholder('Venta ID').fill(f.saleId);
      await page
        .getByRole('button', {
          name: `Registrar pago de ${f.customerName}`,
          exact: true,
        })
        .click();
      await browserExpect(
        page.getByLabel('Fecha de pago', { exact: true }),
      ).toHaveValue('2026-10-24');
      await page.clock.setFixedTime(new Date('2026-10-25T06:01:00Z'));
      await page.getByLabel('Monto', { exact: true }).fill('20');
      await page.getByLabel(/^Método/).selectOption('TRANSFER');
      await page.getByLabel('Banco', { exact: true }).fill('Disposable bank');
      await page.getByLabel('Referencia', { exact: true }).fill(marker);
      await page
        .getByRole('button', { name: 'Registrar pago', exact: true })
        .click();
      const response = page.waitForResponse(
        (r: { url(): string; request(): { method(): string } }) =>
          new URL(r.url()).pathname ===
            `/api/accounts-receivable/${f.arId}/payments` &&
          r.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: 'Confirmar registro', exact: true })
        .click();
      expect((await response).status()).toBe(201);
      const payment = await prisma.payment.findFirstOrThrow({
        where: { accountReceivableId: f.arId },
      });
      expect(payment.paidAt.toISOString()).toBe('2026-10-25T06:01:00.000Z');
      proof.push({
        scenario: 'dialog-crosses-midnight',
        paymentId: payment.id,
        paidAt: payment.paidAt.toISOString(),
      });
    } finally {
      await context.close();
    }
  }, 60000);

  it('FUNC-005/008: an explicitly selected historical date uses the operational zone, not the Tokyo browser', async () => {
    const f = await fixture();
    const context = await browser.newContext({
      baseURL,
      timezoneId: 'Asia/Tokyo',
    });
    const page = await context.newPage();
    try {
      await page.clock.setFixedTime(new Date('2026-10-25T06:01:00Z'));
      await page.goto('/login');
      await page
        .getByLabel('Correo', { exact: true })
        .fill('dev.collections@pollos.local');
      await page.getByLabel(/^Contraseña/).fill(DEVELOPMENT_ROLE_TEST_PASSWORD);
      await page.getByRole('button', { name: 'Entrar al sistema' }).click();
      await browserExpect(page).toHaveURL(`${baseURL}/`);
      await page.goto('/accounts-receivable');
      await page.getByPlaceholder('Venta ID').fill(f.saleId);
      await page
        .getByRole('button', {
          name: `Registrar pago de ${f.customerName}`,
          exact: true,
        })
        .click();
      await page
        .getByLabel('Fecha de pago', { exact: true })
        .fill('2026-10-23');
      await page
        .getByLabel('Siguiente fecha de pago', { exact: true })
        .fill('2026-10-27');
      await page.getByLabel('Monto', { exact: true }).fill('20');
      await page.getByLabel(/^Método/).selectOption('TRANSFER');
      await page.getByLabel('Banco', { exact: true }).fill('Disposable bank');
      await page.getByLabel('Referencia', { exact: true }).fill(marker);
      await page
        .getByRole('button', { name: 'Registrar pago', exact: true })
        .click();
      const response = page.waitForResponse(
        (r: { url(): string; request(): { method(): string } }) =>
          new URL(r.url()).pathname ===
            `/api/accounts-receivable/${f.arId}/payments` &&
          r.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: 'Confirmar registro', exact: true })
        .click();
      expect((await response).status()).toBe(201);
      const payment = await prisma.payment.findFirstOrThrow({
        where: { accountReceivableId: f.arId },
      });
      expect(payment.paidAt.toISOString()).toBe('2026-10-23T06:00:00.000Z');
      expect(payment.nextPaymentDate?.toISOString()).toBe(
        '2026-10-27T06:00:00.000Z',
      );
      proof.push({
        scenario: 'explicit-historical-date',
        browserZone: 'Asia/Tokyo',
        paidAt: payment.paidAt.toISOString(),
        nextPaymentDate: payment.nextPaymentDate?.toISOString(),
      });
    } finally {
      await context.close();
    }
  }, 60000);
  it('FUNC-001/002/005/008: driver wall time, delivered collection, admin detail, reload and versioned close use real persisted money', async () => {
    const f = await fixture();
    const routeName = key();
    const driver = await prisma.user.findUniqueOrThrow({
      where: { email: 'dev.driver@pollos.local' },
    });
    const route = await post('delivery-routes', {
      name: routeName,
      driverId: driver.id,
      scheduledDate: new Date().toISOString(),
      originLocationId: cedisId,
      routeStockLocationId: f.locationId,
      orders: [
        { saleId: f.saleId, deliveryAddress: 'Disposable delivery address' },
      ],
    });
    expect(route.status).toBe(201);
    const routeId = route.body.data.id;
    await request(app.getHttpServer())
      .patch(`/api/delivery-routes/${routeId}/status`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    const order = await prisma.deliveryOrder.findUniqueOrThrow({
      where: { saleId: f.saleId },
    });
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    expect(
      (
        await post(`delivery-orders/${order.id}/evidence`, {
          type: 'PHOTO',
          value: png,
          capturedAt: new Date().toISOString(),
        })
      ).status,
    ).toBe(201);
    await request(app.getHttpServer())
      .patch(`/api/delivery-orders/${order.id}/status`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ status: 'DELIVERED' })
      .expect(200);
    const context = await browser.newContext({
      baseURL,
      timezoneId: 'Asia/Tokyo',
    });
    const page = await context.newPage();
    try {
      await page.clock.setFixedTime(new Date('2026-10-25T05:59:00Z'));
      await page.goto('/login');
      await page
        .getByLabel('Correo', { exact: true })
        .fill('dev.driver@pollos.local');
      await page.getByLabel(/^Contraseña/).fill(DEVELOPMENT_ROLE_TEST_PASSWORD);
      await page.getByRole('button', { name: 'Entrar al sistema' }).click();
      await browserExpect(page).toHaveURL(`${baseURL}/`);
      await page.goto('/my-routes');
      await page.getByRole('button').filter({ hasText: routeName }).click();
      await page.getByRole('button', { name: 'Cobro', exact: true }).click();
      const dialog = page.getByRole('dialog', {
        name: 'Registrar pago',
        exact: true,
      });
      await browserExpect(dialog.getByLabel('Fecha de pago')).toHaveValue(
        '2026-10-24T23:59',
      );
      await dialog.getByLabel(/^Monto/).fill('20');
      await dialog.getByLabel('Método de pago').selectOption('TRANSFER');
      const response = page.waitForResponse(
        (r: { url(): string; request(): { method(): string } }) =>
          new URL(r.url()).pathname ===
            `/api/delivery-orders/${order.id}/collections` &&
          r.request().method() === 'POST',
      );
      await dialog
        .getByRole('button', { name: 'Registrar cobro', exact: true })
        .click();
      expect((await response).status()).toBe(201);
      const payment = await prisma.payment.findFirstOrThrow({
        where: { accountReceivableId: f.arId },
      });
      expect(payment.paidAt.toISOString()).toBe('2026-10-25T05:59:00.000Z');
      await request(app.getHttpServer())
        .patch(`/api/delivery-routes/${routeId}/status`)
        .set({ Authorization: `Bearer ${token}` })
        .send({ status: 'COMPLETED' })
        .expect(200);
      const saleItem = await prisma.saleItem.findFirstOrThrow({
        where: { saleId: f.saleId },
      });
      const unload = await post('inventory-transfers', {
        originLocationId: f.locationId,
        destinationLocationId: cedisId,
        items: [
          { productId: saleItem.productId, unit: 'PIECE', quantityPieces: 9 },
        ],
      });
      expect(unload.status).toBe(201);
      expect(
        (await post(`inventory-transfers/${unload.body.data.id}/confirm`, {}))
          .status,
      ).toBe(201);
      const settlement = await post(
        `delivery-routes/${routeId}/settlement`,
        {},
      );
      expect(settlement.status).toBe(201);
      expect(settlement.body.data).toMatchObject({
        expectedTransferAmount: 20,
        creditAmount: 40,
        differenceAmount: 0,
      });
      await context.close();
      const adminContext = await browser.newContext({
        baseURL,
        timezoneId: 'UTC',
      });
      const adminPage = await adminContext.newPage();
      try {
        await adminPage.goto('/login');
        await adminPage
          .getByLabel('Correo', { exact: true })
          .fill('dev.admin@pollos.local');
        await adminPage
          .getByLabel(/^Contraseña/)
          .fill(DEVELOPMENT_ADMIN_PASSWORD);
        await adminPage
          .getByRole('button', { name: 'Entrar al sistema' })
          .click();
        await browserExpect(adminPage).toHaveURL(`${baseURL}/`);
        await adminPage.goto(`/route-settlements/${settlement.body.data.id}`);
        await browserExpect(
          adminPage.getByRole('button', {
            name: 'Cerrar liquidación',
            exact: true,
          }),
        ).toBeVisible();
        await adminPage.reload();
        await adminPage
          .getByLabel(/^Versión esperada/)
          .fill(String(settlement.body.data.version));
        const closeResponse = adminPage.waitForResponse(
          (r: { url(): string; request(): { method(): string } }) =>
            new URL(r.url()).pathname ===
              `/api/route-settlements/${settlement.body.data.id}/close` &&
            r.request().method() === 'POST',
        );
        await adminPage
          .getByRole('button', { name: 'Cerrar liquidación', exact: true })
          .click();
        expect((await closeResponse).status()).toBe(201);
        const persisted = await prisma.routeSettlement.findUniqueOrThrow({
          where: { id: settlement.body.data.id },
        });
        expect(persisted.status).toBe('CLOSED');
        try {
          await browserExpect(
            adminPage.getByText(/Liquidación cerrada el/),
          ).toBeVisible();
        } catch (error) {
          if (evidenceDir) {
            const readback = await request(app.getHttpServer())
              .get(`/api/route-settlements/${settlement.body.data.id}`)
              .set({ Authorization: `Bearer ${token}` });
            mkdirSync(evidenceDir, { recursive: true });
            writeFileSync(
              resolve(evidenceDir, 'close-diagnostic.json'),
              JSON.stringify(
                {
                  persistedStatus: persisted.status,
                  readback: readback.body,
                  visibleText: await adminPage.locator('body').innerText(),
                  url: adminPage.url(),
                },
                null,
                2,
              ),
            );
            await screenshot(adminPage, 'close-diagnostic.png');
          }
          throw error;
        }
        await screenshot(adminPage, 'admin-settlement-closed.png');
        const closed = await prisma.routeSettlement.findUniqueOrThrow({
          where: { id: settlement.body.data.id },
        });
        expect(closed.status).toBe('CLOSED');
        expect(Number(closed.expectedTransferAmount)).toBe(20);
        expect(
          (closed.routeCollectionsSummary as { creditAmount?: number })
            .creditAmount,
        ).toBe(40);
        expect(Number(closed.differenceAmount)).toBe(0);
        proof.push({
          scenario: 'driver-local-time-and-admin-close',
          paymentId: payment.id,
          paidAt: payment.paidAt.toISOString(),
          settlementId: closed.id,
          status: closed.status,
          version: closed.version,
        });
      } finally {
        await adminContext.close();
      }
    } finally {
      await context.close();
    }
  }, 90000);
});
