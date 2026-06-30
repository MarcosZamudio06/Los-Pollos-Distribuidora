import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

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

const categoryResponse = {
  id: 'category-1',
  name: 'Cortes',
  description: 'Cortes por kilogramo',
  isActive: true,
};

describe('CategoriesController API', () => {
  let app: INestApplication<App>;
  let authService: jest.Mocked<Pick<AuthService, 'verifyAccessToken'>>;
  let categoriesService: jest.Mocked<
    Pick<CategoriesService, 'findAll' | 'create' | 'update' | 'deactivate'>
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
    categoriesService = {
      findAll: jest.fn().mockResolvedValue({ items: [categoryResponse] }),
      create: jest.fn().mockResolvedValue(categoryResponse),
      update: jest.fn().mockResolvedValue(categoryResponse),
      deactivate: jest.fn().mockResolvedValue({
        ...categoryResponse,
        isActive: false,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: CategoriesService, useValue: categoriesService },
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

  it('allows ADMIN, WAREHOUSE, and SELLER to list categories with documented filters', async () => {
    await request(app.getHttpServer())
      .get('/api/categories?page=1&limit=10&search=cor&isActive=true')
      .set('Authorization', 'Bearer seller-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Categories retrieved successfully',
          data: { items: [categoryResponse] },
        });
      });

    expect(categoriesService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 10,
        search: 'cor',
        isActive: true,
      }),
    );
  });

  it('allows ADMIN and WAREHOUSE to create and update categories, but rejects missing names', async () => {
    await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', 'Bearer warehouse-token')
      .send({ name: 'Cortes', description: 'Cortes por kilogramo' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Category created successfully',
          data: categoryResponse,
        });
      });

    expect(categoriesService.create).toHaveBeenCalledWith({
      name: 'Cortes',
      description: 'Cortes por kilogramo',
    });

    await request(app.getHttpServer())
      .patch('/api/categories/category-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ description: 'Cortes actualizados' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Category updated successfully',
          data: categoryResponse,
        });
      });

    await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', 'Bearer admin-token')
      .send({ description: 'Sin nombre' })
      .expect(400);
  });

  it('rejects blank category names before reaching the service', async () => {
    await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: '   ' })
      .expect(400);

    expect(categoriesService.create).not.toHaveBeenCalled();
  });

  it('restricts writes by role and soft-deactivates categories through DELETE', async () => {
    await request(app.getHttpServer())
      .post('/api/categories')
      .set('Authorization', 'Bearer seller-token')
      .send({ name: 'Cortes' })
      .expect(403);

    await request(app.getHttpServer())
      .delete('/api/categories/category-1')
      .set('Authorization', 'Bearer warehouse-token')
      .expect(403);

    await request(app.getHttpServer())
      .delete('/api/categories/category-1')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Category deactivated successfully',
          data: { ...categoryResponse, isActive: false },
        });
      });

    expect(categoriesService.deactivate).toHaveBeenCalledWith('category-1');
  });
});
