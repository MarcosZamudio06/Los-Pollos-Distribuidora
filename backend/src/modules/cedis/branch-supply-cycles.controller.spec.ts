import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthService } from '../auth/auth.service';
import { BranchSupplyCyclesController } from './branch-supply-cycles.controller';
import { BranchSupplyCyclesService } from './branch-supply-cycles.service';

const adminUser = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@pollos.local',
  role: 'ADMIN',
  mustChangePassword: false,
  permissions: Object.values(PERMISSIONS),
};

describe('BranchSupplyCyclesController API', () => {
  let app: INestApplication<App>;
  let service: jest.Mocked<BranchSupplyCyclesService>;

  beforeEach(async () => {
    const authService = {
      verifyAccessToken: jest.fn().mockResolvedValue(adminUser),
    } as unknown as AuthService;
    service = {
      open: jest.fn().mockResolvedValue({ id: 'cycle-1', status: 'OPEN' }),
      findOne: jest.fn().mockResolvedValue({ id: 'cycle-1', status: 'OPEN' }),
      createSupply: jest.fn().mockResolvedValue({
        transfer: { id: 'transfer-1' },
        cycle: { id: 'cycle-1' },
      }),
      createReturn: jest.fn().mockResolvedValue({
        transfer: { id: 'transfer-2' },
        cycle: { id: 'cycle-1' },
      }),
      refresh: jest
        .fn()
        .mockResolvedValue({ id: 'cycle-1', status: 'READY_FOR_REVIEW' }),
    } as unknown as jest.Mocked<BranchSupplyCyclesService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BranchSupplyCyclesController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: BranchSupplyCyclesService, useValue: service },
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

  it('requires Idempotency-Key for cycle creation', async () => {
    await request(app.getHttpServer())
      .post('/api/cedis/branch-supply-cycles')
      .set('Authorization', 'Bearer token')
      .send({
        distributionCenterLocationId: 'cedis-1',
        branchLocationId: 'branch-1',
        businessDate: '2026-08-04',
      })
      .expect(400);

    expect(service.open.mock.calls).toHaveLength(0);
  });

  it('routes supply, return, refresh, and detail commands with the idempotency key', async () => {
    const requestBuilder = request(app.getHttpServer());

    await requestBuilder
      .post('/api/cedis/branch-supply-cycles')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'open-1')
      .send({
        distributionCenterLocationId: 'cedis-1',
        branchLocationId: 'branch-1',
        businessDate: '2026-08-04',
      })
      .expect(201);

    await requestBuilder
      .get('/api/cedis/branch-supply-cycles/cycle-1')
      .set('Authorization', 'Bearer token')
      .expect(200);

    await requestBuilder
      .post('/api/cedis/branch-supply-cycles/cycle-1/supplies')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'supply-1')
      .send({
        expectedVersion: 1,
        items: [{ productId: 'product-1', unit: 'KG', quantityKg: 2 }],
      })
      .expect(201);

    await requestBuilder
      .post('/api/cedis/branch-supply-cycles/cycle-1/returns')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'return-1')
      .send({
        expectedVersion: 2,
        items: [{ productId: 'product-1', unit: 'KG', quantityKg: 1 }],
      })
      .expect(201);

    await requestBuilder
      .post('/api/cedis/branch-supply-cycles/cycle-1/refresh')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'refresh-1')
      .send({ expectedVersion: 3 })
      .expect(201);

    expect(service.open.mock.calls[0]).toEqual([
      expect.objectContaining({ branchLocationId: 'branch-1' }),
      adminUser,
      'open-1',
    ]);
    expect(service.createSupply.mock.calls[0]).toEqual([
      'cycle-1',
      expect.objectContaining({ expectedVersion: 1 }),
      adminUser,
      'supply-1',
    ]);
    expect(service.createReturn.mock.calls[0]).toEqual([
      'cycle-1',
      expect.objectContaining({ expectedVersion: 2 }),
      adminUser,
      'return-1',
    ]);
    expect(service.refresh.mock.calls[0]).toEqual([
      'cycle-1',
      { expectedVersion: 3 },
      adminUser,
      'refresh-1',
    ]);
  });
});
