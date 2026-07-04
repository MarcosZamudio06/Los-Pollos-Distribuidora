import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

const adminUser = {
  id: 'admin-1',
  name: 'Development Admin',
  email: 'admin@pollos.local',
  role: 'ADMIN',
  mustChangePassword: false,
};

const warehouseUser = {
  id: 'warehouse-1',
  name: 'Warehouse User',
  email: 'warehouse@pollos.local',
  role: 'WAREHOUSE',
  mustChangePassword: false,
};

const sellerUser = {
  id: 'seller-1',
  name: 'Seller User',
  email: 'seller@pollos.local',
  role: 'SELLER',
  mustChangePassword: false,
};

const supplierResponse = {
  id: 'supplier-1',
  name: 'Proveedor Norte',
  phone: '555-0101',
  email: 'norte@example.com',
  address: 'Central de abasto',
  isActive: true,
};

describe('SuppliersController API', () => {
  let app: INestApplication<App>;
  let authService: jest.Mocked<Pick<AuthService, 'verifyAccessToken'>>;
  let suppliersService: jest.Mocked<
    Pick<
      SuppliersService,
      'findAll' | 'findOne' | 'create' | 'update' | 'deactivate'
    >
  >;

  beforeEach(async () => {
    authService = {
      verifyAccessToken: jest.fn((token: string) => {
        if (token === 'admin-token') {
          return Promise.resolve(adminUser);
        }
        if (token === 'warehouse-token') {
          return Promise.resolve(warehouseUser);
        }
        if (token === 'seller-token') {
          return Promise.resolve(sellerUser);
        }

        return Promise.reject(new Error('Invalid token'));
      }),
    };
    suppliersService = {
      findAll: jest.fn().mockResolvedValue({
        items: [supplierResponse],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      }),
      findOne: jest.fn().mockResolvedValue(supplierResponse),
      create: jest.fn().mockResolvedValue(supplierResponse),
      update: jest.fn().mockResolvedValue(supplierResponse),
      deactivate: jest.fn().mockResolvedValue({
        ...supplierResponse,
        isActive: false,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SuppliersController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SuppliersService, useValue: suppliersService },
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

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['GET', '/api/suppliers'],
    ['GET', '/api/suppliers/supplier-1'],
    ['POST', '/api/suppliers'],
    ['PATCH', '/api/suppliers/supplier-1'],
  ])('allows WAREHOUSE access for %s %s', async (method, path) => {
    await request(app.getHttpServer())
      [method.toLowerCase() as 'get' | 'post' | 'patch'](path)
      .set('Authorization', 'Bearer warehouse-token')
      .send(method === 'GET' ? undefined : { name: 'Proveedor Norte' })
      .expect(method === 'POST' ? 201 : 200);
  });

  it.each([
    ['GET', '/api/suppliers'],
    ['GET', '/api/suppliers/supplier-1'],
    ['POST', '/api/suppliers'],
    ['PATCH', '/api/suppliers/supplier-1'],
    ['DELETE', '/api/suppliers/supplier-1'],
  ])('rejects SELLER access for %s %s', async (method, path) => {
    await request(app.getHttpServer())
      [method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path)
      .set('Authorization', 'Bearer seller-token')
      .send(method === 'GET' ? undefined : { name: 'Proveedor Norte' })
      .expect(403);
  });

  it('lists suppliers with documented wrapper and query coercion', async () => {
    await request(app.getHttpServer())
      .get('/api/suppliers?page=1&limit=10&search=norte&isActive=true')
      .set('Authorization', 'Bearer warehouse-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Suppliers retrieved successfully',
          data: {
            items: [supplierResponse],
            total: 1,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
        });
      });

    expect(suppliersService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 10,
        search: 'norte',
        isActive: true,
      }),
    );
  });

  it('validates supplier creation body and soft-deactivates only for ADMIN', async () => {
    await request(app.getHttpServer())
      .post('/api/suppliers')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Proveedor Norte', email: 'not-an-email' })
      .expect(400);

    await request(app.getHttpServer())
      .delete('/api/suppliers/supplier-1')
      .set('Authorization', 'Bearer warehouse-token')
      .expect(403);

    await request(app.getHttpServer())
      .delete('/api/suppliers/supplier-1')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Supplier deactivated successfully',
          data: { ...supplierResponse, isActive: false },
        });
      });

    expect(suppliersService.deactivate).toHaveBeenCalledWith('supplier-1');
  });
});
