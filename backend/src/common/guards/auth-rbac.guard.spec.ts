import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../../modules/auth/auth.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

const adminUser = {
  id: 'user-1',
  name: 'Development Admin',
  email: 'dev.admin@pollos.local',
  role: 'ADMIN',
};

const cashierUser = {
  id: 'user-2',
  name: 'Development Cashier',
  email: 'dev.cashier@pollos.local',
  role: 'CASHIER',
};

@Controller('guard-test')
class GuardTestController {
  @Get('protected')
  @UseGuards(JwtAuthGuard)
  protected(@CurrentUser() user: typeof adminUser) {
    return { user };
  }

  @Get('admin')
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  adminOnly(@CurrentUser() user: typeof adminUser) {
    return { user };
  }
}

describe('Common auth and RBAC guards', () => {
  let app: INestApplication<App>;
  let authService: jest.Mocked<Pick<AuthService, 'verifyAccessToken'>>;

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

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [GuardTestController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects a protected endpoint when no bearer token is provided', async () => {
    await request(app.getHttpServer()).get('/guard-test/protected').expect(401);

    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('injects the current user for a protected endpoint with a valid bearer token', async () => {
    await request(app.getHttpServer())
      .get('/guard-test/protected')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ user: adminUser });
      });
  });

  it('allows a restricted endpoint when the authenticated user has an allowed role', async () => {
    await request(app.getHttpServer())
      .get('/guard-test/admin')
      .set('Authorization', 'Bearer admin-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ user: adminUser });
      });
  });

  it('rejects a restricted endpoint when the authenticated user has the wrong role', async () => {
    await request(app.getHttpServer())
      .get('/guard-test/admin')
      .set('Authorization', 'Bearer cashier-token')
      .expect(403);
  });
});
