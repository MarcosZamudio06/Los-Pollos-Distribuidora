import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { OperationalConfigController } from './operational-config.controller';
import { OperationalConfigService } from './operational-config.service';

const adminUser = { id: 'admin-1', email: 'admin@pollos.local', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
const sellerUser = { id: 'seller-1', email: 'seller@pollos.local', name: 'Seller', role: 'SELLER', mustChangePassword: false };
const configResponse = { id: 'config-1', key: 'REPORT_REFRESH_INTERVAL_SECONDS', value: '60', valueType: 'NUMBER', scope: 'GLOBAL', isActive: true };

describe('OperationalConfigController API', () => {
  let app: INestApplication;
  let service: jest.Mocked<Pick<OperationalConfigService, 'findAll' | 'create' | 'update' | 'deactivate'>>;

  beforeEach(async () => {
    const authService = { verifyAccessToken: jest.fn((token: string) => token === 'admin-token' ? Promise.resolve(adminUser) : token === 'seller-token' ? Promise.resolve(sellerUser) : Promise.reject(new Error('Invalid token'))) };
    service = { findAll: jest.fn().mockResolvedValue({ items: [configResponse] }), create: jest.fn().mockResolvedValue(configResponse), update: jest.fn().mockResolvedValue(configResponse), deactivate: jest.fn().mockResolvedValue({ ...configResponse, isActive: false }) };
    const moduleFixture: TestingModule = await Test.createTestingModule({ controllers: [OperationalConfigController], providers: [{ provide: AuthService, useValue: authService }, { provide: OperationalConfigService, useValue: service }] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ forbidUnknownValues: true, transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => app.close());

  it('exposes exact operational config routes with admin mutations and audit user', async () => {
    await request(app.getHttpServer()).get('/api/operational-config?page=1&limit=10&key=REPORT_REFRESH_INTERVAL_SECONDS&scope=GLOBAL&isActive=true').set('Authorization', 'Bearer admin-token').expect(200);
    expect(service.findAll).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, key: 'REPORT_REFRESH_INTERVAL_SECONDS', scope: 'GLOBAL', isActive: true }));

    await request(app.getHttpServer()).post('/api/operational-config').set('Authorization', 'Bearer admin-token').send({ key: 'REPORT_REFRESH_INTERVAL_SECONDS', value: '60', valueType: 'NUMBER', scope: 'GLOBAL', effectiveFrom: '2026-06-19', isActive: true }).expect(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ key: 'REPORT_REFRESH_INTERVAL_SECONDS' }), adminUser);

    await request(app.getHttpServer()).patch('/api/operational-config/config-1').set('Authorization', 'Bearer admin-token').send({ value: '45' }).expect(200);
    expect(service.update).toHaveBeenCalledWith('config-1', { value: '45' }, adminUser);

    await request(app.getHttpServer()).delete('/api/operational-config/config-1').set('Authorization', 'Bearer admin-token').expect(200);
    expect(service.deactivate).toHaveBeenCalledWith('config-1', adminUser);
  });

  it('rejects non-admin access to operational config mutations', async () => {
    await request(app.getHttpServer()).post('/api/operational-config').set('Authorization', 'Bearer seller-token').send({ key: 'REPORT_REFRESH_INTERVAL_SECONDS', value: '60', valueType: 'NUMBER', scope: 'GLOBAL', effectiveFrom: '2026-06-19' }).expect(403);
    expect(service.create).not.toHaveBeenCalled();

    await request(app.getHttpServer()).get('/api/operational-config').set('Authorization', 'Bearer seller-token').expect(403);
    expect(service.findAll).not.toHaveBeenCalledWith(expect.objectContaining({}));
  });
});
