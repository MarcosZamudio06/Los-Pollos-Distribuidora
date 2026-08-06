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
import { CedisDashboardController } from './cedis-dashboard.controller';
import { CedisDashboardQueryService } from './cedis-dashboard.query.service';
import { CedisInventorySummaryQueryService } from './cedis-inventory-summary.query.service';

const adminUser = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@pollos.local',
  role: 'ADMIN',
  mustChangePassword: false,
  permissions: Object.values(PERMISSIONS),
};

describe('CedisDashboardController API', () => {
  let app: INestApplication<App>;
  let queryService: jest.Mocked<CedisDashboardQueryService>;
  let inventorySummaryService: jest.Mocked<CedisInventorySummaryQueryService>;

  beforeEach(async () => {
    const authService = {
      verifyAccessToken: jest.fn().mockResolvedValue(adminUser),
    } as unknown as AuthService;
    queryService = {
      getDashboard: jest.fn().mockResolvedValue({ items: [] }),
      getBranchHistory: jest.fn().mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 25,
        totalPages: 0,
      }),
      getCycleSummary: jest.fn().mockResolvedValue({ id: 'cycle-1' }),
    } as unknown as jest.Mocked<CedisDashboardQueryService>;
    inventorySummaryService = {
      getSummary: jest.fn().mockResolvedValue({ items: [], totals: {} }),
    } as unknown as jest.Mocked<CedisInventorySummaryQueryService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [CedisDashboardController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: CedisDashboardQueryService, useValue: queryService },
        {
          provide: CedisInventorySummaryQueryService,
          useValue: inventorySummaryService,
        },
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

  it('routes dashboard filters to the query service', async () => {
    await request(app.getHttpServer())
      .get('/api/cedis/dashboard')
      .set('Authorization', 'Bearer token')
      .query({
        cedisLocationId: 'cedis-1',
        businessDate: '2026-08-04',
        status: 'CLOSED',
        search: 'centro',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body.success).toBe(true);
        expect(body.data.items).toEqual([]);
      });

    expect(queryService.getDashboard.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        cedisLocationId: 'cedis-1',
        businessDate: '2026-08-04',
        status: 'CLOSED',
        search: 'centro',
      }),
    );
    expect(queryService.getDashboard.mock.calls[0][1]).toBe(adminUser);
  });

  it('validates and routes history pagination', async () => {
    await request(app.getHttpServer())
      .get('/api/cedis/branches/branch-1/history')
      .set('Authorization', 'Bearer token')
      .query({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        status: 'READY_FOR_REVIEW',
        page: '2',
        limit: '50',
      })
      .expect(200);

    expect(queryService.getBranchHistory.mock.calls[0]).toEqual([
      'branch-1',
      expect.objectContaining({
        dateFrom: '2026-08-01',
        dateTo: '2026-08-31',
        status: 'READY_FOR_REVIEW',
        page: 2,
        limit: 50,
      }),
      adminUser,
    ]);
  });

  it('routes the cycle summary endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/cedis/branch-supply-cycles/cycle-1/summary')
      .set('Authorization', 'Bearer token')
      .expect(200);

    expect(queryService.getCycleSummary.mock.calls[0]).toEqual([
      'cycle-1',
      adminUser,
    ]);
  });

  it('routes the CEDIS inventory summary endpoint', async () => {
    await request(app.getHttpServer())
      .get('/api/cedis/inventory-summary')
      .set('Authorization', 'Bearer token')
      .query({ cedisLocationId: 'cedis-1', businessDate: '2026-08-04' })
      .expect(200);

    expect(inventorySummaryService.getSummary.mock.calls[0]).toEqual([
      expect.objectContaining({
        cedisLocationId: 'cedis-1',
        businessDate: '2026-08-04',
      }),
      adminUser,
    ]);
  });
});
