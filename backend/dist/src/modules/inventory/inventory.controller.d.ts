import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateInventoryAdjustmentDto, ListInventoryMovementsQueryDto } from './dto';
import { InventoryService } from './inventory.service';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    createAdjustment(body: CreateInventoryAdjustmentDto, user: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            productId: string;
            productName?: string;
            locationId: string;
            locationName?: string;
            type: import("@prisma/client").InventoryMovementType;
            unit: import("@prisma/client").ProductUnit;
            quantityKg: number;
            quantityPieces: number;
            previousQuantityKg: number;
            newQuantityKg: number;
            previousQuantityPieces: number;
            newQuantityPieces: number;
            reason: string | null;
            referenceType: string | null;
            referenceId: string | null;
            transferId: string | null;
            saleId: string | null;
            purchaseId: string | null;
            routeSettlementId: string | null;
            pointOfSaleDailyCloseId: string | null;
            userId: string;
            createdAt: Date;
        };
    }>;
    findMovements(query: ListInventoryMovementsQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: {
                id: string;
                productId: string;
                productName?: string;
                locationId: string;
                locationName?: string;
                type: import("@prisma/client").InventoryMovementType;
                unit: import("@prisma/client").ProductUnit;
                quantityKg: number;
                quantityPieces: number;
                previousQuantityKg: number;
                newQuantityKg: number;
                previousQuantityPieces: number;
                newQuantityPieces: number;
                reason: string | null;
                referenceType: string | null;
                referenceId: string | null;
                transferId: string | null;
                saleId: string | null;
                purchaseId: string | null;
                routeSettlementId: string | null;
                pointOfSaleDailyCloseId: string | null;
                userId: string;
                createdAt: Date;
            }[];
        };
    }>;
}
