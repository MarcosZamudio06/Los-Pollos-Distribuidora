import { Injectable } from '@nestjs/common';
import { ProductUnit } from '@prisma/client';
import { Money } from '../../../../shared/money';
import { getUnresolvedDailyCloseDifferenceBlockers } from '../point-of-sale-daily-close/daily-close-difference-policy';

export type ReconciliationDecimal =
  number | string | { toString(): string } | null | undefined;

export type ReconciliationBlockerPhase = 'READY_FOR_REVIEW' | 'CLOSED';

export type ReconciliationBlocker = {
  code: string;
  message: string;
  phase: ReconciliationBlockerPhase;
  reference?: string;
};

export type ReconciliationTransferMovement = {
  productId: string;
  locationId: string;
  type: string;
  quantityKg: ReconciliationDecimal;
  quantityPieces: number | null | undefined;
};

export type ReconciliationTransferItem = {
  id?: string;
  productId: string;
  productName: string;
  productSku: string | null;
  productUnit: ProductUnit;
  unit: ProductUnit;
  quantityKg: ReconciliationDecimal;
  quantityPieces: number | null | undefined;
  unitEquivalentId: string | null | undefined;
  appliedEquivalentFactor: ReconciliationDecimal;
  roundingMode: string | null | undefined;
  equivalent?: {
    unitFrom: ProductUnit;
    unitTo: ProductUnit;
    factor: ReconciliationDecimal;
  } | null;
  productPrice?: ReconciliationDecimal;
  productCost?: ReconciliationDecimal;
};

export type ReconciliationReceiptItem = {
  transferItemId: string;
  receivedKg: ReconciliationDecimal;
  receivedPieces: number | null | undefined;
};

export type ReconciliationTransfer = {
  id: string;
  status: string;
  originLocationId: string;
  destinationLocationId: string;
  items: ReconciliationTransferItem[];
  movements: ReconciliationTransferMovement[];
  receipt?: { items: ReconciliationReceiptItem[] } | null;
};

export type ReconciliationTransferLink = {
  role: 'SUPPLY' | 'RETURN';
  transfer: ReconciliationTransfer;
};

export type ReconciliationProductSnapshot = {
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string | null;
  productUnitSnapshot: ProductUnit;
  unitPriceSnapshot: ReconciliationDecimal;
  unitCostSnapshot: ReconciliationDecimal;
  unitEquivalentId: string | null;
  equivalenceFromUnitSnapshot: ProductUnit | null;
  equivalenceToUnitSnapshot: ProductUnit | null;
  appliedEquivalentFactorSnapshot: ReconciliationDecimal;
  roundingModeSnapshot: string | null;
};

export type ReconciliationSaleItem = {
  productId: string;
  productName: string;
  productSku: string | null;
  productUnit: ProductUnit;
  quantityKg: ReconciliationDecimal;
  quantityPieces: number | null | undefined;
  total: ReconciliationDecimal;
  appliedEquivalentFactor: ReconciliationDecimal;
  equivalent?: {
    unitFrom: ProductUnit;
    unitTo: ProductUnit;
    factor: ReconciliationDecimal;
  } | null;
};

export type ReconciliationSale = {
  id: string;
  status: string;
  total: ReconciliationDecimal;
  items: ReconciliationSaleItem[];
};

export type ReconciliationPayment = {
  id: string;
  status: string;
  amount: ReconciliationDecimal;
  paymentMethod: string;
};

export type ReconciliationCashMovement = {
  id: string;
  type: string;
  movementChannel: string;
  amount: ReconciliationDecimal;
  reason: string;
  reference: string | null;
  isOpening: boolean;
  occurredAt: Date;
};

export type ReconciliationCashShift = {
  id: string;
  status: string;
};

export type ReconciliationDifference = {
  id: string;
  referenceKey: string;
  differenceValue: ReconciliationDecimal;
  status: string;
};

export type ReconciliationDailyClose = {
  id: string;
  version: number;
  status: string;
  grossSalesTotal: ReconciliationDecimal;
  netCashExpected: ReconciliationDecimal;
  cashCountedTotal: ReconciliationDecimal;
  cashDifferenceTotal: ReconciliationDecimal;
  payments: ReconciliationPayment[];
  cashMovements: ReconciliationCashMovement[];
  cashShifts: ReconciliationCashShift[];
  differences: ReconciliationDifference[];
};

export type ReconciliationShrinkage = {
  id: string;
  productId: string;
  quantityKg: ReconciliationDecimal;
  quantityPieces: number | null | undefined;
};

export type ReconciliationInput = {
  distributionCenterLocationId: string;
  branchLocationId: string;
  dailyClose: ReconciliationDailyClose | null;
  transfers: ReconciliationTransferLink[];
  sales: ReconciliationSale[];
  productSnapshots: ReconciliationProductSnapshot[];
  shrinkages: ReconciliationShrinkage[];
};

