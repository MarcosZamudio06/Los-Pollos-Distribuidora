import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EquivalentStatus, ProductUnit } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { ProductEquivalencesController } from './product-equivalences.controller';
import { ProductEquivalencesService } from './product-equivalences.service';

const adminUser = { id: 'admin-1', name: 'Admin', email: 'admin@pollos.local', role: 'ADMIN', mustChangePassword: false };
const warehouseUser = { id: 'warehouse-1', name: 'Warehouse', email: 'warehouse@pollos.local', role: 'WAREHOUSE', mustChangePassword: false };
const sellerUser = { id: 'seller-1', name: 'Seller', email: 'seller@pollos.local', role: 'SELLER', mustChangePassword: false };

const equivalenceResponse = {
  id: 'equivalence-1',
  productId: 'product-1',
  unitFrom: ProductUnit.PIECE,
  unitTo: ProductUnit.KG,
  factor: 1.8,
  roundingMode: 'PENDING_BUSINESS_RULE',
  effectiveFrom: '2026-06-19T00:00:00.000Z',
  effectiveTo: null,
  status: EquivalentStatus.DRAFT,
  approvedByUserId: null,
  createdByUserId: 'admin-1',
};

describe('ProductEquivalencesController API', () => {
  let app: INestApplication<App>;
  let service: jest.Mocked<Pick<ProductEquivalencesService, 'findAll' | 'create' | 'update' | 'activate' | 'deactivate'>>;

  beforeEach(async () => {
    const authService = {
      verifyAccessToken: jest.fn((token: string) => {
        if (token === 'admin-token') return Promise.resolve(adminUser);
        if (token === 'warehouse-token') return Promise.resolve(warehouseUser);
        if (token === 'seller-token') return Promise.resolve(sellerUser);
        return Promise.reject(new Error('Invalid token'));
      }),
    };
    service = {
      findAll: jest.fn().mockResolvedValue({ items: [equivalenceResponse] }),
      create: jest.fn().mockResolvedValue(equivalenceResponse),
      update: jest.fn().mockResolvedValue(equivalenceResponse),
      activate: jest.fn().mockResolvedValue({ ...equivalenceResponse, status: EquivalentStatus.ACTIVE }),
      deactivate: jest.fn().mockResolvedValue({ ...equivalenceResponse, status: EquivalentStatus.INACTIVE }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProductEquivalencesController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ProductEquivalencesService, useValue: service },
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

  it('allows SELLER read access and forwards documented filters', async () => {
    await request(app.getHttpServer())
      .get('/api/products/product-1/equivalences?status=DRAFT&unitFrom=PIECE&unitTo=KG&date=2026-06-29')
      .set('Authorization', 'Bearer seller-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ success: true, message: 'Product equivalences retrieved successfully', data: { items: [equivalenceResponse] } });
      });

    expect(service.findAll).toHaveBeenCalledWith('product-1', expect.objectContaining({ status: EquivalentStatus.DRAFT, unitFrom: ProductUnit.PIECE, unitTo: ProductUnit.KG, date: '2026-06-29' }));
  });

  it('allows ADMIN to create, activate, and deactivate equivalences', async () => {
    await request(app.getHttpServer())
      .post('/api/products/product-1/equivalences')
      .set('Authorization', 'Bearer admin-token')
      .send({ unitFrom: ProductUnit.PIECE, unitTo: ProductUnit.KG, factor: 1.8, roundingMode: 'PENDING_BUSINESS_RULE', effectiveFrom: '2026-06-19', status: EquivalentStatus.DRAFT })
      .expect(201);
    expect(service.create).toHaveBeenCalledWith('product-1', 'admin-1', expect.objectContaining({ factor: 1.8 }));

    await request(app.getHttpServer()).post('/api/product-equivalences/equivalence-1/activate').set('Authorization', 'Bearer admin-token').expect(201);
    expect(service.activate).toHaveBeenCalledWith('equivalence-1', 'admin-1');

    await request(app.getHttpServer()).post('/api/product-equivalences/equivalence-1/deactivate').set('Authorization', 'Bearer admin-token').expect(201);
    expect(service.deactivate).toHaveBeenCalledWith('equivalence-1');
  });

  it('rejects SELLER and WAREHOUSE mutations', async () => {
    await request(app.getHttpServer())
      .post('/api/products/product-1/equivalences')
      .set('Authorization', 'Bearer warehouse-token')
      .send({ unitFrom: ProductUnit.PIECE, unitTo: ProductUnit.KG, factor: 1.8, status: EquivalentStatus.DRAFT })
      .expect(403);

    await request(app.getHttpServer())
      .patch('/api/product-equivalences/equivalence-1')
      .set('Authorization', 'Bearer seller-token')
      .send({ factor: 1.9 })
      .expect(403);
  });

  it('passes the current admin to PATCH and rejects invalid equivalence units at DTO level', async () => {
    await request(app.getHttpServer())
      .patch('/api/product-equivalences/equivalence-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ status: EquivalentStatus.INACTIVE })
      .expect(200);
    expect(service.update).toHaveBeenCalledWith('equivalence-1', 'admin-1', expect.objectContaining({ status: EquivalentStatus.INACTIVE }));

    await request(app.getHttpServer())
      .post('/api/products/product-1/equivalences')
      .set('Authorization', 'Bearer admin-token')
      .send({ unitFrom: ProductUnit.KG_AND_PIECE, unitTo: ProductUnit.KG, factor: 1.8, status: EquivalentStatus.DRAFT })
      .expect(400);
  });
});
