import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { OperationalLocationType } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthService } from '../auth/auth.service';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

const adminUser = {
  id: 'admin-1',
  name: 'Development Admin',
  email: 'admin@pollos.local',
  role: 'ADMIN',
  mustChangePassword: false,
  permissions: Object.values(PERMISSIONS),
};

const warehouseUser = {
  id: 'warehouse-1',
  name: 'Warehouse User',
  email: 'warehouse@pollos.local',
  role: 'WAREHOUSE',
  operationalLocationId: 'cedis-1',
  mustChangePassword: false,
  permissions: [PERMISSIONS.CEDIS_VIEW],
};

const sellerUser = {
  id: 'seller-1',
  name: 'Seller User',
  email: 'seller@pollos.local',
  role: 'SELLER',
  operationalLocationId: 'location-1',
  mustChangePassword: false,
  permissions: [PERMISSIONS.CEDIS_VIEW],
};

const driverUser = {
  id: 'driver-1',
  name: 'Driver User',
  email: 'driver@pollos.local',
  role: 'DRIVER',
  mustChangePassword: false,
};

const locationResponse = {
  id: 'location-1',
  name: 'Almacén Principal',
  code: 'ALM-001',
  type: OperationalLocationType.WAREHOUSE,
  parentId: null,
  address: 'Dirección operativa',
  isActive: true,
  createdAt: '2026-06-29T12:00:00.000Z',
  updatedAt: '2026-06-29T12:00:00.000Z',
};

const branchLocationResponse = {
  ...locationResponse,
  id: 'branch-1',
  name: 'Sucursal Veracruz',
  type: OperationalLocationType.BRANCH,
  parentId: 'cedis-1',
};

describe('LocationsController API', () => {
  let app: INestApplication<App>;
  let authService: jest.Mocked<Pick<AuthService, 'verifyAccessToken'>>;
  let locationsService: jest.Mocked<
    Pick<
      LocationsService,
      | 'findAll'
      | 'findOne'
      | 'findActiveBranches'
      | 'create'
      | 'update'
      | 'deactivate'
    >
  >;

  beforeEach(async () => {
    authService = {
      verifyAccessToken: jest.fn((token: string) => {
        if (token === 'admin-token') {
          return Promise.resolve(adminUser);
        }
        if (token === 'admin-without-cedis-manage-token') {
          return Promise.resolve({
            ...adminUser,
            permissions: adminUser.permissions.filter(
              (permission) => permission !== PERMISSIONS.CEDIS_MANAGE,
            ),
          });
        }
        if (token === 'warehouse-token') {
          return Promise.resolve(warehouseUser);
        }
        if (token === 'warehouse-without-cedis-view-token') {
          return Promise.resolve({ ...warehouseUser, permissions: [] });
        }
        if (token === 'seller-token') {
          return Promise.resolve(sellerUser);
        }
        if (token === 'driver-token') {
          return Promise.resolve(driverUser);
        }

        return Promise.reject(new Error('Invalid token'));
      }),
    };
    locationsService = {
      findAll: jest.fn().mockResolvedValue({ items: [locationResponse] }),
      findOne: jest.fn().mockResolvedValue(locationResponse),
      findActiveBranches: jest
        .fn()
        .mockResolvedValue({ items: [branchLocationResponse] }),
      create: jest.fn().mockResolvedValue(locationResponse),
      update: jest.fn().mockResolvedValue(locationResponse),
      deactivate: jest.fn().mockResolvedValue({
        ...locationResponse,
        isActive: false,
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [LocationsController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: LocationsService, useValue: locationsService },
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
    app.useGlobalGuards(
      new JwtAuthGuard(authService, new Reflector()),
      new PermissionsGuard(new Reflector()),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('exposes documented read routes for operational roles with filters', async () => {
    await request(app.getHttpServer())
      .get('/api/locations?page=1&limit=10&type=WAREHOUSE&isActive=true')
      .set('Authorization', 'Bearer seller-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Locations retrieved successfully',
          data: { items: [locationResponse] },
        });
      });

    await request(app.getHttpServer())
      .get('/api/locations/location-1')
      .set('Authorization', 'Bearer driver-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(locationResponse);
      });

    expect(locationsService.findAll).toHaveBeenCalledWith(
      sellerUser,
      expect.objectContaining({
        page: 1,
        limit: 10,
        type: OperationalLocationType.WAREHOUSE,
        isActive: true,
      }),
    );
    expect(locationsService.findOne).toHaveBeenCalledWith(
      'location-1',
      driverUser,
    );
  });

  it('exposes active direct branches only to authorized CEDIS roles', async () => {
    await request(app.getHttpServer())
      .get('/api/locations/cedis-1/branches')
      .set('Authorization', 'Bearer warehouse-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual({ items: [branchLocationResponse] });
      });

    await request(app.getHttpServer())
      .get('/api/locations/cedis-1/branches')
      .set('Authorization', 'Bearer warehouse-without-cedis-view-token')
      .expect(403);

    await request(app.getHttpServer())
      .get('/api/locations/cedis-1/branches')
      .set('Authorization', 'Bearer seller-token')
      .expect(403);

    expect(locationsService.findActiveBranches).toHaveBeenCalledWith(
      'cedis-1',
      warehouseUser,
    );
  });

  it('accepts paired coordinates and rejects an unpaired coordinate', async () => {
    await request(app.getHttpServer())
      .post('/api/locations')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'CEDIS Veracruz',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        latitude: 19.183,
        longitude: -96.134,
      })
      .expect(201);

    expect(locationsService.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ latitude: 19.183, longitude: -96.134 }),
    );

    await request(app.getHttpServer())
      .post('/api/locations')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'CEDIS sin longitud',
        type: OperationalLocationType.DISTRIBUTION_CENTER,
        latitude: 19.183,
      })
      .expect(400);
  });

  it('allows only ADMIN to create locations and validates the documented type catalog', async () => {
    await request(app.getHttpServer())
      .post('/api/locations')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Punto externo',
        code: 'EXT-001',
        type: OperationalLocationType.EXTERNAL_POINT_OF_SALE,
        address: 'Dirección operativa',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Location created successfully',
          data: locationResponse,
        });
      });

    expect(locationsService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Punto externo',
        code: 'EXT-001',
        type: OperationalLocationType.EXTERNAL_POINT_OF_SALE,
      }),
    );

    await request(app.getHttpServer())
      .post('/api/locations')
      .set('Authorization', 'Bearer warehouse-token')
      .send({ name: 'Almacén', type: OperationalLocationType.WAREHOUSE })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/locations')
      .set('Authorization', 'Bearer admin-without-cedis-manage-token')
      .send({ name: 'Sin permiso', type: OperationalLocationType.WAREHOUSE })
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/locations')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Inválida', type: 'KITCHEN' })
      .expect(400);
  });

  it('updates and soft-deactivates locations through documented admin routes', async () => {
    await request(app.getHttpServer())
      .patch('/api/locations/location-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ address: 'Nueva dirección', isActive: true })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Location updated successfully',
          data: locationResponse,
        });
      });

    expect(locationsService.update).toHaveBeenCalledWith('location-1', {
      address: 'Nueva dirección',
      isActive: true,
    });

    await request(app.getHttpServer())
      .delete('/api/locations/location-1')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toEqual(expect.objectContaining({ isActive: false }));
      });

    expect(locationsService.deactivate).toHaveBeenCalledWith('location-1');
  });
});