export type ReconciliationItem = {
  snapshotKey: string;
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string | null;
  productUnitSnapshot: ProductUnit;
  unitPriceSnapshot: string;
  unitCostSnapshot: string;
  unitEquivalentId: string | null;
  equivalenceFromUnitSnapshot: ProductUnit | null;
  equivalenceToUnitSnapshot: ProductUnit | null;
  appliedEquivalentFactorSnapshot: string | null;
  roundingModeSnapshot: string | null;
  deliveredKg: number;
  deliveredPieces: number;
  returnedKg: number;
  returnedPieces: number;
  expectedSoldKg: number;
  expectedSoldPieces: number;
  actualSoldKg: number;
  actualSoldPieces: number;
  shrinkageKg: number;
  shrinkagePieces: number;
  differenceKg: number;
  differencePieces: number;
  expectedSalesAmount: string;
  expectedCostAmount: string;
  actualSalesAmount: string;
  actualCostAmount: string;
  expectedProfitAmount: string;
  actualProfitAmount: string;
};

export type ReconciliationResult = {
  items: ReconciliationItem[];
  totals: {
    deliveredKg: number;
    deliveredPieces: number;
    returnedKg: number;
    returnedPieces: number;
    expectedSoldKg: number;
    expectedSoldPieces: number;
    actualSoldKg: number;
    actualSoldPieces: number;
    shrinkageKg: number;
    shrinkagePieces: number;
    differenceKg: number;
    differencePieces: number;
    expectedSalesTotal: string;
    expectedCostTotal: string;
    expectedProfitTotal: string;
    actualSalesTotal: string;
    actualCostTotal: string;
    actualProfitTotal: string;
    actualNetProfitTotal: string;
    expectedCashTotal: string;
    cashCountedTotal: string | null;
    cashDifferenceTotal: string | null;
    cardVoucherTotal: string;
    transferTotal: string;
    expenseTotal: string;
    cashInTotal: string;
    cashOutTotal: string;
    cashAdjustmentTotal: string;
  };
  confirmedSupplyCount: number;
  confirmedReturnCount: number;
  pendingTransferCount: number;
  cancelledTransferCount: number;
  blockers: ReconciliationBlocker[];
  readyForReview: boolean;
  canClose: boolean;
  cashMovements: Array<{
    id: string;
    type: string;
    movementChannel: string;
    amount: string;
    reason: string;
    reference: string | null;
    isOpening: boolean;
    occurredAt: Date;
  }>;
  differences: ReconciliationDifference[];
};

type Aggregate = {
  productId: string;
  productNameSnapshot: string;
  productSkuSnapshot: string | null;
  productUnitSnapshot: ProductUnit;
  unitPriceSnapshot: ReconciliationDecimal;
  unitCostSnapshot: ReconciliationDecimal;
  unitEquivalentId: string | null;
  equivalenceFromUnitSnapshot: ProductUnit | null;
  equivalenceToUnitSnapshot: ProductUnit | null;
  appliedEquivalentFactorSnapshot: ReconciliationDecimal;
  roundingModeSnapshot: string | null;
  deliveredKg: number;
  deliveredPieces: number;
  returnedKg: number;
  returnedPieces: number;
  deliveredValueQuantity: number;
  returnedValueQuantity: number;
  actualSoldKg: number;
  actualSoldPieces: number;
  actualValueQuantity: number;
  actualSalesAmount: Money;
  shrinkageKg: number;
  shrinkagePieces: number;
  shrinkageValueQuantity: number;
};

const READY_BLOCKER_PHASE: ReconciliationBlockerPhase = 'READY_FOR_REVIEW';
const CLOSE_BLOCKER_PHASE: ReconciliationBlockerPhase = 'CLOSED';

