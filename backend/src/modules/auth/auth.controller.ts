import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto) {
    return {
      success: true,
      message: 'Sesión iniciada correctamente',
      data: await this.authService.login(body),
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: RefreshTokenDto) {
    return {
      success: true,
      message: 'Sesión renovada correctamente',
      data: await this.authService.refresh(body.refreshToken),
    };
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  logout() {
    return {
      success: true,
      message: 'Sesión cerrada correctamente',
      data: this.authService.logout(),
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      message: 'Usuario autenticado',
      data: { user },
    };
  }
}
