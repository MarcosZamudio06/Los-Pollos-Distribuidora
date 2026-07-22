import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { CommercialPoliciesController } from './commercial-policies.controller';
import { CommercialPoliciesService } from './commercial-policies.service';

const adminUser = { id: 'admin-1', email: 'admin@pollos.local', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
const sellerUser = { id: 'seller-1', email: 'seller@pollos.local', name: 'Seller', role: 'SELLER', mustChangePassword: false };
const policyResponse = { id: 'policy-1', name: 'Wholesale standard', defaultCreditLimit: '50000', defaultCreditDays: 15, isActive: true };

describe('CommercialPoliciesController API', () => {
  let app: INestApplication;
  let service: jest.Mocked<Pick<CommercialPoliciesService, 'findAll' | 'create' | 'update' | 'deactivate' | 'authorizeDiscount'>>;

  beforeEach(async () => {
    const authService = { verifyAccessToken: jest.fn((token: string) => token === 'admin-token' ? Promise.resolve(adminUser) : token === 'seller-token' ? Promise.resolve(sellerUser) : Promise.reject(new Error('Invalid token'))) };
    service = { findAll: jest.fn().mockResolvedValue({ items: [policyResponse] }), create: jest.fn().mockResolvedValue(policyResponse), update: jest.fn().mockResolvedValue(policyResponse), deactivate: jest.fn().mockResolvedValue({ ...policyResponse, isActive: false }), authorizeDiscount: jest.fn().mockResolvedValue({ id: 'discount-auth-1' }) };
    const moduleFixture: TestingModule = await Test.createTestingModule({ controllers: [CommercialPoliciesController], providers: [{ provide: AuthService, useValue: authService }, { provide: CommercialPoliciesService, useValue: service }] }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ forbidUnknownValues: true, transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => app.close());

  it('exposes exact commercial policy routes with documented permissions and audit user', async () => {
    await request(app.getHttpServer()).get('/api/commercial-policies?page=1&limit=10&customerType=WHOLESALE&isActive=true').set('Authorization', 'Bearer seller-token').expect(200);
    expect(service.findAll).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, customerType: 'WHOLESALE', isActive: true }));

    await request(app.getHttpServer()).post('/api/commercial-policies').set('Authorization', 'Bearer admin-token').send({ name: 'Wholesale standard', defaultCreditLimit: 50000, defaultCreditDays: 15, overdueBlockingMode: 'BLOCK_NEW_CREDIT', creditLimitBlockingMode: 'BLOCK', effectiveFrom: '2026-06-19', isActive: true }).expect(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Wholesale standard' }), adminUser);

    await request(app.getHttpServer()).post('/api/commercial-policies/policy-1/discount-authorizations').set('Authorization', 'Bearer admin-token').send({ maximumPercentage: 10, reason: 'Damaged packaging', evidence: 'Photo evidence' }).expect(201);
    expect(service.authorizeDiscount).toHaveBeenCalledWith('policy-1', expect.objectContaining({ maximumPercentage: 10 }), adminUser);

    await request(app.getHttpServer()).patch('/api/commercial-policies/policy-1').set('Authorization', 'Bearer admin-token').send({ defaultCreditDays: 20 }).expect(200);
    expect(service.update).toHaveBeenCalledWith('policy-1', { defaultCreditDays: 20 }, adminUser);

    await request(app.getHttpServer()).delete('/api/commercial-policies/policy-1').set('Authorization', 'Bearer admin-token').expect(200);
    expect(service.deactivate).toHaveBeenCalledWith('policy-1', adminUser);
  });

  it('rejects non-admin mutations', async () => {
    await request(app.getHttpServer()).post('/api/commercial-policies').set('Authorization', 'Bearer seller-token').send({ name: 'Nope', effectiveFrom: '2026-06-19' }).expect(403);
    await request(app.getHttpServer()).post('/api/commercial-policies/policy-1/discount-authorizations').set('Authorization', 'Bearer seller-token').send({ maximumPercentage: 10, reason: 'Nope', evidence: 'Nope' }).expect(403);
    expect(service.create).not.toHaveBeenCalled();
  });
});
