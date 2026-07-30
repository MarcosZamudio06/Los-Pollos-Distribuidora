import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Authenticated } from '../decorators/authenticated.decorator';
import { Public } from '../decorators/public.decorator';
import { RequirePermissions } from '../decorators/require-permissions.decorator';
import { PERMISSIONS } from '../authorization/permissions';
import { PermissionsGuard } from './permissions.guard';

function contextFor(handler: object, user?: { permissions?: string[] }) {
  return {
    getHandler: () => handler,
    getClass: () => GuardTestController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
}

class GuardTestController {
  @Public()
  publicRoute() {}

  @Authenticated()
  authenticatedRoute() {}

  @RequirePermissions(PERMISSIONS.PAYMENTS_CANCEL)
  protectedRoute() {}

  unclassifiedRoute() {}
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('allows an explicitly public route without an authenticated user', () => {
    expect(
      guard.canActivate(contextFor(GuardTestController.prototype.publicRoute)),
    ).toBe(true);
  });

  it('allows an explicitly authenticated route after JwtAuthGuard has populated the user', () => {
    expect(
      guard.canActivate(
        contextFor(GuardTestController.prototype.authenticatedRoute, {}),
      ),
    ).toBe(true);
  });

  it('denies a route without an access classification', () => {
    expect(() =>
      guard.canActivate(
        contextFor(GuardTestController.prototype.unclassifiedRoute, {}),
      ),
    ).toThrow(new ForbiddenException('Access classification is required'));
  });

  it('requires every declared permission', () => {
    expect(() =>
      guard.canActivate(
        contextFor(GuardTestController.prototype.protectedRoute, {
          permissions: [],
        }),
      ),
    ).toThrow(new ForbiddenException('Insufficient permissions'));

    expect(
      guard.canActivate(
        contextFor(GuardTestController.prototype.protectedRoute, {
          permissions: [PERMISSIONS.PAYMENTS_CANCEL],
        }),
      ),
    ).toBe(true);
  });
});
