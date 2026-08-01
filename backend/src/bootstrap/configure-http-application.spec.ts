import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  Get,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import request from 'supertest';
import { RateLimitPolicy } from '../common/decorators/rate-limit-policy.decorator';
import { HttpThrottlerGuard } from '../common/guards/http-throttler.guard';
import { createHttpThrottlerOptions } from '../config/http-throttler.config';
import { configureHttpApplication } from './configure-http-application';

@Controller('security-test')
class SecurityTestController {
  @Get('large')
  largeResponse() {
    return { data: 'compressible-response-'.repeat(200) };
  }

  @Post('echo')
  echo(@Body() body: Record<string, unknown>) {
    return body;
  }

  @Get('known-error')
  knownError(): never {
    throw new BadRequestException({
      code: 'KNOWN_ERROR',
      findings: [{ code: 'SAFE_FINDING', message: 'Safe finding' }],
      internalContext: 'must-not-be-returned',
      message: 'Known error',
    });
  }

  @Get('unknown-error')
  unknownError(): never {
    throw new Error('database-password-must-not-leak');
  }

  @Get('stable-message-code')
  stableMessageCode(): never {
    throw new ConflictException('DAILY_CLOSE_HAS_OPEN_SHIFTS');
  }

  @Get('ip')
  clientIp(@Req() request: Request) {
    return { ip: request.ip };
  }

  @Post('login')
  @RateLimitPolicy('login')
  login(@Body() body: Record<string, unknown>) {
    return { email: body.email };
  }

  @Post('refresh')
  @RateLimitPolicy('refresh')
  refresh() {
    return { refreshed: true };
  }
}

type TestConfig = {
  HTTP_BODY_LIMIT: string;
  NODE_ENV: string;
  RATE_LIMIT_GLOBAL_MAX: number;
  RATE_LIMIT_LOGIN_ACCOUNT_MAX: number;
  RATE_LIMIT_LOGIN_IP_MAX: number;
  RATE_LIMIT_REFRESH_MAX: number;
  SWAGGER_ENABLED: boolean;
  TRUST_PROXY_HOPS: number;
  app: { apiPrefix: string; swaggerPath: string };
  CORS_ORIGINS: string[];
};

const defaultConfig: TestConfig = {
  app: { apiPrefix: 'api', swaggerPath: 'docs' },
  CORS_ORIGINS: ['https://erp.example.com'],
  HTTP_BODY_LIMIT: '1kb',
  NODE_ENV: 'test',
  RATE_LIMIT_GLOBAL_MAX: 100,
  RATE_LIMIT_LOGIN_ACCOUNT_MAX: 2,
  RATE_LIMIT_LOGIN_IP_MAX: 10,
  RATE_LIMIT_REFRESH_MAX: 2,
  SWAGGER_ENABLED: true,
  TRUST_PROXY_HOPS: 1,
};

function getResponseBody(response: { body: unknown }): Record<string, unknown> {
  if (
    typeof response.body !== 'object' ||
    response.body === null ||
    Array.isArray(response.body)
  ) {
    throw new Error('Expected an object response body');
  }
  return response.body as Record<string, unknown>;
}

async function createTestApplication(
  overrides: Partial<TestConfig> = {},
): Promise<NestExpressApplication> {
  const configService = new ConfigService({ ...defaultConfig, ...overrides });
  const moduleFixture = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot(createHttpThrottlerOptions(configService)),
    ],
    controllers: [SecurityTestController],
    providers: [{ provide: APP_GUARD, useClass: HttpThrottlerGuard }],
  }).compile();
  const app = moduleFixture.createNestApplication<NestExpressApplication>();
  configureHttpApplication(app, configService);
  await app.init();
  return app;
}

