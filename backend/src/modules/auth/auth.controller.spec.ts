import {
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const authenticatedUser = {
  id: 'user-1',
  name: 'Development Admin',
  email: 'dev.admin@pollos.local',
  role: 'ADMIN',
};

describe('AuthController API', () => {
  let app: INestApplication<App>;
  let authService: jest.Mocked<
    Pick<AuthService, 'login' | 'refresh' | 'logout' | 'verifyAccessToken'>
  >;

  beforeEach(async () => {
    authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: authenticatedUser,
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user: authenticatedUser,
      }),
      logout: jest.fn().mockReturnValue({ success: true }),
      verifyAccessToken: jest.fn().mockResolvedValue(authenticatedUser),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
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

  it('returns the documented login response for valid credentials', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: authenticatedUser.email, password: 'valid-password' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Sesión iniciada correctamente',
          data: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            user: authenticatedUser,
          },
        });
      });
  });

  it('rejects login when email is missing', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ password: 'valid-password' })
      .expect(400);

    expect(authService.login).not.toHaveBeenCalled();
  });

  it('rejects login when password is missing', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: authenticatedUser.email })
      .expect(400);

    expect(authService.login).not.toHaveBeenCalled();
  });

  it('returns refreshed tokens for a valid refresh token', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .send({ refreshToken: 'refresh-token' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Sesión renovada correctamente',
          data: {
            accessToken: 'new-access-token',
            refreshToken: 'new-refresh-token',
            user: authenticatedUser,
          },
        });
      });
  });

  it('rejects /me when no bearer token is provided', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);

    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('returns the authenticated user for /me with a valid token', async () => {
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Usuario autenticado',
          data: { user: authenticatedUser },
        });
      });
  });

  it('rejects logout when no bearer token is provided', async () => {
    await request(app.getHttpServer()).post('/api/auth/logout').expect(401);

    expect(authService.logout).not.toHaveBeenCalled();
  });

  it('returns the logout response for an authenticated request', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer access-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          success: true,
          message: 'Sesión cerrada correctamente',
          data: { success: true },
        });
      });
  });

  it('maps invalid bearer tokens to 401 at API level', async () => {
    authService.verifyAccessToken.mockRejectedValue(
      new UnauthorizedException('Invalid token'),
    );

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});
