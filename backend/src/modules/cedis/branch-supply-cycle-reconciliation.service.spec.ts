import { ProductUnit } from '@prisma/client';
import {
  BranchSupplyCycleReconciliationService,
  ReconciliationInput,
} from './branch-supply-cycle-reconciliation.service';

const service = new BranchSupplyCycleReconciliationService();

function dailyClose(overrides: Record<string, unknown> = {}) {
  return {
    id: 'close-1',
    version: 4,
    status: 'CLOSED',
    grossSalesTotal: '700.00',
    netCashExpected: '700.00',
    cashCountedTotal: '700.00',
    cashDifferenceTotal: '0.00',
    payments: [],
    cashMovements: [],
    cashShifts: [{ id: 'shift-1', status: 'CLOSED' }],
    differences: [],
    ...overrides,
  } as ReconciliationInput['dailyClose'];
}

function transfer(
  role: 'SUPPLY' | 'RETURN',
  quantityPieces: number,
  productUnit = ProductUnit.PIECE,
) {
  const originLocationId = role === 'SUPPLY' ? 'cedis-1' : 'branch-1';
  const destinationLocationId = role === 'SUPPLY' ? 'branch-1' : 'cedis-1';
  const item = {
    productId: 'product-1',
    productName: 'Pollo entero',
    productSku: 'POLLO-1',
    productUnit,
    unit: productUnit,
    quantityKg: 0,
    quantityPieces,
    unitEquivalentId: null,
    appliedEquivalentFactor: null,
    roundingMode: null,
    equivalent: null,
    productPrice: '999.00',
    productCost: '1.00',
  };
  return {
    role,
    transfer: {
      id: `${role.toLowerCase()}-1`,
      status: 'CONFIRMED',
      originLocationId,
      destinationLocationId,
      items: [item],
      movements: [
        {
          productId: 'product-1',
          locationId: originLocationId,
          type: 'TRANSFER_OUT',
          quantityKg: 0,
          quantityPieces,
        },
        {
          productId: 'product-1',
          locationId: destinationLocationId,
          type: 'TRANSFER_IN',
          quantityKg: 0,
          quantityPieces,
        },
      ],
    },
  };
}

function baseInput(
  overrides: Partial<ReconciliationInput> = {},
): ReconciliationInput {
  return {
    distributionCenterLocationId: 'cedis-1',
    branchLocationId: 'branch-1',
    dailyClose: dailyClose(),
    transfers: [transfer('SUPPLY', 10), transfer('RETURN', 3)],
    sales: [
      {
        id: 'sale-1',
        status: 'CONFIRMED',
        total: '700.00',
        items: [
          {
            productId: 'product-1',
            productName: 'Pollo entero',
            productSku: 'POLLO-1',
            productUnit: ProductUnit.PIECE,
            quantityKg: 0,
            quantityPieces: 7,
            total: '700.00',
            appliedEquivalentFactor: null,
            equivalent: null,
          },
        ],
      },
    ],
    productSnapshots: [
      {
        productId: 'product-1',
        productNameSnapshot: 'Pollo entero',
        productSkuSnapshot: 'POLLO-1',
        productUnitSnapshot: ProductUnit.PIECE,
        unitPriceSnapshot: '100.00',
        unitCostSnapshot: '60.00',
        unitEquivalentId: null,
        equivalenceFromUnitSnapshot: null,
        equivalenceToUnitSnapshot: null,
        appliedEquivalentFactorSnapshot: null,
        roundingModeSnapshot: null,
      },
    ],
    shrinkages: [],
    ...overrides,
  };
}

