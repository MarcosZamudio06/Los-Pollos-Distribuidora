import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import bcrypt from 'bcryptjs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type {
  Browser,
  BrowserContext,
  Page,
  Route,
} from '../../frontend/e2e/preprod-browser-uat-types';
import { Rem003Harness, data } from './erp-rem003-harness';
import { CedisModule } from '../src/modules/cedis/cedis.module';
import { BranchSupplyCyclesService } from '../src/modules/cedis/branch-supply-cycles.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { FleetGateway } from '../src/modules/fleet/fleet.gateway';
import { SalesGateway } from '../src/modules/sales/sales.gateway';
import { SessionRevocationRegistry } from '../src/common/session/session-revocation.registry';
import { CedisGateway } from '../src/modules/cedis/cedis.gateway';
import { PedidosDeliveryGates } from './pedidos-delivery-gate';
import {
  recoveryViolations,
  type RecoverySnapshot,
  type RecoveryExpected,
} from '../../shared/pedidos-recovery-contract';
import { ScenarioScope, PreconditionBlocked } from './uat-scenario-scope';
import { DEVELOPMENT_ADMIN_PASSWORD } from '../prisma/seed';

const browserRuntime = createRequire(
  resolve(__dirname, '../../frontend/package.json'),
)('@playwright/test');
const unownedSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));
type Screen = 'Fleet' | 'Pedidos' | 'CEDIS';
type Observation = Record<string, unknown>;
function safeEventIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeEventIdentity);
  if (!value || typeof value !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => {
      if (
        [
          'id',
          'saleId',
          'routeId',
          'transferId',
          'supplyId',
          'status',
          'clientEventId',
          'version',
        ].includes(key)
      )
        return [[key, item]];
      if (item && typeof item === 'object')
        return [[key, safeEventIdentity(item)]];
      return [];
    }),
  );
}

type Actor = { id: string; email: string; password: string; roleId: string };
class ScenarioBlocked extends Error {}
const screens: Array<{
  name: Screen;
  path: string;
  rest: string;
  namespace: string;
}> = [
  {
    name: 'Fleet',
    path: '/delivery-routes/live',
    rest: '/api/fleet/live',
    namespace: '/fleet',
  },
  {
    name: 'Pedidos',
    path: '/orders',
    rest: '/api/sales/orders',
    namespace: '/sales',
  },
  {
    name: 'CEDIS',
    path: '/cedis/incoming?status=ALL',
    rest: '/api/cedis/incoming-supplies',
    namespace: '/cedis',
  },
];

