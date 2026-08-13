import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BranchSupplyCycleStatus,
  InventoryMovementType,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  CancelInventoryTransferDto,
  CreateInventoryTransferDto,
  ListInventoryTransfersQueryDto,
} from './dto';
import {
  InventoryBalanceService,
  toInventoryBalanceAvailability,
  type InventoryBalanceAvailability,
} from './inventory-balance.service';
import { buildCivilDateRangeFilter } from '../../common/utils/civil-date-range';

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

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
  unitEquivalentId?: string | null;
  appliedEquivalentFactor?: DecimalLike;
  roundingMode?: string | null;
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
  originLocation?: {
    id: string;
    name: string;
    type?: string;
    parentId?: string | null;
  } | null;
  destinationLocation?: {
    id: string;
    name: string;
    type?: string;
    parentId?: string | null;
  } | null;
  items?: TransferItemRecord[];
  inventoryMovements?: MovementRecord[];
  branchSupplyCycleTransfer?: {
    id: string;
    branchSupplyCycleId: string;
    role: 'SUPPLY' | 'RETURN';
    branchSupplyCycle?: {
      id: string;
      distributionCenterLocationId: string;
      branchLocationId: string;
      status: BranchSupplyCycleStatus;
      version: number;
      pointOfSaleDailyCloseId: string | null;
      pointOfSaleDailyClose?: { id: string; status: string } | null;
    } | null;
  } | null;
};

type NormalizedQuantities = {
  quantityKg: number;
  quantityPieces: number;
};