describe('BranchSupplyCycleReconciliationService', () => {
  it('calculates expected sales and cost from delivered pieces', () => {
    const result = service.calculate(baseInput());
    const item = result.items[0];

    expect(item.deliveredPieces).toBe(10);
    expect(item.returnedPieces).toBe(3);
    expect(item.expectedSoldPieces).toBe(7);
    expect(item.expectedSalesAmount).toBe('700.00');
    expect(item.expectedCostAmount).toBe('600.00');
    expect(item.expectedProfitAmount).toBe('100.00');
    expect(item.actualSoldPieces).toBe(7);
    expect(item.actualSalesAmount).toBe('700.00');
    expect(item.actualCostAmount).toBe('420.00');
    expect(item.actualProfitAmount).toBe('280.00');
    expect(result.totals.actualNetProfitTotal).toBe('280.00');
    expect(result.blockers).toEqual([]);
    expect(result.canClose).toBe(true);
  });

  it('accepts a receipt whose incoming movement contains the physically received quantity', () => {
    const sentSupply = transfer('SUPPLY', 10);
    const supplyWithReceipt = {
      ...sentSupply,
      transfer: {
        ...sentSupply.transfer,
        items: [
          {
            ...sentSupply.transfer.items[0],
            id: 'supply-item-1',
          },
        ],
        movements: [
          sentSupply.transfer.movements[0],
          {
            ...sentSupply.transfer.movements[1],
            quantityPieces: 8,
          },
        ],
        receipt: {
          items: [
            {
              transferItemId: 'supply-item-1',
              receivedKg: 0,
              receivedPieces: 8,
            },
          ],
        },
      },
    };
    const result = service.calculate(
      baseInput({
        dailyClose: dailyClose({ grossSalesTotal: '500.00' }),
        transfers: [supplyWithReceipt, transfer('RETURN', 3)],
        sales: [
          {
            id: 'sale-1',
            status: 'CONFIRMED',
            total: '500.00',
            items: [
              {
                productId: 'product-1',
                productName: 'Pollo entero',
                productSku: 'POLLO-1',
                productUnit: ProductUnit.PIECE,
                quantityKg: 0,
                quantityPieces: 5,
                total: '500.00',
                appliedEquivalentFactor: null,
                equivalent: null,
              },
            ],
          },
        ],
        shrinkages: [
          {
            id: 'shortage-1',
            productId: 'product-1',
            quantityKg: 0,
            quantityPieces: 2,
          },
        ],
        surpluses: [],
      }),
    );

    expect(result.blockers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TRANSFER_INTEGRITY_ERROR' }),
      ]),
    );
  });

  it('includes a documented receipt surplus in expected physical delivery', () => {
    const sentSupply = transfer('SUPPLY', 10);
    const supplyWithSurplus = {
      ...sentSupply,
      transfer: {
        ...sentSupply.transfer,
        items: [
          {
            ...sentSupply.transfer.items[0],
            id: 'supply-item-surplus-1',
          },
        ],
        movements: [
          sentSupply.transfer.movements[0],
          {
            ...sentSupply.transfer.movements[1],
            quantityPieces: 12,
          },
        ],
        receipt: {
          items: [
            {
              transferItemId: 'supply-item-surplus-1',
              receivedKg: 0,
              receivedPieces: 12,
            },
          ],
        },
      },
    };
    const result = service.calculate(
      baseInput({
        dailyClose: dailyClose({ grossSalesTotal: '1200.00' }),
        transfers: [supplyWithSurplus],
        surpluses: [
          {
            id: 'surplus-1',
            productId: 'product-1',
            quantityKg: 0,
            quantityPieces: 2,
          },
        ],
        sales: [
          {
            id: 'sale-surplus-1',
            status: 'CONFIRMED',
            total: '1200.00',
            items: [
              {
                productId: 'product-1',
                productName: 'Pollo entero',
                productSku: 'POLLO-1',
                productUnit: ProductUnit.PIECE,
                quantityKg: 0,
                quantityPieces: 12,
                total: '1200.00',
                appliedEquivalentFactor: null,
                equivalent: null,
              },
            ],
          },
        ],
      }),
    );

    expect(result.items[0].deliveredPieces).toBe(12);
    expect(result.items[0].differencePieces).toBe(0);
    expect(result.blockers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'CYCLE_DIFFERENCE_UNEXPLAINED' }),
      ]),
    );
  });

  it('aggregates multiple supplies and returns while ignoring a cancelled transfer', () => {
    const cancelledReturn = {
      ...transfer('RETURN', 99),
      transfer: {
        ...transfer('RETURN', 99).transfer,
        status: 'CANCELLED',
      },
    };
    const result = service.calculate(
      baseInput({
        transfers: [
          transfer('SUPPLY', 6),
          transfer('SUPPLY', 4),
          transfer('RETURN', 2),
          transfer('RETURN', 1),
          cancelledReturn,
        ],
      }),
    );

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        deliveredPieces: 10,
        returnedPieces: 3,
        expectedSoldPieces: 7,
        expectedSalesAmount: '700.00',
        expectedCostAmount: '600.00',
        expectedProfitAmount: '100.00',
      }),
    );
    expect(result.confirmedSupplyCount).toBe(2);
    expect(result.confirmedReturnCount).toBe(2);
    expect(result.cancelledTransferCount).toBe(1);
  });

  it('uses the first-supply price and cost snapshots after the catalog changes', () => {
    const changedCatalogInput = baseInput({
      transfers: [
        {
          ...transfer('SUPPLY', 10),
          transfer: {
            ...transfer('SUPPLY', 10).transfer,
            items: [
              {
                ...transfer('SUPPLY', 10).transfer.items[0],
                productPrice: '999.00',
                productCost: '1.00',
              },
            ],
          },
        },
        transfer('RETURN', 3),
      ],
    });
    const result = service.calculate(changedCatalogInput);

    expect(result.items[0].unitPriceSnapshot).toBe('100.00');
    expect(result.items[0].unitCostSnapshot).toBe('60.00');
    expect(result.items[0].expectedSalesAmount).toBe('700.00');
    expect(result.items[0].expectedCostAmount).toBe('600.00');
  });

  it('converts piece-only KG_AND_PIECE quantities with the captured equivalence', () => {
    const input = baseInput({
      transfers: [
        {
          ...transfer('SUPPLY', 10, ProductUnit.KG_AND_PIECE),
          transfer: {
            ...transfer('SUPPLY', 10, ProductUnit.KG_AND_PIECE).transfer,
            items: [
              {
                ...transfer('SUPPLY', 10, ProductUnit.KG_AND_PIECE).transfer
                  .items[0],
                unitEquivalentId: 'equivalence-1',
                appliedEquivalentFactor: '1.80',
                equivalent: {
                  unitFrom: ProductUnit.PIECE,
                  unitTo: ProductUnit.KG,
                  factor: '1.80',
                },
              },
            ],
          },
        },
        {
          ...transfer('RETURN', 3, ProductUnit.KG_AND_PIECE),
          transfer: {
            ...transfer('RETURN', 3, ProductUnit.KG_AND_PIECE).transfer,
            items: [
              {
                ...transfer('RETURN', 3, ProductUnit.KG_AND_PIECE).transfer
                  .items[0],
                unitEquivalentId: 'equivalence-1',
                appliedEquivalentFactor: '1.80',
                equivalent: {
                  unitFrom: ProductUnit.PIECE,
                  unitTo: ProductUnit.KG,
                  factor: '1.80',
                },
              },
            ],
          },
        },
      ],
      sales: [],
      productSnapshots: [
        {
          ...baseInput().productSnapshots[0]!,
          productUnitSnapshot: ProductUnit.KG_AND_PIECE,
          unitPriceSnapshot: '100.00',
          unitCostSnapshot: '60.00',
          unitEquivalentId: 'equivalence-1',
          equivalenceFromUnitSnapshot: ProductUnit.PIECE,
          equivalenceToUnitSnapshot: ProductUnit.KG,
          appliedEquivalentFactorSnapshot: '1.80',
        },
      ],
    });

    const result = service.calculate(input);
    const item = result.items[0];

    expect(item.expectedSoldPieces).toBe(7);
    expect(item.expectedSoldKg).toBe(0);
    expect(item.expectedSalesAmount).toBe('1260.00');
    expect(item.expectedCostAmount).toBe('1080.00');
    expect(result.blockers).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ code: 'EQUIVALENCE_NOT_APPLICABLE' }),
      ]),
    );
  });

  it('blocks closure for pending transfers, open shifts, and unresolved differences', () => {
    const result = service.calculate(
      baseInput({
        transfers: [
          {
            ...transfer('SUPPLY', 10),
            transfer: {
              ...transfer('SUPPLY', 10).transfer,
              status: 'REQUESTED',
            },
          },
        ],
        dailyClose: dailyClose({
          cashShifts: [{ id: 'shift-1', status: 'OPEN' }],
          differences: [
            {
              id: 'difference-1',
              referenceKey: 'CASH',
              differenceValue: '-10.00',
              status: 'PENDING_JUSTIFICATION',
            },
          ],
        }),
      }),
    );

    expect(result.canClose).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'TRANSFER_PENDING' }),
        expect.objectContaining({ code: 'CASH_SHIFT_OPEN' }),
        expect.objectContaining({ code: 'DAILY_CLOSE_DIFFERENCE_UNRESOLVED' }),
      ]),
    );
  });

  it('allows a reviewed daily close to be closed together with the CEDIS cycle', () => {
    const result = service.calculate(
      baseInput({ dailyClose: dailyClose({ status: 'REVIEWED' }) }),
    );

    expect(result.blockers).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'DAILY_CLOSE_NOT_CLOSED' }),
      ]),
    );
    expect(result.canClose).toBe(true);
  });

  it('blocks closure when a first-supply snapshot has no valid price or cost', () => {
    const result = service.calculate(
      baseInput({
        productSnapshots: [
          {
            ...baseInput().productSnapshots[0]!,
            unitPriceSnapshot: '0.00',
            unitCostSnapshot: '-1.00',
          },
        ],
      }),
    );

    expect(result.canClose).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PRODUCT_PRICE_INVALID' }),
        expect.objectContaining({ code: 'PRODUCT_COST_INVALID' }),
      ]),
    );
  });
});
