import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../../database/prisma.service';
import { SessionRevocationRegistry } from '../../common/session/session-revocation.registry';
import {
  AuthenticatedPrincipal,
  AuthenticatedUser,
  IssuedSession,
  TokenPayload,
} from './auth.types';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { LoginDto } from './dto/login.dto';

const PASSWORD_HASH_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = '15m';
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = '7d';
const DEFAULT_ABSOLUTE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_IDLE_TTL_SECONDS = 24 * 60 * 60;

type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  operationalLocationId?: string;
  sessionVersion: number;
  role: {
    name: string;
    permissions?: Array<{ permission: { key: string } }>;
  };
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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    @Optional() private readonly sessionRevocationRegistry?: SessionRevocationRegistry,
  ) {}

  async login(credentials: LoginDto): Promise<IssuedSession> {
    const user = await this.findUserByEmail(credentials.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.isActive) {
      throw new ForbiddenException('User is inactive');
    }

    const passwordMatches = await bcrypt.compare(
      credentials.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessionId = randomUUID();
    const absoluteExpiresAt = new Date(
      Date.now() + this.getSessionTtlSeconds('absolute') * 1000,
    );
    const issued = await this.issueTokens(
      user,
      sessionId,
      user.sessionVersion,
      0,
    );

    await this.prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash: this.hashToken(issued.refreshToken),
        absoluteExpiresAt,
      },
    });

    return {
      ...issued,
      refreshTokenExpiresAt: absoluteExpiresAt,
    };
  }

  async refresh(refreshToken: string): Promise<IssuedSession> {
    const payload = await this.verifyToken(refreshToken, 'refresh');
    const session = await this.findSession(payload.sessionId);

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid token');
    }

    const now = new Date();
    if (
      session.revokedAt ||
      session.absoluteExpiresAt <= now ||
      this.isIdleExpired(session, now) ||
      !session.user.isActive ||
      session.user.sessionVersion !== payload.sessionVersion ||
      session.tokenVersion !== payload.tokenVersion
    ) {
      await this.revokeSession(session.id, now);
      throw new UnauthorizedException('Invalid token');
    }

    const presentedHash = this.hashToken(refreshToken);
    if (!this.tokenHashesMatch(session.refreshTokenHash, presentedHash)) {
      await this.revokeSession(session.id, now);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const nextTokenVersion = session.tokenVersion + 1;
    const issued = await this.issueTokens(
      session.user,
      session.id,
      session.user.sessionVersion,
      nextTokenVersion,
    );
    const replacementHash = this.hashToken(issued.refreshToken);
    const rotated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: presentedHash,
        revokedAt: null,
        tokenVersion: session.tokenVersion,
      },
      data: {
        refreshTokenHash: replacementHash,
        tokenVersion: nextTokenVersion,
        lastUsedAt: now,
      },
    });

    if (rotated.count !== 1) {
      await this.revokeSession(session.id, now);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    return {
      ...issued,
      refreshTokenExpiresAt: session.absoluteExpiresAt,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedPrincipal> {
    const payload = await this.verifyToken(token, 'access');
    const session = await this.findSession(payload.sessionId);
    const now = new Date();

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.absoluteExpiresAt <= now ||
      this.isIdleExpired(session, now) ||
      !session.user.isActive ||
      session.user.sessionVersion !== payload.sessionVersion
    ) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.prisma.authSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastUsedAt: now },
    });

    return {
      ...this.toAuthenticatedUser(session.user),
      authSessionId: session.id,
    };
  }

  async changeOwnPassword(
    userId: string,
    dto: ChangeOwnPasswordDto,
  ): Promise<AuthenticatedUser> {
    this.assertPasswordPolicy(dto.newPassword);
    const user = await this.findUserById(userId);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      PASSWORD_HASH_ROUNDS,
    );
    const now = new Date();
    const updatedUser = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          sessionVersion: { increment: 1 },
        },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
        },
      });
      await transaction.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return updated;
    });

    this.sessionRevocationRegistry?.notify([userId]);
    return this.toAuthenticatedUser(updatedUser);
  }

  async logout(sessionId: string): Promise<{ success: true }> {
    await this.revokeSession(sessionId, new Date());
    return { success: true };
  }

  private async issueTokens(
    user: UserRecord,
    sessionId: string,
    sessionVersion: number,
    tokenVersion: number,
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthenticatedUser }> {
    const sanitizedUser = this.toAuthenticatedUser(user);
    const accessToken = await this.signToken(sanitizedUser, 'access', {
      sessionId,
      sessionVersion,
    });
    const refreshToken = await this.signToken(sanitizedUser, 'refresh', {
      sessionId,
      sessionVersion,
      tokenVersion,
    });

    return { accessToken, refreshToken, user: sanitizedUser };
  }

  private async findSession(id: string): Promise<SessionRecord | null> {
    return this.prisma.authSession.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            role: { include: { permissions: { include: { permission: true } } } },
          },
        },
      },
    });
  }

  private async revokeSession(id: string, revokedAt: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }

  private isIdleExpired(session: SessionRecord, now: Date): boolean {
    return (
      session.lastUsedAt.getTime() +
        this.getSessionTtlSeconds('idle') * 1000 <=
      now.getTime()
    );
  }

  private getSessionTtlSeconds(type: 'absolute' | 'idle'): number {
    const envKey =
      type === 'absolute'
        ? 'AUTH_SESSION_ABSOLUTE_TTL_SECONDS'
        : 'AUTH_SESSION_IDLE_TTL_SECONDS';
    const fallback =
      type === 'absolute'
        ? DEFAULT_ABSOLUTE_TTL_SECONDS
        : DEFAULT_IDLE_TTL_SECONDS;
    const configured = Number(process.env[envKey] ?? fallback);

    if (!Number.isInteger(configured) || configured <= 0) {
      throw new InternalServerErrorException(`${envKey} must be a positive integer`);
    }
    return configured;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private tokenHashesMatch(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private async findUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
  }

  private async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
  }

  private assertPasswordPolicy(password: string): void {
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        'Password must be at least 10 characters long',
      );
    }
  }

  private toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
      permissions: user.role.permissions?.map(({ permission }) => permission.key) ?? [],
      mustChangePassword: user.mustChangePassword,
      ...(user.operationalLocationId
        ? { operationalLocationId: user.operationalLocationId }
        : {}),
    };
  }

  private async signToken(
    user: AuthenticatedUser,
    type: TokenPayload['type'],
    session: Pick<TokenPayload, 'sessionId' | 'sessionVersion'> &
      Partial<Pick<TokenPayload, 'tokenVersion'>>,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type,
        ...session,
        ...(type === 'refresh' ? { jti: randomUUID() } : {}),
      },
      {
        expiresIn: this.getExpiresIn(type),
        secret: this.getSecret(type),
      },
    );
  }

  private async verifyToken(
    token: string,
    expectedType: TokenPayload['type'],
  ): Promise<TokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.getSecret(expectedType),
      });

      if (
        payload.type !== expectedType ||
        !payload.sessionId ||
        !Number.isInteger(payload.sessionVersion) ||
        (expectedType === 'refresh' && !Number.isInteger(payload.tokenVersion))
      ) {
        throw new UnauthorizedException('Invalid token');
      }
      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }

  private getSecret(type: TokenPayload['type']): string {
    const envKey =
      type === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET';
    const secret = process.env[envKey]?.trim();

    if (!secret) {
      throw new InternalServerErrorException(`${envKey} is required`);
    }
    return secret;
  }

  private getExpiresIn(type: TokenPayload['type']): StringValue {
    const envKey =
      type === 'access' ? 'JWT_ACCESS_EXPIRES_IN' : 'JWT_REFRESH_EXPIRES_IN';
    const configuredValue = process.env[envKey]?.trim();
    if (configuredValue) {
      return configuredValue as StringValue;
    }
    return type === 'access'
      ? DEFAULT_ACCESS_TOKEN_EXPIRES_IN
      : DEFAULT_REFRESH_TOKEN_EXPIRES_IN;
  }
}