@Injectable()
export class BranchSupplyCycleReconciliationService {
  calculate(input: ReconciliationInput): ReconciliationResult {
    const blockers: ReconciliationBlocker[] = [];
    const snapshots = new Map(
      input.productSnapshots.map((snapshot) => [snapshot.productId, snapshot]),
    );
    const aggregates = new Map<string, Aggregate>();
    let confirmedSupplyCount = 0;
    let confirmedReturnCount = 0;
    let pendingTransferCount = 0;
    let cancelledTransferCount = 0;

    for (const snapshot of input.productSnapshots) {
      aggregates.set(snapshot.productId, this.aggregateFromSnapshot(snapshot));
    }

    for (const link of input.transfers) {
      const transfer = link.transfer;
      if (this.isPending(transfer.status)) {
        pendingTransferCount += 1;
        this.addBlocker(
          blockers,
          'TRANSFER_PENDING',
          'There are inventory transfers pending confirmation.',
          READY_BLOCKER_PHASE,
          transfer.id,
        );
        continue;
      }
      if (transfer.status === 'CANCELLED') {
        cancelledTransferCount += 1;
        continue;
      }
      if (transfer.status !== 'CONFIRMED') {
        this.addBlocker(
          blockers,
          'TRANSFER_STATE_INVALID',
          'A linked transfer has an unsupported state.',
          READY_BLOCKER_PHASE,
          transfer.id,
        );
        continue;
      }

      if (link.role === 'SUPPLY') confirmedSupplyCount += 1;
      else confirmedReturnCount += 1;

      if (
        !this.transferHasIntegrity(
          transfer,
          link.role,
          input.distributionCenterLocationId,
          input.branchLocationId,
          blockers,
        )
      ) {
        this.addBlocker(
          blockers,
          'TRANSFER_INTEGRITY_ERROR',
          'A confirmed transfer does not match its inventory movements.',
          READY_BLOCKER_PHASE,
          transfer.id,
        );
      }

      for (const item of transfer.items) {
        const aggregate = this.aggregateForItem(
          aggregates,
          snapshots,
          item.productId,
          item.productName,
          item.productSku,
          item.productUnit,
          item.productPrice,
          item.productCost,
          blockers,
        );
        const receiptItem =
          link.role === 'SUPPLY' && transfer.receipt
            ? transfer.receipt.items.find(
                (candidate) => candidate.transferItemId === item.id,
              )
            : null;
        const quantity = this.physicalQuantity(
          receiptItem?.receivedKg ??
            (link.role === 'SUPPLY' && transfer.receipt ? 0 : item.quantityKg),
          receiptItem?.receivedPieces ??
            (link.role === 'SUPPLY' && transfer.receipt
              ? 0
              : item.quantityPieces),
          item.productId,
          blockers,
        );
        const valueQuantity = this.valuationQuantity(
          item.productUnit,
          quantity.kg,
          quantity.pieces,
          item.appliedEquivalentFactor,
          item.equivalent,
          item.productId,
          blockers,
        );
        if (link.role === 'SUPPLY') {
          aggregate.deliveredKg += quantity.kg;
          aggregate.deliveredPieces += quantity.pieces;
          aggregate.deliveredValueQuantity += valueQuantity;
        } else {
          aggregate.returnedKg += quantity.kg;
          aggregate.returnedPieces += quantity.pieces;
          aggregate.returnedValueQuantity += valueQuantity;
        }
      }
    }

    if (confirmedSupplyCount === 0) {
      this.addBlocker(
        blockers,
        'NO_CONFIRMED_SUPPLY',
        'At least one confirmed supply is required.',
        READY_BLOCKER_PHASE,
      );
    }

    for (const sale of input.sales) {
      if (sale.status !== 'CONFIRMED') continue;
      for (const item of sale.items) {
        const aggregate = this.aggregateForItem(
          aggregates,
          snapshots,
          item.productId,
          item.productName,
          item.productSku,
          item.productUnit,
          undefined,
          undefined,
          blockers,
        );
        const quantity = this.physicalQuantity(
          item.quantityKg,
          item.quantityPieces,
          item.productId,
          blockers,
        );
        aggregate.actualSoldKg += quantity.kg;
        aggregate.actualSoldPieces += quantity.pieces;
        aggregate.actualValueQuantity += this.valuationQuantity(
          item.productUnit,
          quantity.kg,
          quantity.pieces,
          item.appliedEquivalentFactor,
          item.equivalent,
          item.productId,
          blockers,
        );
        aggregate.actualSalesAmount = aggregate.actualSalesAmount.add(
          Money.from(item.total),
        );
      }
    }

    for (const shrinkage of input.shrinkages) {
      const snapshot = snapshots.get(shrinkage.productId);
      const aggregate = this.aggregateForItem(
        aggregates,
        snapshots,
        shrinkage.productId,
        snapshot?.productNameSnapshot ?? shrinkage.productId,
        snapshot?.productSkuSnapshot ?? null,
        snapshot?.productUnitSnapshot ?? ProductUnit.KG,
        undefined,
        undefined,
        blockers,
      );
      const quantity = this.physicalQuantity(
        shrinkage.quantityKg,
        shrinkage.quantityPieces,
        shrinkage.productId,
        blockers,
      );
      aggregate.shrinkageKg += quantity.kg;
      aggregate.shrinkagePieces += quantity.pieces;
      aggregate.shrinkageValueQuantity += this.valuationQuantity(
        aggregate.productUnitSnapshot,
        quantity.kg,
        quantity.pieces,
        aggregate.appliedEquivalentFactorSnapshot,
        aggregate.equivalenceFromUnitSnapshot &&
          aggregate.equivalenceToUnitSnapshot
          ? {
              unitFrom: aggregate.equivalenceFromUnitSnapshot,
              unitTo: aggregate.equivalenceToUnitSnapshot,
              factor: aggregate.appliedEquivalentFactorSnapshot,
            }
          : null,
        shrinkage.productId,
        blockers,
      );
    }

    const items = [...aggregates.values()]
      .sort((left, right) =>
        left.productNameSnapshot.localeCompare(right.productNameSnapshot),
      )
      .map((aggregate) => this.calculateItem(aggregate, blockers));

    const dailyClose = input.dailyClose;
    const actualSalesFromItems = Money.sum(
      items.map((item) => item.actualSalesAmount),
    );
    const actualSalesTotal = dailyClose
      ? Money.from(dailyClose.grossSalesTotal)
      : actualSalesFromItems;
    if (dailyClose && actualSalesFromItems.compare(actualSalesTotal) !== 0) {
      this.addBlocker(
        blockers,
        'DAILY_CLOSE_SALES_MISMATCH',
        'Confirmed sales do not match the daily close sales total.',
        CLOSE_BLOCKER_PHASE,
      );
    }

    const expectedSalesTotal = Money.sum(
      items.map((item) => item.expectedSalesAmount),
    );
    const expectedCostTotal = Money.sum(
      items.map((item) => item.expectedCostAmount),
    );
    const expectedProfitTotal = expectedSalesTotal.subtract(expectedCostTotal);
    const actualCostTotal = Money.sum(
      items.map((item) => item.actualCostAmount),
    );
    const actualProfitTotal = actualSalesTotal.subtract(actualCostTotal);

    const cashMovements = (dailyClose?.cashMovements ?? []).map((movement) => ({
      id: movement.id,
      type: movement.type,
      movementChannel: movement.movementChannel,
      amount: Money.from(movement.amount).toString(),
      reason: movement.reason,
      reference: movement.reference,
      isOpening: movement.isOpening,
      occurredAt: movement.occurredAt,
    }));
    const expenseTotal = Money.sum(
      (dailyClose?.cashMovements ?? [])
        .filter((movement) => movement.type === 'EXPENSE')
        .map((movement) => movement.amount),
    );
    const cashInTotal = Money.sum(
      (dailyClose?.cashMovements ?? [])
        .filter(
          (movement) =>
            movement.type === 'CASH_IN' &&
            movement.movementChannel === 'CASH' &&
            !movement.isOpening,
        )
        .map((movement) => movement.amount),
    );
    const cashOutTotal = Money.sum(
      (dailyClose?.cashMovements ?? [])
        .filter(
          (movement) =>
            movement.type === 'CASH_OUT' &&
            movement.movementChannel === 'CASH' &&
            !movement.isOpening,
        )
        .map((movement) => movement.amount),
    );
    const cashAdjustmentTotal = Money.sum(
      (dailyClose?.cashMovements ?? [])
        .filter(
          (movement) =>
            movement.type === 'ADJUSTMENT' &&
            movement.movementChannel === 'CASH' &&
            !movement.isOpening,
        )
        .map((movement) => movement.amount),
    );
    const cardVoucherTotal = Money.sum(
      (dailyClose?.payments ?? [])
        .filter(
          (payment) =>
            payment.status === 'APPLIED' &&
            (payment.paymentMethod === 'CARD' ||
              payment.paymentMethod === 'VOUCHER'),
        )
        .map((payment) => payment.amount),
    );
    const transferTotal = Money.sum(
      (dailyClose?.payments ?? [])
        .filter(
          (payment) =>
            payment.status === 'APPLIED' &&
            (payment.paymentMethod === 'TRANSFER' ||
              payment.paymentMethod === 'DEPOSIT'),
        )
        .map((payment) => payment.amount),
    );

    if (!dailyClose) {
      this.addBlocker(
        blockers,
        'DAILY_CLOSE_REQUIRED',
        'A daily close is required for the branch and business date.',
        CLOSE_BLOCKER_PHASE,
      );
    } else {
      if (dailyClose.status !== 'REVIEWED' && dailyClose.status !== 'CLOSED') {
        this.addBlocker(
          blockers,
          'DAILY_CLOSE_NOT_CLOSED',
          'The daily close must be REVIEWED before the CEDIS cycle can close.',
          CLOSE_BLOCKER_PHASE,
        );
      }
      if (dailyClose.cashShifts.some((shift) => shift.status === 'OPEN')) {
        this.addBlocker(
          blockers,
          'CASH_SHIFT_OPEN',
          'All cash shifts must be closed before the CEDIS cycle can close.',
          CLOSE_BLOCKER_PHASE,
        );
      }
      if (
        dailyClose.cashCountedTotal === null ||
        dailyClose.cashCountedTotal === undefined
      ) {
        this.addBlocker(
          blockers,
          'CASH_COUNT_REQUIRED',
          'A cash count is required before the CEDIS cycle can close.',
          CLOSE_BLOCKER_PHASE,
        );
      }
      for (const difference of getUnresolvedDailyCloseDifferenceBlockers(
        dailyClose.differences,
      ))
        this.addBlocker(
          blockers,
          difference.code,
          'Mandatory daily close differences must be justified and authorized.',
          CLOSE_BLOCKER_PHASE,
          difference.referenceKey,
        );
    }

    const shrinkageCost = Money.sum(
      items.map((item) => {
        const aggregate = aggregates.get(item.productId);
        return Money.from(item.unitCostSnapshot).multiply(
          aggregate?.shrinkageValueQuantity ?? 0,
        );
      }),
    );
    const actualNetProfitTotal = actualProfitTotal
      .subtract(expenseTotal)
      .subtract(shrinkageCost);
    const cashCountedTotal = dailyClose
      ? this.optionalMoney(dailyClose.cashCountedTotal)
      : null;
    const cashDifferenceTotal = dailyClose
      ? this.optionalMoney(
          dailyClose.cashDifferenceTotal ??
            (cashCountedTotal === null
              ? null
              : Money.from(cashCountedTotal)
                  .subtract(dailyClose.netCashExpected)
                  .toString()),
        )
      : null;

    for (const item of items) {
      if (
        item.expectedSoldKg < 0 ||
        item.expectedSoldPieces < 0 ||
        item.differenceKg < 0 ||
        item.differencePieces < 0
      ) {
        this.addBlocker(
          blockers,
          'NEGATIVE_QUANTITY',
          'The reconciliation contains a negative physical quantity.',
          CLOSE_BLOCKER_PHASE,
          item.productId,
        );
      }
      const authorizedDifferenceKeys = new Set(
        (dailyClose?.differences ?? [])
          .filter((difference) => difference.status === 'AUTHORIZED')
          .map((difference) => difference.referenceKey),
      );
      if (
        (Math.abs(item.differenceKg) >= 0.0005 &&
          !authorizedDifferenceKeys.has(`${item.productId}:KG`)) ||
        (Math.abs(item.differencePieces) >= 0.0005 &&
          !authorizedDifferenceKeys.has(`${item.productId}:PIECE`))
      ) {
        this.addBlocker(
          blockers,
          'CYCLE_DIFFERENCE_UNEXPLAINED',
          'Every non-zero product difference must be justified and authorized.',
          CLOSE_BLOCKER_PHASE,
          item.productId,
        );
      }
    }

    const readyForReview = !blockers.some(
      (blocker) => blocker.phase === READY_BLOCKER_PHASE,
    );
    const canClose = blockers.length === 0;

    return {
      items,
      totals: {
        deliveredKg: this.sum(items, 'deliveredKg'),
        deliveredPieces: this.sum(items, 'deliveredPieces'),
        returnedKg: this.sum(items, 'returnedKg'),
        returnedPieces: this.sum(items, 'returnedPieces'),
        expectedSoldKg: this.sum(items, 'expectedSoldKg'),
        expectedSoldPieces: this.sum(items, 'expectedSoldPieces'),
        actualSoldKg: this.sum(items, 'actualSoldKg'),
        actualSoldPieces: this.sum(items, 'actualSoldPieces'),
        shrinkageKg: this.sum(items, 'shrinkageKg'),
        shrinkagePieces: this.sum(items, 'shrinkagePieces'),
        differenceKg: this.sum(items, 'differenceKg'),
        differencePieces: this.sum(items, 'differencePieces'),
        expectedSalesTotal: expectedSalesTotal.toString(),
        expectedCostTotal: expectedCostTotal.toString(),
        expectedProfitTotal: expectedProfitTotal.toString(),
        actualSalesTotal: actualSalesTotal.toString(),
        actualCostTotal: actualCostTotal.toString(),
        actualProfitTotal: actualProfitTotal.toString(),
        actualNetProfitTotal: actualNetProfitTotal.toString(),
        expectedCashTotal: Money.from(dailyClose?.netCashExpected).toString(),
        cashCountedTotal,
        cashDifferenceTotal,
        cardVoucherTotal: cardVoucherTotal.toString(),
        transferTotal: transferTotal.toString(),
        expenseTotal: expenseTotal.toString(),
        cashInTotal: cashInTotal.toString(),
        cashOutTotal: cashOutTotal.toString(),
        cashAdjustmentTotal: cashAdjustmentTotal.toString(),
      },
      confirmedSupplyCount,
      confirmedReturnCount,
      pendingTransferCount,
      cancelledTransferCount,
      blockers,
      readyForReview,
      canClose,
      cashMovements,
      differences: dailyClose?.differences ?? [],
    };
  }

