import { ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, Prisma, SaleStatus } from '@prisma/client';

/** Same row participates in assignment, cancellation, delivery and customer returns. */
export async function acquireSaleLifecycleLock(
  tx: Prisma.TransactionClient,
  saleId: string,
) {
  try {
    const count =
      await tx.$executeRaw`UPDATE "Sale" SET "updatedAt" = "updatedAt" WHERE "id" = ${saleId}`;
    if (count === 0) throw new NotFoundException('Sale not found');
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2010' &&
      ['40001', '40P01'].includes(String(error.meta?.code))
    ) {
      throw new ConflictException(
        'Sale lifecycle changed; retry with the same Idempotency-Key',
      );
    }
    throw error;
  }
}

export async function assertSaleExecutable(
  tx: Prisma.TransactionClient,
  saleId: string,
) {
  await acquireSaleLifecycleLock(tx, saleId);
  const sale = await tx.sale.findUnique({
    where: { id: saleId },
    select: { status: true },
  });
  if (!sale || sale.status !== SaleStatus.CONFIRMED)
    throw new ConflictException(
      'Only a confirmed non-cancelled sale can be executed',
    );
}

type Quantity = Prisma.Decimal | number | string | null | undefined;
type Item = {
  productId: string;
  quantityKg?: Quantity;
  quantityPieces?: number | null;
};

/** Read real compensations, not route transfers of unsold custody or receivable amounts. */
export async function remainingSaleRestoration(
  tx: Prisma.TransactionClient,
  sale: { id: string; locationId: string; items?: Item[] },
) {
  const plan = new Map<
    string,
    { productId: string; quantityKg: Prisma.Decimal; quantityPieces: number }
  >();
  for (const item of sale.items ?? []) {
    const current = plan.get(item.productId) ?? {
      productId: item.productId,
      quantityKg: new Prisma.Decimal(0),
      quantityPieces: 0,
    };
    current.quantityKg = current.quantityKg.add(String(item.quantityKg ?? 0));
    current.quantityPieces += item.quantityPieces ?? 0;
    plan.set(item.productId, current);
  }
  const previous = await tx.inventoryMovement.findMany({
    where: {
      saleId: sale.id,
      type: {
        in: [InventoryMovementType.RETURN, InventoryMovementType.CANCEL_SALE],
      },
    },
    select: {
      productId: true,
      locationId: true,
      type: true,
      quantityKg: true,
      quantityPieces: true,
    },
  });
  for (const movement of previous) {
    const current = plan.get(movement.productId);
    if (
      !current ||
      (movement.type === InventoryMovementType.CANCEL_SALE &&
        movement.locationId !== sale.locationId)
    )
      throw new ConflictException(
        'Sale restoration history requires custody reconciliation',
      );
    current.quantityKg = current.quantityKg.minus(
      String(movement.quantityKg ?? 0),
    );
    current.quantityPieces -= movement.quantityPieces ?? 0;
    if (current.quantityKg.isNegative() || current.quantityPieces < 0)
      throw new ConflictException(
        'Sale inventory was already restored beyond its sold quantity',
      );
  }
  return [...plan.values()];
}
