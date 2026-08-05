import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchSupplyCycleEventType,
  BranchSupplyCycleStatus,
  BranchSupplyTransferRole,
  InventoryMovementType,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import {
  InventoryTransferCreateOptions,
  InventoryTransfersService,
  TransferResponse,
} from '../inventory/inventory-transfers.service';
import { CreateInventoryTransferDto } from '../inventory/dto/create-inventory-transfer.dto';
import {
  BranchSupplyCycleCommandDto,
  OpenBranchSupplyCycleDto,
  RefreshBranchSupplyCycleDto,
} from './dto';

type CycleActor = Pick<
  AuthenticatedUser,
  'id' | 'role' | 'operationalLocationId'
>;

type CycleClient = Prisma.TransactionClient | PrismaService;

const CYCLE_INCLUDE = {
  distributionCenterLocation: true,
  branchLocation: true,
  pointOfSaleDailyClose: true,
  transfers: {
    orderBy: { linkedAt: 'asc' as const },
    include: {
      inventoryTransfer: {
        include: {
          originLocation: true,
          destinationLocation: true,
          items: { include: { product: true, unitEquivalent: true } },
          inventoryMovements: {
            include: { product: true, location: true },
            orderBy: { createdAt: 'asc' as const },
          },
        },
      },
    },
  },
  items: {
    orderBy: [
      { cycleVersion: 'desc' as const },
      { snapshotKey: 'asc' as const },
    ],
  },
  events: { orderBy: { occurredAt: 'asc' as const } },
} satisfies Prisma.BranchSupplyCycleInclude;

type CycleRecord = Prisma.BranchSupplyCycleGetPayload<{
  include: typeof CYCLE_INCLUDE;
}>;

type CycleResponse = {
  id: string;
  distributionCenterLocationId: string;
  branchLocationId: string;
  businessDate: Date;
  status: BranchSupplyCycleStatus;
  version: number;
  notes: string | null;
  pendingTransferCount: number;
  cancelledTransferCount: number;
  confirmedSupplyCount: number;
  confirmedReturnCount: number;
  totals: {
    suppliedKg: number;
    suppliedPieces: number;
    returnedKg: number;
    returnedPieces: number;
    netKg: number;
    netPieces: number;
  };
  distributionCenterLocation: unknown;
  branchLocation: unknown;
  dailyClose: unknown;
  supplies: CycleTransferResponse[];
  returns: CycleTransferResponse[];
  snapshots: unknown[];
  events: unknown[];
};

type CycleTransferResponse = {
  id: string;
  role: BranchSupplyTransferRole;
  linkedAt: Date;
  transfer: TransferResponse;
};

type SnapshotAggregate = {
  snapshotKey: string;
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string | null;
  productUnitSnapshot: ProductUnit;
  unitPriceSnapshot: number;
  unitCostSnapshot: number;
  unitEquivalentId: string | null;
  equivalenceFromUnitSnapshot: ProductUnit | null;
  equivalenceToUnitSnapshot: ProductUnit | null;
  appliedEquivalentFactorSnapshot: number | null;
  roundingModeSnapshot: string | null;
  deliveredKg: number;
  deliveredPieces: number;
  returnedKg: number;
  returnedPieces: number;
};

