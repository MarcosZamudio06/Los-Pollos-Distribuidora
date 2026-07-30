import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { HttpThrottlerGuard } from './../src/common/guards/http-throttler.guard';

const routingEnvironment = {
  OSRM_URL: 'http://localhost:5000',
  PHOTON_URL: 'http://localhost:2322',
  VROOM_URL: 'http://localhost:3000',
} as const;
const previousRoutingEnvironment = Object.fromEntries(
  Object.keys(routingEnvironment).map((key) => [key, process.env[key]]),
);

describe('AppModule bootstrap (e2e)', () => {
  let app: INestApplication<App> | undefined;

  beforeAll(async () => {
    Object.assign(process.env, routingEnvironment);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('initializes the application module without starter routes', () => {
    expect(app).toBeDefined();
    expect(app.getHttpServer()).toBeDefined();
  });

  it('keeps the root module free of starter controllers and providers', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    ) as unknown[] | undefined;
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AppModule,
    ) as unknown[] | undefined;

    expect(controllers).toEqual([]);
    expect(providers).toEqual([
      { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    ]);
  });

  afterAll(async () => {
    await app?.close();
    for (const [key, value] of Object.entries(previousRoutingEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
});
