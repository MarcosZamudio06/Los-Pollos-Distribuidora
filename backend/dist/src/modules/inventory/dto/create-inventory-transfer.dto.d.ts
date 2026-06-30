import type { ProductUnit } from '@prisma/client';
export declare class CreateInventoryTransferItemDto {
    productId: string;
    unit: ProductUnit;
    quantityKg?: number;
    quantityPieces?: number;
}
export declare class CreateInventoryTransferDto {
    originLocationId: string;
    destinationLocationId: string;
    notes?: string;
    items: CreateInventoryTransferItemDto[];
}
