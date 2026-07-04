import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProductUnit, PurchaseStatus } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

const adminUser = { id: 'admin-1', name: 'Admin', email: 'admin@pollos.local', role: 'ADMIN', mustChangePassword: false };
const warehouseUser = { id: 'warehouse-1', name: 'Warehouse', email: 'warehouse@pollos.local', role: 'WAREHOUSE', mustChangePassword: false };
const sellerUser = { id: 'seller-1', name: 'Seller', email: 'seller@pollos.local', role: 'SELLER', mustChangePassword: false };

const purchaseResponse = {
  id: 'purchase-1',
  purchaseNumber: 'PUR-20260703-000001',
  supplierId: 'supplier-1',
  supplierName: 'Proveedor Norte',
  userId: 'warehouse-1',
  locationId: 'loc-1',
  subtotal: '1000',
  total: '1000',
  status: PurchaseStatus.CONFIRMED,
  createdAt: new Date('2026-07-03T12:00:00.000Z'),
  updatedAt: new Date('2026-07-03T12:00:00.000Z'),
  items: [],
  inventoryMovements: [],
};

describe('PurchasesController API', () => {
  let app: INestApplication<App>;
  let purchasesService: jest.Mocked<Pick<PurchasesService, 'findAll' | 'findOne' | 'create' | 'cancel'>>;

  beforeEach(async () => {
    const authService: jest.Mocked<Pick<AuthService, 'verifyAccessToken'>> = {
      verifyAccessToken: jest.fn((token: string) => {
        if (token === 'admin-token') return Promise.resolve(adminUser);
        if (token === 'warehouse-token') return Promise.resolve(warehouseUser);
        if (token === 'seller-token') return Promise.resolve(sellerUser);
        return Promise.reject(new Error('Invalid token'));
      }),
    };
    purchasesService = {
      findAll: jest.fn().mockResolvedValue({ items: [purchaseResponse], total: 1, page: 1, limit: 10, totalPages: 1 }),
      findOne: jest.fn().mockResolvedValue(purchaseResponse),
      create: jest.fn().mockResolvedValue(purchaseResponse),
      cancel: jest.fn().mockResolvedValue({ ...purchaseResponse, status: PurchaseStatus.CANCELLED }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PurchasesController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: PurchasesService, useValue: purchasesService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ forbidUnknownValues: true, transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/purchases'],
    ['GET', '/api/purchases/purchase-1'],
    ['POST', '/api/purchases'],
  ])('allows WAREHOUSE access for %s %s', async (method, path) => {
    await request(app.getHttpServer())
      [method.toLowerCase() as 'get' | 'post'](path)
      .set('Authorization', 'Bearer warehouse-token')
      .set('Idempotency-Key', 'idem-1')
      .send(method === 'POST' ? { supplierId: 'supplier-1', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: 1, unitCost: 10 }] } : undefined)
      .expect(method === 'POST' ? 201 : 200);
  });

  it.each([
    ['GET', '/api/purchases'],
    ['GET', '/api/purchases/purchase-1'],
    ['POST', '/api/purchases'],
    ['POST', '/api/purchases/purchase-1/cancel'],
  ])('rejects SELLER access for %s %s', async (method, path) => {
    await request(app.getHttpServer())
      [method.toLowerCase() as 'get' | 'post'](path)
      .set('Authorization', 'Bearer seller-token')
      .set('Idempotency-Key', 'idem-1')
      .send(method === 'POST' ? { reason: 'Wrong capture', supplierId: 'supplier-1', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: 1, unitCost: 10 }] } : undefined)
      .expect(403);
  });

  it('lists purchases with documented wrapper and query coercion', async () => {
    await request(app.getHttpServer())
      .get('/api/purchases?page=1&limit=10&supplierId=supplier-1&locationId=loc-1&status=CONFIRMED&dateFrom=2026-07-01&dateTo=2026-07-31')
      .set('Authorization', 'Bearer warehouse-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Purchases retrieved successfully',
          data: expect.objectContaining({ total: 1, page: 1, limit: 10, totalPages: 1 }),
        });
      });

    expect(purchasesService.findAll).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10, supplierId: 'supplier-1', locationId: 'loc-1', status: PurchaseStatus.CONFIRMED }));
  });

  it('requires Idempotency-Key for mutating purchase endpoints', async () => {
    await request(app.getHttpServer())
      .post('/api/purchases')
      .set('Authorization', 'Bearer warehouse-token')
      .send({ supplierId: 'supplier-1', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: 1, unitCost: 10 }] })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/purchases/purchase-1/cancel')
      .set('Authorization', 'Bearer admin-token')
      .send({ reason: 'Wrong capture' })
      .expect(400);
  });

  it('creates purchases with current user and cancel is ADMIN-only with reason', async () => {
    await request(app.getHttpServer())
      .post('/api/purchases')
      .set('Authorization', 'Bearer warehouse-token')
      .set('Idempotency-Key', 'idem-1')
      .send({ supplierId: 'supplier-1', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: 1, unitCost: 10 }] })
      .expect(201);
    expect(purchasesService.create).toHaveBeenCalledWith(expect.any(Object), warehouseUser, 'idem-1');

    await request(app.getHttpServer())
      .post('/api/purchases/purchase-1/cancel')
      .set('Authorization', 'Bearer warehouse-token')
      .set('Idempotency-Key', 'cancel-idem')
      .send({ reason: 'Wrong capture' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/purchases/purchase-1/cancel')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'cancel-idem')
      .send({ reason: 'Wrong capture' })
      .expect(200)
      .expect(({ body }) => expect(body.data.status).toBe(PurchaseStatus.CANCELLED));
    expect(purchasesService.cancel).toHaveBeenCalledWith('purchase-1', expect.objectContaining({ reason: 'Wrong capture' }), adminUser, 'cancel-idem');
  });

  it('validates purchase body and cancellation reason before service calls', async () => {
    purchasesService.create.mockRejectedValue(new BadRequestException('Should not be reached'));

    await request(app.getHttpServer())
      .post('/api/purchases')
      .set('Authorization', 'Bearer warehouse-token')
      .set('Idempotency-Key', 'idem-1')
      .send({ supplierId: 'supplier-1', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: -1, unitCost: 10 }] })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/purchases/purchase-1/cancel')
      .set('Authorization', 'Bearer admin-token')
      .set('Idempotency-Key', 'cancel-idem')
      .send({ reason: '' })
      .expect(400);
  });
});
