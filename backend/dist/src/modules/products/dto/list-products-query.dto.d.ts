import type { ProductPresentationType, ProductUnit } from '@prisma/client';
export declare class ListProductsQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    categoryId?: string;
    presentationType?: ProductPresentationType;
    unit?: ProductUnit;
    isActive?: boolean;
    locationId?: string;
    lowStock?: boolean;
}
