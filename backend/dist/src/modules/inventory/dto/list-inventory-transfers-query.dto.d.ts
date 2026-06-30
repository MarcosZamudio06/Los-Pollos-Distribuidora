import type { InventoryTransferStatus } from '@prisma/client';
export declare class ListInventoryTransfersQueryDto {
    page?: number;
    limit?: number;
    originLocationId?: string;
    destinationLocationId?: string;
    status?: InventoryTransferStatus;
    dateFrom?: string;
    dateTo?: string;
}
