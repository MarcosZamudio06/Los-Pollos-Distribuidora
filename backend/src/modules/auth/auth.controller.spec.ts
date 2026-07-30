import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const authenticatedPrincipal = {
  id: 'user-1',
  name: 'Development Admin',
  email: 'dev.admin@pollos.local',
  role: 'ADMIN',
  operationalLocationId: 'location-1',
  mustChangePassword: false,
  authSessionId: 'session-1',
};
const publicUser = {
  id: authenticatedPrincipal.id,
  name: authenticatedPrincipal.name,
  email: authenticatedPrincipal.email,
  role: authenticatedPrincipal.role,
  operationalLocationId: authenticatedPrincipal.operationalLocationId,
  mustChangePassword: false,
};

describe('AuthController persistent session API', () => {
  let app: INestApplication<App>;
  let authService: jest.Mocked<
    Pick<
      AuthService,
      'login' | 'refresh' | 'logout' | 'verifyAccessToken' | 'changeOwnPassword'
    >
  >;

  beforeEach(async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    authService = {
      login: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenExpiresAt: expiresAt,
        user: publicUser,
      }),
      refresh: jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        refreshTokenExpiresAt: expiresAt,
        user: publicUser,
      }),
      logout: jest.fn().mockResolvedValue({ success: true }),
      verifyAccessToken: jest.fn().mockResolvedValue(authenticatedPrincipal),
      changeOwnPassword: jest.fn().mockResolvedValue(publicUser),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterEach(async () => app.close());

  it('sets an HttpOnly refresh cookie without exposing it in login JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: publicUser.email, password: 'valid-password' })
      .expect(200);

    expect(response.body.data).toEqual({
      accessToken: 'access-token',
      user: publicUser,
    });
    expect(JSON.stringify(response.body)).not.toContain('refresh-token');
    expect(response.headers['set-cookie'][0]).toMatch(
      /refresh_token=refresh-token;.*HttpOnly;.*SameSite=Strict/,
    );
  });

  it('requires the refresh cookie and rotates it in the response', async () => {
    await request(app.getHttpServer()).post('/api/auth/refresh').expect(401);

    const response = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=refresh-token')
      .expect(200);

    expect(authService.refresh).toHaveBeenCalledWith('refresh-token');
    expect(response.body.data).toEqual({
      accessToken: 'new-access-token',
      user: publicUser,
    });
    expect(response.headers['set-cookie'][0]).toContain(
      'refresh_token=new-refresh-token',
    );
  });

  it('revokes the authenticated server session on logout', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer access-token')
      .expect(200);

    expect(authService.logout).toHaveBeenCalledWith('session-1');
    expect(response.headers['set-cookie'][0]).toContain('refresh_token=;');
  });

  it('does not expose the internal session id from /me', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer access-token')
      .expect(200);

    expect(response.body.data.user).toEqual(publicUser);
    expect(response.body.data.user).not.toHaveProperty('authSessionId');
  });

  it('clears the refresh cookie after changing the password', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/change-password')
      .set('Authorization', 'Bearer access-token')
      .send({
        currentPassword: 'temporary-123',
        newPassword: 'new-secure-123',
      })
      .expect(200);

    expect(response.headers['set-cookie'][0]).toContain('refresh_token=;');
  });
});
