import { CreateLocationDto, ListLocationsQueryDto, UpdateLocationDto } from './dto';
import { LocationsService } from './locations.service';
export declare class LocationsController {
    private readonly locationsService;
    constructor(locationsService: LocationsService);
    findAll(query: ListLocationsQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: {
                id: string;
                name: string;
                code: string | null;
                type: import("@prisma/client").OperationalLocationType;
                parentId: string | null;
                address: string | null;
                isActive: boolean;
                createdAt: Date;
                updatedAt: Date;
            }[];
        };
    }>;
    findOne(id: string): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            code: string | null;
            type: import("@prisma/client").OperationalLocationType;
            parentId: string | null;
            address: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    create(body: CreateLocationDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            code: string | null;
            type: import("@prisma/client").OperationalLocationType;
            parentId: string | null;
            address: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    update(id: string, body: UpdateLocationDto): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            code: string | null;
            type: import("@prisma/client").OperationalLocationType;
            parentId: string | null;
            address: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
    deactivate(id: string): Promise<{
        success: boolean;
        message: string;
        data: {
            id: string;
            name: string;
            code: string | null;
            type: import("@prisma/client").OperationalLocationType;
            parentId: string | null;
            address: string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        };
    }>;
}
