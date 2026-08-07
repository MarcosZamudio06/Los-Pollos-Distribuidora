import { Prisma, ProductUnit } from '@prisma/client';
import {
  auditCedisInventoryData,
  CedisInventoryPreflightData,
} from './cedis-inventory-preflight';

const generatedAt = new Date('2026-08-06T12:00:00.000Z');

function baseData(
  overrides: Partial<CedisInventoryPreflightData> = {},
): CedisInventoryPreflightData {
  return {
    locations: [
      {
        id: 'cedis-1',
        name: 'CEDIS Veracruz',
        type: 'DISTRIBUTION_CENTER',
        parentId: null,
        isActive: true,
      },
      {
        id: 'branch-1',
        name: 'Sucursal Centro',
        type: 'BRANCH',
        parentId: 'cedis-1',
        isActive: true,
      },
    ],
    balances: [
      {
        productId: 'product-1',
        locationId: 'cedis-1',
        quantityKg: new Prisma.Decimal('10.000'),
        quantityPieces: 0,
      },
    ],
    transfers: [
      {
        id: 'transfer-1',
        transferNumber: 'TRF-1',
        originLocationId: 'cedis-1',
        destinationLocationId: 'branch-1',
        status: 'REQUESTED',
        items: [
          {
            id: 'transfer-item-1',
            productId: 'product-1',
            quantityKg: new Prisma.Decimal('7.000'),
            quantityPieces: null,
            unit: ProductUnit.KG,
            product: {
              id: 'product-1',
              name: 'Pollo entero',
              unit: ProductUnit.KG,
              isActive: true,
            },
          },
        ],
        branchSupplyCycleTransfer: {
          role: 'SUPPLY',
          branchSupplyCycle: {
            id: 'cycle-1',
            distributionCenterLocationId: 'cedis-1',
            branchLocationId: 'branch-1',
            status: 'OPEN',
          },
        },
      },
    ],
    ...overrides,
  };
}

describe('CEDIS inventory preflight', () => {
  it('passes a valid hierarchy, balance and pending supply', () => {
    const report = auditCedisInventoryData(baseData(), generatedAt);

    expect(report.status).toBe('PASS');
    expect(report.generatedAt).toBe(generatedAt.toISOString());
    expect(report.mode).toBe('READ_ONLY');
    expect(report.summary.commitmentTransferCount).toBe(1);
    expect(report.findings).toEqual([]);
  });

  it('reports pending commitments that exceed the physical origin balance', () => {
    const report = auditCedisInventoryData(
      baseData({
        transfers: [
          baseData().transfers[0],
          {
            ...baseData().transfers[0],
            id: 'transfer-2',
            transferNumber: 'TRF-2',
            items: [
              {
                ...baseData().transfers[0].items[0],
                id: 'transfer-item-2',
                quantityKg: new Prisma.Decimal('5.000'),
              },
            ],
          },
        ],
      }),
      generatedAt,
    );

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PENDING_TRANSFER_EXCEEDS_BALANCE' }),
      ]),
    );
    const finding = report.findings.find(
      ({ code }) => code === 'PENDING_TRANSFER_EXCEEDS_BALANCE',
    );
    expect(finding?.details).toEqual(
      expect.objectContaining({
        requestedKg: '12.000',
        onHandKg: '10.000',
        shortageKg: '2.000',
        transferIds: ['transfer-1', 'transfer-2'],
      }),
    );
  });

  it('reports structural transfer findings without changing input data', () => {
    const data = baseData({
      locations: [
        ...baseData().locations,
        {
          id: 'branch-2',
          name: 'Sucursal inválida',
          type: 'BRANCH',
          parentId: 'missing-cedis',
          isActive: true,
        },
      ],
      balances: [
        {
          productId: 'product-1',
          locationId: 'cedis-1',
          quantityKg: new Prisma.Decimal('-1.000'),
          quantityPieces: 0,
        },
      ],
      transfers: [
        {
          ...baseData().transfers[0],
          destinationLocationId: 'branch-2',
          branchSupplyCycleTransfer: null,
          items: [],
        },
      ],
    });
    const original = JSON.stringify(data);

    const report = auditCedisInventoryData(data, generatedAt);

    expect(report.status).toBe('FAIL');
    expect(report.findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'BRANCH_PARENT_INVALID',
        'BALANCE_NEGATIVE_KG',
        'TRANSFER_WITHOUT_ITEMS',
        'TRANSFER_BRANCH_SUPPLY_NOT_LINKED',
      ]),
    );
    expect(JSON.stringify(data)).toBe(original);
  });

  it('reports inactive distribution centers in the hierarchy', () => {
    const report = auditCedisInventoryData(
      baseData({
        locations: baseData().locations.map((location) =>
          location.id === 'cedis-1'
            ? { ...location, isActive: false }
            : location,
        ),
      }),
      generatedAt,
    );

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'CEDIS_INACTIVE',
          entityId: 'cedis-1',
        }),
        expect.objectContaining({
          code: 'BRANCH_PARENT_INVALID',
          entityId: 'branch-1',
        }),
      ]),
    );
  });

  it('reports inactive products, duplicate items and unit mismatches', () => {
    const transfer = baseData().transfers[0];
    const report = auditCedisInventoryData(
      baseData({
        transfers: [
          {
            ...transfer,
            items: [
              {
                ...transfer.items[0],
                product: { ...transfer.items[0].product!, isActive: false },
                unit: ProductUnit.PIECE,
                quantityKg: new Prisma.Decimal('7.000'),
                quantityPieces: 0,
              },
              {
                ...transfer.items[0],
                id: 'transfer-item-2',
              },
            ],
          },
        ],
      }),
      generatedAt,
    );

    expect(report.findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'TRANSFER_PRODUCT_INACTIVE',
        'TRANSFER_DUPLICATE_PRODUCT',
        'TRANSFER_ITEM_UNIT_MISMATCH',
      ]),
    );
  });

  it('reports missing products, inactive locations and invalid branch returns', () => {
    const report = auditCedisInventoryData(
      baseData({
        locations: [
          baseData().locations[0],
          { ...baseData().locations[1], isActive: false },
          {
            id: 'cedis-2',
            name: 'CEDIS alterno',
            type: 'DISTRIBUTION_CENTER',
            parentId: null,
            isActive: true,
          },
        ],
        transfers: [
          {
            ...baseData().transfers[0],
            id: 'return-1',
            transferNumber: 'TRF-RETURN-1',
            originLocationId: 'branch-1',
            destinationLocationId: 'cedis-2',
            items: [
              {
                ...baseData().transfers[0].items[0],
                product: null,
                quantityKg: 0,
                quantityPieces: 1,
                unit: ProductUnit.PIECE,
              },
            ],
            branchSupplyCycleTransfer: null,
          },
        ],
      }),
      generatedAt,
    );

    expect(report.findings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'TRANSFER_LOCATION_INACTIVE',
        'TRANSFER_PRODUCT_MISSING',
        'TRANSFER_BRANCH_RETURN_DESTINATION_INVALID',
        'TRANSFER_BRANCH_RETURN_NOT_LINKED',
      ]),
    );
  });
});
