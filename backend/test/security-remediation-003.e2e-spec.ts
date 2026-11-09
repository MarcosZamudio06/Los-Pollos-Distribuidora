import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { User } from '@prisma/client';
import { configureHttpApplication } from '../src/bootstrap/configure-http-application';
import { HttpThrottlerGuard } from '../src/common/guards/http-throttler.guard';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { createHttpThrottlerOptions } from '../src/config/http-throttler.config';
import { PrismaService } from '../src/database/prisma.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { HealthController } from '../src/modules/health/health.controller';
import { HealthService } from '../src/modules/health/health.service';
import { assertDisposableE2eEnvironment } from './e2e-environment';

describe('SEC-003/005 real HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(30000);
  const prisma = new PrismaService();
  const password = `Synthetic-${randomUUID()}`;
  let hash: string;
  let active: User;
  let disabled: User;
  let app: NestExpressApplication;
  let base: string;
  let probeServer: Server;
  let probeUrl: string;
  let probeRequests = 0;
  let probeStatus = 200;

  async function request(path: string, email?: string, supplied = password) {
    const response = await fetch(`${base}/api${path}`, {
      ...(email
        ? {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, password: supplied }),
          }
        : {}),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get('set-cookie'),
      retry: response.headers.get('retry-after'),
      cache: response.headers.get('cache-control'),
    };
  }

  beforeAll(async () => {
    assertDisposableE2eEnvironment();
    await prisma.$connect();
    hash = await bcrypt.hash(password, 12);
    const role = await prisma.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
    });
    const location = await prisma.operationalLocation.create({
      data: {
        name: 'Synthetic security CEDIS',
        code: randomUUID(),
        type: 'DISTRIBUTION_CENTER',
      },
    });
    const createUser = (isActive: boolean) => {
      const id = randomUUID();
      return prisma.user.create({
        data: {
          name: 'Synthetic enumeration fixture',
          email: `${id}@fixture.invalid`,
          phone: id,
          controlNumber: id,
          passwordHash: hash,
          roleId: role.id,
          operationalLocationId: location.id,
          isActive,
        },
      });
    };
    active = await createUser(true);
    disabled = await createUser(false);
    probeServer = createServer((_req, res) => {
      probeRequests++;
      res.writeHead(probeStatus).end('{}');
    });
    await new Promise<void>((done) => probeServer.listen(0, '127.0.0.1', done));
    probeUrl = `http://127.0.0.1:${(probeServer.address() as { port: number }).port}`;
  });

  beforeEach(async () => {
    probeRequests = 0;
    probeStatus = 200;
    const config = new ConfigService({
      NODE_ENV: 'production',
      // Even a mistaken raw flag cannot expose Swagger in production.
      SWAGGER_ENABLED: true,
      CORS_ORIGINS: ['https://fixture.invalid'],
      RATE_LIMIT_LOGIN_ACCOUNT_MAX: 5,
      RATE_LIMIT_LOGIN_IP_MAX: 30,
      PHOTON_URL: probeUrl,
      OSRM_URL: probeUrl,
      VROOM_URL: probeUrl,
      MAP_TILES_URL: probeUrl,
      OBJECT_STORAGE_ENDPOINT: probeUrl,
    });
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(createHttpThrottlerOptions(config))],
      controllers: [AuthController, HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: config },
        AuthService,
        JwtService,
        HealthService,
        { provide: APP_GUARD, useClass: HttpThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureHttpApplication(app, config);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    if (app) await app.close();
  });
  afterAll(async () => {
    if (probeServer)
      await new Promise<void>((done) => probeServer.close(() => done()));
    await prisma.$disconnect();
  });

  it('returns one public failure and one bcrypt comparison for unknown, wrong and disabled credentials', async () => {
    const compare = jest.spyOn(bcrypt, 'compare');
    const audit = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const cases = [
      [`${randomUUID()}@fixture.invalid`, 'wrong-password'],
      [active.email, 'wrong-password'],
      [disabled.email, 'wrong-password'],
      [disabled.email, password],
    ];
    const before = await prisma.authSession.count();
    const responses: Array<Awaited<ReturnType<typeof request>>> = [];
    for (const [email, supplied] of cases) {
      responses.push(await request('/auth/login', email, supplied));
    }
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    for (const response of responses) {
      const { requestId, ...publicBody } = response.body;
      expect(requestId).toEqual(expect.any(String));
      expect(publicBody).toEqual({
        success: false,
        message: 'Invalid credentials',
        error: 'UNAUTHORIZED',
        statusCode: 401,
      });
      expect(response.cookie).toBeNull();
    }
    expect(compare).toHaveBeenCalledTimes(4);
    expect(
      compare.mock.calls.map((call) => bcrypt.getRounds(call[1] as string)),
    ).toEqual([12, 12, 12, 12]);
    expect(await prisma.authSession.count()).toBe(before);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: disabled.id } }))
        .isActive,
    ).toBe(false);
    expect(audit).toHaveBeenCalledTimes(4);
    const logs = JSON.stringify(audit.mock.calls);
    expect(logs).toContain('AUTH_LOGIN_REJECTED');
    expect(logs).toContain('inactive');
    expect(logs).not.toContain('@fixture.invalid');
    expect(logs).not.toContain(password);
    expect(logs).not.toContain(hash);
  });

  it('keeps valid login, refresh, logout and durable revocation working', async () => {
    const login = await request('/auth/login', active.email);
    expect(login.status).toBe(200);
    expect(login.cookie).toContain('HttpOnly');
    const cookie = login.cookie!.split(';')[0];
    const refresh = await fetch(`${base}/api/auth/refresh`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(refresh.status).toBe(200);
    const refreshed = await refresh.json();
    const logout = await fetch(`${base}/api/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${refreshed.data.accessToken}` },
    });
    expect(logout.status).toBe(200);
    const me = await fetch(`${base}/api/auth/me`, {
      headers: { authorization: `Bearer ${refreshed.data.accessToken}` },
    });
    expect(me.status).toBe(401);
    expect(
      await prisma.authSession.count({
        where: { userId: active.id, revokedAt: { not: null } },
      }),
    ).toBeGreaterThan(0);
  });

  it('preserves five-attempt account limits, including missing and disabled accounts', async () => {
    const compare = jest.spyOn(bcrypt, 'compare');
    for (const email of [`${randomUUID()}@fixture.invalid`, disabled.email]) {
      for (let i = 0; i < 5; i++)
        await request('/auth/login', email, 'wrong-password');
      const calls = compare.mock.calls.length;
      const blocked = await request('/auth/login', email, 'wrong-password');
      expect(blocked.status).toBe(429);
      expect(Number(blocked.retry)).toBeGreaterThan(0);
      expect(JSON.stringify(blocked.body)).not.toContain(email);
      expect(compare).toHaveBeenCalledTimes(calls);
    }
  });

  it('preserves the per-IP limit across distinct account names', async () => {
    // Distinct accounts exercise the shared source-IP bucket over actual HTTP.
    for (let i = 0; i < 30; i++) {
      const response = await request(
        '/auth/login',
        `${randomUUID()}@fixture.invalid`,
      );
      expect(response.status).toBe(401);
    }
    const blocked = await request(
      '/auth/login',
      `${randomUUID()}@fixture.invalid`,
    );
    expect(blocked.status).toBe(429);
    expect(Number(blocked.retry)).toBeGreaterThan(0);
  });

  it('keeps liveness database-free and coalesces public readiness independently of GIS', async () => {
    const query = jest.spyOn(prisma, '$queryRawUnsafe');
    for (let i = 0; i < 3; i++)
      expect((await request('/health/live')).status).toBe(200);
    expect(query).not.toHaveBeenCalled();
    probeStatus = 503;
    const ready = await Promise.all(
      Array.from({ length: 20 }, () => request('/health/ready')),
    );
    expect(
      ready.every((r) => r.status === 200 && r.body.data.status === 'ready'),
    ).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
    expect(probeRequests).toBe(0);
    app.get(HealthService).onModuleDestroy();
    expect((await request('/health/ready')).status).toBe(503);
  });

  it('bounds arbitrary public diagnostic requests to one sanitized probe wave', async () => {
    const query = jest.spyOn(prisma, '$queryRawUnsafe');
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        request(`/health/dependencies?nonce=${i}`),
      ),
    );
    expect(
      responses.every((r) => r.status === 200 && r.body.data.status === 'ok'),
    ).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(probeRequests).toBe(5);
    for (const response of responses) {
      expect(response.cache).toBe('no-store');
      expect(response.body.data.checkedAt).toBe(
        responses[0].body.data.checkedAt,
      );
      expect(JSON.stringify(response.body)).not.toMatch(
        /http:|SELECT|password|stack|fixture.invalid/i,
      );
    }
    await request('/health/dependencies?refresh=true');
    expect(query).toHaveBeenCalledTimes(2);
    expect(probeRequests).toBe(5);
  });

  it('preserves degraded diagnostics without a false core outage', async () => {
    probeStatus = 503;
    const dependencies = await request('/health/dependencies');
    expect(dependencies.status).toBe(200);
    expect(dependencies.body.data.status).toBe('degraded');
    expect(dependencies.body.data.dependencies.database.status).toBe('up');
    expect((await request('/health/ready')).status).toBe(200);
  });

  it('retains production Swagger denial and actual PostGIS availability', async () => {
    for (const path of ['/docs', '/docs-json', '/docs-yaml']) {
      expect((await fetch(`${base}${path}`)).status).toBe(404);
    }
    const rows = await prisma.$queryRawUnsafe<Array<{ version: string }>>(
      'SELECT PostGIS_full_version() AS version',
    );
    expect(rows[0].version).toContain('POSTGIS=');
  });
});
