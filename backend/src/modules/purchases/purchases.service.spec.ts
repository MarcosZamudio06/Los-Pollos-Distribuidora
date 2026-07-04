import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  InventoryMovementType,
  Prisma,
  ProductUnit,
  PurchaseStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PurchasesService } from './purchases.service';

const now = new Date('2026-07-03T12:00:00.000Z');

type MockPrisma = {
  $transaction: jest.Mock;
  supplier: { findUnique: jest.Mock };
  operationalLocation: { findUnique: jest.Mock };
  product: { findUnique: jest.Mock; update: jest.Mock };
  purchase: {
    count: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  inventoryBalance: {
    upsert: jest.Mock;
    updateMany: jest.Mock;
    findUnique: jest.Mock;
  };
  inventoryMovement: { create: jest.Mock };
};

function decimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function createPrisma(): MockPrisma {
  const prisma: MockPrisma = {
    $transaction: jest.fn(async (callback) => callback(prisma)),
    supplier: { findUnique: jest.fn() },
    operationalLocation: { findUnique: jest.fn() },
    product: { findUnique: jest.fn(), update: jest.fn() },
    purchase: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    inventoryBalance: { upsert: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    inventoryMovement: { create: jest.fn() },
  };
  return prisma;
}

function createService(prisma = createPrisma()) {
  return { service: new PurchasesService(prisma as unknown as PrismaService), prisma };
}

function createPurchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'purchase-1',
    purchaseNumber: 'PUR-20260703-000001',
    supplierId: 'supplier-1',
    userId: 'warehouse-1',
    locationId: 'loc-1',
    subtotal: decimal('1000'),
    total: decimal('1000'),
    status: PurchaseStatus.CONFIRMED,
    createdAt: now,
    updatedAt: now,
    supplier: { id: 'supplier-1', name: 'Proveedor Norte' },
    location: { id: 'loc-1', name: 'Matriz' },
    user: { id: 'warehouse-1', name: 'Warehouse User' },
    items: [
      {
        id: 'item-1',
        purchaseId: 'purchase-1',
        productId: 'product-1',
        product: { id: 'product-1', name: 'Pollo mixto', unit: ProductUnit.KG_AND_PIECE },
        unit: ProductUnit.KG_AND_PIECE,
        quantity: decimal('10.5'),
        quantityKg: decimal('10.5'),
        quantityPieces: 4,
        unitCost: decimal('80'),
        unitEquivalentId: null,
        appliedEquivalentFactor: null,
        subtotal: decimal('1000'),
        createdAt: now,
        updatedAt: now,
      },
    ],
    inventoryMovements: [],
    ...overrides,
  };
}

function idempotentPurchaseNumber(idempotencyKey: string): string {
  const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 24).toUpperCase();
  return `PUR-IDEMP-${digest}`;
}

