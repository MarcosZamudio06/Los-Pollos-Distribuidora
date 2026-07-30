import { applyDecorators, SetMetadata } from '@nestjs/common';
import { Authenticated } from './authenticated.decorator';

export const ROLES_KEY = 'roles';

/** @deprecated Use RequirePermissions for new endpoints. */
export const Roles = (...roles: string[]) =>
  applyDecorators(Authenticated(), SetMetadata(ROLES_KEY, roles));
