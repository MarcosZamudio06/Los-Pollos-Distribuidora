import type { OperationalLocationType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CreateLocationDto, ListLocationsQueryDto, UpdateLocationDto } from './dto';
type LocationRecord = {
    id: string;
    name: string;
    code: string | null;
    type: OperationalLocationType;
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
};
type LocationResponse = Omit<LocationRecord, 'latitude' | 'longitude'> & {
    latitude: number | null;
    longitude: number | null;
};
type LocationListResponse = {
    items: LocationResponse[];
};
type LocationListActor = Pick<AuthenticatedUser, 'role' | 'operationalLocationId'>;
export declare class LocationsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    findAll(currentUser: LocationListActor, query?: ListLocationsQueryDto): Promise<LocationListResponse>;
    findOne(id: string): Promise<LocationResponse>;
    create(dto: CreateLocationDto): Promise<LocationResponse>;
    update(id: string, dto: UpdateLocationDto): Promise<LocationResponse>;
    deactivate(id: string): Promise<LocationResponse>;
    assertLocationCanBeUsedForSale(locationId: string): Promise<void>;
    assertLocationCanBeUsedForPurchase(locationId: string): Promise<void>;
    assertLocationCanBeUsedForAdjustment(locationId: string): Promise<void>;
    assertLocationsCanBeUsedForTransfer(originLocationId: string, destinationLocationId: string): Promise<void>;
    private buildListWhere;
    private buildPagination;
    private findLocationForMutation;
    private findActiveLocationForMutation;
    private assertActiveLocation;
    private assertNoOpenDependencies;
    private assertCodeAvailable;
    private assertParentLocationExists;
    private normalizeMutationData;
    private normalizeOptionalText;
    private toLocationResponse;
    private throwDuplicateCodeConflict;
    private isUniqueConstraintError;
}
export {};
