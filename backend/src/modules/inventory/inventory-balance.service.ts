import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma, ProductUnit } from '@prisma/client';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export type InventoryBalanceQuantity = {
  productId: string;
  unit?: ProductUnit;
  quantityKg: number;
  quantityPieces: number;
};

export type InventoryBalanceSnapshot = InventoryBalanceQuantity & {
  locationId: string;
  reservedQuantityKg: number;
  reservedQuantityPieces: number;
  availableQuantityKg: number;
  availableQuantityPieces: number;
};

export type InventoryBalanceReadRecord = {
  productId?: string;
  locationId: string;
  quantityKg: DecimalLike;
  quantityPieces: number;
  reservedQuantityKg?: DecimalLike;
  reservedQuantityPieces?: number;
};

export type InventoryBalanceAvailability = Pick<
  InventoryBalanceSnapshot,
  | 'quantityKg'
  | 'quantityPieces'
  | 'reservedQuantityKg'
  | 'reservedQuantityPieces'
  | 'availableQuantityKg'
  | 'availableQuantityPieces'
>;

export function toInventoryBalanceAvailability(
  balance: InventoryBalanceReadRecord,
): InventoryBalanceAvailability {
  const quantityKg = toDecimal(balance.quantityKg);
  const quantityPieces = balance.quantityPieces ?? 0;
  const reservedQuantityKg = toDecimal(balance.reservedQuantityKg);
  const reservedQuantityPieces = balance.reservedQuantityPieces ?? 0;
  const availableQuantityKg = quantityKg.sub(reservedQuantityKg);
  const availableQuantityPieces = quantityPieces - reservedQuantityPieces;

  if (
    !quantityKg.isFinite() ||
    !Number.isFinite(quantityPieces) ||
    !reservedQuantityKg.isFinite() ||
    !Number.isFinite(reservedQuantityPieces) ||
    quantityKg.isNegative() ||
    quantityPieces < 0 ||
    reservedQuantityKg.isNegative() ||
    reservedQuantityPieces < 0 ||
    availableQuantityKg.isNegative() ||
    availableQuantityPieces < 0
  ) {
    throw new ConflictException({
      code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
      message: 'Inventory balance reservation integrity is invalid',
      ...(balance.productId ? { productId: balance.productId } : {}),
      locationId: balance.locationId,
    });
  }

  return {
    quantityKg: quantityKg.toNumber(),
    quantityPieces,
    reservedQuantityKg: reservedQuantityKg.toNumber(),
    reservedQuantityPieces,
    availableQuantityKg: availableQuantityKg.toNumber(),
    availableQuantityPieces,
  };
}

export type InventoryBalanceChange = {
  previousQuantityKg: number;
  previousQuantityPieces: number;
  newQuantityKg: number;
  newQuantityPieces: number;
};

export type InventoryReservationConsumption = InventoryBalanceQuantity & {
  key: string;
};

type BalanceRecord = {
  productId: string;
  locationId: string;
  quantityKg: DecimalLike;
  quantityPieces: number;
  reservedQuantityKg: DecimalLike;
  reservedQuantityPieces: number;
};

type DecimalInventoryBalanceQuantity = Omit<
  InventoryBalanceQuantity,
  'quantityKg'
> & {
  quantityKg: Prisma.Decimal;
};

type DecimalBalanceSnapshot = Omit<
  InventoryBalanceSnapshot,
  'quantityKg' | 'reservedQuantityKg' | 'availableQuantityKg'
> & {
  quantityKg: Prisma.Decimal;
  reservedQuantityKg: Prisma.Decimal;
  availableQuantityKg: Prisma.Decimal;
};

@Injectable()
export class InventoryBalanceService {
  async get(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
  ): Promise<InventoryBalanceSnapshot | null> {
    const balance = (await tx.inventoryBalance.findUnique({
      where: { productId_locationId: { productId, locationId } },
    })) as BalanceRecord | null;

    return balance ? this.toSnapshot(balance) : null;
  }

