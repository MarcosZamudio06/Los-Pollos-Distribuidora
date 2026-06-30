import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EquivalentStatus, Prisma, ProductUnit } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductEquivalenceDto, ListProductEquivalencesQueryDto, UpdateProductEquivalenceDto } from './dto';

type DecimalLike = Prisma.Decimal | number | string;

type ProductEquivalenceRecord = {
  id: string;
  productId: string;
  unitFrom: ProductUnit;
  unitTo: ProductUnit;
  factor: DecimalLike;
  roundingMode: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  status: EquivalentStatus;
  approvedByUserId: string | null;
  createdByUserId: string;
  createdAt?: Date;
  updatedAt?: Date;
};

type ProductEquivalenceResponse = Omit<ProductEquivalenceRecord, 'factor'> & {
  factor: number;
};

@Injectable()
export class ProductEquivalencesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productId: string, query: ListProductEquivalencesQueryDto = {}) {
    await this.assertProductExists(productId);
    const records = (await this.prisma.productUnitEquivalent.findMany({
      where: {
        productId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.unitFrom ? { unitFrom: query.unitFrom } : {}),
        ...(query.unitTo ? { unitTo: query.unitTo } : {}),
        ...(query.date
          ? {
              effectiveFrom: { lte: this.parseDate(query.date, 'date') },
              OR: [
                { effectiveTo: null },
                { effectiveTo: { gte: this.parseDate(query.date, 'date') } },
              ],
            }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { effectiveFrom: 'desc' }],
    })) as ProductEquivalenceRecord[];

