import { SetMetadata } from '@nestjs/common';
import type { Permission } from '../authorization/permissions';

export const REQUIRED_PERMISSIONS_KEY = 'access:required-permissions';

export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
