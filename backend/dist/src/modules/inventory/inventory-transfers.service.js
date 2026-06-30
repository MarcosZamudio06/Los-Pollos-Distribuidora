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
exports.InventoryTransfersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const prisma_service_1 = require("../../database/prisma.service");
const TRANSFER_INCLUDE = {
    originLocation: true,
    destinationLocation: true,
    items: { include: { product: true } },
    inventoryMovements: {
        include: { product: true, location: true },
        orderBy: { createdAt: 'asc' },
    },
};
let InventoryTransfersService = class InventoryTransfersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query) {
        const transfers = (await this.prisma.inventoryTransfer.findMany({
            where: this.buildTransferWhere(query),
            include: TRANSFER_INCLUDE,
            orderBy: { createdAt: 'desc' },
            ...this.buildPagination(query),
        }));
        return {
            items: transfers.map((transfer) => this.toTransferResponse(transfer)),
        };
    }
    async findOne(id) {
        return this.toTransferResponse(await this.findTransferOrThrow(id));
    }
    async create(dto, userId, idempotencyKey) {
        this.assertValidTransferShape(dto.originLocationId, dto.destinationLocationId, dto.items);
        return this.prisma.$transaction(async (tx) => {
            const idempotentTransferNumber = this.resolveIdempotentTransferNumber(idempotencyKey);
            if (idempotentTransferNumber) {
                const existing = (await tx.inventoryTransfer.findUnique({
                    where: { transferNumber: idempotentTransferNumber },
                    include: TRANSFER_INCLUDE,
                }));
                if (existing) {
                    this.assertSameCreatePayload(existing, dto, userId);
                    return this.toTransferResponse(existing);
                }
            }
            await this.assertLocationAvailable(tx, dto.originLocationId, 'origin');
            await this.assertLocationAvailable(tx, dto.destinationLocationId, 'destination');
            const items = [];
            for (const item of dto.items) {
                const product = await this.findProductOrThrow(tx, item.productId);
                const quantities = this.normalizeItemQuantities(item.unit, product.unit, item.quantityKg, item.quantityPieces);
                items.push({
                    productId: item.productId,
                    unit: item.unit,
                    quantityKg: quantities.quantityKg,
                    quantityPieces: quantities.quantityPieces,
                });
            }
            const transfer = (await tx.inventoryTransfer.create({
                data: {
                    transferNumber: idempotentTransferNumber ?? this.generateTransferNumber(),
                    originLocationId: dto.originLocationId,
                    destinationLocationId: dto.destinationLocationId,
                    userId,
                    status: client_1.InventoryTransferStatus.REQUESTED,
                    notes: this.normalizeOptionalText(dto.notes),
                    requestedAt: new Date(),
                    items: { create: items },
                },
                include: TRANSFER_INCLUDE,
            }));
            return this.toTransferResponse(transfer);
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    }
    async confirm(id, userId, idempotencyKey) {
        return this.prisma.$transaction(async (tx) => {
            const transfer = await this.findTransferOrThrow(id, tx);
            if (transfer.status === client_1.InventoryTransferStatus.CONFIRMED) {
                if (idempotencyKey) {
                    this.assertSameCompletedCommand('CONFIRM', transfer, this.buildCommandMarker('CONFIRM', idempotencyKey, {
                        transferId: id,
                        userId,
                    }));
                    return this.toTransferResponse(transfer);
                }
            }
            this.assertCanConfirm(transfer);
            for (const item of transfer.items ?? []) {
                const quantities = this.normalizeExistingItemQuantities(item);
                const reason = this.withCommandMarker(`Inventory transfer ${transfer.transferNumber} confirmed`, idempotencyKey
                    ? this.buildCommandMarker('CONFIRM', idempotencyKey, {
                        transferId: id,
                        userId,
                    })
                    : null);
                const originChange = await this.applyBalanceChange(tx, item.productId, transfer.originLocationId, -1, quantities);
                await this.createMovement(tx, transfer, item, userId, client_1.InventoryMovementType.TRANSFER_OUT, transfer.originLocationId, quantities, originChange, reason);
                const destinationChange = await this.applyBalanceChange(tx, item.productId, transfer.destinationLocationId, 1, quantities);
                await this.createMovement(tx, transfer, item, userId, client_1.InventoryMovementType.TRANSFER_IN, transfer.destinationLocationId, quantities, destinationChange, reason);
            }
            const confirmed = (await tx.inventoryTransfer.update({
                where: { id },
                data: {
                    status: client_1.InventoryTransferStatus.CONFIRMED,
                    confirmedAt: new Date(),
                },
                include: TRANSFER_INCLUDE,
            }));
            return this.toTransferResponse(confirmed);
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    }
    async cancel(id, dto, userId, idempotencyKey) {
        const reason = this.normalizeRequiredReason(dto.reason);
        return this.prisma.$transaction(async (tx) => {
            const transfer = await this.findTransferOrThrow(id, tx);
            if (transfer.status === client_1.InventoryTransferStatus.CANCELLED) {
                if (idempotencyKey) {
                    this.assertSameCompletedCommand('CANCEL', transfer, this.buildCommandMarker('CANCEL', idempotencyKey, {
                        transferId: id,
                        userId,
                        reason,
                    }));
                    return this.toTransferResponse(transfer);
                }
                throw new common_1.BadRequestException('Cancelled inventory transfers cannot be cancelled again without a matching Idempotency-Key');
            }
            this.assertCanCancel(transfer);
            const cancelled = (await tx.inventoryTransfer.update({
                where: { id },
                data: {
                    status: client_1.InventoryTransferStatus.CANCELLED,
                    cancelledByUserId: userId,
                    cancellationReason: this.withCommandMarker(reason, idempotencyKey
                        ? this.buildCommandMarker('CANCEL', idempotencyKey, {
                            transferId: id,
                            userId,
                            reason,
                        })
                        : null),
                    cancelledAt: new Date(),
                },
                include: TRANSFER_INCLUDE,
            }));
            return this.toTransferResponse(cancelled);
        }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
    }
    buildCommandMarker(action, idempotencyKey, payload) {
        const digest = (0, crypto_1.createHash)('sha256')
            .update(JSON.stringify({ action, idempotencyKey, payload }))
            .digest('hex')
            .slice(0, 24)
            .toUpperCase();
        return `[idempotency:${action}:${digest}]`;
    }
    withCommandMarker(value, marker) {
        return marker ? `${value} ${marker}` : value;
    }
    assertSameCompletedCommand(action, transfer, expectedMarker) {
        const commandText = action === 'CONFIRM'
            ? (transfer.inventoryMovements ?? [])
                .map((movement) => movement.reason ?? '')
                .find((reason) => reason.includes('[idempotency:CONFIRM:'))
            : transfer.cancellationReason;
        if (!commandText?.includes(expectedMarker)) {
            throw new common_1.ConflictException(`Idempotency-Key does not match the completed inventory transfer ${action.toLowerCase()} command`);
        }
    }
    stripCommandMarker(value) {
        const stripped = value
            ?.replace(/\s*\[idempotency:(CONFIRM|CANCEL):[A-F0-9]{24}\]$/, '')
            .trim();
        return stripped ? stripped : null;
    }
    resolveIdempotentTransferNumber(idempotencyKey) {
        const normalized = idempotencyKey?.trim();
        if (!normalized) {
            return null;
        }
        const digest = (0, crypto_1.createHash)('sha256')
            .update(normalized)
            .digest('hex')
            .slice(0, 24)
            .toUpperCase();
        return `TRF-IDEMP-${digest}`;
    }
    assertSameCreatePayload(transfer, dto, userId) {
        const requestedItems = this.normalizeComparableItems(dto.items ?? []);
        const existingItems = this.normalizeComparableItems((transfer.items ?? []).map((item) => ({
            productId: item.productId,
            unit: item.unit,
            quantityKg: this.toNumber(item.quantityKg),
            quantityPieces: item.quantityPieces ?? 0,
        })));
        if (transfer.originLocationId !== dto.originLocationId ||
            transfer.destinationLocationId !== dto.destinationLocationId ||
            transfer.userId !== userId ||
            (transfer.notes ?? null) !== this.normalizeOptionalText(dto.notes) ||
            JSON.stringify(existingItems) !== JSON.stringify(requestedItems)) {
            throw new common_1.ConflictException('Idempotency-Key was already used for a different inventory transfer payload');
        }
    }
    normalizeComparableItems(items) {
        return items
            .map((item) => [
            item.productId,
            item.unit,
            item.quantityKg ?? 0,
            item.quantityPieces ?? 0,
        ].join('|'))
            .sort();
    }
    async findTransferOrThrow(id, tx = this.prisma) {
        const transfer = (await tx.inventoryTransfer.findUnique({
            where: { id },
            include: TRANSFER_INCLUDE,
        }));
        if (!transfer) {
            throw new common_1.NotFoundException('Inventory transfer not found');
        }
        return transfer;
    }
    assertValidTransferShape(originLocationId, destinationLocationId, items) {
        if (originLocationId === destinationLocationId) {
            throw new common_1.BadRequestException('originLocationId and destinationLocationId cannot be equal');
        }
        if (!items?.length) {
            throw new common_1.BadRequestException('Inventory transfer requires at least one item');
        }
    }
    async assertLocationAvailable(tx, id, role) {
        const location = (await tx.operationalLocation.findUnique({
            where: { id },
            select: { id: true, name: true, isActive: true },
        }));
        if (!location) {
            throw new common_1.NotFoundException(`${role} location not found`);
        }
        if (!location.isActive) {
            throw new common_1.BadRequestException(`Inventory transfers require an active ${role} location`);
        }
    }
    async findProductOrThrow(tx, productId) {
        const product = (await tx.product.findUnique({
            where: { id: productId },
            select: { id: true, name: true, unit: true, isActive: true },
        }));
        if (!product) {
            throw new common_1.NotFoundException('Product not found');
        }
        if (!product.isActive) {
            throw new common_1.BadRequestException('Inactive products cannot be transferred');
        }
        return product;
    }
    normalizeItemQuantities(requestedUnit, productUnit, quantityKg, quantityPieces) {
        const quantities = {
            quantityKg: quantityKg ?? 0,
            quantityPieces: quantityPieces ?? 0,
        };
        if (quantities.quantityKg < 0 || quantities.quantityPieces < 0) {
            throw new common_1.BadRequestException('Transfer quantities must be non-negative');
        }
        if (productUnit === client_1.ProductUnit.KG) {
            if (requestedUnit !== client_1.ProductUnit.KG ||
                quantities.quantityKg <= 0 ||
                quantities.quantityPieces !== 0) {
                throw new common_1.BadRequestException('KG products require a positive quantityKg only');
            }
            return quantities;
        }
        if (productUnit === client_1.ProductUnit.PIECE) {
            if (requestedUnit !== client_1.ProductUnit.PIECE ||
                quantities.quantityPieces <= 0 ||
                quantities.quantityKg !== 0) {
                throw new common_1.BadRequestException('PIECE products require a positive quantityPieces only');
            }
            return quantities;
        }
        if (requestedUnit === client_1.ProductUnit.KG &&
            (quantities.quantityKg <= 0 || quantities.quantityPieces !== 0)) {
            throw new common_1.BadRequestException('KG transfers require a positive quantityKg only');
        }
        if (requestedUnit === client_1.ProductUnit.PIECE &&
            (quantities.quantityPieces <= 0 || quantities.quantityKg !== 0)) {
            throw new common_1.BadRequestException('PIECE transfers require a positive quantityPieces only');
        }
        if (requestedUnit === client_1.ProductUnit.KG_AND_PIECE &&
            quantities.quantityKg <= 0 &&
            quantities.quantityPieces <= 0) {
            throw new common_1.BadRequestException('KG_AND_PIECE transfers require quantityKg, quantityPieces, or both');
        }
        return quantities;
    }
    normalizeExistingItemQuantities(item) {
        const quantities = {
            quantityKg: this.toNumber(item.quantityKg),
            quantityPieces: item.quantityPieces ?? 0,
        };
        if (quantities.quantityKg <= 0 && quantities.quantityPieces <= 0) {
            throw new common_1.BadRequestException('Transfer item must include a positive quantity');
        }
        return quantities;
    }
    assertCanConfirm(transfer) {
        if (!transfer.items?.length) {
            throw new common_1.BadRequestException('Inventory transfer requires at least one item');
        }
        if (transfer.status === client_1.InventoryTransferStatus.CANCELLED) {
            throw new common_1.BadRequestException('Cancelled transfers cannot be confirmed');
        }
        if (transfer.status === client_1.InventoryTransferStatus.CONFIRMED) {
            throw new common_1.BadRequestException('Confirmed transfers cannot be confirmed again');
        }
    }
    assertCanCancel(transfer) {
        if (transfer.status === client_1.InventoryTransferStatus.CONFIRMED) {
            throw new common_1.BadRequestException('Confirmed transfers cannot be cancelled');
        }
    }
    async applyBalanceChange(tx, productId, locationId, direction, quantities) {
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
                throw new common_1.BadRequestException('Origin location does not have sufficient stock for this transfer');
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
        const balance = await tx.inventoryBalance.findUnique({
            where: {
                productId_locationId: {
                    productId,
                    locationId,
                },
            },
        });
        if (!balance) {
            throw new common_1.BadRequestException('Inventory balance could not be updated');
        }
        const newQuantityKg = this.toNumber(balance.quantityKg);
        const newQuantityPieces = balance.quantityPieces;
        return {
            previousQuantityKg: newQuantityKg - direction * quantities.quantityKg,
            previousQuantityPieces: newQuantityPieces - direction * quantities.quantityPieces,
            newQuantityKg,
            newQuantityPieces,
        };
    }
    async createMovement(tx, transfer, item, userId, type, locationId, quantities, balanceChange, reason) {
        await tx.inventoryMovement.create({
            data: {
                productId: item.productId,
                locationId,
                userId,
                type,
                quantity: quantities.quantityKg > 0
                    ? quantities.quantityKg
                    : quantities.quantityPieces,
                quantityKg: quantities.quantityKg,
                quantityPieces: quantities.quantityPieces,
                previousStock: balanceChange.previousQuantityKg,
                newStock: balanceChange.newQuantityKg,
                previousQuantityKg: balanceChange.previousQuantityKg,
                newQuantityKg: balanceChange.newQuantityKg,
                previousQuantityPieces: balanceChange.previousQuantityPieces,
                newQuantityPieces: balanceChange.newQuantityPieces,
                reason,
                referenceType: 'INVENTORY_TRANSFER',
                referenceId: transfer.id,
                transferId: transfer.id,
            },
            include: { product: true, location: true },
        });
    }
    buildTransferWhere(query) {
        const createdAt = this.buildCreatedAtFilter(query.dateFrom, query.dateTo);
        return {
            ...(query.originLocationId
                ? { originLocationId: query.originLocationId }
                : {}),
            ...(query.destinationLocationId
                ? { destinationLocationId: query.destinationLocationId }
                : {}),
            ...(query.status ? { status: query.status } : {}),
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
    toTransferResponse(transfer) {
        const items = (transfer.items ?? []).map((item) => ({
            productId: item.productId,
            productName: item.product?.name,
            unit: item.unit,
            quantityKg: this.toNumber(item.quantityKg),
            quantityPieces: item.quantityPieces ?? 0,
        }));
        return {
            id: transfer.id,
            transferNumber: transfer.transferNumber,
            originLocationId: transfer.originLocationId,
            destinationLocationId: transfer.destinationLocationId,
            status: transfer.status,
            userId: transfer.userId,
            notes: transfer.notes ?? null,
            requestedAt: transfer.requestedAt ?? null,
            confirmedAt: transfer.confirmedAt ?? null,
            cancelledAt: transfer.cancelledAt ?? null,
            cancelledByUserId: transfer.cancelledByUserId ?? null,
            cancellationReason: this.stripCommandMarker(transfer.cancellationReason),
            itemsCount: items.length,
            createdAt: transfer.createdAt,
            updatedAt: transfer.updatedAt,
            items,
            movements: (transfer.inventoryMovements ?? []).map((movement) => this.toMovementResponse(movement)),
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
            reason: this.stripCommandMarker(movement.reason),
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
            return client_1.ProductUnit.KG_AND_PIECE;
        }
        if (quantityPieces > 0) {
            return client_1.ProductUnit.PIECE;
        }
        return client_1.ProductUnit.KG;
    }
    normalizeRequiredReason(reason) {
        const normalized = reason?.trim();
        if (!normalized) {
            throw new common_1.BadRequestException('Cancellation reason is required');
        }
        return normalized;
    }
    normalizeOptionalText(value) {
        const normalized = value?.trim();
        return normalized ? normalized : null;
    }
    generateTransferNumber() {
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        return `TRF-${day}-${(0, crypto_1.randomUUID)().slice(0, 8).toUpperCase()}`;
    }
    toNumber(value) {
        if (value === null || value === undefined) {
            return 0;
        }
        return Number(value);
    }
};
exports.InventoryTransfersService = InventoryTransfersService;
exports.InventoryTransfersService = InventoryTransfersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryTransfersService);
//# sourceMappingURL=inventory-transfers.service.js.map