import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthService } from '../auth/auth.service';
import { BranchSupplyReceiptsController } from './branch-supply-receipts.controller';
import { BranchSupplyReceiptsService } from './branch-supply-receipts.service';

const adminUser = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@pollos.local',
  role: 'ADMIN',
  operationalLocationId: 'cedis-1',
  mustChangePassword: false,
  permissions: Object.values(PERMISSIONS),
};

describe('BranchSupplyReceiptsController API', () => {
  let app: INestApplication<App>;
  let receiptService: jest.Mocked<BranchSupplyReceiptsService>;

  beforeEach(async () => {
    const authService = {
      verifyAccessToken: jest.fn().mockResolvedValue(adminUser),
    } as unknown as AuthService;
    receiptService = {
      list: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 25,
        totalPages: 0,
      }),
      findOne: jest.fn().mockResolvedValue({ id: 'transfer-1' }),
      receive: jest
        .fn()
        .mockResolvedValue({ id: 'transfer-1', status: 'RECEIVED' }),
    } as unknown as jest.Mocked<BranchSupplyReceiptsService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BranchSupplyReceiptsController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: BranchSupplyReceiptsService, useValue: receiptService },
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
      new RolesGuard(new Reflector()),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('lists incoming supplies with a validated business date', async () => {
    await request(app.getHttpServer())
      .get('/api/cedis/incoming-supplies')
      .set('Authorization', 'Bearer token')
      .query({
        businessDate: '2026-08-05',
        status: 'PENDING',
        page: '2',
        limit: '10',
      })
      .expect(200);

    expect(receiptService.list.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        businessDate: '2026-08-05',
        status: 'PENDING',
        page: 2,
        limit: 10,
      }),
    );
    expect(receiptService.list.mock.calls[0][1]).toBe(adminUser);
  });

  it('requires idempotency for a receipt command and passes the validated payload', async () => {
    await request(app.getHttpServer())
      .post('/api/cedis/incoming-supplies/transfer-1/receive')
      .set('Authorization', 'Bearer token')
      .send({
        expectedCycleVersion: 2,
        items: [{ transferItemId: 'item-1', quantityKg: 5 }],
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/cedis/incoming-supplies/transfer-1/receive')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'receipt-key')
      .send({
        expectedCycleVersion: 2,
        notes: 'Sin diferencia',
        items: [{ transferItemId: 'item-1', quantityKg: 5 }],
      })
      .expect(201);

    expect(receiptService.receive.mock.calls[0]).toEqual([
      'transfer-1',
      expect.objectContaining({
        expectedCycleVersion: 2,
        notes: 'Sin diferencia',
      }),
      adminUser,
      'receipt-key',
    ]);
  });
});