type NormalizedTransferItem = NormalizedQuantities & {
  productId: string;
  productUnit: ProductUnit;
  unit: ProductUnit;
  unitEquivalentId?: string;
  appliedEquivalentFactor?: Prisma.Decimal;
  roundingMode?: string | null;
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
  unitEquivalentId: string | null;
  appliedEquivalentFactor: number | null;
  roundingMode: string | null;
  balance?: (InventoryBalanceAvailability & { locationId: string }) | null;
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

export type TransferResponse = {
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
  items: { include: { product: true, unitEquivalent: true } },
  inventoryMovements: {
    include: { product: true, location: true },
    orderBy: { createdAt: 'asc' as const },
  },
  branchSupplyCycleTransfer: {
    include: {
      branchSupplyCycle: { include: { pointOfSaleDailyClose: true } },
    },
  },
} as const;

export type InventoryTransferCreateOptions = {
  tx?: Prisma.TransactionClient;
  equivalenceDate?: Date;
  actor?: InventoryTransferActor;
  cedisCycleTransfer?: boolean;
};

type InventoryTransferActor = Pick<
  AuthenticatedUser,
  'id' | 'role' | 'operationalLocationId' | 'permissions'
>;

export type InventoryTransferCommandOptions = {
  tx?: Prisma.TransactionClient;
  actor?: InventoryTransferActor;
};

export type SupplyReceiptItemInput = {
  transferItemId: string;
  quantityKg?: number;
  quantityPieces?: number;
};

export type SupplyReceiptCommandOptions = {
  tx?: Prisma.TransactionClient;
  receiptId: string;
  actor: Pick<
    AuthenticatedUser,
    'id' | 'role' | 'operationalLocationId' | 'permissions'
  >;
};

@Injectable()
export class InventoryTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceService: InventoryBalanceService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async findAll(
    query: ListInventoryTransfersQueryDto,
    actor?: InventoryTransferActor,
  ): Promise<TransferListResponse> {
    const transfers = (await this.prisma.inventoryTransfer.findMany({
      where: this.buildTransferWhere(query, actor),
      include: TRANSFER_INCLUDE,
      orderBy: { createdAt: 'desc' },
      ...this.buildPagination(query),
    })) as TransferRecord[];

    return {
      items: transfers.map((transfer) => this.toTransferResponse(transfer)),
    };
  }

  async findOne(
    id: string,
    actor?: InventoryTransferActor,
  ): Promise<TransferResponse> {
    const transfer = await this.findTransferOrThrow(id);
    this.assertTransferReadScope(transfer, actor);
    const balances = (await this.prisma.inventoryBalance.findMany({
      where: {
        locationId: transfer.originLocationId,
        productId: { in: (transfer.items ?? []).map((item) => item.productId) },
      },
      select: {
        productId: true,
        locationId: true,
        quantityKg: true,
        quantityPieces: true,
        reservedQuantityKg: true,
        reservedQuantityPieces: true,
      },
    })) as Array<{
      productId: string;
      locationId: string;
      quantityKg: DecimalLike;
      quantityPieces: number;
      reservedQuantityKg: DecimalLike;
      reservedQuantityPieces: number;
    }>;
    const balanceByProduct = new Map(
      (balances ?? []).map((balance) => [
        balance.productId,
        {
          locationId: balance.locationId,
          ...toInventoryBalanceAvailability(balance),
        },
      ]),
    );
    return this.toTransferResponse(transfer, balanceByProduct);
  }

  async create(
    dto: CreateInventoryTransferDto,
    userId: string,
    idempotencyKey?: string,
    options: InventoryTransferCreateOptions = {},
  ): Promise<TransferResponse> {
    this.assertValidTransferShape(
      dto.originLocationId,
      dto.destinationLocationId,
      dto.items,
    );

    if (options.tx) {
      return this.createInTransaction(
        options.tx,
        dto,
        userId,
        idempotencyKey,
        options.equivalenceDate,
        options.actor,
        options.cedisCycleTransfer ?? false,
      );
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        (tx) =>
          this.createInTransaction(
            tx,
            dto,
            userId,
            idempotencyKey,
            options.equivalenceDate,
            options.actor,
            options.cedisCycleTransfer ?? false,
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async confirm(
    id: string,
    userId: string,
    idempotencyKey?: string,
    options: InventoryTransferCommandOptions = {},
  ): Promise<TransferResponse> {
    if (options.tx) {
      return this.confirmInTransaction(
        options.tx,
        id,
        userId,
        idempotencyKey,
        options.actor,
      );
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        (tx) =>
          this.confirmInTransaction(
            tx,
            id,
            userId,
            idempotencyKey,
            options.actor,
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async receiveSupply(
    id: string,
    receivedItems: SupplyReceiptItemInput[],
    userId: string,
    idempotencyKey: string,
    options: SupplyReceiptCommandOptions,
  ): Promise<TransferResponse> {
    if (options.tx) {
      return this.receiveSupplyInTransaction(
        options.tx,
        id,
        receivedItems,
        userId,
        idempotencyKey,
        options,
      );
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        (tx) =>
          this.receiveSupplyInTransaction(
            tx,
            id,
            receivedItems,
            userId,
            idempotencyKey,
            options,
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async cancel(
    id: string,
    dto: CancelInventoryTransferDto,
    userId: string,
    idempotencyKey?: string,
    options: InventoryTransferCommandOptions = {},
  ): Promise<TransferResponse> {
    const reason = this.normalizeRequiredReason(dto.reason);

    if (options.tx) {
      return this.cancelInTransaction(
        options.tx,
        id,
        reason,
        userId,
        idempotencyKey,
        options.actor,
      );
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        (tx) =>
          this.cancelInTransaction(
            tx,
            id,
            reason,
            userId,
            idempotencyKey,
            options.actor,
          ),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async createInTransaction(
    tx: Prisma.TransactionClient,
    dto: CreateInventoryTransferDto,
    userId: string,
    idempotencyKey?: string,
    equivalenceDate?: Date,
    actor?: InventoryTransferActor,
    cedisCycleTransfer = false,
  ): Promise<TransferResponse> {
    await this.assertTransferCreationScope(tx, dto, actor, cedisCycleTransfer);
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

    const normalizedItems = await this.normalizeTransferItems(
      tx,
      dto.items,
      equivalenceDate,
    );
    const items = normalizedItems.map((item) => {
      const baseItem = {
        productId: item.productId,
        unit: item.unit,
        quantityKg: item.quantityKg,
        quantityPieces: item.quantityPieces,
      };
      return item.unitEquivalentId !== undefined
        ? {
            ...baseItem,
            unitEquivalentId: item.unitEquivalentId,
            appliedEquivalentFactor: item.appliedEquivalentFactor,
            roundingMode: item.roundingMode,
          }
        : baseItem;
    });

    await this.balanceService.reserve(
      tx,
      dto.originLocationId,
      normalizedItems,
    );

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
  }

  private async confirmInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
    idempotencyKey?: string,
    actor?: InventoryTransferCommandOptions['actor'],
  ): Promise<TransferResponse> {
    const transfer = await this.findTransferOrThrow(id, tx);

    this.assertActorCanChangeTransfer(transfer, actor);

    if (transfer.branchSupplyCycleTransfer?.role === 'SUPPLY') {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED');
    }

    if (transfer.branchSupplyCycleTransfer && !idempotencyKey?.trim()) {
      throw new BadRequestException(
        'Idempotency-Key is required for transfers linked to a branch supply cycle',
      );
    }
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

    this.assertLinkedCycleCanChange(transfer);
    this.assertLinkedTransferDirection(transfer);
    await this.assertLocationAvailable(tx, transfer.originLocationId, 'origin');
    await this.assertLocationAvailable(
      tx,
      transfer.destinationLocationId,
      'destination',
    );
    await this.assertTransferProductsActive(tx, transfer);
    this.assertCanConfirm(transfer);

    const transferItems = transfer.items ?? [];
    const pendingOriginChanges =
      transfer.status === InventoryTransferStatus.DRAFT
        ? null
        : await this.balanceService.consumeReservations(
            tx,
            transfer.originLocationId,
            transferItems.map((item) => ({
              key: item.id,
              productId: item.productId,
              ...this.normalizeExistingItemQuantities(item),
            })),
          );

    for (const item of transferItems) {
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

      const originChange =
        transfer.status === InventoryTransferStatus.DRAFT
          ? await this.balanceService.decreaseAvailable(
              tx,
              item.productId,
              transfer.originLocationId,
              quantities,
              'Inventory transfer cannot leave negative available stock',
            )
          : pendingOriginChanges?.get(item.id);
      if (!originChange) {
        throw new ConflictException({
          code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
          message:
            'The pending transfer reservation does not match the inventory balance',
          productId: item.productId,
          locationId: transfer.originLocationId,
        });
      }
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

      const destinationChange = await this.balanceService.increase(
        tx,
        item.productId,
        transfer.destinationLocationId,
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

    await this.recordLinkedCycleStateChange(
      tx,
      transfer,
      userId,
      'CONFIRM',
      idempotencyKey,
    );

    return this.toTransferResponse(confirmed);
  }

  private async receiveSupplyInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    receivedItems: SupplyReceiptItemInput[],
    userId: string,
    idempotencyKey: string,
    options: SupplyReceiptCommandOptions,
  ): Promise<TransferResponse> {
    const transfer = await this.findTransferOrThrow(id, tx);
    this.assertActorCanReceiveSupply(transfer, options.actor);
    if (!idempotencyKey.trim()) {
      throw new BadRequestException(
        'Idempotency-Key is required for supply receipts',
      );
    }
    if (transfer.branchSupplyCycleTransfer?.role !== 'SUPPLY') {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED');
    }

    this.assertLinkedCycleCanChange(transfer);
    this.assertLinkedTransferDirection(transfer);
    await this.assertLocationAvailable(tx, transfer.originLocationId, 'origin');
    await this.assertLocationAvailable(
      tx,
      transfer.destinationLocationId,
      'destination',
    );
    await this.assertTransferProductsActive(tx, transfer);
    this.assertCanConfirm(transfer);

    const quantitiesByItem = this.normalizeReceiptItems(
      transfer.items ?? [],
      receivedItems,
    );
    const commandMarker = this.buildCommandMarker('CONFIRM', idempotencyKey, {
      transferId: id,
      userId,
      receiptId: options.receiptId,
    });

    const transferItems = transfer.items ?? [];
    const pendingOriginChanges = await this.balanceService.consumeReservations(
      tx,
      transfer.originLocationId,
      transferItems.map((item) => ({
        key: item.id,
        productId: item.productId,
        ...this.normalizeExistingItemQuantities(item),
      })),
    );

    for (const item of transferItems) {
      const sent = this.normalizeExistingItemQuantities(item);
      const received = quantitiesByItem.get(item.id);
      if (!received) {
        throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
      }
      const reason = this.withCommandMarker(
        `Inventory supply ${transfer.transferNumber} received`,
        commandMarker,
      );

      const originChange = pendingOriginChanges.get(item.id);
      if (!originChange) {
        throw new ConflictException({
          code: 'INVENTORY_RESERVATION_INTEGRITY_ERROR',
          message:
            'The pending transfer reservation does not match the inventory balance',
          productId: item.productId,
          locationId: transfer.originLocationId,
        });
      }
      await this.createMovement(
        tx,
        transfer,
        item,
        userId,
        InventoryMovementType.TRANSFER_OUT,
        transfer.originLocationId,
        sent,
        originChange,
        reason,
      );

      const destinationChange = await this.balanceService.increase(
        tx,
        item.productId,
        transfer.destinationLocationId,
        received,
      );
      await this.createMovement(
        tx,
        transfer,
        item,
        userId,
        InventoryMovementType.TRANSFER_IN,
        transfer.destinationLocationId,
        received,
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

    await this.recordLinkedCycleStateChange(
      tx,
      transfer,
      userId,
      'CONFIRM',
      idempotencyKey,
      { receiptId: options.receiptId },
    );

    return this.toTransferResponse(confirmed);
  }

  private async cancelInTransaction(
    tx: Prisma.TransactionClient,
    id: string,
    reason: string,
    userId: string,
    idempotencyKey?: string,
    actor?: InventoryTransferCommandOptions['actor'],
  ): Promise<TransferResponse> {
    const transfer = await this.findTransferOrThrow(id, tx);
    this.assertActorCanChangeTransfer(transfer, actor);
    if (transfer.branchSupplyCycleTransfer && !idempotencyKey?.trim()) {
      throw new BadRequestException(
        'Idempotency-Key is required for transfers linked to a branch supply cycle',
      );
    }
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

    const commandMarker = idempotencyKey
      ? this.buildCommandMarker('CANCEL', idempotencyKey, {
          transferId: id,
          userId,
          reason,
        })
      : null;

    this.assertLinkedCycleCanChange(transfer);
    this.assertLinkedTransferDirection(transfer);
    this.assertCanCancel(transfer);

    if (
      transfer.status === InventoryTransferStatus.REQUESTED ||
      transfer.status === InventoryTransferStatus.IN_TRANSIT
    ) {
      await this.balanceService.releaseReservations(
        tx,
        transfer.originLocationId,
        (transfer.items ?? []).map((item) => ({
          productId: item.productId,
          ...this.normalizeExistingItemQuantities(item),
        })),
      );
    }

    const cancelled = (await tx.inventoryTransfer.update({
      where: { id },
      data: {
        status: InventoryTransferStatus.CANCELLED,
        cancelledByUserId: userId,
        cancellationReason: this.withCommandMarker(reason, commandMarker),
        cancelledAt: new Date(),
      },
      include: TRANSFER_INCLUDE,
    })) as TransferRecord;

    await this.recordLinkedCycleStateChange(
      tx,
      transfer,
      userId,
      'CANCEL',
      idempotencyKey,
      {
        cancellationReason: reason,
        idempotencyMarker: commandMarker,
      },
    );

    return this.toTransferResponse(cancelled);
  }

  private async normalizeTransferItems(
    tx: Prisma.TransactionClient,
    inputItems: CreateInventoryTransferDto['items'],
    equivalenceDate = new Date(),
  ): Promise<NormalizedTransferItem[]> {
    const normalized: NormalizedTransferItem[] = [];
    for (const item of inputItems) {
      const product = await this.findProductOrThrow(tx, item.productId);
      const quantities = this.normalizeItemQuantities(
        item.unit,
        product.unit,
        item.quantityKg,
        item.quantityPieces,
      );
      const equivalence = await this.resolveItemEquivalence(
        tx,
        item.productId,
        product.unit,
        item.unitEquivalentId,
        equivalenceDate,
      );

      normalized.push({
        productId: item.productId,
        productUnit: product.unit,
        unit: item.unit,
        ...quantities,
        ...(equivalence ?? {}),
      });
    }

    return this.aggregateTransferItems(normalized);
  }

  private aggregateTransferItems(
    items: NormalizedTransferItem[],
  ): NormalizedTransferItem[] {
    const grouped = new Map<string, NormalizedTransferItem>();
    for (const item of items) {
      const current = grouped.get(item.productId);
      if (!current) {
        grouped.set(item.productId, { ...item });
        continue;
      }

      if (
        (current.unitEquivalentId ?? null) !== (item.unitEquivalentId ?? null)
      ) {
        throw new BadRequestException('UNIT_MISMATCH');
      }

      current.quantityKg = this.addQuantity(
        current.quantityKg,
        item.quantityKg,
      );
      current.quantityPieces += item.quantityPieces;
      current.unit = this.mergeUnits(current.unit, item.unit);
    }

    return [...grouped.values()];
  }

  private mergeUnits(left: ProductUnit, right: ProductUnit): ProductUnit {
    if (left === right) return left;
    return ProductUnit.KG_AND_PIECE;
  }

  private addQuantity(left: number, right: number): number {
    return new Prisma.Decimal(left).add(right).toNumber();
  }

  private async resolveItemEquivalence(
    tx: Prisma.TransactionClient,
    productId: string,
    productUnit: ProductUnit,
    unitEquivalentId: string | undefined,
    equivalenceDate = new Date(),
  ): Promise<
    | {
        unitEquivalentId: string;
        appliedEquivalentFactor: Prisma.Decimal;
        roundingMode: string | null;
      }
    | undefined
  > {
    if (!unitEquivalentId) return undefined;

    if (productUnit !== ProductUnit.KG_AND_PIECE) {
      throw new BadRequestException('EQUIVALENCE_NOT_APPLICABLE');
    }

    const equivalent = await tx.productUnitEquivalent.findUnique({
      where: { id: unitEquivalentId },
      select: {
        id: true,
        productId: true,
        unitFrom: true,
        unitTo: true,
        factor: true,
        roundingMode: true,
        effectiveFrom: true,
        effectiveTo: true,
        status: true,
      },
    });

    if (
      !equivalent ||
      equivalent.productId !== productId ||
      equivalent.status !== 'ACTIVE' ||
      ![
        [ProductUnit.KG, ProductUnit.PIECE],
        [ProductUnit.PIECE, ProductUnit.KG],
      ].some(
        ([from, to]) =>
          equivalent.unitFrom === from && equivalent.unitTo === to,
      ) ||
      (equivalent.effectiveFrom &&
        equivalent.effectiveFrom > equivalenceDate) ||
      (equivalent.effectiveTo && equivalent.effectiveTo < equivalenceDate)
    ) {
      throw new BadRequestException('EQUIVALENCE_NOT_APPLICABLE');
    }

    return {
      unitEquivalentId: equivalent.id,
      appliedEquivalentFactor: new Prisma.Decimal(equivalent.factor),
      roundingMode: equivalent.roundingMode,
    };
  }

  private async assertTransferProductsActive(
    tx: Prisma.TransactionClient,
    transfer: TransferRecord,
  ): Promise<void> {
    for (const item of transfer.items ?? []) {
      if (item.product?.isActive === false) {
        throw new BadRequestException('PRODUCT_INACTIVE');
      }
      await this.findProductOrThrow(tx, item.productId);
    }
  }

  private assertLinkedCycleCanChange(transfer: TransferRecord): void {
    const cycle = transfer.branchSupplyCycleTransfer?.branchSupplyCycle;
    if (
      cycle &&
      (cycle.status === BranchSupplyCycleStatus.CLOSED ||
        cycle.status === BranchSupplyCycleStatus.CANCELLED)
    ) {
      throw new BadRequestException(
        'Transfers linked to closed or cancelled cycles cannot change',
      );
    }
  }

  private assertLinkedTransferDirection(transfer: TransferRecord): void {
    const link = transfer.branchSupplyCycleTransfer;
    const cycle = link?.branchSupplyCycle;
    if (!link || !cycle) return;

    const expectedOrigin =
      link.role === 'SUPPLY'
        ? cycle.distributionCenterLocationId
        : cycle.branchLocationId;
    const expectedDestination =
      link.role === 'SUPPLY'
        ? cycle.branchLocationId
        : cycle.distributionCenterLocationId;
    if (
      transfer.originLocationId !== expectedOrigin ||
      transfer.destinationLocationId !== expectedDestination
    ) {
      throw new ConflictException({
        code: 'BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID',
        message: 'The linked transfer direction does not match its cycle role',
      });
    }
  }

  private async assertTransferCreationScope(
    tx: Prisma.TransactionClient,
    dto: CreateInventoryTransferDto,
    actor: InventoryTransferActor | undefined,
    cedisCycleTransfer: boolean,
  ): Promise<void> {
    const [origin, destination] = await Promise.all([
      tx.operationalLocation.findUnique({
        where: { id: dto.originLocationId },
        select: { id: true, type: true, parentId: true, isActive: true },
      }),
      tx.operationalLocation.findUnique({
        where: { id: dto.destinationLocationId },
        select: { id: true, type: true, parentId: true, isActive: true },
      }),
    ]);

    if (!origin || !destination) {
      throw new NotFoundException('Transfer location not found');
    }
    if (!origin.isActive || !destination.isActive) {
      throw new BadRequestException(
        'Inventory transfers require active locations',
      );
    }

    const isSupply =
      origin.type === 'DISTRIBUTION_CENTER' &&
      destination.type === 'BRANCH' &&
      destination.parentId === origin.id;
    const isReturn =
      origin.type === 'BRANCH' &&
      destination.type === 'DISTRIBUTION_CENTER' &&
      origin.parentId === destination.id;

    if (destination.type === 'BRANCH' && !isSupply) {
      throw new BadRequestException({
        code: 'BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID',
        message:
          'Branch inventory must originate from its parent distribution center',
      });
    }
    if ((isSupply || isReturn) && !cedisCycleTransfer) {
      throw new BadRequestException({
        code: 'BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID',
        message:
          'Branch inventory transfers must be created through a CEDIS supply cycle',
      });
    }
    if (cedisCycleTransfer && !isSupply && !isReturn) {
      throw new BadRequestException({
        code: 'BRANCH_SUPPLY_CYCLE_DIRECTION_INVALID',
        message:
          'CEDIS supply cycle transfers require a direct CEDIS and branch pair',
      });
    }

    if (cedisCycleTransfer) {
      const requiredPermission = isSupply
        ? PERMISSIONS.CEDIS_DISPATCH
        : PERMISSIONS.CEDIS_REQUEST_RETURNS;
      if (!actor?.permissions?.includes(requiredPermission)) {
        throw new ForbiddenException('Insufficient permissions');
      }
    }

    if (actor?.role === 'WAREHOUSE') {
      const inScope = isReturn
        ? actor.operationalLocationId === origin.id ||
          actor.operationalLocationId === destination.id
        : actor.operationalLocationId === origin.id;
      if (!inScope) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }
    if (
      actor?.role === 'SELLER' &&
      (!isReturn || actor.operationalLocationId !== origin.id)
    ) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }
  }

  private assertActorCanReceiveSupply(
    transfer: TransferRecord,
    actor?: SupplyReceiptCommandOptions['actor'],
  ): void {
    const link = transfer.branchSupplyCycleTransfer;

    if (!link || link.role !== 'SUPPLY') {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_NOT_ALLOWED');
    }

    const cycle = link.branchSupplyCycle;

    if (!cycle) {
      throw new NotFoundException('Linked branch supply cycle not found');
    }

    // Permite llamadas internas sin actor, siguiendo el patrón actual
    // de InventoryTransfersService.
    if (!actor) {
      return;
    }

    if (!actor.permissions?.includes(PERMISSIONS.CEDIS_RECEIVE_SUPPLIES)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    if (actor.role === 'ADMIN') {
      return;
    }

    const isAuthorizedWarehouse =
      actor.role === 'WAREHOUSE' &&
      actor.operationalLocationId === cycle.distributionCenterLocationId;

    const isAuthorizedSeller =
      actor.role === 'SELLER' &&
      actor.operationalLocationId === cycle.branchLocationId;

    if (!isAuthorizedWarehouse && !isAuthorizedSeller) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }
  }

  private assertActorCanChangeLinkedTransfer(
    transfer: TransferRecord,
    actor?: InventoryTransferCommandOptions['actor'],
  ): void {
    const link = transfer.branchSupplyCycleTransfer;
    if (!link || !actor) return;

    const cycle = link.branchSupplyCycle;
    if (!cycle) {
      throw new NotFoundException('Linked branch supply cycle not found');
    }

    if (actor.role === 'ADMIN') return;
    if (
      actor.role !== 'WAREHOUSE' ||
      actor.operationalLocationId !== cycle.distributionCenterLocationId
    ) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }

    const permission =
      link.role === 'SUPPLY'
        ? PERMISSIONS.CEDIS_DISPATCH
        : PERMISSIONS.CEDIS_RECEIVE_RETURNS;
    if (!actor.permissions?.includes(permission)) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertActorCanChangeTransfer(
    transfer: TransferRecord,
    actor?: InventoryTransferCommandOptions['actor'],
  ): void {
    if (transfer.branchSupplyCycleTransfer) {
      this.assertActorCanChangeLinkedTransfer(transfer, actor);
      return;
    }
    if (!actor || actor.role === 'ADMIN') return;
    if (
      actor.role !== 'WAREHOUSE' ||
      actor.operationalLocationId !== transfer.originLocationId
    ) {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }
    if (transfer.destinationLocation?.type === 'BRANCH') {
      throw new BadRequestException(
        'Branch inventory transfers must belong to a CEDIS supply cycle',
      );
    }
  }

  private assertTransferReadScope(
    transfer: TransferRecord,
    actor?: InventoryTransferActor,
  ): void {
    if (!actor || actor.role === 'ADMIN') return;
    if (actor.role !== 'WAREHOUSE') {
      throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
    }

    const cycleCedisId =
      transfer.branchSupplyCycleTransfer?.branchSupplyCycle
        ?.distributionCenterLocationId;
    const warehouseLocationId = actor.operationalLocationId;
    const allowed =
      cycleCedisId === warehouseLocationId ||
      transfer.originLocation?.id === warehouseLocationId ||
      transfer.destinationLocation?.id === warehouseLocationId ||
      transfer.originLocation?.parentId === warehouseLocationId ||
      transfer.destinationLocation?.parentId === warehouseLocationId;

    if (!allowed) throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
  }

  private async recordLinkedCycleStateChange(
    tx: Prisma.TransactionClient,
    transfer: TransferRecord,
    userId: string,
    action: 'CONFIRM' | 'CANCEL',
    idempotencyKey?: string,
    extraPayload: Record<string, unknown> = {},
  ): Promise<void> {
    const link = transfer.branchSupplyCycleTransfer;
    if (!link) return;

    const cycle =
      link.branchSupplyCycle ??
      (await tx.branchSupplyCycle.findUnique({
        where: { id: link.branchSupplyCycleId },
        include: { pointOfSaleDailyClose: true },
      }));
    if (!cycle) {
      throw new NotFoundException('Linked branch supply cycle not found');
    }
    if (
      cycle.status === BranchSupplyCycleStatus.CLOSED ||
      cycle.status === BranchSupplyCycleStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Transfers linked to closed or cancelled cycles cannot change',
      );
    }

    const nextStatus =
      cycle.status === BranchSupplyCycleStatus.READY_FOR_REVIEW
        ? BranchSupplyCycleStatus.OPEN
        : cycle.status;
    const nextVersion = cycle.version + 1;
    const result = await tx.branchSupplyCycle.updateMany({
      where: {
        id: cycle.id,
        version: cycle.version,
        status: {
          in: [
            BranchSupplyCycleStatus.OPEN,
            BranchSupplyCycleStatus.READY_FOR_REVIEW,
          ],
        },
      },
      data: {
        version: { increment: 1 },
        status: nextStatus,
        reviewedAt: null,
        reviewedByUserId: null,
        reconciledDailyCloseVersion: null,
        reconciledAt: null,
      },
    });
    if (result.count !== 1) {
      throw new ConflictException('BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT');
    }

    if (cycle.pointOfSaleDailyClose?.status === 'DRAFT') {
      await tx.pointOfSaleDailyClose.update({
        where: { id: cycle.pointOfSaleDailyClose.id },
        data: {
          version: { increment: 1 },
          lastValidatedAt: null,
          validatedSourceVersion: null,
        },
      });
    }

    await tx.branchSupplyCycleEvent.create({
      data: {
        branchSupplyCycleId: cycle.id,
        type: 'TRANSFER_STATE_CHANGED',
        cycleVersion: nextVersion,
        fromStatus: cycle.status,
        toStatus: nextStatus,
        actorUserId: userId,
        reason:
          typeof extraPayload.cancellationReason === 'string'
            ? extraPayload.cancellationReason
            : action,
        payload: {
          action,
          transferId: transfer.id,
          role: link.role,
          fromTransferStatus: transfer.status,
          idempotencyKey: idempotencyKey ?? null,
          ...extraPayload,
        },
        idempotencyKey: idempotencyKey
          ? `inventory:${action}:${transfer.id}:${idempotencyKey}`
          : null,
      },
    });
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isRetryableConflict(error) || attempt === 3) {
          if (this.isRetryableConflict(error)) {
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

  private isSerializableConflict(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2034'
    );
  }

  private isRetryableConflict(error: unknown): boolean {
    if (this.isSerializableConflict(error)) return true;
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
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
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: `Idempotency-Key does not match the completed inventory transfer ${action.toLowerCase()} command`,
      });
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
        unitEquivalentId: item.unitEquivalentId ?? null,
      })),
    );

    if (
      transfer.originLocationId !== dto.originLocationId ||
      transfer.destinationLocationId !== dto.destinationLocationId ||
      transfer.userId !== userId ||
      (transfer.notes ?? null) !== this.normalizeOptionalText(dto.notes) ||
      JSON.stringify(existingItems) !== JSON.stringify(requestedItems)
    ) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message:
          'Idempotency-Key was already used for a different inventory transfer payload',
      });
    }
  }

  private normalizeComparableItems(
    items: Array<{
      productId: string;
      unit: ProductUnit;
      quantityKg?: number;
      quantityPieces?: number;
      unitEquivalentId?: string | null;
    }>,
  ): string[] {
    const grouped = new Map<
      string,
      {
        productId: string;
        unit: ProductUnit;
        quantityKg: number;
        quantityPieces: number;
        unitEquivalentId: string;
      }
    >();

    for (const item of items) {
      const unitEquivalentId = item.unitEquivalentId ?? '';
      const key = `${item.productId}|${unitEquivalentId}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, {
          productId: item.productId,
          unit: item.unit,
          quantityKg: item.quantityKg ?? 0,
          quantityPieces: item.quantityPieces ?? 0,
          unitEquivalentId,
        });
        continue;
      }

      current.quantityKg = this.addQuantity(
        current.quantityKg,
        item.quantityKg ?? 0,
      );
      current.quantityPieces += item.quantityPieces ?? 0;
      current.unit = this.mergeUnits(current.unit, item.unit);
    }

    return [...grouped.values()]
      .map((item) =>
        [
          item.productId,
          item.unit,
          item.quantityKg,
          item.quantityPieces,
          item.unitEquivalentId,
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
    const location = await tx.operationalLocation.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true },
    });

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
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, unit: true, isActive: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (!product.isActive) {
      throw new BadRequestException('PRODUCT_INACTIVE');
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

    if (
      !Number.isFinite(quantities.quantityKg) ||
      !Number.isFinite(quantities.quantityPieces) ||
      quantities.quantityKg < 0 ||
      quantities.quantityPieces < 0 ||
      !Number.isInteger(quantities.quantityPieces) ||
      !Object.values(ProductUnit).includes(requestedUnit)
    ) {
      throw new BadRequestException('UNIT_MISMATCH');
    }

    if (productUnit === ProductUnit.KG) {
      if (
        requestedUnit !== ProductUnit.KG ||
        quantities.quantityKg <= 0 ||
        quantities.quantityPieces !== 0
      ) {
        throw new BadRequestException('UNIT_MISMATCH');
      }
      return quantities;
    }

    if (productUnit === ProductUnit.PIECE) {
      if (
        requestedUnit !== ProductUnit.PIECE ||
        quantities.quantityPieces <= 0 ||
        quantities.quantityKg !== 0
      ) {
        throw new BadRequestException('UNIT_MISMATCH');
      }
      return quantities;
    }

    if (
      requestedUnit === ProductUnit.KG &&
      (quantities.quantityKg <= 0 || quantities.quantityPieces !== 0)
    ) {
      throw new BadRequestException('UNIT_MISMATCH');
    }

    if (
      requestedUnit === ProductUnit.PIECE &&
      (quantities.quantityPieces <= 0 || quantities.quantityKg !== 0)
    ) {
      throw new BadRequestException('UNIT_MISMATCH');
    }

    if (
      requestedUnit === ProductUnit.KG_AND_PIECE &&
      quantities.quantityKg <= 0 &&
      quantities.quantityPieces <= 0
    ) {
      throw new BadRequestException('UNIT_MISMATCH');
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

  private normalizeReceiptItems(
    transferItems: TransferItemRecord[],
    receivedItems: SupplyReceiptItemInput[],
  ): Map<string, NormalizedQuantities> {
    const itemById = new Map(transferItems.map((item) => [item.id, item]));
    const normalized = new Map<string, NormalizedQuantities>();

    for (const receivedItem of receivedItems) {
      if (normalized.has(receivedItem.transferItemId)) {
        throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
      }
      const transferItem = itemById.get(receivedItem.transferItemId);
      if (!transferItem) {
        throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
      }
      normalized.set(
        receivedItem.transferItemId,
        this.normalizeReceivedItemQuantities(
          transferItem.product?.unit ?? transferItem.unit,
          receivedItem.quantityKg,
          receivedItem.quantityPieces,
        ),
      );
    }

    if (normalized.size !== transferItems.length) {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
    }

    return normalized;
  }

  private normalizeReceivedItemQuantities(
    productUnit: ProductUnit,
    quantityKg?: number,
    quantityPieces?: number,
  ): NormalizedQuantities {
    const quantities = {
      quantityKg: quantityKg ?? 0,
      quantityPieces: quantityPieces ?? 0,
    };

    if (
      !Number.isFinite(quantities.quantityKg) ||
      !Number.isFinite(quantities.quantityPieces) ||
      quantities.quantityKg < 0 ||
      quantities.quantityPieces < 0
    ) {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
    }

    if (productUnit === ProductUnit.KG && quantities.quantityPieces !== 0) {
      throw new BadRequestException('UNIT_MISMATCH');
    }
    if (
      productUnit === ProductUnit.PIECE &&
      (quantities.quantityKg !== 0 ||
        !Number.isInteger(quantities.quantityPieces))
    ) {
      throw new BadRequestException('UNIT_MISMATCH');
    }
    if (!Number.isInteger(quantities.quantityPieces)) {
      throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
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
    if (
      transfer.status !== InventoryTransferStatus.DRAFT &&
      transfer.status !== InventoryTransferStatus.REQUESTED &&
      transfer.status !== InventoryTransferStatus.IN_TRANSIT
    ) {
      throw new BadRequestException(
        'Only draft, requested, or in-transit transfers can be cancelled',
      );
    }
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
    actor?: InventoryTransferActor,
  ): Prisma.InventoryTransferWhereInput {
    const createdAt = buildCivilDateRangeFilter(
      query.dateFrom,
      query.dateTo,
      this.config?.get<string>('app.timezone'),
    );
    const locationId =
      actor?.role === 'WAREHOUSE'
        ? (actor.operationalLocationId ?? '__warehouse_without_location__')
        : undefined;

    return {
      ...(query.originLocationId
        ? { originLocationId: query.originLocationId }
        : {}),
      ...(query.destinationLocationId
        ? { destinationLocationId: query.destinationLocationId }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(locationId
        ? {
            OR: [
              { originLocationId: locationId },
              { destinationLocationId: locationId },
              { originLocation: { parentId: locationId, type: 'BRANCH' } },
              { destinationLocation: { parentId: locationId, type: 'BRANCH' } },
            ],
          }
        : {}),
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

  private toTransferResponse(
    transfer: TransferRecord,
    balanceByProduct?: Map<
      string,
      (InventoryBalanceAvailability & { locationId: string }) | null
    >,
  ): TransferResponse {
    const items = (transfer.items ?? []).map((item) => ({
      productId: item.productId,
      productName: item.product?.name,
      unit: item.unit,
      quantityKg: this.toNumber(item.quantityKg),
      quantityPieces: item.quantityPieces ?? 0,
      unitEquivalentId: item.unitEquivalentId ?? null,
      appliedEquivalentFactor: item.appliedEquivalentFactor
        ? this.toNumber(item.appliedEquivalentFactor)
        : null,
      roundingMode: item.roundingMode ?? null,
      ...(balanceByProduct
        ? { balance: balanceByProduct.get(item.productId) ?? null }
        : {}),
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