  async reserve(
    tx: Prisma.TransactionClient,
    locationId: string,
    quantities: InventoryBalanceQuantity[],
  ): Promise<void> {
    const requestedByProduct = this.groupQuantities(quantities);
    if (requestedByProduct.size === 0) return;

    const balances = (await tx.inventoryBalance.findMany({
      where: {
        locationId,
        productId: { in: [...requestedByProduct.keys()] },
      },
      select: {
        productId: true,
        locationId: true,
        quantityKg: true,
        quantityPieces: true,
        reservedQuantityKg: true,
        reservedQuantityPieces: true,
      },
    })) as BalanceRecord[];
    const balancesByProduct = new Map(
      balances.map((balance) => [
        balance.productId,
        this.toDecimalSnapshot(balance),
      ]),
    );
    const findings = [...requestedByProduct.values()]
      .map((requested) => {
        const balance = balancesByProduct.get(requested.productId);
        const availableQuantityKg =
          balance?.availableQuantityKg ?? new Prisma.Decimal(0);
        const availableQuantityPieces = balance?.availableQuantityPieces ?? 0;
        const shortageKg = requested.quantityKg.sub(availableQuantityKg);
        const shortagePieces = Math.max(
          requested.quantityPieces - availableQuantityPieces,
          0,
        );

        return shortageKg.gt(0) || shortagePieces > 0
          ? {
              productId: requested.productId,
              locationId,
              unit:
                requested.unit ??
                this.resolveQuantityUnit(
                  requested.quantityKg.toNumber(),
                  requested.quantityPieces,
                ),
              requestedKg: requested.quantityKg.toNumber(),
              onHandKg: balance?.quantityKg.toNumber() ?? 0,
              reservedKg: balance?.reservedQuantityKg.toNumber() ?? 0,
              availableKg: availableQuantityKg.toNumber(),
              shortageKg: shortageKg.toNumber(),
              requestedPieces: requested.quantityPieces,
              onHandPieces: balance?.quantityPieces ?? 0,
              reservedPieces: balance?.reservedQuantityPieces ?? 0,
              availablePieces: availableQuantityPieces,
              shortagePieces,
            }
          : null;
      })
      .filter(
        (finding): finding is NonNullable<typeof finding> => finding !== null,
      );

    if (findings.length > 0) {
      throw new ConflictException({
        code: 'INSUFFICIENT_STOCK',
        message:
          'Origin location does not have sufficient available stock for this transfer',
        findings,
      });
    }

    for (const requested of requestedByProduct.values()) {
      const balance = balancesByProduct.get(requested.productId);
      if (!balance) {
        throw this.insufficientStockException(
          this.toPublicQuantity(requested),
          locationId,
          null,
        );
      }

      const updated = await tx.inventoryBalance.updateMany({
        where: {
          productId: requested.productId,
          locationId,
          quantityKg: {
            gte: balance.reservedQuantityKg.add(requested.quantityKg),
          },
          quantityPieces: {
            gte: balance.reservedQuantityPieces + requested.quantityPieces,
          },
          reservedQuantityKg: balance.reservedQuantityKg,
          reservedQuantityPieces: balance.reservedQuantityPieces,
        },
        data: {
          reservedQuantityKg: { increment: requested.quantityKg },
          reservedQuantityPieces: { increment: requested.quantityPieces },
        },
      });

      if (updated.count !== 1) {
        throw this.insufficientStockException(
          this.toPublicQuantity(requested),
          locationId,
          this.toPublicSnapshot(balance),
        );
      }
    }
  }

  async releaseReservation(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    quantities: Omit<InventoryBalanceQuantity, 'productId'>,
  ): Promise<void> {
    this.assertValidQuantities(quantities);
    const quantityKg = toDecimal(quantities.quantityKg);
    const updated = await tx.inventoryBalance.updateMany({
      where: {
        productId,
        locationId,
        reservedQuantityKg: { gte: quantityKg },
        reservedQuantityPieces: { gte: quantities.quantityPieces },
      },
      data: {
        reservedQuantityKg: { decrement: quantityKg },
        reservedQuantityPieces: { decrement: quantities.quantityPieces },
      },
    });

    if (updated.count !== 1) {
      throw this.reservationIntegrityException(
        productId,
        locationId,
        quantities,
      );
    }
  }

