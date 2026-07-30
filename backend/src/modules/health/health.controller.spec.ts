import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { HttpThrottlerGuard } from '../../common/guards/http-throttler.guard';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 1 }]),
      ],
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: {
            getLiveness: () => ({ success: true, data: { status: 'live' } }),
            getStartup: () => ({ success: true, data: { status: 'started' } }),
            getReadiness: () => ({ success: true, data: { status: 'ready' } }),
          },
        },
        { provide: APP_GUARD, useClass: HttpThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => app.close());

  it('exposes unauthenticated health probes outside throttling', async () => {
    await request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200)
      .expect({ success: true, data: { status: 'live' } });
    await request(app.getHttpServer())
      .get('/api/health/live')
      .expect(200)
      .expect({ success: true, data: { status: 'live' } });
    await request(app.getHttpServer())
      .get('/api/health/startup')
      .expect(200)
      .expect({ success: true, data: { status: 'started' } });
    await request(app.getHttpServer())
      .get('/api/health/ready')
      .expect(200)
      .expect({ success: true, data: { status: 'ready' } });
  });
});
