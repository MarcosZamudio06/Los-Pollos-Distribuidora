import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateInventoryAdjustmentDto, ListInventoryBalancesQueryDto, ListInventoryMovementsQueryDto } from './dto';
import { InventoryService } from './inventory.service';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    findBalances(query: ListInventoryBalancesQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: {
                productId: string;
                productName?: string;
                sku?: string | null;
                unit?: import("@prisma/client").ProductUnit;
                locationId: string;
                locationName?: string;
                quantityKg: number;
                quantityPieces: number;
                minQuantityKg: number;
                minQuantityPieces: number;
                isLowStock: boolean;
            }[];
        };
    }>;
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
