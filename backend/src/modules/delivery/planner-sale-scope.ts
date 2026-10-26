import type { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';

/** A dispatch origin is not authorization. Keep sale ownership/location restrictions on the server. */
export function plannerSaleScope(
  actor: Pick<AuthenticatedUser, 'id' | 'role' | 'operationalLocationId'>,
): Prisma.SaleWhereInput {
  if (actor.role === 'ADMIN') return {};
  if (actor.role === 'SELLER' && actor.operationalLocationId)
    return { userId: actor.id, locationId: actor.operationalLocationId };
  return { id: { in: [] } };
}
