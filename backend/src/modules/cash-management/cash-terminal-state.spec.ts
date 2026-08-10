import { calculateCashTerminalState } from './cash-terminal-state';

const shift = (
  overrides: Partial<
    Parameters<typeof calculateCashTerminalState>[0]['shifts'][number]
  >,
) => ({
  id: 'shift-1',
  terminalId: 'terminal-1',
  status: 'CLOSED',
  openedAt: new Date('2026-08-04T08:00:00.000Z'),
  createdAt: new Date('2026-08-04T08:00:00.000Z'),
  initialCashFund: 0,
  initialCashIn: 0,
  initialCashOut: 0,
  cashCountedTotal: 0,
  ...overrides,
});

describe('calculateCashTerminalState', () => {
  it('uses only the latest sequential shift physical state for one terminal', () => {
    const result = calculateCashTerminalState({
      shifts: [
        shift({ id: 'shift-1', cashCountedTotal: 6000 }),
        shift({
          id: 'shift-2',
          openedAt: new Date('2026-08-04T14:00:00.000Z'),
          createdAt: new Date('2026-08-04T14:00:00.000Z'),
          initialCashFund: 6000,
          cashCountedTotal: 6200,
        }),
      ],
      payments: [
        {
          cashShiftId: 'shift-1',
          paymentMethod: 'CASH',
          status: 'APPLIED',
          amount: 6000,
        },
        {
          cashShiftId: 'shift-2',
          paymentMethod: 'CASH',
          status: 'APPLIED',
          amount: 200,
        },
      ],
      movements: [],
    });

    expect(result).toMatchObject({
      selectedShiftIds: ['shift-2'],
      terminalCount: 1,
      openShiftCount: 0,
      openingCash: 6000,
      expectedCash: 6200,
      cashCountedTotal: 6200,
      cashDifferenceTotal: 0,
    });
  });

  it('sums the latest state of each parallel terminal', () => {
    const result = calculateCashTerminalState({
      shifts: [
        shift({ id: 'terminal-1-old', cashCountedTotal: 6000 }),
        shift({
          id: 'terminal-1-latest',
          openedAt: new Date('2026-08-04T14:00:00.000Z'),
          createdAt: new Date('2026-08-04T14:00:00.000Z'),
          initialCashFund: 6000,
          cashCountedTotal: 6200,
        }),
        shift({
          id: 'terminal-2-latest',
          terminalId: 'terminal-2',
          initialCashFund: 300,
          cashCountedTotal: 350,
        }),
      ],
      payments: [
        {
          cashShiftId: 'terminal-1-latest',
          paymentMethod: 'CASH',
          status: 'APPLIED',
          amount: 200,
        },
        {
          cashShiftId: 'terminal-2-latest',
          paymentMethod: 'CASH',
          status: 'APPLIED',
          amount: 50,
        },
      ],
      movements: [],
    });

    expect(result).toMatchObject({
      terminalCount: 2,
      openingCash: 6300,
      expectedCash: 6550,
      cashCountedTotal: 6550,
      cashDifferenceTotal: 0,
    });
  });

  it('excludes cancelled shifts and does not use legacy fallback when all are cancelled', () => {
    const result = calculateCashTerminalState({
      shifts: [shift({ id: 'cancelled', status: 'CANCELLED' })],
      payments: [],
      movements: [],
    });

    expect(result).toMatchObject({
      hasShiftRecords: true,
      selectedShiftIds: [],
      terminalCount: 0,
      openingCash: 0,
      expectedCash: 0,
      cashCountedTotal: 0,
      cashDifferenceTotal: 0,
    });
  });

  it('includes the latest open shift expected state but leaves consolidated count null', () => {
    const result = calculateCashTerminalState({
      shifts: [
        shift({ id: 'closed', cashCountedTotal: 6000 }),
        shift({
          id: 'open',
          status: 'OPEN',
          openedAt: new Date('2026-08-04T14:00:00.000Z'),
          createdAt: new Date('2026-08-04T14:00:00.000Z'),
          initialCashFund: 6000,
          cashCountedTotal: null,
        }),
      ],
      payments: [
        {
          cashShiftId: 'open',
          paymentMethod: 'CASH',
          status: 'APPLIED',
          amount: 200,
        },
      ],
      movements: [
        {
          cashShiftId: 'open',
          type: 'CASH_IN',
          movementChannel: 'CASH',
          isOpening: false,
          amount: 50,
        },
        {
          cashShiftId: 'open',
          type: 'ADJUSTMENT',
          movementChannel: 'CASH',
          isOpening: false,
          amount: 10,
        },
        {
          cashShiftId: 'open',
          type: 'EXPENSE',
          movementChannel: 'CASH',
          isOpening: false,
          amount: 40,
        },
      ],
    });

    expect(result).toMatchObject({
      selectedShiftIds: ['open'],
      openShiftCount: 1,
      openingCash: 6000,
      expectedCash: 6200,
      cashCountedTotal: null,
      cashDifferenceTotal: null,
    });
  });

  it('uses createdAt and then id as deterministic tie-breakers', () => {
    const openedAt = new Date('2026-08-04T08:00:00.000Z');
    const createdAt = new Date('2026-08-04T08:01:00.000Z');
    const result = calculateCashTerminalState({
      shifts: [
        shift({
          id: 'shift-a',
          openedAt,
          createdAt: new Date('2026-08-04T08:00:30.000Z'),
          cashCountedTotal: 100,
        }),
        shift({
          id: 'shift-b',
          openedAt,
          createdAt,
          cashCountedTotal: 200,
        }),
        shift({
          id: 'shift-c',
          openedAt,
          createdAt,
          cashCountedTotal: 300,
        }),
      ],
      payments: [],
      movements: [],
    });

    expect(result.selectedShiftIds).toEqual(['shift-c']);
    expect(result.cashCountedTotal).toBe(300);
  });

  it('falls back to the previous non-cancelled state when a newer shift is cancelled', () => {
    const result = calculateCashTerminalState({
      shifts: [
        shift({ id: 'closed', initialCashFund: 6000, cashCountedTotal: 6000 }),
        shift({
          id: 'cancelled',
          status: 'CANCELLED',
          openedAt: new Date('2026-08-04T14:00:00.000Z'),
          createdAt: new Date('2026-08-04T14:00:00.000Z'),
          initialCashFund: 6000,
          cashCountedTotal: null,
        }),
      ],
      payments: [],
      movements: [],
    });

    expect(result).toMatchObject({
      selectedShiftIds: ['closed'],
      expectedCash: 6000,
      cashCountedTotal: 6000,
    });
  });
});
