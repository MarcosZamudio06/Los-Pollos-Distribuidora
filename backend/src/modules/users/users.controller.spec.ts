import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../auth/auth.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const adminUser = {
  id: 'admin-1',
  name: 'Development Admin',
  email: 'admin@pollos.local',
  role: 'ADMIN',
  mustChangePassword: false,
};

const cashierUser = {
  id: 'cashier-1',
  name: 'Development Cashier',
  email: 'cashier@pollos.local',
  role: 'CASHIER',
  mustChangePassword: false,
};

const userResponse = {
  id: 'user-1',
  name: 'Route Seller',
  email: 'seller@pollos.local',
  roleId: 'role-cashier',
  role: { id: 'role-cashier', name: 'CASHIER' },
  isActive: true,
  mustChangePassword: true,
  createdAt: new Date('2026-06-26T12:00:00.000Z'),
  updatedAt: new Date('2026-06-26T12:00:00.000Z'),
  deactivatedAt: null,
  deactivatedByUserId: null,
  deactivationReason: null,
};

const serializedUserResponse = {
  ...userResponse,
  createdAt: userResponse.createdAt.toISOString(),
  updatedAt: userResponse.updatedAt.toISOString(),
};

type ApiResponseBody = {
  success: boolean;
  message: string;
  data: typeof serializedUserResponse;
};

describe('UsersController API', () => {
  let app: INestApplication<App>;
  let authService: jest.Mocked<Pick<AuthService, 'verifyAccessToken'>>;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findAll'
      | 'findOne'
      | 'create'
      | 'update'
      | 'updatePassword'
      | 'deactivate'
    >
  >;

  beforeEach(async () => {
    authService = {
      verifyAccessToken: jest.fn((token: string) => {
        if (token === 'admin-token') {
          return Promise.resolve(adminUser);
        }

        if (token === 'cashier-token') {
          return Promise.resolve(cashierUser);
        }

        return Promise.reject(new Error('Invalid token'));
      }),
    };
    usersService = {
      findAll: jest.fn().mockResolvedValue([userResponse]),
      findOne: jest.fn().mockResolvedValue(userResponse),
      create: jest.fn().mockResolvedValue(userResponse),
      update: jest.fn().mockResolvedValue(userResponse),
      updatePassword: jest.fn().mockResolvedValue(userResponse),
      deactivate: jest.fn().mockResolvedValue({
        ...userResponse,
        isActive: false,
        deactivatedByUserId: adminUser.id,
        deactivationReason: 'Left company',
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: UsersService, useValue: usersService },
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
    ['GET', '/api/users'],
    ['GET', '/api/users/user-1'],
    ['POST', '/api/users'],
    ['PATCH', '/api/users/user-1'],
    ['PATCH', '/api/users/user-1/password'],
    ['DELETE', '/api/users/user-1'],
  ])('rejects %s %s when the user is not ADMIN', async (method, path) => {
    await request(app.getHttpServer())
      [method.toLowerCase() as 'get'](path)
      .set('Authorization', 'Bearer cashier-token')
      .expect(403);
  });

  it('lists users with wrapper and without credential fields', async () => {
    await request(app.getHttpServer())
      .get('/api/users?status=all')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Users retrieved successfully',
          data: [serializedUserResponse],
        });
        expect(JSON.stringify(body)).not.toContain('passwordHash');
        expect(JSON.stringify(body)).not.toContain('temporaryPassword');
      });

    expect(usersService.findAll).toHaveBeenCalledWith({ status: 'all' });
  });

  it('returns one user with wrapper and without credential fields', async () => {
    await request(app.getHttpServer())
      .get('/api/users/user-1')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'User retrieved successfully',
          data: serializedUserResponse,
        });
        expect(JSON.stringify(body)).not.toContain('passwordHash');
      });
  });

  it('creates a user with DTO validation and safe response', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Route Seller',
        email: 'seller@pollos.local',
        roleId: 'role-cashier',
        temporaryPassword: 'safe-pass-123',
        passwordHash: 'malicious-input',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'User created successfully',
          data: serializedUserResponse,
        });
        expect(JSON.stringify(body)).not.toContain('passwordHash');
        expect(JSON.stringify(body)).not.toContain('safe-pass-123');
      });

    expect(usersService.create).toHaveBeenCalledWith({
      name: 'Route Seller',
      email: 'seller@pollos.local',
      roleId: 'role-cashier',
      temporaryPassword: 'safe-pass-123',
    });
  });

  it('rejects invalid create payloads before calling the service', async () => {
    await request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', 'Bearer admin-token')
      .send({
        name: 'Route Seller',
        email: 'not-an-email',
        roleId: 'role-cashier',
        temporaryPassword: 'short',
      })
      .expect(400);

    expect(usersService.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      'status filter',
      '/api/users?status=bad',
      () => expect(usersService.findAll).not.toHaveBeenCalled(),
    ],
    [
      'includeInactive filter',
      '/api/users?includeInactive=maybe',
      () => expect(usersService.findAll).not.toHaveBeenCalled(),
    ],
  ])(
    'rejects invalid %s query params before calling the service',
    async (_case, path, assertService) => {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', 'Bearer admin-token')
        .expect(400);

      assertService();
    },
  );

  it('rejects invalid update payloads before calling the service', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/user-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(usersService.update).not.toHaveBeenCalled();
  });

  it('rejects invalid password update payloads before calling the service', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/user-1/password')
      .set('Authorization', 'Bearer admin-token')
      .send({ temporaryPassword: 'short' })
      .expect(400);

    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('rejects invalid deactivate payloads before calling the service', async () => {
    await request(app.getHttpServer())
      .delete('/api/users/user-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ reason: 123 })
      .expect(400);

    expect(usersService.deactivate).not.toHaveBeenCalled();
  });

  it('updates a user through the documented PATCH route', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/user-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ name: 'Updated Seller', roleId: 'role-admin' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'User updated successfully',
          data: serializedUserResponse,
        });
      });

    expect(usersService.update).toHaveBeenCalledWith('user-1', {
      name: 'Updated Seller',
      roleId: 'role-admin',
    });
  });

  it('updates a temporary password without exposing credentials', async () => {
    await request(app.getHttpServer())
      .patch('/api/users/user-1/password')
      .set('Authorization', 'Bearer admin-token')
      .send({ temporaryPassword: 'new-safe-pass-123' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'User password updated successfully',
          data: serializedUserResponse,
        });
        expect(JSON.stringify(body)).not.toContain('new-safe-pass-123');
        expect(JSON.stringify(body)).not.toContain('passwordHash');
      });
  });

  it('deactivates users through DELETE without physical deletion semantics', async () => {
    await request(app.getHttpServer())
      .delete('/api/users/user-1')
      .set('Authorization', 'Bearer admin-token')
      .send({ reason: 'Left company' })
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as unknown as ApiResponseBody;

        expect(responseBody.success).toBe(true);
        expect(responseBody.message).toBe('User deactivated successfully');
        expect(responseBody.data).toMatchObject({
          id: 'user-1',
          isActive: false,
          deactivatedByUserId: adminUser.id,
          deactivationReason: 'Left company',
        });
      });

    expect(usersService.deactivate).toHaveBeenCalledWith(
      'user-1',
      adminUser.id,
      {
        reason: 'Left company',
      },
    );
  });
});
