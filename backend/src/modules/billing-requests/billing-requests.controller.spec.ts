import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { BillingRequestsController } from './billing-requests.controller';
import { BillingRequestsService } from './billing-requests.service';

const admin = { id: 'admin-1', email: 'admin@pollos.local', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
const seller = { id: 'seller-1', email: 'seller@pollos.local', name: 'Seller', role: 'SELLER', mustChangePassword: false };
const collections = { id: 'collections-1', email: 'collections@pollos.local', name: 'Collections', role: 'COLLECTIONS', mustChangePassword: false };

describe('BillingRequestsController API', () => {
  let app: INestApplication;
  const service = { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn(), cancel: jest.fn() };

  beforeEach(async () => {
    Object.values(service).forEach((mock) => mock.mockReset().mockResolvedValue({ id: 'request-1' }));
    const authService = { verifyAccessToken: jest.fn((token: string) => Promise.resolve(token === 'admin' ? admin : token === 'seller' ? seller : collections)) };
    const moduleRef = await Test.createTestingModule({ controllers: [BillingRequestsController], providers: [{ provide: BillingRequestsService, useValue: service }, { provide: AuthService, useValue: authService }] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('exposes list/detail to all documented roles and mutations to ADMIN/SELLER', async () => {
    await request(app.getHttpServer()).get('/api/billing-requests?page=1&limit=20&status=REQUESTED').set('Authorization', 'Bearer collections').expect(200);
    await request(app.getHttpServer()).get('/api/billing-requests/request-1').set('Authorization', 'Bearer seller').expect(200);
    await request(app.getHttpServer()).post('/api/billing-requests').set('Authorization', 'Bearer seller').send({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Seguimiento' }).expect(201);
    await request(app.getHttpServer()).patch('/api/billing-requests/request-1').set('Authorization', 'Bearer seller').send({ notes: 'Nota' }).expect(200);
    await request(app.getHttpServer()).post('/api/billing-requests/request-1/cancel').set('Authorization', 'Bearer admin').send({ reason: 'Duplicada', notes: 'Sin impacto operativo' }).expect(201);
  });

  it('keeps COLLECTIONS read-only and validates required reasons', async () => {
    await request(app.getHttpServer()).post('/api/billing-requests').set('Authorization', 'Bearer collections').send({ customerId: 'customer-1', saleId: 'sale-1', reason: 'Seguimiento' }).expect(403);
    await request(app.getHttpServer()).post('/api/billing-requests/request-1/cancel').set('Authorization', 'Bearer seller').send({ reason: 'No autorizado' }).expect(403);
    await request(app.getHttpServer()).post('/api/billing-requests').set('Authorization', 'Bearer admin').send({ customerId: 'customer-1', saleId: 'sale-1' }).expect(400);
  });
});
