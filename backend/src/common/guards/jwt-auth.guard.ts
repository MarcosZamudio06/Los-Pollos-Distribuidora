import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY } from '../decorators/allow-password-change-required.decorator';
import { AuthService } from '../../modules/auth/auth.service';
import { AuthenticatedUser } from '../../modules/auth/auth.types';

type RequestWithUser = {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Bearer token is required');
    }

    const user = await this.authService.verifyAccessToken(token);

    if (
      user.mustChangePassword &&
      !this.allowsPasswordChangeRequired(context)
    ) {
      throw new ForbiddenException('Password change is required');
    }

    request.user = user;
    return true;
  }

  private allowsPasswordChangeRequired(context: ExecutionContext): boolean {
    return (
      this.reflector?.getAllAndOverride<boolean>(
        ALLOW_PASSWORD_CHANGE_REQUIRED_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? false
    );
  }

  private extractBearerToken(authorization?: string): string | null {
    const [scheme, token] = authorization?.split(' ') ?? [];

    if (scheme !== 'Bearer' || !token) {
      return null;
    }

    return token;
  }
}
