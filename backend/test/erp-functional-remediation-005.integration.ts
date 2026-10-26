import request from 'supertest';
import { fork, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import {
  DEVELOPMENT_ADMIN_PASSWORD,
  DEVELOPMENT_ROLE_TEST_PASSWORD,
} from '../prisma/seed';
import { Rem003Harness, data, proof } from './erp-rem003-harness';
const frontendRequire = createRequire(
  resolve(__dirname, '../../frontend/package.json'),
);
const { chromium, expect: pw } = frontendRequire(
  '@playwright/test',
) as import('../../frontend/e2e/rem004-runtime-types').PlaywrightRuntime;
type Browser = Awaited<ReturnType<typeof chromium.connect>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;
describe('FUNC-012 real administrative settlement reopening', () => {
  const h = new Rem003Harness();
  let browser: Browser;
  beforeAll(async () => {
    await h.start();
    browser = await chromium.connect(process.env.REM003_BROWSER_WS!, {
      exposeNetwork: '<loopback>',
    });
  }, 120000);
  afterAll(async () => {
    proof('rem005-http', h.events);
    await browser?.close();
    await h.close();
  });
  async function closed(amount = 40) {
    const f = await h.fixture(true, true);
    expect((await h.collect(f, amount)).status).toBe(201);
    const opened = await h.post(`delivery-routes/${f.routeId}/settlement`);
    expect(opened.status).toBe(201);
    const s = data<{ id: string; version: number }>(opened);
    expect(
      (
        await h.post(`route-settlements/${s.id}/close`, {
          expectedVersion: s.version,
        })
      ).status,
    ).toBe(201);
    return { ...f, settlementId: s.id };
  }
  async function login(page: Page, role = 'admin') {
    await page.goto(h.url + '/login');
    await page
      .getByLabel('Correo', { exact: true })
      .fill(`dev.${role}@pollos.local`);
    await page
      .getByLabel(/^Contraseña/)
      .fill(
        role === 'admin'
          ? DEVELOPMENT_ADMIN_PASSWORD
          : DEVELOPMENT_ROLE_TEST_PASSWORD,
      );
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();
    await page.waitForURL(h.url + '/');
  }
  it('ADMIN sees the existing CLOSED settlement reopening action (original RED)', async () => {
    const f = await closed();
    const page = await browser.newPage();
    await login(page);
    await page.goto(h.url + `/route-settlements/${f.settlementId}`);
    await pw(page.getByText(/Liquidación cerrada el/)).toBeVisible();
    await page.screenshot({
      path: resolve(process.env.REM003_EVIDENCE_DIR!, 'closed-admin.png'),
      fullPage: true,
    });
    await pw(
      page.getByRole('button', { name: 'Reabrir liquidación', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Reabrir liquidación', exact: true })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('textbox', { name: /Motivo de reapertura/ })
      .fill('Review requested by administrator');
    await page.screenshot({
      path: resolve(process.env.REM003_EVIDENCE_DIR!, 'reopen-desktop.png'),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: resolve(process.env.REM003_EVIDENCE_DIR!, 'reopen-mobile.png'),
      fullPage: true,
    });
    expect(
      await page
        .getByRole('alertdialog')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page
        .getByRole('heading', { name: 'Reabrir liquidación', exact: true })
        .evaluate((el) => getComputedStyle(el).color),
    ).toBe('rgb(255, 255, 255)');
    await page.close();
  }, 60000);
  it.each(['collections', 'driver', 'seller', 'warehouse', 'billing'])(
    'blocks %s reopening without mutating state',
    async (role) => {
      const f = await closed();
      const before = await h.prisma.routeSettlement.findUniqueOrThrow({
        where: { id: f.settlementId },
      });
      expect(
        (
          await h.post(
            `route-settlements/${f.settlementId}/reopen`,
            {
              expectedVersion: before.version,
              reason: 'authorized correction',
            },
            role,
          )
        ).status,
      ).toBe(403);
      expect(
        await h.prisma.routeSettlement.findUniqueOrThrow({
          where: { id: f.settlementId },
        }),
      ).toEqual(before);
    },
  );
  it('validates anonymous, missing key, invalid reason/version and nonexistent settlement', async () => {
    const f = await closed();
    const body = { expectedVersion: 2, reason: 'reconcile payment' };
    expect(
      (
        await request(h.url)
          .post(`/api/route-settlements/${f.settlementId}/reopen`)
          .send(body)
      ).status,
    ).toBe(401);
    expect(
      (
        await request(h.url)
          .post(`/api/route-settlements/${f.settlementId}/reopen`)
          .set('Authorization', 'Bearer ' + h.tokens.admin)
          .send(body)
      ).status,
    ).toBe(400);
    for (const reason of [undefined, '', '   ', 123])
      expect(
        (
          await h.post(`route-settlements/${f.settlementId}/reopen`, {
            expectedVersion: 2,
            reason,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await h.post(`route-settlements/${f.settlementId}/reopen`, {
          ...body,
          expectedVersion: 0,
        })
      ).status,
    ).toBe(400);
    expect(
      (await h.post('route-settlements/not-present/reopen', body)).status,
    ).toBe(404);
    expect(
      (
        await h.post(`route-settlements/${f.settlementId}/reopen`, {
          ...body,
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await h.prisma.routeSettlement.findUniqueOrThrow({
          where: { id: f.settlementId },
        })
      ).version,
    ).toBe(2);
  });
  it('replays concurrent identical commands exactly once and rejects incompatible reuse', async () => {
    const f = await closed(),
      key = h.key(),
      body = { expectedVersion: 2, reason: 'review authorized' };
    const results = await Promise.all([
      h.post(`route-settlements/${f.settlementId}/reopen`, body, 'admin', key),
      h.post(`route-settlements/${f.settlementId}/reopen`, body, 'admin', key),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(
      await h.prisma.routeSettlementOpeningCommand.count({
        where: { idempotencyKey: key },
      }),
    ).toBe(1);
    expect(
      (
        await h.prisma.routeSettlement.findUniqueOrThrow({
          where: { id: f.settlementId },
        })
      ).version,
    ).toBe(3);
    expect(
      (
        await h.post(
          `route-settlements/${f.settlementId}/reopen`,
          { ...body, reason: 'different command' },
          'admin',
          key,
        )
      ).status,
    ).toBe(409);
  });
  it('serializes distinct reopens and competing close with stale versions', async () => {
    const f = await closed(),
      path = `route-settlements/${f.settlementId}`;
    const results = await Promise.all([
      h.post(path + '/reopen', { expectedVersion: 2, reason: 'review A' }),
      h.post(path + '/reopen', { expectedVersion: 2, reason: 'review B' }),
      h.post(path + '/close', { expectedVersion: 2 }),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    const other = await Promise.all([
      h.post(path + '/close', { expectedVersion: 3 }),
      h.post(path + '/reopen', {
        expectedVersion: 3,
        reason: 'not closed at version 3',
      }),
    ]);
    expect(other[0].status).toBe(201);
    expect([400, 409]).toContain(other[1].status);
    expect(
      (
        await h.prisma.routeSettlement.findUniqueOrThrow({
          where: { id: f.settlementId },
        })
      ).status,
    ).toBe('CLOSED');
  });
  it('preserves close history and guards, audits reopen, permits reversal and reclose', async () => {
    const f = await closed(),
      path = `route-settlements/${f.settlementId}`;
    const payment = await h.prisma.payment.findFirstOrThrow({
      where: { accountReceivableId: f.arId },
    });
    const old = await h.prisma.routeSettlementOpeningCommand.findMany({
      where: { settlementId: f.settlementId },
      orderBy: { createdAt: 'asc' },
    });
    expect((await h.collect(f, 60, 2)).status).toBe(409);
    const cancelBody = {
        expectedVersion: payment.version,
        reason: 'authorized payment correction',
      },
      cancelKey = h.key();
    expect(
      (
        await h.post(
          `payments/${payment.id}/cancel`,
          cancelBody,
          'admin',
          cancelKey,
        )
      ).status,
    ).toBe(409);
    expect(
      (await h.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe('APPLIED');
    const reason = 'Review payment with administrative approval',
      key = h.key(),
      body = { expectedVersion: 2, reason };
    expect((await h.post(path + '/reopen', body, 'admin', key)).status).toBe(
      201,
    );
    const reopened = await h.prisma.routeSettlement.findUniqueOrThrow({
      where: { id: f.settlementId },
    });
    expect(reopened).toMatchObject({
      status: 'OPEN',
      version: 3,
      reopenedReason: reason,
    });
    expect(reopened.reopenedAt).not.toBeNull();
    const admin = await h.prisma.user.findUniqueOrThrow({
      where: { email: 'dev.admin@pollos.local' },
    });
    expect(reopened.reopenedByUserId).toBe(admin.id);
    expect(
      (
        await h.post(
          `payments/${payment.id}/cancel`,
          cancelBody,
          'admin',
          cancelKey,
        )
      ).status,
    ).toBe(201);
    expect((await h.collect(f, 100, 2)).status).toBe(201);
    expect(
      (await h.post(`delivery-routes/${f.routeId}/settlement`)).status,
    ).toBe(201);
    expect((await h.post(path + '/close', { expectedVersion: 4 })).status).toBe(
      201,
    );
    expect(
      (
        await h.prisma.accountReceivable.findUniqueOrThrow({
          where: { id: f.arId },
        })
      ).outstandingAmount.toString(),
    ).toBe('0');
    for (const command of old)
      expect(
        await h.prisma.routeSettlementOpeningCommand.findUniqueOrThrow({
          where: { id: command.id },
        }),
      ).toEqual(command);
    expect((await h.post(path + '/reopen', body, 'admin', key)).status).toBe(
      201,
    );
    expect(data<{ status: string }>(await h.get(path)).status).toBe('CLOSED');
    const final = await h.prisma.routeSettlement.findUniqueOrThrow({
      where: { id: f.settlementId },
    });
    expect(final.version).toBe(5);
    expect(final.expectedCashAmount.toString()).toBe('100');
    proof('rem005-api-history', {
      settlementId: f.settlementId,
      oldLedger: old,
      final,
      reopened,
      payments: await h.prisma.payment.findMany({
        where: { accountReceivableId: f.arId },
      }),
    });
  });
  it('does not accept foreign company tokens or expose another silo settlement', async () => {
    const f = await closed();
    let child: ChildProcess | undefined;
    try {
      child = fork(resolve(__dirname, 'erp-rem004-silo.ts'), [], {
        cwd: resolve(__dirname, '..'),
        env: {
          ...process.env,
          DATABASE_URL: process.env.REM005_SILO_DATABASE_URL,
          E2E_DATABASE_URL: process.env.REM005_SILO_DATABASE_URL,
          JWT_ACCESS_SECRET: process.env.REM005_SILO_JWT_ACCESS_SECRET,
          JWT_REFRESH_SECRET: process.env.REM005_SILO_JWT_REFRESH_SECRET,
          OBJECT_STORAGE_ENDPOINT: process.env.REM005_SILO_STORAGE_URL,
          OBJECT_STORAGE_PUBLIC_ENDPOINT: process.env.REM005_SILO_STORAGE_URL,
          OBJECT_STORAGE_ACCESS_KEY_ID: process.env.REM005_SILO_ACCESS_KEY,
          OBJECT_STORAGE_SECRET_ACCESS_KEY:
            process.env.REM005_SILO_STORAGE_SECRET,
          REM003_FRONTEND_DIST: '',
          REM003_EVIDENCE_DIR: '',
        },
        execArgv: ['-r', 'ts-node/register/transpile-only'],
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      const silo = await new Promise<{ url: string; token: string }>(
        (res, rej) => {
          const timer = setTimeout(
            () => rej(new Error('silo readiness timeout')),
            30000,
          );
          child!.once('message', (m) => {
            clearTimeout(timer);
            res(m as { url: string; token: string });
          });
        },
      );
      const path = `/api/route-settlements/${f.settlementId}/reopen`,
        body = { expectedVersion: 2, reason: 'unauthorized silo' };
      expect(
        (
          await request(h.url)
            .post(path)
            .set('Authorization', 'Bearer ' + silo.token)
            .set('Idempotency-Key', h.key())
            .send(body)
        ).status,
      ).toBe(401);
      expect(
        (
          await request(silo.url)
            .post(path)
            .set('Authorization', 'Bearer ' + h.tokens.admin)
            .set('Idempotency-Key', h.key())
            .send(body)
        ).status,
      ).toBe(401);
      expect(
        (
          await request(silo.url)
            .post(path)
            .set('Authorization', 'Bearer ' + silo.token)
            .set('Idempotency-Key', h.key())
            .send(body)
        ).status,
      ).toBe(404);
    } finally {
      if (child?.connected)
        await new Promise<void>((r) => {
          child!.once('exit', () => r());
          child!.send('close');
        });
    }
  }, 60000);
  it('reopens through Chromium, collects second pass, recalculates and closes, survives restart', async () => {
    const f = await closed(),
      page = await browser.newPage();
    await login(page);
    await page.goto(h.url + `/route-settlements/${f.settlementId}`);
    await page
      .getByRole('button', { name: 'Reabrir liquidación', exact: true })
      .click();
    const dialog = page.getByRole('alertdialog');
    await pw(
      dialog.getByRole('button', { name: 'Confirmar reapertura' }),
    ).toBeDisabled();
    const reason = 'ADMIN approves second collection following close';
    await dialog
      .getByRole('textbox', { name: /Motivo de reapertura/ })
      .fill(reason);
    const requests: Array<{ key: string | undefined; body: unknown }> = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/reopen'))
        requests.push({
          key: r.headers()['idempotency-key'],
          body: r.postDataJSON() as unknown,
        });
    });
    await dialog
      .getByRole('button', { name: 'Confirmar reapertura' })
      .dblclick();
    await pw(
      page.getByRole('button', { name: 'Cerrar liquidación', exact: true }),
    ).toBeVisible();
    expect(requests).toHaveLength(1);
    const reopened = await h.prisma.routeSettlement.findUniqueOrThrow({
      where: { id: f.settlementId },
    });
    expect(reopened).toMatchObject({
      version: 3,
      reopenedReason: reason,
      status: 'OPEN',
    });
    const driver = await browser.newPage();
    await login(driver, 'driver');
    await driver.goto(h.url + '/my-routes');
    const route = await h.prisma.deliveryRoute.findUniqueOrThrow({
      where: { id: f.routeId },
    });
    await driver.getByRole('button', { name: new RegExp(route.name) }).click();
    const card = driver.locator('section.overflow-hidden.p-0').filter({
      has: driver.getByText('Venta ' + f.saleNumber, { exact: true }),
    });
    await card.getByRole('button', { name: '2ª vuelta', exact: true }).click();
    const collection = driver.getByRole('dialog');
    await collection.getByRole('spinbutton', { name: /^Monto/ }).fill('60');
    await collection
      .getByRole('button', { name: 'Registrar segunda vuelta' })
      .click();
    await pw(collection).toHaveCount(0);
    await page.reload();
    await page
      .getByRole('button', { name: 'Recalcular liquidación', exact: true })
      .click();
    await pw(
      page.getByRole('button', { name: 'Recalcular liquidación', exact: true }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Cerrar liquidación', exact: true })
      .click();
    await pw(page.getByText(/Liquidación cerrada el/)).toBeVisible();
    await page.reload();
    await pw(
      page.getByRole('button', { name: 'Reabrir liquidación', exact: true }),
    ).toBeVisible();
    const final = await h.prisma.routeSettlement.findUniqueOrThrow({
      where: { id: f.settlementId },
    });
    expect(final).toMatchObject({ version: 5, status: 'CLOSED' });
    expect(final.expectedCashAmount.toString()).toBe('100');
    expect(final.secondPassCollectionsAmount.toString()).toBe('60');
    expect(
      (
        await h.prisma.accountReceivable.findUniqueOrThrow({
          where: { id: f.arId },
        })
      ).outstandingAmount.toString(),
    ).toBe('0');
    await page.screenshot({
      path: resolve(process.env.REM003_EVIDENCE_DIR!, 'reclosed-admin.png'),
      fullPage: true,
    });
    await page.close();
    await driver.close();
    const persistedSources = async () => ({
      receivable: await h.prisma.accountReceivable.findUniqueOrThrow({
        where: { id: f.arId },
      }),
      payments: await h.prisma.payment.findMany({
        where: { accountReceivableId: f.arId },
        orderBy: { id: 'asc' },
      }),
      ledger: await h.prisma.routeSettlementOpeningCommand.findMany({
        where: { settlementId: f.settlementId },
        orderBy: { id: 'asc' },
      }),
      stock: await h.prisma.inventoryBalance.findMany({
        where: { productId: f.productId },
        orderBy: { id: 'asc' },
      }),
      evidenceCount: await h.prisma.deliveryEvidence.count({
        where: { deliveryOrderId: f.orderId },
      }),
    });
    const beforeRestart = await persistedSources();
    await h.restart();
    expect(
      await h.prisma.routeSettlement.findUniqueOrThrow({
        where: { id: f.settlementId },
      }),
    ).toEqual(final);
    expect(await persistedSources()).toEqual(beforeRestart);
    expect(beforeRestart.evidenceCount).toBe(1);
    const persisted = await browser.newPage();
    await login(persisted);
    await persisted.goto(h.url + `/route-settlements/${f.settlementId}`);
    await pw(persisted.getByText(/Liquidación cerrada el/)).toBeVisible();
    await persisted.close();
    proof('rem005-browser-cycle', {
      fixture: f,
      requests,
      reopened,
      final,
      beforeRestart,
      ledger: await h.prisma.routeSettlementOpeningCommand.findMany({
        where: { settlementId: f.settlementId },
        orderBy: { createdAt: 'asc' },
      }),
      payments: await h.prisma.payment.findMany({
        where: { accountReceivableId: f.arId },
      }),
    });
  }, 120000);
  it('COLLECTIONS can inspect CLOSED but has no reopening action in Chromium', async () => {
    const f = await closed(),
      page = await browser.newPage();
    await login(page, 'collections');
    await page.goto(h.url + `/route-settlements/${f.settlementId}`);
    await pw(page.getByText(/Liquidación cerrada el/)).toBeVisible();
    await pw(
      page.getByRole('button', { name: 'Reabrir liquidación', exact: true }),
    ).toHaveCount(0);
    await page.close();
  }, 60000);
  it('recovers a committed reopen after lost response with the identical browser command', async () => {
    const f = await closed(),
      page = await browser.newPage();
    await login(page);
    await page.goto(h.url + `/route-settlements/${f.settlementId}`);
    await page
      .getByRole('button', { name: 'Reabrir liquidación', exact: true })
      .click();
    const dialog = page.getByRole('alertdialog');
    await dialog
      .getByRole('textbox', { name: /Motivo de reapertura/ })
      .fill('Response loss recovery');
    const commands: Array<{ key: string | undefined; body: unknown }> = [];
    page.on('request', (r) => {
      if (r.url().endsWith('/reopen'))
        commands.push({
          key: r.headers()['idempotency-key'],
          body: r.postDataJSON() as unknown,
        });
    });
    let lost = false;
    await page.route('**/route-settlements/*/reopen', async (route) => {
      if (!lost) {
        lost = true;
        const actual = await route.fetch();
        expect(actual.status()).toBe(201);
        await route.abort('failed');
      } else await route.continue();
    });
    await dialog.getByRole('button', { name: 'Confirmar reapertura' }).click();
    await pw(dialog.getByText(/Puedes reintentar/)).toBeVisible();
    expect(
      (
        await h.prisma.routeSettlement.findUniqueOrThrow({
          where: { id: f.settlementId },
        })
      ).version,
    ).toBe(3);
    await dialog.getByRole('button', { name: 'Confirmar reapertura' }).click();
    await pw(
      page.getByRole('button', { name: 'Cerrar liquidación', exact: true }),
    ).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[0]).toEqual(commands[1]);
    expect(
      await h.prisma.routeSettlementOpeningCommand.count({
        where: { settlementId: f.settlementId },
      }),
    ).toBe(3);
    proof('rem005-lost-response', { commands, settlementId: f.settlementId });
    await page.close();
  }, 60000);
  it('recovers stale browser version only through explicit authoritative refresh', async () => {
    const f = await closed(),
      a = await browser.newPage(),
      b = await browser.newPage();
    await login(a);
    await login(b);
    await a.goto(h.url + `/route-settlements/${f.settlementId}`);
    await a
      .getByRole('button', { name: 'Reabrir liquidación', exact: true })
      .click();
    await a
      .getByRole('alertdialog')
      .getByRole('textbox', { name: /Motivo de reapertura/ })
      .fill('Session A stale correction');
    await b.goto(h.url + `/route-settlements/${f.settlementId}`);
    await b
      .getByRole('button', { name: 'Reabrir liquidación', exact: true })
      .click();
    await b
      .getByRole('alertdialog')
      .getByRole('textbox', { name: /Motivo de reapertura/ })
      .fill('Session B authorized correction');
    await b.getByRole('button', { name: 'Confirmar reapertura' }).click();
    await b
      .getByRole('button', { name: 'Cerrar liquidación', exact: true })
      .click();
    await pw(b.getByText(/Liquidación cerrada el/)).toBeVisible();
    const sent: Array<{ key: string | undefined; body: unknown }> = [];
    a.on('request', (r) => {
      if (r.url().endsWith('/reopen'))
        sent.push({
          key: r.headers()['idempotency-key'],
          body: r.postDataJSON() as unknown,
        });
    });
    await a.getByRole('button', { name: 'Confirmar reapertura' }).click();
    await pw(
      a.getByRole('button', { name: 'Confirmar reapertura' }),
    ).toBeDisabled();
    await a.getByRole('button', { name: 'Consultar estado actual' }).click();
    await pw(a.getByText('Versión a reabrir: 4')).toBeVisible();
    await a.getByRole('button', { name: 'Confirmar reapertura' }).click();
    await pw(
      a.getByRole('button', { name: 'Cerrar liquidación', exact: true }),
    ).toBeVisible();
    expect(sent).toHaveLength(2);
    expect(sent[0].key).not.toBe(sent[1].key);
    expect(
      sent.map((s) => (s.body as { expectedVersion: number }).expectedVersion),
    ).toEqual([2, 4]);
    expect(
      (
        await h.prisma.routeSettlement.findUniqueOrThrow({
          where: { id: f.settlementId },
        })
      ).version,
    ).toBe(5);
    proof('rem005-stale-ui', { settlementId: f.settlementId, sent });
    await a.close();
    await b.close();
  }, 60000);
  it('unblocks the original authorized sale void from UI after reopening and preserves historical close', async () => {
    const f = await closed(100),
      page = await browser.newPage();
    await login(page);
    const old = await h.prisma.routeSettlementOpeningCommand.findMany({
      where: { settlementId: f.settlementId },
    });
    await page.goto(h.url + `/sales/${f.saleId}`);
    await page
      .getByRole('button', { name: 'Anular venta', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByLabel('Motivo de autorización')
      .fill('Authorized correction');
    await pw(
      page.getByRole('button', { name: 'Confirmar anulación', exact: true }),
    ).toBeDisabled();
    await page.goto(h.url + `/route-settlements/${f.settlementId}`);
    await page
      .getByRole('button', { name: 'Reabrir liquidación', exact: true })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('textbox', { name: /Motivo de reapertura/ })
      .fill('Authorize original sale correction');
    await page.getByRole('button', { name: 'Confirmar reapertura' }).click();
    await pw(
      page.getByRole('button', { name: 'Cerrar liquidación', exact: true }),
    ).toBeVisible();
    await page.goto(h.url + `/sales/${f.saleId}`);
    await page
      .getByRole('button', { name: 'Anular venta', exact: true })
      .click();
    await page
      .getByRole('dialog')
      .getByLabel('Motivo de autorización')
      .fill('Authorized correction');
    await pw(
      page.getByRole('button', { name: 'Confirmar anulación', exact: true }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Confirmar anulación', exact: true })
      .click();
    await pw(page.getByRole('dialog')).toHaveCount(0);
    const sale = await h.prisma.sale.findUniqueOrThrow({
      where: { id: f.saleId },
    });
    expect(sale.status).toBe('CANCELLED');
    const restored = await h.prisma.inventoryBalance.findFirstOrThrow({
      where: { locationId: f.stockId, productId: f.productId },
    });
    expect(restored.quantityPieces.toString()).toBe('1');
    await h.transfer(f.productId, f.stockId, h.cedisId, 1);
    await page.goto(h.url + `/route-settlements/${f.settlementId}`);
    await page
      .getByRole('button', { name: 'Recalcular liquidación', exact: true })
      .click();
    await pw(
      page.getByRole('button', { name: 'Recalcular liquidación', exact: true }),
    ).toBeEnabled();
    await page
      .getByRole('button', { name: 'Cerrar liquidación', exact: true })
      .click();
    await pw(page.getByText(/Liquidación cerrada el/)).toBeVisible();
    for (const command of old)
      expect(
        await h.prisma.routeSettlementOpeningCommand.findUniqueOrThrow({
          where: { id: command.id },
        }),
      ).toEqual(command);
    expect(
      (
        await h.prisma.accountReceivable.findUniqueOrThrow({
          where: { id: f.arId },
        })
      ).outstandingAmount.toString(),
    ).toBe('0');
    const final = await h.prisma.routeSettlement.findUniqueOrThrow({
      where: { id: f.settlementId },
    });
    expect(final).toMatchObject({ status: 'CLOSED', version: 5 });
    expect(final.expectedCashAmount.toString()).toBe('0');
    proof('rem005-original-ui-correction', {
      fixture: f,
      saleStatus: sale.status,
      final,
      oldLedger: old,
    });
    await page.close();
  }, 90000);
});
