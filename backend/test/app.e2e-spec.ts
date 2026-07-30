import { INestApplication } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AccountsReceivableAgingJob } from './../src/modules/accounts-receivable/accounts-receivable-aging.job';

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
    })
      .overrideProvider(AccountsReceivableAgingJob)
      .useValue({
        onApplicationBootstrap: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('initializes the application module without starter routes', () => {
    expect(app).toBeDefined();
    expect(app?.getHttpServer()).toBeDefined();
  });

  it('keeps the root module free of starter controllers', () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      AppModule,
    ) as unknown[] | undefined;

    expect(controllers).toEqual([]);
  });

  afterAll(async () => {
    await app?.close();

    for (const [key, value] of Object.entries(previousRoutingEnvironment)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
});
