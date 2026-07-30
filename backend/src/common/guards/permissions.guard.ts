import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_AUTHENTICATED_KEY } from '../decorators/authenticated.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

type RequestWithPermissions = {
  user?: { permissions?: readonly string[] };
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<
      readonly string[]
    >(REQUIRED_PERMISSIONS_KEY, targets);
    const isAuthenticated = this.reflector.getAllAndOverride<boolean>(
      IS_AUTHENTICATED_KEY,
      targets,
    );

    if (!requiredPermissions?.length && !isAuthenticated) {
      throw new ForbiddenException('Access classification is required');
    }

    if (!requiredPermissions?.length) return true;

    const permissions = context
      .switchToHttp()
      .getRequest<RequestWithPermissions>().user?.permissions;
    if (!permissions || !requiredPermissions.every((key) => permissions.includes(key))) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
