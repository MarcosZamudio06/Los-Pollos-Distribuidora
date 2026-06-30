import type { InventoryMovementType, ProductUnit } from '@prisma/client';
export declare class CreateInventoryAdjustmentDto {
    productId: string;
    locationId: string;
    type: InventoryMovementType;
    unit: ProductUnit;
    quantityKg?: number;
    quantityPieces?: number;
    reason: string;
    referenceType?: string;
    referenceId?: string;
    routeSettlementId?: string;
    pointOfSaleDailyCloseId?: string;
}
