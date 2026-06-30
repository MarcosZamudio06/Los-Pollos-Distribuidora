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
export declare class ProductEquivalencesService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(productId: string, query?: ListProductEquivalencesQueryDto): Promise<{
        items: ProductEquivalenceResponse[];
    }>;
    create(productId: string, userId: string, dto: CreateProductEquivalenceDto): Promise<ProductEquivalenceResponse>;
    update(id: string, userId: string, dto: UpdateProductEquivalenceDto): Promise<ProductEquivalenceResponse>;
    activate(id: string, userId: string): Promise<ProductEquivalenceResponse>;
    deactivate(id: string): Promise<ProductEquivalenceResponse>;
    private assertProductExists;
    private findExisting;
    private assertValidUnitPair;
    private assertValidDates;
    private assertValidDateOrder;
    private assertEffectiveFrom;
    private assertHistoricalFieldsCanChange;
    private assertNoActiveOverlap;
    private parseOptionalDate;
    private parseDate;
    private toResponse;
}
export {};
