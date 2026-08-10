import { Money, type DecimalInput } from '../../../../shared/money';

type CashShiftStateInput = {
  id: string;
  terminalId: string;
  status: string;
  openedAt: Date;
  createdAt: Date;
  initialCashFund: DecimalInput | null | undefined;
  initialCashIn: DecimalInput | null | undefined;
  initialCashOut: DecimalInput | null | undefined;
  cashCountedTotal: DecimalInput | null | undefined;
};

type CashPaymentStateInput = {
  cashShiftId: string | null | undefined;
  paymentMethod: string;
  status: string;
  amount: DecimalInput | null | undefined;
};

type CashMovementStateInput = {
  cashShiftId: string | null | undefined;
  type: string;
  movementChannel: string;
  isOpening: boolean;
  amount: DecimalInput | null | undefined;
};

export function calculateCashTerminalState(input: {
  shifts: CashShiftStateInput[];
  payments: CashPaymentStateInput[];
  movements: CashMovementStateInput[];
}) {
  const latestByTerminal = new Map<string, CashShiftStateInput>();

  for (const shift of input.shifts) {
    if (shift.status === 'CANCELLED') continue;
    const current = latestByTerminal.get(shift.terminalId);
    if (!current || isLaterShift(shift, current)) {
      latestByTerminal.set(shift.terminalId, shift);
    }
  }

  const selectedShifts = [...latestByTerminal.values()].sort((left, right) =>
    left.terminalId.localeCompare(right.terminalId),
  );
  const selectedShiftIds = new Set(selectedShifts.map((shift) => shift.id));
  const openingCash = Money.sum(
    selectedShifts.map((shift) =>
      Money.from(shift.initialCashFund)
        .add(shift.initialCashIn)
        .subtract(shift.initialCashOut),
    ),
  );
  const cashPayments = Money.sum(
    input.payments
      .filter(
        (payment) =>
          payment.cashShiftId !== null &&
          payment.cashShiftId !== undefined &&
          selectedShiftIds.has(payment.cashShiftId) &&
          payment.status === 'APPLIED' &&
          payment.paymentMethod === 'CASH',
      )
      .map((payment) => payment.amount),
  );
  let movementImpact = Money.zero();
  for (const movement of input.movements) {
    if (
      movement.cashShiftId === null ||
      movement.cashShiftId === undefined ||
      !selectedShiftIds.has(movement.cashShiftId) ||
      movement.isOpening ||
      movement.movementChannel !== 'CASH'
    ) {
      continue;
    }
    if (movement.type === 'CASH_IN') {
      movementImpact = movementImpact.add(movement.amount);
    } else if (
      movement.type === 'CASH_OUT' ||
      movement.type === 'ADJUSTMENT' ||
      movement.type === 'EXPENSE'
    ) {
      movementImpact = movementImpact.subtract(movement.amount);
    }
  }

  const expectedCash = openingCash.add(cashPayments).add(movementImpact);
  const openShiftCount = selectedShifts.filter(
    (shift) => shift.status === 'OPEN',
  ).length;
  const allSelectedClosed = selectedShifts.every(
    (shift) => shift.status === 'CLOSED' && shift.cashCountedTotal !== null,
  );
  const countedCash = allSelectedClosed
    ? Money.sum(selectedShifts.map((shift) => shift.cashCountedTotal))
    : null;

  return {
    hasShiftRecords: input.shifts.length > 0,
    selectedShiftIds: selectedShifts.map((shift) => shift.id),
    terminalCount: selectedShifts.length,
    openShiftCount,
    openingCash: Number(openingCash.toString()),
    expectedCash: Number(expectedCash.toString()),
    cashCountedTotal:
      countedCash === null ? null : Number(countedCash.toString()),
    cashDifferenceTotal:
      countedCash === null
        ? null
        : Number(countedCash.subtract(expectedCash).toString()),
  };
}

function isLaterShift(
  candidate: CashShiftStateInput,
  current: CashShiftStateInput,
) {
  const openedAtDifference =
    candidate.openedAt.getTime() - current.openedAt.getTime();
  if (openedAtDifference !== 0) return openedAtDifference > 0;

  const createdAtDifference =
    candidate.createdAt.getTime() - current.createdAt.getTime();
  if (createdAtDifference !== 0) return createdAtDifference > 0;

  return candidate.id > current.id;
}