  private aggregateFromSnapshot(
    snapshot: ReconciliationProductSnapshot,
  ): Aggregate {
    return {
      productId: snapshot.productId,
      productNameSnapshot: snapshot.productNameSnapshot,
      productSkuSnapshot: snapshot.productSkuSnapshot,
      productUnitSnapshot: snapshot.productUnitSnapshot,
      unitPriceSnapshot: snapshot.unitPriceSnapshot,
      unitCostSnapshot: snapshot.unitCostSnapshot,
      unitEquivalentId: snapshot.unitEquivalentId,
      equivalenceFromUnitSnapshot: snapshot.equivalenceFromUnitSnapshot,
      equivalenceToUnitSnapshot: snapshot.equivalenceToUnitSnapshot,
      appliedEquivalentFactorSnapshot: snapshot.appliedEquivalentFactorSnapshot,
      roundingModeSnapshot: snapshot.roundingModeSnapshot,
      deliveredKg: 0,
      deliveredPieces: 0,
      returnedKg: 0,
      returnedPieces: 0,
      deliveredValueQuantity: 0,
      returnedValueQuantity: 0,
      actualSoldKg: 0,
      actualSoldPieces: 0,
      actualValueQuantity: 0,
      actualSalesAmount: Money.zero(),
      shrinkageKg: 0,
      shrinkagePieces: 0,
      shrinkageValueQuantity: 0,
    };
  }

