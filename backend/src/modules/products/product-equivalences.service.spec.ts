import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EquivalentStatus, Prisma, ProductUnit } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductEquivalencesService } from './product-equivalences.service';

type MockPrisma = {
  product: { findFirst: jest.Mock };
  productUnitEquivalent: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  saleItem: { count: jest.Mock };
  purchaseItem: { count: jest.Mock };
};

const now = new Date('2026-06-29T12:00:00.000Z');

function decimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function createPrisma(): MockPrisma {
  return {
    product: { findFirst: jest.fn() },
    productUnitEquivalent: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    saleItem: { count: jest.fn().mockResolvedValue(0) },
    purchaseItem: { count: jest.fn().mockResolvedValue(0) },
  };
}

function createEquivalent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'equivalence-1',
    productId: 'product-1',
    unitFrom: ProductUnit.PIECE,
    unitTo: ProductUnit.KG,
    factor: decimal('1.8'),
    roundingMode: 'PENDING_BUSINESS_RULE',
    effectiveFrom: new Date('2026-06-19T00:00:00.000Z'),
    effectiveTo: null,
    status: EquivalentStatus.DRAFT,
    approvedByUserId: null,
    createdByUserId: 'admin-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createService(prisma = createPrisma()) {
  return {
    service: new ProductEquivalencesService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('ProductEquivalencesService', () => {
  it('creates a draft equivalence and maps decimal factors to numbers', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: 'product-1', isActive: true });
    prisma.productUnitEquivalent.findFirst.mockResolvedValue(null);
    prisma.productUnitEquivalent.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(createEquivalent(data)),
    );

    const result = await service.create('product-1', 'admin-1', {
      unitFrom: ProductUnit.PIECE,
      unitTo: ProductUnit.KG,
      factor: 1.8,
      roundingMode: 'PENDING_BUSINESS_RULE',
      effectiveFrom: '2026-06-19',
      effectiveTo: null,
      status: EquivalentStatus.DRAFT,
    });

    expect(prisma.productUnitEquivalent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-1',
        unitFrom: ProductUnit.PIECE,
        unitTo: ProductUnit.KG,
        factor: 1.8,
        roundingMode: 'PENDING_BUSINESS_RULE',
        status: EquivalentStatus.DRAFT,
        createdByUserId: 'admin-1',
      }),
    });
    expect(result).toEqual(expect.objectContaining({ id: 'equivalence-1', factor: 1.8 }));
  });

  it('rejects same units and active date overlaps for the product unit pair', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValue({ id: 'product-1', isActive: true });

    await expect(
      service.create('product-1', 'admin-1', {
        unitFrom: ProductUnit.KG,
        unitTo: ProductUnit.KG,
        factor: 1.8,
        status: EquivalentStatus.DRAFT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create('product-1', 'admin-1', {
        unitFrom: ProductUnit.KG_AND_PIECE,
        unitTo: ProductUnit.KG,
        factor: 1.8,
        status: EquivalentStatus.DRAFT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.productUnitEquivalent.findFirst.mockResolvedValue(createEquivalent({ status: EquivalentStatus.ACTIVE }));
    await expect(
      service.create('product-1', 'admin-1', {
        unitFrom: ProductUnit.PIECE,
        unitTo: ProductUnit.KG,
        factor: 1.7,
        effectiveFrom: '2026-07-01',
        status: EquivalentStatus.ACTIVE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('activates only equivalences with effectiveFrom and without active overlap', async () => {
    const { service, prisma } = createService();
    prisma.productUnitEquivalent.findUnique.mockResolvedValue(
      createEquivalent({ status: EquivalentStatus.DRAFT, effectiveFrom: new Date('2026-06-19T00:00:00.000Z') }),
    );
    prisma.productUnitEquivalent.findFirst.mockResolvedValue(null);
    prisma.productUnitEquivalent.update.mockResolvedValue(createEquivalent({ status: EquivalentStatus.ACTIVE }));

    const result = await service.activate('equivalence-1', 'admin-1');

    expect(prisma.productUnitEquivalent.update).toHaveBeenCalledWith({
      where: { id: 'equivalence-1' },
      data: { status: EquivalentStatus.ACTIVE, approvedByUserId: 'admin-1' },
    });
    expect(result.status).toBe(EquivalentStatus.ACTIVE);
  });



  it('rejects overwriting active or historically used equivalence factors and vigencies', async () => {
    const { service, prisma } = createService();
    prisma.productUnitEquivalent.findUnique.mockResolvedValueOnce(
      createEquivalent({ status: EquivalentStatus.ACTIVE, factor: decimal('1.8') }),
    );

    await expect(service.update('equivalence-1', 'admin-1', { factor: 1.9 })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productUnitEquivalent.update).not.toHaveBeenCalled();

    prisma.productUnitEquivalent.findUnique.mockResolvedValueOnce(
      createEquivalent({ status: EquivalentStatus.INACTIVE, factor: decimal('1.8') }),
    );
    prisma.saleItem.count.mockResolvedValueOnce(1);
    prisma.purchaseItem.count.mockResolvedValueOnce(0);

    await expect(service.update('equivalence-1', 'admin-1', { effectiveFrom: '2026-07-01' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.productUnitEquivalent.update).not.toHaveBeenCalled();
  });

  it('records approval actor when PATCH activates an equivalence', async () => {
    const { service, prisma } = createService();
    prisma.productUnitEquivalent.findUnique.mockResolvedValue(
      createEquivalent({ status: EquivalentStatus.DRAFT, effectiveFrom: new Date('2026-06-19T00:00:00.000Z') }),
    );
    prisma.productUnitEquivalent.findFirst.mockResolvedValue(null);
    prisma.productUnitEquivalent.update.mockResolvedValue(createEquivalent({ status: EquivalentStatus.ACTIVE, approvedByUserId: 'admin-1' }));

    const result = await service.update('equivalence-1', 'admin-1', { status: EquivalentStatus.ACTIVE });

    expect(prisma.productUnitEquivalent.update).toHaveBeenCalledWith({
      where: { id: 'equivalence-1' },
      data: { status: EquivalentStatus.ACTIVE, approvedByUserId: 'admin-1' },
    });
    expect(result.approvedByUserId).toBe('admin-1');
  });

  it('returns not found for missing equivalences and deactivates without deletion', async () => {
    const { service, prisma } = createService();
    prisma.productUnitEquivalent.findUnique.mockResolvedValueOnce(null);

    await expect(service.deactivate('missing-id')).rejects.toBeInstanceOf(NotFoundException);

    prisma.productUnitEquivalent.findUnique.mockResolvedValueOnce(createEquivalent({ status: EquivalentStatus.ACTIVE }));
    prisma.productUnitEquivalent.update.mockResolvedValueOnce(createEquivalent({ status: EquivalentStatus.INACTIVE }));

    const result = await service.deactivate('equivalence-1');

    expect(prisma.productUnitEquivalent.update).toHaveBeenCalledWith({
      where: { id: 'equivalence-1' },
      data: { status: EquivalentStatus.INACTIVE },
    });
    expect(result.status).toBe(EquivalentStatus.INACTIVE);
  });
});
