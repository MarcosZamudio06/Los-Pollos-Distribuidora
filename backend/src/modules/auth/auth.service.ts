import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser, LoginResult, TokenPayload } from './auth.types';

type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
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

    return this.toAuthenticatedUser(user);
  }

  logout(): { success: true } {
    return { success: true };
  }

  private async findUserByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
  }

  private toAuthenticatedUser(user: UserRecord): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.name,
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
        expiresIn: type === 'access' ? '15m' : '7d',
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
}