@Injectable()
export class BranchSupplyCyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryTransfers: InventoryTransfersService,
  ) {}

  async open(
    dto: OpenBranchSupplyCycleDto,
    actor: CycleActor,
    idempotencyKey: string,
  ): Promise<CycleResponse> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const payloadHash = this.hashPayload({ dto, actorId: actor.id });
    const eventKey = this.eventKey('OPEN', 'new', key);

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const replay = await this.findIdempotentCycle(
            tx,
            eventKey,
            payloadHash,
          );
          if (replay) return replay;

          const businessDate = this.parseBusinessDate(dto.businessDate);
          this.assertCedisScope(dto.distributionCenterLocationId, actor);
          await this.assertCompatibleLocations(
            tx,
            dto.distributionCenterLocationId,
            dto.branchLocationId,
          );

          const existing = await tx.branchSupplyCycle.findFirst({
            where: {
              branchLocationId: dto.branchLocationId,
              businessDate,
              status: { not: BranchSupplyCycleStatus.CANCELLED },
            },
            include: CYCLE_INCLUDE,
          });
          if (existing) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_ALREADY_EXISTS',
              'An active branch supply cycle already exists for this branch and date',
            );
          }

          const dailyClose = await tx.pointOfSaleDailyClose.findFirst({
            where: {
              operationalLocationId: dto.branchLocationId,
              businessDate,
              status: 'DRAFT',
            },
            orderBy: { createdAt: 'desc' },
          });
          const cycle = await tx.branchSupplyCycle.create({
            data: {
              distributionCenterLocationId: dto.distributionCenterLocationId,
              branchLocationId: dto.branchLocationId,
              businessDate,
              pointOfSaleDailyCloseId: dailyClose?.id ?? null,
              status: BranchSupplyCycleStatus.OPEN,
              version: 1,
              notes: this.normalizeOptionalText(dto.notes),
              openedByUserId: actor.id,
            },
            include: CYCLE_INCLUDE,
          });

          await tx.branchSupplyCycleEvent.create({
            data: {
              branchSupplyCycleId: cycle.id,
              type: BranchSupplyCycleEventType.OPENED,
              cycleVersion: 1,
              toStatus: BranchSupplyCycleStatus.OPEN,
              actorUserId: actor.id,
              payload: { payloadHash, operation: 'OPEN' },
              idempotencyKey: eventKey,
            },
          });

          return this.toCycleResponse(cycle);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async findOne(id: string, actor: CycleActor): Promise<CycleResponse> {
    const cycle = await this.findCycle(this.prisma, id);
    this.assertCycleReadScope(cycle, actor);
    return this.toCycleResponse(cycle);
  }

  async createSupply(
    cycleId: string,
    dto: BranchSupplyCycleCommandDto,
    actor: CycleActor,
    idempotencyKey: string,
  ) {
    return this.createTransferCommand(
      cycleId,
      dto,
      actor,
      idempotencyKey,
      BranchSupplyTransferRole.SUPPLY,
    );
  }

  async createReturn(
    cycleId: string,
    dto: BranchSupplyCycleCommandDto,
    actor: CycleActor,
    idempotencyKey: string,
  ) {
    return this.createTransferCommand(
      cycleId,
      dto,
      actor,
      idempotencyKey,
      BranchSupplyTransferRole.RETURN,
    );
  }

  async refresh(
    cycleId: string,
    dto: RefreshBranchSupplyCycleDto,
    actor: CycleActor,
    idempotencyKey: string,
  ): Promise<CycleResponse> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const eventKey = this.eventKey('REFRESH', cycleId, key);

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const cycle = await this.findCycle(tx, cycleId);
          this.assertCycleReadScope(cycle, actor);

          const payloadHash = this.hashPayload({
            cycleId,
            dto,
            actorId: actor.id,
          });
          const replay = await this.findIdempotentCycle(
            tx,
            eventKey,
            payloadHash,
          );
          if (replay) return replay;
          this.assertMutableCycle(cycle, dto.expectedVersion);

          const aggregates = new Map<string, SnapshotAggregate>();
          let pendingTransferCount = 0;
          let integrityErrorCount = 0;
          let confirmedSupplyCount = 0;
          let confirmedReturnCount = 0;

          for (const link of cycle.transfers) {
            const transfer = link.inventoryTransfer;
            if (
              transfer.status === InventoryTransferStatus.DRAFT ||
              transfer.status === InventoryTransferStatus.REQUESTED ||
              transfer.status === InventoryTransferStatus.IN_TRANSIT
            ) {
              pendingTransferCount += 1;
              continue;
            }
            if (transfer.status === InventoryTransferStatus.CANCELLED) continue;

            if (transfer.status !== InventoryTransferStatus.CONFIRMED) {
              continue;
            }
            if (link.role === BranchSupplyTransferRole.SUPPLY) {
              confirmedSupplyCount += 1;
            } else {
              confirmedReturnCount += 1;
            }
            if (!this.hasTransferIntegrity(transfer)) integrityErrorCount += 1;
            for (const item of transfer.items) {
              const product = item.product;
              const snapshotKey = `${item.productId}:${item.unitEquivalentId ?? 'none'}`;
              const current = aggregates.get(snapshotKey) ?? {
                snapshotKey,
                productId: item.productId,
                productNameSnapshot: product.name,
                productSkuSnapshot: product.sku,
                productUnitSnapshot: product.unit,
                unitPriceSnapshot: this.toNumber(product.salePrice),
                unitCostSnapshot: this.toNumber(product.purchaseCost),
                unitEquivalentId: item.unitEquivalentId,
                equivalenceFromUnitSnapshot:
                  item.unitEquivalent?.unitFrom ?? null,
                equivalenceToUnitSnapshot: item.unitEquivalent?.unitTo ?? null,
                appliedEquivalentFactorSnapshot: item.appliedEquivalentFactor
                  ? this.toNumber(item.appliedEquivalentFactor)
                  : null,
                roundingModeSnapshot: item.roundingMode,
                deliveredKg: 0,
                deliveredPieces: 0,
                returnedKg: 0,
                returnedPieces: 0,
              };
              if (link.role === BranchSupplyTransferRole.SUPPLY) {
                current.deliveredKg += this.toNumber(item.quantityKg);
                current.deliveredPieces += item.quantityPieces ?? 0;
              } else {
                current.returnedKg += this.toNumber(item.quantityKg);
                current.returnedPieces += item.quantityPieces ?? 0;
              }
              aggregates.set(snapshotKey, current);
            }
          }

          const eligible =
            confirmedSupplyCount > 0 &&
            pendingTransferCount === 0 &&
            integrityErrorCount === 0;
          const nextVersion = cycle.version + 1;
          const nextStatus = eligible
            ? BranchSupplyCycleStatus.READY_FOR_REVIEW
            : BranchSupplyCycleStatus.OPEN;
          const updateResult = await tx.branchSupplyCycle.updateMany({
            where: {
              id: cycle.id,
              version: dto.expectedVersion,
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
              totalDeliveredKg: this.sum(aggregates, 'deliveredKg'),
              totalDeliveredPieces: this.sum(aggregates, 'deliveredPieces'),
              totalReturnedKg: this.sum(aggregates, 'returnedKg'),
              totalReturnedPieces: this.sum(aggregates, 'returnedPieces'),
              reviewedAt: eligible ? new Date() : null,
              reviewedByUserId: eligible ? actor.id : null,
            },
          });
          if (updateResult.count !== 1) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT',
              'The branch supply cycle version is stale',
            );
          }

          if (aggregates.size > 0) {
            await tx.branchSupplyCycleItem.createMany({
              data: Array.from(aggregates.values()).map((item) => ({
                branchSupplyCycleId: cycle.id,
                cycleVersion: nextVersion,
                snapshotKey: item.snapshotKey,
                productId: item.productId,
                productNameSnapshot: item.productNameSnapshot,
                productSkuSnapshot: item.productSkuSnapshot,
                productUnitSnapshot: item.productUnitSnapshot,
                unitPriceSnapshot: item.unitPriceSnapshot,
                unitCostSnapshot: item.unitCostSnapshot,
                unitEquivalentId: item.unitEquivalentId,
                equivalenceFromUnitSnapshot: item.equivalenceFromUnitSnapshot,
                equivalenceToUnitSnapshot: item.equivalenceToUnitSnapshot,
                appliedEquivalentFactorSnapshot:
                  item.appliedEquivalentFactorSnapshot,
                roundingModeSnapshot: item.roundingModeSnapshot,
                deliveredKg: item.deliveredKg,
                deliveredPieces: item.deliveredPieces,
                returnedKg: item.returnedKg,
                returnedPieces: item.returnedPieces,
              })),
            });
          }

          await tx.branchSupplyCycleEvent.create({
            data: {
              branchSupplyCycleId: cycle.id,
              type: eligible
                ? BranchSupplyCycleEventType.READY_FOR_REVIEW
                : BranchSupplyCycleEventType.ITEM_SNAPSHOT_CREATED,
              cycleVersion: nextVersion,
              fromStatus: cycle.status,
              toStatus: nextStatus,
              actorUserId: actor.id,
              payload: {
                payloadHash,
                pendingTransferCount,
                integrityErrorCount,
                confirmedSupplyCount,
                confirmedReturnCount,
              },
              idempotencyKey: eventKey,
            },
          });

          return this.toCycleResponse(await this.findCycle(tx, cycle.id));
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async createTransferCommand(
    cycleId: string,
    dto: BranchSupplyCycleCommandDto,
    actor: CycleActor,
    idempotencyKey: string,
    role: BranchSupplyTransferRole,
  ) {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const eventKey = this.eventKey(role, cycleId, key);

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const cycle = await this.findCycle(tx, cycleId);
          this.assertCycleMutationScope(cycle, actor);
          const payloadHash = this.hashPayload({
            cycleId,
            dto,
            actorId: actor.id,
            role,
          });
          const replay = await this.findIdempotentCycle(
            tx,
            eventKey,
            payloadHash,
          );
          if (replay) {
            const transferId = this.payloadString(
              await tx.branchSupplyCycleEvent.findUnique({
                where: { idempotencyKey: eventKey },
                select: { payload: true },
              }),
              'transferId',
            );
            return {
              cycle: replay,
              transfer: transferId
                ? await this.findTransferResponse(tx, transferId)
                : null,
            };
          }
          await this.assertCompatibleLocations(
            tx,
            cycle.distributionCenterLocationId,
            cycle.branchLocationId,
          );
          this.assertMutableCycle(cycle, dto.expectedVersion);

          const nextVersion = cycle.version + 1;
          const nextStatus =
            cycle.status === BranchSupplyCycleStatus.READY_FOR_REVIEW
              ? BranchSupplyCycleStatus.OPEN
              : cycle.status;
          const updateResult = await tx.branchSupplyCycle.updateMany({
            where: {
              id: cycle.id,
              version: dto.expectedVersion,
              status: {
                in: [
                  BranchSupplyCycleStatus.OPEN,
                  BranchSupplyCycleStatus.READY_FOR_REVIEW,
                ],
              },
            },
            data: { version: { increment: 1 }, status: nextStatus },
          });
          if (updateResult.count !== 1) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT',
              'The branch supply cycle version is stale',
            );
          }

          const transferDto: CreateInventoryTransferDto = {
            originLocationId:
              role === BranchSupplyTransferRole.SUPPLY
                ? cycle.distributionCenterLocationId
                : cycle.branchLocationId,
            destinationLocationId:
              role === BranchSupplyTransferRole.SUPPLY
                ? cycle.branchLocationId
                : cycle.distributionCenterLocationId,
            notes: dto.notes,
            items: dto.items,
          };
          const transferOptions: InventoryTransferCreateOptions = {
            tx,
            equivalenceDate: cycle.businessDate,
          };
          const transfer = await this.inventoryTransfers.create(
            transferDto,
            actor.id,
            eventKey,
            transferOptions,
          );
          await tx.branchSupplyCycleTransfer.create({
            data: {
              branchSupplyCycleId: cycle.id,
              inventoryTransferId: transfer.id,
              role,
              linkedByUserId: actor.id,
            },
          });

          await tx.branchSupplyCycleEvent.create({
            data: {
              branchSupplyCycleId: cycle.id,
              type: BranchSupplyCycleEventType.TRANSFER_LINKED,
              cycleVersion: nextVersion,
              fromStatus: cycle.status,
              toStatus: nextStatus,
              actorUserId: actor.id,
              payload: {
                payloadHash,
                transferId: transfer.id,
                role,
              },
              idempotencyKey: eventKey,
            },
          });

          return {
            cycle: this.toCycleResponse(await this.findCycle(tx, cycle.id)),
            transfer,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async findIdempotentCycle(
    tx: Prisma.TransactionClient,
    eventKey: string,
    payloadHash: string,
  ): Promise<CycleResponse | null> {
    const event = await tx.branchSupplyCycleEvent.findUnique({
      where: { idempotencyKey: eventKey },
    });
    if (!event) return null;
    const existingHash = this.payloadHash(event.payload);
    if (existingHash !== payloadHash) {
      throw this.businessConflict(
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was already used with a different payload',
      );
    }
    const cycle = await this.findCycle(tx, event.branchSupplyCycleId);
    return this.toCycleResponse(cycle);
  }

  private async findCycle(
    client: CycleClient,
    id: string,
  ): Promise<CycleRecord> {
    const cycle = await client.branchSupplyCycle.findUnique({
      where: { id },
      include: CYCLE_INCLUDE,
    });
    if (!cycle) throw new NotFoundException('Branch supply cycle not found');
    return cycle;
  }

  private async findTransferResponse(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<TransferResponse> {
    const transfer = await tx.inventoryTransfer.findUnique({
      where: { id },
      include: {
        originLocation: true,
        destinationLocation: true,
        items: { include: { product: true, unitEquivalent: true } },
        inventoryMovements: {
          include: { product: true, location: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!transfer) throw new NotFoundException('Inventory transfer not found');
    return this.toTransferResponse(transfer);
  }

  private assertCompatibleLocations(
    tx: Prisma.TransactionClient,
    cedisId: string,
    branchId: string,
  ): Promise<void> {
    return Promise.all([
      tx.operationalLocation.findUnique({ where: { id: cedisId } }),
      tx.operationalLocation.findUnique({ where: { id: branchId } }),
    ]).then(([cedis, branch]) => {
      if (
        !cedis ||
        cedis.type !== 'DISTRIBUTION_CENTER' ||
        !cedis.isActive ||
        cedis.parentId !== null ||
        !branch ||
        branch.type !== 'BRANCH' ||
        !branch.isActive ||
        branch.parentId !== cedisId ||
        cedisId === branchId
      ) {
        throw this.businessConflict(
          'BRANCH_SUPPLY_CYCLE_LOCATION_INVALID',
          'CEDIS and branch locations are not compatible',
        );
      }
    });
  }

  private assertCedisScope(cedisId: string, actor: CycleActor): void {
    if (
      actor.role !== 'ADMIN' &&
      (actor.role !== 'WAREHOUSE' || actor.operationalLocationId !== cedisId)
    ) {
      throw new ForbiddenException({
        code: 'LOCATION_NOT_AUTHORIZED',
        message: 'The actor is outside the CEDIS scope',
      });
    }
  }

  private assertCycleReadScope(cycle: CycleRecord, actor: CycleActor): void {
    if (actor.role === 'ADMIN') return;
    const allowed =
      (actor.role === 'WAREHOUSE' &&
        actor.operationalLocationId === cycle.distributionCenterLocationId) ||
      (actor.role === 'SELLER' &&
        actor.operationalLocationId === cycle.branchLocationId);
    if (!allowed) {
      throw new ForbiddenException({
        code: 'LOCATION_NOT_AUTHORIZED',
        message: 'The actor is outside the cycle scope',
      });
    }
  }

  private assertCycleMutationScope(
    cycle: CycleRecord,
    actor: CycleActor,
  ): void {
    if (actor.role !== 'ADMIN') {
      if (
        actor.role !== 'WAREHOUSE' ||
        actor.operationalLocationId !== cycle.distributionCenterLocationId
      ) {
        throw new ForbiddenException({
          code: 'LOCATION_NOT_AUTHORIZED',
          message: 'The actor is outside the CEDIS scope',
        });
      }
    }
  }

  private assertMutableCycle(
    cycle: CycleRecord,
    expectedVersion: number,
  ): void {
    if (
      cycle.status === BranchSupplyCycleStatus.CLOSED ||
      cycle.status === BranchSupplyCycleStatus.CANCELLED
    ) {
      throw this.businessConflict(
        'BRANCH_SUPPLY_CYCLE_CLOSED',
        'Closed or cancelled cycles cannot be modified',
      );
    }
    if (cycle.version !== expectedVersion) {
      throw this.businessConflict(
        'BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT',
        'The branch supply cycle version is stale',
      );
    }
  }

  private hasTransferIntegrity(
    transfer: CycleRecord['transfers'][number]['inventoryTransfer'],
  ): boolean {
    const expected = new Map<
      string,
      { kg: number; pieces: number; count: number }
    >();
    for (const item of transfer.items) {
      const current = expected.get(item.productId) ?? {
        kg: 0,
        pieces: 0,
        count: 0,
      };
      current.kg += this.toNumber(item.quantityKg);
      current.pieces += item.quantityPieces ?? 0;
      current.count += 1;
      expected.set(item.productId, current);
    }
    for (const movement of transfer.inventoryMovements) {
      if (
        (movement.type === InventoryMovementType.TRANSFER_OUT &&
          movement.locationId !== transfer.originLocationId) ||
        (movement.type === InventoryMovementType.TRANSFER_IN &&
          movement.locationId !== transfer.destinationLocationId) ||
        (movement.type !== InventoryMovementType.TRANSFER_OUT &&
          movement.type !== InventoryMovementType.TRANSFER_IN)
      ) {
        return false;
      }
    }

    const productIds = new Set([
      ...expected.keys(),
      ...transfer.inventoryMovements.map((movement) => movement.productId),
    ]);
    for (const productId of productIds) {
      const quantities = expected.get(productId) ?? {
        kg: 0,
        pieces: 0,
        count: 0,
      };
      const outgoing = this.movementSummary(
        transfer.inventoryMovements,
        productId,
        InventoryMovementType.TRANSFER_OUT,
      );
      const incoming = this.movementSummary(
        transfer.inventoryMovements,
        productId,
        InventoryMovementType.TRANSFER_IN,
      );
      if (
        outgoing.count !== quantities.count ||
        incoming.count !== quantities.count ||
        !this.sameQuantity(outgoing.kg, quantities.kg) ||
        !this.sameQuantity(incoming.kg, quantities.kg) ||
        outgoing.pieces !== quantities.pieces ||
        incoming.pieces !== quantities.pieces
      ) {
        return false;
      }
    }
    return expected.size > 0;
  }

  private movementSummary(
    movements: CycleRecord['transfers'][number]['inventoryTransfer']['inventoryMovements'],
    productId: string,
    type: InventoryMovementType,
  ) {
    return movements
      .filter(
        (movement) =>
          movement.productId === productId && movement.type === type,
      )
      .reduce(
        (summary, movement) => ({
          count: summary.count + 1,
          kg: summary.kg + this.toNumber(movement.quantityKg),
          pieces: summary.pieces + (movement.quantityPieces ?? 0),
        }),
        { count: 0, kg: 0, pieces: 0 },
      );
  }

  private sameQuantity(left: number, right: number): boolean {
    return Math.abs(left - right) < 0.0005;
  }

  private sum(
    aggregates: Map<string, SnapshotAggregate>,
    key: 'deliveredKg' | 'deliveredPieces' | 'returnedKg' | 'returnedPieces',
  ): number {
    return Array.from(aggregates.values()).reduce(
      (total, aggregate) => total + aggregate[key],
      0,
    );
  }

  private toCycleResponse(cycle: CycleRecord): CycleResponse {
    const transfers = cycle.transfers.map((link) => ({
      id: link.id,
      role: link.role,
      linkedAt: link.linkedAt,
      transfer: this.toTransferResponse(link.inventoryTransfer),
    }));
    const confirmed = transfers.filter(
      ({ transfer }) => transfer.status === InventoryTransferStatus.CONFIRMED,
    );
    const supplied = confirmed
      .filter(({ role }) => role === BranchSupplyTransferRole.SUPPLY)
      .reduce(
        (totals, { transfer }) => this.addTransferTotals(totals, transfer),
        { kg: 0, pieces: 0 },
      );
    const returned = confirmed
      .filter(({ role }) => role === BranchSupplyTransferRole.RETURN)
      .reduce(
        (totals, { transfer }) => this.addTransferTotals(totals, transfer),
        { kg: 0, pieces: 0 },
      );
    const pendingTransferCount = cycle.transfers.filter(
      ({ inventoryTransfer }) =>
        inventoryTransfer.status === InventoryTransferStatus.DRAFT ||
        inventoryTransfer.status === InventoryTransferStatus.REQUESTED ||
        inventoryTransfer.status === InventoryTransferStatus.IN_TRANSIT,
    ).length;
    const cancelledTransferCount = cycle.transfers.filter(
      ({ inventoryTransfer }) =>
        inventoryTransfer.status === InventoryTransferStatus.CANCELLED,
    ).length;

    return {
      id: cycle.id,
      distributionCenterLocationId: cycle.distributionCenterLocationId,
      branchLocationId: cycle.branchLocationId,
      businessDate: cycle.businessDate,
      status: cycle.status,
      version: cycle.version,
      notes: cycle.notes,
      pendingTransferCount,
      cancelledTransferCount,
      confirmedSupplyCount: confirmed.filter(
        ({ role }) => role === BranchSupplyTransferRole.SUPPLY,
      ).length,
      confirmedReturnCount: confirmed.filter(
        ({ role }) => role === BranchSupplyTransferRole.RETURN,
      ).length,
      totals: {
        suppliedKg: supplied.kg,
        suppliedPieces: supplied.pieces,
        returnedKg: returned.kg,
        returnedPieces: returned.pieces,
        netKg: supplied.kg - returned.kg,
        netPieces: supplied.pieces - returned.pieces,
      },
      distributionCenterLocation: cycle.distributionCenterLocation,
      branchLocation: cycle.branchLocation,
      dailyClose: cycle.pointOfSaleDailyClose
        ? {
            id: cycle.pointOfSaleDailyClose.id,
            status: cycle.pointOfSaleDailyClose.status,
            version: cycle.pointOfSaleDailyClose.version,
            lastValidatedAt: cycle.pointOfSaleDailyClose.lastValidatedAt,
            validatedSourceVersion:
              cycle.pointOfSaleDailyClose.validatedSourceVersion,
          }
        : null,
      supplies: transfers.filter(
        ({ role }) => role === BranchSupplyTransferRole.SUPPLY,
      ),
      returns: transfers.filter(
        ({ role }) => role === BranchSupplyTransferRole.RETURN,
      ),
      snapshots: cycle.items,
      events: cycle.events,
    };
  }

  private addTransferTotals(
    totals: { kg: number; pieces: number },
    transfer: TransferResponse,
  ) {
    for (const item of transfer.items) {
      totals.kg += item.quantityKg;
      totals.pieces += item.quantityPieces;
    }
    return totals;
  }

  private toTransferResponse(
    transfer: CycleRecord['transfers'][number]['inventoryTransfer'],
  ): TransferResponse {
    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      originLocationId: transfer.originLocationId,
      destinationLocationId: transfer.destinationLocationId,
      status: transfer.status,
      userId: transfer.userId,
      notes: transfer.notes,
      requestedAt: transfer.requestedAt,
      confirmedAt: transfer.confirmedAt,
      cancelledAt: transfer.cancelledAt,
      cancelledByUserId: transfer.cancelledByUserId,
      cancellationReason: transfer.cancellationReason,
      itemsCount: transfer.items.length,
      createdAt: transfer.createdAt,
      updatedAt: transfer.updatedAt,
      items: transfer.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        unit: item.unit,
        quantityKg: this.toNumber(item.quantityKg),
        quantityPieces: item.quantityPieces ?? 0,
        unitEquivalentId: item.unitEquivalentId,
        appliedEquivalentFactor: item.appliedEquivalentFactor
          ? this.toNumber(item.appliedEquivalentFactor)
          : null,
        roundingMode: item.roundingMode,
      })),
      movements: transfer.inventoryMovements.map((movement) => ({
        id: movement.id,
        productId: movement.productId,
        productName: movement.product.name,
        locationId: movement.locationId,
        locationName: movement.location.name,
        type: movement.type,
        unit: this.resolveMovementUnit(
          this.toNumber(movement.quantityKg),
          movement.quantityPieces ?? 0,
        ),
        quantityKg: this.toNumber(movement.quantityKg),
        quantityPieces: movement.quantityPieces ?? 0,
        previousQuantityKg: this.toNumber(movement.previousQuantityKg),
        newQuantityKg: this.toNumber(movement.newQuantityKg),
        previousQuantityPieces: movement.previousQuantityPieces ?? 0,
        newQuantityPieces: movement.newQuantityPieces ?? 0,
        reason: movement.reason,
        referenceType: movement.referenceType,
        referenceId: movement.referenceId,
        transferId: movement.transferId,
        saleId: movement.saleId,
        purchaseId: movement.purchaseId,
        routeSettlementId: movement.routeSettlementId,
        pointOfSaleDailyCloseId: movement.pointOfSaleDailyCloseId,
        userId: movement.userId,
        createdAt: movement.createdAt,
      })),
    };
  }

  private resolveMovementUnit(
    quantityKg: number,
    quantityPieces: number,
  ): ProductUnit {
    if (quantityKg > 0 && quantityPieces > 0) return ProductUnit.KG_AND_PIECE;
    if (quantityPieces > 0) return ProductUnit.PIECE;
    return ProductUnit.KG;
  }

  private toNumber(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number {
    return value === null || value === undefined ? 0 : Number(value);
  }

  private parseBusinessDate(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        'businessDate must be a valid calendar date',
      );
    }
    return date;
  }

  private normalizeOptionalText(value?: string): string | null {
    const normalized = value?.trim();
    return normalized || null;
  }

  private requireIdempotencyKey(value: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return normalized;
  }

  private eventKey(operation: string, resource: string, key: string): string {
    return `cedis:${operation}:${resource}:${key}`;
  }

  private hashPayload(payload: unknown): string {
    return createHash('sha256')
      .update(this.stableSerialize(payload))
      .digest('hex');
  }

  private stableSerialize(value: unknown): string {
    if (value === null || typeof value !== 'object')
      return JSON.stringify(value);
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${this.stableSerialize(object[key])}`,
      )
      .join(',')}}`;
  }

  private payloadHash(payload: Prisma.JsonValue): string | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const hash = (payload as Record<string, Prisma.JsonValue>).payloadHash;
    return typeof hash === 'string' ? hash : null;
  }

  private payloadString(
    event: { payload: Prisma.JsonValue } | null,
    key: string,
  ): string | null {
    if (!event || !event.payload || typeof event.payload !== 'object')
      return null;
    const value = (event.payload as Record<string, Prisma.JsonValue>)[key];
    return typeof value === 'string' ? value : null;
  }

  private businessConflict(code: string, message: string): ConflictException {
    return new ConflictException({ code, message });
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const retryable =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          ['P2002', 'P2034'].includes(
            (error as { code?: unknown }).code as string,
          );
        if (!retryable || attempt === 3) throw error;
      }
    }
    throw this.businessConflict(
      'BRANCH_SUPPLY_CYCLE_CONCURRENCY_CONFLICT',
      'The cycle operation could not be completed after concurrent retries',
    );
  }
}
