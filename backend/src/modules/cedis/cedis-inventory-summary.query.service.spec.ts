import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CedisInventorySummaryQueryService } from './cedis-inventory-summary.query.service';

function decimal(value: string | number) {
  return new Prisma.Decimal(value);
}

function movement(overrides: Record<string, unknown>) {
  return {
    id: 'movement-1',
    productId: 'product-1',
    type: 'PURCHASE',
    quantityKg: decimal(5),
    quantityPieces: 0,
    previousQuantityKg: decimal(10),
    previousQuantityPieces: 0,
    newQuantityKg: decimal(15),
    newQuantityPieces: 0,
    createdAt: new Date('2026-08-04T10:00:00.000Z'),
    product: { name: 'Pollo mixto', sku: 'POLLO-1', unit: 'KG' },
    transfer: null,
    ...overrides,
  };
}

describe('CedisInventorySummaryQueryService', () => {
  it('reconciles opening, supplier receipts, branch flow, and physical remaining', async () => {
    const prisma = {
      operationalLocation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cedis-1',
          name: 'Matriz',
          type: 'DISTRIBUTION_CENTER',
          parentId: null,
          isActive: true,
        }),
      },
      inventoryBalance: {
        findMany: jest.fn().mockResolvedValue([
          {
            productId: 'product-1',
            quantityKg: decimal(13),
            quantityPieces: 0,
            product: { name: 'Pollo mixto', sku: 'POLLO-1', unit: 'KG' },
          },
        ]),
      },
      inventoryMovement: {
        findMany: jest.fn().mockResolvedValue([
          movement({
            id: 'opening',
            type: 'IN',
            quantityKg: decimal(10),
            previousQuantityKg: decimal(0),
            newQuantityKg: decimal(10),
            createdAt: new Date('2026-08-03T10:00:00.000Z'),
          }),
          movement({
            id: 'purchase',
            createdAt: new Date('2026-08-04T10:00:00.000Z'),
          }),
          movement({
            id: 'supply',
            type: 'TRANSFER_OUT',
            quantityKg: decimal(3),
            previousQuantityKg: decimal(15),
            newQuantityKg: decimal(12),
            createdAt: new Date('2026-08-04T12:00:00.000Z'),
            transfer: {
              originLocation: { type: 'DISTRIBUTION_CENTER' },
              destinationLocation: { type: 'BRANCH' },
              branchSupplyCycleTransfer: { role: 'SUPPLY' },
            },
          }),
          movement({
            id: 'return',
            type: 'TRANSFER_IN',
            quantityKg: decimal(1),
            previousQuantityKg: decimal(12),
            newQuantityKg: decimal(13),
            createdAt: new Date('2026-08-04T14:00:00.000Z'),
            transfer: {
              originLocation: { type: 'BRANCH' },
              destinationLocation: { type: 'DISTRIBUTION_CENTER' },
              branchSupplyCycleTransfer: { role: 'RETURN' },
            },
          }),
        ]),
      },
    };
    const service = new CedisInventorySummaryQueryService(
      prisma as never,
      { get: jest.fn().mockReturnValue('America/Mexico_City') } as never,
    );

    const result = await service.getSummary(
      { cedisLocationId: 'cedis-1', businessDate: '2026-08-04' },
      { role: 'ADMIN', operationalLocationId: null },
    );

    expect(result.totals).toEqual({
      opening: { kg: '10.000', pieces: '0.000' },
      receivedFromSuppliers: { kg: '5.000', pieces: '0.000' },
      sentToBranches: { kg: '3.000', pieces: '0.000' },
      returnedFromBranches: { kg: '1.000', pieces: '0.000' },
      otherNet: { kg: '0.000', pieces: '0.000' },
      remaining: { kg: '13.000', pieces: '0.000' },
    });
  });

  it('rejects a warehouse outside the requested CEDIS scope', async () => {
    const prisma = {
      operationalLocation: { findUnique: jest.fn() },
      inventoryBalance: { findMany: jest.fn() },
      inventoryMovement: { findMany: jest.fn() },
    };
    const service = new CedisInventorySummaryQueryService(
      prisma as never,
      { get: jest.fn() } as never,
    );
    prisma.operationalLocation.findUnique.mockResolvedValue({
      id: 'cedis-1',
      name: 'Matriz',
      type: 'DISTRIBUTION_CENTER',
      parentId: null,
      isActive: true,
    });

    await expect(
      service.getSummary(
        { cedisLocationId: 'cedis-1', businessDate: '2026-08-04' },
        { role: 'WAREHOUSE', operationalLocationId: 'other-cedis' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
