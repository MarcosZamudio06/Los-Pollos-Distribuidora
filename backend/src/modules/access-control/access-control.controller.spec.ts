import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';

const admin = {
  id: 'admin-1',
  name: 'Admin',
  email: 'admin@pollos.local',
  role: 'ADMIN',
  permissions: [
    PERMISSIONS.ROLES_READ,
    PERMISSIONS.ACCESS_PROFILES_MANAGE,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.USER_SESSIONS_REVOKE,
    PERMISSIONS.ACCESS_AUDIT_READ,
  ],
  mustChangePassword: false,
  authSessionId: 'session-admin',
};
const seller = { ...admin, id: 'seller-1', role: 'SELLER', permissions: [] };

describe('AccessControlController', () => {
  let app: INestApplication<App>;
  let service: jest.Mocked<Pick<AccessControlService, 'listPermissions' | 'listRoles' | 'updateRolePermissions' | 'listAuditLogs'>>;

  beforeEach(async () => {
    service = {
      listPermissions: jest.fn().mockResolvedValue([]),
      listRoles: jest.fn().mockResolvedValue([]),
      updateRolePermissions: jest.fn().mockResolvedValue({ changed: true }),
      listAuditLogs: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 25 }),
    };
    const module = await Test.createTestingModule({
      controllers: [AccessControlController],
      providers: [
        JwtAuthGuard,
        PermissionsGuard,
        { provide: AccessControlService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            verifyAccessToken: jest.fn((token: string) =>
              token === 'admin-token' ? Promise.resolve(admin) : token === 'seller-token' ? Promise.resolve(seller) : Promise.reject(new Error('Invalid token')),
            ),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalGuards(module.get(JwtAuthGuard), module.get(PermissionsGuard));
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => app.close());

  it('protects profile reads globally and allows the declared permission', async () => {
    await request(app.getHttpServer()).get('/api/roles').expect(401);
    await request(app.getHttpServer()).get('/api/roles').set('Authorization', 'Bearer seller-token').expect(403);
    await request(app.getHttpServer()).get('/api/roles').set('Authorization', 'Bearer admin-token').expect(200);
    expect(service.listRoles).toHaveBeenCalled();
  });

  it('passes the optimistic version, reason, and authenticated actor to profile updates', async () => {
    await request(app.getHttpServer())
      .patch('/api/roles/role-1/permissions')
      .set('Authorization', 'Bearer admin-token')
      .send({ permissionKeys: [PERMISSIONS.COSTS_READ], expectedVersion: 4, reason: 'Separación de costos' })
      .expect(200);

    expect(service.updateRolePermissions).toHaveBeenCalledWith(
      'role-1',
      { permissionKeys: [PERMISSIONS.COSTS_READ], expectedVersion: 4, reason: 'Separación de costos' },
      expect.objectContaining({ id: 'admin-1' }),
      expect.objectContaining({ ipAddress: expect.any(String) }),
    );
  });
});