  private aggregateForItem(
    aggregates: Map<string, Aggregate>,
    snapshots: Map<string, ReconciliationProductSnapshot>,
    productId: string,
    productName: string,
    productSku: string | null,
    productUnit: ProductUnit,
    productPrice: ReconciliationDecimal,
    productCost: ReconciliationDecimal,
    blockers: ReconciliationBlocker[],
  ): Aggregate {
    const existing = aggregates.get(productId);
    if (existing) return existing;
    const snapshot = snapshots.get(productId);
    if (!snapshot) {
      this.addBlocker(
        blockers,
        'PRODUCT_SNAPSHOT_MISSING',
        'A product used by the reconciliation has no first-supply snapshot.',
        CLOSE_BLOCKER_PHASE,
        productId,
      );
    }
    const aggregate = this.aggregateFromSnapshot(
      snapshot ?? {
        productId,
        productNameSnapshot: productName,
        productSkuSnapshot: productSku,
        productUnitSnapshot: productUnit,
        unitPriceSnapshot: productPrice ?? 0,
        unitCostSnapshot: productCost ?? 0,
        unitEquivalentId: null,
        equivalenceFromUnitSnapshot: null,
        equivalenceToUnitSnapshot: null,
        appliedEquivalentFactorSnapshot: null,
        roundingModeSnapshot: null,
      },
    );
    aggregates.set(productId, aggregate);
    return aggregate;
  }

