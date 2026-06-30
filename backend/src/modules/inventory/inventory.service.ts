import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InventoryMovementType, ProductUnit } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateInventoryAdjustmentDto,
  ListInventoryBalancesQueryDto,
  ListInventoryMovementsQueryDto,
} from './dto';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type ProductRecord = {
  id: string;
  name: string;
  unit: ProductUnit;
  isActive: boolean;
};

type LocationRecord = {
  id: string;
  name: string;
  isActive: boolean;
};

type InventoryBalanceRecord = {
  id: string;
  productId: string;
  locationId: string;
  quantityKg: DecimalLike;
  quantityPieces: number;
  minQuantityKg?: DecimalLike;
  minQuantityPieces?: number;
  product?: {
    name: string;
    sku: string | null;
    unit: ProductUnit;
  } | null;
  location?: { name: string } | null;
};

type InventoryMovementRecord = {
  id: string;
  productId: string;
  locationId: string;
  userId: string;
  type: InventoryMovementType;
  quantity?: DecimalLike;
  quantityKg?: DecimalLike;
  quantityPieces?: number | null;
  previousStock?: DecimalLike;
  newStock?: DecimalLike;
  previousQuantityKg?: DecimalLike;
  newQuantityKg?: DecimalLike;
  previousQuantityPieces?: number | null;
  newQuantityPieces?: number | null;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  transferId?: string | null;
  saleId?: string | null;
  purchaseId?: string | null;
  routeSettlementId?: string | null;
  pointOfSaleDailyCloseId?: string | null;
  createdAt: Date;
  product?: { name: string } | null;
  location?: { name: string } | null;
};

type MovementResponse = {
  id: string;
  productId: string;
  productName?: string;
  locationId: string;
  locationName?: string;
  type: InventoryMovementType;
  unit: ProductUnit;
  quantityKg: number;
  quantityPieces: number;
  previousQuantityKg: number;
  newQuantityKg: number;
  previousQuantityPieces: number;
  newQuantityPieces: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  transferId: string | null;
  saleId: string | null;
  purchaseId: string | null;
  routeSettlementId: string | null;
  pointOfSaleDailyCloseId: string | null;
  userId: string;
  createdAt: Date;
};

type MovementListResponse = { items: MovementResponse[] };

type BalanceResponse = {
  productId: string;
  productName?: string;
  sku?: string | null;
  unit?: ProductUnit;
  locationId: string;
  locationName?: string;
  quantityKg: number;
  quantityPieces: number;
  minQuantityKg: number;
  minQuantityPieces: number;
  isLowStock: boolean;
};

type BalanceListResponse = { items: BalanceResponse[] };

type NormalizedQuantities = {
  quantityKg: number;
  quantityPieces: number;
  genericQuantity: number;
};

type AppliedBalanceChange = {
  previousQuantityKg: number;
  previousQuantityPieces: number;
  newQuantityKg: number;
  newQuantityPieces: number;
};

