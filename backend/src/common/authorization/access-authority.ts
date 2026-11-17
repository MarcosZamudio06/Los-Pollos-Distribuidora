import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuthenticatedPrincipal } from '../../modules/auth/auth.types';
import { CANONICAL_ROLE_NAMES, PERMISSIONS } from './permissions';

// All application access-authority writers take this transaction-scoped lock.
// READ COMMITTED is intentional: reads after a waiting lock see the winner's commit.
export const ACCESS_AUTHORITY_LOCK = 1397048065;
export const ACCESS_TRANSACTION_OPTIONS = {
  isolationLevel: 'ReadCommitted' as const,
};
export type AccessRole = {
  name: string;
  permissions: { permission: { key: string } }[];
};
export type AccessActor = { id: string; role: AccessRole };

export async function lockAccessAuthority(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ACCESS_AUTHORITY_LOCK}::bigint)`;
}

export async function loadAccessActor(
  tx: Prisma.TransactionClient,
  actor: Pick<AuthenticatedPrincipal, 'id' | 'authSessionId'>,
  required?: string,
): Promise<AccessActor> {
  if (!actor?.id || !actor.authSessionId)
    throw new ForbiddenException('Current actor session is required');
  const current = await tx.user.findUnique({
    where: { id: actor.id },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  });
  const session = await tx.authSession.findUnique({
    where: { id: actor.authSessionId },
  });
  const now = Date.now();
  const idleMs =
    Number(process.env.AUTH_SESSION_IDLE_TTL_SECONDS ?? 86400) * 1000;
  if (
    !current?.isActive ||
    !session ||
    session.userId !== current.id ||
    session.revokedAt ||
    session.absoluteExpiresAt.getTime() <= now ||
    session.lastUsedAt.getTime() + idleMs <= now
  ) {
    throw new ForbiddenException('Current actor session is not active');
  }
  if (
    required &&
    !current.role.permissions.some((p) => p.permission.key === required)
  )
    throw new ForbiddenException('Insufficient permissions');
  return current;
}

export function assertCanGrant(
  actor: AccessActor,
  permissionKeys: readonly string[],
) {
  const own = new Set(actor.role.permissions.map((p) => p.permission.key));
  const missing = permissionKeys.find((key) => !own.has(key));
  if (missing)
    throw new ForbiddenException(`Cannot grant permission: ${missing}`);
}

export function assertRoleAuthority(actor: AccessActor, target: AccessRole) {
  if (!(CANONICAL_ROLE_NAMES as readonly string[]).includes(target.name))
    throw new ForbiddenException(
      'Only canonical access profiles can be managed',
    );
  // ADMIN also owns legacy role-gated powers that do not have atomic keys yet.
  if (target.name === 'ADMIN' && actor.role.name !== 'ADMIN')
    throw new ForbiddenException('ADMIN profile requires ADMIN authority');
  assertCanGrant(
    actor,
    target.permissions.map((p) => p.permission.key),
  );
}

export async function assertSecurityAdministratorsRemain(
  tx: Prisma.TransactionClient,
) {
  for (const key of [
    PERMISSIONS.ACCESS_PROFILES_MANAGE,
    PERMISSIONS.USERS_MANAGE,
  ]) {
    const count = await tx.user.count({
      where: {
        isActive: true,
        role: { permissions: { some: { permission: { key } } } },
      },
    });
    if (count < 1)
      throw new ForbiddenException(
        key === PERMISSIONS.USERS_MANAGE
          ? 'At least one active user manager is required'
          : 'At least one active access profile manager is required',
      );
  }
  const admins = await tx.user.count({
    where: {
      isActive: true,
      role: {
        name: 'ADMIN',
        AND: [PERMISSIONS.USERS_MANAGE, PERMISSIONS.ACCESS_PROFILES_MANAGE].map(
          (key) => ({ permissions: { some: { permission: { key } } } }),
        ),
      },
    },
  });
  if (admins < 1)
    throw new ForbiddenException(
      'At least one active ADMIN with security management authority is required',
    );
}
