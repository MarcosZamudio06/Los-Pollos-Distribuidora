import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import type { OperationalLocation, Role, User } from '@prisma/client';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { PrismaService } from '../src/database/prisma.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { UsersService } from '../src/modules/users/users.service';
import { UsersController } from '../src/modules/users/users.controller';
import { AccessControlService } from '../src/modules/access-control/access-control.service';
import { AccessControlController } from '../src/modules/access-control/access-control.controller';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../src/common/guards/permissions.guard';
import { SessionRevocationRegistry } from '../src/common/session/session-revocation.registry';
import { FleetGateway } from '../src/modules/fleet/fleet.gateway';
import { SalesGateway } from '../src/modules/sales/sales.gateway';
import { CedisGateway } from '../src/modules/cedis/cedis.gateway';
import { DeliveryService } from '../src/modules/delivery/delivery.service';
import { RouteSettlementsController } from '../src/modules/delivery/route-settlements.controller';
import { InventoryBalanceService } from '../src/modules/inventory/inventory-balance.service';
import {
  ROLE_PERMISSION_KEYS,
  PERMISSION_DEFINITIONS,
} from '../src/common/authorization/permissions';
import { configureHttpApplication } from '../src/bootstrap/configure-http-application';
import { assertDisposableE2eEnvironment } from './e2e-environment';

// The frontend already pins the real client; do not add a backend runtime dependency.
type Packet = { marker?: string; id?: string; transferId?: string };
interface TestSocket {
  connected: boolean;
  recovered?: boolean;
  io: {
    engine: { close(): void };
    socket(path: string, options: unknown): TestSocket;
  };
  connect(): void;
  disconnect(): void;
  once(event: 'connect', callback: () => void): void;
  once(event: 'connect_error', callback: (error: Error) => void): void;
  on(event: string, callback: (packet: Packet) => void): void;
  off(event: string, callback: (packet: Packet) => void): void;
}
const { io } = createRequire(resolve(__dirname, '../../frontend/package.json'))(
  'socket.io-client',
) as { io: (url: string, options: unknown) => TestSocket };
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const namespaces = [
  { name: 'Fleet', path: '/fleet', event: 'fleet.route.updated' },
  { name: 'Sales', path: '/sales', event: 'sale.created' },
  { name: 'CEDIS', path: '/cedis', event: 'cedis.supply.created' },
] as const;

