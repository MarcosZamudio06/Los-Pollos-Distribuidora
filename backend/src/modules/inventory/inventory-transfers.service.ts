import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryMovementType,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import {
  CancelInventoryTransferDto,
  CreateInventoryTransferDto,
  ListInventoryTransfersQueryDto,
} from './dto';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

type LocationRecord = {
  id: string;
  name: string;
  isActive: boolean;
};

type ProductRecord = {
  id: string;
  name: string;
  unit: ProductUnit;
  isActive: boolean;
};

type TransferItemRecord = {
  id: string;
  transferId: string;
  productId: string;
  quantityKg?: DecimalLike;
  quantityPieces?: number | null;
  unit: ProductUnit;
  createdAt: Date;
  updatedAt: Date;
  product?: ProductRecord | null;
};

type MovementRecord = {
  id: string;
  productId: string;
  locationId: string;
  userId: string;
  type: InventoryMovementType;
  quantityKg?: DecimalLike;
  quantityPieces?: number | null;
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

type TransferRecord = {
  id: string;
  transferNumber: string;
  originLocationId: string;
  destinationLocationId: string;
  userId: string;
  status: InventoryTransferStatus;
  notes?: string | null;
  requestedAt?: Date | null;
  confirmedAt?: Date | null;
  cancelledAt?: Date | null;
  cancelledByUserId?: string | null;
  cancellationReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  originLocation?: { id: string; name: string } | null;
  destinationLocation?: { id: string; name: string } | null;
  items?: TransferItemRecord[];
  inventoryMovements?: MovementRecord[];
};

type NormalizedQuantities = {
  quantityKg: number;
  quantityPieces: number;
};

type AppliedBalanceChange = {
  previousQuantityKg: number;
  previousQuantityPieces: number;
  newQuantityKg: number;
  newQuantityPieces: number;
};

type TransferItemResponse = {
  productId: string;
  productName?: string;
  unit: ProductUnit;
  quantityKg: number;
  quantityPieces: number;
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

type TransferResponse = {
  id: string;
  transferNumber: string;
  originLocationId: string;
  destinationLocationId: string;
  status: InventoryTransferStatus;
  userId: string;
  notes: string | null;
  requestedAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelledByUserId: string | null;
  cancellationReason: string | null;
  itemsCount: number;
  createdAt: Date;
  updatedAt: Date;
  items: TransferItemResponse[];
  movements: MovementResponse[];
};

type TransferListResponse = { items: TransferResponse[] };

const TRANSFER_INCLUDE = {
  originLocation: true,
  destinationLocation: true,
  items: { include: { product: true } },
  inventoryMovements: {
    include: { product: true, location: true },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

@Injectable()
export class InventoryTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: ListInventoryTransfersQueryDto,
  ): Promise<TransferListResponse> {
    const transfers = (await this.prisma.inventoryTransfer.findMany({
      where: this.buildTransferWhere(query),
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      ...this.buildPagination(query),
    })) as TransferRecord[];

    return {
      items: transfers.map((transfer) => this.toTransferResponse(transfer)),
    };
  }

  async findOne(id: string): Promise<TransferResponse> {
    return this.toTransferResponse(await this.findTransferOrThrow(id));
  }

  async create(
    dto: CreateInventoryTransferDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<TransferResponse> {
    this.assertValidTransferShape(
      dto.originLocationId,
      dto.destinationLocationId,
      dto.items,
    );

    return this.prisma.$transaction(
      async (tx) => {
        const idempotentTransferNumber =
          this.resolveIdempotentTransferNumber(idempotencyKey);
        if (idempotentTransferNumber) {
          const existing = (await tx.inventoryTransfer.findUnique({
            where: { transferNumber: idempotentTransferNumber },
            include: TRANSFER_INCLUDE,
          })) as TransferRecord | null;

          if (existing) {
            this.assertSameCreatePayload(existing, dto, userId);
            return this.toTransferResponse(existing);
          }
        }

        await this.assertLocationAvailable(tx, dto.originLocationId, 'origin');
        await this.assertLocationAvailable(
          tx,
          dto.destinationLocationId,
          'destination',
        );

        const items: Array<{
          productId: string;
          unit: ProductUnit;
          quantityKg: number;
          quantityPieces: number;
        }> = [];
        for (const item of dto.items) {
          const product = await this.findProductOrThrow(tx, item.productId);
          const quantities = this.normalizeItemQuantities(
            item.unit,
            product.unit,
            item.quantityKg,
            item.quantityPieces,
          );

          items.push({
            productId: item.productId,
            unit: item.unit,
            quantityKg: quantities.quantityKg,
            quantityPieces: quantities.quantityPieces,
          });
        }

        const transfer = (await tx.inventoryTransfer.create({
          data: {
            transferNumber:
              idempotentTransferNumber ?? this.generateTransferNumber(),
            originLocationId: dto.originLocationId,
            destinationLocationId: dto.destinationLocationId,
            userId,
            status: InventoryTransferStatus.REQUESTED,
            notes: this.normalizeOptionalText(dto.notes),
            requestedAt: new Date(),
            items: { create: items },
          },
          include: TRANSFER_INCLUDE,
        })) as TransferRecord;

        return this.toTransferResponse(transfer);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async confirm(
    id: string,
    userId: string,
    idempotencyKey?: string,
  ): Promise<TransferResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const transfer = await this.findTransferOrThrow(id, tx);
        if (transfer.status === InventoryTransferStatus.CONFIRMED) {
          if (idempotencyKey) {
            this.assertSameCompletedCommand(
              'CONFIRM',
              transfer,
              this.buildCommandMarker('CONFIRM', idempotencyKey, {
                transferId: id,
                userId,
              }),
            );
            return this.toTransferResponse(transfer);
          }
        }
        this.assertCanConfirm(transfer);

        for (const item of transfer.items ?? []) {
          const quantities = this.normalizeExistingItemQuantities(item);
          const reason = this.withCommandMarker(
            `Inventory transfer ${transfer.transferNumber} confirmed`,
            idempotencyKey
              ? this.buildCommandMarker('CONFIRM', idempotencyKey, {
                  transferId: id,
                  userId,
                })
              : null,
          );

          const originChange = await this.applyBalanceChange(
            tx,
            item.productId,
            transfer.originLocationId,
            -1,
            quantities,
          );
          await this.createMovement(
            tx,
            transfer,
            item,
            userId,
            InventoryMovementType.TRANSFER_OUT,
            transfer.originLocationId,
            quantities,
            originChange,
            reason,
          );

          const destinationChange = await this.applyBalanceChange(
            tx,
            item.productId,
            transfer.destinationLocationId,
            1,
            quantities,
          );
          await this.createMovement(
            tx,
            transfer,
            item,
            userId,
            InventoryMovementType.TRANSFER_IN,
            transfer.destinationLocationId,
            quantities,
            destinationChange,
            reason,
          );
        }

        const confirmed = (await tx.inventoryTransfer.update({
          where: { id },
          data: {
            status: InventoryTransferStatus.CONFIRMED,
            confirmedAt: new Date(),
          },
          include: TRANSFER_INCLUDE,
        })) as TransferRecord;

        return this.toTransferResponse(confirmed);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async cancel(
    id: string,
    dto: CancelInventoryTransferDto,
    userId: string,
    idempotencyKey?: string,
  ): Promise<TransferResponse> {
    const reason = this.normalizeRequiredReason(dto.reason);

    return this.prisma.$transaction(
      async (tx) => {
        const transfer = await this.findTransferOrThrow(id, tx);
        if (transfer.status === InventoryTransferStatus.CANCELLED) {
          if (idempotencyKey) {
            this.assertSameCompletedCommand(
              'CANCEL',
              transfer,
              this.buildCommandMarker('CANCEL', idempotencyKey, {
                transferId: id,
                userId,
                reason,
              }),
            );
            return this.toTransferResponse(transfer);
          }

          throw new BadRequestException(
            'Cancelled inventory transfers cannot be cancelled again without a matching Idempotency-Key',
          );
        }
        this.assertCanCancel(transfer);

        const cancelled = (await tx.inventoryTransfer.update({
          where: { id },
          data: {
            status: InventoryTransferStatus.CANCELLED,
            cancelledByUserId: userId,
            cancellationReason: this.withCommandMarker(
              reason,
              idempotencyKey
                ? this.buildCommandMarker('CANCEL', idempotencyKey, {
                    transferId: id,
                    userId,
                    reason,
                  })
                : null,
            ),
            cancelledAt: new Date(),
          },
          include: TRANSFER_INCLUDE,
        })) as TransferRecord;

        return this.toTransferResponse(cancelled);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }


  private buildCommandMarker(
    action: 'CONFIRM' | 'CANCEL',
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ): string {
    const digest = createHash('sha256')
      .update(JSON.stringify({ action, idempotencyKey, payload }))
      .digest('hex')
      .slice(0, 24)
      .toUpperCase();

    return `[idempotency:${action}:${digest}]`;
  }

  private withCommandMarker(value: string, marker: string | null): string {
    return marker ? `${value} ${marker}` : value;
  }

  private assertSameCompletedCommand(
    action: 'CONFIRM' | 'CANCEL',
    transfer: TransferRecord,
    expectedMarker: string,
  ): void {
    const commandText =
      action === 'CONFIRM'
        ? (transfer.inventoryMovements ?? [])
            .map((movement) => movement.reason ?? '')
            .find((reason) => reason.includes('[idempotency:CONFIRM:'))
        : transfer.cancellationReason;

    if (!commandText?.includes(expectedMarker)) {
      throw new ConflictException(
        `Idempotency-Key does not match the completed inventory transfer ${action.toLowerCase()} command`,
      );
    }
  }

  private stripCommandMarker(value?: string | null): string | null {
    const stripped = value
      ?.replace(/\s*\[idempotency:(CONFIRM|CANCEL):[A-F0-9]{24}\]$/, '')
      .trim();

    return stripped ? stripped : null;
  }

  private resolveIdempotentTransferNumber(
    idempotencyKey?: string,
  ): string | null {
    const normalized = idempotencyKey?.trim();

    if (!normalized) {
      return null;
    }

    const digest = createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 24)
      .toUpperCase();

    return `TRF-IDEMP-${digest}`;
  }

  private assertSameCreatePayload(
    transfer: TransferRecord,
    dto: CreateInventoryTransferDto,
    userId: string,
  ): void {
    const requestedItems = this.normalizeComparableItems(dto.items ?? []);
    const existingItems = this.normalizeComparableItems(
      (transfer.items ?? []).map((item) => ({
        productId: item.productId,
        unit: item.unit,
        quantityKg: this.toNumber(item.quantityKg),
        quantityPieces: item.quantityPieces ?? 0,
      })),
    );

    if (
      transfer.originLocationId !== dto.originLocationId ||
      transfer.destinationLocationId !== dto.destinationLocationId ||
      transfer.userId !== userId ||
      (transfer.notes ?? null) !== this.normalizeOptionalText(dto.notes) ||
      JSON.stringify(existingItems) !== JSON.stringify(requestedItems)
    ) {
      throw new ConflictException(
        'Idempotency-Key was already used for a different inventory transfer payload',
      );
    }
  }

  private normalizeComparableItems(
    items: Array<{
      productId: string;
      unit: ProductUnit;
      quantityKg?: number;
      quantityPieces?: number;
    }>,
  ): string[] {
    return items
      .map((item) =>
        [
          item.productId,
          item.unit,
          item.quantityKg ?? 0,
          item.quantityPieces ?? 0,
        ].join('|'),
      )
      .sort();
  }

  private async findTransferOrThrow(
    id: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<TransferRecord> {
    const transfer = (await tx.inventoryTransfer.findUnique({
      where: { id },
      include: TRANSFER_INCLUDE,
    })) as TransferRecord | null;

    if (!transfer) {
      throw new NotFoundException('Inventory transfer not found');
    }

    return transfer;
  }

  private assertValidTransferShape(
    originLocationId: string,
    destinationLocationId: string,
    items?: unknown[],
  ): void {
    if (originLocationId === destinationLocationId) {
      throw new BadRequestException(
        'originLocationId and destinationLocationId cannot be equal',
      );
    }

    if (!items?.length) {
      throw new BadRequestException(
        'Inventory transfer requires at least one item',
      );
    }
  }

  private async assertLocationAvailable(
    tx: Prisma.TransactionClient,
    id: string,
    role: 'origin' | 'destination',
  ): Promise<void> {
    const location = (await tx.operationalLocation.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    })) as LocationRecord | null;

    if (!location) {
      throw new NotFoundException(`${role} location not found`);
    }

    if (!location.isActive) {
      throw new BadRequestException(
        `Inventory transfers require an active ${role} location`,
      );
    }
  }

  private async findProductOrThrow(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<ProductRecord> {
    const product = (await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, unit: true, isActive: true },
    })) as ProductRecord | null;

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('Inactive products cannot be transferred');
    }

    return product;
  }

  private normalizeItemQuantities(
    requestedUnit: ProductUnit,
    productUnit: ProductUnit,
    quantityKg?: number,
    quantityPieces?: number,
  ): NormalizedQuantities {
    const quantities = {
      quantityKg: quantityKg ?? 0,
      quantityPieces: quantityPieces ?? 0,
    };

    if (quantities.quantityKg < 0 || quantities.quantityPieces < 0) {
      throw new BadRequestException('Transfer quantities must be non-negative');
    }

    if (productUnit === ProductUnit.KG) {
      if (
        requestedUnit !== ProductUnit.KG ||
        quantities.quantityKg <= 0 ||
        quantities.quantityPieces !== 0
      ) {
        throw new BadRequestException(
          'KG products require a positive quantityKg only',
        );
      }
      return quantities;
    }

    if (productUnit === ProductUnit.PIECE) {
      if (
        requestedUnit !== ProductUnit.PIECE ||
        quantities.quantityPieces <= 0 ||
        quantities.quantityKg !== 0
      ) {
        throw new BadRequestException(
          'PIECE products require a positive quantityPieces only',
        );
      }
      return quantities;
    }

    if (
      requestedUnit === ProductUnit.KG &&
      (quantities.quantityKg <= 0 || quantities.quantityPieces !== 0)
    ) {
      throw new BadRequestException(
        'KG transfers require a positive quantityKg only',
      );
    }

    if (
      requestedUnit === ProductUnit.PIECE &&
      (quantities.quantityPieces <= 0 || quantities.quantityKg !== 0)
    ) {
      throw new BadRequestException(
        'PIECE transfers require a positive quantityPieces only',
      );
    }

    if (
      requestedUnit === ProductUnit.KG_AND_PIECE &&
      quantities.quantityKg <= 0 &&
      quantities.quantityPieces <= 0
    ) {
      throw new BadRequestException(
        'KG_AND_PIECE transfers require quantityKg, quantityPieces, or both',
      );
    }

    return quantities;
  }

  private normalizeExistingItemQuantities(
    item: TransferItemRecord,
  ): NormalizedQuantities {
    const quantities = {
      quantityKg: this.toNumber(item.quantityKg),
      quantityPieces: item.quantityPieces ?? 0,
    };

    if (quantities.quantityKg <= 0 && quantities.quantityPieces <= 0) {
      throw new BadRequestException(
        'Transfer item must include a positive quantity',
      );
    }

    return quantities;
  }

  private assertCanConfirm(transfer: TransferRecord): void {
    if (!transfer.items?.length) {
      throw new BadRequestException(
        'Inventory transfer requires at least one item',
      );
    }

    if (transfer.status === InventoryTransferStatus.CANCELLED) {
      throw new BadRequestException('Cancelled transfers cannot be confirmed');
    }

    if (transfer.status === InventoryTransferStatus.CONFIRMED) {
      throw new BadRequestException(
        'Confirmed transfers cannot be confirmed again',
      );
    }
  }

  private assertCanCancel(transfer: TransferRecord): void {
    if (transfer.status === InventoryTransferStatus.CONFIRMED) {
      throw new BadRequestException('Confirmed transfers cannot be cancelled');
    }
  }

  private async applyBalanceChange(
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
          'Origin location does not have sufficient stock for this transfer',
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

    const balance = await tx.inventoryBalance.findUnique({
      where: {
        productId_locationId: {
          productId,
          locationId,
        },
      },
    });

    if (!balance) {
      throw new BadRequestException('Inventory balance could not be updated');
    }

    const newQuantityKg = this.toNumber(balance.quantityKg);
    const newQuantityPieces = balance.quantityPieces;

    return {
      previousQuantityKg: newQuantityKg - direction * quantities.quantityKg,
      previousQuantityPieces:
        newQuantityPieces - direction * quantities.quantityPieces,
      newQuantityKg,
      newQuantityPieces,
    };
  }

  private async createMovement(
    tx: Prisma.TransactionClient,
    transfer: TransferRecord,
    item: TransferItemRecord,
    userId: string,
    type: InventoryMovementType,
    locationId: string,
    quantities: NormalizedQuantities,
    balanceChange: AppliedBalanceChange,
    reason: string,
  ): Promise<void> {
    await tx.inventoryMovement.create({
      data: {
        productId: item.productId,
        locationId,
        userId,
        type,
        quantity:
          quantities.quantityKg > 0
            ? quantities.quantityKg
            : quantities.quantityPieces,
        quantityKg: quantities.quantityKg,
        quantityPieces: quantities.quantityPieces,
        previousStock: balanceChange.previousQuantityKg,
        newStock: balanceChange.newQuantityKg,
        previousQuantityKg: balanceChange.previousQuantityKg,
        newQuantityKg: balanceChange.newQuantityKg,
        previousQuantityPieces: balanceChange.previousQuantityPieces,
        newQuantityPieces: balanceChange.newQuantityPieces,
        reason,
        referenceType: 'INVENTORY_TRANSFER',
        referenceId: transfer.id,
        transferId: transfer.id,
      },
      include: { product: true, location: true },
    });
  }

  private buildTransferWhere(
    query: ListInventoryTransfersQueryDto,
  ): Prisma.InventoryTransferWhereInput {
    const createdAt = this.buildCreatedAtFilter(query.dateFrom, query.dateTo);

    return {
      ...(query.originLocationId
        ? { originLocationId: query.originLocationId }
        : {}),
      ...(query.destinationLocationId
        ? { destinationLocationId: query.destinationLocationId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(createdAt ? { createdAt } : {}),
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

  private buildPagination(query: ListInventoryTransfersQueryDto): {
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

  private toTransferResponse(transfer: TransferRecord): TransferResponse {
    const items = (transfer.items ?? []).map((item) => ({
      productId: item.productId,
      productName: item.product?.name,
      unit: item.unit,
      quantityKg: this.toNumber(item.quantityKg),
      quantityPieces: item.quantityPieces ?? 0,
    }));

    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      originLocationId: transfer.originLocationId,
      destinationLocationId: transfer.destinationLocationId,
      status: transfer.status,
      userId: transfer.userId,
      notes: transfer.notes ?? null,
      requestedAt: transfer.requestedAt ?? null,
      confirmedAt: transfer.confirmedAt ?? null,
      cancelledAt: transfer.cancelledAt ?? null,
      cancelledByUserId: transfer.cancelledByUserId ?? null,
      cancellationReason: this.stripCommandMarker(transfer.cancellationReason),
      itemsCount: items.length,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      items,
      movements: (transfer.inventoryMovements ?? []).map((movement) =>
        this.toMovementResponse(movement),
      ),
    };
  }

  private toMovementResponse(movement: MovementRecord): MovementResponse {
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
      reason: this.stripCommandMarker(movement.reason),
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
      return ProductUnit.KG_AND_PIECE;
    }

    if (quantityPieces > 0) {
      return ProductUnit.PIECE;
    }

    return ProductUnit.KG;
  }

  private normalizeRequiredReason(reason?: string): string {
    const normalized = reason?.trim();

    if (!normalized) {
      throw new BadRequestException('Cancellation reason is required');
    }

    return normalized;
  }

  private normalizeOptionalText(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private generateTransferNumber(): string {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `TRF-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private toNumber(value: DecimalLike): number {
    if (value === null || value === undefined) {
      return 0;
    }

    return Number(value);
  }
}
