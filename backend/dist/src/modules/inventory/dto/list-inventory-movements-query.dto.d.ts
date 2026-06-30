import type { InventoryMovementType } from '@prisma/client';
export declare class ListInventoryMovementsQueryDto {
    page?: number;
    limit?: number;
    productId?: string;
    locationId?: string;
    type?: InventoryMovementType;
    referenceType?: string;
    referenceId?: string;
    pointOfSaleDailyCloseId?: string;
    dateFrom?: string;
    dateTo?: string;
}
