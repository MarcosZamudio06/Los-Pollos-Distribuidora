const RECEIVED_MOVEMENT_TYPES = new Set(['IN', 'PURCHASE', 'TRANSFER_IN']);

type NumericValue = number | string | { toString(): string } | null | undefined;

type DailyCloseKilosInput = {
  inventoryMovements: Array<{ type: string; quantityKg: NumericValue }>;
  manualInputKg: NumericValue;
  manualSoldKg: NumericValue;
  sales: Array<{ items: Array<{ quantityKg: NumericValue }> }>;
};

function numeric(value: NumericValue): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateDailyCloseKilos(input: DailyCloseKilosInput) {
  const receivedFromInventory = input.inventoryMovements
    .filter((movement) => RECEIVED_MOVEMENT_TYPES.has(movement.type))
    .reduce((total, movement) => total + numeric(movement.quantityKg), 0);
  const soldFromSales = input.sales
    .flatMap((sale) => sale.items)
    .reduce((total, item) => total + numeric(item.quantityKg), 0);

  return {
    totalInputKg: receivedFromInventory + numeric(input.manualInputKg),
    totalSoldKg: soldFromSales + numeric(input.manualSoldKg),
  };
}

type CostSnapshotSource = 'SALE_CONFIRMATION' | 'LEGACY_BACKFILL';

export function calculateDailyCloseCost(
  sales: Array<{ items: Array<{ costSubtotalSnapshot: NumericValue; costSnapshotSource: CostSnapshotSource }> }>,
) {
  const items = sales.flatMap((sale) => sale.items);
  return {
    purchaseCostTotal: items.reduce((total, item) => total + numeric(item.costSubtotalSnapshot), 0),
    costQuality: items.some((item) => item.costSnapshotSource === 'LEGACY_BACKFILL') ? 'ESTIMATED' as const : 'EXACT' as const,
  };
}
