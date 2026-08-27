import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { Prisma, ProductPresentationType, ProductUnit } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductsService } from './products.service';
import { PrismaService } from '../../database/prisma.service';

const now = new Date('2026-08-22T12:00:00.000Z');

function decimal(value: string | number) {
  return new Prisma.Decimal(value);
}

function productRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'product-1',
    name: 'Pechuga de pollo',
    sku: 'PECH-001',
    barcode: null,
    description: 'Pechuga por kilogramo',
    categoryId: null,
    presentationType: ProductPresentationType.CUT,
    salePrice: decimal(120),
    purchaseCost: decimal(90),
    minStock: decimal(10),
    unit: ProductUnit.KG,
    satProductServiceCode: null,
    satUnitCode: null,
    taxObjectCode: null,
    defaultTaxCode: null,
    defaultFactorType: null,
    defaultRateOrQuota: null,
    pieceWeightEquivalent: null,
    equivalentPolicyStatus: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrisma() {
  return {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    category: { findFirst: jest.fn() },
    saleItem: { updateMany: jest.fn() },
  };
}

function commercialProductDto() {
  return {
    name: 'Pechuga de pollo',
    presentationType: ProductPresentationType.CUT,
    salePrice: 120,
    purchaseCost: 90,
    minStock: 10,
    unit: ProductUnit.KG,
  };
}

describe('Product fiscal profile', () => {
  it('keeps a normal product commercially operable while exposing a stable incomplete code', async () => {
    const prisma = createPrisma();
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.product.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(productRecord(data as Record<string, unknown>)),
    );
    const service = new ProductsService(prisma as unknown as PrismaService);

    const result = await service.create(commercialProductDto());

    expect(result.unit).toBe(ProductUnit.KG);
    expect(result.satUnitCode).toBeNull();
    expect(result.fiscalProfileComplete).toBe(false);
    expect(result.fiscalProfileValidationCode).toBe(
      'CFDI_PRODUCT_PROFILE_INCOMPLETE',
    );
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        satProductServiceCode: null,
        satUnitCode: null,
        taxObjectCode: null,
        defaultTaxCode: null,
        defaultFactorType: null,
        defaultRateOrQuota: null,
      }),
      include: expect.any(Object),
    });
  });

  it('persists a complete fiscal profile without mapping the operational unit', async () => {
    const prisma = createPrisma();
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.product.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(productRecord(data as Record<string, unknown>)),
    );
    const service = new ProductsService(prisma as unknown as PrismaService);

    const result = await service.create({
      ...commercialProductDto(),
      unit: ProductUnit.KG,
      satProductServiceCode: '10101500',
      satUnitCode: 'KGM',
      taxObjectCode: '02',
      defaultTaxCode: '002',
      defaultFactorType: 'Tasa',
      defaultRateOrQuota: 0.16,
    });

    expect(result).toEqual(
      expect.objectContaining({
        unit: ProductUnit.KG,
        satProductServiceCode: '10101500',
        satUnitCode: 'KGM',
        taxObjectCode: '02',
        defaultTaxCode: '002',
        defaultFactorType: 'Tasa',
        defaultRateOrQuota: 0.16,
        fiscalProfileStatus: 'COMPLETE',
        fiscalProfileComplete: true,
        fiscalProfileMissingFields: [],
        fiscalProfileValidationCode: null,
      }),
    );
    expect(prisma.product.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ unit: ProductUnit.KG, satUnitCode: 'KGM' }),
    );
  });

  it.each([
    ['satProductServiceCode', { satProductServiceCode: '123' }],
    ['satUnitCode', { satUnitCode: 'KILOGRAM' }],
    ['taxObjectCode', { taxObjectCode: '99' }],
    ['defaultTaxCode', { defaultTaxCode: '999' }],
    ['defaultFactorType', { defaultFactorType: 'Rate' }],
    ['defaultRateOrQuota', { defaultRateOrQuota: -0.1 }],
  ])(
    'rejects invalid %s without creating a product',
    async (_field, fiscalField) => {
      const prisma = createPrisma();
      const service = new ProductsService(prisma as unknown as PrismaService);

      await expect(
        service.create({ ...commercialProductDto(), ...fiscalField }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    },
  );

  it('updates only Product fiscal columns and leaves historical SaleItem rows untouched', async () => {
    const prisma = createPrisma();
    const current = productRecord();
    prisma.product.findFirst.mockResolvedValue(current);
    prisma.product.update.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve(productRecord({ ...current, ...(data as object) })),
    );
    const service = new ProductsService(prisma as unknown as PrismaService);

    await service.update('product-1', {
      satProductServiceCode: '10101500',
      satUnitCode: 'KGM',
    });

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { satProductServiceCode: '10101500', satUnitCode: 'KGM' },
      include: expect.any(Object),
    });
    expect(prisma.saleItem.updateMany).not.toHaveBeenCalled();
  });

  it('validates structural codes at the DTO boundary while keeping fiscal fields optional', async () => {
    const valid = plainToInstance(CreateProductDto, {
      ...commercialProductDto(),
      satProductServiceCode: ' 10101500 ',
      satUnitCode: ' kgm ',
      taxObjectCode: '02',
      defaultTaxCode: '002',
      defaultFactorType: 'tasa',
      defaultRateOrQuota: '0.160000',
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid.satProductServiceCode).toBe('10101500');
    expect(valid.satUnitCode).toBe('KGM');
    expect(valid.defaultFactorType).toBe('Tasa');

    const invalid = plainToInstance(CreateProductDto, {
      ...commercialProductDto(),
      satProductServiceCode: 'not-a-sat-code',
    });
    expect(
      (await validate(invalid)).some(
        (error) => error.property === 'satProductServiceCode',
      ),
    ).toBe(true);
  });
});