  private calculateItem(
    aggregate: Aggregate,
    blockers: ReconciliationBlocker[],
  ): ReconciliationItem {
    const expectedSoldKg = aggregate.deliveredKg - aggregate.returnedKg;
    const expectedSoldPieces =
      aggregate.deliveredPieces - aggregate.returnedPieces;
    const differenceKg =
      expectedSoldKg - aggregate.actualSoldKg - aggregate.shrinkageKg;
    const differencePieces =
      expectedSoldPieces -
      aggregate.actualSoldPieces -
      aggregate.shrinkagePieces;
    const price = Money.from(aggregate.unitPriceSnapshot);
    const cost = Money.from(aggregate.unitCostSnapshot);
    const expectedSalesQuantity = Math.max(
      aggregate.deliveredValueQuantity - aggregate.returnedValueQuantity,
      0,
    );
    const expectedSalesAmount = price.multiply(expectedSalesQuantity);
    const expectedCostAmount = cost.multiply(aggregate.deliveredValueQuantity);
    const actualCostAmount = cost.multiply(aggregate.actualValueQuantity);
    const actualProfitAmount =
      aggregate.actualSalesAmount.subtract(actualCostAmount);

    if (!this.isValidPrice(aggregate.unitPriceSnapshot)) {
      this.addBlocker(
        blockers,
        'PRODUCT_PRICE_INVALID',
        'Every product in the cycle must have a positive price snapshot.',
        CLOSE_BLOCKER_PHASE,
        aggregate.productId,
      );
    }
    if (!this.isValidCost(aggregate.unitCostSnapshot)) {
      this.addBlocker(
        blockers,
        'PRODUCT_COST_INVALID',
        'Every product in the cycle must have a non-negative cost snapshot.',
        CLOSE_BLOCKER_PHASE,
        aggregate.productId,
      );
    }

    return {
      snapshotKey: aggregate.productId,
      productId: aggregate.productId,
      productNameSnapshot: aggregate.productNameSnapshot,
      productSkuSnapshot: aggregate.productSkuSnapshot,
      productUnitSnapshot: aggregate.productUnitSnapshot,
      unitPriceSnapshot: Money.from(aggregate.unitPriceSnapshot).toString(),
      unitCostSnapshot: Money.from(aggregate.unitCostSnapshot).toString(),
      unitEquivalentId: aggregate.unitEquivalentId,
      equivalenceFromUnitSnapshot: aggregate.equivalenceFromUnitSnapshot,
      equivalenceToUnitSnapshot: aggregate.equivalenceToUnitSnapshot,
      appliedEquivalentFactorSnapshot: aggregate.appliedEquivalentFactorSnapshot
        ? String(aggregate.appliedEquivalentFactorSnapshot)
        : null,
      roundingModeSnapshot: aggregate.roundingModeSnapshot,
      deliveredKg: aggregate.deliveredKg,
      deliveredPieces: aggregate.deliveredPieces,
      returnedKg: aggregate.returnedKg,
      returnedPieces: aggregate.returnedPieces,
      expectedSoldKg,
      expectedSoldPieces,
      actualSoldKg: aggregate.actualSoldKg,
      actualSoldPieces: aggregate.actualSoldPieces,
      shrinkageKg: aggregate.shrinkageKg,
      shrinkagePieces: aggregate.shrinkagePieces,
      differenceKg,
      differencePieces,
      expectedSalesAmount: expectedSalesAmount.toString(),
      expectedCostAmount: expectedCostAmount.toString(),
      actualSalesAmount: aggregate.actualSalesAmount.toString(),
      actualCostAmount: actualCostAmount.toString(),
      expectedProfitAmount: expectedSalesAmount
        .subtract(expectedCostAmount)
        .toString(),
      actualProfitAmount: actualProfitAmount.toString(),
    };
  }

