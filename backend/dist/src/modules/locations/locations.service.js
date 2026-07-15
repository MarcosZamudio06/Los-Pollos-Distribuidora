"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../database/prisma.service");
let LocationsService = class LocationsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query = {}) {
        const locations = (await this.prisma.operationalLocation.findMany({
            where: this.buildListWhere(query),
            orderBy: { name: 'asc' },
            ...this.buildPagination(query),
        }));
        return {
            items: locations.map((location) => this.toLocationResponse(location)),
        };
    }
    async findOne(id) {
        const location = (await this.prisma.operationalLocation.findUnique({
            where: { id },
        }));
        if (!location) {
            throw new common_1.NotFoundException('Location not found');
        }
        return this.toLocationResponse(location);
    }
    async create(dto) {
        const data = this.normalizeMutationData(dto, { forCreate: true });
        await this.assertCodeAvailable(data.code);
        await this.assertParentLocationExists(data.parentId);
        const location = (await this.prisma.operationalLocation
            .create({
            data: {
                name: data.name,
                code: data.code ?? null,
                type: data.type,
                parentId: data.parentId ?? null,
                address: data.address ?? null,
                isActive: true,
            },
        })
            .catch((error) => {
            this.throwDuplicateCodeConflict(error);
            throw error;
        }));
        return this.toLocationResponse(location);
    }
    async update(id, dto) {
        const currentLocation = await this.findLocationForMutation(id);
        const data = this.normalizeMutationData(dto);
        if (data.code !== undefined) {
            await this.assertCodeAvailable(data.code, currentLocation.id);
        }
        if (data.parentId !== undefined) {
            await this.assertParentLocationExists(data.parentId, currentLocation.id);
        }
        if (data.isActive === false && currentLocation.isActive) {
            await this.assertNoOpenDependencies(currentLocation.id);
        }
        const location = (await this.prisma.operationalLocation
            .update({
            where: { id: currentLocation.id },
            data: data,
        })
            .catch((error) => {
            this.throwDuplicateCodeConflict(error);
            throw error;
        }));
        return this.toLocationResponse(location);
    }
    async deactivate(id) {
        const currentLocation = await this.findActiveLocationForMutation(id);
        await this.assertNoOpenDependencies(currentLocation.id);
        const location = (await this.prisma.operationalLocation.update({
            where: { id: currentLocation.id },
            data: { isActive: false },
        }));
        return this.toLocationResponse(location);
    }
    async assertLocationCanBeUsedForSale(locationId) {
        await this.assertActiveLocation(locationId, 'New sales');
    }
    async assertLocationCanBeUsedForPurchase(locationId) {
        await this.assertActiveLocation(locationId, 'New purchases');
    }
    async assertLocationCanBeUsedForAdjustment(locationId) {
        await this.assertActiveLocation(locationId, 'New inventory adjustments');
    }
    async assertLocationsCanBeUsedForTransfer(originLocationId, destinationLocationId) {
        await this.assertActiveLocation(originLocationId, 'New transfers');
        await this.assertActiveLocation(destinationLocationId, 'New transfers');
    }
    buildListWhere(query) {
        const search = query.search?.trim();
        return {
            isActive: query.isActive ?? true,
            ...(query.type ? { type: query.type } : {}),
            ...(query.parentId ? { parentId: query.parentId } : {}),
            ...(search
                ? {
                    OR: [
                        { name: { contains: search, mode: 'insensitive' } },
                        { code: { contains: search, mode: 'insensitive' } },
                        { address: { contains: search, mode: 'insensitive' } },
                    ],
                }
                : {}),
        };
    }
    buildPagination(query) {
        if (!query.limit) {
            return {};
        }
        return {
            skip: ((query.page ?? 1) - 1) * query.limit,
            take: query.limit,
        };
    }
    async findLocationForMutation(id) {
        const location = (await this.prisma.operationalLocation.findUnique({
            where: { id },
        }));
        if (!location) {
            throw new common_1.NotFoundException('Location not found');
        }
        return location;
    }
    async findActiveLocationForMutation(id) {
        const location = (await this.prisma.operationalLocation.findFirst({
            where: { id, isActive: true },
        }));
        if (!location) {
            throw new common_1.NotFoundException('Location not found');
        }
        return location;
    }
    async assertActiveLocation(locationId, operationLabel) {
        const location = await this.prisma.operationalLocation.findUnique({
            where: { id: locationId },
            select: { id: true, isActive: true },
        });
        if (!location) {
            throw new common_1.NotFoundException('Location not found');
        }
        if (!location.isActive) {
            throw new common_1.BadRequestException(`${operationLabel} require an active location`);
        }
    }
    async assertNoOpenDependencies(locationId) {
        const transfer = await this.prisma.inventoryTransfer.findFirst({
            where: {
                status: client_1.InventoryTransferStatus.IN_TRANSIT,
                OR: [
                    { originLocationId: locationId },
                    { destinationLocationId: locationId },
                ],
            },
            select: { id: true },
        });
        if (transfer) {
            throw new common_1.BadRequestException('Cannot deactivate a location with transfers in transit');
        }
        const dailyClose = await this.prisma.pointOfSaleDailyClose.findFirst({
            where: {
                operationalLocationId: locationId,
                status: {
                    in: [
                        client_1.PointOfSaleDailyCloseStatus.DRAFT,
                        client_1.PointOfSaleDailyCloseStatus.REVIEWED,
                    ],
                },
            },
            select: { id: true },
        });
        if (dailyClose) {
            throw new common_1.BadRequestException('Cannot deactivate a location with open daily closes');
        }
        const activeRoute = await this.prisma.deliveryRoute.findFirst({
            where: {
                OR: [
                    {
                        originLocationId: locationId,
                        status: {
                            in: [
                                client_1.DeliveryRouteStatus.PENDING,
                                client_1.DeliveryRouteStatus.IN_PROGRESS,
                            ],
                        },
                    },
                    {
                        routeStockLocationId: locationId,
                        status: {
                            in: [
                                client_1.DeliveryRouteStatus.PENDING,
                                client_1.DeliveryRouteStatus.IN_PROGRESS,
                            ],
                        },
                    },
                    {
                        originLocationId: locationId,
                        settlement: {
                            status: {
                                in: [
                                    client_1.RouteSettlementStatus.OPEN,
                                    client_1.RouteSettlementStatus.REVIEW_REQUIRED,
                                ],
                            },
                        },
                    },
                    {
                        routeStockLocationId: locationId,
                        settlement: {
                            status: {
                                in: [
                                    client_1.RouteSettlementStatus.OPEN,
                                    client_1.RouteSettlementStatus.REVIEW_REQUIRED,
                                ],
                            },
                        },
                    },
                ],
            },
            select: { id: true },
        });
        if (activeRoute) {
            throw new common_1.BadRequestException('Cannot deactivate a location with active routes or open settlements');
        }
    }
    async assertCodeAvailable(code, currentLocationId) {
        if (code === undefined || code === null) {
            return;
        }
        const existingLocation = await this.prisma.operationalLocation.findUnique({
            where: { code },
            select: { id: true },
        });
        if (existingLocation && existingLocation.id !== currentLocationId) {
            throw new common_1.ConflictException('Location code is already registered');
        }
    }
    async assertParentLocationExists(parentId, currentLocationId) {
        if (parentId === undefined || parentId === null) {
            return;
        }
        if (parentId === currentLocationId) {
            throw new common_1.BadRequestException('Location cannot be its own parent');
        }
        const parentLocation = await this.prisma.operationalLocation.findUnique({
            where: { id: parentId },
            select: { id: true },
        });
        if (!parentLocation) {
            throw new common_1.BadRequestException('Parent location does not exist');
        }
    }
    normalizeMutationData(dto, options = {}) {
        const name = dto.name !== undefined ? dto.name.trim() : undefined;
        if (name !== undefined && name.length === 0) {
            throw new common_1.BadRequestException('name is required');
        }
        if (options.forCreate && name === undefined) {
            throw new common_1.BadRequestException('name is required');
        }
        return {
            ...(name !== undefined ? { name } : {}),
            ...(dto.code !== undefined
                ? { code: this.normalizeOptionalText(dto.code) }
                : {}),
            ...(dto.type !== undefined ? { type: dto.type } : {}),
            ...(dto.parentId !== undefined
                ? { parentId: this.normalizeOptionalText(dto.parentId) }
                : options.forCreate
                    ? { parentId: null }
                    : {}),
            ...(dto.address !== undefined
                ? { address: this.normalizeOptionalText(dto.address) }
                : {}),
            ...('isActive' in dto && dto.isActive !== undefined
                ? { isActive: dto.isActive }
                : {}),
        };
    }
    normalizeOptionalText(value) {
        if (value === undefined || value === null) {
            return null;
        }
        const normalizedValue = value.trim();
        return normalizedValue.length > 0 ? normalizedValue : null;
    }
    toLocationResponse(location) {
        return {
            id: location.id,
            name: location.name,
            code: location.code,
            type: location.type,
            parentId: location.parentId,
            address: location.address,
            latitude: location.latitude == null ? null : Number(location.latitude.toString()),
            longitude: location.longitude == null ? null : Number(location.longitude.toString()),
            isActive: location.isActive,
            createdAt: location.createdAt,
            updatedAt: location.updatedAt,
        };
    }
    throwDuplicateCodeConflict(error) {
        if (this.isUniqueConstraintError(error)) {
            throw new common_1.ConflictException('Location code is already registered');
        }
    }
    isUniqueConstraintError(error) {
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2002');
    }
};
exports.LocationsService = LocationsService;
exports.LocationsService = LocationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LocationsService);
//# sourceMappingURL=locations.service.js.map