  async releaseReservations(
    tx: Prisma.TransactionClient,
    locationId: string,
    quantities: InventoryBalanceQuantity[],
  ): Promise<void> {
    const requestedByProduct = this.groupQuantities(quantities);
    if (requestedByProduct.size === 0) return;

    const balances = (await tx.inventoryBalance.findMany({
      where: {
        locationId,
        productId: { in: [...requestedByProduct.keys()] },
      },
      select: {
        productId: true,
        locationId: true,
        quantityKg: true,
        quantityPieces: true,
        reservedQuantityKg: true,
        reservedQuantityPieces: true,
      },
    })) as BalanceRecord[];
    const balancesByProduct = new Map(
      balances.map((balance) => [
        balance.productId,
        this.toDecimalSnapshot(balance),
      ]),
    );

    for (const requested of requestedByProduct.values()) {
      const balance = balancesByProduct.get(requested.productId);
      if (
        !balance ||
        balance.reservedQuantityKg.lt(requested.quantityKg) ||
        balance.reservedQuantityPieces < requested.quantityPieces
      ) {
        throw this.reservationIntegrityException(
          requested.productId,
          locationId,
          this.toPublicQuantities(requested),
        );
      }
    }

    for (const requested of requestedByProduct.values()) {
      const updated = await tx.inventoryBalance.updateMany({
        where: {
          productId: requested.productId,
          locationId,
          reservedQuantityKg: { gte: requested.quantityKg },
          reservedQuantityPieces: { gte: requested.quantityPieces },
        },
        data: {
          reservedQuantityKg: { decrement: requested.quantityKg },
          reservedQuantityPieces: { decrement: requested.quantityPieces },
        },
      });

      if (updated.count !== 1) {
        throw this.reservationIntegrityException(
          requested.productId,
          locationId,
          this.toPublicQuantities(requested),
        );
      }
    }
  }

  async consumeReservation(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    quantities: Omit<InventoryBalanceQuantity, 'productId'>,
  ): Promise<InventoryBalanceChange> {
    this.assertValidQuantities(quantities);
    const quantityKg = toDecimal(quantities.quantityKg);
    const previous = await this.getDecimalSnapshot(tx, productId, locationId);
    if (!previous) {
      throw this.reservationIntegrityException(
        productId,
        locationId,
        quantities,
      );
    }
    const updated = await tx.inventoryBalance.updateMany({
      where: {
        productId,
        locationId,
        quantityKg: { gte: quantityKg },
        quantityPieces: { gte: quantities.quantityPieces },
        reservedQuantityKg: { gte: quantityKg },
        reservedQuantityPieces: { gte: quantities.quantityPieces },
      },
      data: {
        quantityKg: { decrement: quantityKg },
        quantityPieces: { decrement: quantities.quantityPieces },
        reservedQuantityKg: { decrement: quantityKg },
        reservedQuantityPieces: { decrement: quantities.quantityPieces },
      },
    });

    if (updated.count !== 1) {
      throw this.reservationIntegrityException(
        productId,
        locationId,
        quantities,
      );
    }

    const current = await this.getDecimalRequired(tx, productId, locationId);
    return this.toChange(previous, current);
  }

