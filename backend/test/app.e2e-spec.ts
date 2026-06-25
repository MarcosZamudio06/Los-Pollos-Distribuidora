import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppModule bootstrap (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
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
    expect(providers).toEqual([]);
  });

  afterAll(async () => {
    await app.close();
  });
});
