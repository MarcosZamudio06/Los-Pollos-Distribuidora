import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, RouteSettlementStatus } from '@prisma/client';

/**
 * A real row write is deliberate: under Serializable a waiter with an older
 * snapshot must retry, not inspect stale CLOSED/payment/order state after a
 * lock-only advisory wait. No business field or timestamp is changed.
 */
export async function acquireRouteLifecycleLock(
  tx: Prisma.TransactionClient,
  routeId: string,
) {
  let count: number;
  try {
    count = await tx.$executeRaw`
    UPDATE "DeliveryRoute" SET "updatedAt" = "updatedAt" WHERE "id" = ${routeId}
  `;
  } catch (error) {
    // Raw-query serialization/deadlock errors are surfaced as P2010 by Prisma.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2010' &&
      ['40001', '40P01'].includes(String(error.meta?.code))
    ) {
      throw new Prisma.PrismaClientKnownRequestError(
        'Route lifecycle serialization conflict',
        {
          code: 'P2034',
          clientVersion: Prisma.prismaVersion.client,
        },
      );
    }
    throw error;
  }
  if (count === 0) throw new NotFoundException('Delivery route not found');
}

export async function assertRouteSettlementMutable(
  tx: Prisma.TransactionClient,
  routeId: string,
  settlementId?: string | null,
) {
  await acquireRouteLifecycleLock(tx, routeId);
  const settlement = await tx.routeSettlement.findUnique({
    where: { routeId },
  });
  if (settlementId && settlement?.id !== settlementId)
    throw new ConflictException(
      'Route settlement does not match the payment route',
    );
  if (settlement?.status === RouteSettlementStatus.CLOSED)
    throw new ConflictException('ROUTE_SETTLEMENT_REOPEN_REQUIRED');
}