  async consumeReservations(
    tx: Prisma.TransactionClient,
    locationId: string,
    requests: InventoryReservationConsumption[],
  ): Promise<Map<string, InventoryBalanceChange>> {
    if (requests.length === 0) return new Map();

    const grouped = new Map<string, DecimalInventoryBalanceQuantity>();
    for (const request of requests) {
      this.assertValidQuantities(request);
      const current = grouped.get(request.productId) ?? {
        productId: request.productId,
        unit: request.unit,
        quantityKg: new Prisma.Decimal(0),
        quantityPieces: 0,
      };
      current.quantityKg = current.quantityKg.add(
        toDecimal(request.quantityKg),
      );
      current.quantityPieces += request.quantityPieces;
      grouped.set(request.productId, current);
    }

    const balances = (await tx.inventoryBalance.findMany({
      where: {
        locationId,
        productId: { in: [...grouped.keys()] },
      },
      select: {
        productId: true,
        locationId: true,
        quantityKg: true,
        quantityPieces: true,
        reservedQuantityKg: true,
        reservedQuantityPieces: true,
      },
    })) as BalanceRecord[];
    const snapshots = new Map(
      balances.map((balance) => [
        balance.productId,
        this.toDecimalSnapshot(balance),
      ]),
    );

    for (const requested of grouped.values()) {
      const balance = snapshots.get(requested.productId);
      if (
        !balance ||
        balance.quantityKg.lt(requested.quantityKg) ||
        balance.quantityPieces < requested.quantityPieces ||
        balance.reservedQuantityKg.lt(requested.quantityKg) ||
        balance.reservedQuantityPieces < requested.quantityPieces
      ) {
        throw this.reservationIntegrityException(
          requested.productId,
          locationId,
          this.toPublicQuantities(requested),
        );
      }
    }

    const changes = new Map<string, InventoryBalanceChange>();
    const working = new Map(snapshots);
    for (const request of requests) {
      const previous = working.get(request.productId);
      if (!previous) {
        throw this.reservationIntegrityException(
          request.productId,
          locationId,
          request,
        );
      }

      const requestQuantityKg = toDecimal(request.quantityKg);
      const nextQuantityKg = previous.quantityKg.sub(requestQuantityKg);
      const nextQuantityPieces =
        previous.quantityPieces - request.quantityPieces;
      const nextReservedQuantityKg =
        previous.reservedQuantityKg.sub(requestQuantityKg);
      const nextReservedQuantityPieces =
        previous.reservedQuantityPieces - request.quantityPieces;

      changes.set(request.key, {
        previousQuantityKg: previous.quantityKg.toNumber(),
        previousQuantityPieces: previous.quantityPieces,
        newQuantityKg: nextQuantityKg.toNumber(),
        newQuantityPieces: nextQuantityPieces,
      });
      working.set(request.productId, {
        ...previous,
        quantityKg: nextQuantityKg,
        quantityPieces: nextQuantityPieces,
        reservedQuantityKg: nextReservedQuantityKg,
        reservedQuantityPieces: nextReservedQuantityPieces,
        availableQuantityKg: nextQuantityKg.sub(nextReservedQuantityKg),
        availableQuantityPieces:
          nextQuantityPieces - nextReservedQuantityPieces,
      });
    }

    for (const requested of grouped.values()) {
      const updated = await tx.inventoryBalance.updateMany({
        where: {
          productId: requested.productId,
          locationId,
          quantityKg: { gte: requested.quantityKg },
          quantityPieces: { gte: requested.quantityPieces },
          reservedQuantityKg: { gte: requested.quantityKg },
          reservedQuantityPieces: { gte: requested.quantityPieces },
        },
        data: {
          quantityKg: { decrement: requested.quantityKg },
          quantityPieces: { decrement: requested.quantityPieces },
          reservedQuantityKg: { decrement: requested.quantityKg },
          reservedQuantityPieces: { decrement: requested.quantityPieces },
        },
      });

      if (updated.count !== 1) {
        throw this.reservationIntegrityException(
          requested.productId,
          locationId,
          this.toPublicQuantities(requested),
        );
      }
    }

    return changes;
  }

  async decreaseAvailable(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    quantities: Omit<InventoryBalanceQuantity, 'productId'>,
    errorMessage = 'Inventory operation cannot leave negative available stock',
  ): Promise<InventoryBalanceChange> {
    this.assertValidQuantities(quantities);
    const quantityKg = toDecimal(quantities.quantityKg);
    const previous = await this.getDecimalSnapshot(tx, productId, locationId);
    if (!previous) {
      throw this.insufficientStockException(
        { productId, ...quantities },
        locationId,
        null,
        errorMessage,
      );
    }
    const updated = await tx.inventoryBalance.updateMany({
      where: {
        productId,
        locationId,
        quantityKg: {
          gte: previous.reservedQuantityKg.add(quantityKg),
        },
        quantityPieces: {
          gte: previous.reservedQuantityPieces + quantities.quantityPieces,
        },
        reservedQuantityKg: previous.reservedQuantityKg,
        reservedQuantityPieces: previous.reservedQuantityPieces,
      },
      data: {
        quantityKg: { decrement: quantityKg },
        quantityPieces: { decrement: quantities.quantityPieces },
      },
    });

    if (updated.count !== 1) {
      const isInsufficient =
        quantityKg.gt(previous.availableQuantityKg) ||
        quantities.quantityPieces > previous.availableQuantityPieces;
      if (isInsufficient) {
        throw this.insufficientStockException(
          { productId, ...quantities },
          locationId,
          this.toPublicSnapshot(previous),
          errorMessage,
        );
      }

      throw new ConflictException({
        code: 'INVENTORY_CONCURRENCY_CONFLICT',
        message: 'Inventory availability changed while the operation ran',
        productId,
        locationId,
      });
    }

    const current = await this.getDecimalRequired(tx, productId, locationId);
    return this.toChange(previous, current);
  }

