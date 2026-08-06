import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  BranchSupplyCycleEventType,
  BranchSupplyCycleSnapshotType,
  BranchSupplyCycleStatus,
  BranchSupplyTransferRole,
  InventoryMovementType,
  InventoryTransferStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { PERMISSIONS } from '../../common/authorization/permissions';
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
  CancelBranchSupplyCycleDto,
  CloseBranchSupplyCycleDto,
  OpenBranchSupplyCycleDto,
  RefreshBranchSupplyCycleDto,
  ReopenBranchSupplyCycleDto,
} from './dto';
import { BranchSupplyCycleReconciliationService } from './branch-supply-cycle-reconciliation.service';
import { PointOfSaleDailyCloseService } from '../point-of-sale-daily-close/point-of-sale-daily-close.service';
import { CedisGateway } from './cedis.gateway';
import type { CedisSupplyCreatedPayload } from './cedis-realtime.types';
import type {
  ReconciliationDailyClose,
  ReconciliationInput,
  ReconciliationResult,
} from './branch-supply-cycle-reconciliation.service';

type CycleActor = Pick<
  AuthenticatedUser,
  'id' | 'role' | 'operationalLocationId' | 'permissions'
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
  productSnapshots: {
    orderBy: { createdAt: 'asc' as const },
  },
  reconciliationSnapshots: {
    orderBy: { createdAt: 'asc' as const },
  },
  events: { orderBy: { occurredAt: 'asc' as const } },
} satisfies Prisma.BranchSupplyCycleInclude;

type CycleRecord = Prisma.BranchSupplyCycleGetPayload<{
  include: typeof CYCLE_INCLUDE;
}>;

type SnapshotDelegate = {
  findUnique(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
};

type SaleRecord = {
  id: string;
  status: string;
  total: Prisma.Decimal | number | string | null;
  items: Array<{
    productId: string;
    quantityKg: Prisma.Decimal | number | string | null;
    quantityPieces: number | null;
    total: Prisma.Decimal | number | string | null;
    appliedEquivalentFactor: Prisma.Decimal | number | string | null;
    product: { name: string; sku: string | null; unit: ProductUnit };
    unitEquivalent: {
      unitFrom: ProductUnit;
      unitTo: ProductUnit;
      factor: Prisma.Decimal | number | string;
    } | null;
  }>;
};

type ShrinkageRecord = {
  id: string;
  productId: string;
  quantityKg: Prisma.Decimal | number | string | null;
  quantityPieces: number | null;
};

type DailyCloseRecord = {
  id: string;
  version: number;
  status: string;
  grossSalesTotal: Prisma.Decimal | number | string | null;
  netCashExpected: Prisma.Decimal | number | string | null;
  cashCountedTotal: Prisma.Decimal | number | string | null;
  cashDifferenceTotal: Prisma.Decimal | number | string | null;
  payments: Array<{
    id: string;
    status: string;
    amount: Prisma.Decimal | number | string | null;
    paymentMethod: string;
  }>;
  cashMovements: Array<{
    id: string;
    type: string;
    movementChannel: string;
    amount: Prisma.Decimal | number | string | null;
    reason: string;
    reference: string | null;
    isOpening: boolean;
    occurredAt: Date;
  }>;
  cashShifts: Array<{ id: string; status: string }>;
  differences: Array<{
    id: string;
    referenceKey: string;
    differenceValue: Prisma.Decimal | number | string | null;
    status: string;
  }>;
};

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
    expectedSoldKg: number;
    expectedSoldPieces: number;
    actualSoldKg: number;
    actualSoldPieces: number;
    shrinkageKg: number;
    shrinkagePieces: number;
    differenceKg: number;
    differencePieces: number;
    expectedSalesTotal: number;
    expectedCostTotal?: number;
    expectedProfitTotal?: number;
    actualSalesTotal: number;
    actualCostTotal?: number;
    actualProfitTotal?: number;
    actualNetProfitTotal?: number;
    expectedCashTotal: number;
    cashCountedTotal: number | null;
    cashDifferenceTotal: number | null;
    cardVoucherTotal: number;
    transferTotal: number;
    expenseTotal: number;
    cashInTotal: number;
    cashOutTotal: number;
    cashAdjustmentTotal: number;
  };
  distributionCenterLocation: { id: string; name: string };
  branchLocation: { id: string; name: string };
  dailyClose: unknown;
  supplies: CycleTransferResponse[];
  returns: CycleTransferResponse[];
  snapshots: unknown[];
  priceSnapshots: unknown[];
  closeSnapshots: unknown[];
  events: unknown[];
  reconciliation?: ReconciliationResult | null;
};

