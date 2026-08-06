import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  actor?: Pick<
    AuthenticatedUser,
    'id' | 'role' | 'operationalLocationId' | 'permissions'
  >;
};

@Injectable()
export class InventoryTransfersService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.toTransferResponse(transfer);
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

    const items: Array<{
      productId: string;
      unit: ProductUnit;
      quantityKg: number;
      quantityPieces: number;
      unitEquivalentId?: string;
      appliedEquivalentFactor?: Prisma.Decimal;
      roundingMode?: string | null;
    }> = [];
    for (const item of dto.items) {
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

      items.push({
        productId: item.productId,
        unit: item.unit,
        quantityKg: quantities.quantityKg,
        quantityPieces: quantities.quantityPieces,
        ...(equivalence ?? {}),
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

    for (const item of transfer.items ?? []) {
      const sent = this.normalizeExistingItemQuantities(item);
      const received = quantitiesByItem.get(item.id);
      if (!received) {
        throw new BadRequestException('BRANCH_SUPPLY_RECEIPT_ITEMS_INVALID');
      }
      const reason = this.withCommandMarker(
        `Inventory supply ${transfer.transferNumber} received`,
        commandMarker,
      );

      const originChange = await this.applyBalanceChange(
        tx,
        item.productId,
        transfer.originLocationId,
        -1,
        sent,
      );
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

      const destinationChange = await this.applyBalanceChange(
        tx,
        item.productId,
        transfer.destinationLocationId,
        1,
        sent,
      );
      await this.createMovement(
        tx,
        transfer,
        item,
        userId,
        InventoryMovementType.TRANSFER_IN,
        transfer.destinationLocationId,
        sent,
        destinationChange,
        reason,
      );

      const shortage = {
        quantityKg: Math.max(sent.quantityKg - received.quantityKg, 0),
        quantityPieces: Math.max(
          sent.quantityPieces - received.quantityPieces,
          0,
        ),
      };
      if (shortage.quantityKg > 0 || shortage.quantityPieces > 0) {
        const balanceChange = await this.applyBalanceChange(
          tx,
          item.productId,
          transfer.destinationLocationId,
          -1,
          shortage,
        );
        await this.createReceiptAdjustmentMovement(
          tx,
          item,
          userId,
          InventoryMovementType.SHRINKAGE,
          transfer.destinationLocationId,
          shortage,
          balanceChange,
          options.receiptId,
          `Supply shortage for ${transfer.transferNumber}`,
        );
      }

      const surplus = {
        quantityKg: Math.max(received.quantityKg - sent.quantityKg, 0),
        quantityPieces: Math.max(
          received.quantityPieces - sent.quantityPieces,
          0,
        ),
      };
      if (surplus.quantityKg > 0 || surplus.quantityPieces > 0) {
        const balanceChange = await this.applyBalanceChange(
          tx,
          item.productId,
          transfer.destinationLocationId,
          1,
          surplus,
        );
        await this.createReceiptAdjustmentMovement(
          tx,
          item,
          userId,
          InventoryMovementType.IN,
          transfer.destinationLocationId,
          surplus,
          balanceChange,
          options.receiptId,
          `Supply surplus for ${transfer.transferNumber}`,
        );
      }
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

    this.assertLinkedCycleCanChange(transfer);
    this.assertLinkedTransferDirection(transfer);
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

    await this.recordLinkedCycleStateChange(
      tx,
      transfer,
      userId,
      'CANCEL',
      idempotencyKey,
    );

    return this.toTransferResponse(cancelled);
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
      throw new BadRequestException(
        'Unit equivalence is only valid for KG_AND_PIECE products',
      );
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
      throw new BadRequestException('Unit equivalence is not applicable');
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
        throw new BadRequestException(
          'Inactive products cannot be transferred',
        );
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
      throw new BadRequestException(
        'Branch inventory must originate from its parent distribution center',
      );
    }
    if ((isSupply || isReturn) && !cedisCycleTransfer) {
      throw new BadRequestException(
        'Branch inventory transfers must be created through a CEDIS supply cycle',
      );
    }
    if (cedisCycleTransfer && !isSupply && !isReturn) {
      throw new BadRequestException(
        'CEDIS supply cycle transfers require a direct CEDIS and branch pair',
      );
    }

    if (actor?.role === 'WAREHOUSE') {
      const scopedLocationId = isReturn ? destination.id : origin.id;
      if (actor.operationalLocationId !== scopedLocationId) {
        throw new ForbiddenException('LOCATION_NOT_AUTHORIZED');
      }
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
        reason: action,
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
            throw new ConflictException(
              'INVENTORY_TRANSFER_CONCURRENCY_CONFLICT',
            );
          }
          throw error;
        }
      }
    }

    throw new ConflictException('INVENTORY_TRANSFER_CONCURRENCY_CONFLICT');
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
      unitEquivalentId?: string | null;
    }>,
  ): string[] {
    return items
      .map((item) =>
        [
          item.productId,
          item.unit,
          item.quantityKg ?? 0,
          item.quantityPieces ?? 0,
          item.unitEquivalentId ?? '',
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

  private async createReceiptAdjustmentMovement(
    tx: Prisma.TransactionClient,
    item: TransferItemRecord,
    userId: string,
    type: InventoryMovementType,
    locationId: string,
    quantities: NormalizedQuantities,
    balanceChange: AppliedBalanceChange,
    receiptId: string,
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
        referenceType: 'BRANCH_SUPPLY_RECEIPT',
        referenceId: receiptId,
      },
      include: { product: true, location: true },
    });
  }

  private buildTransferWhere(
    query: ListInventoryTransfersQueryDto,
    actor?: InventoryTransferActor,
  ): Prisma.InventoryTransferWhereInput {
    const createdAt = this.buildCreatedAtFilter(query.dateFrom, query.dateTo);
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
      unitEquivalentId: item.unitEquivalentId ?? null,
      appliedEquivalentFactor: item.appliedEquivalentFactor
        ? this.toNumber(item.appliedEquivalentFactor)
        : null,
      roundingMode: item.roundingMode ?? null,
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