describe('SEC-001/002 real PostgreSQL, Nest HTTP, JWT and Socket.IO', () => {
  jest.setTimeout(20000);
  const prisma = new PrismaService();
  const password = `Synthetic-${randomUUID()}`;
  let hash: string;
  let location: OperationalLocation;
  let app: NestExpressApplication;
  let base: string;
  const roles: Record<string, Role> = {};
  const clients: TestSocket[] = [];

  async function start() {
    const config = new ConfigService({
      NODE_ENV: 'production',
      SWAGGER_ENABLED: false,
      CORS_ORIGINS: ['https://fixture.invalid'],
    });
    const module = await Test.createTestingModule({
      controllers: [
        AuthController,
        UsersController,
        AccessControlController,
        RouteSettlementsController,
      ],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        AuthService,
        UsersService,
        AccessControlService,
        JwtService,
        SessionRevocationRegistry,
        FleetGateway,
        SalesGateway,
        CedisGateway,
        DeliveryService,
        InventoryBalanceService,
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApplication(app, config);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  }
  async function req(
    path: string,
    method = 'GET',
    body?: unknown,
    token?: string,
    cookie?: string,
    headers: Record<string, string> = {},
  ) {
    const response = await fetch(base + '/api' + path, {
      method,
      headers: {
        ...headers,
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  async function employee(role = 'ADMIN') {
    const uid = randomUUID();
    return prisma.user.create({
      data: {
        name: 'Synthetic security actor',
        email: `${uid}@fixture.invalid`,
        controlNumber: uid,
        phone: uid,
        passwordHash: hash,
        roleId: roles[role].id,
        operationalLocationId: location.id,
      },
    });
  }
  async function login(user: Pick<User, 'email'>) {
    const response = await req('/auth/login', 'POST', {
      email: user.email,
      password,
    });
    expect(response.status).toBe(200);
    return {
      token: response.body.data.accessToken as string,
      cookie: response.cookie!,
    };
  }
  function createBody(role: string) {
    return {
      name: 'Synthetic employee',
      email: `${randomUUID()}@fixture.invalid`,
      phone: '55' + String(Date.now()).slice(-10),
      roleId: roles[role].id,
      operationalLocationId: location.id,
    };
  }
  async function connect(ns: (typeof namespaces)[number], token: string) {
    const client = io(base + ns.path, {
      path: '/api/socket.io',
      auth: { token, locationId: location.id },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      timeout: 2000,
    });
    clients.push(client);
    await new Promise<void>((done, fail) => {
      client.once('connect', done);
      client.once('connect_error', fail);
    });
    await delay(30);
    return client;
  }
  function emit(ns: (typeof namespaces)[number], marker: string) {
    if (ns.name === 'Fleet') app.get(FleetGateway).emitRouteUpdated({ marker });
    if (ns.name === 'Sales')
      app.get(SalesGateway).emitSaleCreated({
        id: marker,
        saleNumber: marker,
        createdAt: new Date().toISOString(),
        location: { id: location.id, name: location.name },
        customer: null,
        items: [],
        total: '0.00',
        status: 'CONFIRMED',
      });
    if (ns.name === 'CEDIS')
      app.get(CedisGateway).emitSupplyCreated({
        transferId: marker,
        transferNumber: marker,
        cycleId: marker,
        businessDate: '2026-11-01',
        requestedAt: null,
        origin: { id: location.id, name: location.name },
        destination: { id: location.id, name: location.name },
      });
  }
  async function delivery(
    ns: (typeof namespaces)[number],
    pairs: Array<[TestSocket, boolean]>,
  ) {
    const marker = randomUUID();
    const received = pairs.map(
      ([s]) =>
        new Promise<boolean>((done) => {
          const timer = setTimeout(() => {
            s.off(ns.event, handler);
            done(false);
          }, 160);
          const handler = (p: Packet) => {
            if ([p.marker, p.id, p.transferId].includes(marker)) {
              clearTimeout(timer);
              s.off(ns.event, handler);
              done(true);
            }
          };
          s.on(ns.event, handler);
        }),
    );
    emit(ns, marker); // Always attempt the protected emission, even for disconnected clients.
    const outcomes = await Promise.all(received);
    expect(outcomes).toEqual(pairs.map(([, expected]) => expected));
  }
  async function expectRejected(
    ns: (typeof namespaces)[number],
    token: string,
  ) {
    const s = io(base + ns.path, {
      path: '/api/socket.io',
      auth: { token, locationId: location.id },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(s);
    const result = await new Promise<string>((done) => {
      const t = setTimeout(() => done('timeout'), 1000);
      s.once('connect_error', () => {
        clearTimeout(t);
        done('rejected');
      });
      // Legacy connection-time authentication accepts and then disconnects: RED must distinguish it.
      s.once('connect', () => {
        clearTimeout(t);
        done('accepted');
      });
    });
    expect(result).toBe('rejected');
  }
  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    await prisma.$connect();
    hash = await bcrypt.hash(password, 12);
    const parent = await prisma.operationalLocation.create({
      data: {
        name: 'Synthetic security CEDIS',
        code: randomUUID(),
        type: 'DISTRIBUTION_CENTER',
      },
    });
    location = await prisma.operationalLocation.create({
      data: {
        name: 'Synthetic security branch',
        code: randomUUID(),
        type: 'BRANCH',
        parentId: parent.id,
      },
    });
    for (const definition of PERMISSION_DEFINITIONS)
      await prisma.permission.upsert({
        where: { key: definition.key },
        create: definition,
        update: {},
      });
    for (const [name, keys] of Object.entries(ROLE_PERMISSION_KEYS)) {
      roles[name] = await prisma.role.upsert({
        where: { name },
        create: { name },
        update: {},
      });
      const effective = name === 'SELLER' ? ['users.manage'] : keys;
      await prisma.rolePermission.deleteMany({
        where: { roleId: roles[name].id },
      });
      const ps = await prisma.permission.findMany({
        where: { key: { in: [...effective] } },
      });
      await prisma.rolePermission.createMany({
        data: ps.map((p) => ({ roleId: roles[name].id, permissionId: p.id })),
      });
    }
    await employee(); // Keep a separate security administrator throughout the suite.
    await start();
  });
  afterEach(() => {
    for (const s of clients.splice(0)) s.disconnect();
  });
  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  it.each(['ADMIN', 'WAREHOUSE', 'BILLING'])(
    'denies limited create of %s without persisted user/credential/session changes',
    async (role) => {
      const actor = await employee('SELLER');
      const auth = await login(actor);
      const body = createBody(role);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: actor.id },
      });
      const response = await req(
        '/users',
        'POST',
        {
          ...body,
          permissions: Object.values(ROLE_PERMISSION_KEYS).flat(),
          role: 'ADMIN',
        },
        auth.token,
      );
      expect(response.status).toBe(403);
      expect(
        await prisma.user.findUnique({ where: { email: body.email } }),
      ).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: actor.id } })).toEqual(
        before,
      );
      expect(JSON.stringify(response.body)).not.toContain('temporaryPassword');
    },
  );
  it.each(['ADMIN', 'WAREHOUSE'])(
    'denies reset of stronger %s without hash/version/session mutation',
    async (role) => {
      const actor = await employee('SELLER');
      const target = await employee(role);
      const auth = await login(actor);
      await login(target);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      const sessions = await prisma.authSession.findMany({
        where: { userId: target.id },
      });
      expect(
        (
          await req(
            `/users/${target.id}/password`,
            'PATCH',
            { temporaryPassword: `New-${randomUUID()}` },
            auth.token,
          )
        ).status,
      ).toBe(403);
      expect(
        await prisma.user.findUnique({ where: { id: target.id } }),
      ).toEqual(before);
      expect(
        await prisma.authSession.findMany({ where: { userId: target.id } }),
      ).toEqual(sessions);
    },
  );
  it('denies indirect own profile changes', async () => {
    const actor = await employee('SELLER');
    const auth = await login(actor);
    expect(
      (
        await req(
          `/users/${actor.id}`,
          'PATCH',
          { roleId: roles.ADMIN.id },
          auth.token,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await req(
          `/users/${actor.id}/access-profile`,
          'PATCH',
          {
            roleId: roles.ADMIN.id,
            expectedRoleId: roles.SELLER.id,
            reason: 'Synthetic escalation probe',
          },
          auth.token,
        )
      ).status,
    ).toBe(403);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })).roleId,
    ).toBe(roles.SELLER.id);
  });
  it.each(['SELLER', 'ADMIN'])(
    'preserves authorized creation and reset for %s actor',
    async (role) => {
      const actor = await employee(role);
      const auth = await login(actor);
      const body = createBody(role);
      const created = await req('/users', 'POST', body, auth.token);
      expect(created.status).toBe(201);
      const target = created.body.data;
      expect(target.temporaryPassword).toBeTruthy();
      expect(
        (
          await req('/auth/login', 'POST', {
            email: body.email,
            password: target.temporaryPassword,
          })
        ).status,
      ).toBe(200);
      const replacement = `New-${randomUUID()}`;
      expect(
        (
          await req(
            `/users/${target.id}/password`,
            'PATCH',
            { temporaryPassword: replacement },
            auth.token,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await req('/auth/login', 'POST', {
            email: body.email,
            password: replacement,
          })
        ).status,
      ).toBe(200);
      const audit = await prisma.accessControlAuditLog.findMany({
        where: { targetId: target.id },
      });
      expect(audit.map((a) => a.action)).toEqual(
        expect.arrayContaining(['USER_CREATED', 'USER_PASSWORD_RESET']),
      );
      expect(JSON.stringify(audit)).not.toMatch(
        /passwordHash|temporaryPassword|refreshToken/,
      );
    },
  );

  for (const ns of namespaces) {
    it(`${ns.name}: concurrent refresh/logout has no delivery after both persistence boundaries`, async () => {
      const user = await employee();
      const a = await login(user);
      const b = await login(user);
      const socket = await connect(ns, a.token);
      const control = await connect(ns, b.token);
      await delivery(ns, [
        [socket, true],
        [control, true],
      ]);
      const [logout, refreshed] = await Promise.all([
        req('/auth/logout', 'POST', {}, a.token),
        req('/auth/refresh', 'POST', undefined, undefined, a.cookie),
      ]);
      expect(logout.status).toBe(200);
      expect([200, 401]).toContain(refreshed.status);
      await delivery(ns, [
        [socket, false],
        [control, true],
      ]);
      await expectRejected(ns, a.token);
      if (refreshed.status === 200)
        await expectRejected(ns, refreshed.body.data.accessToken);
    });
    it.each(['absolute', 'idle'])(
      `${ns.name}: %s session expiry stops protected delivery`,
      async (kind) => {
        const key =
          kind === 'absolute'
            ? 'AUTH_SESSION_ABSOLUTE_TTL_SECONDS'
            : 'AUTH_SESSION_IDLE_TTL_SECONDS';
        const previous = process.env[key];
        process.env[key] = '1';
        try {
          const user = await employee();
          const auth = await login(user);
          const socket = await connect(ns, auth.token);
          await delivery(ns, [[socket, true]]);
          const session = await prisma.authSession.findFirstOrThrow({
            where: { userId: user.id },
          });
          const expires =
            kind === 'absolute'
              ? session.absoluteExpiresAt.getTime()
              : session.lastUsedAt.getTime() + 1000;
          await delay(Math.max(0, expires - Date.now() + 10));
          await delivery(ns, [[socket, false]]);
          expect(
            (await req('/auth/me', 'GET', undefined, auth.token)).status,
          ).toBe(401);
        } finally {
          if (previous === undefined) delete process.env[key];
          else process.env[key] = previous;
        }
      },
    );
    it(`${ns.name}: permission mutation invalidates connections before subsequent emission`, async () => {
      const actor = await employee();
      const auth = await login(actor);
      const socket = await connect(ns, auth.token);
      await delivery(ns, [[socket, true]]);
      const profile = await prisma.role.findUniqueOrThrow({
        where: { id: roles.ADMIN.id },
      });
      const cost = await prisma.permission.findUniqueOrThrow({
        where: { key: 'costs.read' },
      });
      try {
        expect(
          (
            await req(
              `/roles/${profile.id}/permissions`,
              'PATCH',
              {
                expectedVersion: profile.version,
                permissionKeys: ROLE_PERMISSION_KEYS.ADMIN.filter(
                  (p) => p !== 'costs.read',
                ),
                reason: 'Synthetic permission revocation',
              },
              auth.token,
            )
          ).status,
        ).toBe(200);
        await delivery(ns, [[socket, false]]);
        await expectRejected(ns, auth.token);
      } finally {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: profile.id, permissionId: cost.id },
          },
          create: { roleId: profile.id, permissionId: cost.id },
          update: {},
        });
      }
    });
    it(`${ns.name}: transport loss never replays protected pre-revocation buffers`, async () => {
      const user = await employee();
      const a = await login(user);
      const b = await login(user);
      const socket = await connect(ns, a.token);
      const control = await connect(ns, b.token);
      await delivery(ns, [
        [socket, true],
        [control, true],
      ]);
      socket.io.engine.close();
      await delay(40);
      expect((await req('/auth/logout', 'POST', {}, a.token)).status).toBe(200);
      await delivery(ns, [
        [socket, false],
        [control, true],
      ]);
      const packets: unknown[] = [];
      socket.on(ns.event, (packet: unknown) => packets.push(packet));
      socket.connect();
      await delay(150);
      expect(socket.connected).toBe(false);
      expect(packets).toHaveLength(0);
      const valid = await connect(ns, b.token);
      expect(valid.recovered).toBeUndefined(); // No recovery negotiation/pid when the feature is disabled.
      await delivery(ns, [[valid, true]]);
    });
    it.each(['logout', 'refresh-reuse', 'jwt-expiry'])(
      `${ns.name}: %s has no post-boundary delivery; another session remains valid`,
      async (cause) => {
        const user = await employee();
        const a = await login(user);
        const b = await login(user);
        let token = a.token;
        if (cause === 'jwt-expiry') {
          const payload = app.get(JwtService).decode(a.token);
          delete payload.exp;
          delete payload.iat;
          token = await app.get(JwtService).signAsync(payload, {
            secret: process.env.JWT_ACCESS_SECRET,
            expiresIn: '2s',
          });
        }
        const sa = await connect(ns, token);
        const sb = await connect(ns, b.token);
        await delivery(ns, [
          [sa, true],
          [sb, true],
        ]); // Neither an unauthenticated socket nor a missing emission counts.
        if (cause === 'logout')
          expect((await req('/auth/logout', 'POST', {}, a.token)).status).toBe(
            200,
          );
        if (cause === 'refresh-reuse') {
          expect(
            (await req('/auth/refresh', 'POST', undefined, undefined, a.cookie))
              .status,
          ).toBe(200);
          expect(
            (await req('/auth/refresh', 'POST', undefined, undefined, a.cookie))
              .status,
          ).toBe(401);
        }
        if (cause === 'jwt-expiry')
          await delay(
            Math.max(
              0,
              app.get(JwtService).decode(token).exp * 1000 - Date.now() + 20,
            ),
          );
        // Boundary is completed persisted revocation+notification, or absolute JWT expiration, never a pre-boundary packet.
        await delivery(ns, [
          [sa, false],
          [sb, true],
        ]);
        expect((await req('/auth/me', 'GET', undefined, token)).status).toBe(
          401,
        );
        await expectRejected(ns, token);
        const validReconnect = await connect(ns, b.token);
        await delivery(ns, [[validReconnect, true]]);
      },
    );
    it.each(['password', 'disable', 'role'])(
      `${ns.name}: %s invalidates active connections and room access`,
      async (cause) => {
        const actor = await employee();
        const actorAuth = await login(actor);
        const victim = await employee();
        const victimAuth = await login(victim);
        const sa = await connect(ns, victimAuth.token);
        const control = await connect(ns, actorAuth.token);
        await delivery(ns, [
          [sa, true],
          [control, true],
        ]);
        const response =
          cause === 'password'
            ? await req(
                '/auth/change-password',
                'POST',
                {
                  currentPassword: password,
                  newPassword: `New-${randomUUID()}`,
                },
                victimAuth.token,
              )
            : cause === 'disable'
              ? await req(
                  `/users/${victim.id}`,
                  'DELETE',
                  { reason: 'Synthetic deactivation' },
                  actorAuth.token,
                )
              : await req(
                  `/users/${victim.id}/access-profile`,
                  'PATCH',
                  {
                    roleId: roles.BILLING.id,
                    expectedRoleId: roles.ADMIN.id,
                    reason: 'Synthetic reassignment',
                  },
                  actorAuth.token,
                );
        expect(response.status).toBe(200);
        await delivery(ns, [
          [sa, false],
          [control, true],
        ]);
        await expectRejected(ns, victimAuth.token);
      },
    );
  }
  it('rechecks persisted authority after a competing access transaction wins the lock', async () => {
    const actor = await employee('SELLER');
    const auth = await login(actor);
    const body = createBody('SELLER');
    const manage = await prisma.permission.findUniqueOrThrow({
      where: { key: 'users.manage' },
    });
    let pending!: ReturnType<typeof req>;
    let waiterObserved = false;
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(1397048065::bigint)`;
          pending = req('/users', 'POST', body, auth.token);
          for (let i = 0; i < 60; i++) {
            const rows = await tx.$queryRaw<
              Array<{ waiting: boolean }>
            >`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=1397048065 AND NOT granted) AS waiting`;
            if (rows[0].waiting) {
              waiterObserved = true;
              break;
            }
            await delay(10);
          }
          // Fixture mutation deliberately leaves the signed principal stale. The service must read DB authority.
          await tx.rolePermission.delete({
            where: {
              roleId_permissionId: {
                roleId: roles.SELLER.id,
                permissionId: manage.id,
              },
            },
          });
        },
        { timeout: 5000 },
      );
      const response = await pending;
      expect(waiterObserved).toBe(true);
      expect(response.status).toBe(403);
      expect(
        await prisma.user.findUnique({ where: { email: body.email } }),
      ).toBeNull();
    } finally {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: roles.SELLER.id,
            permissionId: manage.id,
          },
        },
        create: { roleId: roles.SELLER.id, permissionId: manage.id },
        update: {},
      });
    }
  });
  it('does not perform session database reads per protected event', async () => {
    const auth = await login(await employee());
    const socket = await connect(namespaces[0], auth.token);
    await delivery(namespaces[0], [[socket, true]]);
    const reads = jest.spyOn(prisma.authSession, 'findUnique');
    const before = reads.mock.calls.length;
    const started = performance.now();
    for (let i = 0; i < 1000; i++) emit(namespaces[0], randomUUID());
    expect(reads.mock.calls.length - before).toBe(0);
    console.log(
      JSON.stringify({
        measurement: '1000 protected publications',
        sessionQueries: 0,
        elapsedMs: Math.round(performance.now() - started),
      }),
    );
    reads.mockRestore();
  });
  it('preserves session B in a different namespace sharing the same Engine.IO connection', async () => {
    const user = await employee();
    const a = await login(user);
    const b = await login(user);
    const fleet = io(base + '/fleet', {
      path: '/api/socket.io',
      auth: { token: a.token },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(fleet);
    await new Promise<void>((done, fail) => {
      fleet.once('connect', done);
      fleet.once('connect_error', fail);
    });
    const sales = fleet.io.socket('/sales', {
      auth: { token: b.token, locationId: location.id },
    });
    clients.push(sales);
    await new Promise<void>((done, fail) => {
      sales.once('connect', done);
      sales.once('connect_error', fail);
      sales.connect();
    });
    await delay(30);
    expect(sales.io).toBe(fleet.io);
    await delivery(namespaces[0], [[fleet, true]]);
    await delivery(namespaces[1], [[sales, true]]);
    expect((await req('/auth/logout', 'POST', {}, a.token)).status).toBe(200);
    await delivery(namespaces[0], [[fleet, false]]);
    await delivery(namespaces[1], [[sales, true]]);
    expect(sales.connected).toBe(true);
  });
  it('retains durable revocations and authorized audit across an application restart', async () => {
    const actor = await employee();
    const auth = await login(actor);
    const body = createBody('DRIVER');
    const created = await req('/users', 'POST', body, auth.token);
    expect(created.status).toBe(201);
    expect((await req('/auth/logout', 'POST', {}, auth.token)).status).toBe(
      200,
    );
    await app.close();
    await start();
    expect((await req('/auth/me', 'GET', undefined, auth.token)).status).toBe(
      401,
    );
    expect(
      await prisma.accessControlAuditLog.count({
        where: { targetId: created.body.data.id, actorUserId: actor.id },
      }),
    ).toBe(1);
    expect(
      await prisma.authSession.count({
        where: { userId: actor.id, revokedAt: { not: null } },
      }),
    ).toBe(1);
  });
  it('preserves the last active security administrator', async () => {
    const survivor = await employee();
    const auth = await login(survivor);
    const others = await prisma.user.findMany({
      where: {
        isActive: true,
        roleId: roles.ADMIN.id,
        id: { not: survivor.id },
      },
      select: { id: true },
    });
    await prisma.user.updateMany({
      where: { id: { in: others.map((u) => u.id) } },
      data: { isActive: false },
    });
    try {
      expect(
        (
          await req(
            `/users/${survivor.id}`,
            'DELETE',
            { reason: 'Synthetic last-admin probe' },
            auth.token,
          )
        ).status,
      ).toBe(403);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: survivor.id } }))
          .isActive,
      ).toBe(true);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: others.map((u) => u.id) } },
        data: { isActive: true },
      });
    }
  });
  it('preserves ADMIN-only versioned/idempotent settlement reopening and financial state', async () => {
    const driver = await employee('DRIVER');
    const stock = await prisma.operationalLocation.create({
      data: {
        name: 'Synthetic route stock',
        code: randomUUID(),
        type: 'ROUTE_STOCK',
      },
    });
    const route = await prisma.deliveryRoute.create({
      data: {
        name: 'Synthetic settlement route',
        driverId: driver.id,
        scheduledDate: new Date(),
        status: 'COMPLETED',
        routeStockLocationId: stock.id,
        originLocationId: location.id,
      },
    });
    const settlement = await prisma.routeSettlement.create({
      data: {
        routeId: route.id,
        driverId: driver.id,
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
    const moneyBefore = await prisma.payment.count();
    const inventoryBefore = await prisma.inventoryMovement.count();
    const body = {
      reason: 'Synthetic administrative reopening',
      expectedVersion: settlement.version,
    };
    for (const role of ['SELLER', 'DRIVER', 'WAREHOUSE', 'COLLECTIONS']) {
      const auth = await login(await employee(role));
      expect(
        (
          await req(
            `/route-settlements/${settlement.id}/reopen`,
            'POST',
            body,
            auth.token,
            undefined,
            { 'Idempotency-Key': randomUUID() },
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await prisma.routeSettlement.findUniqueOrThrow({
            where: { id: settlement.id },
          })
        ).status,
      ).toBe('CLOSED');
    }
    const actor = await employee();
    const auth = await login(actor);
    const headers = { 'Idempotency-Key': randomUUID() };
    const opened = await req(
      `/route-settlements/${settlement.id}/reopen`,
      'POST',
      body,
      auth.token,
      undefined,
      headers,
    );
    expect(opened.status).toBe(201);
    expect(opened.body.data.status).toBe('OPEN');
    expect(
      (
        await req(
          `/route-settlements/${settlement.id}/reopen`,
          'POST',
          body,
          auth.token,
          undefined,
          headers,
        )
      ).body,
    ).toEqual(opened.body);
    const persisted = await prisma.routeSettlement.findUniqueOrThrow({
      where: { id: settlement.id },
    });
    expect(persisted.reopenedByUserId).toBe(actor.id);
    expect(persisted.version).toBe(settlement.version + 1);
    expect(
      await prisma.routeSettlementOpeningCommand.count({
        where: { settlementId: settlement.id },
      }),
    ).toBe(1);
    expect(await prisma.payment.count()).toBe(moneyBefore);
    expect(await prisma.inventoryMovement.count()).toBe(inventoryBefore);
  });
  it('uses only the runner-owned disposable S3 endpoint for a bounded object round trip', async () => {
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT!;
    expect(new URL(endpoint).hostname).toBe('127.0.0.1');
    expect(process.env.OBJECT_STORAGE_BUCKET).toBe('security-evidence');
    const client = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.OBJECT_STORAGE_ACCESS_KEY_ID!,
        secretAccessKey: process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY!,
      },
    });
    const Bucket = 'security-evidence';
    const Key = `synthetic-security/${randomUUID()}`;
    try {
      await client.send(new CreateBucketCommand({ Bucket }));
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key,
          Body: 'synthetic-security-fixture',
          ContentType: 'text/plain',
        }),
      );
      const object = await client.send(new GetObjectCommand({ Bucket, Key }));
      expect(await object.Body!.transformToString()).toBe(
        'synthetic-security-fixture',
      );
      expect(object.ContentType).toBe('text/plain');
    } finally {
      await client.send(new DeleteObjectCommand({ Bucket, Key }));
      client.destroy();
    }
  });
  // Remediation002: retained original assertions above; all races use synthetic rows.
  it.each(['PATCH', 'DELETE'])(
    'REV-001 rejects queued %s after actor revocation without partial writes',
    async (method) => {
      const actor = await employee('SELLER');
      const target = await employee('DRIVER');
      const auth = await login(actor);
      const before = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
      });
      let pending!: ReturnType<typeof req>;
      let waiting = false;
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(1397048065::bigint)`;
          pending = req(
            `/users/${target.id}`,
            method,
            method === 'PATCH'
              ? { name: 'Unauthorized queued write' }
              : { reason: 'Queued revoke probe' },
            auth.token,
          );
          for (let n = 0; n < 100; n++) {
            const rows = await tx.$queryRaw<
              Array<{ waiting: boolean }>
            >`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=1397048065 AND NOT granted) AS waiting`;
            if (rows[0].waiting) {
              waiting = true;
              break;
            }
            await delay(10);
          }
          expect(waiting).toBe(true);
          await tx.authSession.updateMany({
            where: { userId: actor.id },
            data: { revokedAt: new Date() },
          });
          await tx.user.update({
            where: { id: actor.id },
            data: { sessionVersion: { increment: 1 } },
          });
        },
        { timeout: 5000 },
      );
      expect([401, 403]).toContain((await pending).status);
      expect(
        await prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
      ).toEqual(before);
    },
  );
  it.each(['reset', 'disable', 'own'])(
    'REV-003 rejects delayed own password after competing %s',
    async (competing) => {
      const actor = await employee();
      const admin = await login(actor);
      const target = await employee('DRIVER');
      const auth = await login(target);
      const late = `Late-${randomUUID()}`,
        winner = `Winner-${randomUUID()}`;
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>((r) => (release = r)),
        reached = new Promise<void>((r) => (entered = r));
      const hashReal = bcrypt.hash.bind(bcrypt) as (
        p: string,
        n: number,
      ) => Promise<string>;
      const spy = jest
        .spyOn(
          bcrypt as unknown as {
            hash: (value: string, rounds: number) => Promise<string>;
          },
          'hash',
        )
        .mockImplementation(async (value: string, rounds: number) => {
          const result = await hashReal(value, rounds);
          if (value === late) {
            entered();
            await gate;
          }
          return result;
        });
      const pending = req(
        '/auth/change-password',
        'POST',
        { currentPassword: password, newPassword: late },
        auth.token,
      );
      try {
        await reached;
        const response =
          competing === 'reset'
            ? await req(
                `/users/${target.id}/password`,
                'PATCH',
                { temporaryPassword: winner },
                admin.token,
              )
            : competing === 'disable'
              ? await req(
                  `/users/${target.id}`,
                  'DELETE',
                  { reason: 'Concurrent security disable' },
                  admin.token,
                )
              : await req(
                  '/auth/change-password',
                  'POST',
                  { currentPassword: password, newPassword: winner },
                  auth.token,
                );
        expect(response.status).toBe(200);
        const confirmed = await prisma.user.findUniqueOrThrow({
          where: { id: target.id },
        });
        release();
        expect([401, 403, 409]).toContain((await pending).status);
        expect(
          await prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
        ).toEqual(confirmed);
        if (competing === 'reset') {
          expect(confirmed.mustChangePassword).toBe(true);
          await app.close();
          await start();
          expect(
            (
              await req('/auth/login', 'POST', {
                email: target.email,
                password: winner,
              })
            ).status,
          ).toBe(200);
          expect(
            (
              await req(
                '/auth/change-password',
                'POST',
                { currentPassword: password, newPassword: late },
                auth.token,
              )
            ).status,
          ).toBe(401);
        }
      } finally {
        release();
        spy.mockRestore();
        await pending;
      }
    },
  );
  it.each(['reassign', 'disable'])(
    'REV-004 preserves actual ADMIN during concurrent %s',
    async (operation) => {
      const previous = await prisma.user.findMany({
        where: { isActive: true, roleId: roles.ADMIN.id },
        select: { id: true },
      });
      const admins = [await employee(), await employee()];
      const auths = await Promise.all(admins.map(login));
      const backup = await employee('BILLING');
      const added: string[] = [];
      for (const key of ['users.manage', 'access_profiles.manage']) {
        const permission = await prisma.permission.findUniqueOrThrow({
          where: { key },
        });
        const exists = await prisma.rolePermission.findUnique({
          where: {
            roleId_permissionId: {
              roleId: roles.BILLING.id,
              permissionId: permission.id,
            },
          },
        });
        if (!exists) {
          await prisma.rolePermission.create({
            data: { roleId: roles.BILLING.id, permissionId: permission.id },
          });
          added.push(permission.id);
        }
      }
      await prisma.user.updateMany({
        where: { id: { in: previous.map((u) => u.id) } },
        data: { isActive: false },
      });
      try {
        const responses = await Promise.all(
          admins.map((user, n) =>
            operation === 'reassign'
              ? req(
                  `/users/${user.id}/access-profile`,
                  'PATCH',
                  {
                    roleId: roles.DRIVER.id,
                    expectedRoleId: roles.ADMIN.id,
                    reason: 'Last actual ADMIN concurrent probe',
                  },
                  auths[n].token,
                )
              : req(
                  `/users/${user.id}`,
                  'DELETE',
                  { reason: 'Last actual ADMIN concurrent probe' },
                  auths[n].token,
                ),
          ),
        );
        expect(responses.map((r) => r.status).sort()).toEqual([200, 403]);
        expect(
          await prisma.user.count({
            where: { isActive: true, roleId: roles.ADMIN.id },
          }),
        ).toBe(1);
        // The remaining sole ADMIN cannot self-reassign even with security-key holders elsewhere.
        const survivor = await prisma.user.findFirstOrThrow({
          where: { isActive: true, roleId: roles.ADMIN.id },
        });
        const session = await login(survivor);
        expect(
          (
            await req(
              `/users/${survivor.id}/access-profile`,
              'PATCH',
              {
                roleId: roles.DRIVER.id,
                expectedRoleId: roles.ADMIN.id,
                reason: 'Single ADMIN probe',
              },
              session.token,
            )
          ).status,
        ).toBe(403);
        expect(
          await prisma.user.count({
            where: { isActive: true, roleId: roles.ADMIN.id },
          }),
        ).toBe(1);
      } finally {
        await prisma.user.updateMany({
          where: { id: { in: previous.map((u) => u.id) } },
          data: { isActive: true },
        });
        await prisma.user.updateMany({
          where: { id: { in: admins.map((u) => u.id) } },
          data: { isActive: true, roleId: roles.ADMIN.id },
        });
        await prisma.rolePermission.deleteMany({
          where: { roleId: roles.BILLING.id, permissionId: { in: added } },
        });
        expect(backup.id).toBeTruthy();
      }
    },
  );
  it.each(namespaces)(
    'REV-002 $name accepts B handshake racing unrelated A logout',
    async (ns) => {
      const a = await login(await employee()),
        b = await login(await employee());
      const service = app.get(AuthService);
      const verify = service.verifyRealtimeSession.bind(service);
      let release!: () => void, entered!: () => void;
      const gate = new Promise<void>((r) => (release = r)),
        reached = new Promise<void>((r) => (entered = r));
      const spy = jest
        .spyOn(service, 'verifyRealtimeSession')
        .mockImplementation(async (token) => {
          const valid = await verify(token);
          if (token === b.token) {
            entered();
            await gate;
          }
          return valid;
        });
      const pending = connect(ns, b.token);
      void pending.catch(() => undefined);
      try {
        await reached;
        expect((await req('/auth/logout', 'POST', {}, a.token)).status).toBe(
          200,
        );
        release();
        const socket = await pending;
        await delivery(ns, [[socket, true]]);
      } finally {
        release();
        spy.mockRestore();
      }
    },
  );
  it('REV-002 real periodic validation isolates two users and two sessions across all namespaces', async () => {
    const users = [await employee(), await employee()];
    const auths = await Promise.all(
      users.flatMap((user) => [login(user), login(user)]),
    );
    const sockets = await Promise.all(
      namespaces.map((ns) =>
        Promise.all(auths.map((a) => connect(ns, a.token))),
      ),
    );
    const service = app.get(AuthService),
      verify = service.verifyRealtimeSession.bind(service);
    let release!: () => void,
      entered!: () => void,
      count = 0;
    const gate = new Promise<void>((r) => (release = r)),
      reached = new Promise<void>((r) => (entered = r));
    const spy = jest
      .spyOn(service, 'verifyRealtimeSession')
      .mockImplementation(async (token) => {
        const valid = await verify(token);
        if (token === auths[1].token) {
          if (++count === 3) entered();
          await gate;
        }
        return valid;
      });
    try {
      await reached;
      expect(
        (await req('/auth/logout', 'POST', {}, auths[0].token)).status,
      ).toBe(200);
      release();
      await delay(50);
      for (let n = 0; n < namespaces.length; n++)
        await delivery(
          namespaces[n],
          sockets[n].map((s, i) => [s, i !== 0]),
        );
    } finally {
      release();
      spy.mockRestore();
    }
  }, 45000);

  it('REV-004 preserves actual ADMIN security-management capability', async () => {
    await employee('SELLER'); // Independent live users.manage holder must exist.
    const auth = await login(await employee());
    const profile = await prisma.role.findUniqueOrThrow({
      where: { id: roles.ADMIN.id },
    });
    const permission = await prisma.permission.findUniqueOrThrow({
      where: { key: 'users.manage' },
    });
    try {
      const response = await req(
        `/roles/${profile.id}/permissions`,
        'PATCH',
        {
          expectedVersion: profile.version,
          permissionKeys: ROLE_PERMISSION_KEYS.ADMIN.filter(
            (p) => p !== 'users.manage',
          ),
          reason: 'Last role authority capability probe',
        },
        auth.token,
      );
      expect(response.status).toBe(403);
      expect(
        (await prisma.role.findUniqueOrThrow({ where: { id: profile.id } }))
          .version,
      ).toBe(profile.version);
    } finally {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: profile.id,
            permissionId: permission.id,
          },
        },
        create: { roleId: profile.id, permissionId: permission.id },
        update: {},
      });
    }
  });
  if (
    process.env.SECURITY_BROWSER_WS &&
    process.env.SECURITY_BROWSER_FRONTEND
  ) {
    it.each(namespaces)(
      'REV-005 Chromium $name recovers a missed persisted update and ignores late REST',
      async (ns) => {
        const frontend = process.env.SECURITY_BROWSER_FRONTEND!;
        const frontendRequire = createRequire(
          resolve(frontend, 'package.json'),
        );
        const { chromium, expect: browserExpect } =
          frontendRequire('@playwright/test');
        const reservation = createServer();
        await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r));
        const port = (reservation.address() as { port: number }).port;
        await new Promise<void>((r) => reservation.close(() => r()));
        const vite = spawn(
          'npm',
          [
            '--script-shell=/bin/sh',
            'run',
            'dev',
            '--',
            '--host',
            '0.0.0.0',
            '--port',
            String(port),
            '--strictPort',
          ],
          {
            cwd: frontend,
            env: {
              ...process.env,
              VITE_DEV_API_PROXY_TARGET: base,
              __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: 'host.docker.internal',
            },
            detached: true,
            stdio: 'ignore',
          },
        );
        let browser;
        let release!: () => void;
        try {
          let ready = false;
          for (let n = 0; n < 150; n++) {
            try {
              ready = (
                await fetch(
                  `http://127.0.0.1:${port}/e2e/security-recovery.html`,
                )
              ).ok;
            } catch {
              /* Wait for the owned Vite server to listen. */
            }
            if (ready) break;
            await delay(100);
          }
          expect(ready).toBe(true);
          browser = await chromium.connect(process.env.SECURITY_BROWSER_WS);
          const context = await browser.newContext();
          const page = await context.newPage();
          const actor = await employee();
          const auth = await login(actor);
          const target = await employee('DRIVER');
          await page.goto(
            `http://host.docker.internal:${port}/e2e/security-recovery.html`,
          );
          await page.waitForFunction(() =>
            Boolean(
              (window as unknown as { securityRecovery: unknown })
                .securityRecovery,
            ),
          );
          await page.evaluate(
            ({ name, token, loc, id }) =>
              (
                window as unknown as {
                  securityRecovery: { start: (...args: string[]) => void };
                }
              ).securityRecovery.start(name, token, loc, id),
            {
              name: ns.name,
              token: auth.token,
              loc: location.id,
              id: target.id,
            },
          );
          await browserExpect(page.locator('#state')).toHaveText(target.name);
          await page.waitForFunction(
            () =>
              (
                window as unknown as {
                  securityRecovery: { state: { connections: number } };
                }
              ).securityRecovery.state.connections > 0,
          );
          emit(ns, randomUUID());
          await page.waitForFunction(
            () =>
              (
                window as unknown as {
                  securityRecovery: { state: { events: number } };
                }
              ).securityRecovery.state.events > 0,
          );
          let captured!: () => void;
          const oldReady = new Promise<void>((r) => (captured = r)),
            gate = new Promise<void>((r) => (release = r));
          let held = false;
          await page.route(`**/api/users/${target.id}`, async (route) => {
            if (held) {
              await route.continue();
              return;
            }
            held = true;
            const response = await route.fetch();
            captured();
            await gate;
            try {
              await route.fulfill({ response });
            } catch {
              /* Expected abort of the obsolete request. */
            }
          });
          await page.evaluate(() =>
            (
              window as unknown as {
                securityRecovery: { state: { coldRead: () => void } };
              }
            ).securityRecovery.state.coldRead(),
          );
          await oldReady;
          await context.setOffline(true);
          await delay(150);
          const name = `Recovered-${randomUUID()}`;
          expect(
            (await req(`/users/${target.id}`, 'PATCH', { name }, auth.token))
              .status,
          ).toBe(200);
          emit(ns, randomUUID());
          await context.setOffline(false);
          await browserExpect(page.locator('#state')).toHaveText(name, {
            timeout: 15000,
          });
          release();
          await delay(150);
          await browserExpect(page.locator('#state')).toHaveText(name);
          await page.evaluate(() =>
            (
              window as unknown as {
                securityRecovery: { state: { stop: () => void } };
              }
            ).securityRecovery.state.stop(),
          );
          await context.close();
        } finally {
          release?.();
          if (browser) await browser.close();
          if (vite.pid && vite.exitCode === null)
            process.kill(-vite.pid, 'SIGTERM');
          await new Promise<void>((r) => {
            if (vite.exitCode !== null) r();
            else vite.once('exit', () => r());
          });
        }
      },
      45000,
    );
  }
});
