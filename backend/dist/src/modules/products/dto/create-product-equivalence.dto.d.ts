import type { EquivalentStatus, ProductUnit } from '@prisma/client';
export declare class CreateProductEquivalenceDto {
    unitFrom: ProductUnit;
    unitTo: ProductUnit;
    factor: number;
    roundingMode?: string | null;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    status: EquivalentStatus;
}