    return { items: records.map((record) => this.toResponse(record)) };
  }

  async create(productId: string, userId: string, dto: CreateProductEquivalenceDto) {
    await this.assertProductExists(productId);
    this.assertValidUnitPair(dto.unitFrom, dto.unitTo);
    this.assertValidDates(dto.effectiveFrom, dto.effectiveTo);
    if (dto.status === 'ACTIVE') {
      this.assertEffectiveFrom(dto.effectiveFrom);
      await this.assertNoActiveOverlap({
        productId,
        unitFrom: dto.unitFrom,
        unitTo: dto.unitTo,
        effectiveFrom: this.parseOptionalDate(dto.effectiveFrom),
        effectiveTo: this.parseOptionalDate(dto.effectiveTo),
      });
    }

    const record = (await this.prisma.productUnitEquivalent.create({
      data: {
        productId,
        unitFrom: dto.unitFrom,
        unitTo: dto.unitTo,
        factor: dto.factor,
        roundingMode: dto.roundingMode ?? null,
        effectiveFrom: this.parseOptionalDate(dto.effectiveFrom),
        effectiveTo: this.parseOptionalDate(dto.effectiveTo),
        status: dto.status,
        createdByUserId: userId,
        approvedByUserId: dto.status === 'ACTIVE' ? userId : null,
      },
    })) as ProductEquivalenceRecord;

    return this.toResponse(record);
  }

  async update(id: string, userId: string, dto: UpdateProductEquivalenceDto) {
    const current = await this.findExisting(id);
    const next = {
      unitFrom: dto.unitFrom ?? current.unitFrom,
      unitTo: dto.unitTo ?? current.unitTo,
      effectiveFrom: dto.effectiveFrom !== undefined ? this.parseOptionalDate(dto.effectiveFrom) : current.effectiveFrom,
      effectiveTo: dto.effectiveTo !== undefined ? this.parseOptionalDate(dto.effectiveTo) : current.effectiveTo,
      status: dto.status ?? current.status,
    };
    this.assertValidUnitPair(next.unitFrom, next.unitTo);
    this.assertValidDateOrder(next.effectiveFrom, next.effectiveTo);
    await this.assertHistoricalFieldsCanChange(current, dto);
    if (next.status === 'ACTIVE') {
      this.assertEffectiveFrom(next.effectiveFrom);
      await this.assertNoActiveOverlap({
        productId: current.productId,
        unitFrom: next.unitFrom,
        unitTo: next.unitTo,
        effectiveFrom: next.effectiveFrom,
        effectiveTo: next.effectiveTo,
        excludeId: id,
      });
    }

    const record = (await this.prisma.productUnitEquivalent.update({
      where: { id },
      data: {
        ...(dto.unitFrom !== undefined ? { unitFrom: dto.unitFrom } : {}),
        ...(dto.unitTo !== undefined ? { unitTo: dto.unitTo } : {}),
        ...(dto.factor !== undefined ? { factor: dto.factor } : {}),
        ...(dto.roundingMode !== undefined ? { roundingMode: dto.roundingMode ?? null } : {}),
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom: next.effectiveFrom } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo: next.effectiveTo } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(current.status !== 'ACTIVE' && next.status === 'ACTIVE' ? { approvedByUserId: userId } : {}),
      },
    })) as ProductEquivalenceRecord;

    return this.toResponse(record);
  }

  async activate(id: string, userId: string) {
    const current = await this.findExisting(id);
    this.assertEffectiveFrom(current.effectiveFrom);
    await this.assertNoActiveOverlap({
      productId: current.productId,
      unitFrom: current.unitFrom,
      unitTo: current.unitTo,
      effectiveFrom: current.effectiveFrom,
      effectiveTo: current.effectiveTo,
      excludeId: id,
    });

    const record = (await this.prisma.productUnitEquivalent.update({
      where: { id },
      data: { status: 'ACTIVE', approvedByUserId: userId },
    })) as ProductEquivalenceRecord;
    return this.toResponse(record);
  }

  async deactivate(id: string) {
    await this.findExisting(id);
    const record = (await this.prisma.productUnitEquivalent.update({
      where: { id },
      data: { status: 'INACTIVE' },
    })) as ProductEquivalenceRecord;
    return this.toResponse(record);
  }

  private async assertProductExists(productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, isActive: true }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
  }

  private async findExisting(id: string): Promise<ProductEquivalenceRecord> {
    const record = (await this.prisma.productUnitEquivalent.findUnique({ where: { id } })) as ProductEquivalenceRecord | null;
    if (!record) throw new NotFoundException('Product equivalence not found');
    return record;
  }

  private assertValidUnitPair(unitFrom: ProductUnit, unitTo: ProductUnit) {
    const allowedPair =
      (unitFrom === 'KG' && unitTo === 'PIECE') ||
      (unitFrom === 'PIECE' && unitTo === 'KG');
    if (!allowedPair) {
      throw new BadRequestException('Product equivalences only support KG to PIECE or PIECE to KG unit pairs');
    }
  }

  private assertValidDates(effectiveFrom?: string | null, effectiveTo?: string | null) {
    this.assertValidDateOrder(this.parseOptionalDate(effectiveFrom), this.parseOptionalDate(effectiveTo));
  }

  private assertValidDateOrder(effectiveFrom: Date | null, effectiveTo: Date | null) {
    if (effectiveFrom && effectiveTo && effectiveTo < effectiveFrom) {
      throw new BadRequestException('effectiveTo must be greater than or equal to effectiveFrom');
    }
  }

  private assertEffectiveFrom(effectiveFrom?: string | Date | null) {
    if (!effectiveFrom) throw new BadRequestException('effectiveFrom is required for active equivalences');
  }


  private async assertHistoricalFieldsCanChange(current: ProductEquivalenceRecord, dto: UpdateProductEquivalenceDto) {
    const changesHistoricalField =
      dto.unitFrom !== undefined ||
      dto.unitTo !== undefined ||
      dto.factor !== undefined ||
      dto.effectiveFrom !== undefined ||
      dto.effectiveTo !== undefined;

    if (!changesHistoricalField) return;

    if (current.status === 'ACTIVE') {
      throw new BadRequestException(
        'Active equivalence factors and vigencies cannot be overwritten; create a new equivalence period instead',
      );
    }

    const [saleUsage, purchaseUsage] = await Promise.all([
      this.prisma.saleItem.count({ where: { unitEquivalentId: current.id } }),
      this.prisma.purchaseItem.count({ where: { unitEquivalentId: current.id } }),
    ]);

    if (saleUsage > 0 || purchaseUsage > 0) {
      throw new BadRequestException(
        'Equivalence already has historical usage; create a new equivalence period instead of overwriting it',
      );
    }
  }

  private async assertNoActiveOverlap(input: { productId: string; unitFrom: ProductUnit; unitTo: ProductUnit; effectiveFrom: Date | null; effectiveTo: Date | null; excludeId?: string }) {
    const overlapping = await this.prisma.productUnitEquivalent.findFirst({
      where: {
        productId: input.productId,
        unitFrom: input.unitFrom,
        unitTo: input.unitTo,
        status: 'ACTIVE',
        ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
        effectiveFrom: { lte: input.effectiveTo ?? new Date('9999-12-31T00:00:00.000Z') },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.effectiveFrom ?? new Date('0001-01-01T00:00:00.000Z') } }],
      },
      select: { id: true },
    });
    if (overlapping) throw new ConflictException('An active equivalence already applies for this product, unit pair, and period');
  }

  private parseOptionalDate(value?: string | null): Date | null {
    return value ? this.parseDate(value, 'date') : null;
  }

  private parseDate(value: string, field: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private toResponse(record: ProductEquivalenceRecord): ProductEquivalenceResponse {
    return { ...record, factor: Number(record.factor) };
  }
}