describe('configureHttpApplication', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    app = await createTestApplication();
  });

  afterEach(async () => app.close());

  it('applies security headers, compression, CORS, and request IDs', async () => {
    const requestId = randomUUID();
    const response = await request(app.getHttpServer())
      .get('/api/security-test/large')
      .set('Accept-Encoding', 'gzip')
      .set('Origin', 'https://erp.example.com')
      .set('X-Request-ID', requestId)
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(response.headers['access-control-allow-origin']).toBe(
      'https://erp.example.com',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['x-request-id']).toBe(requestId);
  });

  it('does not authorize origins outside the allowlist', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/security-test/large')
      .set('Origin', 'https://attacker.example.com')
      .expect(200);

    expect(response.headers).not.toHaveProperty('access-control-allow-origin');
  });

  it('rejects oversized payloads with a traceable API error', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/security-test/echo')
      .send({ value: 'x'.repeat(2048) })
      .expect(413);
    const body = getResponseBody(response);

    expect(body).toEqual(
      expect.objectContaining({
        success: false,
        error: 'PAYLOAD_TOO_LARGE',
        statusCode: 413,
      }),
    );
    expect(typeof body.requestId).toBe('string');
    expect(response.headers['x-request-id']).toBe(body.requestId);
  });

  it('preserves known errors and sanitizes unexpected errors', async () => {
    await request(app.getHttpServer())
      .get('/api/security-test/known-error')
      .expect(400)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            success: false,
            message: 'Known error',
            error: 'KNOWN_ERROR',
            code: 'KNOWN_ERROR',
            findings: [{ code: 'SAFE_FINDING', message: 'Safe finding' }],
            statusCode: 400,
          }),
        );
        expect(body).not.toHaveProperty('internalContext');
      });

    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      const response = await request(app.getHttpServer())
        .get('/api/security-test/unknown-error')
        .expect(500);
      const body = getResponseBody(response);
      expect(body).toEqual(
        expect.objectContaining({
          success: false,
          message: 'Internal server error',
          error: 'INTERNAL_SERVER_ERROR',
          statusCode: 500,
        }),
      );
      expect(JSON.stringify(body)).not.toContain('database-password');
      expect(errorLog).toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('promotes stable technical messages to the API error code', async () => {
    await request(app.getHttpServer())
      .get('/api/security-test/stable-message-code')
      .expect(409)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            code: 'DAILY_CLOSE_HAS_OPEN_SHIFTS',
            error: 'DAILY_CLOSE_HAS_OPEN_SHIFTS',
            message: 'DAILY_CLOSE_HAS_OPEN_SHIFTS',
          }),
        );
      });
  });

  it('uses the configured trusted proxy hop to resolve the client IP', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/security-test/ip')
      .set('X-Forwarded-For', '203.0.113.42')
      .expect(200);

    expect(response.body).toEqual({ ip: '203.0.113.42' });
  });

  it('limits login by normalized account without blocking another account', async () => {
    await request(app.getHttpServer())
      .post('/api/security-test/login')
      .send({ email: 'USER@example.com' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/security-test/login')
      .send({ email: 'user@example.com' })
      .expect(201);
    const blocked = await request(app.getHttpServer())
      .post('/api/security-test/login')
      .send({ email: 'user@example.com' })
      .expect(429);
    const blockedBody = getResponseBody(blocked);

    expect(blocked.headers['retry-after']).toBeDefined();
    expect(blockedBody.error).toBe('RATE_LIMIT_EXCEEDED');
    await request(app.getHttpServer())
      .post('/api/security-test/login')
      .send({ email: 'another@example.com' })
      .expect(201);
  });

  it('limits refresh independently from login', async () => {
    await request(app.getHttpServer())
      .post('/api/security-test/refresh')
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/security-test/refresh')
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/security-test/refresh')
      .expect(429);
  });

  it('serves Swagger outside production and hides it in production', async () => {
    await request(app.getHttpServer()).get('/docs').expect(200);

    const productionApp = await createTestApplication({
      NODE_ENV: 'production',
      SWAGGER_ENABLED: false,
    });
    try {
      await request(productionApp.getHttpServer()).get('/docs').expect(404);
    } finally {
      await productionApp.close();
    }
  });
});
