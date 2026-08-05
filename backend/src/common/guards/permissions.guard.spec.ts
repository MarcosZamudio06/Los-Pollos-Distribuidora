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

function handlerFor(name: keyof GuardTestController): object {
  return Object.getOwnPropertyDescriptor(GuardTestController.prototype, name)
    ?.value as object;
}

class GuardTestController {
  @Public()
  publicRoute() {}

  @Authenticated()
  authenticatedRoute() {}

  @RequirePermissions(PERMISSIONS.PAYMENTS_CANCEL)
  protectedRoute() {}

  @RequirePermissions(PERMISSIONS.CEDIS_VIEW)
  cedisRoute() {}

  unclassifiedRoute() {}
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('allows an explicitly public route without an authenticated user', () => {
    expect(guard.canActivate(contextFor(handlerFor('publicRoute')))).toBe(true);
  });

  it('allows an explicitly authenticated route after JwtAuthGuard has populated the user', () => {
    expect(
      guard.canActivate(contextFor(handlerFor('authenticatedRoute'), {})),
    ).toBe(true);
  });

  it('denies a route without an access classification', () => {
    expect(() =>
      guard.canActivate(contextFor(handlerFor('unclassifiedRoute'), {})),
    ).toThrow(new ForbiddenException('Access classification is required'));
  });

  it('requires every declared permission', () => {
    expect(() =>
      guard.canActivate(
        contextFor(handlerFor('protectedRoute'), {
          permissions: [],
        }),
      ),
    ).toThrow(new ForbiddenException('Insufficient permissions'));

    expect(
      guard.canActivate(
        contextFor(handlerFor('protectedRoute'), {
          permissions: [PERMISSIONS.PAYMENTS_CANCEL],
        }),
      ),
    ).toBe(true);
  });

  it('requires the CEDIS read permission for the CEDIS hierarchy endpoint', () => {
    expect(() =>
      guard.canActivate(
        contextFor(handlerFor('cedisRoute'), { permissions: [] }),
      ),
    ).toThrow(new ForbiddenException('Insufficient permissions'));

    expect(
      guard.canActivate(
        contextFor(handlerFor('cedisRoute'), {
          permissions: [PERMISSIONS.CEDIS_VIEW],
        }),
      ),
    ).toBe(true);
  });
});
