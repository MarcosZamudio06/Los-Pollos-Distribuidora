import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';

jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));
jest.mock('../../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const adminUser = {
  id: 'admin-1',
  email: 'admin@example.test',
  name: 'Admin',
  role: 'ADMIN',
  mustChangePassword: false,
};
const sellerUser = {
  ...adminUser,
  id: 'seller-1',
  role: 'SELLER',
};

describe('BrandingController API', () => {
  let app: INestApplication;
  let service: jest.Mocked<
    Pick<
      BrandingService,
      'getBranding' | 'updateBranding' | 'uploadLogo' | 'removeLogo'
    >
  >;

  beforeEach(async () => {
    const authService = {
      verifyAccessToken: jest.fn((token: string) =>
        token === 'admin-token'
          ? Promise.resolve(adminUser)
          : token === 'seller-token'
            ? Promise.resolve(sellerUser)
            : Promise.reject(new Error('Invalid token')),
      ),
    };
    service = {
      getBranding: jest.fn().mockResolvedValue({
        displayName: 'ERP',
        shortName: null,
        logoUrl: null,
        logoMimeType: null,
        hasLogo: false,
        version: 0,
      }),
      updateBranding: jest.fn().mockResolvedValue({ displayName: 'North Supply' }),
      uploadLogo: jest.fn(),
      removeLogo: jest.fn(),
    };
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BrandingController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: BrandingService, useValue: service },
      ],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        forbidUnknownValues: true,
        transform: true,
        whitelist: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => app.close());

  it('returns visual branding before authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/branding')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.displayName).toBe('ERP');
        expect(body.data).not.toHaveProperty('logoObjectKey');
        expect(body.data).not.toHaveProperty('updatedByUserId');
      });
    expect(service.getBranding).toHaveBeenCalledTimes(1);
  });

  it('allows ADMIN to update branding and records the authenticated user', async () => {
    await request(app.getHttpServer())
      .put('/api/branding')
      .set('Authorization', 'Bearer admin-token')
      .send({ displayName: 'North Supply', version: 0 })
      .expect(200);
    expect(service.updateBranding).toHaveBeenCalledWith(
      { displayName: 'North Supply', version: 0 },
      adminUser,
    );
  });

  it('rejects unauthenticated and non-ADMIN branding mutations', async () => {
    await request(app.getHttpServer())
      .put('/api/branding')
      .send({ displayName: 'North Supply', version: 0 })
      .expect(401);
    await request(app.getHttpServer())
      .put('/api/branding')
      .set('Authorization', 'Bearer seller-token')
      .send({ displayName: 'North Supply', version: 0 })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/branding/logo')
      .set('Authorization', 'Bearer seller-token')
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/branding/logo?version=0')
      .set('Authorization', 'Bearer seller-token')
      .expect(403);
    expect(service.updateBranding).not.toHaveBeenCalled();
    expect(service.uploadLogo).not.toHaveBeenCalled();
    expect(service.removeLogo).not.toHaveBeenCalled();
  });

  it('validates a trimmed non-empty display name and optimistic version', async () => {
    await request(app.getHttpServer())
      .put('/api/branding')
      .set('Authorization', 'Bearer admin-token')
      .send({ displayName: '   ', version: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/branding')
      .set('Authorization', 'Bearer admin-token')
      .send({ displayName: 'x'.repeat(81), version: 0 })
      .expect(400);
    expect(service.updateBranding).not.toHaveBeenCalled();
  });
});
