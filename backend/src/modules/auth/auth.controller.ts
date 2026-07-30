import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AllowPasswordChangeRequired } from '../../common/decorators/allow-password-change-required.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import type {
  AuthenticatedPrincipal,
  IssuedSession,
  LoginResult,
} from './auth.types';
import { ChangeOwnPasswordDto } from './dto/change-own-password.dto';
import { LoginDto } from './dto/login.dto';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.authService.login(body);
    this.setRefreshCookie(response, session);
    return {
      success: true,
      message: 'Sesión iniciada correctamente',
      data: this.toLoginResult(session),
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Headers('cookie') cookieHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = this.readRefreshCookie(cookieHeader);
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const session = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(response, session);
    return {
      success: true,
      message: 'Sesión renovada correctamente',
      data: this.toLoginResult(session),
    };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.clearRefreshCookie(response);
    return {
      success: true,
      message: 'Sesión cerrada correctamente',
      data: await this.authService.logout(user.authSessionId),
    };
  }

  @Post('change-password')
  @HttpCode(200)
  @AllowPasswordChangeRequired()
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() body: ChangeOwnPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const updatedUser = await this.authService.changeOwnPassword(user.id, body);
    this.clearRefreshCookie(response);
    return {
      success: true,
      message: 'Contraseña actualizada correctamente',
      data: updatedUser,
    };
  }

  @Get('me')
  @AllowPasswordChangeRequired()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedPrincipal) {
    const { authSessionId: _authSessionId, ...authenticatedUser } = user;
    return {
      success: true,
      message: 'Usuario autenticado',
      data: { user: authenticatedUser },
    };
  }

  private setRefreshCookie(response: Response, session: IssuedSession): void {
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      maxAge: Math.max(session.refreshTokenExpiresAt.getTime() - Date.now(), 0),
      path: REFRESH_COOKIE_PATH,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      path: REFRESH_COOKIE_PATH,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  private readRefreshCookie(cookieHeader?: string): string | null {
    const encodedValue = cookieHeader
      ?.split(';')
      .map((cookie) => cookie.trim().split('='))
      .find(([name]) => name === REFRESH_COOKIE_NAME)
      ?.slice(1)
      .join('=');

    if (!encodedValue) {
      return null;
    }
    try {
      return decodeURIComponent(encodedValue);
    } catch {
      throw new UnauthorizedException('Invalid refresh token cookie');
    }
  }

  private toLoginResult(session: IssuedSession): LoginResult {
    return {
      accessToken: session.accessToken,
      user: session.user,
    };
  }
}