  private physicalQuantity(
    quantityKg: ReconciliationDecimal,
    quantityPieces: number | null | undefined,
    productId: string,
    blockers: ReconciliationBlocker[],
  ) {
    const kg = this.quantityNumber(quantityKg, productId, blockers);
    const pieces = this.quantityNumber(quantityPieces, productId, blockers);
    if (!Number.isInteger(pieces)) {
      this.addBlocker(
        blockers,
        'PIECES_NOT_INTEGER',
        'Piece quantities must be integers.',
        CLOSE_BLOCKER_PHASE,
        productId,
      );
    }
    if (kg < 0 || pieces < 0) {
      this.addBlocker(
        blockers,
        'NEGATIVE_QUANTITY',
        'Inventory, sales, and shrinkage quantities cannot be negative.',
        CLOSE_BLOCKER_PHASE,
        productId,
      );
    }
    return { kg, pieces };
  }

  private valuationQuantity(
    unit: ProductUnit,
    kg: number,
    pieces: number,
    appliedFactor: ReconciliationDecimal,
    equivalent:
      | {
          unitFrom: ProductUnit;
          unitTo: ProductUnit;
          factor: ReconciliationDecimal;
        }
      | null
      | undefined,
    productId: string,
    blockers: ReconciliationBlocker[],
  ): number {
    if (unit === ProductUnit.KG) return kg;
    if (unit === ProductUnit.PIECE) return pieces;
    if (kg > 0) return kg;
    if (pieces === 0) return 0;

    const factor = this.numberValue(appliedFactor ?? equivalent?.factor);
    if (!Number.isFinite(factor) || factor <= 0 || !equivalent) {
      this.addBlocker(
        blockers,
        'EQUIVALENCE_NOT_APPLICABLE',
        'A KG_AND_PIECE quantity requires an applicable KG/PIECE equivalence.',
        CLOSE_BLOCKER_PHASE,
        productId,
      );
      return 0;
    }
    if (
      equivalent.unitFrom === ProductUnit.PIECE &&
      equivalent.unitTo === ProductUnit.KG
    ) {
      return pieces * factor;
    }
    if (
      equivalent.unitFrom === ProductUnit.KG &&
      equivalent.unitTo === ProductUnit.PIECE
    ) {
      return pieces / factor;
    }
    this.addBlocker(
      blockers,
      'EQUIVALENCE_NOT_APPLICABLE',
      'The equivalence must convert KG and PIECE.',
      CLOSE_BLOCKER_PHASE,
      productId,
    );
    return 0;
  }

