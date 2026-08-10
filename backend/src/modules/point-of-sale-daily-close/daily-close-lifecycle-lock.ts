import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PointOfSaleDailyCloseStatus } from '@prisma/client';

export async function acquireDailyCloseLifecycleLock(
  tx: Prisma.TransactionClient,
  dailyCloseId: string,
) {
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    `daily-close-id:${dailyCloseId}`,
  );
}

export async function acquireDraftDailyCloseLifecycleLock(
  tx: Prisma.TransactionClient,
  dailyCloseId: string,
) {
  await acquireDailyCloseLifecycleLock(tx, dailyCloseId);
  const close = await tx.pointOfSaleDailyClose.findUnique({
    where: { id: dailyCloseId },
    select: { status: true },
  });
  if (close?.status !== PointOfSaleDailyCloseStatus.DRAFT)
    throw new BadRequestException('DAILY_CLOSE_REOPEN_REQUIRED');
}
