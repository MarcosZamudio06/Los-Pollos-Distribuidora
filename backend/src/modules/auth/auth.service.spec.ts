import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from './auth.service';
import type { TokenPayload } from './auth.types';

type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  operationalLocationId?: string;
  sessionVersion: number;
  role: { name: string };
};

type SessionRecord = {
  id: string;
  userId: string;
  refreshTokenHash: string;
  tokenVersion: number;
  lastUsedAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
  user: UserRecord;
};

type AuthSessionCreateArgs = {
  data: Pick<
    SessionRecord,
    'id' | 'userId' | 'refreshTokenHash' | 'absoluteExpiresAt'
  >;
};
type AuthSessionUpdateArgs = {
  where: Partial<
    Pick<SessionRecord, 'id' | 'userId' | 'refreshTokenHash' | 'tokenVersion'>
  > & { revokedAt?: Date | null };
  data: Partial<
    Pick<SessionRecord, 'refreshTokenHash' | 'lastUsedAt' | 'revokedAt'>
  > & {
    tokenVersion?: { increment: number };
  };
};
type UserUpdateArgs = {
  data: Pick<UserRecord, 'passwordHash' | 'mustChangePassword'> & {
    sessionVersion?: { increment: number };
  };
};

function createUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'user-1',
    name: 'Development Admin',
    email: 'dev.admin@pollos.local',
    passwordHash: bcrypt.hashSync('valid-password', 4),
    isActive: true,
    mustChangePassword: false,
    sessionVersion: 0,
    role: { name: 'ADMIN' },
    ...overrides,
  };
}

function createService(user = createUser()) {
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  const state: { session: SessionRecord | null; user: UserRecord } = {
    session: null,
    user,
  };
  const signedPayloads = new Map<string, TokenPayload>();
  let tokenSequence = 0;

  const authSession = {
    create: jest.fn(({ data }: AuthSessionCreateArgs) => {
      state.session = {
        ...data,
        tokenVersion: 0,
        lastUsedAt: new Date(),
        revokedAt: null,
        user: state.user,
      };
      return state.session;
    }),
    findUnique: jest.fn(() => state.session),
    updateMany: jest.fn(({ where, data }: AuthSessionUpdateArgs) => {
      const session = state.session;
      if (
        !session ||
        (where.id && where.id !== session.id) ||
        (where.userId && where.userId !== session.userId) ||
        (where.revokedAt === null && session.revokedAt !== null) ||
        (where.refreshTokenHash &&
          where.refreshTokenHash !== session.refreshTokenHash) ||
        (where.tokenVersion !== undefined &&
          where.tokenVersion !== session.tokenVersion)
      ) {
        return { count: 0 };
      }

      Object.assign(session, data);
      return { count: 1 };
    }),
  };
  const userDelegate = {
    findUnique: jest.fn(() => state.user),
    update: jest.fn(({ data }: UserUpdateArgs) => {
      state.user = {
        ...state.user,
        passwordHash: data.passwordHash,
        mustChangePassword: data.mustChangePassword,
        sessionVersion:
          state.user.sessionVersion + (data.sessionVersion?.increment ?? 0),
      };
      if (state.session) state.session.user = state.user;
      return state.user;
    }),
  };
  const prisma = {
    authSession,
    user: userDelegate,
    $transaction: jest.fn(
      (
        callback: (tx: {
          authSession: typeof authSession;
          user: typeof userDelegate;
        }) => unknown,
      ) => callback({ authSession, user: userDelegate }),
    ),
  };
  const jwtService = {
    signAsync: jest.fn((payload: TokenPayload) => {
      const token = `${payload.type}-token-${tokenSequence++}`;
      signedPayloads.set(token, payload);
      return token;
    }),
    verifyAsync: jest.fn((token: string) => {
      const payload = signedPayloads.get(token);
      if (!payload) throw new Error('invalid signature');
      return payload;
    }),
  };

  return {
    authSession,
    jwtService,
    prisma,
    service: new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
    ),
    state,
  };
}

describe('AuthService persistent sessions', () => {
  it('creates a server session and stores only the refresh token hash', async () => {
    const { authSession, service } = createService();

    const result = await service.login({
      email: 'dev.admin@pollos.local',
      password: 'valid-password',
    });

    const data = authSession.create.mock.calls[0][0].data;
    expect(data.refreshTokenHash).toBe(
      createHash('sha256').update(result.refreshToken).digest('hex'),
    );
    expect(JSON.stringify(data)).not.toContain(result.refreshToken);
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  it('rotates the refresh token and revokes the session when the old token is reused', async () => {
    const { service, state } = createService();
    const login = await service.login({
      email: 'dev.admin@pollos.local',
      password: 'valid-password',
    });

    const refreshed = await service.refresh(login.refreshToken);
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    expect(state.session?.tokenVersion).toBe(1);

    await expect(service.refresh(login.refreshToken)).rejects.toThrow(
      'Invalid token',
    );
    expect(state.session?.revokedAt).toBeInstanceOf(Date);
  });

  it('invalidates access and refresh tokens after logout', async () => {
    const { service, state } = createService();
    const login = await service.login({
      email: 'dev.admin@pollos.local',
      password: 'valid-password',
    });
    const sessionId = state.session?.id;
    if (!sessionId) throw new Error('Session was not created');

    await service.logout(sessionId);

    await expect(service.refresh(login.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      service.verifyAccessToken(login.accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('increments sessionVersion and revokes every session after a password change', async () => {
    const { authSession, service, state } = createService();
    await service.login({
      email: 'dev.admin@pollos.local',
      password: 'valid-password',
    });

    await service.changeOwnPassword('user-1', {
      currentPassword: 'valid-password',
      newPassword: 'new-secure-123',
    });

    expect(state.user.sessionVersion).toBe(1);
    expect(state.session?.revokedAt).toBeInstanceOf(Date);
    expect(authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', revokedAt: null } }),
    );
  });

  it('verifies a password for the supplied authenticated principal without changing sessions', async () => {
    const { service, state } = createService();

    await expect(
      service.verifyPassword('user-1', 'valid-password'),
    ).resolves.toBeUndefined();

    await expect(
      service.verifyPassword('user-1', 'wrong-password'),
    ).rejects.toThrow('Invalid credentials');
    expect(state.session).toBeNull();
  });

  it('rejects tokens that do not reference a persistent session', async () => {
    const { jwtService, service } = createService();
    jwtService.verifyAsync.mockResolvedValueOnce({
      sub: 'user-1',
      email: 'dev.admin@pollos.local',
      role: 'ADMIN',
      type: 'access',
      sessionId: 'missing-session',
      sessionVersion: 0,
    });

    await expect(
      service.verifyAccessToken('orphaned-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
