import { calculateDailyCloseKilos } from './daily-close-calculations';

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
