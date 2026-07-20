import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { BillingRequestsController } from './billing-requests.controller';
import { BillingRequestsService } from './billing-requests.service';

const admin = { id: 'admin-1', email: 'admin@pollos.local', name: 'Admin', role: 'ADMIN', mustChangePassword: false };
const seller = { id: 'seller-1', email: 'seller@pollos.local', name: 'Seller', role: 'SELLER', mustChangePassword: false };
const collections = { id: 'collections-1', email: 'collections@pollos.local', name: 'Collections', role: 'COLLECTIONS', mustChangePassword: false };
const billing = { id: 'billing-1', email: 'billing@pollos.local', name: 'Billing', role: 'BILLING', mustChangePassword: false };

describe('BillingRequestsController API', () => {
  let app: INestApplication;
  const service = { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn(), startReview: jest.fn(), approve: jest.fn(), reject: jest.fn(), cancel: jest.fn(), linkInvoice: jest.fn() };

  beforeEach(async () => {
    Object.values(service).forEach((mock) => mock.mockReset().mockResolvedValue({ id: 'request-1' }));
    const authService = { verifyAccessToken: jest.fn((token: string) => Promise.resolve(token === 'admin' ? admin : token === 'seller' ? seller : token === 'billing' ? billing : collections)) };
    const moduleRef = await Test.createTestingModule({ controllers: [BillingRequestsController], providers: [{ provide: BillingRequestsService, useValue: service }, { provide: AuthService, useValue: authService }] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(() => app.close());

  it('exposes the migrated billing route and explicit commands', async () => {
    await request(app.getHttpServer()).get('/api/billing-requests?page=1&limit=20&status=REQUESTED').set('Authorization', 'Bearer collections').expect(200);
    await request(app.getHttpServer()).get('/api/billing-requests/request-1').set('Authorization', 'Bearer seller').expect(200);
    await request(app.getHttpServer()).post('/api/billing/requests').set('Authorization', 'Bearer seller').set('Idempotency-Key', 'create-1').send({ customerId: 'customer-1', reason: 'Seguimiento', documents: [{ saleDocumentId: 'document-1', requestedSubtotal: '90.00', requestedTax: '10.00', requestedTotal: '100.00' }] }).expect(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ documents: [expect.objectContaining({ saleDocumentId: 'document-1' })] }), seller, 'create-1');
    await request(app.getHttpServer()).post('/api/billing/requests/request-1/start-review').set('Authorization', 'Bearer admin').send({ expectedVersion: 1, reason: 'Review started' }).expect(201);
    expect(service.startReview).toHaveBeenCalledWith('request-1', expect.objectContaining({ expectedVersion: 1 }), admin);
    await request(app.getHttpServer()).post('/api/billing/requests/request-1/approve').set('Authorization', 'Bearer admin').send({ expectedVersion: 1, reason: 'Validated' }).expect(201);
    await request(app.getHttpServer()).post('/api/billing/requests/request-1/reject').set('Authorization', 'Bearer admin').send({ expectedVersion: 1, reason: 'Invalid fiscal data' }).expect(201);
    await request(app.getHttpServer()).patch('/api/billing-requests/request-1').set('Authorization', 'Bearer seller').send({ notes: 'Nota' }).expect(200);
    await request(app.getHttpServer()).post('/api/billing/requests/request-1/cancel').set('Authorization', 'Bearer admin').send({ expectedVersion: 1, reason: 'Duplicada', notes: 'Sin impacto operativo' }).expect(201);
    await request(app.getHttpServer()).post('/api/billing/requests/request-1/link-invoice').set('Authorization', 'Bearer admin').set('Idempotency-Key', 'invoice-1').send({ expectedVersion: 1, invoiceId: 'invoice-1', applications: [{ saleDocumentId: 'document-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00', items: [{ saleItemId: 'item-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00' }] }] }).expect(201);
    expect(service.linkInvoice).toHaveBeenCalledWith('request-1', expect.any(Object), admin, 'invoice-1');
    await request(app.getHttpServer()).post('/api/billing/requests/request-1/approve').set('Authorization', 'Bearer billing').send({ expectedVersion: 1, reason: 'Validated' }).expect(201);
    await request(app.getHttpServer()).post('/api/billing/requests/request-1/link-invoice').set('Authorization', 'Bearer billing').set('Idempotency-Key', 'invoice-2').send({ expectedVersion: 1, invoiceId: 'invoice-1', applications: [{ saleDocumentId: 'document-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00', items: [{ saleItemId: 'item-1', subtotalApplied: '90.00', taxApplied: '10.00', totalApplied: '100.00' }] }] }).expect(201);
    await request(app.getHttpServer()).post('/api/billing/requests').set('Authorization', 'Bearer billing').set('Idempotency-Key', 'create-2').send({ customerId: 'customer-1', reason: 'Not allowed', documents: [{ saleDocumentId: 'document-1', requestedSubtotal: '90.00', requestedTax: '10.00', requestedTotal: '100.00' }] }).expect(403);
  });

  it('keeps COLLECTIONS read-only and validates required reasons', async () => {
    await request(app.getHttpServer()).post('/api/billing/requests').set('Authorization', 'Bearer collections').set('Idempotency-Key', 'create-1').send({ customerId: 'customer-1', documents: [{ saleDocumentId: 'document-1', requestedSubtotal: '100.00', requestedTax: '0.00', requestedTotal: '100.00' }], reason: 'Seguimiento' }).expect(403);
    await request(app.getHttpServer()).post('/api/billing-requests/request-1/cancel').set('Authorization', 'Bearer seller').send({ reason: 'No autorizado' }).expect(403);
    await request(app.getHttpServer()).post('/api/billing/requests').set('Authorization', 'Bearer admin').send({ customerId: 'customer-1', documents: [], reason: 'Seguimiento' }).expect(400);
  });
});
