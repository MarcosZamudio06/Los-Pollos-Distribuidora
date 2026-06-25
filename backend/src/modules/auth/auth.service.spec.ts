import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
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
  role: { name: string };
};

type SignOptions = { expiresIn?: string };

function createUser(overrides: Partial<UserWithRole> = {}): UserWithRole {
  return {
    id: 'user-1',
    name: 'Development Admin',
    email: 'dev.admin@pollos.local',
    passwordHash: bcrypt.hashSync('valid-password', 4),
    isActive: true,
    role: { name: 'ADMIN' },
    ...overrides,
  };
}

function createService(user: UserWithRole | null): {
  service: AuthService;
  jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
} {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
    },
  } as unknown as PrismaService;
  const jwtService = {
    signAsync: jest
      .fn()
      .mockImplementation((payload: TokenPayload, options: SignOptions) => {
        const tokenType = options?.expiresIn === '7d' ? 'refresh' : 'access';
        return Promise.resolve(`${tokenType}.${payload.sub}.${payload.role}`);
      }),
    verifyAsync: jest.fn(),
  };

  return {
    service: new AuthService(prisma, jwtService as unknown as JwtService),
    jwtService,
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
      },
    });
    expect(result.user).not.toHaveProperty('passwordHash');
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
    });
  });

  it('rejects an invalid refresh token', async () => {
    const { service, jwtService } = createService(createUser());
    jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(
      service.refresh('invalid-refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
