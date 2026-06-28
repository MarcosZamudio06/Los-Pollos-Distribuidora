import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

function createHttpContext(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('rejects /auth/me when no bearer token is provided', async () => {
    const guard = new JwtAuthGuard({} as AuthService);

    await expect(guard.canActivate(createHttpContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('accepts a valid bearer token and attaches the authenticated user', async () => {
    const request = { headers: { authorization: 'Bearer valid-access-token' } };
    const authService = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Development Admin',
        email: 'dev.admin@pollos.local',
        role: 'ADMIN',
        mustChangePassword: false,
      }),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        id: 'user-1',
        name: 'Development Admin',
        email: 'dev.admin@pollos.local',
        role: 'ADMIN',
        mustChangePassword: false,
      },
    });
  });

  it('rejects normal protected access when the user must change password', async () => {
    const request = { headers: { authorization: 'Bearer valid-access-token' } };
    const authService = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Development Admin',
        email: 'dev.admin@pollos.local',
        role: 'ADMIN',
        mustChangePassword: true,
      }),
    } as unknown as AuthService;
    const guard = new JwtAuthGuard(authService);
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(request).not.toHaveProperty('user');
  });

  it('allows the password-change exception route when the user must change password', async () => {
    const request = { headers: { authorization: 'Bearer valid-access-token' } };
    const authService = {
      verifyAccessToken: jest.fn().mockResolvedValue({
        id: 'user-1',
        name: 'Development Admin',
        email: 'dev.admin@pollos.local',
        role: 'ADMIN',
        mustChangePassword: true,
      }),
    } as unknown as AuthService;
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(true),
    };
    const guard = new JwtAuthGuard(authService, reflector as never);
    const handler = jest.fn();
    const controller = class AuthController {};
    const context = {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        id: 'user-1',
        mustChangePassword: true,
      },
    });
  });
});