  async increase(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    quantities: Omit<InventoryBalanceQuantity, 'productId'>,
  ): Promise<InventoryBalanceChange> {
    this.assertValidQuantities(quantities);
    const quantityKg = toDecimal(quantities.quantityKg);
    const previous = await this.getDecimalSnapshot(tx, productId, locationId);
    await tx.inventoryBalance.upsert({
      where: { productId_locationId: { productId, locationId } },
      create: {
        productId,
        locationId,
        quantityKg,
        quantityPieces: quantities.quantityPieces,
      },
      update: {
        quantityKg: { increment: quantityKg },
        quantityPieces: { increment: quantities.quantityPieces },
      },
    });
    const current = await this.getDecimalRequired(tx, productId, locationId);

    return {
      previousQuantityKg: previous?.quantityKg.toNumber() ?? 0,
      previousQuantityPieces: previous?.quantityPieces ?? 0,
      newQuantityKg: current.quantityKg.toNumber(),
      newQuantityPieces: current.quantityPieces,
    };
  }

  private groupQuantities(
    quantities: InventoryBalanceQuantity[],
  ): Map<string, DecimalInventoryBalanceQuantity> {
    const grouped = new Map<string, DecimalInventoryBalanceQuantity>();
    for (const quantity of quantities) {
      this.assertValidQuantities(quantity);
      const current = grouped.get(quantity.productId) ?? {
        productId: quantity.productId,
        unit: quantity.unit,
        quantityKg: new Prisma.Decimal(0),
        quantityPieces: 0,
      };
      current.unit = this.mergeUnits(current.unit, quantity.unit);
      current.quantityKg = current.quantityKg.add(
        toDecimal(quantity.quantityKg),
      );
      current.quantityPieces += quantity.quantityPieces;
      grouped.set(quantity.productId, current);
    }
    return grouped;
  }

  private async getDecimalSnapshot(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
  ): Promise<DecimalBalanceSnapshot | null> {
    const balance = (await tx.inventoryBalance.findUnique({
      where: { productId_locationId: { productId, locationId } },
    })) as BalanceRecord | null;

    return balance ? this.toDecimalSnapshot(balance) : null;
  }

  private async getDecimalRequired(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
  ): Promise<DecimalBalanceSnapshot> {
    const balance = await this.getDecimalSnapshot(tx, productId, locationId);
    if (!balance) {
      throw new BadRequestException('Inventory balance could not be updated');
    }
    return balance;
  }

  private toSnapshot(balance: BalanceRecord): InventoryBalanceSnapshot {
    return this.toPublicSnapshot(this.toDecimalSnapshot(balance));
  }

  private toDecimalSnapshot(balance: BalanceRecord): DecimalBalanceSnapshot {
    const quantityKg = toDecimal(balance.quantityKg);
    const reservedQuantityKg = toDecimal(balance.reservedQuantityKg);
    const quantityPieces = balance.quantityPieces ?? 0;
    const reservedQuantityPieces = balance.reservedQuantityPieces ?? 0;
    const availableQuantityKg = quantityKg.sub(reservedQuantityKg);

    if (
      !quantityKg.isFinite() ||
      !reservedQuantityKg.isFinite() ||
      quantityKg.isNegative() ||
      reservedQuantityKg.isNegative() ||
      availableQuantityKg.isNegative() ||
      !Number.isFinite(quantityPieces) ||
      quantityPieces < 0 ||
      !Number.isFinite(reservedQuantityPieces) ||
      reservedQuantityPieces < 0 ||
      quantityPieces - reservedQuantityPieces < 0
    ) {
      throw new ConflictException({
        code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
        message: 'Inventory balance reservation integrity is invalid',
        productId: balance.productId,
        locationId: balance.locationId,
      });
    }

    return {
      productId: balance.productId,
      locationId: balance.locationId,
      quantityKg,
      quantityPieces,
      reservedQuantityKg,
      reservedQuantityPieces,
      availableQuantityKg,
      availableQuantityPieces: quantityPieces - reservedQuantityPieces,
    };
  }

  private toPublicSnapshot(
    balance: DecimalBalanceSnapshot,
  ): InventoryBalanceSnapshot {
    return {
      productId: balance.productId,
      locationId: balance.locationId,
      quantityKg: balance.quantityKg.toNumber(),
      quantityPieces: balance.quantityPieces,
      reservedQuantityKg: balance.reservedQuantityKg.toNumber(),
      reservedQuantityPieces: balance.reservedQuantityPieces,
      availableQuantityKg: balance.availableQuantityKg.toNumber(),
      availableQuantityPieces: balance.availableQuantityPieces,
    };
  }

