import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import { TokenPayload } from './auth.types';

type UserWithRole = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  role: { name: string };
};

type UserUpdateArgs = {
  where: { id: string };
  data: {
    passwordHash: string;
    mustChangePassword: boolean;
  };
  include: { role: true };
};
type MockPrisma = {
  user: {
    findUnique: jest.MockedFunction<
      (...args: unknown[]) => Promise<UserWithRole | null>
    >;
    update: jest.MockedFunction<
      (args: UserUpdateArgs) => Promise<UserWithRole | null>
    >;
  };
};

function createUser(overrides: Partial<UserWithRole> = {}): UserWithRole {
  return {
    id: 'user-1',
    name: 'Development Admin',
    email: 'dev.admin@pollos.local',
    passwordHash: bcrypt.hashSync('valid-password', 4),
    isActive: true,
    mustChangePassword: false,
    role: { name: 'ADMIN' },
    ...overrides,
  };
}

function createService(user: UserWithRole | null): {
  service: AuthService;
  jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  prisma: MockPrisma;
} {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  const prisma: MockPrisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      update: jest.fn((args: UserUpdateArgs) =>
        Promise.resolve(
          user
            ? {
                ...user,
                passwordHash: args.data.passwordHash,
                mustChangePassword: args.data.mustChangePassword,
              }
            : null,
        ),
      ),
    },
  };
  const jwtService = {
    signAsync: jest.fn().mockImplementation((payload: TokenPayload) => {
      const tokenType = payload.type;
      return Promise.resolve(`${tokenType}.${payload.sub}.${payload.role}`);
    }),
    verifyAsync: jest.fn(),
  };

  return {
    service: new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
    ),
    jwtService,
    prisma,
  };
}

describe('AuthService', () => {
  it('logs in an active user with a valid password and never returns passwordHash', async () => {
    const { service } = createService(createUser());

    const result = await service.login({
      email: 'dev.admin@pollos.local',
      password: 'valid-password',
    });

    expect(result).toEqual({
      accessToken: 'access.user-1.ADMIN',
      refreshToken: 'refresh.user-1.ADMIN',
      user: {
        id: 'user-1',
        name: 'Development Admin',
        email: 'dev.admin@pollos.local',
        role: 'ADMIN',
        mustChangePassword: false,
      },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('uses configured token expiration windows when present in the environment', async () => {
    const previousAccessExpires = process.env.JWT_ACCESS_EXPIRES_IN;
    const previousRefreshExpires = process.env.JWT_REFRESH_EXPIRES_IN;

    process.env.JWT_ACCESS_EXPIRES_IN = '30m';
    process.env.JWT_REFRESH_EXPIRES_IN = '14d';

    try {
      const { service, jwtService } = createService(createUser());

      await service.login({
        email: 'dev.admin@pollos.local',
        password: 'valid-password',
      });

      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: 'access' }),
        expect.objectContaining({
          expiresIn: '30m',
          secret: 'test-access-secret',
        }),
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ type: 'refresh' }),
        expect.objectContaining({
          expiresIn: '14d',
          secret: 'test-refresh-secret',
        }),
      );
    } finally {
      if (previousAccessExpires === undefined) {
        delete process.env.JWT_ACCESS_EXPIRES_IN;
      } else {
        process.env.JWT_ACCESS_EXPIRES_IN = previousAccessExpires;
      }

      if (previousRefreshExpires === undefined) {
        delete process.env.JWT_REFRESH_EXPIRES_IN;
      } else {
        process.env.JWT_REFRESH_EXPIRES_IN = previousRefreshExpires;
      }
    }
  });

  it('rejects login with an incorrect password', async () => {
    const { service } = createService(createUser());

    await expect(
      service.login({
        email: 'dev.admin@pollos.local',
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login for an inactive user before issuing tokens', async () => {
    const { service, jwtService } = createService(
      createUser({ isActive: false }),
    );

    await expect(
      service.login({
        email: 'dev.admin@pollos.local',
        password: 'valid-password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('logs in an active user with a pending password change and exposes the required flag', async () => {
    const { service } = createService(createUser({ mustChangePassword: true }));

    const result = await service.login({
      email: 'dev.admin@pollos.local',
      password: 'valid-password',
    });

    expect(result.user).toEqual({
      id: 'user-1',
      name: 'Development Admin',
      email: 'dev.admin@pollos.local',
      role: 'ADMIN',
      mustChangePassword: true,
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('changes the authenticated user password, clears mustChangePassword and never returns passwordHash', async () => {
    const { service, prisma } = createService(
      createUser({ mustChangePassword: true }),
    );

    const result = await service.changeOwnPassword('user-1', {
      currentPassword: 'valid-password',
      newPassword: 'new-secure-123',
    });

    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    const updateArgs = prisma.user.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'user-1' });
    expect(updateArgs.include).toEqual({ role: true });
    expect(updateArgs.data.mustChangePassword).toBe(false);
    expect(updateArgs.data.passwordHash).not.toBe('new-secure-123');
    await expect(
      bcrypt.compare('new-secure-123', updateArgs.data.passwordHash),
    ).resolves.toBe(true);
    expect(result).toEqual({
      id: 'user-1',
      name: 'Development Admin',
      email: 'dev.admin@pollos.local',
      role: 'ADMIN',
      mustChangePassword: false,
    });
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('rejects own password change with an incorrect current password', async () => {
    const { service, prisma } = createService(createUser());

    await expect(
      service.changeOwnPassword('user-1', {
        currentPassword: 'wrong-password',
        newPassword: 'new-secure-123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects weak new passwords before updating credentials', async () => {
    const { service, prisma } = createService(createUser());

    await expect(
      service.changeOwnPassword('user-1', {
        currentPassword: 'valid-password',
        newPassword: 'short',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refreshes tokens when the refresh token is valid', async () => {
    const { service, jwtService } = createService(createUser());
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'dev.admin@pollos.local',
      role: 'ADMIN',
      type: 'refresh',
    });

    const result = await service.refresh('valid-refresh-token');

    expect(result.accessToken).toBe('access.user-1.ADMIN');
    expect(result.refreshToken).toBe('refresh.user-1.ADMIN');
    expect(result.user).toEqual({
      id: 'user-1',
      name: 'Development Admin',
      email: 'dev.admin@pollos.local',
      role: 'ADMIN',
      mustChangePassword: false,
    });
  });

  it('rejects refresh for an inactive user before issuing replacement tokens', async () => {
    const { service, jwtService } = createService(
      createUser({ isActive: false }),
    );
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'dev.admin@pollos.local',
      role: 'ADMIN',
      type: 'refresh',
    });

    await expect(service.refresh('valid-refresh-token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects protected access when an already-issued access token belongs to a now inactive user', async () => {
    const { service, jwtService } = createService(
      createUser({ isActive: false }),
    );
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'dev.admin@pollos.local',
      role: 'ADMIN',
      type: 'access',
    });

    await expect(
      service.verifyAccessToken('issued-before-deactivation'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an invalid refresh token', async () => {
    const { service, jwtService } = createService(createUser());
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      service.refresh('invalid-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
