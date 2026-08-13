import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AuthService } from '../auth/auth.service';
import { BranchReturnsController } from './branch-returns.controller';
import { BranchReturnsService } from './branch-returns.service';

const admin = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@example.test',
  role: 'ADMIN',
  mustChangePassword: false,
  permissions: Object.values(PERMISSIONS),
};
const seller = {
  id: 'seller-1',
  name: 'Seller',
  email: 'seller@example.test',
  role: 'SELLER',
  mustChangePassword: false,
  operationalLocationId: 'branch-1',
  permissions: [PERMISSIONS.CEDIS_VIEW, PERMISSIONS.CEDIS_REQUEST_RETURNS],
};

describe('BranchReturnsController API', () => {
  let app: INestApplication<App>;
  let service: jest.Mocked<BranchReturnsService>;

  beforeEach(async () => {
    const authService = {
      verifyAccessToken: jest.fn((token: string) =>
        token === 'seller' ? seller : admin,
      ),
    } as unknown as AuthService;
    service = {
      list: jest
        .fn()
        .mockResolvedValue({
          items: [],
          total: 0,
          page: 1,
          limit: 25,
          totalPages: 0,
        }),
      findOne: jest.fn(),
      complete: jest
        .fn()
        .mockResolvedValue({ id: 'return-1', status: 'COMPLETED' }),
    } as unknown as jest.Mocked<BranchReturnsService>;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [BranchReturnsController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: BranchReturnsService, useValue: service },
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

  afterEach(async () => app.close());

  it('lists scoped return records and delegates completion with the idempotency key', async () => {
    await request(app.getHttpServer())
      .get('/api/cedis/returns?businessDate=2026-08-05&status=PENDING')
      .set('Authorization', 'Bearer token')
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/cedis/returns/return-1/complete')
      .set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'complete-key')
      .expect(201);
    expect(service.list.mock.calls).toContainEqual([
      expect.objectContaining({
        businessDate: '2026-08-05',
        status: 'PENDING',
      }),
      admin,
    ]);
    expect(service.complete.mock.calls).toContainEqual([
      'return-1',
      admin,
      'complete-key',
    ]);
  });

  it('does not allow a seller to complete a return even when they can view the queue', async () => {
    await request(app.getHttpServer())
      .post('/api/cedis/returns/return-1/complete')
      .set('Authorization', 'Bearer seller')
      .set('Idempotency-Key', 'seller-key')
      .expect(403);
    expect(service.complete.mock.calls).toHaveLength(0);
  });
});
