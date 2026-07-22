import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import type { StringValue } from 'ms';
import { PrismaService } from '../../database/prisma.service';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser, LoginResult, TokenPayload } from './auth.types';

const PASSWORD_HASH_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = '15m';
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = '7d';

type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  operationalLocationId?: string;
  role: { name: string };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(credentials: LoginDto): Promise<LoginResult> {
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

    const sanitizedUser = this.toAuthenticatedUser(user);

    return {
      accessToken: await this.signToken(sanitizedUser, 'access'),
      refreshToken: await this.signToken(sanitizedUser, 'refresh'),
      user: sanitizedUser,
    };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    const payload = await this.verifyToken(refreshToken, 'refresh');
    const user = await this.findUserByEmail(payload.email);

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    if (!user.isActive) {
      throw new ForbiddenException('User is inactive');
    }

    const sanitizedUser = this.toAuthenticatedUser(user);

    return {
      accessToken: await this.signToken(sanitizedUser, 'access'),
      refreshToken: await this.signToken(sanitizedUser, 'refresh'),
      user: sanitizedUser,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const payload = await this.verifyToken(token, 'access');
    const user = await this.findUserByEmail(payload.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    return {
      ...this.toAuthenticatedUser(user),
      operationalLocationId: user.operationalLocationId,
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
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
      include: { role: true },
    });

    return this.toAuthenticatedUser(updatedUser);
  }

  logout(): { success: true } {
    return { success: true };
  }

  private async findUserById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
  }

  private async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
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
      mustChangePassword: user.mustChangePassword,
    };
  }

  private async signToken(
    user: AuthenticatedUser,
    type: TokenPayload['type'],
  ): Promise<string> {
    const secret = this.getSecret(type);

    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type,
      },
      {
        expiresIn: this.getExpiresIn(type),
        secret,
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

      if (payload.type !== expectedType) {
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
