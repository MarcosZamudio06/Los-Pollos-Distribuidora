import type { OperationalLocationType } from '@prisma/client';
export declare class ListLocationsQueryDto {
    page?: number;
    limit?: number;
    search?: string;
    type?: OperationalLocationType;
    parentId?: string;
    isActive?: boolean;
}