type CycleTransferResponse = {
  id: string;
  role: BranchSupplyTransferRole;
  linkedAt: Date;
  transfer: TransferResponse;
};

@Injectable()
export class BranchSupplyCyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryTransfers: InventoryTransfersService,
    private readonly cycleReconciliation: BranchSupplyCycleReconciliationService,
    private readonly dailyCloseService: PointOfSaleDailyCloseService,
    @Optional() private readonly cedisGateway?: CedisGateway,
  ) {}

  async open(
    dto: OpenBranchSupplyCycleDto,
    actor: CycleActor,
    idempotencyKey: string,
  ): Promise<CycleResponse> {
    const key = this.requireIdempotencyKey(idempotencyKey);
    const canViewCosts = this.canViewCosts(actor);
    const payloadHash = this.hashPayload({ dto, actorId: actor.id });
    const eventKey = this.eventKey('OPEN', 'new', key);

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const replay = await this.findIdempotentCycle(
            tx,
            eventKey,
            payloadHash,
            canViewCosts,
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

          return this.toCycleResponse(cycle, null, canViewCosts);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async findOne(id: string, actor: CycleActor): Promise<CycleResponse> {
    const cycle = await this.findCycle(this.prisma, id);
    this.assertCycleReadScope(cycle, actor);
    return this.toCycleResponse(cycle, null, this.canViewCosts(actor));
  }

  async createSupply(
    cycleId: string,
    dto: BranchSupplyCycleCommandDto,
    actor: CycleActor,
    idempotencyKey: string,
  ) {
    const result = await this.createTransferCommand(
      cycleId,
      dto,
      actor,
      idempotencyKey,
      BranchSupplyTransferRole.SUPPLY,
    );
    if (result.created && result.transfer) {
      const payload: CedisSupplyCreatedPayload = {
        transferId: result.transfer.id,
        transferNumber: result.transfer.transferNumber,
        cycleId: result.cycle.id,
        businessDate: result.cycle.businessDate.toISOString().slice(0, 10),
        origin: {
          id: result.cycle.distributionCenterLocation.id,
          name: result.cycle.distributionCenterLocation.name,
        },
        destination: {
          id: result.cycle.branchLocation.id,
          name: result.cycle.branchLocation.name,
        },
        requestedAt: result.transfer.requestedAt?.toISOString() ?? null,
      };
      this.cedisGateway?.emitSupplyCreated(payload);
    }
    return result;
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
    const canViewCosts = this.canViewCosts(actor);
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
            canViewCosts,
          );
          if (replay) return replay;
          this.assertMutableCycle(cycle, dto.expectedVersion);
          const { input, dailyClose } = await this.readReconciliationInput(
            tx,
            cycle,
          );
          const result = this.cycleReconciliation.calculate(input);
          const eligible = result.readyForReview;
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
              pointOfSaleDailyCloseId:
                dailyClose?.id ?? cycle.pointOfSaleDailyCloseId,
              totalDeliveredKg: result.totals.deliveredKg,
              totalDeliveredPieces: result.totals.deliveredPieces,
              totalReturnedKg: result.totals.returnedKg,
              totalReturnedPieces: result.totals.returnedPieces,
              totalExpectedSoldKg: result.totals.expectedSoldKg,
              totalExpectedSoldPieces: result.totals.expectedSoldPieces,
              totalActualSoldKg: result.totals.actualSoldKg,
              totalActualSoldPieces: result.totals.actualSoldPieces,
              totalShrinkageKg: result.totals.shrinkageKg,
              totalShrinkagePieces: result.totals.shrinkagePieces,
              totalDifferenceKg: result.totals.differenceKg,
              totalDifferencePieces: result.totals.differencePieces,
              expectedSalesTotal: result.totals.expectedSalesTotal,
              expectedCostTotal: result.totals.expectedCostTotal,
              expectedProfitTotal: result.totals.expectedProfitTotal,
              actualSalesTotal: result.totals.actualSalesTotal,
              actualCostTotal: result.totals.actualCostTotal,
              actualProfitTotal: result.totals.actualProfitTotal,
              actualNetProfitTotal: result.totals.actualNetProfitTotal,
              expectedCashTotal: result.totals.expectedCashTotal,
              cashCountedTotal: result.totals.cashCountedTotal,
              cashDifferenceTotal: result.totals.cashDifferenceTotal,
              cardVoucherTotal: result.totals.cardVoucherTotal,
              transferTotal: result.totals.transferTotal,
              expenseTotal: result.totals.expenseTotal,
              cashInTotal: result.totals.cashInTotal,
              cashOutTotal: result.totals.cashOutTotal,
              cashAdjustmentTotal: result.totals.cashAdjustmentTotal,
              reconciledDailyCloseVersion: dailyClose?.version ?? null,
              reconciledAt: new Date(),
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

          if (result.items.length > 0) {
            await tx.branchSupplyCycleItem.createMany({
              data: result.items.map((item) => ({
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
                expectedSoldKg: item.expectedSoldKg,
                expectedSoldPieces: item.expectedSoldPieces,
                actualSoldKg: item.actualSoldKg,
                actualSoldPieces: item.actualSoldPieces,
                shrinkageKg: item.shrinkageKg,
                shrinkagePieces: item.shrinkagePieces,
                differenceKg: item.differenceKg,
                differencePieces: item.differencePieces,
                expectedSalesAmount: item.expectedSalesAmount,
                expectedCostAmount: item.expectedCostAmount,
                actualSalesAmount: item.actualSalesAmount,
                actualCostAmount: item.actualCostAmount,
                expectedProfitAmount: item.expectedProfitAmount,
                actualProfitAmount: item.actualProfitAmount,
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
              payload: this.jsonPayload({
                payloadHash,
                pendingTransferCount: result.pendingTransferCount,
                integrityErrorCount: result.blockers.filter(
                  (blocker) => blocker.code === 'TRANSFER_INTEGRITY_ERROR',
                ).length,
                confirmedSupplyCount: result.confirmedSupplyCount,
                confirmedReturnCount: result.confirmedReturnCount,
                blockers: result.blockers,
                dailyCloseId: dailyClose?.id ?? null,
                dailyCloseVersion: dailyClose?.version ?? null,
              }),
              idempotencyKey: eventKey,
            },
          });

          return this.toCycleResponse(
            await this.findCycle(tx, cycle.id),
            result,
            canViewCosts,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async close(
    cycleId: string,
    dto: CloseBranchSupplyCycleDto,
    actor: CycleActor,
    idempotencyKey: string,
  ): Promise<CycleResponse> {
    this.assertAdministrativeActor(actor);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const canViewCosts = this.canViewCosts(actor);
    const eventKey = this.eventKey('CLOSE', cycleId, key);

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
            canViewCosts,
          );
          if (replay) return replay;

          if (cycle.status !== BranchSupplyCycleStatus.READY_FOR_REVIEW) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_NOT_READY',
              'Only cycles ready for review can be closed',
            );
          }
          this.assertMutableCycle(cycle, dto.expectedVersion);

          const { input, dailyClose } = await this.readReconciliationInput(
            tx,
            cycle,
          );
          const result = this.cycleReconciliation.calculate(input);
          if (!result.canClose) {
            throw new ConflictException({
              code: 'BRANCH_SUPPLY_CYCLE_CLOSING_BLOCKED',
              message: 'The CEDIS cycle has blocking reconciliation findings',
              blockers: result.blockers,
            });
          }
          if (
            dailyClose &&
            cycle.reconciledDailyCloseVersion !== null &&
            cycle.reconciledDailyCloseVersion !== dailyClose.version
          ) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_REFRESH_REQUIRED',
              'The daily close changed after the last cycle refresh',
            );
          }

          const closedDailyClose =
            dailyClose?.status === 'REVIEWED'
              ? await this.dailyCloseService.closeWithinTransaction(
                  tx,
                  dailyClose.id,
                  dailyClose.version,
                  actor,
                )
              : dailyClose;
          const nextVersion = cycle.version + 1;
          const updateResult = await tx.branchSupplyCycle.updateMany({
            where: {
              id: cycle.id,
              version: dto.expectedVersion,
              status: BranchSupplyCycleStatus.READY_FOR_REVIEW,
            },
            data: {
              version: { increment: 1 },
              status: BranchSupplyCycleStatus.CLOSED,
              pointOfSaleDailyCloseId:
                closedDailyClose?.id ?? cycle.pointOfSaleDailyCloseId,
              reconciledDailyCloseVersion: closedDailyClose?.version ?? null,
              reconciledAt: new Date(),
              closedByUserId: actor.id,
              closedAt: new Date(),
            },
          });
          if (updateResult.count !== 1) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT',
              'The branch supply cycle version is stale',
            );
          }

          const snapshotPayload = this.jsonPayload({
            cycleId: cycle.id,
            sourceVersion: cycle.version,
            targetVersion: nextVersion,
            dailyCloseId: closedDailyClose?.id ?? null,
            dailyCloseVersion: closedDailyClose?.version ?? null,
            reconciliation: result,
          });
          const snapshotHash = this.hashPayload(snapshotPayload);
          await tx.branchSupplyCycleSnapshot.create({
            data: {
              branchSupplyCycleId: cycle.id,
              sourceVersion: nextVersion,
              snapshotType: BranchSupplyCycleSnapshotType.CLOSED,
              payload: snapshotPayload,
              payloadHash: snapshotHash,
              createdByUserId: actor.id,
            },
          });
          await tx.branchSupplyCycleEvent.create({
            data: {
              branchSupplyCycleId: cycle.id,
              type: BranchSupplyCycleEventType.CLOSED,
              cycleVersion: nextVersion,
              fromStatus: BranchSupplyCycleStatus.READY_FOR_REVIEW,
              toStatus: BranchSupplyCycleStatus.CLOSED,
              actorUserId: actor.id,
              payload: this.jsonPayload({
                payloadHash,
                snapshotHash,
                dailyCloseId: closedDailyClose?.id ?? null,
                dailyCloseVersion: closedDailyClose?.version ?? null,
              }),
              idempotencyKey: eventKey,
            },
          });

          return this.toCycleResponse(
            await this.findCycle(tx, cycle.id),
            result,
            canViewCosts,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async reopen(
    cycleId: string,
    dto: ReopenBranchSupplyCycleDto,
    actor: CycleActor,
    idempotencyKey: string,
  ): Promise<CycleResponse> {
    this.assertAdministrativeActor(actor);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const canViewCosts = this.canViewCosts(actor);
    const eventKey = this.eventKey('REOPEN', cycleId, key);

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
            canViewCosts,
          );
          if (replay) return replay;
          if (cycle.status !== BranchSupplyCycleStatus.CLOSED) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_NOT_CLOSED',
              'Only closed cycles can be reopened',
            );
          }
          if (cycle.version !== dto.expectedVersion) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT',
              'The branch supply cycle version is stale',
            );
          }

          if (cycle.pointOfSaleDailyClose?.status === 'CLOSED') {
            await this.dailyCloseService.reopenWithinTransaction(
              tx,
              cycle.pointOfSaleDailyClose.id,
              cycle.pointOfSaleDailyClose.version,
              actor,
              dto.reason.trim(),
            );
          }

          const nextVersion = cycle.version + 1;
          const updateResult = await tx.branchSupplyCycle.updateMany({
            where: {
              id: cycle.id,
              version: dto.expectedVersion,
              status: BranchSupplyCycleStatus.CLOSED,
            },
            data: {
              version: { increment: 1 },
              status: BranchSupplyCycleStatus.OPEN,
              reopenedByUserId: actor.id,
              reopenedAt: new Date(),
              reopeningReason: dto.reason.trim(),
              closedByUserId: null,
              closedAt: null,
              reconciledDailyCloseVersion: null,
              reconciledAt: null,
            },
          });
          if (updateResult.count !== 1) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT',
              'The branch supply cycle version is stale',
            );
          }

          const snapshotPayload = this.jsonPayload({
            cycleId: cycle.id,
            sourceVersion: cycle.version,
            targetVersion: nextVersion,
            reason: dto.reason.trim(),
            previousStatus: cycle.status,
          });
          const snapshotHash = this.hashPayload(snapshotPayload);
          await tx.branchSupplyCycleSnapshot.create({
            data: {
              branchSupplyCycleId: cycle.id,
              sourceVersion: nextVersion,
              snapshotType: BranchSupplyCycleSnapshotType.REOPENED,
              payload: snapshotPayload,
              payloadHash: snapshotHash,
              createdByUserId: actor.id,
            },
          });
          await tx.branchSupplyCycleEvent.create({
            data: {
              branchSupplyCycleId: cycle.id,
              type: BranchSupplyCycleEventType.REOPENED,
              cycleVersion: nextVersion,
              fromStatus: BranchSupplyCycleStatus.CLOSED,
              toStatus: BranchSupplyCycleStatus.OPEN,
              actorUserId: actor.id,
              reason: dto.reason.trim(),
              payload: this.jsonPayload({ payloadHash, snapshotHash }),
              idempotencyKey: eventKey,
            },
          });

          return this.toCycleResponse(
            await this.findCycle(tx, cycle.id),
            null,
            canViewCosts,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async cancel(
    cycleId: string,
    dto: CancelBranchSupplyCycleDto,
    actor: CycleActor,
    idempotencyKey: string,
  ): Promise<CycleResponse> {
    this.assertAdministrativeActor(actor);
    const key = this.requireIdempotencyKey(idempotencyKey);
    const canViewCosts = this.canViewCosts(actor);
    const eventKey = this.eventKey('CANCEL', cycleId, key);

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
            canViewCosts,
          );
          if (replay) return replay;

          if (
            cycle.status === BranchSupplyCycleStatus.CLOSED ||
            cycle.status === BranchSupplyCycleStatus.CANCELLED
          ) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_NOT_CANCELABLE',
              'Closed or already cancelled cycles cannot be cancelled',
            );
          }
          if (cycle.version !== dto.expectedVersion) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT',
              'The branch supply cycle version is stale',
            );
          }
          if (
            cycle.pointOfSaleDailyClose &&
            cycle.pointOfSaleDailyClose.status !== 'CANCELLED'
          ) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_NOT_CANCELABLE',
              'A non-cancelled daily close is related to this cycle',
            );
          }
          if (
            cycle.transfers.some(
              ({ inventoryTransfer }) =>
                inventoryTransfer.status !== InventoryTransferStatus.CANCELLED,
            )
          ) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_NOT_CANCELABLE',
              'Every linked transfer must be cancelled first',
            );
          }

          const nextVersion = cycle.version + 1;
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
              status: BranchSupplyCycleStatus.CANCELLED,
              cancelledByUserId: actor.id,
              cancelledAt: new Date(),
              cancellationReason: dto.reason.trim(),
            },
          });
          if (updateResult.count !== 1) {
            throw this.businessConflict(
              'BRANCH_SUPPLY_CYCLE_VERSION_CONFLICT',
              'The branch supply cycle version is stale',
            );
          }

          await tx.branchSupplyCycleEvent.create({
            data: {
              branchSupplyCycleId: cycle.id,
              type: BranchSupplyCycleEventType.CANCELLED,
              cycleVersion: nextVersion,
              fromStatus: cycle.status,
              toStatus: BranchSupplyCycleStatus.CANCELLED,
              actorUserId: actor.id,
              reason: dto.reason.trim(),
              payload: this.jsonPayload({ payloadHash }),
              idempotencyKey: eventKey,
            },
          });

          return this.toCycleResponse(
            await this.findCycle(tx, cycle.id),
            null,
            canViewCosts,
          );
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
    const canViewCosts = this.canViewCosts(actor);
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
            canViewCosts,
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
              created: false,
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
            actor,
            cedisCycleTransfer: true,
          };
          const transfer = await this.inventoryTransfers.create(
            transferDto,
            actor.id,
            eventKey,
            transferOptions,
          );
          if (role === BranchSupplyTransferRole.SUPPLY) {
            await this.createInitialProductSnapshots(
              tx,
              cycle,
              transfer,
              dto,
              nextVersion,
            );
          }
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
            created: true,
            cycle: this.toCycleResponse(
              await this.findCycle(tx, cycle.id),
              null,
              canViewCosts,
            ),
            transfer,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async createInitialProductSnapshots(
    tx: Prisma.TransactionClient,
    cycle: CycleRecord,
    transfer: TransferResponse,
    dto: BranchSupplyCycleCommandDto,
    sourceCycleVersion: number,
  ): Promise<void> {
    const snapshotDelegate = (
      tx as unknown as {
        branchSupplyCycleProductSnapshot?: SnapshotDelegate;
      }
    ).branchSupplyCycleProductSnapshot;
    if (!snapshotDelegate) return;

    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    for (const productId of productIds) {
      const existing = await snapshotDelegate.findUnique({
        where: {
          branchSupplyCycleId_productId: {
            branchSupplyCycleId: cycle.id,
            productId,
          },
        },
      });
      if (existing) continue;

      const product = await tx.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          salePrice: true,
          purchaseCost: true,
        },
      });
      if (!product) continue;

      const transferItem = (transfer.items ?? []).find(
        (item) => item.productId === productId,
      );
      const unitEquivalentId =
        transferItem?.unitEquivalentId ??
        dto.items.find((item) => item.productId === productId)
          ?.unitEquivalentId ??
        null;
      const equivalent = unitEquivalentId
        ? await tx.productUnitEquivalent.findUnique({
            where: { id: unitEquivalentId },
            select: {
              unitFrom: true,
              unitTo: true,
              factor: true,
              roundingMode: true,
            },
          })
        : null;

      await snapshotDelegate.create({
        data: {
          branchSupplyCycleId: cycle.id,
          productId: product.id,
          sourceTransferId: transfer.id,
          sourceCycleVersion,
          productNameSnapshot: product.name,
          productSkuSnapshot: product.sku,
          productUnitSnapshot: product.unit,
          unitPriceSnapshot: product.salePrice,
          unitCostSnapshot: product.purchaseCost,
          unitEquivalentId,
          equivalenceFromUnitSnapshot: equivalent?.unitFrom ?? null,
          equivalenceToUnitSnapshot: equivalent?.unitTo ?? null,
          appliedEquivalentFactorSnapshot:
            transferItem?.appliedEquivalentFactor ?? equivalent?.factor ?? null,
          roundingModeSnapshot:
            transferItem?.roundingMode ?? equivalent?.roundingMode ?? null,
        },
      });
    }
  }

  private async readReconciliationInput(
    tx: Prisma.TransactionClient,
    cycle: CycleRecord,
  ): Promise<{
    input: ReconciliationInput;
    dailyClose: ReconciliationDailyClose | null;
  }> {
    const saleDelegate = (
      tx as unknown as {
        sale?: { findMany(args: unknown): Promise<SaleRecord[]> };
      }
    ).sale;
    const inventoryMovementDelegate = (
      tx as unknown as {
        inventoryMovement?: {
          findMany(args: unknown): Promise<ShrinkageRecord[]>;
        };
      }
    ).inventoryMovement;

    const salesQuery: Promise<SaleRecord[]> = saleDelegate
      ? saleDelegate.findMany({
          where: {
            locationId: cycle.branchLocationId,
            businessDate: cycle.businessDate,
            status: 'CONFIRMED',
          },
          select: {
            id: true,
            status: true,
            total: true,
            items: {
              select: {
                productId: true,
                quantityKg: true,
                quantityPieces: true,
                total: true,
                appliedEquivalentFactor: true,
                product: {
                  select: { name: true, sku: true, unit: true },
                },
                unitEquivalent: {
                  select: { unitFrom: true, unitTo: true, factor: true },
                },
              },
            },
          },
        })
      : Promise.resolve([]);
    const shrinkageQuery: Promise<ShrinkageRecord[]> = inventoryMovementDelegate
      ? (() => {
          const { from, to } = this.operationalDay(cycle.businessDate);
          return inventoryMovementDelegate.findMany({
            where: {
              locationId: cycle.branchLocationId,
              type: InventoryMovementType.SHRINKAGE,
              createdAt: { gte: from, lt: to },
            },
            select: {
              id: true,
              productId: true,
              quantityKg: true,
              quantityPieces: true,
            },
          });
        })()
      : Promise.resolve([]);
    const [sales, dailyCloseRecord, shrinkages] = await Promise.all([
      salesQuery,
      this.findDailyCloseForCycle(tx, cycle),
      shrinkageQuery,
    ]);

    const dailyClose = dailyCloseRecord
      ? this.toReconciliationDailyClose(dailyCloseRecord)
      : null;
    const input: ReconciliationInput = {
      distributionCenterLocationId: cycle.distributionCenterLocationId,
      branchLocationId: cycle.branchLocationId,
      dailyClose,
      transfers: cycle.transfers.map((link) => ({
        role: link.role,
        transfer: {
          id: link.inventoryTransfer.id,
          status: link.inventoryTransfer.status,
          originLocationId: link.inventoryTransfer.originLocationId,
          destinationLocationId: link.inventoryTransfer.destinationLocationId,
          items: link.inventoryTransfer.items.map((item) => ({
            productId: item.productId,
            productName: item.product.name,
            productSku: item.product.sku,
            productUnit: item.product.unit,
            unit: item.unit,
            quantityKg: item.quantityKg,
            quantityPieces: item.quantityPieces,
            unitEquivalentId: item.unitEquivalentId,
            appliedEquivalentFactor: item.appliedEquivalentFactor,
            roundingMode: item.roundingMode,
            equivalent: item.unitEquivalent
              ? {
                  unitFrom: item.unitEquivalent.unitFrom,
                  unitTo: item.unitEquivalent.unitTo,
                  factor: item.unitEquivalent.factor,
                }
              : null,
            productPrice: item.product.salePrice,
            productCost: item.product.purchaseCost,
          })),
          movements: link.inventoryTransfer.inventoryMovements.map(
            (movement) => ({
              productId: movement.productId,
              locationId: movement.locationId,
              type: movement.type,
              quantityKg: movement.quantityKg,
              quantityPieces: movement.quantityPieces,
            }),
          ),
        },
      })),
      sales: sales.map((sale) => ({
        id: sale.id,
        status: sale.status,
        total: sale.total,
        items: sale.items.map((item) => ({
          productId: item.productId,
          productName: item.product.name,
          productSku: item.product.sku,
          productUnit: item.product.unit,
          quantityKg: item.quantityKg,
          quantityPieces: item.quantityPieces,
          total: item.total,
          appliedEquivalentFactor: item.appliedEquivalentFactor,
          equivalent: item.unitEquivalent,
        })),
      })),
      productSnapshots: (cycle.productSnapshots ?? []).map((snapshot) => ({
        productId: snapshot.productId,
        productNameSnapshot: snapshot.productNameSnapshot,
        productSkuSnapshot: snapshot.productSkuSnapshot,
        productUnitSnapshot: snapshot.productUnitSnapshot,
        unitPriceSnapshot: snapshot.unitPriceSnapshot,
        unitCostSnapshot: snapshot.unitCostSnapshot,
        unitEquivalentId: snapshot.unitEquivalentId,
        equivalenceFromUnitSnapshot: snapshot.equivalenceFromUnitSnapshot,
        equivalenceToUnitSnapshot: snapshot.equivalenceToUnitSnapshot,
        appliedEquivalentFactorSnapshot:
          snapshot.appliedEquivalentFactorSnapshot,
        roundingModeSnapshot: snapshot.roundingModeSnapshot,
      })),
      shrinkages: shrinkages.map((movement) => ({
        id: movement.id,
        productId: movement.productId,
        quantityKg: movement.quantityKg,
        quantityPieces: movement.quantityPieces,
      })),
    };
    return { input, dailyClose };
  }

  private async findDailyCloseForCycle(
    tx: Prisma.TransactionClient,
    cycle: CycleRecord,
  ): Promise<DailyCloseRecord | null> {
    const delegate = tx.pointOfSaleDailyClose;
    const select = {
      id: true,
      version: true,
      status: true,
      grossSalesTotal: true,
      netCashExpected: true,
      cashCountedTotal: true,
      cashDifferenceTotal: true,
      payments: true,
      cashMovements: true,
      cashShifts: { select: { id: true, status: true } },
      differences: {
        select: {
          id: true,
          referenceKey: true,
          differenceValue: true,
          status: true,
        },
      },
    } as const;
    if (cycle.pointOfSaleDailyCloseId) {
      return delegate.findUnique({
        where: { id: cycle.pointOfSaleDailyCloseId },
        select,
      });
    }
    return delegate.findFirst({
      where: {
        operationalLocationId: cycle.branchLocationId,
        businessDate: cycle.businessDate,
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'desc' },
      select,
    });
  }

  private toReconciliationDailyClose(
    value: DailyCloseRecord,
  ): ReconciliationDailyClose {
    return {
      id: value.id,
      version: value.version,
      status: value.status,
      grossSalesTotal: value.grossSalesTotal,
      netCashExpected: value.netCashExpected,
      cashCountedTotal: value.cashCountedTotal,
      cashDifferenceTotal: value.cashDifferenceTotal,
      payments: value.payments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
      })),
      cashMovements: value.cashMovements.map((movement) => ({
        id: movement.id,
        type: movement.type,
        movementChannel: movement.movementChannel,
        amount: movement.amount,
        reason: movement.reason,
        reference: movement.reference,
        isOpening: movement.isOpening,
        occurredAt: movement.occurredAt,
      })),
      cashShifts: value.cashShifts.map((shift) => ({
        id: shift.id,
        status: shift.status,
      })),
      differences: value.differences.map((difference) => ({
        id: difference.id,
        referenceKey: difference.referenceKey,
        differenceValue: difference.differenceValue,
        status: difference.status,
      })),
    };
  }

  private async findIdempotentCycle(
    tx: Prisma.TransactionClient,
    eventKey: string,
    payloadHash: string,
    canViewCosts: boolean,
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
    return this.toCycleResponse(cycle, null, canViewCosts);
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

  private assertAdministrativeActor(actor: CycleActor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: 'CEDIS_ADMINISTRATIVE_ACTION_REQUIRED',
        message: 'Only an administrator can close or reopen a CEDIS cycle',
      });
    }
  }

  private canViewCosts(actor: CycleActor): boolean {
    return actor.permissions?.includes(PERMISSIONS.CEDIS_VIEW_COSTS) ?? false;
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

  private toCycleResponse(
    cycle: CycleRecord,
    reconciliation: ReconciliationResult | null = null,
    canViewCosts = true,
  ): CycleResponse {
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

    const totals: CycleResponse['totals'] = {
      suppliedKg: supplied.kg,
      suppliedPieces: supplied.pieces,
      returnedKg: returned.kg,
      returnedPieces: returned.pieces,
      netKg: supplied.kg - returned.kg,
      netPieces: supplied.pieces - returned.pieces,
      expectedSoldKg:
        reconciliation?.totals.expectedSoldKg ??
        this.toNumber(cycle.totalExpectedSoldKg),
      expectedSoldPieces:
        reconciliation?.totals.expectedSoldPieces ??
        this.toNumber(cycle.totalExpectedSoldPieces),
      actualSoldKg:
        reconciliation?.totals.actualSoldKg ??
        this.toNumber(cycle.totalActualSoldKg),
      actualSoldPieces:
        reconciliation?.totals.actualSoldPieces ??
        this.toNumber(cycle.totalActualSoldPieces),
      shrinkageKg:
        reconciliation?.totals.shrinkageKg ??
        this.toNumber(cycle.totalShrinkageKg),
      shrinkagePieces:
        reconciliation?.totals.shrinkagePieces ??
        this.toNumber(cycle.totalShrinkagePieces),
      differenceKg:
        reconciliation?.totals.differenceKg ??
        this.toNumber(cycle.totalDifferenceKg),
      differencePieces:
        reconciliation?.totals.differencePieces ??
        this.toNumber(cycle.totalDifferencePieces),
      expectedSalesTotal: this.toNumber(
        reconciliation?.totals.expectedSalesTotal ?? cycle.expectedSalesTotal,
      ),
      actualSalesTotal: this.toNumber(
        reconciliation?.totals.actualSalesTotal ?? cycle.actualSalesTotal,
      ),
      expectedCashTotal: this.toNumber(
        reconciliation?.totals.expectedCashTotal ?? cycle.expectedCashTotal,
      ),
      cashCountedTotal:
        reconciliation?.totals.cashCountedTotal !== undefined
          ? reconciliation.totals.cashCountedTotal === null
            ? null
            : this.toNumber(reconciliation.totals.cashCountedTotal)
          : cycle.cashCountedTotal === null
            ? null
            : this.toNumber(cycle.cashCountedTotal),
      cashDifferenceTotal:
        reconciliation?.totals.cashDifferenceTotal !== undefined
          ? reconciliation.totals.cashDifferenceTotal === null
            ? null
            : this.toNumber(reconciliation.totals.cashDifferenceTotal)
          : cycle.cashDifferenceTotal === null
            ? null
            : this.toNumber(cycle.cashDifferenceTotal),
      cardVoucherTotal: this.toNumber(
        reconciliation?.totals.cardVoucherTotal ?? cycle.cardVoucherTotal,
      ),
      transferTotal: this.toNumber(
        reconciliation?.totals.transferTotal ?? cycle.transferTotal,
      ),
      expenseTotal: this.toNumber(
        reconciliation?.totals.expenseTotal ?? cycle.expenseTotal,
      ),
      cashInTotal: this.toNumber(
        reconciliation?.totals.cashInTotal ?? cycle.cashInTotal,
      ),
      cashOutTotal: this.toNumber(
        reconciliation?.totals.cashOutTotal ?? cycle.cashOutTotal,
      ),
      cashAdjustmentTotal: this.toNumber(
        reconciliation?.totals.cashAdjustmentTotal ?? cycle.cashAdjustmentTotal,
      ),
    };

    if (canViewCosts) {
      Object.assign(totals, {
        expectedCostTotal: this.toNumber(
          reconciliation?.totals.expectedCostTotal ?? cycle.expectedCostTotal,
        ),
        expectedProfitTotal: this.toNumber(
          reconciliation?.totals.expectedProfitTotal ??
            cycle.expectedProfitTotal,
        ),
        actualCostTotal: this.toNumber(
          reconciliation?.totals.actualCostTotal ?? cycle.actualCostTotal,
        ),
        actualProfitTotal: this.toNumber(
          reconciliation?.totals.actualProfitTotal ?? cycle.actualProfitTotal,
        ),
        actualNetProfitTotal: this.toNumber(
          reconciliation?.totals.actualNetProfitTotal ??
            cycle.actualNetProfitTotal,
        ),
      });
    }

    const snapshots = cycle.items.map((item) => {
      if (canViewCosts) return item;
      const {
        unitCostSnapshot,
        expectedCostAmount,
        actualCostAmount,
        expectedProfitAmount,
        actualProfitAmount,
        ...publicItem
      } = item;
      void unitCostSnapshot;
      void expectedCostAmount;
      void actualCostAmount;
      void expectedProfitAmount;
      void actualProfitAmount;
      return publicItem;
    });
    const priceSnapshots = (cycle.productSnapshots ?? []).map((snapshot) => {
      if (canViewCosts) return snapshot;
      const { unitCostSnapshot, ...publicSnapshot } = snapshot;
      void unitCostSnapshot;
      return publicSnapshot;
    });

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
      totals,
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
      snapshots,
      priceSnapshots,
      closeSnapshots: cycle.reconciliationSnapshots ?? [],
      events: cycle.events,
      reconciliation,
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

  private operationalDay(businessDate: Date) {
    const from = new Date(
      Date.UTC(
        businessDate.getUTCFullYear(),
        businessDate.getUTCMonth(),
        businessDate.getUTCDate(),
        6,
      ),
    );
    return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
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

  private jsonPayload(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
