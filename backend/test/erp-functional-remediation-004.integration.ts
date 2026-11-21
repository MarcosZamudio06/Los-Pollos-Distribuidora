import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { SessionRevocationRegistry } from '../src/common/session/session-revocation.registry';
import { FleetGateway } from '../src/modules/fleet/fleet.gateway';
import { DEVELOPMENT_ADMIN_PASSWORD } from '../prisma/seed';
import {
  Rem003Harness,
  data,
  proof,
  type RouteFixture,
} from './erp-rem003-harness';

const frontendRequire = createRequire(
  resolve(__dirname, '../../frontend/package.json'),
);
const { chromium, expect: pw } = frontendRequire(
  '@playwright/test',
) as import('../../frontend/e2e/rem004-runtime-types').PlaywrightRuntime;
const { io } = frontendRequire(
  'socket.io-client',
) as import('../../frontend/e2e/rem004-runtime-types').SocketRuntime;
type Browser = Awaited<ReturnType<typeof chromium.connect>>;
type Page = Awaited<ReturnType<Browser['newPage']>>;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('FUNC-011 real PostgreSQL / Socket.IO / Linux Chromium fleet convergence', () => {
  const h = new Rem003Harness();
  let browser: Browser;
  let siloProcess: ChildProcess;
  let silo: { url: string; token: string };
  const journal: object[] = [];
  const frames: Array<{
    event: string;
    payload: Record<string, unknown>;
    session: number;
    at: number;
  }> = [];
  const monitorIds = new Map<Page, number>();
  const socketIds = new Map<Page, string>();
  const snapshotReads: Promise<void>[] = [];
  const snapshots: Array<{
    session: number;
    at: number;
    routeIds: string[];
    incidentIds: string[];
  }> = [];
  let monitorSequence = 0;
  const pages: Page[] = [];
  beforeAll(async () => {
    if (
      !process.env.REM003_BROWSER_WS ||
      !process.env.REM004_TILES_URL ||
      !process.env.REM003_FRONTEND_DIST
    )
      throw new Error(
        'Explicit disposable browser and real cartography required',
      );
    h.configureApp = (app) => {
      app.use(
        '/maps',
        (
          req: { originalUrl: string; headers: { host?: string } },
          res: import('node:http').ServerResponse,
        ) => {
          const upstream = new URL(
            req.originalUrl.replace(/^\/maps/, ''),
            process.env.REM004_TILES_URL,
          );
          const request = httpRequest(
            upstream,
            { headers: { host: req.headers.host ?? '' } },
            (response) => {
              res.writeHead(response.statusCode ?? 502, response.headers);
              response.pipe(res);
            },
          );
          request.on('error', () => {
            res.statusCode = 502;
            res.end();
          });
          request.end();
        },
      );
    };
    await h.start();
    const env = {
      ...process.env,
      DATABASE_URL: process.env.REM004_SILO_DATABASE_URL,
      E2E_DATABASE_URL: process.env.REM004_SILO_DATABASE_URL,
      JWT_ACCESS_SECRET: process.env.REM004_SILO_JWT_ACCESS_SECRET,
      JWT_REFRESH_SECRET: process.env.REM004_SILO_JWT_REFRESH_SECRET,
      OBJECT_STORAGE_ENDPOINT: process.env.REM004_SILO_STORAGE_URL,
      OBJECT_STORAGE_PUBLIC_ENDPOINT: process.env.REM004_SILO_STORAGE_URL,
      OBJECT_STORAGE_ACCESS_KEY_ID: process.env.REM004_SILO_ACCESS_KEY,
      OBJECT_STORAGE_SECRET_ACCESS_KEY: process.env.REM004_SILO_STORAGE_SECRET,
      REM003_FRONTEND_DIST: '',
      REM003_EVIDENCE_DIR: '',
    };
    siloProcess = fork(resolve(__dirname, 'erp-rem004-silo.ts'), [], {
      cwd: resolve(__dirname, '..'),
      env,
      execArgv: ['-r', 'ts-node/register/transpile-only'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    silo = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Second silo startup timed out')),
        30000,
      );
      siloProcess.once('message', (message) => {
        clearTimeout(timer);
        if ('error' in (message as object))
          reject(new Error('Second silo failed'));
        else resolve(message as { url: string; token: string });
      });
      siloProcess.once('exit', () =>
        reject(new Error('Second silo exited before readiness')),
      );
    });
    browser = await chromium.connect(process.env.REM003_BROWSER_WS, {
      exposeNetwork: '<loopback>',
    });
  }, 120000);
  afterAll(async () => {
    await Promise.all(snapshotReads);
    proof('fleet004-journal', { journal, frames, snapshots, http: h.events });
    await browser?.close();
    if (siloProcess?.connected) {
      await new Promise<void>((resolve) => {
        siloProcess.once('exit', () => resolve());
        siloProcess.send('close');
      });
    }
    await h.close();
  });

  afterEach(async () => {
    for (const route of await h.prisma.deliveryRoute.findMany({
      where: { status: 'IN_PROGRESS' },
    }))
      await h.patch(`delivery-routes/${route.id}/status`, {
        status: 'CANCELLED',
      });
    for (const page of pages.splice(0))
      if (!page.isClosed()) await page.context().close();
    await pw
      .poll(
        () =>
          (
            h.app.get(FleetGateway).server as unknown as {
              sockets: Map<string, unknown>;
            }
          ).sockets.size,
      )
      .toBe(0);
  });

  async function monitor(origin?: string) {
    const context = await browser.newContext({
      baseURL: h.url,
      timezoneId: 'America/Mexico_City',
    });
    const page = await context.newPage();
    pages.push(page);
    const session = ++monitorSequence;
    monitorIds.set(page, session);
    page.setDefaultTimeout(15000);
    page.on('console', async (message) => {
      if (message.type() !== 'error') return;
      const details = await Promise.all(
        message.args().map((arg) =>
          arg
            .evaluate((value: unknown) => {
              if (!value || typeof value !== 'object') return String(value);
              const event = value as {
                message?: string;
                error?: { message?: string };
                sourceId?: string;
              };
              return {
                message: event.message,
                error: event.error?.message,
                sourceId: event.sourceId,
              };
            })
            .catch(() => null),
        ),
      );
      journal.push({ browserError: message.text(), details });
    });
    page.on('response', (r) => {
      if (
        new URL(r.url()).pathname === '/api/fleet/live' &&
        r.status() === 200
      ) {
        snapshotReads.push(
          r.json().then(
            (body: {
              data: {
                items: Array<{
                  route: { id: string };
                  incidents?: Array<{ incidentId: string }>;
                }>;
              };
            }) => {
              snapshots.push({
                session,
                at: performance.now(),
                routeIds: body.data.items.map((item) => item.route.id),
                incidentIds: body.data.items.flatMap((item) =>
                  (item.incidents ?? []).map((incident) => incident.incidentId),
                ),
              });
            },
            () => {
              journal.push({ session, snapshotBodyUnreadable: true });
            },
          ),
        );
      }
      if (new URL(r.url()).pathname.startsWith('/maps/'))
        journal.push({ mapAsset: new URL(r.url()).pathname, http: r.status() });
    });
    page.on('websocket', (ws) =>
      ws.on('framereceived', (frame) => {
        const raw = String(frame.payload);
        if (raw.startsWith('40/fleet,')) {
          const connected = JSON.parse(raw.slice('40/fleet,'.length)) as {
            sid: string;
          };
          socketIds.set(page, connected.sid);
        }
        const start = raw.indexOf('["fleet.');
        if (start >= 0) {
          const [event, payload] = JSON.parse(raw.slice(start)) as [
            string,
            Record<string, unknown>,
          ];
          frames.push({ event, payload, session, at: performance.now() });
        }
      }),
    );
    await page.goto('/login');
    await page
      .getByLabel('Correo', { exact: true })
      .fill('dev.admin@pollos.local');
    await page.getByLabel(/^Contraseña/).fill(DEVELOPMENT_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Entrar al sistema' }).click();
    await pw(page).toHaveURL(/\/$/);
    await page.goto('/delivery-routes/live');
    await page.waitForLoadState('networkidle');
    if (origin)
      await page
        .getByRole('combobox', { name: 'Filtrar por origen' })
        .selectOption(origin);
    await pw(
      page.getByText('Tiempo real conectado', { exact: true }),
    ).toBeVisible();
    await pw(page.locator('canvas.maplibregl-canvas')).toBeVisible();
    return page;
  }
  async function fixture(geographic = false) {
    const f = await h.fixture();
    const vehicle = await h.prisma.vehicle.create({
      data: {
        code: h.key(),
        displayName: 'REM004 SIMULATED GPS',
        isActive: true,
      },
    });
    let planId: string | undefined;
    let originId = h.cedisId;
    const scheduledDate = new Date().toISOString();
    if (geographic) {
      const origin = await h.prisma.operationalLocation.create({
        data: {
          name: h.key(),
          code: h.key(),
          type: 'DISTRIBUTION_CENTER',
          latitude: 19.179094,
          longitude: -96.1233923,
        },
      });
      originId = origin.id;
      const plan = await h.post('delivery-route-plans', {
        driverId: h.driverId,
        vehicleId: vehicle.id,
        originLocationId: originId,
        scheduledDate,
        stops: [
          {
            saleId: f.saleId,
            accountReceivableId: f.arId,
            deliveryAddress: 'Public OSM Veracruz destination',
            latitude: 19.1841646,
            longitude: -96.1386664,
          },
        ],
      });
      expect(plan.status).toBe(201);
      planId = data<{ id: string }>(plan).id;
    }
    const r = await h.post('delivery-routes', {
      name: 'Rem004 ' + h.key(),
      driverId: h.driverId,
      vehicleId: vehicle.id,
      scheduledDate,
      originLocationId: originId,
      routeStockLocationId: f.stockId,
      ...(planId
        ? { routePlanId: planId }
        : {
            orders: [
              {
                saleId: f.saleId,
                deliveryAddress: 'Synthetic Veracruz test destination',
              },
            ],
          }),
    });
    expect(r.status).toBe(201);
    f.routeId = data<{ id: string }>(r).id;
    f.orderId = (
      await h.prisma.deliveryOrder.findUniqueOrThrow({
        where: { saleId: f.saleId },
      })
    ).id;
    return { ...f, vehicle };
  }
  const units = (page: Page, code: string) =>
    page.getByTestId('fleet-unit-button').filter({ hasText: code });
  async function status(f: RouteFixture, value: string) {
    const t = performance.now();
    const r = await h.patch(`delivery-routes/${f.routeId}/status`, {
      status: value,
    });
    expect(r.status).toBe(200);
    expect(
      (
        await h.prisma.deliveryRoute.findUniqueOrThrow({
          where: { id: f.routeId },
        })
      ).status,
    ).toBe(value);
    journal.push({
      routeId: f.routeId,
      transition: value,
      http: r.status,
      requestMs: performance.now() - t,
    });
    return t;
  }
  async function gps(
    f: RouteFixture,
    latitude = 19.1748,
    recordedAt = new Date().toISOString(),
  ) {
    const clientEventId = randomUUID();
    const r = await h.post(
      'fleet/positions',
      {
        clientEventId,
        latitude,
        longitude: -96.1334,
        accuracyMeters: 10,
        recordedAt,
      },
      'driver',
    );
    expect(r.status).toBe(201);
    const row = await h.prisma.vehiclePosition.findUniqueOrThrow({
      where: { clientEventId },
    });
    expect(row.routeId).toBe(f.routeId);
    expect(row.driverId).toBe(h.driverId);
    const point = await h.prisma.$queryRaw<
      Array<{ srid: number; x: number; y: number }>
    >`SELECT ST_SRID("positionPoint") AS srid, ST_X("positionPoint") AS x, ST_Y("positionPoint") AS y FROM "VehiclePosition" WHERE id=${row.id}`;
    expect(point[0]).toEqual({ srid: 4326, x: -96.1334, y: latitude });
    await pw
      .poll(() =>
        frames.some(
          (x) =>
            x.event === 'fleet.position.updated' && x.payload.id === row.id,
        ),
      )
      .toBe(true);
    return row;
  }
  it('adds a new departure to two already-connected sessions without manual recovery', async () => {
    const a = await monitor();
    const b = await monitor();
    const f = await fixture(true);
    const t = await status(f, 'IN_PROGRESS');
    await gps(f);
    const visible = await units(a, f.vehicle.code).count();
    proof('fleet004-start-before-wait', {
      route: f.routeId,
      initialUnits: visible,
      authoritative: data<unknown>(await h.get('fleet/live')),
    });
    try {
      await pw(units(a, f.vehicle.code)).toHaveCount(1, { timeout: 10000 });
      await pw(units(b, f.vehicle.code)).toHaveCount(1);
      await pw(
        units(a, f.vehicle.code).getByText('GPS stale', { exact: true }),
      ).toHaveCount(0);
      await a
        .getByRole('button', { name: 'Centrar en flota', exact: true })
        .click();
      await a.waitForLoadState('networkidle');
      const style = (await (
        await fetch(h.url + '/maps/styles/operations/style.json')
      ).json()) as { layers: Array<{ 'source-layer'?: string }> };
      const tiles = (await (
        await fetch(h.url + '/maps/data/mexico.json')
      ).json()) as { vector_layers: Array<{ id: string }> };
      const required = [
        ...new Set(
          style.layers.flatMap((layer) =>
            layer['source-layer'] ? [layer['source-layer']] : [],
          ),
        ),
      ];
      const provided = tiles.vector_layers.map((layer) => layer.id);
      expect(required.filter((layer) => !provided.includes(layer))).toEqual([]);
      proof('fleet004-map-contract', { required, provided, missing: [] });
      await a.getByLabel('Mapa de monitoreo de flota').screenshot({
        path: resolve(process.env.REM003_EVIDENCE_DIR!, 'active-map.png'),
      });
    } finally {
      await a.screenshot({
        path: resolve(process.env.REM003_EVIDENCE_DIR!, 'start.png'),
      });
    }
    journal.push({
      scenario: 'start-two-monitors',
      ms: performance.now() - t,
      routeId: f.routeId,
    });
    await pw
      .poll(() =>
        frames.some(
          (x) =>
            x.event === 'fleet.route.updated' &&
            x.payload.routeId === f.routeId,
        ),
      )
      .toBe(true);
    await status(f, 'CANCELLED');
    await pw(units(a, f.vehicle.code)).toHaveCount(0);
    await pw(units(b, f.vehicle.code)).toHaveCount(0);
    await a.context().close();
    await b.context().close();
  }, 120000);

  it('removes a cancelled route without manual recovery, including an origin-scoped monitor', async () => {
    // Independent original cancellation reproduction: mount after start to establish a valid snapshot.
    const f = await fixture();
    await status(f, 'IN_PROGRESS');
    const page = await monitor(h.cedisId);
    await gps(f);
    await page.getByRole('button', { name: 'Recuperar snapshot' }).click();
    await pw(units(page, f.vehicle.code)).toHaveCount(1);
    const t = await status(f, 'CANCELLED');
    try {
      await pw(units(page, f.vehicle.code)).toHaveCount(0, { timeout: 10000 });
    } finally {
      await page.screenshot({
        path: resolve(process.env.REM003_EVIDENCE_DIR!, 'cancel.png'),
      });
    }
    journal.push({
      scenario: 'cancel',
      ms: performance.now() - t,
      routeId: f.routeId,
    });
    const replayed = frames.find(
      (x) =>
        x.event === 'fleet.route.updated' && x.payload.routeId === f.routeId,
    );
    if (replayed) {
      // Transport fault injection of a captured persisted hint, not an API or database mock.
      const gateway = h.app.get(FleetGateway);
      gateway.emitRouteUpdated(
        { ...replayed.payload, status: 'IN_PROGRESS' },
        h.cedisId,
        h.driverId,
      );
      gateway.emitRouteUpdated(
        { ...replayed.payload, status: 'IN_PROGRESS' },
        h.cedisId,
        h.driverId,
      );
      await sleep(500);
      await pw(units(page, f.vehicle.code)).toHaveCount(0);
    }
    await page.context().close();
  }, 120000);

  it('converges after lost events, remount, completion and GPS duplicates without state rollback', async () => {
    const f = await fixture();
    const page = await monitor();
    await status(f, 'IN_PROGRESS');
    await gps(f);
    await pw(units(page, f.vehicle.code)).toHaveCount(1);
    const gateway = h.app.get(FleetGateway);
    const routeEventsBefore = frames.filter(
      (x) =>
        x.event === 'fleet.route.updated' && x.payload.routeId === f.routeId,
    ).length;
    expect(
      (
        await h.patch(`delivery-routes/${f.routeId}/status`, {
          status: 'COMPLETED',
        })
      ).status,
    ).toBe(400);
    await sleep(150);
    expect(
      frames.filter(
        (x) =>
          x.event === 'fleet.route.updated' && x.payload.routeId === f.routeId,
      ),
    ).toHaveLength(routeEventsBefore);
    const old = await gps(
      f,
      19.1749,
      new Date(Date.now() - 1000).toISOString(),
    );
    const latest = await gps(f, 19.1761);
    const replay = await h.post(
      'fleet/positions',
      {
        clientEventId: latest.clientEventId,
        latitude: 19.1761,
        longitude: -96.1334,
        accuracyMeters: 10,
        recordedAt: latest.recordedAt.toISOString(),
      },
      'driver',
    );
    expect(replay.status).toBe(201);
    expect(
      await h.prisma.vehiclePosition.count({
        where: { clientEventId: latest.clientEventId },
      }),
    ).toBe(1);
    const oldPayload = frames.find(
      (x) => x.event === 'fleet.position.updated' && x.payload.id === old.id,
    )!.payload;
    gateway.emitPositionUpdated(
      oldPayload as unknown as Parameters<
        FleetGateway['emitPositionUpdated']
      >[0],
    );
    const authoritative = data<{
      items: Array<{ vehicle: { id: string }; position: { latitude: number } }>;
    }>(await h.get('fleet/live'));
    expect(
      authoritative.items.find((x) => x.vehicle.id === f.vehicle.id)?.position
        .latitude,
    ).toBe(19.1761);
    const reconnectStarted = performance.now();
    await page.context().setOffline(true);
    // Close the transport, not Socket.IO's namespace (which disables client reconnection).
    for (const socket of (
      gateway.server as unknown as {
        sockets: Map<string, import('socket.io').Socket>;
      }
    ).sockets.values())
      if (socket.handshake.auth.token) socket.client.conn.close();
    await status(f, 'CANCELLED');
    await sleep(200);
    await page.context().setOffline(false);
    await pw(
      page.getByText('Tiempo real conectado', { exact: true }),
    ).toBeVisible({ timeout: 25000 });
    await pw(units(page, f.vehicle.code)).toHaveCount(0);
    journal.push({
      scenario: 'reconnect-converged',
      ms: performance.now() - reconnectStarted,
    });
    const completed = await fixture();
    await status(completed, 'IN_PROGRESS');
    await gps(completed);
    await pw(units(page, completed.vehicle.code)).toHaveCount(1);
    const value =
      'data:image/png;base64,' +
      readFileSync(
        resolve(__dirname, '../../frontend/e2e/fixtures/driver-delivery.png'),
      ).toString('base64');
    expect(
      (
        await h.post(
          `delivery-orders/${completed.orderId}/evidence`,
          { type: 'PHOTO', value, capturedAt: new Date().toISOString() },
          'driver',
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await h.patch(
          `delivery-orders/${completed.orderId}/status`,
          { status: 'DELIVERED' },
          'driver',
        )
      ).status,
    ).toBe(200);
    expect((await h.collect(completed, 100)).status).toBe(201);
    const completionStarted = await status(completed, 'COMPLETED');
    await pw(units(page, completed.vehicle.code)).toHaveCount(0);
    journal.push({
      scenario: 'completion-converged',
      ms: performance.now() - completionStarted,
    });
    expect(
      (
        await h.prisma.accountReceivable.findUniqueOrThrow({
          where: { id: completed.arId },
        })
      ).outstandingAmount.toNumber(),
    ).toBe(0);
    await page
      .getByRole('link', { name: 'Inicio', exact: true })
      .first()
      .click();
    await page.goBack();
    await pw(
      page.getByText('Tiempo real conectado', { exact: true }),
    ).toBeVisible();
    await pw(units(page, completed.vehicle.code)).toHaveCount(0);
    await pw(
      page.getByText('El mapa no está disponible.', { exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: resolve(
        process.env.REM003_EVIDENCE_DIR!,
        'completed-reconnected.png',
      ),
    });
    journal.push({
      scenario: 'reconnect-complete-remount',
      gpsLatest: latest.id,
      routeId: completed.routeId,
      duplicates: 0,
    });
    await page.context().close();
  }, 180000);

  it.each(['loaded', 'in-flight'] as const)(
    'propagates a legitimate failed-delivery incident during a separate administrative session (%s snapshot)',
    async (timing) => {
      const a = await monitor();
      const b = await monitor();
      const sessionIds = [monitorIds.get(a)!, monitorIds.get(b)!];
      let release!: () => void;
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      let hold = timing === 'in-flight';
      const held: Array<{ routeIds: string[]; incidentIds: string[] }> = [];
      const gateway = h.app.get(FleetGateway);
      const emission = jest.spyOn(gateway, 'emitIncidentCreated');
      const foreignEvents: object[] = [];
      const foreign = io(silo.url + '/fleet', {
        path: '/api/socket.io',
        auth: { token: silo.token },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        autoConnect: false,
        timeout: 5000,
      });
      foreign.on('fleet.incident.created', (event: object) =>
        foreignEvents.push(event),
      );
      try {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer);
            foreign.off('connect', connected);
            foreign.off('connect_error', rejected);
          };
          const connected = () => {
            cleanup();
            resolve();
          };
          const rejected = (error: Error) => {
            cleanup();
            reject(error);
          };
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error('B control socket timed out'));
          }, 5000);
          foreign.once('connect', connected);
          foreign.once('connect_error', rejected);
          foreign.connect();
        });
        await a.route('**/api/fleet/live*', async (route) => {
          const response = await route.fetch();
          const body = (await response.json()) as {
            data: {
              items: Array<{
                route: { id: string };
                incidents?: Array<{ incidentId: string }>;
              }>;
            };
          };
          // Hold only pre-incident reads. A post-commit reconciliation is free to finish.
          if (
            hold &&
            body.data.items.every((item) => !(item.incidents ?? []).length)
          ) {
            held.push({
              routeIds: body.data.items.map((item) => item.route.id),
              incidentIds: [],
            });
            await barrier;
          }
          await route.fulfill({ response, json: body });
        });
        const f = await fixture();
        await status(f, 'IN_PROGRESS');
        await gps(f);
        await pw(units(b, f.vehicle.code)).toHaveCount(1);
        if (timing === 'loaded')
          await pw(units(a, f.vehicle.code)).toHaveCount(1);
        else
          await pw
            .poll(() =>
              held.some((snapshot) => snapshot.routeIds.includes(f.routeId!)),
            )
            .toBe(true);
        const reason = 'SIMULATED: customer unavailable';
        const r = await h.post(
          `delivery-orders/${f.orderId}/incidents`,
          { status: 'NOT_DELIVERED', reason },
          'driver',
        );
        expect(r.status).toBe(201);
        const persisted = await h.prisma.deliveryIncident.findMany({
          where: { deliveryOrderId: f.orderId },
        });
        expect(persisted).toHaveLength(1);
        expect(persisted[0].reason).toBe(reason);
        expect(persisted[0].status).toBe('OPEN');
        expect(
          (
            await h.prisma.deliveryOrder.findUniqueOrThrow({
              where: { id: f.orderId },
            })
          ).status,
        ).toBe('NOT_DELIVERED');
        expect(emission).toHaveBeenCalledTimes(1);
        const payload = emission.mock.calls[0][0];
        expect(payload.incidentId).toBe(persisted[0].id);
        await pw
          .poll(() =>
            sessionIds.every((session) =>
              frames.some(
                (frame) =>
                  frame.session === session &&
                  frame.event === 'fleet.incident.created' &&
                  frame.payload.incidentId === payload.incidentId,
              ),
            ),
          )
          .toBe(true);
        hold = false;
        release();
        await a.waitForLoadState('networkidle');
        await Promise.all(snapshotReads);
        proof(`fleet004-incident-before-render-${timing}`, {
          incidentId: payload.incidentId,
          persistedRows: persisted.length,
          backendEmissionObserved: true,
          renderChecked: false,
          browserFrames: frames.filter(
            (frame) => frame.payload.incidentId === payload.incidentId,
          ),
          snapshotResponses: snapshots.filter((snapshot) =>
            sessionIds.includes(snapshot.session),
          ),
          held,
        });
        for (const page of [a, b]) {
          await pw(page.getByText(reason, { exact: true })).toBeVisible();
          await pw(page.getByText(reason, { exact: true })).toHaveCount(1);
        }
        await pw
          .poll(() =>
            sessionIds.every((session) =>
              snapshots.some(
                (snapshot) =>
                  snapshot.session === session &&
                  snapshot.incidentIds.includes(payload.incidentId),
              ),
            ),
          )
          .toBe(true);
        const authoritative = data<{
          items: Array<{ incidents?: Array<{ incidentId: string }> }>;
        }>(await h.get('fleet/live'));
        expect(
          authoritative.items
            .flatMap((item) => item.incidents ?? [])
            .filter((incident) => incident.incidentId === payload.incidentId),
        ).toHaveLength(1);
        // Duplicate transport delivery is not another persisted incident or another UI card.
        gateway.emitIncidentCreated(payload, h.cedisId);
        gateway.emitIncidentCreated(payload, h.cedisId);
        await pw
          .poll(() =>
            sessionIds.every(
              (session) =>
                frames.filter(
                  (frame) =>
                    frame.session === session &&
                    frame.event === 'fleet.incident.created' &&
                    frame.payload.incidentId === payload.incidentId,
                ).length === 3,
            ),
          )
          .toBe(true);
        for (const page of [a, b])
          await pw(page.getByText(reason, { exact: true })).toHaveCount(1);
        const beforeReconnect = performance.now();
        const bSocketId = socketIds.get(b)!;
        const liveSocket = (
          gateway.server as unknown as {
            sockets: Map<string, import('socket.io').Socket>;
          }
        ).sockets.get(socketIds.get(a)!);
        expect(liveSocket).toBeDefined();
        await a.context().setOffline(true);
        liveSocket!.client.conn.close();
        await pw
          .poll(() =>
            (
              gateway.server as unknown as { sockets: Map<string, unknown> }
            ).sockets.has(liveSocket!.id),
          )
          .toBe(false);
        await pw(a.getByText(reason, { exact: true })).toHaveCount(1);
        await a.context().setOffline(false);
        await pw(
          a.getByText('Tiempo real conectado', { exact: true }),
        ).toBeVisible({ timeout: 25000 });
        await pw
          .poll(() =>
            snapshots.some(
              (snapshot) =>
                snapshot.session === sessionIds[0] &&
                snapshot.at > beforeReconnect &&
                snapshot.incidentIds.includes(payload.incidentId),
            ),
          )
          .toBe(true);
        await pw(a.getByText(reason, { exact: true })).toBeVisible();
        expect(socketIds.get(b)).toBe(bSocketId);
        const beforeRemount = performance.now();
        const beforeRemountSocket = socketIds.get(a)!;
        // Remount through the router, retaining this independently authenticated session.
        await a
          .getByRole('link', { name: 'Inicio', exact: true })
          .first()
          .click();
        await pw(
          a.getByText('Tiempo real conectado', { exact: true }),
        ).toHaveCount(0);
        await pw
          .poll(() =>
            (
              gateway.server as unknown as { sockets: Map<string, unknown> }
            ).sockets.has(beforeRemountSocket),
          )
          .toBe(false);
        await a.goBack();
        await pw(
          a.getByText('Tiempo real conectado', { exact: true }),
        ).toBeVisible();
        await pw(a.getByText(reason, { exact: true })).toBeVisible();
        await pw
          .poll(() =>
            snapshots.some(
              (snapshot) =>
                snapshot.session === sessionIds[0] &&
                snapshot.at > beforeRemount &&
                snapshot.incidentIds.includes(payload.incidentId),
            ),
          )
          .toBe(true);
        await pw(a.getByText(reason, { exact: true })).toHaveCount(1);
        expect(
          await h.prisma.deliveryIncident.count({
            where: { deliveryOrderId: f.orderId },
          }),
        ).toBe(1);
        expect(foreign.connected).toBe(true);
        expect(foreignEvents).toEqual([]);
        proof(`fleet004-incident-${timing}`, {
          incidentId: payload.incidentId,
          routeId: f.routeId,
          persistedRows: 1,
          backendEmissionObserved: true,
          browserSessions: sessionIds,
          browserFrames: frames.filter(
            (frame) => frame.payload.incidentId === payload.incidentId,
          ),
          snapshotResponses: snapshots.filter((snapshot) =>
            sessionIds.includes(snapshot.session),
          ),
          held,
          renderedInBothSessions: true,
          renderedAfterReconnectAndRemount: true,
          duplicateCards: 0,
          foreignBackendEvents: foreignEvents.length,
          cacheEvidence:
            'Measured separately by deterministic React Query hook regressions; not introspected from browser internals.',
        });
        await status(f, 'COMPLETED');
        for (const page of [a, b])
          await pw(units(page, f.vehicle.code)).toHaveCount(0);
        journal.push({
          scenario: 'incident-and-completion',
          timing,
          routeId: f.routeId,
        });
      } finally {
        hold = false;
        release();
        emission.mockRestore();
        foreign.disconnect();
        for (const page of [a, b])
          if (!page.isClosed()) await page.context().close();
      }
    },
    120000,
  );

  it('scopes route hints to origin and driver, rejects unauthorized sockets and foreign-silo tokens', async () => {
    const clients: Array<ReturnType<typeof io>> = [];
    const observed: Record<string, object[]> = {};
    const handshakes: Record<
      string,
      {
        connected: number;
        rejected: number;
        reconnects: number;
        events: string[];
      }
    > = {};
    async function handshake(
      label: string,
      token: string,
      originLocationId?: string,
      url = h.url,
    ) {
      observed[label] = [];
      const counts = (handshakes[label] = {
        connected: 0,
        rejected: 0,
        reconnects: 0,
        events: [] as string[],
      });
      const socket = io(url + '/fleet', {
        path: '/api/socket.io',
        auth: { token, ...(originLocationId ? { originLocationId } : {}) },
        transports: ['websocket'],
        autoConnect: false,
        forceNew: true,
        timeout: 5000,
        reconnection: false,
      });
      clients.push(socket);
      socket.on('connect', () => counts.connected++);
      socket.on('connect_error', () => counts.rejected++);
      socket.io.on('reconnect_attempt', () => counts.reconnects++);
      socket.onAny((event: string) => counts.events.push(event));
      socket.on('fleet.route.updated', (p: object) => observed[label].push(p));
      const outcome = await new Promise<'connected' | Error>(
        (resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer);
            socket.off('connect', connected);
            socket.off('connect_error', rejected);
          };
          const connected = () => {
            cleanup();
            resolve('connected');
          };
          const rejected = (error: Error) => {
            cleanup();
            resolve(error);
          };
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Fleet handshake timed out'));
          }, 5000);
          socket.once('connect', connected);
          socket.once('connect_error', rejected);
          socket.connect();
        },
      );
      return { socket, outcome };
    }
    async function connectAccepted(...args: Parameters<typeof handshake>) {
      const { socket, outcome } = await handshake(...args);
      expect(outcome).toBe('connected');
      expect(socket.connected).toBe(true);
      return socket;
    }
    async function expectRejected(...args: Parameters<typeof handshake>) {
      const { socket, outcome } = await handshake(...args);
      expect(outcome).toBeInstanceOf(Error);
      expect((outcome as Error).message).toBe('Unauthorized socket session');
      expect(socket.connected).toBe(false);
      expect(socket.active).toBe(false);
      expect(socket.io.reconnection()).toBe(false);
    }
    async function siloSocketState(command = 'socket-state') {
      return new Promise<{ sockets: number; tracked: number; pending: number }>(
        (resolve, reject) => {
          const cleanup = () => {
            clearTimeout(timer);
            siloProcess.off('message', received);
            siloProcess.off('exit', exited);
          };
          const received = (state: {
            sockets: number;
            tracked: number;
            pending: number;
          }) => {
            cleanup();
            resolve(state);
          };
          const exited = () => {
            cleanup();
            reject(new Error('Second silo exited during socket inspection'));
          };
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Second silo socket inspection timed out'));
          }, 5000);
          siloProcess.once('message', received);
          siloProcess.once('exit', exited);
          siloProcess.send(command, (error) => {
            if (error) {
              cleanup();
              reject(error);
            }
          });
        },
      );
    }
    const sessions = h.app.get(SessionRevocationRegistry);
    const stateA = () => ({
      sockets: (
        h.app.get(FleetGateway).server as unknown as {
          sockets: Map<string, unknown>;
        }
      ).sockets.size,
      tracked: sessions.connectionCount,
      pending: sessions.pendingAuthorizationCount,
    });
    const empty = { sockets: 0, tracked: 0, pending: 0 };
    expect(stateA()).toEqual(empty);
    expect(await siloSocketState()).toEqual(empty);
    try {
      await connectAccepted('global', h.tokens.admin);
      await connectAccepted('origin', h.tokens.admin, h.cedisId);
      await connectAccepted('other-origin', h.tokens.admin, 'unrelated-origin');
      await connectAccepted('driver', h.tokens.driver);
      await expectRejected('seller', h.tokens.seller);
      await expectRejected('foreign', silo.token);
      const ownB = await connectAccepted(
        'silo-b',
        silo.token,
        undefined,
        silo.url,
      );
      expect(ownB.connected).toBe(true);
      await expectRejected(
        'silo-a-token-on-b',
        h.tokens.admin,
        undefined,
        silo.url,
      );
      await pw
        .poll(stateA, { timeout: 5000 })
        .toEqual({ sockets: 4, tracked: 4, pending: 0 });
      await pw
        .poll(() => siloSocketState(), { timeout: 5000 })
        .toEqual({ sockets: 1, tracked: 1, pending: 0 });
      expect(
        (
          await fetch(h.url + '/api/fleet/live', {
            headers: { Authorization: 'Bearer ' + silo.token },
            signal: AbortSignal.timeout(5000),
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(silo.url + '/api/fleet/live', {
            headers: { Authorization: 'Bearer ' + h.tokens.admin },
            signal: AbortSignal.timeout(5000),
          })
        ).status,
      ).toBe(401);
      expect(
        (
          await fetch(silo.url + '/api/fleet/live', {
            headers: { Authorization: 'Bearer ' + silo.token },
            signal: AbortSignal.timeout(5000),
          })
        ).status,
      ).toBe(200);
      const f = await fixture();
      await status(f, 'IN_PROGRESS');
      await pw
        .poll(
          () =>
            ['global', 'origin', 'driver'].map(
              (label) => observed[label].length > 0,
            ),
          { timeout: 5000 },
        )
        .toEqual([true, true, true]);
      expect(observed.global.length).toBeGreaterThan(0);
      expect(observed.driver.length).toBeGreaterThan(0);
      expect(observed['other-origin']).toHaveLength(0);
      expect(observed.seller).toHaveLength(0);
      expect(observed.foreign).toHaveLength(0);
      expect(observed['silo-b']).toHaveLength(0);
      expect(observed['silo-a-token-on-b']).toHaveLength(0);
      await status(f, 'CANCELLED');
      // Exercise a protected emission on B too: a valid B socket must receive it,
      // while A's token rejected by B and every socket on A must not.
      await siloSocketState('socket-probe');
      await pw.poll(() => observed['silo-b'].length, { timeout: 5000 }).toBe(1);
      expect(observed['silo-b']).toEqual([{ source: 'ci004-silo-b' }]);
      await sleep(200);
      expect(observed['other-origin']).toHaveLength(0);
      for (const label of ['seller', 'foreign', 'silo-a-token-on-b']) {
        expect(handshakes[label]).toEqual({
          connected: 0,
          rejected: 1,
          reconnects: 0,
          events: [],
        });
      }
      for (const label of ['global', 'origin', 'driver']) {
        expect(observed[label]).not.toContainEqual({ source: 'ci004-silo-b' });
      }
      proof('fleet004-scope', {
        counts: Object.fromEntries(
          Object.entries(observed).map(([k, v]) => [k, v.length]),
        ),
        handshakes,
        siloA: stateA(),
        siloB: await siloSocketState(),
      });
    } finally {
      for (const client of clients) client.disconnect();
      try {
        await pw.poll(stateA, { timeout: 5000 }).toEqual(empty);
        await pw
          .poll(() => siloSocketState(), { timeout: 5000 })
          .toEqual(empty);
        proof('fleet004-scope-cleanup', {
          siloA: stateA(),
          siloB: await siloSocketState(),
        });
      } finally {
        for (const client of clients) {
          client.removeAllListeners();
          client.io.removeAllListeners();
        }
      }
    }
  }, 60000);
  it('preserves authoritative states, balances and GPS after a real NestJS restart', async () => {
    const read = async () => ({
      routes: await h.prisma.deliveryRoute.findMany({ orderBy: { id: 'asc' } }),
      positions: await h.prisma.vehiclePosition.findMany({
        orderBy: { id: 'asc' },
      }),
      balances: await h.prisma.inventoryBalance.findMany({
        orderBy: [{ productId: 'asc' }, { locationId: 'asc' }],
      }),
      payments: await h.prisma.payment.findMany({ orderBy: { id: 'asc' } }),
      receivables: await h.prisma.accountReceivable.findMany({
        orderBy: { id: 'asc' },
      }),
    });
    const before = await read();
    await h.restart();
    expect(await read()).toEqual(before);
    expect((await h.get('fleet/live')).status).toBe(200);
    proof('fleet004-restart', {
      routes: before.routes.length,
      positions: before.positions.length,
      payments: before.payments.length,
      allPersistedUnchanged: true,
    });
  }, 60000);
});
