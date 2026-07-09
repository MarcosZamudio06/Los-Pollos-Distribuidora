import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  EquivalentStatus,
  Prisma,
  ProductPresentationType,
  ProductUnit,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ProductsService } from './products.service';

type ProductRecord = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  categoryId: string | null;
  presentationType: ProductPresentationType;
  salePrice: Prisma.Decimal;
  purchaseCost: Prisma.Decimal;
  minStock: Prisma.Decimal;
  unit: ProductUnit;
  pieceWeightEquivalent: Prisma.Decimal | null;
  equivalentPolicyStatus: EquivalentStatus | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  category?: { id: string; name: string } | null;
  inventoryBalances?: Array<{
    locationId: string;
    quantityKg: Prisma.Decimal;
    quantityPieces: number;
    minQuantityKg: Prisma.Decimal;
    minQuantityPieces: number;
  }>;
};

type MockPrisma = {
  product: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  category: {
    findFirst: jest.Mock;
  };
};

const now = new Date('2026-06-28T12:00:00.000Z');

function decimal(value: string | number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function createProduct(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: 'product-1',
    name: 'Pechuga de pollo',
    sku: 'PECH-001',
    description: 'Pechuga por kilogramo',
    categoryId: 'category-1',
    presentationType: ProductPresentationType.CUT,
    salePrice: decimal(120),
    purchaseCost: decimal(90),
    minStock: decimal(10),
    unit: ProductUnit.KG,
    pieceWeightEquivalent: null,
    equivalentPolicyStatus: EquivalentStatus.DRAFT,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrisma(): MockPrisma {
  return {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    category: {
      findFirst: jest.fn(),
    },
  };
}

function createService(prisma = createPrisma()): {
  service: ProductsService;
  prisma: MockPrisma;
} {
  return {
    service: new ProductsService(prisma as unknown as PrismaService),
    prisma,
  };
}

describe('ProductsService', () => {
  it('creates an active semantic product without global stock and maps numeric fields', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
    prisma.product.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(createProduct(data as Partial<ProductRecord>)),
    );

    const result = await service.create({
      name: 'Pechuga de pollo',
      sku: ' pech-001 ',
      description: 'Pechuga por kilogramo',
      categoryId: 'category-1',
      presentationType: ProductPresentationType.CUT,
      salePrice: 120,
      purchaseCost: 90,
      minStock: 10,
      unit: ProductUnit.KG,
      equivalentPolicyStatus: EquivalentStatus.DRAFT,
    });

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Pechuga de pollo',
        sku: 'PECH-001',
        presentationType: ProductPresentationType.CUT,
        salePrice: 120,
        purchaseCost: 90,
        minStock: 10,
        unit: ProductUnit.KG,
        isActive: true,
      }),
      include: expect.any(Object),
    });
    expect(prisma.product.create.mock.calls[0][0].data).not.toHaveProperty(
      'stock',
    );
    expect(result).toEqual(
      expect.objectContaining({
        sku: 'PECH-001',
        salePrice: 120,
        purchaseCost: 90,
        minStock: 10,
        unit: ProductUnit.KG,
        isActive: true,
      }),
    );
    expect(result).not.toHaveProperty('stock');
  });

  it('normalizes blank optional category and description fields before inserting', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.product.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(createProduct(data as Partial<ProductRecord>)),
    );

    await expect(
      service.create({
        name: 'Producto sin categoría',
        sku: '',
        description: '   ',
        categoryId: '   ',
        presentationType: ProductPresentationType.CUT,
        salePrice: 120,
        purchaseCost: 90,
        minStock: 0,
        unit: ProductUnit.KG,
      }),
    ).resolves.toEqual(expect.objectContaining({ categoryId: null }));

    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sku: null,
        description: null,
        categoryId: null,
      }),
      include: expect.any(Object),
    });
  });

  it('rejects invalid money and kilo/piece products without equivalent factor or policy status', async () => {
    const { service, prisma } = createService();

    await expect(
      service.create({
        name: 'Pollo entero',
        presentationType: ProductPresentationType.WHOLE,
        salePrice: 0,
        purchaseCost: 80,
        minStock: 0,
        unit: ProductUnit.PIECE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create({
        name: 'Pollo kilo pieza',
        presentationType: ProductPresentationType.WHOLE,
        salePrice: 100,
        purchaseCost: -1,
        minStock: 0,
        unit: ProductUnit.KG_AND_PIECE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('rejects kilo/piece products with inactive equivalent policy and no piece weight equivalent', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValueOnce(
      createProduct({ unit: ProductUnit.KG_AND_PIECE }),
    );
    prisma.product.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(createProduct(data as Partial<ProductRecord>)),
    );
    prisma.product.update.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(createProduct(data as Partial<ProductRecord>)),
    );

    const invalidKiloPieceData = {
      name: 'Pollo kilo pieza',
      presentationType: ProductPresentationType.WHOLE,
      salePrice: 100,
      purchaseCost: 80,
      minStock: 0,
      unit: ProductUnit.KG_AND_PIECE,
      equivalentPolicyStatus: EquivalentStatus.INACTIVE,
    };

    await expect(service.create(invalidKiloPieceData)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await expect(
      service.update('product-1', {
        unit: ProductUnit.KG_AND_PIECE,
        equivalentPolicyStatus: EquivalentStatus.INACTIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('enforces unique SKU and maps unique races to ConflictException', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValueOnce(createProduct());

    await expect(
      service.create({
        name: 'Pechuga duplicada',
        sku: 'PECH-001',
        presentationType: ProductPresentationType.CUT,
        salePrice: 120,
        purchaseCost: 90,
        minStock: 0,
        unit: ProductUnit.KG,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.product.findUnique.mockResolvedValueOnce(null);
    prisma.product.create.mockRejectedValueOnce({ code: 'P2002' });

    await expect(
      service.create({
        name: 'Pechuga carrera',
        sku: 'RACE-001',
        presentationType: ProductPresentationType.CUT,
        salePrice: 120,
        purchaseCost: 90,
        minStock: 0,
        unit: ProductUnit.KG,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('lists products with optional operational-location balance and low-stock guard', async () => {
    const { service, prisma } = createService();
    prisma.product.findMany.mockResolvedValue([
      createProduct({
        inventoryBalances: [
          {
            locationId: 'location-1',
            quantityKg: decimal(3),
            quantityPieces: 0,
            minQuantityKg: decimal(5),
            minQuantityPieces: 0,
          },
        ],
      }),
    ]);

    const result = await service.findAll({
      locationId: 'location-1',
      lowStock: true,
      isActive: true,
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true }),
        include: expect.objectContaining({
          inventoryBalances: expect.any(Object),
        }),
      }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'product-1',
        inventoryBalance: expect.objectContaining({
          locationId: 'location-1',
          quantityKg: 3,
          quantityPieces: 0,
          isLowStock: true,
        }),
      }),
    ]);
    expect(result.items[0]).not.toHaveProperty('stock');

    await expect(service.findAll({ lowStock: true })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('soft-deletes products and blocks inactive products from future sales', async () => {
    const { service, prisma } = createService();
    prisma.product.findFirst.mockResolvedValueOnce(createProduct());
    prisma.product.update.mockResolvedValueOnce(
      createProduct({ isActive: false }),
    );

    await expect(service.deactivate('product-1')).resolves.toEqual(
      expect.objectContaining({ isActive: false }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { isActive: false },
      include: expect.any(Object),
    });

    prisma.product.findUnique.mockResolvedValueOnce(
      createProduct({ isActive: false }),
    );
    await expect(
      service.assertProductCanBeSold('product-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.product.findFirst.mockResolvedValueOnce(null);
    await expect(service.deactivate('missing-product')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