  private transferHasIntegrity(
    transfer: ReconciliationTransfer,
    role: 'SUPPLY' | 'RETURN',
    cedisId: string,
    branchId: string,
    blockers: ReconciliationBlocker[],
  ): boolean {
    const expectedOrigin = role === 'SUPPLY' ? cedisId : branchId;
    const expectedDestination = role === 'SUPPLY' ? branchId : cedisId;
    if (
      transfer.originLocationId !== expectedOrigin ||
      transfer.destinationLocationId !== expectedDestination
    ) {
      return false;
    }
    const expected = new Map<
      string,
      { kg: number; pieces: number; count: number }
    >();
    const movementProductIds = new Set<string>();
    for (const item of transfer.items) {
      const current = expected.get(item.productId) ?? {
        kg: 0,
        pieces: 0,
        count: 0,
      };
      const quantity = this.physicalQuantity(
        item.quantityKg,
        item.quantityPieces,
        item.productId,
        blockers,
      );
      current.kg += quantity.kg;
      current.pieces += quantity.pieces;
      current.count += 1;
      expected.set(item.productId, current);
    }
    for (const movement of transfer.movements) {
      if (movement.type !== 'TRANSFER_OUT' && movement.type !== 'TRANSFER_IN')
        return false;
      if (
        (movement.type === 'TRANSFER_OUT' &&
          movement.locationId !== transfer.originLocationId) ||
        (movement.type === 'TRANSFER_IN' &&
          movement.locationId !== transfer.destinationLocationId)
      )
        return false;
      const quantity = this.physicalQuantity(
        movement.quantityKg,
        movement.quantityPieces,
        movement.productId,
        blockers,
      );
      const movementKey = `${movement.type}:${movement.productId}`;
      movementProductIds.add(movement.productId);
      const current = expected.get(movementKey) ?? {
        kg: 0,
        pieces: 0,
        count: 0,
      };
      current.kg += quantity.kg;
      current.pieces += quantity.pieces;
      current.count += 1;
      expected.set(movementKey, current);
    }
    const itemProductIds = new Set(
      transfer.items.map((item) => item.productId),
    );
    if (
      [...movementProductIds].some(
        (productId) => !itemProductIds.has(productId),
      )
    ) {
      return false;
    }
    for (const productId of itemProductIds) {
      const itemTotals = transfer.items
        .filter((item) => item.productId === productId)
        .reduce(
          (total, item) => {
            const quantity = this.physicalQuantity(
              item.quantityKg,
              item.quantityPieces,
              item.productId,
              blockers,
            );
            return {
              kg: total.kg + quantity.kg,
              pieces: total.pieces + quantity.pieces,
              count: total.count + 1,
            };
          },
          { kg: 0, pieces: 0, count: 0 },
        );
      const incomingItemTotals = transfer.items
        .filter((item) => item.productId === productId)
        .reduce(
          (total, item) => {
            const receiptItem =
              role === 'SUPPLY' && transfer.receipt
                ? transfer.receipt.items.find(
                    (candidate) => candidate.transferItemId === item.id,
                  )
                : null;
            if (role === 'SUPPLY' && transfer.receipt && !receiptItem) {
              return total;
            }
            const quantity = this.physicalQuantity(
              receiptItem?.receivedKg ?? item.quantityKg,
              receiptItem?.receivedPieces ?? item.quantityPieces,
              item.productId,
              blockers,
            );
            return {
              kg: total.kg + quantity.kg,
              pieces: total.pieces + quantity.pieces,
              count: total.count + 1,
            };
          },
          { kg: 0, pieces: 0, count: 0 },
        );

      for (const type of ['TRANSFER_OUT', 'TRANSFER_IN']) {
        const movementTotals = expected.get(`${type}:${productId}`) ?? {
          kg: 0,
          pieces: 0,
          count: 0,
        };
        const expectedTotals =
          type === 'TRANSFER_IN' && role === 'SUPPLY'
            ? incomingItemTotals
            : itemTotals;
        if (
          movementTotals.count !== expectedTotals.count ||
          !this.sameQuantity(movementTotals.kg, expectedTotals.kg) ||
          movementTotals.pieces !== expectedTotals.pieces
        )
          return false;
      }
    }
    return transfer.items.length > 0 && cedisId !== branchId;
  }

  private sameQuantity(left: number, right: number): boolean {
    return Math.abs(left - right) < 0.0005;
  }

  private isPending(status: string): boolean {
    return (
      status === 'DRAFT' || status === 'REQUESTED' || status === 'IN_TRANSIT'
    );
  }

  private quantityNumber(
    value: ReconciliationDecimal,
    productId: string,
    blockers: ReconciliationBlocker[],
  ): number {
    const result = this.numberValue(value);
    if (!Number.isFinite(result)) {
      this.addBlocker(
        blockers,
        'INVALID_QUANTITY',
        'All physical quantities must be finite numbers.',
        CLOSE_BLOCKER_PHASE,
        productId,
      );
      return 0;
    }
    return result;
  }

  private numberValue(value: ReconciliationDecimal): number {
    return Number(value ?? 0);
  }

  private optionalMoney(value: ReconciliationDecimal): string | null {
    return value === null || value === undefined
      ? null
      : Money.from(value).toString();
  }

  private isZero(value: ReconciliationDecimal): boolean {
    return Math.abs(this.numberValue(value)) < 0.0005;
  }

  private isValidPrice(value: ReconciliationDecimal): boolean {
    const number = this.numberValue(value);
    return Number.isFinite(number) && number > 0;
  }

  private isValidCost(value: ReconciliationDecimal): boolean {
    const number = this.numberValue(value);
    return Number.isFinite(number) && number >= 0;
  }

  private sum(
    items: ReconciliationItem[],
    key:
      | 'deliveredKg'
      | 'deliveredPieces'
      | 'returnedKg'
      | 'returnedPieces'
      | 'expectedSoldKg'
      | 'expectedSoldPieces'
      | 'actualSoldKg'
      | 'actualSoldPieces'
      | 'shrinkageKg'
      | 'shrinkagePieces'
      | 'differenceKg'
      | 'differencePieces',
  ): number {
    return items.reduce((total, item) => total + item[key], 0);
  }

  private addBlocker(
    blockers: ReconciliationBlocker[],
    code: string,
    message: string,
    phase: ReconciliationBlockerPhase,
    reference?: string,
  ): void {
    if (
      blockers.some(
        (blocker) => blocker.code === code && blocker.reference === reference,
      )
    )
      return;
    blockers.push({ code, message, phase, reference });
  }
}