describe('ERP-PREPROD-BROWSER-UAT-001 real enterprise pages', () => {
  const h = new Rem003Harness();
  const deliveryGates = new PedidosDeliveryGates();
  const evidence = process.env.UAT_EVIDENCE_DIR!;
  const matrix: Observation[] = [],
    http: Observation[] = [],
    frames: Observation[] = [],
    consoleErrors: Observation[] = [];
  const contexts: BrowserContext[] = [];
  let currentScope: ScenarioScope | undefined;
  let outerScope: ScenarioScope | undefined;
  let poisoned: string | undefined;
  const controlMatrix: Observation[] = [];
  const catalog: Array<{ id: string; domain: string; dependencies: string[] }> =
    [];
  const scopes: ScenarioScope[] = [];
  const sleep = (ms: number) =>
    currentScope ? currentScope.delay(ms) : unownedSleep(ms);
  const ownedSessions = new Map<ScenarioScope, Set<string>>();
  type OwnedSocket = {
    connected: boolean;
    rooms: Set<string>;
    handshake: { auth?: { token?: string } };
  };
  const socketsOf = (
    type: typeof FleetGateway | typeof SalesGateway | typeof CedisGateway,
  ) => h.app.get(type).server.sockets as unknown as Map<string, OwnedSocket>;
  const sessionOf = (socket: OwnedSocket) => {
    try {
      return JSON.parse(
        Buffer.from(
          socket.handshake.auth?.token?.split('.')[1] ?? '',
          'base64url',
        ).toString(),
      ).sessionId as string;
    } catch {
      return undefined;
    }
  };
  const requests = new Map<object, Observation>();
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  const resourceSamples: Observation[] = [];
  let resourceTimer: ReturnType<typeof setInterval>;

  const timeline: Observation[] = [];
  const pageLabels = new Map<Page, string>();
  let activeScenario: string | undefined;
  const scenarioPages = new Map<string, Page[]>();
  let browser: Browser,
    vite: ChildProcess,
    web: string,
    branchId: string,
    otherBranchId: string;
  let productId: string,
    stockId: string,
    routeId: string,
    vehicleCode: string,
    cycleId: string;
  let supplyId: string, transferNumber: string, adminRoleId: string;
  let cashShiftId: string;
  let logisticsDriverId: string,
    logisticsVehicleId: string,
    businessDate: string;
  let foreignSupplyId: string;
  let cedisProviderAvailable = false;
  const deviceId = 'uat-device-' + randomUUID();
  let sequence = 0;
  const saved = (name: string, value: unknown) =>
    writeFileSync(
      resolve(evidence, name + '.json'),
      JSON.stringify(value, null, 2),
    );
  const check = (
    value: unknown,
    expected: unknown,
    message = 'Unexpected value',
  ) => assert.deepEqual(value, expected, message);
  const until = async (
    read: () => Promise<boolean> | boolean,
    label: string,
    timeout = 18000,
  ) => {
    const work = async () => {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        currentScope?.signal.throwIfAborted();
        if (await read()) return;
        await sleep(100);
      }
      throw new Error('Timed out: ' + label);
    };
    try {
      return await (currentScope
        ? currentScope.phase(label, work, timeout)
        : work());
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === `Budget exhausted: ${label} (${timeout}ms)`
      )
        throw new Error('Timed out: ' + label);
      throw error;
    }
  };
  function scenario(
    id: string,
    actor: string,
    actions: string[],
    work: (row: Observation) => Promise<void>,
  ) {
    const domain = id.startsWith('AUTH-')
      ? 'Auth'
      : id.startsWith('SCOPE-')
        ? 'Scope'
        : id.startsWith('UX-')
          ? 'Recovery'
          : id.startsWith('A')
            ? 'Fleet'
            : id.startsWith('B')
              ? 'Pedidos'
              : 'CEDIS';
    catalog.push({
      id,
      domain,
      dependencies: [
        'owned-services-ready',
        'real-fixture',
        'own-login',
        'authorized-socket',
        ...(id.startsWith('AUTH-') ? ['positive-protected-delivery'] : []),
      ],
    });
    const workBudget = id.includes('expired-JWT') ? 94000 : 54000;
    it(
      `[${domain}] ${id}`,
      async () => {
        await executeScenario(id, actor, actions, work);
      },
      workBudget + 15000,
    );
  }
  async function prepareFleet(id: string) {
    if (
      !(
        (id.startsWith('A') && !id.startsWith('AUTH-')) ||
        id.includes('-Fleet-')
      )
    )
      return;
    const f = await h.fixture();
    const driver = await actor('DRIVER');
    const auth = await json('auth/login', 'POST', {
      email: driver.email,
      password: driver.password,
    });
    check(auth.status, 200);
    h.tokens.driver = auth.body.data.accessToken;
    const vehicle = await h.prisma.vehicle.create({
      data: {
        code: h.key(),
        displayName: 'Owned UAT Fleet vehicle',
        homeLocationId: h.cedisId,
      },
    });
    const created = await h.post('delivery-routes', {
      name: id,
      driverId: driver.id,
      vehicleId: vehicle.id,
      scheduledDate: new Date().toISOString(),
      originLocationId: h.cedisId,
      routeStockLocationId: f.stockId,
      orders: [
        { saleId: f.saleId, deliveryAddress: 'Synthetic isolated destination' },
      ],
    });
    check(created.status, 201);
    routeId = data<{ id: string }>(created).id;
    vehicleCode = vehicle.code;
    if (id !== 'A1-Fleet-live') {
      check(
        (
          await h.patch(`delivery-routes/${routeId}/status`, {
            status: 'IN_PROGRESS',
          })
        ).status,
        200,
      );
      await gps(12);
    }
  }
  async function executeScenario(
    id: string,
    actor: string,
    actions: string[],
    work: (row: Observation) => Promise<void>,
  ) {
    const parent = currentScope;
    const owner = new ScenarioScope(id);
    scopes.push(owner);
    currentScope = owner;
    activeScenario = id;
    const row: Observation = {
      id,
      actor,
      actions,
      owner: id,
      branchId,
      otherBranchId,
      preconditions: catalog.find((x) => x.id === id)?.dependencies ?? [
        'owned-services-ready',
      ],
      expected:
        'Real HTTP / PostgreSQL / page agree; no stale or unauthorized update wins',
      startedAt: new Date().toISOString(),
    };
    const startHTTP = http.length,
      startFrames = frames.length,
      startControl = h.events.length;
    let failure: unknown;
    try {
      owner.require(
        'shared runtime usable',
        !poisoned && browser.isConnected(),
        poisoned ?? 'Browser disconnected',
      );
      await owner.phase(
        'scenario-work',
        async () => {
          await owner.phase('real-fixture', () => prepareFleet(id));
          row.fixture = {
            routeId,
            productId,
            supplyId,
            cycleId,
            branchId,
            otherBranchId,
          };
          row.before = await owner.phase('postgres-before', readback, 5000);
          await work(row);
          await owner.phase('inventory-ledger', checkIntegrity, 5000);
        },
        id.includes('expired-JWT') ? 94000 : 54000,
      );
      row.result = 'PASS';
    } catch (error) {
      failure = error;
      row.result =
        error instanceof ScenarioBlocked || error instanceof PreconditionBlocked
          ? 'BLOCKED'
          : 'FAIL';
      row.cause =
        error instanceof PreconditionBlocked
          ? error.code
          : 'SCENARIO_OPERATION_FAILED';
      row.error =
        error instanceof Error ? error.message.slice(0, 1600) : String(error);
      row.serverRooms = [FleetGateway, SalesGateway, CedisGateway].map(
        (type) => {
          try {
            return {
              namespace: type.name,
              sockets: [...socketsOf(type).values()].map(
                (x: { connected: boolean; rooms: Set<string> }) => ({
                  connected: x.connected,
                  rooms: [...x.rooms],
                }),
              ),
            };
          } catch {
            return { namespace: type.name, unavailable: true };
          }
        },
      );
      row.failureState = {
        browserConnected: browser.isConnected(),
        pages: (scenarioPages.get(id) ?? []).map((p) => ({
          label: pageLabels.get(p),
          closed: p.isClosed(),
          path: new URL(p.url()).pathname,
        })),
        requests: [...requests.values()].filter((x) => x.state === 'pending'),
      };
      const clientState: unknown[] = [];
      for (const page of scenarioPages.get(id) ?? []) {
        if (!page.isClosed()) {
          try {
            clientState.push(
              await owner.phase(
                'failure-client-state',
                () =>
                  page.evaluate(() => {
                    const g = globalThis as unknown as {
                      __uatRealtime?: unknown[];
                      __uatQuerySnapshot?: () => unknown;
                    };
                    return {
                      lifecycle: g.__uatRealtime ?? [],
                      cache: g.__uatQuerySnapshot?.() ?? {
                        available: false,
                        reason: 'Uninstrumented production build',
                      },
                    };
                  }),
                1000,
              ),
            );
          } catch {
            clientState.push({ unavailable: true });
          }
        }
        row.clientState = clientState;
        if (!page.isClosed())
          await page
            .screenshot({
              path: resolve(evidence, `failure-${pageLabels.get(page)}.png`),
              timeout: 1000,
            })
            .catch(() => {});
      }
    } finally {
      try {
        row.after = await owner.phase('postgres-after', readback, 5000);
      } catch {
        row.after = { unavailable: true };
      }
      try {
        await owner.finish();
        const ids = ownedSessions.get(owner) ?? new Set<string>();
        const remaining = () =>
          [FleetGateway, SalesGateway, CedisGateway]
            .flatMap((type) => [...socketsOf(type).values()])
            .filter((socket) => ids.has(sessionOf(socket) ?? '')).length;
        const end = Date.now() + 5000;
        while (remaining() && Date.now() < end) await unownedSleep(20);
        check(
          remaining(),
          0,
          'Scenario must release its own namespace subscriptions',
        );
        row.ownedSocketsRemaining = remaining();
      } catch (error) {
        poisoned = `Unsettled owner ${id}`;
        row.cleanupError = String(error);
        row.result = 'FAIL';
        failure ??= error;
      }
      row.cleanup = { resources: owner.resources, pending: owner.pendingCount };
      row.phases = owner.phases;
      row.http = [...http.slice(startHTTP), ...h.events.slice(startControl)];
      row.socket = frames.slice(startFrames);
      row.targetCaptures = (scenarioPages.get(id) ?? []).map((p) => ({
        page: pageLabels.get(p),
        capture: 'capture-' + pageLabels.get(p) + '.json',
      }));
      row.finishedAt = new Date().toISOString();
      (id.startsWith('CONTROL-') ? controlMatrix : matrix).push(row);
      saved('scenario-matrix', matrix);
      saved('control-matrix', controlMatrix);
      saved(
        'scope-lifecycle',
        scopes.map((x) => ({
          owner: x.owner,
          resources: x.resources,
          pending: x.pendingCount,
          phases: x.phases,
        })),
      );
      currentScope = parent;
      activeScenario = undefined;
    }
    if (failure)
      throw failure instanceof Error
        ? failure
        : new Error('Non-Error scenario failure');
  }
  async function json(
    path: string,
    method = 'GET',
    body?: object,
    token = h.tokens.admin,
  ) {
    const response = await fetch(h.url + '/api/' + path, {
      method,
      signal: AbortSignal.any([
        ...(currentScope ? [currentScope.signal] : []),
        AbortSignal.timeout(18000),
      ]),
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
        'idempotency-key': h.key(),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    http.push({
      source: 'real-control-HTTP',
      path: '/api/' + path,
      method,
      status: response.status,
      ...(response.status >= 400
        ? { code: payload.code, message: payload.message }
        : {}),
    });
    return { status: response.status, body: payload };
  }
  async function actor(role = 'ADMIN'): Promise<Actor> {
    const password = `Uat-${randomUUID()}`;
    const roleRow = await h.prisma.role.findUniqueOrThrow({
      where: { name: role },
    });
    const u = await h.prisma.user.create({
      data: {
        name: 'UAT synthetic ' + role,
        email: `${randomUUID()}@fixture.invalid`,
        controlNumber: randomUUID(),
        phone: randomUUID(),
        passwordHash: await bcrypt.hash(password, 12),
        roleId: roleRow.id,
        operationalLocationId: role === 'WAREHOUSE' ? h.cedisId : branchId,
        cedisLocationId: h.cedisId,
      },
    });
    return { id: u.id, email: u.email, password, roleId: u.roleId };
  }
  function observe(page: Page, label: string) {
    pageLabels.set(page, label);
    if (activeScenario)
      scenarioPages.set(activeScenario, [
        ...(scenarioPages.get(activeScenario) ?? []),
        page,
      ]);
    const requestTimes = new WeakMap<object, number>();
    page.on('request', (req) => {
      requestTimes.set(req, Date.now());
      requests.set(req, {
        label,
        path: new URL(req.url()).pathname,
        state: 'pending',
        at: Date.now(),
      });
    });
    page.on('requestfinished', (req) => {
      const x = requests.get(req);
      if (x) {
        x.state = 'finished';
        x.finishedAt = Date.now();
      }
    });
    page.on('requestfailed', (req) => {
      const x = requests.get(req);
      if (x) {
        x.state = 'failed';
        x.finishedAt = Date.now();
      }
    });
    page.on('close', () =>
      timeline.push({ label, phase: 'page-closed', at: Date.now() }),
    );
    page.on('requestfailed', (req) =>
      timeline.push({
        label,
        phase: 'http-failed',
        path: new URL(req.url()).pathname,
        at: Date.now(),
        reason: req.failure()?.errorText,
      }),
    );
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame())
        timeline.push({
          label,
          phase: 'document-navigation',
          path: new URL(frame.url()).pathname,
          at: Date.now(),
        });
    });

    page.on('pageerror', (error) =>
      consoleErrors.push({
        label,
        kind: 'uncaught',
        message: error.message.slice(0, 700),
      }),
    );
    page.on('console', (message) => {
      if (message.type() === 'error')
        consoleErrors.push({
          label,
          kind: 'console',
          message: message
            .text()
            .replace(/https?:\/\/[^ ]+/g, '[URL]')
            .slice(0, 700),
        });
    });
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/maps/'))
        http.push({
          source: label,
          kind: 'public-map-asset',
          path: url.pathname,
          status: response.status(),
          at: Date.now(),
          durationMs:
            Date.now() - (requestTimes.get(response.request()) ?? Date.now()),
        });
      if (url.pathname.startsWith('/api/'))
        http.push({
          source: label,
          method: response.request().method(),
          path: url.pathname,
          query: Object.fromEntries(
            [...url.searchParams].filter(([k]) =>
              [
                'locationId',
                'branchLocationId',
                'originLocationId',
                'dateFrom',
                'dateTo',
                'status',
                'businessDate',
                'limit',
              ].includes(k),
            ),
          ),
          status: response.status(),
          at: Date.now(),
          durationMs:
            Date.now() - (requestTimes.get(response.request()) ?? Date.now()),
        });
    });
    page.on('websocket', (ws) => {
      if (!ws.url().includes('/api/socket.io')) return;
      frames.push({ label, kind: 'transport-open', at: Date.now() });
      ws.on('close', () =>
        frames.push({ label, kind: 'transport-close', at: Date.now() }),
      );
      ws.on('framereceived', ({ payload }) => {
        const raw = String(payload),
          start = raw.indexOf('["');
        if (raw.startsWith('44/')) {
          const comma = raw.indexOf(',');
          try {
            const body = JSON.parse(raw.slice(comma + 1));
            frames.push({
              label,
              kind: 'namespace-rejected',
              namespace: raw.slice(2, comma),
              message: String(body.message),
              at: Date.now(),
            });
          } catch {
            /* No raw frame persistence. */
          }
        }
        if (start < 0) return;
        try {
          const [event, value] = JSON.parse(raw.slice(start));
          if (/^(fleet\.|sale\.|cedis\.)/.test(event))
            frames.push({
              label,
              event,
              value: safeEventIdentity(value),
              at: Date.now(),
            });
        } catch {
          /* Never save authentication/control frames. */
        }
      });
    });
  }
  async function login(
    screen: (typeof screens)[number],
    who?: Actor,
    delayLoginMs = 0,
  ) {
    if (screen.name === 'CEDIS')
      currentScope?.require(
        'canonical CedisGateway',
        cedisProviderAvailable,
        'AppModule composition failed',
      );
    const owner = currentScope;
    if (owner && !ownedSessions.has(owner)) ownedSessions.set(owner, new Set());
    const context = await browser.newContext({
      timezoneId: 'America/Mexico_City',
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    contexts.push(context);
    const rawClose = context.close.bind(context);

    currentScope?.defer('BrowserContext', async () => {
      await rawClose();
    });
    await context.addInitScript(() => {
      const g = globalThis as unknown as { __uatRealtime: unknown[] };
      g.__uatRealtime = [];
    });
    const page = await context.newPage();
    page.setDefaultTimeout(18000);
    const label = `${screen.name}-${++sequence}`;
    observe(page, label);
    const closeContext = context.close.bind(context);
    context.close = async (...args) => {
      if (!page.isClosed()) {
        try {
          const records = await page.evaluate(
            () =>
              (globalThis as unknown as { __uatRealtime: unknown[] })
                .__uatRealtime ?? [],
          );
          timeline.push({
            label,
            phase: 'client-diagnostics',
            at: Date.now(),
            records,
            cedis: await page.evaluate(() => ({
              records:
                (globalThis as unknown as { __cedisTrace?: unknown[] })
                  .__cedisTrace ?? [],
              status: document.querySelector(
                '[aria-label="Estado de conexión CEDIS"]',
              )?.textContent,
            })),
          });
          for (const [name, type] of [
            ['fleet', FleetGateway],
            ['sales', SalesGateway],
            ['cedis', CedisGateway],
          ] as const) {
            try {
              const server = h.app.get(type).server as unknown as {
                sockets: Map<
                  string,
                  { id: string; connected: boolean; rooms: Set<string> }
                >;
              };
              timeline.push({
                label,
                phase: 'server-at-teardown',
                name,
                at: Date.now(),
                sockets: [...server.sockets.values()].map((s) => ({
                  id: s.id,
                  connected: s.connected,
                  rooms: [...s.rooms],
                })),
              });
            } catch {
              /* Missing provider is captured by composition proof. */
            }
          }

          const row = {
            page: label,
            route: new URL(page.url()).pathname,
            expectedRoute: screens
              .find((s) => label.startsWith(s.name))
              ?.path.split('?')[0],
          };
          if (activeScenario?.startsWith('A3-'))
            check(
              row.route,
              '/delivery-routes/live',
              'Fleet failure capture must be from the real Fleet page',
            );
          await snap(page, 'terminal-' + label, row);
          saved('capture-' + label, {
            ...row,
            scenario: activeScenario,
            records,
          });
          if (activeScenario) {
            const item = matrix.find((x) => x.id === activeScenario);
            if (item) item.targetCapture = row;
          }
        } catch {
          /* Context teardown must not be prevented by diagnostic capture. */
        }
      }
      await closeContext(...args);
    };
    const trace = (phase: string, details: Observation = {}) => {
      timeline.push({
        label,
        phase,
        at: Date.now(),
        pageClosed: page.isClosed(),
        browserConnected: browser.isConnected(),
        ...details,
      });
      saved('timeline-live', timeline);
    };
    page.on('requestfinished', (r) => {
      if (new URL(r.url()).pathname === '/api/auth/login')
        trace('login-request-finished');
    });
    page.on('requestfailed', (r) => {
      if (new URL(r.url()).pathname === '/api/auth/login')
        trace('login-request-failed');
    });
    if (delayLoginMs)
      await page.route('**/api/auth/login', async (route) => {
        const response = await route.fetch();
        trace('controlled-login-upstream-headers', {
          status: response.status(),
        });
        await response.body();
        trace('controlled-login-upstream-body-complete');
        await sleep(delayLoginMs);
        await route.fulfill({ response });
        trace('controlled-login-released');
      });
    let token = '';
    let effectiveRole = 'ADMIN';
    page.on('response', async (r) => {
      if (
        ['/api/auth/login', '/api/auth/refresh'].includes(
          new URL(r.url()).pathname,
        ) &&
        r.status() === 200
      ) {
        trace('auth-response-headers', {
          status: r.status(),
          contentType: r.headers()['content-type'],
          path: new URL(r.url()).pathname,
        });
        try {
          const failure = await r.finished();
          trace('auth-response-finished', { failed: Boolean(failure) });
          const auth = (await r.json()).data;
          trace('auth-response-parsed', {
            tokenPresent: Boolean(auth?.accessToken),
            userPresent: Boolean(auth?.user),
          });
          token = auth.accessToken;
          if (owner) {
            const sessionId = JSON.parse(
              Buffer.from(token.split('.')[1], 'base64url').toString(),
            ).sessionId as string;
            ownedSessions.get(owner)!.add(sessionId);
          }
          effectiveRole = auth.user.role;
        } catch {
          trace('auth-response-consumer-failed');
        }
      }
    });
    try {
      trace('navigation-start');
      await page.goto(web + '/login');
      trace('navigation-complete');
      await page
        .getByLabel('Correo', { exact: true })
        .fill(who?.email ?? 'dev.admin@pollos.local');
      await page
        .getByLabel(/^Contraseña/)
        .fill(who?.password ?? DEVELOPMENT_ADMIN_PASSWORD);
      trace('login-submit-start');
      await page.getByRole('button', { name: 'Entrar al sistema' }).click();
      trace('login-submit-complete');
      await until(() => !!token, 'real UI login response');
      await until(() => !page.url().includes('/login'), 'login redirects');
      trace('login-redirect-confirmed');
      const sessionId = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ).sessionId as string;
      const durableSession = await h.prisma.authSession.findUniqueOrThrow({
        where: { id: sessionId },
        select: {
          id: true,
          userId: true,
          revokedAt: true,
          absoluteExpiresAt: true,
          lastUsedAt: true,
        },
      });
      trace('session-before-page', {
        session: durableSession,
        role: effectiveRole,
      });
      await open(page, screen, effectiveRole);
      trace('screen-connected');
      const me = await json('auth/me', 'GET', undefined, token);
      check(me.status, 200);
      timeline.push({
        phase: 'session-precondition',
        label,
        scenario: activeScenario,
        role: me.body.data.user.role,
        permissions: me.body.data.user.permissions,
        branchId: me.body.data.user.operationalLocationId,
        tokenPresent: true,
        at: Date.now(),
      });
      const decoded = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ) as { sessionId: string; exp: number };
      return {
        page,
        context,
        label,
        token,
        sessionId: decoded.sessionId,
        exp: decoded.exp,
      };
    } catch (error) {
      trace('login-failed-cleanup-start');
      if (!page.isClosed()) {
        saved(
          'login-failure-before-close-' + label,
          await page
            .evaluate(() => ({
              records:
                (globalThis as unknown as { __cedisTrace?: unknown[] })
                  .__cedisTrace ?? [],
              status: document.querySelector(
                '[aria-label="Estado de conexión CEDIS"]',
              )?.textContent,
              path: location.pathname,
              pageOpen: true,
            }))
            .catch(() => ({ captureUnavailable: true })),
        );
      }
      await context.close().catch(() => {});
      trace('login-failed-cleanup-complete');
      throw error;
    }
  }
  async function open(
    page: Page,
    screen: (typeof screens)[number],
    role = 'ADMIN',
  ) {
    await page.goto(web + screen.path);
    if (screen.name === 'Pedidos') {
      await page
        .getByRole('heading', { name: 'Pedidos de sucursal' })
        .waitFor();
      const select = page.getByRole('combobox');
      const enabled = await select.isEnabled();
      timeline.push({
        phase: 'orders-location-precondition',
        enabled,
        value: await select.inputValue(),
        at: Date.now(),
      });
      if (role === 'ADMIN') {
        await browserRuntime.expect(select).toBeEnabled();
        await select.selectOption(branchId);
      }
      check(
        await select.inputValue(),
        branchId,
        'Branch precondition must be established before accepting a connection',
      );
      await page.getByText('Conectado', { exact: true }).waitFor();
    } else if (screen.name === 'Fleet') {
      await page.getByTestId('fleet-units-list').waitFor();
      await page.getByText('Tiempo real conectado', { exact: true }).waitFor();
    } else
      await page
        .getByRole('heading', {
          name: /Recepciones por confirmar|Reporta lo que llegó/,
        })
        .waitFor();
    if (screen.name === 'CEDIS')
      await page
        .getByRole('status', { name: 'Estado de conexión CEDIS' })
        .getByText('Conectado', { exact: true })
        .waitFor();
  }
  async function snap(page: Page, name: string, row: Observation) {
    await page.screenshot({
      path: resolve(evidence, name + '.png'),
      fullPage: true,
    });
    row.visible = (await page.locator('body').innerText()).slice(-12000);
    row.screenshot = name + '.png';
  }
  async function readback() {
    return {
      route: await h.prisma.deliveryRoute.findUnique({
        where: { id: routeId },
        select: { id: true, status: true, vehicleId: true, driverId: true },
      }),
      positions: await h.prisma.vehiclePosition.findMany({
        where: { routeId },
        select: { id: true, latitude: true, longitude: true, recordedAt: true },
        orderBy: { recordedAt: 'asc' },
      }),
      sales: await h.prisma.sale.findMany({
        where: { locationId: branchId, items: { some: { productId } } },
        select: {
          id: true,
          saleNumber: true,
          status: true,
          version: true,
          total: true,
          collectionStatus: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      balances: await h.prisma.inventoryBalance.findMany({
        where: { productId },
        select: {
          locationId: true,
          quantityPieces: true,
          reservedQuantityPieces: true,
        },
      }),
      movements: await h.prisma.inventoryMovement.findMany({
        where: { productId },
        select: {
          id: true,
          type: true,
          locationId: true,
          quantityPieces: true,
          transferId: true,
          saleId: true,
        },
      }),
      cycle: cycleId
        ? await h.prisma.branchSupplyCycle.findUnique({
            where: { id: cycleId },
            select: { id: true, status: true, version: true },
          })
        : null,
      supply: supplyId
        ? await h.prisma.inventoryTransfer.findUnique({
            where: { id: supplyId },
            select: { id: true, status: true },
          })
        : null,
    };
  }
  async function newSale() {
    const customer = await h.prisma.customer.create({
      data: {
        name: 'UAT synthetic credit customer ' + sequence,
        customerType: 'RETAIL',
        creditLimit: 100000,
        creditDays: 30,
        creditStatus: 'ACTIVE',
      },
    });
    const r = await h.post('sales', {
      locationId: branchId,
      cashShiftId,
      deviceId,
      saleChannel: 'COUNTER',
      documentType: 'INTERNAL_RECEIPT',
      paymentType: 'CREDIT_SALE',
      customerId: customer.id,
      payments: [],
      items: [{ productId, unit: 'PIECE', quantityPieces: 1, quantityKg: 0 }],
    });
    check(r.status, 201, 'Real sale service must confirm the credit sale');
    const sale = data<{ sale: { id: string; saleNumber: string } }>(r).sale;
    check(
      await h.prisma.payment.count({ where: { saleId: sale.id } }),
      0,
      'No simulated financial payment',
    );
    return sale;
  }
  async function gps(speedKph: number) {
    const clientEventId = randomUUID();
    const r = await h.post(
      'fleet/positions',
      {
        clientEventId,
        latitude: 19.1748,
        longitude: -96.1334,
        accuracyMeters: 10,
        speedKph,
        recordedAt: new Date().toISOString(),
      },
      'driver',
    );
    check(r.status, 201);
    const row = await h.prisma.vehiclePosition.findUniqueOrThrow({
      where: { clientEventId },
    });
    const point = await h.prisma.$queryRaw<
      Array<{ srid: number; x: number; y: number }>
    >`SELECT ST_SRID("positionPoint") AS srid, ST_X("positionPoint") AS x, ST_Y("positionPoint") AS y FROM "VehiclePosition" WHERE id=${row.id}`;
    check(point[0], { srid: 4326, x: -96.1334, y: 19.1748 });
    return row.id;
  }
  async function hold(page: Page, path: string) {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let held = false,
      captured = false;
    let snapshot: unknown;
    const owner = currentScope;
    const pattern = `**${path}*`;
    const handler = (route: Route) => {
      const task = (async () => {
        if (held) {
          await route.continue();
          return;
        }
        held = true;
        const response = await route.fetch({ timeout: 18000 });
        snapshot = { http: response.status(), bodyRetained: false };
        captured = true;
        await gate;
        try {
          if (owner?.signal.aborted) await route.abort();
          else await route.fulfill({ response });
        } catch {
          /* Context may have already cancelled its request. */
        }
      })();
      return owner ? owner.track(task) : task;
    };
    await page.route(pattern, handler);
    owner?.defer('retained-route:' + path, async () => {
      release();
      await page.unroute(pattern, handler).catch(() => {});
    });
    return {
      get captured() {
        return until(() => captured, 'real old response captured');
      },
      get snapshot() {
        return snapshot;
      },
      release,
      handler,
    };
  }
  async function recoverySnapshot(page: Page): Promise<RecoverySnapshot> {
    const result = await page.evaluate(() =>
      (
        globalThis as unknown as {
          __pedidosRecovery: { snapshot(): RecoverySnapshot };
        }
      ).__pedidosRecovery.snapshot(),
    );
    return {
      ...result,
      pageClosed: page.isClosed(),
      browserConnected: browser.isConnected(),
    };
  }
  async function markRecovery(page: Page, phase: string) {
    return page.evaluate(
      (value) =>
        (
          globalThis as unknown as {
            __pedidosRecovery: { mark(phase: string): number };
          }
        ).__pedidosRecovery.mark(value),
      phase,
    );
  }
  async function ordersRecovery(row: Observation, mode: string, mutant = '') {
    const p = await login(screens[1]);
    const owner = currentScope!;
    let releaseOld!: () => void, capturedOld!: () => void;
    const oldWait = new Promise<void>((r) => (releaseOld = r));
    const oldCaptured = new Promise<void>((r) => (capturedOld = r));
    const old = {
      release: releaseOld,
      captured: oldCaptured,
      trace: [] as Observation[],
    };
    const preconnect = mode.startsWith('E-')
      ? deliveryGates.create(mode === 'E-body' ? 'body' : 'headers')
      : undefined;
    let auth: Awaited<ReturnType<typeof hold>> | undefined;
    let responseNumber = 0,
      preconnectArmed = false;
    const pattern = '**/api/sales/orders*';
    const routeHandler = (route: Route) => {
      const request = route.request();
      if (new URL(request.url()).searchParams.get('locationId') !== branchId)
        return route.continue();
      responseNumber++;
      const target = mode === 'C' || mode === 'B2' || preconnect ? 1 : 2;
      if (responseNumber === target)
        return owner.track(
          (async () => {
            const response = await route.fetch({ timeout: 18000 });
            const bytes = await response.body();
            old.trace.push({
              phase: 'real-old-body-captured',
              at: Date.now(),
              status: response.status(),
              bytes: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            });
            capturedOld();
            await oldWait;
            old.trace.push({ phase: 'old-delivery-released', at: Date.now() });
            await route.fulfill({ response }).catch(() => {});
          })(),
        );
      const gate = preconnectArmed ? preconnect : undefined;
      if (gate) preconnectArmed = false;
      return route.continue(
        gate
          ? { headers: { ...request.headers(), 'x-uat-orders-gate': gate.id } }
          : undefined,
      );
    };
    let releaseTransport = () => {};
    const capture = async (stage: string) => {
      const state = await recoverySnapshot(p.page);
      saved('pedidos-' + mode + '-' + stage, {
        mode,
        mutant,
        state,
        oldDelivery: old.trace,
        preconnectDelivery: preconnect?.trace,
      });
      return state;
    };
    owner.defer('orders-response-gates', async () => {
      old.release();
      preconnect?.release();
      auth?.release();
      releaseTransport();
      await p.page.unroute(pattern, routeHandler).catch(() => {});
    });
    try {
      await until(
        async () =>
          (await recoverySnapshot(p.page)).cache.some(
            (q) =>
              q.observers > 0 && q.fetchStatus === 'idle' && q.ids.length > 0,
          ),
        'initial real orders settled',
      );
      if (!preconnect) {
        await p.page.getByRole('combobox').selectOption(otherBranchId);
        await until(
          async () =>
            (await recoverySnapshot(p.page)).cache.some(
              (q) =>
                q.observers > 0 &&
                q.filters.locationId === otherBranchId &&
                q.fetchStatus === 'idle',
            ),
          'other branch settled',
        );
        await sleep(100);
      }
      await p.page.route(pattern, routeHandler);
      if (preconnect) {
        // E controls the existing active query, not an unrelated branch-switch precondition.
        await p.page.evaluate(() =>
          (
            globalThis as unknown as {
              __pedidosRecovery: { probeRead(): void };
            }
          ).__pedidosRecovery.probeRead(),
        );
      } else await p.page.getByRole('combobox').selectOption(branchId);
      await owner.phase('old real body captured', () => old.captured);
      const cut = await markRecovery(p.page, 'disconnect-start');
      if (preconnect) {
        const server = h.app.getHttpServer() as import('node:http').Server;
        const listeners = server.listeners('upgrade');
        let release!: () => void;
        const gate = new Promise<void>((r) => (release = r));
        releaseTransport = release;
        server.removeAllListeners('upgrade');
        const intercept = (
          req: import('node:http').IncomingMessage,
          socket: import('node:stream').Duplex,
          head: Buffer,
        ) => {
          void owner.track(
            gate.then(() => {
              if (!socket.destroyed)
                for (const listener of listeners)
                  (
                    listener as (
                      req: import('node:http').IncomingMessage,
                      socket: import('node:stream').Duplex,
                      head: Buffer,
                    ) => void
                  ).call(server, req, socket, head);
            }),
          );
        };
        server.on('upgrade', intercept);
        owner.defer('upgrade-delivery-gate', () => {
          release();
          server.off('upgrade', intercept);
          for (const listener of listeners)
            server.on('upgrade', listener as (...args: unknown[]) => void);
        });
      }
      if (mode === 'D') {
        auth = await hold(p.page, '/api/auth/me');
        const sockets = h.app.get(SalesGateway).server
          .sockets as unknown as Map<
          string,
          { disconnect(close: boolean): void }
        >;
        check(sockets.size, 1);
        for (const socket of sockets.values()) socket.disconnect(false);
        await auth.captured;
      } else {
        await p.context.setOffline(true);
        await until(
          async () =>
            (await recoverySnapshot(p.page)).events.some(
              (e) => e.seq > cut && e.phase === 'onDisconnected',
            ),
          'real Pedidos disconnect',
        );
      }
      const sale = await newSale();
      const persisted = await h.prisma.sale.findUniqueOrThrow({
        where: { id: sale.id },
      });
      check(persisted.status, 'CONFIRMED');
      check(persisted.locationId, branchId);
      check(
        received(p.label, sale.id),
        false,
        'Business event must actually be missed',
      );
      const committedSeq = await markRecovery(
        p.page,
        'postgres-sale-confirmed',
      );
      const expected: RecoveryExpected = {
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        locationId: branchId,
        committedSeq,
      };
      row.recoveryExpected = expected;
      if (preconnect) preconnectArmed = true;
      if (mode === 'D') auth!.release();
      else await p.context.setOffline(false);
      if (preconnect) {
        await p.page.evaluate(() =>
          (
            globalThis as unknown as {
              __pedidosRecovery: { probeRead(): void };
            }
          ).__pedidosRecovery.probeRead(),
        );
        await owner.phase(
          'preconnection real body captured',
          () => preconnect.captured,
        );
        let state = await capture('preconnection');
        const request = state.events.findLast((e) => e.phase === 'http-start');
        assert.ok(request && request.seq > committedSeq);
        check(
          state.events.some(
            (e) => e.phase === 'onConnected' && e.seq > committedSeq,
          ),
          false,
          'Preconnection read must precede actual callback',
        );
        if (mode === 'E-body') {
          await until(
            async () =>
              (await recoverySnapshot(p.page)).events.some(
                (e) => e.phase === 'http-headers' && e.id === request.id,
              ),
            'headers received with JSON pending',
          );
          state = await capture('partial-body');
          check(
            state.events.some(
              (e) => e.phase === 'http-json-complete' && e.id === request.id,
            ),
            false,
            'Headers must not count as completed JSON',
          );
        } else
          check(
            state.events.some(
              (e) => e.phase === 'http-headers' && e.id === request.id,
            ),
            false,
            'Headers must remain retained',
          );
        row.preConnectionRequest = request;
        check(
          state.events.some(
            (e) => e.phase === 'transport-open' && e.seq > committedSeq,
          ),
          false,
          'GET must precede transport reopen, not just namespace callback',
        );
        releaseTransport();
      }
      if (mutant === 'no-recovery') {
        await until(
          async () =>
            (await recoverySnapshot(p.page)).events.some(
              (e) => e.phase === 'onConnected' && e.seq > committedSeq,
            ),
          'negative reconnect callback',
        );
      } else if (mutant === 'dom-snapshot') {
        await until(
          async () =>
            (await recoverySnapshot(p.page)).cache.some(
              (q) =>
                q.observers > 0 &&
                q.ids.includes(sale.id) &&
                q.fetchStatus === 'idle',
            ),
          'negative cache updates without DOM',
        );
      } else {
        await until(
          async () =>
            recoveryViolations(await recoverySnapshot(p.page), expected)
              .length === 0,
          'body cache DOM recovery contract',
        );
        row.beforeLateRelease = await capture('verified-before-release');
      }
      if (mutant === 'stale-priority')
        await p.page.evaluate((id) => {
          Object.assign(globalThis, { __uatStalePriority: id });
        }, sale.id);
      const lateReleaseSeq = await markRecovery(p.page, 'release-old-reply');
      expected.lateReleaseSeq = lateReleaseSeq;
      preconnect?.release();
      old.release();
      await until(
        async () =>
          !recoveryViolations(
            await recoverySnapshot(p.page),
            expected,
          ).includes('OLD_REPLY_NOT_DELIVERED_LATE'),
        'retained old JSON actually delivered late',
      );
      await sleep(500);
      const terminal = await capture('before-finally');
      if (preconnect) {
        const request = row.preConnectionRequest as { id: string; seq: number };
        const transport = terminal.events.find(
          (e) => e.phase === 'transport-open' && e.seq > committedSeq,
        );
        const connected = terminal.events.find(
          (e) => e.phase === 'onConnected' && e.seq > committedSeq,
        );
        assert.ok(
          transport &&
            connected &&
            request.seq < transport.seq &&
            transport.seq < connected.seq,
          'E must prove GET start before actual transport and callback',
        );
        const header = terminal.events.find(
          (e) => e.phase === 'http-headers' && e.id === request.id,
        );
        const json = terminal.events.find(
          (e) => e.phase === 'http-json-complete' && e.id === request.id,
        );
        assert.ok(
          header && json && json.seq > lateReleaseSeq,
          'E preconnection JSON must finish only after controlled late release',
        );
        assert.ok(
          mode === 'E-body'
            ? header.seq < transport.seq
            : header.seq > connected.seq,
          'E must discriminate early headers/late body from late headers',
        );
      }

      const errors = recoveryViolations(terminal, {
        ...expected,
        previouslyVerified:
          mutant !== 'no-recovery' && mutant !== 'dom-snapshot',
      });
      if (mutant) {
        const required =
          mutant === 'no-recovery'
            ? ['NO_POST_CONNECT_GET', 'DOM_MISSING_SALE', 'CACHE_MISSING_SALE']
            : mutant === 'stale-priority'
              ? ['STALE_REVERSION']
              : ['DOM_CACHE_DIVERGENCE'];
        for (const code of required)
          assert.ok(
            errors.includes(code),
            'Detector did not reject ' + mutant + ': ' + code,
          );
        row.detector = {
          mode: mutant,
          expectedFailures: required,
          actualFailures: errors,
          result: 'PASS',
        };
      } else {
        check(
          errors,
          [],
          'Permanent recovery assurance must reject any missing boundary',
        );
        check(
          await p.page.getByText(sale.saleNumber, { exact: true }).count(),
          1,
        );
        check(
          await p.page
            .getByRole('region', { name: 'Ventas recientes del día' })
            .locator('article')
            .count(),
          2,
        );
        row.recoveryContract = 'VERIFIED';
      }
      row.recovery = terminal;
    } catch (error) {
      await capture('failure-before-finally').catch(() => {});
      throw error;
    } finally {
      old.release();
      preconnect?.release();
      auth?.release();
      releaseTransport();
      await p.context.close();
    }
  }
  async function setAll(page: Page, checked: boolean) {
    const box = page.getByLabel('Mostrar todas las recepciones');
    if ((await box.isChecked()) !== checked) await box.click();
    await until(
      async () => (await box.isChecked()) === checked,
      'URL-backed receipt filter updates',
    );
  }
  const received = (label: string, id: string) =>
    frames.some(
      (f) => f.label === label && JSON.stringify(f.value ?? '').includes(id),
    );
  async function protectedMutation(screen: Screen) {
    if (screen === 'Fleet') return gps(40 + ++sequence);
    if (screen === 'Pedidos') return (await newSale()).id;
    const cycle = await h.prisma.branchSupplyCycle.findUniqueOrThrow({
      where: { id: cycleId },
    });
    const r = await h.post(`cedis/branch-supply-cycles/${cycleId}/supplies`, {
      expectedVersion: cycle.version,
      assignedDriverId: logisticsDriverId,
      vehicleId: logisticsVehicleId,
      items: [{ productId, unit: 'PIECE', quantityPieces: 1 }],
    });
    check(r.status, 201);
    return data<{ transfer: { id: string } }>(r).transfer.id;
  }
  async function checkIntegrity() {
    const balances = await h.prisma.inventoryBalance.findMany({
      where: { productId: { in: h.createdProductIds } },
    });
    const movements = await h.prisma.inventoryMovement.findMany({
      where: { productId: { in: h.createdProductIds } },
    });
    const ledger = balances.map((b) => ({
      productId: b.productId,
      locationId: b.locationId,
      quantityPieces: b.quantityPieces,
      deltaPieces: movements
        .filter(
          (m) => m.locationId === b.locationId && m.productId === b.productId,
        )
        .reduce(
          (n, m) =>
            n + Number(m.newQuantityPieces) - Number(m.previousQuantityPieces),
          0,
        ),
      reservedPieces: b.reservedQuantityPieces,
    }));
    for (const line of ledger) {
      check(
        line.quantityPieces,
        line.deltaPieces,
        'Inventory must reconcile to real service-generated ledger',
      );
      assert.ok(line.quantityPieces >= 0 && line.reservedPieces >= 0);
    }
    check(
      await h.prisma.payment.count(),
      0,
      'This UAT must never simulate a payment confirmation',
    );
    saved('integrity', {
      ledger,
      paymentCount: 0,
      financialConfirmationSimulated: false,
      result: 'PASS',
    });
  }
  beforeEach(() => {
    outerScope = new ScenarioScope(
      expect.getState().currentTestName ?? 'control',
    );
    scopes.push(outerScope);
    currentScope = outerScope;
  });
  afterEach(async () => {
    try {
      await outerScope?.finish();
    } catch (error) {
      poisoned = 'Outer owner cleanup did not settle';
      throw error;
    } finally {
      currentScope = undefined;
    }
  }, 10000);
  beforeAll(async () => {
    if (!process.env.UAT_BROWSER_WS || !evidence || !process.env.UAT_FRONTEND)
      throw new Error('Explicit owned UAT environment required');
    mkdirSync(evidence, { recursive: true });
    // The deployment edge strips /maps before forwarding to TileServer. Reproduce
    // that public-assets route in this owned harness, without changing ERP code.
    h.configureApp = (app) => {
      app.use(deliveryGates.middleware);
      app.use(
        '/maps',
        (
          req: { originalUrl: string; headers: { host?: string } },
          res: import('node:http').ServerResponse,
        ) => {
          const upstream = new URL(
            req.originalUrl.replace(/^\/maps/, ''),
            process.env.UAT_TILES_URL,
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
    saved('scenario-catalog', catalog);
    h.commandHandler = async (_command, send) =>
      currentScope
        ? currentScope.phase('HTTP-mutation:' + _command.path, send)
        : send();
    h.requestTimeoutMs = 18000;
    const bootstrapAt = Date.now();
    await h.start();
    deliveryGates.origin = h.url;
    if (process.env.UAT_CEDIS_DIAGNOSTICS === 'true') {
      const g = h.app.get(CedisGateway) as unknown as {
        authorize: (socket: {
          id: string;
          rooms: Set<string>;
          handshake: { auth?: { token?: string; locationId?: string } };
        }) => Promise<void>;
      };
      const original = g.authorize.bind(g);
      const registry = h.app.get(SessionRevocationRegistry);
      const namespace = h.app.get(CedisGateway).server as unknown as {
        on(
          event: string,
          callback: (socket: { id: string; rooms: Set<string> }) => void,
        ): void;
        server: {
          engine: {
            on(event: string, callback: (socket: { id: string }) => void): void;
          };
        };
      };
      namespace.on('connection', (socket) =>
        timeline.push({
          phase: 'cedis-namespace-connected',
          at: Date.now(),
          id: socket.id,
          rooms: [...socket.rooms],
          tracked: registry.isTracked(socket as never),
        }),
      );
      namespace.server.engine.on('connection', (socket) =>
        timeline.push({
          phase: 'engine-server-open',
          at: Date.now(),
          id: socket.id,
        }),
      );
      g.authorize = async (socket) => {
        timeline.push({
          phase: 'cedis-authorize-start',
          at: Date.now(),
          id: socket.id,
          locationId: socket.handshake.auth?.locationId,
          tokenPresent: Boolean(socket.handshake.auth?.token),
        });
        try {
          await original(socket);
          timeline.push({
            phase: 'cedis-authorize-complete',
            at: Date.now(),
            id: socket.id,
            rooms: [...socket.rooms],
            tracked: registry.isTracked(socket as never),
            bindingCount: registry.connectionCount,
          });
        } catch (error) {
          timeline.push({
            phase: 'cedis-authorize-rejected',
            at: Date.now(),
            id: socket.id,
          });
          throw error;
        }
      };
      saved('cedis-namespace-registered', {
        at: Date.now(),
        namespace: '/cedis',
        provider: true,
      });
    }

    saved('service-startup', {
      startedAt: bootstrapAt,
      durationMs: Date.now() - bootstrapAt,
      outerBudgetMs: 120000,
    });
    try {
      cedisProviderAvailable = !!h.app.get(CedisGateway);
    } catch {
      cedisProviderAvailable = false;
    }
    saved('module-composition', {
      FleetGateway: !!h.app.get(FleetGateway),
      SalesGateway: !!h.app.get(SalesGateway),
      CedisGateway: cedisProviderAvailable,
      source: 'Real AppModule without provider additions',
    });
    branchId = (
      await h.prisma.operationalLocation.findUniqueOrThrow({
        where: { code: 'VER' },
      })
    ).id;
    otherBranchId = (
      await h.prisma.operationalLocation.create({
        data: {
          name: 'UAT other branch',
          code: h.key(),
          type: 'BRANCH',
          parentId: h.cedisId,
          latitude: 19.185,
          longitude: -96.135,
        },
      })
    ).id;
    adminRoleId = (
      await h.prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } })
    ).id;
    const f = await h.fixture();
    stockId = f.stockId;
    productId = f.productId;
    const vehicle = await h.prisma.vehicle.create({
      data: {
        code: 'UAT-' + randomUUID().slice(0, 8),
        displayName: 'Synthetic UAT vehicle',
        homeLocationId: h.cedisId,
      },
    });
    vehicleCode = vehicle.code;
    const r = await h.post('delivery-routes', {
      name: 'UAT real route',
      driverId: h.driverId,
      vehicleId: vehicle.id,
      scheduledDate: new Date().toISOString(),
      originLocationId: h.cedisId,
      routeStockLocationId: stockId,
      orders: [
        { saleId: f.saleId, deliveryAddress: 'Synthetic UAT destination' },
      ],
    });
    check(r.status, 201);
    routeId = data<{ id: string }>(r).id;
    // Real purchases and confirmed transfers, never direct inventory or payment writes.
    check(
      (await h.post('purchases', await h.purchaseBody(productId, 150))).status,
      201,
    );
    businessDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    logisticsDriverId = (await actor('DRIVER')).id;
    logisticsVehicleId = (
      await h.prisma.vehicle.create({
        data: {
          code: h.key(),
          displayName: 'UAT dedicated logistics vehicle',
          homeLocationId: h.cedisId,
        },
      })
    ).id;
    const cycle = await h.post('cedis/branch-supply-cycles', {
      distributionCenterLocationId: h.cedisId,
      branchLocationId: branchId,
      businessDate,
    });
    check(cycle.status, 201);
    cycleId = data<{ id: string }>(cycle).id;
    const openingSupply = await h.post(
      `cedis/branch-supply-cycles/${cycleId}/supplies`,
      {
        expectedVersion: 1,
        assignedDriverId: logisticsDriverId,
        vehicleId: logisticsVehicleId,
        items: [{ productId, unit: 'PIECE', quantityPieces: 30 }],
      },
    );
    check(openingSupply.status, 201);
    const openingId = data<{ transfer: { id: string } }>(openingSupply).transfer
      .id;
    const opening = data<{
      cycleVersion: number;
      items: Array<{ transferItemId: string; quantityPieces: number }>;
    }>(await h.get(`cedis/incoming-supplies/${openingId}`));
    check(
      (
        await h.post(`cedis/incoming-supplies/${openingId}/receive`, {
          expectedCycleVersion: opening.cycleVersion,
          items: opening.items.map((i) => ({
            transferItemId: i.transferItemId,
            quantityPieces: i.quantityPieces,
            quantityKg: 0,
          })),
        })
      ).status,
      201,
    );
    const currentCycle = await h.prisma.branchSupplyCycle.findUniqueOrThrow({
      where: { id: cycleId },
    });
    const supply = await h.post(
      `cedis/branch-supply-cycles/${cycleId}/supplies`,
      {
        expectedVersion: currentCycle.version,
        assignedDriverId: logisticsDriverId,
        vehicleId: logisticsVehicleId,
        items: [{ productId, unit: 'PIECE', quantityPieces: 10 }],
      },
    );
    check(supply.status, 201);
    const t = data<{ transfer: { id: string; transferNumber: string } }>(
      supply,
    ).transfer;
    supplyId = t.id;
    transferNumber = t.transferNumber;
    const terminal = await h.prisma.cashTerminal.create({
      data: {
        name: 'UAT synthetic terminal',
        code: deviceId,
        deviceId,
        operationalLocationId: branchId,
      },
    });
    const shift = await h.post('cash-shifts', {
      terminalId: terminal.id,
      deviceId,
      businessDate,
      initialCashFund: 0,
    });
    check(shift.status, 201);
    cashShiftId = data<{ id: string }>(shift).id;
    await newSale();
    // A populated unauthorized resource, not an empty branch, proves the read boundary.
    const foreignCedis = await h.prisma.operationalLocation.create({
      data: {
        code: h.key(),
        name: 'UAT other CEDIS',
        type: 'DISTRIBUTION_CENTER',
        latitude: 19.183,
        longitude: -96.134,
      },
    });
    await h.prisma.operationalLocation.update({
      where: { id: otherBranchId },
      data: { parentId: foreignCedis.id },
    });
    const foreignDriver = await actor('DRIVER');
    await h.prisma.user.update({
      where: { id: foreignDriver.id },
      data: {
        operationalLocationId: foreignCedis.id,
        cedisLocationId: foreignCedis.id,
      },
    });
    const foreignVehicle = await h.prisma.vehicle.create({
      data: {
        code: h.key(),
        displayName: 'UAT foreign-scope vehicle',
        homeLocationId: foreignCedis.id,
      },
    });
    check(
      (
        await h.post('purchases', {
          ...(await h.purchaseBody(productId, 5)),
          locationId: foreignCedis.id,
        })
      ).status,
      201,
    );
    const foreignCycle = await h.post('cedis/branch-supply-cycles', {
      distributionCenterLocationId: foreignCedis.id,
      branchLocationId: otherBranchId,
      businessDate,
    });
    check(foreignCycle.status, 201);
    const foreignSupply = await h.post(
      `cedis/branch-supply-cycles/${data<{ id: string }>(foreignCycle).id}/supplies`,
      {
        expectedVersion: 1,
        assignedDriverId: foreignDriver.id,
        vehicleId: foreignVehicle.id,
        items: [{ productId, unit: 'PIECE', quantityPieces: 1 }],
      },
    );
    check(foreignSupply.status, 201);
    foreignSupplyId = data<{ transfer: { id: string } }>(foreignSupply).transfer
      .id;
    const reservation = createServer();
    await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((r) => reservation.close(() => r()));
    vite = spawn(
      'npm',
      [
        '--script-shell=/bin/sh',
        'run',
        process.env.UAT_FRONTEND_MODE === 'production' ? 'preview' : 'dev',
        '--',
        '--host',
        '0.0.0.0',
        '--port',
        String(port),
        '--strictPort',
      ],
      {
        cwd: process.env.UAT_FRONTEND,
        env: {
          ...process.env,
          VITE_DEV_API_PROXY_TARGET: h.url,
          VITE_DEV_MAP_PROXY_TARGET: h.url,
          __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: 'host.docker.internal',
        },
        detached: true,
        stdio: 'ignore',
      },
    );
    const readinessAt = Date.now();
    await until(
      async () => {
        try {
          return (
            await fetch(`http://127.0.0.1:${port}`, {
              signal: AbortSignal.timeout(1000),
            })
          ).ok;
        } catch {
          return false;
        }
      },
      'owned Vite ready',
      30000,
    );
    saved('vite-readiness', {
      durationMs: Date.now() - readinessAt,
      budgetMs: 30000,
    });
    web = `http://host.docker.internal:${port}`;
    const connectAt = Date.now();
    browser = await browserRuntime.chromium.connect(
      process.env.UAT_BROWSER_WS,
      { timeout: 18000 },
    );
    saved('browser-connect', {
      durationMs: Date.now() - connectAt,
      budgetMs: 18000,
    });
    saved('runtime', {
      browser: browser.version(),
      node: process.version,
      database: 'owned disposable PostgreSQL16/PostGIS3.5',
      frontend:
        'unaltered production router and pages, Vite ' +
        (process.env.UAT_FRONTEND_MODE === 'production'
          ? 'production build/preview'
          : 'development server'),
      api: 'real AppModule',
      storage: 'owned local S3',
      companyDataPlanes: 1,
    });
    saved('postgres-initial', await readback());
  }, 120000);
  beforeAll(() => {
    loopDelay.enable();
    let previous = Date.now();
    resourceTimer = setInterval(() => {
      const now = Date.now();
      resourceSamples.push({
        at: now,
        intervalMs: now - previous,
        loopMaxMs: loopDelay.max / 1e6,
        loopMeanMs: loopDelay.mean / 1e6,
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        resources: process.getActiveResourcesInfo(),
        browserConnected: browser?.isConnected() ?? false,
        openPages: contexts
          .flatMap((c) => c.pages())
          .filter((p) => !p.isClosed()).length,
      });
      previous = now;
      if (resourceSamples.length > 1800) resourceSamples.shift();
      saved('resource-samples', resourceSamples);
      loopDelay.reset();
    }, 1000);
    resourceTimer.unref();
  });
  afterAll(async () => {
    clearInterval(resourceTimer);
    loopDelay.disable();
    saved('scenario-matrix', matrix);
    saved('control-matrix', controlMatrix);
    saved(
      'scope-lifecycle',
      scopes.map((x) => ({
        owner: x.owner,
        resources: x.resources,
        pending: x.pendingCount,
        phases: x.phases,
      })),
    );
    saved('requests-final', [...requests.values()]);
    saved('http', [...http, ...h.events]);
    saved('socket-events', frames);
    saved('console', consoleErrors);
    saved('timeline', timeline);
    if (routeId) {
      try {
        saved('postgres-final', await readback());
      } catch (error) {
        saved('readback-error', { message: String(error) });
      }
    }
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    if (vite?.pid && vite.exitCode === null) {
      process.kill(-vite.pid, 'SIGTERM');
      await new Promise<void>((resolveExit, reject) => {
        const timer = setTimeout(() => {
          try {
            process.kill(-vite.pid!, 'SIGKILL');
          } catch {
            /* Owned group may already be gone. */
          }
          reject(
            new Error('Owned Vite process exceeded 5000ms teardown budget'),
          );
        }, 5000);
        vite.once('exit', () => {
          clearTimeout(timer);
          resolveExit();
        });
      });
    }
    await h.close();
  }, 30000);

  it('composition: real AppModule provides one authenticated CEDIS gateway and post-commit events', async () => {
    const gateway = (() => {
      try {
        return h.app.get(CedisGateway);
      } catch {
        return null;
      }
    })();
    const runtime = createRequire(
      resolve(__dirname, '../../frontend/package.json'),
    )('socket.io-client');
    const socket = runtime.io(h.url + '/cedis', {
      path: '/api/socket.io',
      auth: { token: h.tokens.admin, locationId: branchId },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    currentScope?.defer('CEDIS control socket', () => {
      socket.disconnect();
    });
    const events: string[] = [];
    socket.on('cedis.supply.created', (v: { transferId: string }) =>
      events.push(v.transferId),
    );
    const handshake = await new Promise<string>((done) => {
      socket.once('connect', () => done('connected'));
      socket.once('connect_error', (err: Error) => done(err.message));
    });
    try {
      const id = await protectedMutation('CEDIS');
      await sleep(200);
      const proof = {
        CedisModule: !!h.app.get(CedisModule),
        FleetGateway: !!h.app.get(FleetGateway),
        SalesGateway: !!h.app.get(SalesGateway),
        CedisGateway: !!gateway,
        handshake,
        transfer: await h.prisma.inventoryTransfer.findUnique({
          where: { id },
          select: { id: true, status: true },
        }),
        protectedEvents: events.filter((v) => v === id).length,
      };
      saved('composition-proof', proof);
      assert.ok(
        gateway,
        'Real AppModule must register CedisGateway, not a manually added testing provider',
      );
      check(handshake, 'connected');
      check(proof.protectedEvents, 1);
      check(
        h.app.select(CedisModule).get(CedisGateway, { strict: true }),
        gateway,
      );
      check(
        (
          h.app.get(BranchSupplyCyclesService) as unknown as {
            cedisGateway: CedisGateway;
          }
        ).cedisGateway,
        gateway,
      );
      const { ModulesContainer } = createRequire(
        resolve(__dirname, '../package.json'),
      )('@nestjs/core');
      const registrations = [...h.app.get(ModulesContainer).values()].filter(
        (m: { providers: Map<unknown, unknown> }) =>
          m.providers.has(CedisGateway),
      );
      check(registrations.length, 1, 'Only one canonical gateway provider');
      const received: string[] = [];
      socket.on('cedis.supply.received', (v: { transferId: string }) =>
        received.push(v.transferId),
      );
      const detail = data<{
        cycleVersion: number;
        items: Array<{
          transferItemId: string;
          quantityKg: number;
          quantityPieces: number;
        }>;
      }>(await h.get(`cedis/incoming-supplies/${id}`));
      const command = {
        expectedCycleVersion: detail.cycleVersion,
        items: detail.items.map((i) => ({
          transferItemId: i.transferItemId,
          quantityKg: i.quantityKg,
          quantityPieces: i.quantityPieces,
        })),
      };
      const beforeReceived = received.length;
      check(
        (
          await h.post(`cedis/incoming-supplies/${id}/receive`, {
            ...command,
            expectedCycleVersion: 0,
          })
        ).status,
        400,
      );
      await sleep(120);
      check(received.length, beforeReceived, 'Rejected receipt cannot publish');
      const key = h.key();
      check(
        (
          await h.post(
            `cedis/incoming-supplies/${id}/receive`,
            command,
            'admin',
            key,
          )
        ).status,
        201,
      );
      await until(
        () => received.includes(id),
        'committed physical receipt notification',
      );
      check(
        (await h.prisma.inventoryTransfer.findUniqueOrThrow({ where: { id } }))
          .status,
        'CONFIRMED',
      );
      check(
        (
          await h.post(
            `cedis/incoming-supplies/${id}/receive`,
            command,
            'admin',
            key,
          )
        ).status,
        201,
      );
      await sleep(120);
      check(
        received.filter((v) => v === id).length,
        1,
        'Replay and overlapping ADMIN rooms cannot duplicate notifications',
      );
      saved('composition-green', {
        ...proof,
        receiptEventCount: received.filter((v) => v === id).length,
        providerRegistrations: registrations.length,
        committed: true,
      });
    } finally {
      socket.disconnect();
    }
  }, 30000);
  it('composition: CEDIS rejects invalid identity and isolates a connected SELLER', async () => {
    const { io } = createRequire(
      resolve(__dirname, '../../frontend/package.json'),
    )('socket.io-client');
    const clients: Array<{ disconnect: () => void }> = [];
    async function connect(token: string, locationId: string) {
      const socket = io(h.url + '/cedis', {
        path: '/api/socket.io',
        auth: { token, locationId },
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
      });
      clients.push(socket);
      const result = await new Promise<string>((done) => {
        socket.once('connect', () => done('connected'));
        socket.once('connect_error', () => done('rejected'));
      });
      return { socket, result };
    }
    try {
      check((await connect('invalid', branchId)).result, 'rejected');
      check((await connect(h.tokens.seller, otherBranchId)).result, 'rejected');
      const own = await connect(h.tokens.seller, branchId);
      check(own.result, 'connected');
      const received: string[] = [];
      own.socket.on('cedis.supply.created', (x: { transferId: string }) =>
        received.push(x.transferId),
      );
      const positive = await protectedMutation('CEDIS');
      await until(
        () => received.includes(positive),
        'SELLER positive protected delivery',
      );
      const link = await h.prisma.branchSupplyCycleTransfer.findUniqueOrThrow({
        where: { inventoryTransferId: foreignSupplyId },
      });
      const cycle = await h.prisma.branchSupplyCycle.findUniqueOrThrow({
        where: { id: link.branchSupplyCycleId },
      });
      const route = await h.prisma.deliveryRoute.findFirstOrThrow({
        where: { inventoryTransferId: foreignSupplyId },
      });
      const foreign = await h.post(
        `cedis/branch-supply-cycles/${cycle.id}/supplies`,
        {
          expectedVersion: cycle.version,
          assignedDriverId: route.driverId,
          vehicleId: route.vehicleId,
          items: [{ productId, unit: 'PIECE', quantityPieces: 1 }],
        },
      );
      check(foreign.status, 201);
      const id = data<{ transfer: { id: string } }>(foreign).transfer.id;
      await sleep(200);
      check(received.includes(id), false);
      saved('cedis-branch-event-proof', {
        authorizedConnected: true,
        positiveDelivered: true,
        foreignEventDelivered: false,
        invalidTokenRejected: true,
        foreignRoomRejected: true,
      });
    } finally {
      for (const c of clients) c.disconnect();
    }
  }, 30000);
  it('preconditions: delayed locations cannot skip ADMIN branch selection', async () => {
    const context = await browser.newContext();
    contexts.push(context);
    const rawClose = context.close.bind(context);

    currentScope?.defer('BrowserContext', async () => {
      await rawClose();
    });
    const page = await context.newPage();
    observe(page, 'Pedidos-delayed-precondition');
    try {
      await page.goto(web + '/login');
      await page
        .getByLabel('Correo', { exact: true })
        .fill('dev.admin@pollos.local');
      await page.getByLabel(/^Contraseña/).fill(DEVELOPMENT_ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Entrar al sistema' }).click();
      await until(() => !page.url().includes('/login'), 'login redirects');
      await page.route('**/api/locations?*', async (route) => {
        const response = await route.fetch();
        await sleep(750);
        await route.fulfill({ response });
      });
      try {
        await open(page, screens[1]);
      } finally {
        saved('delayed-location-proof', {
          value: await page.getByRole('combobox').inputValue(),
          body: (await page.locator('body').innerText()).slice(-3500),
        });
      }
      check(await page.getByRole('combobox').inputValue(), branchId);
    } finally {
      await context.close();
    }
  }, 30000);
  it('lifecycle: CEDIS resubscribes after filter, server disconnect and same-browser user transition', async () => {
    const first = await actor('SELLER');
    const second = await actor('WAREHOUSE');
    const p = await login(screens[2], first);
    const connected = () =>
      p.page
        .getByRole('status', { name: 'Estado de conexión CEDIS' })
        .getByText('Conectado', { exact: true })
        .waitFor();
    try {
      await setAll(p.page, false);
      await connected();
      await setAll(p.page, true);
      await connected();
      const positive = await protectedMutation('CEDIS');
      await until(
        () => received(p.label, positive),
        'CEDIS positive after resubscription',
      );
      const before = frames.filter(
        (f) => f.label === p.label && f.kind === 'transport-open',
      ).length;
      for (const [socketId, socket] of socketsOf(CedisGateway)) {
        if (sessionOf(socket) === p.sessionId) {
          timeline.push({
            phase: 'control-server-disconnect',
            id: socketId,
            at: Date.now(),
          });
          (
            socket as unknown as { disconnect(close: boolean): void }
          ).disconnect(false);
        }
      }
      await until(
        () =>
          frames.filter(
            (f) => f.label === p.label && f.kind === 'transport-open',
          ).length > before,
        'CEDIS authorized server-disconnect recovery',
      );
      await connected();
      const next = await protectedMutation('CEDIS');
      await until(
        () => received(p.label, next),
        'CEDIS event after explicit recovery',
      );
      await p.page
        .getByRole('link', { name: 'Cerrar sesión', exact: true })
        .click();
      await p.page.getByLabel('Correo', { exact: true }).fill(second.email);
      await p.page.getByLabel(/^Contraseña/).fill(second.password);
      await p.page.getByRole('button', { name: 'Entrar al sistema' }).click();
      await until(
        () => !p.page.url().includes('/login'),
        'second legitimate login',
      );
      await open(p.page, screens[2], 'WAREHOUSE');
      await connected();
      const last = await protectedMutation('CEDIS');
      await until(
        () => received(p.label, last),
        'new user and location event delivery',
      );
      saved('cedis-lifecycle-control', {
        firstUser: first.id,
        secondUser: second.id,
        firstLocation: branchId,
        secondLocation: h.cedisId,
        filterResubscription: true,
        serverDisconnectRecovered: true,
        secondIdentityConnected: true,
        protectedEvents: [positive, next, last],
      });
    } finally {
      await p.context.close();
    }
  }, 69000);
  it('feedback: actual CEDIS page exposes authenticated connection state', async () => {
    const p = await login(screens[2]);
    try {
      await p.page
        .getByRole('status', { name: 'Estado de conexión CEDIS' })
        .getByText('Conectado', { exact: true })
        .waitFor();
    } finally {
      await p.context.close();
    }
  }, 30000);

  describe('isolated enterprise acceptance', () => {
    scenario(
      'A1-Fleet-live',
      'ADMIN UI / DRIVER HTTP',
      [
        'Login through real form',
        'Open FleetLivePage',
        'Start assigned route through REST',
        'Publish authenticated synthetic GPS',
        'Compare UI, event and PostGIS',
      ],
      async (row) => {
        const p = await login(screens[0]);
        row.before = await readback();
        check(
          (
            await h.patch(`delivery-routes/${routeId}/status`, {
              status: 'IN_PROGRESS',
            })
          ).status,
          200,
        );
        const id = await gps(12);
        await until(() => received(p.label, id), 'Fleet position delta');
        await until(
          async () =>
            (
              await p.page
                .getByTestId('fleet-unit-button')
                .filter({ hasText: vehicleCode })
                .innerText()
            ).includes('12'),
          'Fleet speed visible',
        );
        check(
          await p.page
            .getByTestId('fleet-unit-button')
            .filter({ hasText: vehicleCode })
            .count(),
          1,
        );
        row.after = await readback();
        await p.page.locator('canvas.maplibregl-canvas').waitFor();
        await until(
          () =>
            http.some(
              (r) =>
                r.source === p.label &&
                String(r.path).endsWith('.pbf') &&
                r.status === 200,
            ),
          'real local vector map tiles loaded',
          30000,
        );
        row.cartography =
          'Real local Mexico vector tiles, original operations style and MapLibre canvas';
        await snap(p.page, 'A1-fleet-live', row);
        await p.context.close();
      },
    );
    scenario(
      'A2-Fleet-lost-event-late-REST',
      'ADMIN UI / DRIVER HTTP',
      [
        'Hold a real old Fleet REST response',
        'Interrupt Chromium network',
        'Commit GPS while disconnected and lose delta',
        'Reconnect and fetch authoritative REST',
        'Release old response last',
      ],
      async (row) => {
        const p = await login(screens[0]);
        const old = await hold(p.page, screens[0].rest);
        try {
          await p.page
            .getByRole('button', { name: 'Recuperar snapshot' })
            .click();
          await old.captured;
          row.oldResponse = old.snapshot;
          row.before = await readback();
          await p.context.setOffline(true);
          await sleep(500);
          const id = await gps(27);
          check(
            received(p.label, id),
            false,
            'Offline page must miss the protected GPS delta',
          );
          await p.context.setOffline(false);
          await until(
            async () =>
              (
                await p.page
                  .getByTestId('fleet-unit-button')
                  .filter({ hasText: vehicleCode })
                  .innerText()
              ).includes('27'),
            'Fleet REST recovered new speed',
          );
          old.release();
          await sleep(500);
          assert.match(
            await p.page
              .getByTestId('fleet-unit-button')
              .filter({ hasText: vehicleCode })
              .innerText(),
            /27/,
          );
          row.after = await readback();
          await snap(p.page, 'A2-fleet-recovered', row);
        } finally {
          await snap(p.page, 'A2-terminal-' + p.label, row).catch(() => {});
          old.release();
          await p.context.close();
        }
      },
    );
    scenario(
      'B1-Pedidos-live-and-branch-filter',
      'ADMIN UI',
      [
        'Render PedidosPage',
        'Select explicit branch',
        'Create real credit sale (no payment)',
        'Observe sale.created and unique rendered card',
        'Switch branch filter',
      ],
      async (row) => {
        const p = await login(screens[1]);
        const sale = await newSale();
        await until(() => received(p.label, sale.id), 'real Sale event');
        await p.page.getByText(sale.saleNumber, { exact: true }).waitFor();
        check(
          await p.page.getByText(sale.saleNumber, { exact: true }).count(),
          1,
        );
        await p.page.getByRole('combobox').selectOption(otherBranchId);
        await sleep(300);
        check(
          await p.page.getByText(sale.saleNumber, { exact: true }).count(),
          0,
        );
        await p.page.getByRole('combobox').selectOption(branchId);
        await p.page.getByText(sale.saleNumber, { exact: true }).waitFor();
        row.after = await readback();
        await snap(p.page, 'B1-pedidos', row);
        await p.context.close();
      },
    );
    scenario(
      'B2-Pedidos-lost-event-late-REST',
      'ADMIN UI',
      [
        'Hold old real branch response during branch reselection',
        'Disconnect network',
        'Confirm new sale through REST',
        'Reconnect and recover latest two orders',
        'Release stale response last; verify order/duplicates',
      ],
      async (row) => {
        await ordersRecovery(row, 'B2');
      },
    );
    scenario(
      'B3-Pedidos-permitted-cancellation',
      'ADMIN UI / real cancellation endpoint',
      [
        'Create sale using service',
        'Cancel with current version and reason',
        'Reconnect original PedidosPage',
        'Verify cancelled sale disappears and inventory restoration is unique',
      ],
      async (row) => {
        const p = await login(screens[1]);
        const sale = await newSale();
        await p.page.getByText(sale.saleNumber, { exact: true }).waitFor();
        const before = await h.prisma.sale.findUniqueOrThrow({
          where: { id: sale.id },
        });
        await p.context.setOffline(true);
        await sleep(300);
        const r = await h.post(`sales/${sale.id}/cancel`, {
          expectedVersion: before.version,
          reason: 'Synthetic UAT permitted cancellation',
        });
        check(r.status, 201);
        check(
          (await h.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } }))
            .status,
          'CANCELLED',
        );
        await p.context.setOffline(false);
        await until(
          async () =>
            (await p.page
              .getByText(sale.saleNumber, { exact: true })
              .count()) === 0,
          'Cancelled sale removed by REST',
        );
        row.after = await readback();
        await snap(p.page, 'B3-pedidos-cancelled', row);
        await p.context.close();
      },
    );
    scenario(
      'C1-CEDIS-real-reception-late-REST',
      'ADMIN UI / SELLER receipt HTTP',
      [
        'Render real incoming supplies',
        'Capture old real pending list',
        'Disconnect client',
        'Receive using versioned/idempotent service',
        'Verify two committed inventory movements',
        'Reconnect then release stale list',
      ],
      async (row) => {
        const p = await login(screens[2]);
        await p.page.getByText(transferNumber, { exact: true }).waitFor();
        await setAll(p.page, false);
        await sleep(150);
        const old = await hold(p.page, screens[2].rest);
        try {
          await setAll(p.page, true);
          await old.captured;
          row.oldResponse = old.snapshot;
          await p.context.setOffline(true);
          await sleep(500);
          row.before = await readback();
          const detail = data<{
            cycleVersion: number;
            items: Array<{
              transferItemId: string;
              quantityKg: number;
              quantityPieces: number;
            }>;
          }>(await h.get(`cedis/incoming-supplies/${supplyId}`));
          const key = h.key(),
            body = {
              expectedCycleVersion: detail.cycleVersion,
              items: detail.items.map((i) => ({
                transferItemId: i.transferItemId,
                quantityKg: i.quantityKg,
                quantityPieces: i.quantityPieces,
              })),
            };
          check(
            (
              await h.post(
                `cedis/incoming-supplies/${supplyId}/receive`,
                body,
                'seller',
                key,
              )
            ).status,
            201,
          );
          check(
            (
              await h.post(
                `cedis/incoming-supplies/${supplyId}/receive`,
                body,
                'seller',
                key,
              )
            ).status,
            201,
          );
          check(
            await h.prisma.inventoryMovement.count({
              where: { transferId: supplyId },
            }),
            2,
          );
          check(
            (
              await h.prisma.inventoryTransfer.findUniqueOrThrow({
                where: { id: supplyId },
              })
            ).status,
            'CONFIRMED',
          );
          await p.context.setOffline(false);
          await until(
            async () =>
              (
                await p.page
                  .getByRole('button')
                  .filter({ hasText: transferNumber })
                  .textContent()
              )?.includes('Confirmado') ?? false,
            'CEDIS received status',
          );
          old.release();
          await sleep(500);
          assert.match(
            (await p.page
              .getByRole('button')
              .filter({ hasText: transferNumber })
              .textContent()) ?? '',
            /Confirmado/,
          );
          check(
            await p.page.getByText(transferNumber, { exact: true }).count(),
            1,
          );
          row.after = await readback();
          await snap(p.page, 'C1-cedis-recovered', row);
        } finally {
          row.authoritativeDetail = data(
            await h.get(`cedis/incoming-supplies/${supplyId}`),
          );
          await snap(p.page, 'C1-terminal-' + p.label, row).catch(() => {});
          old.release();
          await p.context.close();
        }
      },
    );
    scenario(
      'C2-CEDIS-physical-receipt-real-UI',
      'SELLER real business page',
      [
        'Dispatch a coherent supply through service',
        'Open original incoming page and receipt dialog',
        'Report physically received synthetic quantities through real UI',
        'Verify unique receipt, two movements and branch balances',
      ],
      async (row) => {
        const id = await protectedMutation('CEDIS');
        const transfer = await h.prisma.inventoryTransfer.findUniqueOrThrow({
          where: { id },
        });
        const who = await actor('SELLER'),
          p = await login(screens[2], who);
        try {
          await p.page
            .getByRole('button')
            .filter({ hasText: transfer.transferNumber })
            .click();
          await p.page
            .getByRole('button', { name: 'Avisar a matriz', exact: true })
            .waitFor();
          const response = p.page.waitForResponse(
            (r) =>
              new URL(r.url()).pathname ===
                `/api/cedis/incoming-supplies/${id}/receive` &&
              r.request().method() === 'POST',
          );
          await p.page
            .getByRole('button', { name: 'Avisar a matriz', exact: true })
            .click();
          const receiptResponse = await response;
          check(receiptResponse.status(), 201);
          await receiptResponse.finished();
          await until(
            () =>
              frames.some(
                (f) =>
                  f.label === p.label &&
                  f.event === 'cedis.supply.received' &&
                  (f.value as { transferId?: string })?.transferId === id,
              ),
            'C2 positive committed receipt event',
          );
          const committed = await h.prisma.inventoryTransfer.findUniqueOrThrow({
            where: { id },
          });
          check(committed.status, 'CONFIRMED');
          const movements = await h.prisma.inventoryMovement.findMany({
            where: { transferId: id },
            select: {
              type: true,
              locationId: true,
              quantityPieces: true,
              quantityKg: true,
            },
          });
          check(movements.map((m) => m.type).sort(), [
            'TRANSFER_IN',
            'TRANSFER_OUT',
          ]);
          check(
            movements.find((m) => m.type === 'TRANSFER_OUT')?.locationId,
            transfer.originLocationId,
          );
          check(
            movements.find((m) => m.type === 'TRANSFER_IN')?.locationId,
            transfer.destinationLocationId,
          );
          const request = receiptResponse.request();
          const replay = await fetch(
            h.url + '/api/cedis/incoming-supplies/' + id + '/receive',
            {
              method: 'POST',
              headers: {
                authorization: 'Bearer ' + p.token,
                'content-type': 'application/json',
                'idempotency-key': request.headers()['idempotency-key'],
              },
              body: request.postData(),
            },
          );
          check(replay.status, 201);
          await replay.arrayBuffer();
          await sleep(150);
          check(
            frames.filter(
              (f) =>
                f.label === p.label &&
                f.event === 'cedis.supply.received' &&
                (f.value as { transferId?: string })?.transferId === id,
            ).length,
            1,
            'Receipt replay must not duplicate protected notification',
          );
          row.receiptIntegrity = {
            transferId: id,
            status: committed.status,
            movements,
            replayStatus: replay.status,
            receiptEvents: 1,
          };

          check(
            await h.prisma.branchSupplyReceipt.count({
              where: { inventoryTransferId: id },
            }),
            1,
          );
          check(
            await h.prisma.inventoryMovement.count({
              where: { transferId: id },
            }),
            2,
          );
          await until(
            async () =>
              (await p.page.locator('body').innerText()).includes(
                'Reporte enviado',
              ),
            'real receipt UI confirmation',
          );
          await snap(p.page, 'C2-cedis-physical-receipt', row);
        } finally {
          await p.context.close();
        }
      },
    );
    for (const screen of screens) {
      scenario(
        `AUTH-${screen.name}-revocation-two-independent-sessions`,
        'Two independent ADMIN browser sessions',
        [
          'Login two legitimate sessions for same actor',
          'Prove positive event delivery to both real pages',
          'Revoke session A through real AuthService',
          'Attempt new protected event and old-token REST/reconnection',
          'Prove session B still receives and remains usable',
        ],
        async (row) => {
          const who = await actor(),
            a = await login(screen, who),
            b = await login(screen, who);
          try {
            const first = await protectedMutation(screen.name);
            if (screen.name !== 'CEDIS' || cedisProviderAvailable)
              await until(
                () => received(a.label, first) && received(b.label, first),
                'positive protected delivery in both sessions',
              );
            await h.app.get(AuthService).logout(a.sessionId);
            await sleep(500);
            const next = await protectedMutation(screen.name);
            if (screen.name !== 'CEDIS' || cedisProviderAvailable)
              await until(
                () => received(b.label, next),
                'unrelated valid session delivery',
              );
            check(
              received(a.label, next),
              false,
              'Revoked session received a new protected event',
            );
            const path =
              screen.rest.replace('/api/', '') +
              (screen.name === 'Pedidos'
                ? '?locationId=' + branchId
                : screen.name === 'CEDIS'
                  ? '?businessDate=' + businessDate
                  : '');
            check((await json(path, 'GET', undefined, a.token)).status, 401);
            await a.context.setOffline(true);
            await a.context.setOffline(false);
            await sleep(600);
            check(received(a.label, next), false);
            check((await json(path, 'GET', undefined, b.token)).status, 200);
            row.sessions = {
              aRevoked:
                (
                  await h.prisma.authSession.findUniqueOrThrow({
                    where: { id: a.sessionId },
                  })
                ).revokedAt !== null,
              bRevoked:
                (
                  await h.prisma.authSession.findUniqueOrThrow({
                    where: { id: b.sessionId },
                  })
                ).revokedAt !== null,
            };
            row.delivery = {
              positiveBoth: true,
              revokedReceivesNew: false,
              validReceivesNew: true,
            };
            await snap(a.page, `AUTH-${screen.name}-revoked`, row);
            if (screen.name === 'CEDIS' && !cedisProviderAvailable) {
              row.restSecurity = 'PASS';
              row.delivery = 'BLOCKED: no working positive namespace';
              throw new ScenarioBlocked(
                'UAT-P1-001: CEDIS namespace missing; REST revocation passed, protected-delivery proof unavailable',
              );
            }
          } finally {
            await a.context.close();
            await b.context.close();
          }
        },
      );
      for (const change of ['deactivate', 'profile'] as const)
        scenario(
          `AUTH-${screen.name}-${change}`,
          'Fresh ADMIN actor; separate ADMIN controller',
          [
            'Open real page and authenticated socket',
            'Perform authorized durable account change via REST',
            'Attempt a real business mutation/event',
            'Verify old session receives neither event nor REST data',
          ],
          async (row) => {
            const who = await actor(),
              p = await login(screen, who);
            try {
              const first = await protectedMutation(screen.name);
              if (screen.name !== 'CEDIS' || cedisProviderAvailable)
                await until(
                  () => received(p.label, first),
                  'positive event before account change',
                );
              if (change === 'deactivate')
                check(
                  (
                    await json(`users/${who.id}`, 'DELETE', {
                      reason: 'UAT synthetic account deactivation',
                    })
                  ).status,
                  200,
                );
              else {
                const role = await h.prisma.role.findUniqueOrThrow({
                  where: { name: 'BILLING' },
                });
                check(
                  (
                    await json(`users/${who.id}/access-profile`, 'PATCH', {
                      roleId: role.id,
                      expectedRoleId: adminRoleId,
                      reason: 'UAT synthetic profile change',
                    })
                  ).status,
                  200,
                );
              }
              await sleep(350);
              const next = await protectedMutation(screen.name);
              await sleep(350);
              check(received(p.label, next), false);
              check(
                (await json('auth/me', 'GET', undefined, p.token)).status,
                401,
              );
              row.database = await h.prisma.user.findUnique({
                where: { id: who.id },
                select: {
                  id: true,
                  isActive: true,
                  roleId: true,
                  sessionVersion: true,
                },
              });
              await snap(p.page, `AUTH-${screen.name}-${change}`, row);
              if (screen.name === 'CEDIS' && !cedisProviderAvailable) {
                row.restSecurity = 'PASS';
                throw new ScenarioBlocked(
                  'UAT-P1-001: durable account denial verified, CEDIS positive delivery unavailable',
                );
              }
            } finally {
              await p.context.close();
            }
          },
        );
      scenario(
        `AUTH-${screen.name}-logout-pending-REST`,
        'ADMIN real UI',
        [
          'Hold genuine protected response',
          'Logout using real navigation with socket still open',
          'Commit another business event',
          'Release old HTTP response after logout',
          'Verify login screen and durable revocation',
        ],
        async (row) => {
          const p = await login(screen);
          const positive = await protectedMutation(screen.name);
          await until(
            () => received(p.label, positive),
            'positive event before logout',
          );
          const old = await hold(p.page, screen.rest);
          try {
            if (screen.name === 'Fleet')
              await p.page
                .getByRole('button', { name: 'Recuperar snapshot' })
                .click();
            else if (screen.name === 'Pedidos') {
              await p.page.getByRole('combobox').selectOption(otherBranchId);
              await old.captured;
            } else {
              await setAll(p.page, false);
            }
            await old.captured;
            await p.page.getByRole('link', { name: 'Cerrar sesión' }).click();
            await until(
              () => p.page.url().includes('/login'),
              'real logout redirects',
            );
            const next = await protectedMutation(screen.name);
            old.release();
            await sleep(500);
            check(received(p.label, next), false);
            assert.match(p.page.url(), /\/login/);
            check(
              (await json('auth/me', 'GET', undefined, p.token)).status,
              401,
            );
            row.revoked =
              (
                await h.prisma.authSession.findUniqueOrThrow({
                  where: { id: p.sessionId },
                })
              ).revokedAt !== null;
            await snap(p.page, `AUTH-${screen.name}-logout`, row);
            if (screen.name === 'CEDIS' && !cedisProviderAvailable) {
              row.restSecurity = 'PASS';
              throw new ScenarioBlocked(
                'UAT-P1-001: real logout and stale HTTP isolation passed, no working CEDIS socket positive control',
              );
            }
          } finally {
            old.release();
            await p.context.close();
          }
        },
      );
    }
    for (const screen of screens)
      scenario(
        `AUTH-${screen.name}-expired-JWT-and-valid-renewal`,
        'Fresh ADMIN UI with real short-lived token',
        [
          'Issue real 40-second JWT through UI login',
          'Hold automatic refresh transport without altering response',
          'Let server clock expire access token',
          'Attempt reconnect and protected update with old token',
          'Verify REST401 and no protected delivery',
          'Release valid refresh and recover without new login',
        ],
        async (row) => {
          const ttl = process.env.JWT_ACCESS_EXPIRES_IN;
          process.env.JWT_ACCESS_EXPIRES_IN = '40s';
          let p: Awaited<ReturnType<typeof login>> | undefined;
          let release!: () => void;
          const gate = new Promise<void>((r) => (release = r));
          currentScope?.defer('refresh-gate', release);
          try {
            p = await login(screen, await actor());
            process.env.JWT_ACCESS_EXPIRES_IN = ttl;
            const owner = currentScope!;
            await p.page.route('**/api/auth/refresh', (route) =>
              owner.track(
                (async () => {
                  await gate;
                  if (owner.signal.aborted) await route.abort().catch(() => {});
                  else await route.continue();
                })(),
              ),
            );
            const first = await protectedMutation(screen.name);
            if (screen.name !== 'CEDIS' || cedisProviderAvailable)
              await until(
                () => received(p!.label, first),
                'positive event before expiry',
              );
            await sleep(Math.max(0, p.exp * 1000 - Date.now() + 350));
            await p.context.setOffline(true);
            await p.context.setOffline(false);
            const next = await protectedMutation(screen.name);
            await sleep(600);
            check(
              received(p.label, next),
              false,
              'Expired token must not receive protected data',
            );
            check(
              (await json('auth/me', 'GET', undefined, p.token)).status,
              401,
            );
            row.expiredAt = new Date(p.exp * 1000).toISOString();
            row.expiredHTTP = 401;
            const renewed = p.page.waitForResponse(
              (r) =>
                new URL(r.url()).pathname === '/api/auth/refresh' &&
                r.status() === 200,
            );
            release();
            await renewed;
            if (screen.name === 'Fleet')
              await p.page
                .getByText('Tiempo real conectado', { exact: true })
                .waitFor();
            if (screen.name === 'Pedidos')
              await p.page.getByText('Conectado', { exact: true }).waitFor();
            const fresh = await protectedMutation(screen.name);
            if (screen.name !== 'CEDIS' || cedisProviderAvailable)
              await until(
                () => received(p!.label, fresh),
                'renewed valid session receives actual new update',
              );
            await snap(p.page, `AUTH-${screen.name}-expiry`, row);
            if (screen.name === 'CEDIS' && !cedisProviderAvailable) {
              row.restSecurity = 'PASS';
              throw new ScenarioBlocked(
                'UAT-P1-001: real expired HTTP401/refresh200 proven, CEDIS delivery/renewal proof blocked',
              );
            }
          } finally {
            process.env.JWT_ACCESS_EXPIRES_IN = ttl;
            release();
            await p?.context.close();
          }
        },
      );
    scenario(
      'AUTH-permission-removal',
      'SELLER real CEDIS/Pedidos pages; ADMIN permission writer',
      [
        'Login SELLER on real CEDIS page',
        'Remove receive-supplies permission from canonical SELLER profile through versioned endpoint',
        'Verify durable permissions and revocation',
        'Reject old-token REST',
        'Restore original permissions through authorized endpoint',
      ],
      async (row) => {
        const who = await actor('SELLER'),
          p = await login(screens[2], who);
        const role = await h.prisma.role.findUniqueOrThrow({
          where: { name: 'SELLER' },
          include: { permissions: { include: { permission: true } } },
        });
        const keys = role.permissions.map((r) => r.permission.key);
        const positive = await protectedMutation('CEDIS');
        await until(
          () => received(p.label, positive),
          'positive event before permission removal',
        );
        try {
          check(
            (
              await json(`roles/${role.id}/permissions`, 'PATCH', {
                permissionKeys: keys.filter(
                  (k) => k !== 'cedis.receive_supplies',
                ),
                expectedVersion: role.version,
                reason: 'UAT synthetic permission revocation',
              })
            ).status,
            200,
          );
          check((await json('auth/me', 'GET', undefined, p.token)).status, 401);
          check(
            (
              await h.prisma.authSession.findUniqueOrThrow({
                where: { id: p.sessionId },
              })
            ).revokedAt !== null,
            true,
          );
          const protectedId = await protectedMutation('CEDIS');
          await sleep(350);
          check(
            received(p.label, protectedId),
            false,
            'Permission-revoked session must not receive protected data',
          );
          row.permissionRemoved = true;
          await snap(p.page, 'AUTH-permission-removal', row);
          if (!cedisProviderAvailable) {
            row.restSecurity = 'PASS';
            throw new ScenarioBlocked(
              'UAT-P1-001: permission/session denial passed; CEDIS event denial has no positive control',
            );
          }
        } finally {
          const current = await h.prisma.role.findUniqueOrThrow({
            where: { id: role.id },
          });
          check(
            (
              await json(`roles/${role.id}/permissions`, 'PATCH', {
                permissionKeys: keys,
                expectedVersion: current.version,
                reason: 'Restore UAT synthetic profile after negative case',
              })
            ).status,
            200,
          );
          await p.context.close();
        }
      },
    );
    for (const screen of screens)
      scenario(
        `UX-${screen.name}-network-interruption`,
        'ADMIN real enterprise page',
        [
          'Interrupt actual Chromium transport',
          'Inspect visible connection feedback',
          'Restore valid network',
          'Measure bounded socket attempts and recover usable page',
        ],
        async (row) => {
          const p = await login(screen);
          try {
            await p.context.setOffline(true);
            await sleep(1200);
            row.disconnectedVisible = (
              await p.page.locator('body').innerText()
            ).slice(-12000);
            const feedback =
              /Desconectad|Reconectand|Sin conexión|Error de conexión|Tiempo real desconectado/i.test(
                String(row.disconnectedVisible),
              );
            row.feedback = feedback;
            await p.context.setOffline(false);
            await p.page
              .getByText(
                screen.name === 'Fleet' ? 'Tiempo real conectado' : 'Conectado',
                { exact: true },
              )
              .waitFor();
            await sleep(2000);
            const t = Date.now();
            await sleep(2000);
            const attempts = frames.filter(
              (f) =>
                f.label === p.label &&
                f.kind === 'transport-open' &&
                Number(f.at) >= t,
            ).length;
            row.additionalAttemptsAfterSettling = attempts;
            assert.ok(attempts <= 1, 'Unbounded reconnect attempts');
            await snap(p.page, `UX-${screen.name}`, row);
            assert.ok(
              feedback,
              'UAT-P2-001: page exposes no disconnect/reconnection feedback',
            );
          } finally {
            await p.context.close();
          }
        },
      );
    for (const name of ['SELLER', 'WAREHOUSE'])
      scenario(
        `SCOPE-${name}-real-pages`,
        name,
        [
          'Login assigned operational role on actual CEDIS page',
          'Read allowed incoming supply',
          'Attempt forbidden other-branch read',
          'Open actual Pedidos page and Fleet page under original route guards',
        ],
        async (row) => {
          const who = await actor(name),
            p = await login(screens[2], who);
          try {
            check(
              (
                await json(
                  `cedis/incoming-supplies/${supplyId}`,
                  'GET',
                  undefined,
                  p.token,
                )
              ).status,
              200,
            );
            check(
              (
                await json(
                  `cedis/incoming-supplies/${foreignSupplyId}`,
                  'GET',
                  undefined,
                  p.token,
                )
              ).status,
              403,
            );
            const forbidden = await json(
              `cedis/incoming-supplies?businessDate=${businessDate}&branchLocationId=${otherBranchId}`,
              'GET',
              undefined,
              p.token,
            );
            row.otherBranchHTTP = forbidden.status;
            assert.ok([403, 200].includes(forbidden.status));
            if (forbidden.status === 200) {
              const items = forbidden.body.data.items as Array<{
                origin: { id: string };
                destination: { id: string };
              }>;
              check(
                items.every((i) =>
                  name === 'SELLER'
                    ? i.destination.id === branchId
                    : i.origin.id === h.cedisId,
                ),
                true,
                'Only authorized scope may be returned',
              );
            }
            await p.page.goto(web + '/orders');
            await sleep(700);
            row.ordersVisible = (
              await p.page.locator('body').innerText()
            ).slice(-3000);
            if (name === 'SELLER') {
              await p.page
                .getByRole('heading', { name: 'Pedidos de sucursal' })
                .waitFor();
              check(
                (
                  await json(
                    `sales/orders?locationId=${otherBranchId}`,
                    'GET',
                    undefined,
                    p.token,
                  )
                ).status,
                403,
              );
            }
            await p.page.goto(web + '/delivery-routes/live');
            await sleep(700);
            check(await p.page.getByTestId('fleet-unit-button').count(), 0);
            row.after = await readback();
            await snap(p.page, `SCOPE-${name}`, row);
          } finally {
            await p.context.close();
          }
        },
      );
    scenario(
      'A3-Fleet-route-transition-while-offline',
      'ADMIN real Fleet page',
      [
        'Hold old live snapshot',
        'Disconnect transport',
        'Cancel real route with authorized version-independent status command',
        'Reconnect and recover REST',
        'Release old route snapshot and verify cancelled unit does not return',
      ],
      async (row) => {
        const p = await login(screens[0]),
          old = await hold(p.page, screens[0].rest);
        try {
          await p.page
            .getByTestId('fleet-unit-button')
            .filter({ hasText: vehicleCode })
            .waitFor();
          check(
            (
              await h.prisma.deliveryRoute.findUniqueOrThrow({
                where: { id: routeId },
              })
            ).status,
            'IN_PROGRESS',
          );
          await p.page
            .getByRole('button', { name: 'Recuperar snapshot' })
            .click();
          await old.captured;
          row.oldResponse = old.snapshot;
          const cutAt = Date.now();
          await p.context.setOffline(true);
          await until(
            () =>
              frames.some(
                (f) =>
                  f.label === p.label &&
                  f.kind === 'transport-close' &&
                  Number(f.at) >= cutAt,
              ),
            'Fleet transport actually closed',
          );
          row.transportCutAt = cutAt;
          check(
            (
              await h.patch(`delivery-routes/${routeId}/status`, {
                status: 'CANCELLED',
              })
            ).status,
            200,
          );
          check(
            (
              await h.prisma.deliveryRoute.findUniqueOrThrow({
                where: { id: routeId },
              })
            ).status,
            'CANCELLED',
          );
          await p.context.setOffline(false);
          await until(
            async () =>
              (await p.page
                .getByTestId('fleet-unit-button')
                .filter({ hasText: vehicleCode })
                .count()) === 0,
            'cancelled route removed',
          );
          check((await json('auth/me', 'GET', undefined, p.token)).status, 200);
          check(
            http.some(
              (r) =>
                r.source === p.label &&
                r.path === '/api/fleet/live' &&
                r.status === 200 &&
                Number(r.at) >= cutAt,
            ),
            true,
            'New authoritative browser REST must precede accepting cancellation recovery',
          );
          old.release();
          await sleep(500);
          check(
            await p.page
              .getByTestId('fleet-unit-button')
              .filter({ hasText: vehicleCode })
              .count(),
            0,
          );
          await snap(p.page, 'A3-fleet-route-removed', row);
        } finally {
          old.release();
          await p.context.close();
        }
      },
    );
  });
  it('isolation: failed prerequisite blocks only its dependent mutation', async () => {
    let mutations = 0;
    await assert.rejects(
      executeScenario(
        'CONTROL-blocked-dependency',
        'ADMIN',
        ['Require missing positive control'],
        () =>
          Promise.resolve().then(() => {
            currentScope!.require(
              'positive-event',
              false,
              'Recorded primary fixture failure',
            );
            mutations += 1;
          }),
      ),
      PreconditionBlocked,
    );
    check(mutations, 0);
    check(controlMatrix.at(-1)?.result, 'BLOCKED');
    const healthy = await login(screens[1]);
    await healthy.context.close();
  }, 45000);
  it('isolation: retained request failure closes only its owned context', async () => {
    const unaffected = await login(screens[1]);
    let failed: Awaited<ReturnType<typeof login>> | undefined;
    let retained: Awaited<ReturnType<typeof hold>> | undefined;
    await executeScenario(
      'CONTROL-retained-request-failure',
      'ADMIN',
      ['Hold real response', 'Fail before caller cleanup'],
      async () => {
        failed = await login(screens[1]);
        await failed.page.getByRole('combobox').selectOption(otherBranchId);
        retained = await hold(failed.page, screens[1].rest);
        await failed.page.getByRole('combobox').selectOption(branchId);
        await retained.captured;
        throw new Error('Injected owned-scenario failure');
      },
    ).catch((error: Error) =>
      assert.match(error.message, /Injected owned-scenario failure/),
    );
    try {
      check(
        failed!.context.pages().length,
        0,
        'Scenario failure must close its own context and cancel held routes',
      );
      check(browser.isConnected(), true);
      check(
        (await json('auth/me', 'GET', undefined, unaffected.token)).status,
        200,
      );
      await unaffected.page.getByText('Conectado', { exact: true }).waitFor();
      const healthy = await login(screens[1]);
      await healthy.context.close();
    } finally {
      await unaffected.context.close();
      retained?.release();
      await failed?.context.close();
    }
  }, 45000);
  it('stability: failed login closes only its owned context', async () => {
    const who = await actor();
    await assert.rejects(
      login(screens[1], { ...who, password: 'invalid-disposable-password' }),
      /Timed out: real UI login response/,
    );
    const failed = contexts.at(-1)!;
    check(
      failed.pages().length,
      0,
      'Failed login must release its owned context',
    );
    check(
      browser.isConnected(),
      true,
      'An independent browser must remain available',
    );
    const valid = await login(screens[1], who);
    try {
      check((await json('auth/me', 'GET', undefined, valid.token)).status, 200);
    } finally {
      await valid.context.close();
    }
  }, 45000);
  for (const mode of ['A', 'B', 'C', 'D', 'E-headers', 'E-body']) {
    it(
      'assurance Pedidos ' + mode,
      async () => {
        await executeScenario(
          'CONTROL-Pedidos-assurance-' + mode,
          'ADMIN UI',
          [],
          (row) => ordersRecovery(row, mode),
        );
      },
      69000,
    );
  }
  if (process.env.UAT_PEDIDOS_MUTANT)
    it('assurance detector negative', async () => {
      await executeScenario(
        'CONTROL-Pedidos-detector-negative',
        'ADMIN UI',
        [],
        (row) => ordersRecovery(row, 'B2', process.env.UAT_PEDIDOS_MUTANT),
      );
    }, 69000);
  it('stability: two independent real sessions with delayed unchanged login', async () => {
    const who = await actor();
    let first: Awaited<ReturnType<typeof login>> | undefined;
    let second: Awaited<ReturnType<typeof login>> | undefined;
    try {
      first = await login(screens[1], who);
      second = await login(screens[1], who, 750);
      assert.notEqual(first.sessionId, second.sessionId);
      check((await json('auth/me', 'GET', undefined, first.token)).status, 200);
      check(
        (await json('auth/me', 'GET', undefined, second.token)).status,
        200,
      );
      saved('two-session-login-proof', {
        independentSessions: true,
        realUnchangedResponse: true,
        delayMs: 750,
        authorizedBoth: true,
      });
    } finally {
      // Also owns contexts created by login if login failed before returning.
      for (const c of contexts) await c.close().catch(() => {});
    }
  }, 45000);
  it('fleet lifecycle: authorized server disconnect recovers missed cancellation without replay', async () => {
    const f = await h.fixture();
    const vehicle = await h.prisma.vehicle.create({
      data: {
        code: h.key(),
        displayName: 'UAT server-disconnect vehicle',
        homeLocationId: h.cedisId,
      },
    });
    const driver = await actor('DRIVER');
    const created = await h.post('delivery-routes', {
      name: 'UAT bounded server recovery',
      driverId: driver.id,
      vehicleId: vehicle.id,
      scheduledDate: new Date().toISOString(),
      originLocationId: h.cedisId,
      routeStockLocationId: f.stockId,
      orders: [
        {
          saleId: f.saleId,
          deliveryAddress: 'Synthetic server-recovery destination',
        },
      ],
    });
    check(created.status, 201);
    const id = data<{ id: string }>(created).id;
    check(
      (await h.patch(`delivery-routes/${id}/status`, { status: 'IN_PROGRESS' }))
        .status,
      200,
    );
    const p = await login(screens[0]);
    const old = await hold(p.page, screens[0].rest);
    const auth = await hold(p.page, '/api/auth/me');
    try {
      await p.page
        .getByTestId('fleet-unit-button')
        .filter({ hasText: vehicle.code })
        .waitFor();
      await p.page.getByRole('button', { name: 'Recuperar snapshot' }).click();
      await old.captured;
      const sockets = h.app.get(FleetGateway).server.sockets as unknown as Map<
        string,
        { disconnect(close: boolean): void }
      >;
      check(sockets.size, 1, 'Only this real Fleet page subscribes');
      const cut = Date.now();
      for (const socket of sockets.values()) socket.disconnect(false);
      await auth.captured;
      check(
        (await h.patch(`delivery-routes/${id}/status`, { status: 'CANCELLED' }))
          .status,
        200,
      );
      check(
        (await h.prisma.deliveryRoute.findUniqueOrThrow({ where: { id } }))
          .status,
        'CANCELLED',
      );
      check(
        frames.filter(
          (f) =>
            f.label === p.label &&
            Number(f.at) > cut &&
            f.event === 'fleet.route.updated' &&
            JSON.stringify(f.value).includes('CANCELLED'),
        ).length,
        0,
        'Cancellation event must actually be missed',
      );
      auth.release();
      await until(
        async () =>
          (await p.page
            .getByTestId('fleet-unit-button')
            .filter({ hasText: vehicle.code })
            .count()) === 0,
        'authoritative REST after valid same-token server recovery',
      );
      old.release();
      await sleep(300);
      check(
        await p.page
          .getByTestId('fleet-unit-button')
          .filter({ hasText: vehicle.code })
          .count(),
        0,
      );
      saved('fleet-server-disconnect-proof', {
        connectedBefore: true,
        forcedNamespaceDisconnect: true,
        mutationHTTP: 200,
        database: 'CANCELLED',
        missedEvent: true,
        restRecovered: true,
        staleResponseIgnored: true,
      });
    } finally {
      auth.release();
      old.release();
      await p.context.close();
    }
  }, 45000);
  it('stability: isolated original Fleet A3 offline cancellation', async () => {
    const f = await h.fixture();
    const vehicle = await h.prisma.vehicle.create({
      data: {
        code: h.key(),
        displayName: 'UAT server-disconnect vehicle',
        homeLocationId: h.cedisId,
      },
    });
    const driver = await actor('DRIVER');
    const created = await h.post('delivery-routes', {
      name: 'UAT bounded server recovery',
      driverId: driver.id,
      vehicleId: vehicle.id,
      scheduledDate: new Date().toISOString(),
      originLocationId: h.cedisId,
      routeStockLocationId: f.stockId,
      orders: [
        {
          saleId: f.saleId,
          deliveryAddress: 'Synthetic server-recovery destination',
        },
      ],
    });
    check(created.status, 201);
    const routeId = data<{ id: string }>(created).id;
    const vehicleCode = vehicle.code;
    check(
      (
        await h.patch(`delivery-routes/${routeId}/status`, {
          status: 'IN_PROGRESS',
        })
      ).status,
      200,
    );

    await executeScenario(
      'CONTROL-isolated-A3',
      'ADMIN real Fleet page',
      [
        'Hold old live snapshot',
        'Disconnect transport',
        'Cancel real route with authorized version-independent status command',
        'Reconnect and recover REST',
        'Release old route snapshot and verify cancelled unit does not return',
      ],
      async (row) => {
        const p = await login(screens[0]),
          old = await hold(p.page, screens[0].rest);
        try {
          await p.page
            .getByRole('button', { name: 'Recuperar snapshot' })
            .click();
          await old.captured;
          row.oldResponse = old.snapshot;
          const cutAt = Date.now();
          await p.context.setOffline(true);
          await until(
            () =>
              frames.some(
                (f) =>
                  f.label === p.label &&
                  f.kind === 'transport-close' &&
                  Number(f.at) >= cutAt,
              ),
            'Fleet transport actually closed',
          );
          row.transportCutAt = cutAt;
          check(
            (
              await h.patch(`delivery-routes/${routeId}/status`, {
                status: 'CANCELLED',
              })
            ).status,
            200,
          );
          check(
            (
              await h.prisma.deliveryRoute.findUniqueOrThrow({
                where: { id: routeId },
              })
            ).status,
            'CANCELLED',
          );
          await p.context.setOffline(false);
          await until(
            async () =>
              (await p.page
                .getByTestId('fleet-unit-button')
                .filter({ hasText: vehicleCode })
                .count()) === 0,
            'cancelled route removed',
          );
          old.release();
          await sleep(500);
          check(
            await p.page
              .getByTestId('fleet-unit-button')
              .filter({ hasText: vehicleCode })
              .count(),
            0,
          );
          await snap(p.page, 'A3-fleet-route-removed', row);
        } finally {
          old.release();
          await p.context.close();
        }
      },
    );
    check(controlMatrix.at(-1)?.result, 'PASS');
  }, 45000);
});
