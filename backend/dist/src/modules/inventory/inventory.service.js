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
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../../database/prisma.service");
const DECREASE_MOVEMENT_TYPES = new Set([
    'OUT',
    'SALE',
    'CANCEL_PURCHASE',
    'TRANSFER_OUT',
    'SHRINKAGE',
]);
let InventoryService = class InventoryService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createAdjustment(dto, userId) {
        const reason = this.normalizeRequiredReason(dto.reason);
        return this.prisma.$transaction(async (tx) => {
            const product = (await tx.product.findUnique({
                where: { id: dto.productId },
                select: { id: true, name: true, unit: true, isActive: true },
            }));
            this.assertProductAvailable(product);
            const location = (await tx.operationalLocation.findUnique({
                where: { id: dto.locationId },
                select: { id: true, name: true, isActive: true },
            }));
            this.assertLocationAvailable(location);
            const quantities = this.normalizeQuantities(dto, product.unit);
            const direction = this.getMovementDirection(dto.type);
            const { previousQuantityKg, previousQuantityPieces, newQuantityKg, newQuantityPieces, } = await this.applyAtomicBalanceChange(tx, dto.productId, dto.locationId, direction, quantities);
            const movement = (await tx.inventoryMovement.create({
                data: {
                    productId: dto.productId,
                    locationId: dto.locationId,
                    userId,
                    type: dto.type,
                    quantity: quantities.genericQuantity,
                    quantityKg: quantities.quantityKg,
                    quantityPieces: quantities.quantityPieces,
                    previousStock: previousQuantityKg,
                    newStock: newQuantityKg,
                    previousQuantityKg,
                    newQuantityKg,
                    previousQuantityPieces,
                    newQuantityPieces,
                    reason,
                    referenceType: dto.referenceType ?? null,
                    referenceId: dto.referenceId ?? null,
                    routeSettlementId: dto.routeSettlementId ?? null,
                    pointOfSaleDailyCloseId: dto.pointOfSaleDailyCloseId ?? null,
                },
                include: { product: true, location: true },
            }));
            return this.toMovementResponse(movement);
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    }
    async findMovements(query) {
        const movements = (await this.prisma.inventoryMovement.findMany({
            where: this.buildMovementWhere(query),
            include: { product: true, location: true },
            orderBy: { createdAt: 'desc' },
            ...this.buildPagination(query),
        }));
        return {
            items: movements.map((movement) => this.toMovementResponse(movement)),
        };
    }
    normalizeRequiredReason(reason) {
        const normalized = reason?.trim();
        if (!normalized) {
            throw new common_1.BadRequestException('reason is required for manual adjustments');
        }
        return normalized;
    }
    assertProductAvailable(product) {
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        if (!product.isActive) {
            throw new common_1.BadRequestException('Inactive products cannot be adjusted');
        }
    }
    assertLocationAvailable(location) {
        if (!location) {
            throw new common_1.NotFoundException('Location not found');
        }
        if (!location.isActive) {
            throw new common_1.BadRequestException('Inventory adjustments require an active location');
        }
    }
    normalizeQuantities(dto, productUnit) {
        const quantityKg = dto.quantityKg ?? 0;
        const quantityPieces = dto.quantityPieces ?? 0;
        if (quantityKg < 0 || quantityPieces < 0) {
            throw new common_1.BadRequestException('Adjustment quantities must be non-negative');
        }
        this.assertUnitMatchesProduct(dto.unit, productUnit, quantityKg, quantityPieces);
        const genericQuantity = quantityKg > 0 ? quantityKg : quantityPieces;
        if (genericQuantity <= 0) {
            throw new common_1.BadRequestException('Adjustment must include quantityKg or quantityPieces');
        }
        return { quantityKg, quantityPieces, genericQuantity };
    }
    assertUnitMatchesProduct(requestedUnit, productUnit, quantityKg, quantityPieces) {
        if (productUnit === 'KG') {
            if (requestedUnit !== 'KG' ||
                quantityKg <= 0 ||
                quantityPieces !== 0) {
                throw new common_1.BadRequestException('KG products require a positive quantityKg only');
            }
            return;
        }
        if (productUnit === 'PIECE') {
            if (requestedUnit !== 'PIECE' ||
                quantityPieces <= 0 ||
                quantityKg !== 0) {
                throw new common_1.BadRequestException('PIECE products require a positive quantityPieces only');
            }
            return;
        }
        if (requestedUnit === 'KG' &&
            (quantityKg <= 0 || quantityPieces !== 0)) {
            throw new common_1.BadRequestException('KG adjustments require a positive quantityKg only');
        }
        if (requestedUnit === 'PIECE' &&
            (quantityPieces <= 0 || quantityKg !== 0)) {
            throw new common_1.BadRequestException('PIECE adjustments require a positive quantityPieces only');
        }
        if (requestedUnit === 'KG_AND_PIECE' &&
            quantityKg <= 0 &&
            quantityPieces <= 0) {
            throw new common_1.BadRequestException('KG_AND_PIECE adjustments require quantityKg, quantityPieces, or both');
        }
    }
    getMovementDirection(type) {
        return DECREASE_MOVEMENT_TYPES.has(type) ? -1 : 1;
    }
    assertNonNegativeBalance(quantityKg, quantityPieces) {
        if (quantityKg < 0 || quantityPieces < 0) {
            throw new common_1.BadRequestException('Inventory adjustment cannot leave negative stock');
        }
    }
    async applyAtomicBalanceChange(tx, productId, locationId, direction, quantities) {
        if (direction === -1) {
            const result = await tx.inventoryBalance.updateMany({
                where: {
                    productId,
                    locationId,
                    quantityKg: { gte: quantities.quantityKg },
                    quantityPieces: { gte: quantities.quantityPieces },
                },
                data: {
                    quantityKg: { decrement: quantities.quantityKg },
                    quantityPieces: { decrement: quantities.quantityPieces },
                },
            });
            if (result.count !== 1) {
                throw new common_1.BadRequestException('Inventory adjustment cannot leave negative stock');
            }
        }
        else {
            await tx.inventoryBalance.upsert({
                where: {
                    productId_locationId: {
                        productId,
                        locationId,
                    },
                },
                create: {
                    productId,
                    locationId,
                    quantityKg: quantities.quantityKg,
                    quantityPieces: quantities.quantityPieces,
                },
                update: {
                    quantityKg: { increment: quantities.quantityKg },
                    quantityPieces: { increment: quantities.quantityPieces },
                },
            });
        }
        const balance = (await tx.inventoryBalance.findUnique({
            where: {
                productId_locationId: {
                    productId,
                    locationId,
                },
            },
        }));
        if (!balance) {
            throw new common_1.BadRequestException('Inventory balance could not be updated');
        }
        const newQuantityKg = this.toNumber(balance.quantityKg);
        const newQuantityPieces = balance.quantityPieces;
        const previousQuantityKg = newQuantityKg - direction * quantities.quantityKg;
        const previousQuantityPieces = newQuantityPieces - direction * quantities.quantityPieces;
        this.assertNonNegativeBalance(newQuantityKg, newQuantityPieces);
        return {
            previousQuantityKg,
            previousQuantityPieces,
            newQuantityKg,
            newQuantityPieces,
        };
    }
    buildMovementWhere(query) {
        const createdAt = this.buildCreatedAtFilter(query.dateFrom, query.dateTo);
        return {
            ...(query.productId ? { productId: query.productId } : {}),
            ...(query.locationId ? { locationId: query.locationId } : {}),
            ...(query.type ? { type: query.type } : {}),
            ...(query.referenceType ? { referenceType: query.referenceType } : {}),
            ...(query.referenceId ? { referenceId: query.referenceId } : {}),
            ...(query.pointOfSaleDailyCloseId
                ? { pointOfSaleDailyCloseId: query.pointOfSaleDailyCloseId }
                : {}),
            ...(createdAt ? { createdAt } : {}),
        };
    }
    buildCreatedAtFilter(dateFrom, dateTo) {
        if (!dateFrom && !dateTo) {
            return undefined;
        }
        return {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
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
    toMovementResponse(movement) {
        const quantityKg = this.toNumber(movement.quantityKg);
        const quantityPieces = movement.quantityPieces ?? 0;
        return {
            id: movement.id,
            productId: movement.productId,
            productName: movement.product?.name,
            locationId: movement.locationId,
            locationName: movement.location?.name,
            type: movement.type,
            unit: this.resolveMovementUnit(quantityKg, quantityPieces),
            quantityKg,
            quantityPieces,
            previousQuantityKg: this.toNumber(movement.previousQuantityKg),
            newQuantityKg: this.toNumber(movement.newQuantityKg),
            previousQuantityPieces: movement.previousQuantityPieces ?? 0,
            newQuantityPieces: movement.newQuantityPieces ?? 0,
            reason: movement.reason ?? null,
            referenceType: movement.referenceType ?? null,
            referenceId: movement.referenceId ?? null,
            transferId: movement.transferId ?? null,
            saleId: movement.saleId ?? null,
            purchaseId: movement.purchaseId ?? null,
            routeSettlementId: movement.routeSettlementId ?? null,
            pointOfSaleDailyCloseId: movement.pointOfSaleDailyCloseId ?? null,
            userId: movement.userId,
            createdAt: movement.createdAt,
        };
    }
    resolveMovementUnit(quantityKg, quantityPieces) {
        if (quantityKg > 0 && quantityPieces > 0) {
            return 'KG_AND_PIECE';
        }
        if (quantityPieces > 0) {
            return 'PIECE';
        }
        return 'KG';
    }
    toNumber(value) {
        if (value === null || value === undefined) {
            return 0;
        }
        if (typeof value === 'object' && 'toNumber' in value) {
            return value.toNumber();
        }
        return Number(value);
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map