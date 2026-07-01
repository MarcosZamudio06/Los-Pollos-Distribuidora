import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateOperationalConfigDto, ListOperationalConfigQueryDto, UpdateOperationalConfigDto } from './dto';
import { OperationalConfigService } from './operational-config.service';
export declare class OperationalConfigController {
    private readonly service;
    constructor(service: OperationalConfigService);
    findAll(query: ListOperationalConfigQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: {
                id: string;
                key: string;
                value: string;
                valueType: string;
                scope: string;
                locationId: string | null;
                description: string | null;
                effectiveFrom: Date | null;
                effectiveTo: Date | null;
                isActive: boolean;
                createdByUserId: string;
                updatedByUserId: string;
                createdAt: Date;
                updatedAt: Date;
            }[];
        };
    }>;
    create(body: CreateOperationalConfigDto, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            key: string;
            value: string;
            valueType: string;
            scope: string;
            locationId: string | null;
            description: string | null;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            isActive: boolean;
            createdByUserId: string;
            updatedByUserId: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    update(id: string, body: UpdateOperationalConfigDto, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            key: string;
            value: string;
            valueType: string;
            scope: string;
            locationId: string | null;
            description: string | null;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            isActive: boolean;
            createdByUserId: string;
            updatedByUserId: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    deactivate(id: string, currentUser: AuthenticatedUser): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            key: string;
            value: string;
            valueType: string;
            scope: string;
            locationId: string | null;
            description: string | null;
            effectiveFrom: Date | null;
            effectiveTo: Date | null;
            isActive: boolean;
            createdByUserId: string;
            updatedByUserId: string;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
}