describe('PurchasesService', () => {
  it('lists purchases with documented filters and supplier/location names', async () => {
    const { service, prisma } = createService();
    prisma.purchase.count.mockResolvedValue(1);
    prisma.purchase.findMany.mockResolvedValue([createPurchase()]);

    const result = await service.findAll({ page: 1, limit: 10, supplierId: 'supplier-1', locationId: 'loc-1', status: PurchaseStatus.CONFIRMED, dateFrom: '2026-07-01', dateTo: '2026-07-31' });

    expect(prisma.purchase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        supplierId: 'supplier-1',
        locationId: 'loc-1',
        status: PurchaseStatus.CONFIRMED,
        createdAt: { gte: new Date('2026-07-01'), lte: new Date('2026-07-31') },
      }),
      include: expect.objectContaining({ supplier: true, location: true }),
      skip: 0,
      take: 10,
    }));
    expect(result).toEqual({
      items: [expect.objectContaining({ id: 'purchase-1', supplierName: 'Proveedor Norte', total: '1000' })],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('creates and confirms a purchase in one transaction, incrementing receiver stock and recording movements', async () => {
    const { service, prisma } = createService();
    prisma.purchase.findUnique.mockResolvedValue(null);
    prisma.supplier.findUnique.mockResolvedValue({ id: 'supplier-1', isActive: true });
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: true, name: 'Matriz' });
    prisma.product.findUnique.mockResolvedValue({ id: 'product-1', name: 'Pollo mixto', unit: ProductUnit.KG_AND_PIECE, isActive: true, purchaseCost: decimal('70'), unitEquivalents: [] });
    prisma.inventoryBalance.upsert.mockResolvedValue({});
    prisma.inventoryBalance.findUnique.mockResolvedValue({ productId: 'product-1', locationId: 'loc-1', quantityKg: decimal('15.5'), quantityPieces: 9 });
    prisma.purchase.create.mockImplementation(({ data }) => Promise.resolve(createPurchase({ purchaseNumber: data.purchaseNumber, items: data.items.create.map((item: Record<string, unknown>) => ({ id: 'item-1', purchaseId: 'purchase-1', product: { id: 'product-1', name: 'Pollo mixto', unit: ProductUnit.KG_AND_PIECE }, createdAt: now, updatedAt: now, ...item })) })));
    prisma.inventoryMovement.create.mockImplementation(({ data }) => Promise.resolve({ id: 'movement-1', createdAt: now, product: { name: 'Pollo mixto' }, location: { name: 'Matriz' }, ...data }));
    prisma.purchase.findFirst.mockResolvedValue(createPurchase({ inventoryMovements: [{ id: 'movement-1', productId: 'product-1', locationId: 'loc-1', userId: 'warehouse-1', type: InventoryMovementType.PURCHASE, quantityKg: decimal('10.5'), quantityPieces: 4, previousQuantityKg: decimal('5'), newQuantityKg: decimal('15.5'), previousQuantityPieces: 5, newQuantityPieces: 9, reason: 'Purchase confirmation', referenceType: 'PURCHASE', referenceId: 'purchase-1', purchaseId: 'purchase-1', createdAt: now, product: { name: 'Pollo mixto' }, location: { name: 'Matriz' } }] }));

    const result = await service.create({ supplierId: 'supplier-1', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG_AND_PIECE, quantityKg: 10.5, quantityPieces: 4, unitCost: 80 }] }, { id: 'warehouse-1', role: 'WAREHOUSE' }, 'idem-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.purchase.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        purchaseNumber: idempotentPurchaseNumber('idem-1'),
        supplierId: 'supplier-1',
        locationId: 'loc-1',
        userId: 'warehouse-1',
        status: PurchaseStatus.CONFIRMED,
        subtotal: 840,
        total: 840,
        items: { create: [expect.objectContaining({ productId: 'product-1', unit: ProductUnit.KG_AND_PIECE, quantityKg: 10.5, quantityPieces: 4, unitCost: 80, subtotal: 840 })] },
      }),
    }));
    expect(prisma.inventoryBalance.upsert).toHaveBeenCalledWith({
      where: { productId_locationId: { productId: 'product-1', locationId: 'loc-1' } },
      create: { productId: 'product-1', locationId: 'loc-1', quantityKg: 10.5, quantityPieces: 4 },
      update: { quantityKg: { increment: 10.5 }, quantityPieces: { increment: 4 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-1',
        locationId: 'loc-1',
        userId: 'warehouse-1',
        type: InventoryMovementType.PURCHASE,
        quantityKg: 10.5,
        quantityPieces: 4,
        previousQuantityKg: 5,
        newQuantityKg: 15.5,
        previousQuantityPieces: 5,
        newQuantityPieces: 9,
        purchaseId: 'purchase-1',
      }),
      include: { product: true, location: true },
    });
    expect(result).toEqual(expect.objectContaining({ id: 'purchase-1', status: PurchaseStatus.CONFIRMED, inventoryMovements: [expect.objectContaining({ type: InventoryMovementType.PURCHASE })] }));
  });

  it('rejects missing supplier, missing items, inactive receiver location, and invalid product quantities before inventory writes', async () => {
    const { service, prisma } = createService();

    await expect(service.create({ supplierId: '', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: 1, unitCost: 10 }] }, { id: 'warehouse-1', role: 'WAREHOUSE' }, 'idem')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create({ supplierId: 'supplier-1', locationId: 'loc-1', items: [] }, { id: 'warehouse-1', role: 'WAREHOUSE' }, 'idem')).rejects.toBeInstanceOf(BadRequestException);

    prisma.purchase.findUnique.mockResolvedValue(null);
    prisma.supplier.findUnique.mockResolvedValue({ id: 'supplier-1', isActive: true });
    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: false });
    await expect(service.create({ supplierId: 'supplier-1', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: 1, unitCost: 10 }] }, { id: 'warehouse-1', role: 'WAREHOUSE' }, 'idem')).rejects.toBeInstanceOf(BadRequestException);

    prisma.operationalLocation.findUnique.mockResolvedValue({ id: 'loc-1', isActive: true });
    prisma.product.findUnique.mockResolvedValue({ id: 'product-1', unit: ProductUnit.KG, isActive: true, unitEquivalents: [] });
    await expect(service.create({ supplierId: 'supplier-1', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: 0, quantityPieces: 1, unitCost: 10 }] }, { id: 'warehouse-1', role: 'WAREHOUSE' }, 'idem')).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('cancels confirmed purchases by reverting original receiver stock without allowing negative stock', async () => {
    const { service, prisma } = createService();
    prisma.purchase.findFirst.mockResolvedValueOnce(createPurchase());
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
    prisma.inventoryBalance.findUnique.mockResolvedValue({ productId: 'product-1', locationId: 'loc-1', quantityKg: decimal('5'), quantityPieces: 5 });
    prisma.inventoryMovement.create.mockResolvedValue({ id: 'cancel-movement-1', productId: 'product-1', locationId: 'loc-1', userId: 'admin-1', type: InventoryMovementType.CANCEL_PURCHASE, quantityKg: decimal('10.5'), quantityPieces: 4, previousQuantityKg: decimal('15.5'), newQuantityKg: decimal('5'), previousQuantityPieces: 9, newQuantityPieces: 5, reason: 'Wrong capture', referenceType: 'PURCHASE', referenceId: 'purchase-1', purchaseId: 'purchase-1', createdAt: now });
    prisma.purchase.update.mockResolvedValue(createPurchase({ status: PurchaseStatus.CANCELLED }));
    prisma.purchase.findFirst.mockResolvedValueOnce(createPurchase({ status: PurchaseStatus.CANCELLED, inventoryMovements: [{ id: 'cancel-movement-1', productId: 'product-1', locationId: 'loc-1', userId: 'admin-1', type: InventoryMovementType.CANCEL_PURCHASE, quantityKg: decimal('10.5'), quantityPieces: 4, previousQuantityKg: decimal('15.5'), newQuantityKg: decimal('5'), previousQuantityPieces: 9, newQuantityPieces: 5, reason: 'Wrong capture', referenceType: 'PURCHASE', referenceId: 'purchase-1', purchaseId: 'purchase-1', createdAt: now }] }));

    const result = await service.cancel('purchase-1', { reason: ' Wrong capture ' }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-idem');

    expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
      where: { productId: 'product-1', locationId: 'loc-1', quantityKg: { gte: 10.5 }, quantityPieces: { gte: 4 } },
      data: { quantityKg: { decrement: 10.5 }, quantityPieces: { decrement: 4 } },
    });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: InventoryMovementType.CANCEL_PURCHASE, locationId: 'loc-1', purchaseId: 'purchase-1', reason: expect.stringContaining('Wrong capture') }),
      include: { product: true, location: true },
    });
    expect(result.status).toBe(PurchaseStatus.CANCELLED);
  });

  it('rejects cancellation when reverting would make receiver stock negative', async () => {
    const { service, prisma } = createService();
    prisma.purchase.findFirst.mockResolvedValue(createPurchase());
    prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.cancel('purchase-1', { reason: 'Wrong capture' }, { id: 'admin-1', role: 'ADMIN' }, 'cancel-idem')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(prisma.purchase.update).not.toHaveBeenCalled();
  });

  it('protects idempotency keys from conflicting create payload reuse', async () => {
    const { service, prisma } = createService();
    prisma.purchase.findUnique.mockResolvedValue(createPurchase({ purchaseNumber: idempotentPurchaseNumber('idem-1') }));

    await expect(service.create({ supplierId: 'supplier-2', locationId: 'loc-1', items: [{ productId: 'product-1', unit: ProductUnit.KG, quantityKg: 1, unitCost: 10 }] }, { id: 'warehouse-1', role: 'WAREHOUSE' }, 'idem-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 404 for missing purchase detail', async () => {
    const { service, prisma } = createService();
    prisma.purchase.findFirst.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