  private toPublicQuantity(
    quantity: DecimalInventoryBalanceQuantity,
  ): InventoryBalanceQuantity {
    return {
      ...quantity,
      quantityKg: quantity.quantityKg.toNumber(),
    };
  }

  private toPublicQuantities(
    quantity:
      | Omit<DecimalInventoryBalanceQuantity, 'productId'>
      | DecimalInventoryBalanceQuantity,
  ): Omit<InventoryBalanceQuantity, 'productId'> | InventoryBalanceQuantity {
    return {
      ...quantity,
      quantityKg: quantity.quantityKg.toNumber(),
    };
  }

  private toChange(
    previous: DecimalBalanceSnapshot,
    current: DecimalBalanceSnapshot,
  ): InventoryBalanceChange {
    return {
      previousQuantityKg: previous.quantityKg.toNumber(),
      previousQuantityPieces: previous.quantityPieces,
      newQuantityKg: current.quantityKg.toNumber(),
      newQuantityPieces: current.quantityPieces,
    };
  }

  private assertValidQuantities(
    quantities: Pick<InventoryBalanceQuantity, 'quantityKg' | 'quantityPieces'>,
  ): void {
    if (
      !Number.isFinite(quantities.quantityKg) ||
      !Number.isFinite(quantities.quantityPieces) ||
      quantities.quantityKg < 0 ||
      quantities.quantityPieces < 0 ||
      !Number.isInteger(quantities.quantityPieces)
    ) {
      throw new BadRequestException('Inventory quantities are invalid');
    }
  }

  private insufficientStockException(
    requested: InventoryBalanceQuantity,
    locationId: string,
    balance: InventoryBalanceSnapshot | null,
    message = 'Origin location does not have sufficient available stock for this transfer',
  ): ConflictException {
    const availableQuantityKg = balance?.availableQuantityKg ?? 0;
    const availableQuantityPieces = balance?.availableQuantityPieces ?? 0;
    return new ConflictException({
      code: 'INSUFFICIENT_STOCK',
      message,
      findings: [
        {
          productId: requested.productId,
          locationId,
          unit:
            requested.unit ??
            this.resolveQuantityUnit(
              requested.quantityKg,
              requested.quantityPieces,
            ),
          requestedKg: requested.quantityKg,
          onHandKg: balance?.quantityKg ?? 0,
          reservedKg: balance?.reservedQuantityKg ?? 0,
          availableKg: availableQuantityKg,
          shortageKg: Math.max(requested.quantityKg - availableQuantityKg, 0),
          requestedPieces: requested.quantityPieces,
          onHandPieces: balance?.quantityPieces ?? 0,
          reservedPieces: balance?.reservedQuantityPieces ?? 0,
          availablePieces: availableQuantityPieces,
          shortagePieces: Math.max(
            requested.quantityPieces - availableQuantityPieces,
            0,
          ),
        },
      ],
    });
  }

  private reservationIntegrityException(
    productId: string,
    locationId: string,
    quantities: Omit<InventoryBalanceQuantity, 'productId'>,
  ): ConflictException {
    return new ConflictException({
      code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
      message:
        'The pending transfer reservation does not match the inventory balance',
      productId,
      locationId,
      quantityKg: quantities.quantityKg,
      quantityPieces: quantities.quantityPieces,
    });
  }

  private mergeUnits(
    left: ProductUnit | undefined,
    right: ProductUnit | undefined,
  ): ProductUnit | undefined {
    if (!left) return right;
    if (!right || left === right) return left;
    return ProductUnit.KG_AND_PIECE;
  }

  private resolveQuantityUnit(
    quantityKg: number | Prisma.Decimal,
    quantityPieces: number,
  ): ProductUnit {
    if (toDecimal(quantityKg).gt(0) && quantityPieces > 0) {
      return ProductUnit.KG_AND_PIECE;
    }
    return quantityPieces > 0 ? ProductUnit.PIECE : ProductUnit.KG;
  }
}

function toDecimal(value: DecimalLike): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(
    typeof value === 'object' ? value.toString() : value,
  );
}
