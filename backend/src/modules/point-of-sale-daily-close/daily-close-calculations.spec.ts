import { calculateDailyCloseCost, calculateDailyCloseKilos } from './daily-close-calculations';

describe('calculateDailyCloseKilos', () => {
  it('sums sold kilos from confirmed sales assigned to the close', () => {
    const result = calculateDailyCloseKilos({
      inventoryMovements: [],
      manualInputKg: 0,
      manualSoldKg: 0,
      sales: [{ items: [{ quantityKg: 8.5 }, { quantityKg: 2 }] }],
    });

    expect(result.totalSoldKg).toBe(10.5);
  });

  it('sums only inbound inventory movements as received kilos', () => {
    const result = calculateDailyCloseKilos({
      inventoryMovements: [
        { type: 'TRANSFER_IN', quantityKg: 30 },
        { type: 'PURCHASE', quantityKg: 12.5 },
        { type: 'IN', quantityKg: 2.5 },
        { type: 'TRANSFER_OUT', quantityKg: 99 },
        { type: 'SALE', quantityKg: 15 },
      ],
      manualInputKg: 1,
      manualSoldKg: 0,
      sales: [],
    });

    expect(result.totalInputKg).toBe(46);
  });
});

describe('calculateDailyCloseCost', () => {
  it('sums immutable item cost snapshots and reports exact quality', () => {
    expect(calculateDailyCloseCost([
      { items: [{ costSubtotalSnapshot: 120, costSnapshotSource: 'SALE_CONFIRMATION' }] },
      { items: [{ costSubtotalSnapshot: '80.50', costSnapshotSource: 'SALE_CONFIRMATION' }] },
    ])).toEqual({ purchaseCostTotal: 200.5, costQuality: 'EXACT' });
  });

  it('reports estimated quality when any legacy backfill contributes', () => {
    expect(calculateDailyCloseCost([
      { items: [{ costSubtotalSnapshot: 50, costSnapshotSource: 'LEGACY_BACKFILL' }] },
    ])).toEqual({ purchaseCostTotal: 50, costQuality: 'ESTIMATED' });
  });
});
