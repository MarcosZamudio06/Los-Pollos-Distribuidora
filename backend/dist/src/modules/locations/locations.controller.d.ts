import { CreateLocationDto, ListLocationsQueryDto, UpdateLocationDto } from './dto';
import { LocationsService } from './locations.service';
export declare class LocationsController {
    private readonly locationsService;
    constructor(locationsService: LocationsService);
    findAll(query: ListLocationsQueryDto): Promise<{
        success: boolean;
        message: string;
        data: {
            items: (Omit<{
                id: string;
                name: string;
                code: string | null;
                type: import("@prisma/client").OperationalLocationType;
                parentId: string | null;
                address: string | null;
                latitude: {
                    toString(): string;
                } | number | string | null;
                longitude: {
                    toString(): string;
                } | number | string | null;
                isActive: boolean;
                createdAt: Date;
                updatedAt: Date;
            }, "latitude" | "longitude"> & {
                latitude: number | null;
                longitude: number | null;
            })[];
        };
    }>;
    findOne(id: string): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            name: string;
            code: string | null;
            type: import("@prisma/client").OperationalLocationType;
            parentId: string | null;
            address: string | null;
            latitude: {
                toString(): string;
            } | number | string | null;
            longitude: {
                toString(): string;
            } | number | string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        }, "latitude" | "longitude"> & {
            latitude: number | null;
            longitude: number | null;
        };
    }>;
    create(body: CreateLocationDto): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            name: string;
            code: string | null;
            type: import("@prisma/client").OperationalLocationType;
            parentId: string | null;
            address: string | null;
            latitude: {
                toString(): string;
            } | number | string | null;
            longitude: {
                toString(): string;
            } | number | string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        }, "latitude" | "longitude"> & {
            latitude: number | null;
            longitude: number | null;
        };
    }>;
    update(id: string, body: UpdateLocationDto): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            name: string;
            code: string | null;
            type: import("@prisma/client").OperationalLocationType;
            parentId: string | null;
            address: string | null;
            latitude: {
                toString(): string;
            } | number | string | null;
            longitude: {
                toString(): string;
            } | number | string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        }, "latitude" | "longitude"> & {
            latitude: number | null;
            longitude: number | null;
        };
    }>;
    deactivate(id: string): Promise<{
        success: boolean;
        message: string;
        data: Omit<{
            id: string;
            name: string;
            code: string | null;
            type: import("@prisma/client").OperationalLocationType;
            parentId: string | null;
            address: string | null;
            latitude: {
                toString(): string;
            } | number | string | null;
            longitude: {
                toString(): string;
            } | number | string | null;
            isActive: boolean;
            createdAt: Date;
            updatedAt: Date;
        }, "latitude" | "longitude"> & {
            latitude: number | null;
            longitude: number | null;
        };
    }>;
}
