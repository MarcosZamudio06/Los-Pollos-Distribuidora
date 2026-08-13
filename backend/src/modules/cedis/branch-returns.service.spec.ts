import { ForbiddenException } from '@nestjs/common';
import { Prisma, ProductUnit } from '@prisma/client';
import { PERMISSIONS } from '../../common/authorization/permissions';
import { PrismaService } from '../../database/prisma.service';
import { InventoryTransfersService } from '../inventory/inventory-transfers.service';
import { BranchReturnsService } from './branch-returns.service';

const businessDate = new Date('2026-08-05T00:00:00.000Z');
const location = (id: string, type: 'BRANCH' | 'DISTRIBUTION_CENTER') => ({
  id,
  name: id === 'branch-1' ? 'Sucursal Centro' : 'CEDIS Centro',
  code: id.toUpperCase(),
  type,
  parentId: type === 'BRANCH' ? 'cedis-1' : null,
  isActive: true,
});

function link(status = 'REQUESTED') {
  return {
    id: 'cycle-transfer-1',
    branchSupplyCycleId: 'cycle-1',
    inventoryTransferId: 'transfer-1',
    role: 'RETURN',
    linkedAt: businessDate,
    branchSupplyCycle: {
      id: 'cycle-1',
      businessDate,
      version: 3,
      distributionCenterLocationId: 'cedis-1',
      branchLocationId: 'branch-1',
      distributionCenterLocation: location('cedis-1', 'DISTRIBUTION_CENTER'),
      branchLocation: location('branch-1', 'BRANCH'),
    },
    inventoryTransfer: {
      id: 'transfer-1',
      transferNumber: 'TRF-RET-001',
      status,
      notes: 'No vendido',
      requestedAt: businessDate,
      confirmedAt: status === 'CONFIRMED' ? businessDate : null,
      cancelledAt: null,
      createdAt: businessDate,
      originLocation: location('branch-1', 'BRANCH'),
      destinationLocation: location('cedis-1', 'DISTRIBUTION_CENTER'),
      user: { id: 'seller-1', name: 'Vendedor' },
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          unit: ProductUnit.KG,
          quantityKg: new Prisma.Decimal('4'),
          quantityPieces: 0,
          product: { id: 'product-1', name: 'Pollo entero' },
        },
      ],
    },
  };
}

function prisma() {
  return {
    branchSupplyCycleTransfer: { findMany: jest.fn(), findUnique: jest.fn() },
  };
}

const seller = {
  id: 'seller-1',
  role: 'SELLER',
  operationalLocationId: 'branch-1',
  permissions: [PERMISSIONS.CEDIS_VIEW, PERMISSIONS.CEDIS_REQUEST_RETURNS],
} as const;
const warehouse = {
  id: 'warehouse-1',
  role: 'WAREHOUSE',
  operationalLocationId: 'cedis-1',
  permissions: [PERMISSIONS.CEDIS_VIEW, PERMISSIONS.CEDIS_RECEIVE_RETURNS],
} as const;

describe('BranchReturnsService', () => {
  it('limits a seller list to their branch and maps requested returns as pending', async () => {
    const db = prisma();
    db.branchSupplyCycleTransfer.findMany.mockResolvedValue([link()]);
    const service = new BranchReturnsService(
      db as unknown as PrismaService,
      {} as InventoryTransfersService,
    );

    const result = await service.list(
      { businessDate: '2026-08-05', status: 'PENDING', page: 1, limit: 25 },
      seller,
    );

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        status: 'PENDING',
        transferNumber: 'TRF-RET-001',
        requestedBy: { id: 'seller-1', name: 'Vendedor' },
      }),
    );
    expect(db.branchSupplyCycleTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: 'RETURN',
          branchSupplyCycle: {
            is: expect.objectContaining({ branchLocationId: 'branch-1' }),
          },
        }),
      }),
    );
  });

  it('rejects a seller from another branch', async () => {
    const db = prisma();
    db.branchSupplyCycleTransfer.findUnique.mockResolvedValue(link());
    const service = new BranchReturnsService(
      db as unknown as PrismaService,
      {} as InventoryTransfersService,
    );

    await expect(
      service.findOne('transfer-1', {
        ...seller,
        operationalLocationId: 'branch-2',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delegates completion with the same idempotency key to the atomic transfer confirmation', async () => {
    const db = prisma();
    db.branchSupplyCycleTransfer.findUnique
      .mockResolvedValueOnce(link())
      .mockResolvedValueOnce(link('CONFIRMED'));
    const confirm = jest.fn().mockResolvedValue({ status: 'CONFIRMED' });
    const service = new BranchReturnsService(
      db as unknown as PrismaService,
      { confirm } as unknown as InventoryTransfersService,
    );

    const result = await service.complete(
      'transfer-1',
      warehouse,
      'complete-return-1',
    );

    expect(confirm).toHaveBeenCalledWith(
      'transfer-1',
      warehouse.id,
      'complete-return-1',
      { actor: warehouse },
    );
    expect(result.status).toBe('COMPLETED');
  });
});