const DECREASE_MOVEMENT_TYPES = new Set<InventoryMovementType>([
  'OUT',
  'SALE',
  'CANCEL_PURCHASE',
  'TRANSFER_OUT',
  'SHRINKAGE',
]);

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findBalances(
    query: ListInventoryBalancesQueryDto,
  ): Promise<BalanceListResponse> {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: this.buildBalanceWhere(query),
      include: { product: true, location: true },
      orderBy: [{ location: { name: 'asc' } }, { product: { name: 'asc' } }],
      ...this.buildPagination(query),
    });

    const items = balances.map((balance) => this.toBalanceResponse(balance));

    return {
      items:
        query.lowStock === true
          ? items.filter((item) => item.isLowStock === true)
          : items,
    };
  }

  async createAdjustment(
    dto: CreateInventoryAdjustmentDto,
    userId: string,
  ): Promise<MovementResponse> {
    const reason = this.normalizeRequiredReason(dto.reason);

    return this.prisma.$transaction(
      async (tx) => {
        const product = await tx.product.findUnique({
          where: { id: dto.productId },
          select: { id: true, name: true, unit: true, isActive: true },
        });
        this.assertProductAvailable(product);

        const location = await tx.operationalLocation.findUnique({
          where: { id: dto.locationId },
          select: { id: true, name: true, isActive: true },
        });
        this.assertLocationAvailable(location);

        const quantities = this.normalizeQuantities(dto, product.unit);
        const direction = this.getMovementDirection(dto.type);
        const {
          previousQuantityKg,
          previousQuantityPieces,
          newQuantityKg,
          newQuantityPieces,
        } = await this.applyAtomicBalanceChange(
          tx,
          dto.productId,
          dto.locationId,
          direction,
          quantities,
        );

        const movement = (await tx.inventoryMovement.create({
          data: {
            productId: dto.productId,
            locationId: dto.locationId,
            userId,
            type: dto.type,
            quantity: quantities.genericQuantity,
            quantityKg: quantities.quantityKg,
            quantityPieces: quantities.quantityPieces,
            previousStock: previousQuantityKg,
            newStock: newQuantityKg,
            previousQuantityKg,
            newQuantityKg,
            previousQuantityPieces,
            newQuantityPieces,
            reason,
            referenceType: dto.referenceType ?? null,
            referenceId: dto.referenceId ?? null,
            routeSettlementId: dto.routeSettlementId ?? null,
            pointOfSaleDailyCloseId: dto.pointOfSaleDailyCloseId ?? null,
          },
          include: { product: true, location: true },
        })) as InventoryMovementRecord;

        return this.toMovementResponse(movement);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async findMovements(
    query: ListInventoryMovementsQueryDto,
  ): Promise<MovementListResponse> {
    const movements = (await this.prisma.inventoryMovement.findMany({
      where: this.buildMovementWhere(query),
      include: { product: true, location: true },
      orderBy: { createdAt: 'desc' },
      ...this.buildPagination(query),
    })) as InventoryMovementRecord[];

    return {
      items: movements.map((movement) => this.toMovementResponse(movement)),
    };
  }

  private normalizeRequiredReason(reason?: string): string {
    const normalized = reason?.trim();

    if (!normalized) {
      throw new BadRequestException(
        'reason is required for manual adjustments',
      );
    }

    return normalized;
  }

  private assertProductAvailable(
    product: ProductRecord | null,
  ): asserts product is ProductRecord {
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Inactive products cannot be adjusted');
    }
  }

  private assertLocationAvailable(
    location: LocationRecord | null,
  ): asserts location is LocationRecord {
    if (!location) {
      throw new NotFoundException('Location not found');
    }

    if (!location.isActive) {
      throw new BadRequestException(
        'Inventory adjustments require an active location',
      );
    }
  }

  private normalizeQuantities(
    dto: CreateInventoryAdjustmentDto,
    productUnit: ProductUnit,
  ): NormalizedQuantities {
    const quantityKg = dto.quantityKg ?? 0;
    const quantityPieces = dto.quantityPieces ?? 0;

    if (quantityKg < 0 || quantityPieces < 0) {
      throw new BadRequestException(
        'Adjustment quantities must be non-negative',
      );
    }

    this.assertUnitMatchesProduct(
      dto.unit,
      productUnit,
      quantityKg,
      quantityPieces,
    );

    const genericQuantity = quantityKg > 0 ? quantityKg : quantityPieces;

    if (genericQuantity <= 0) {
      throw new BadRequestException(
        'Adjustment must include quantityKg or quantityPieces',
      );
    }

    return { quantityKg, quantityPieces, genericQuantity };
  }

  private assertUnitMatchesProduct(
    requestedUnit: ProductUnit,
    productUnit: ProductUnit,
    quantityKg: number,
    quantityPieces: number,
  ): void {
    if (productUnit === ('KG' as ProductUnit)) {
      if (
        requestedUnit !== ('KG' as ProductUnit) ||
        quantityKg <= 0 ||
        quantityPieces !== 0
      ) {
        throw new BadRequestException(
          'KG products require a positive quantityKg only',
        );
      }
      return;
    }

    if (productUnit === ('PIECE' as ProductUnit)) {
      if (
        requestedUnit !== ('PIECE' as ProductUnit) ||
        quantityPieces <= 0 ||
        quantityKg !== 0
      ) {
        throw new BadRequestException(
          'PIECE products require a positive quantityPieces only',
        );
      }
      return;
    }

    if (
      requestedUnit === ('KG' as ProductUnit) &&
      (quantityKg <= 0 || quantityPieces !== 0)
    ) {
      throw new BadRequestException(
        'KG adjustments require a positive quantityKg only',
      );
    }

    if (
      requestedUnit === ('PIECE' as ProductUnit) &&
      (quantityPieces <= 0 || quantityKg !== 0)
    ) {
      throw new BadRequestException(
        'PIECE adjustments require a positive quantityPieces only',
      );
    }

    if (
      requestedUnit === ('KG_AND_PIECE' as ProductUnit) &&
      quantityKg <= 0 &&
      quantityPieces <= 0
    ) {
      throw new BadRequestException(
        'KG_AND_PIECE adjustments require quantityKg, quantityPieces, or both',
      );
    }
  }

  private getMovementDirection(type: InventoryMovementType): 1 | -1 {
    return DECREASE_MOVEMENT_TYPES.has(type) ? -1 : 1;
  }

  private assertNonNegativeBalance(
    quantityKg: number,
    quantityPieces: number,
  ): void {
    if (quantityKg < 0 || quantityPieces < 0) {
      throw new BadRequestException(
        'Inventory adjustment cannot leave negative stock',
      );
    }
  }

  private async applyAtomicBalanceChange(
    tx: Prisma.TransactionClient,
    productId: string,
    locationId: string,
    direction: 1 | -1,
    quantities: NormalizedQuantities,
  ): Promise<AppliedBalanceChange> {
    if (direction === -1) {
      const result = await tx.inventoryBalance.updateMany({
        where: {
          productId,
          locationId,
          quantityKg: { gte: quantities.quantityKg },
          quantityPieces: { gte: quantities.quantityPieces },
        },
        data: {
          quantityKg: { decrement: quantities.quantityKg },
          quantityPieces: { decrement: quantities.quantityPieces },
        },
      });

      if (result.count !== 1) {
        throw new BadRequestException(
          'Inventory adjustment cannot leave negative stock',
        );
      }
    } else {
      await tx.inventoryBalance.upsert({
        where: {
          productId_locationId: {
            productId,
            locationId,
          },
        },
        create: {
          productId,
          locationId,
          quantityKg: quantities.quantityKg,
          quantityPieces: quantities.quantityPieces,
        },
        update: {
          quantityKg: { increment: quantities.quantityKg },
          quantityPieces: { increment: quantities.quantityPieces },
        },
      });
    }

    const balance = (await tx.inventoryBalance.findUnique({
      where: {
        productId_locationId: {
          productId,
          locationId,
        },
      },
    })) as InventoryBalanceRecord | null;

    if (!balance) {
      throw new BadRequestException('Inventory balance could not be updated');
    }

    const newQuantityKg = this.toNumber(balance.quantityKg);
    const newQuantityPieces = balance.quantityPieces;
    const previousQuantityKg =
      newQuantityKg - direction * quantities.quantityKg;
    const previousQuantityPieces =
      newQuantityPieces - direction * quantities.quantityPieces;

    this.assertNonNegativeBalance(newQuantityKg, newQuantityPieces);

    return {
      previousQuantityKg,
      previousQuantityPieces,
      newQuantityKg,
      newQuantityPieces,
    };
  }

  private buildMovementWhere(
    query: ListInventoryMovementsQueryDto,
  ): Prisma.InventoryMovementWhereInput {
    const createdAt = this.buildCreatedAtFilter(query.dateFrom, query.dateTo);

    return {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.referenceType ? { referenceType: query.referenceType } : {}),
      ...(query.referenceId ? { referenceId: query.referenceId } : {}),
      ...(query.pointOfSaleDailyCloseId
        ? { pointOfSaleDailyCloseId: query.pointOfSaleDailyCloseId }
        : {}),
      ...(createdAt ? { createdAt } : {}),
    };
  }

  private buildBalanceWhere(
    query: ListInventoryBalancesQueryDto,
  ): Prisma.InventoryBalanceWhereInput {
    const search = query.search?.trim();

    return {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      product: {
        isActive: true,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      location: { isActive: true },
    };
  }

  private buildCreatedAtFilter(
    dateFrom?: string,
    dateTo?: string,
  ): Prisma.DateTimeFilter | undefined {
    if (!dateFrom && !dateTo) {
      return undefined;
    }

    return {
      ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { lte: new Date(dateTo) } : {}),
    };
  }

  private buildPagination(query: { page?: number; limit?: number }): {
    skip?: number;
    take?: number;
  } {
    if (!query.limit) {
      return {};
    }

    return {
      skip: ((query.page ?? 1) - 1) * query.limit,
      take: query.limit,
    };
  }

  private toBalanceResponse(balance: InventoryBalanceRecord): BalanceResponse {
    const quantityKg = this.toNumber(balance.quantityKg);
    const quantityPieces = balance.quantityPieces;
    const minQuantityKg = this.toNumber(balance.minQuantityKg);
    const minQuantityPieces = balance.minQuantityPieces ?? 0;

    this.assertNonNegativeBalance(quantityKg, quantityPieces);

    return {
      productId: balance.productId,
      productName: balance.product?.name,
      sku: balance.product?.sku,
      unit: balance.product?.unit,
      locationId: balance.locationId,
      locationName: balance.location?.name,
      quantityKg,
      quantityPieces,
      minQuantityKg,
      minQuantityPieces,
      isLowStock:
        quantityKg < minQuantityKg || quantityPieces < minQuantityPieces,
    };
  }

  private toMovementResponse(
    movement: InventoryMovementRecord,
  ): MovementResponse {
    const quantityKg = this.toNumber(movement.quantityKg);
    const quantityPieces = movement.quantityPieces ?? 0;

    return {
      id: movement.id,
      productId: movement.productId,
      productName: movement.product?.name,
      locationId: movement.locationId,
      locationName: movement.location?.name,
      type: movement.type,
      unit: this.resolveMovementUnit(quantityKg, quantityPieces),
      quantityKg,
      quantityPieces,
      previousQuantityKg: this.toNumber(movement.previousQuantityKg),
      newQuantityKg: this.toNumber(movement.newQuantityKg),
      previousQuantityPieces: movement.previousQuantityPieces ?? 0,
      newQuantityPieces: movement.newQuantityPieces ?? 0,
      reason: movement.reason ?? null,
      referenceType: movement.referenceType ?? null,
      referenceId: movement.referenceId ?? null,
      transferId: movement.transferId ?? null,
      saleId: movement.saleId ?? null,
      purchaseId: movement.purchaseId ?? null,
      routeSettlementId: movement.routeSettlementId ?? null,
      pointOfSaleDailyCloseId: movement.pointOfSaleDailyCloseId ?? null,
      userId: movement.userId,
      createdAt: movement.createdAt,
    };
  }

  private resolveMovementUnit(
    quantityKg: number,
    quantityPieces: number,
  ): ProductUnit {
    if (quantityKg > 0 && quantityPieces > 0) {
      return 'KG_AND_PIECE';
    }

    if (quantityPieces > 0) {
      return 'PIECE';
    }

    return 'KG';
  }

  private toNumber(value: DecimalLike): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === 'object' && 'toNumber' in value) {
      return value.toNumber();
    }

    return Number(value);
  }
}
