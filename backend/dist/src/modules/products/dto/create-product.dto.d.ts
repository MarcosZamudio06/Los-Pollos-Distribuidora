import type { EquivalentStatus, ProductPresentationType, ProductUnit } from '@prisma/client';
export declare class CreateProductDto {
    name: string;
    sku?: string;
    description?: string;
    categoryId?: string;
    presentationType: ProductPresentationType;
    salePrice: number;
    purchaseCost: number;
    minStock: number;
    unit: ProductUnit;
    pieceWeightEquivalent?: number;
    equivalentPolicyStatus?: EquivalentStatus;
    stock?: never;
}
