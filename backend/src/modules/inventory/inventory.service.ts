import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InventoryMovementType, ProductUnit } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CreateInventoryAdjustmentDto,
  ListInventoryBalancesQueryDto,
  ListInventoryMovementsQueryDto,
} from './dto';
import {
  InventoryBalanceService,
  toInventoryBalanceAvailability,
} from './inventory-balance.service';

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
  reservedQuantityKg?: DecimalLike;
  reservedQuantityPieces?: number;
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
  idempotencyKey?: string | null;
  idempotencyPayloadHash?: string | null;
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
  reservedQuantityKg: number;
  reservedQuantityPieces: number;
  availableQuantityKg: number;
  availableQuantityPieces: number;
  minQuantityKg: number;
  minQuantityPieces: number;
  isLowStock: boolean;
};

type BalanceListResponse = { items: BalanceResponse[] };
type InventoryScopeActor = Pick<
  AuthenticatedUser,
  'role' | 'operationalLocationId'
>;

type NormalizedQuantities = {
  quantityKg: number;
  quantityPieces: number;
  genericQuantity: number;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceService: InventoryBalanceService,
  ) {}

  async findBalances(
    query: ListInventoryBalancesQueryDto,
    actor?: InventoryScopeActor,
  ): Promise<BalanceListResponse> {
    const balances = await this.prisma.inventoryBalance.findMany({
      where: this.buildBalanceWhere(query, actor),
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
    idempotencyKey: string,
    actor?: InventoryScopeActor,
  ): Promise<MovementResponse> {
    const normalizedIdempotencyKey =
      this.normalizeIdempotencyKey(idempotencyKey);
    const reason = this.normalizeRequiredReason(dto.reason);
    const payloadHash = this.hashPayload(
      this.buildAdjustmentPayload(dto, userId, reason),
    );

    return this.withSerializableRetry(
      () =>
        this.prisma.$transaction(
          async (tx) => {
            const replay = (await tx.inventoryMovement.findUnique({
              where: { idempotencyKey: normalizedIdempotencyKey },
              include: { product: true, location: true },
            })) as InventoryMovementRecord | null;
            if (replay) {
              return this.resolveAdjustmentReplay(replay, payloadHash);
            }

            const product = await tx.product.findUnique({
              where: { id: dto.productId },
              select: { id: true, name: true, unit: true, isActive: true },
            });
            this.assertProductAvailable(product);

            const location = await tx.operationalLocation.findUnique({
              where: { id: dto.locationId },
              select: {
                id: true,
                name: true,
                isActive: true,
                parentId: true,
                type: true,
              },
            });
            this.assertLocationAvailable(location);
            this.assertLocationScope(location, actor);

            const quantities = this.normalizeQuantities(dto, product.unit);
            const direction = this.getMovementDirection(dto.type);
            const {
              previousQuantityKg,
              previousQuantityPieces,
              newQuantityKg,
              newQuantityPieces,
            } =
              direction === -1
                ? await this.balanceService.decreaseAvailable(
                    tx,
                    dto.productId,
                    dto.locationId,
                    quantities,
                    'Inventory adjustment cannot leave negative available stock',
                  )
                : await this.balanceService.increase(
                    tx,
                    dto.productId,
                    dto.locationId,
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
                referenceType: this.normalizeOptionalText(dto.referenceType),
                referenceId: this.normalizeOptionalText(dto.referenceId),
                routeSettlementId: this.normalizeOptionalText(
                  dto.routeSettlementId,
                ),
                pointOfSaleDailyCloseId: this.normalizeOptionalText(
                  dto.pointOfSaleDailyCloseId,
                ),
                idempotencyKey: normalizedIdempotencyKey,
                idempotencyPayloadHash: payloadHash,
              },
              include: { product: true, location: true },
            })) as InventoryMovementRecord;

            return this.toMovementResponse(movement);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      normalizedIdempotencyKey,
      payloadHash,
    );
  }

  async findMovements(
    query: ListInventoryMovementsQueryDto,
    actor?: InventoryScopeActor,
  ): Promise<MovementListResponse> {
    const movements = (await this.prisma.inventoryMovement.findMany({
      where: this.buildMovementWhere(query, actor),
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

  private normalizeIdempotencyKey(idempotencyKey?: string): string {
    const normalized = idempotencyKey?.trim();
    if (!normalized) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return normalized;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private buildAdjustmentPayload(
    dto: CreateInventoryAdjustmentDto,
    userId: string,
    reason: string,
  ): Record<string, unknown> {
    return {
      productId: dto.productId,
      locationId: dto.locationId,
      type: dto.type,
      unit: dto.unit,
      quantityKg: dto.quantityKg ?? 0,
      quantityPieces: dto.quantityPieces ?? 0,
      reason,
      referenceType: this.normalizeOptionalText(dto.referenceType),
      referenceId: this.normalizeOptionalText(dto.referenceId),
      routeSettlementId: this.normalizeOptionalText(dto.routeSettlementId),
      pointOfSaleDailyCloseId: this.normalizeOptionalText(
        dto.pointOfSaleDailyCloseId,
      ),
      userId,
    };
  }

  private hashPayload(payload: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  private resolveAdjustmentReplay(
    movement: InventoryMovementRecord,
    payloadHash: string,
  ): MovementResponse {
    if (movement.idempotencyPayloadHash !== payloadHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message:
          'Idempotency-Key was already used for a different inventory adjustment payload',
      });
    }

    return this.toMovementResponse(movement);
  }

  private async withSerializableRetry(
    operation: () => Promise<MovementResponse>,
    idempotencyKey: string,
    payloadHash: string,
  ): Promise<MovementResponse> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isRetryableConflict(error) || attempt === 3) {
          if (this.isRetryableConflict(error)) {
            const replay = (await this.prisma.inventoryMovement.findUnique({
              where: { idempotencyKey },
              include: { product: true, location: true },
            })) as InventoryMovementRecord | null;
            if (replay)
              return this.resolveAdjustmentReplay(replay, payloadHash);

            throw new ConflictException({
              code: 'INVENTORY_CONCURRENCY_CONFLICT',
              message:
                'The inventory operation could not be completed after concurrent retries',
            });
          }
          throw error;
        }
      }
    }

    throw new ConflictException({
      code: 'INVENTORY_CONCURRENCY_CONFLICT',
      message:
        'The inventory operation could not be completed after concurrent retries',
    });
  }

  private isRetryableConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ((error as { code?: unknown }).code === 'P2002' ||
        (error as { code?: unknown }).code === 'P2034')
    );
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

  private assertLocationScope(
    location: {
      id: string;
      parentId?: string | null;
      type?: string;
    },
    actor?: InventoryScopeActor,
  ): void {
    if (!actor || actor.role === 'ADMIN') return;

    const locationId = actor.operationalLocationId;
    const allowed =
      actor.role === 'WAREHOUSE'
        ? location.id === locationId ||
          (location.type === 'BRANCH' && location.parentId === locationId)
        : location.id === locationId;

    if (!allowed) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
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

  private buildMovementWhere(
    query: ListInventoryMovementsQueryDto,
    actor?: InventoryScopeActor,
  ): Prisma.InventoryMovementWhereInput {
    const createdAt = this.buildCreatedAtFilter(query.dateFrom, query.dateTo);
    const scope = this.buildLocationScopeWhere(actor);

    return {
      ...(query.productId ? { productId: query.productId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.referenceType ? { referenceType: query.referenceType } : {}),
      ...(query.referenceId ? { referenceId: query.referenceId } : {}),
      OR: [
        { referenceType: null },
        { referenceType: { not: 'BRANCH_SUPPLY_RECEIPT' } },
        { type: { notIn: ['SHRINKAGE', 'IN'] } },
      ],
      ...(query.pointOfSaleDailyCloseId
        ? { pointOfSaleDailyCloseId: query.pointOfSaleDailyCloseId }
        : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(scope ? { location: scope } : {}),
    };
  }

  private buildBalanceWhere(
    query: ListInventoryBalancesQueryDto,
    actor?: InventoryScopeActor,
  ): Prisma.InventoryBalanceWhereInput {
    const search = query.search?.trim();
    const scope = this.buildLocationScopeWhere(actor);

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
      location: { isActive: true, ...(scope ?? {}) },
    };
  }

  private buildLocationScopeWhere(
    actor?: InventoryScopeActor,
  ): Prisma.OperationalLocationWhereInput | undefined {
    if (!actor || actor.role === 'ADMIN') return undefined;

    const locationId = actor.operationalLocationId ?? '__without_location__';
    if (actor.role === 'WAREHOUSE') {
      return {
        OR: [
          { id: locationId },
          { parentId: locationId, type: 'BRANCH', isActive: true },
        ],
      };
    }

    return { id: locationId };
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
    const availability = toInventoryBalanceAvailability(balance);
    const minQuantityKg = this.toNumber(balance.minQuantityKg);
    const minQuantityPieces = balance.minQuantityPieces ?? 0;

    return {
      productId: balance.productId,
      productName: balance.product?.name,
      sku: balance.product?.sku,
      unit: balance.product?.unit,
      locationId: balance.locationId,
      locationName: balance.location?.name,
      ...availability,
      minQuantityKg,
      minQuantityPieces,
      isLowStock:
        availability.availableQuantityKg < minQuantityKg ||
        availability.availableQuantityPieces < minQuantityPieces,
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
