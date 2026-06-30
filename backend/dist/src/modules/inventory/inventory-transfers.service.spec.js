"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const inventory_transfers_service_1 = require("./inventory-transfers.service");
const now = new Date('2026-06-29T12:00:00.000Z');
function decimal(value) {
    return new client_1.Prisma.Decimal(value);
}
function idempotencyMarker(action, idempotencyKey, payload) {
    const digest = (0, crypto_1.createHash)('sha256')
        .update(JSON.stringify({ action, idempotencyKey, payload }))
        .digest('hex')
        .slice(0, 24)
        .toUpperCase();
    return `[idempotency:${action}:${digest}]`;
}
function createPrisma() {
    const prisma = {
        $transaction: jest.fn(),
        operationalLocation: { findUnique: jest.fn() },
        product: { findUnique: jest.fn() },
        inventoryTransfer: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        inventoryBalance: {
            updateMany: jest.fn(),
            upsert: jest.fn(),
            findUnique: jest.fn(),
        },
        inventoryMovement: { create: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    return prisma;
}
function createService(prisma = createPrisma()) {
    return {
        service: new inventory_transfers_service_1.InventoryTransfersService(prisma),
        prisma,
    };
}
function createTransfer(overrides = {}) {
    return {
        id: 'transfer-1',
        transferNumber: 'TRF-20260629-000001',
        originLocationId: 'origin-1',
        destinationLocationId: 'destination-1',
        userId: 'warehouse-1',
        status: client_1.InventoryTransferStatus.REQUESTED,
        notes: 'Route load',
        requestedAt: now,
        confirmedAt: null,
        cancelledAt: null,
        cancelledByUserId: null,
        cancellationReason: null,
        createdAt: now,
        updatedAt: now,
        originLocation: { id: 'origin-1', name: 'Matriz' },
        destinationLocation: { id: 'destination-1', name: 'Sucursal Centro' },
        items: [
            {
                id: 'item-1',
                transferId: 'transfer-1',
                productId: 'product-1',
                quantityKg: decimal(12.5),
                quantityPieces: 3,
                unit: client_1.ProductUnit.KG_AND_PIECE,
                createdAt: now,
                updatedAt: now,
                product: {
                    id: 'product-1',
                    name: 'Pollo mixto',
                    unit: client_1.ProductUnit.KG_AND_PIECE,
                },
            },
        ],
        inventoryMovements: [],
        ...overrides,
    };
}
describe('InventoryTransfersService', () => {
    it('creates a requested transfer with active different locations, responsible user, and kilo/piece items', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findUnique
            .mockResolvedValueOnce({ id: 'origin-1', name: 'Matriz', isActive: true })
            .mockResolvedValueOnce({
            id: 'destination-1',
            name: 'Sucursal Centro',
            isActive: true,
        });
        prisma.product.findUnique.mockResolvedValue({
            id: 'product-1',
            name: 'Pollo mixto',
            unit: client_1.ProductUnit.KG_AND_PIECE,
            isActive: true,
        });
        prisma.inventoryTransfer.create.mockResolvedValue(createTransfer());
        const result = await service.create({
            originLocationId: 'origin-1',
            destinationLocationId: 'destination-1',
            notes: ' Route load ',
            items: [
                {
                    productId: 'product-1',
                    unit: client_1.ProductUnit.KG_AND_PIECE,
                    quantityKg: 12.5,
                    quantityPieces: 3,
                },
            ],
        }, 'warehouse-1');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.inventoryTransfer.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                originLocationId: 'origin-1',
                destinationLocationId: 'destination-1',
                userId: 'warehouse-1',
                status: client_1.InventoryTransferStatus.REQUESTED,
                notes: 'Route load',
                requestedAt: expect.any(Date),
                items: {
                    create: [
                        {
                            productId: 'product-1',
                            unit: client_1.ProductUnit.KG_AND_PIECE,
                            quantityKg: 12.5,
                            quantityPieces: 3,
                        },
                    ],
                },
            }),
            include: expect.any(Object),
        });
        expect(result).toEqual(expect.objectContaining({
            id: 'transfer-1',
            status: client_1.InventoryTransferStatus.REQUESTED,
            itemsCount: 1,
            items: [
                expect.objectContaining({
                    productId: 'product-1',
                    productName: 'Pollo mixto',
                    unit: client_1.ProductUnit.KG_AND_PIECE,
                    quantityKg: 12.5,
                    quantityPieces: 3,
                }),
            ],
        }));
    });
    it('rejects transfers with the same origin and destination or without items before writing', async () => {
        const { service, prisma } = createService();
        await expect(service.create({
            originLocationId: 'location-1',
            destinationLocationId: 'location-1',
            items: [
                { productId: 'product-1', unit: client_1.ProductUnit.KG, quantityKg: 1 },
            ],
        }, 'warehouse-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        await expect(service.create({
            originLocationId: 'origin-1',
            destinationLocationId: 'destination-1',
            items: [],
        }, 'warehouse-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
    });
    it('confirms a transfer once, decrementing origin and incrementing destination with traceable movements', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer());
        prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
        prisma.inventoryBalance.findUnique
            .mockResolvedValueOnce({
            id: 'origin-balance',
            productId: 'product-1',
            locationId: 'origin-1',
            quantityKg: decimal(17.5),
            quantityPieces: 7,
        })
            .mockResolvedValueOnce({
            id: 'destination-balance',
            productId: 'product-1',
            locationId: 'destination-1',
            quantityKg: decimal(12.5),
            quantityPieces: 3,
        });
        prisma.inventoryBalance.upsert.mockResolvedValue({});
        prisma.inventoryMovement.create
            .mockImplementationOnce(({ data }) => Promise.resolve({
            id: 'movement-out',
            createdAt: now,
            product: { name: 'Pollo mixto' },
            location: { name: 'Matriz' },
            ...data,
        }))
            .mockImplementationOnce(({ data }) => Promise.resolve({
            id: 'movement-in',
            createdAt: now,
            product: { name: 'Pollo mixto' },
            location: { name: 'Sucursal Centro' },
            ...data,
        }));
        prisma.inventoryTransfer.update.mockResolvedValue(createTransfer({
            status: client_1.InventoryTransferStatus.CONFIRMED,
            confirmedAt: now,
            inventoryMovements: [
                {
                    id: 'movement-out',
                    type: client_1.InventoryMovementType.TRANSFER_OUT,
                    reason: 'Inventory transfer TRF-20260629-000001 confirmed',
                },
                { id: 'movement-in', type: client_1.InventoryMovementType.TRANSFER_IN },
            ],
        }));
        const result = await service.confirm('transfer-1', 'warehouse-1');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
            where: {
                productId: 'product-1',
                locationId: 'origin-1',
                quantityKg: { gte: 12.5 },
                quantityPieces: { gte: 3 },
            },
            data: {
                quantityKg: { decrement: 12.5 },
                quantityPieces: { decrement: 3 },
            },
        });
        expect(prisma.inventoryBalance.upsert).toHaveBeenCalledWith({
            where: {
                productId_locationId: {
                    productId: 'product-1',
                    locationId: 'destination-1',
                },
            },
            create: {
                productId: 'product-1',
                locationId: 'destination-1',
                quantityKg: 12.5,
                quantityPieces: 3,
            },
            update: {
                quantityKg: { increment: 12.5 },
                quantityPieces: { increment: 3 },
            },
        });
        expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                productId: 'product-1',
                locationId: 'origin-1',
                userId: 'warehouse-1',
                transferId: 'transfer-1',
                type: client_1.InventoryMovementType.TRANSFER_OUT,
                quantityKg: 12.5,
                quantityPieces: 3,
                previousQuantityKg: 30,
                newQuantityKg: 17.5,
                previousQuantityPieces: 10,
                newQuantityPieces: 7,
                reason: 'Inventory transfer TRF-20260629-000001 confirmed',
            }),
            include: { product: true, location: true },
        });
        expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                productId: 'product-1',
                locationId: 'destination-1',
                userId: 'warehouse-1',
                transferId: 'transfer-1',
                type: client_1.InventoryMovementType.TRANSFER_IN,
                previousQuantityKg: 0,
                newQuantityKg: 12.5,
                previousQuantityPieces: 0,
                newQuantityPieces: 3,
            }),
            include: { product: true, location: true },
        });
        expect(result.status).toBe(client_1.InventoryTransferStatus.CONFIRMED);
        expect(result.movements).toEqual([
            expect.objectContaining({ type: client_1.InventoryMovementType.TRANSFER_OUT }),
            expect.objectContaining({ type: client_1.InventoryMovementType.TRANSFER_IN }),
        ]);
    });
    it('does not confirm when origin stock is insufficient and creates no movements', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer());
        prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.confirm('transfer-1', 'warehouse-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
        expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    });
    it('cancels a non-confirmed transfer with actor, date, and reason but rejects confirmed transfers', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValueOnce(createTransfer());
        prisma.inventoryTransfer.update.mockResolvedValue(createTransfer({
            status: client_1.InventoryTransferStatus.CANCELLED,
            cancelledAt: now,
            cancelledByUserId: 'warehouse-1',
            cancellationReason: 'Operational mistake',
        }));
        await expect(service.cancel('transfer-1', { reason: ' Operational mistake ' }, 'warehouse-1')).resolves.toEqual(expect.objectContaining({
            status: client_1.InventoryTransferStatus.CANCELLED,
            cancelledByUserId: 'warehouse-1',
            cancellationReason: 'Operational mistake',
        }));
        expect(prisma.inventoryTransfer.update).toHaveBeenCalledWith({
            where: { id: 'transfer-1' },
            data: expect.objectContaining({
                status: client_1.InventoryTransferStatus.CANCELLED,
                cancelledByUserId: 'warehouse-1',
                cancellationReason: 'Operational mistake',
                cancelledAt: expect.any(Date),
            }),
            include: expect.any(Object),
        });
        prisma.inventoryTransfer.findUnique.mockResolvedValueOnce(createTransfer({ status: client_1.InventoryTransferStatus.CONFIRMED }));
        await expect(service.cancel('transfer-1', { reason: 'Too late' }, 'warehouse-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
    it('lists and retrieves transfers with API filters and movement details', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findMany.mockResolvedValue([createTransfer()]);
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer({
            inventoryMovements: [
                {
                    id: 'movement-out',
                    productId: 'product-1',
                    locationId: 'origin-1',
                    userId: 'warehouse-1',
                    type: client_1.InventoryMovementType.TRANSFER_OUT,
                    quantityKg: decimal(12.5),
                    quantityPieces: 3,
                    previousQuantityKg: decimal(30),
                    newQuantityKg: decimal(17.5),
                    previousQuantityPieces: 10,
                    newQuantityPieces: 7,
                    reason: 'Inventory transfer TRF-20260629-000001 confirmed',
                    referenceType: 'INVENTORY_TRANSFER',
                    referenceId: 'transfer-1',
                    transferId: 'transfer-1',
                    saleId: null,
                    purchaseId: null,
                    routeSettlementId: null,
                    pointOfSaleDailyCloseId: null,
                    createdAt: now,
                    product: { name: 'Pollo mixto' },
                    location: { name: 'Matriz' },
                },
            ],
        }));
        await expect(service.findAll({
            originLocationId: 'origin-1',
            destinationLocationId: 'destination-1',
            status: client_1.InventoryTransferStatus.REQUESTED,
            dateFrom: '2026-06-01T00:00:00.000Z',
            dateTo: '2026-06-30T23:59:59.999Z',
        })).resolves.toEqual({
            items: [
                expect.objectContaining({
                    id: 'transfer-1',
                    itemsCount: 1,
                    originLocationId: 'origin-1',
                    destinationLocationId: 'destination-1',
                }),
            ],
        });
        expect(prisma.inventoryTransfer.findMany).toHaveBeenCalledWith({
            where: expect.objectContaining({
                originLocationId: 'origin-1',
                destinationLocationId: 'destination-1',
                status: client_1.InventoryTransferStatus.REQUESTED,
                createdAt: {
                    gte: new Date('2026-06-01T00:00:00.000Z'),
                    lte: new Date('2026-06-30T23:59:59.999Z'),
                },
            }),
            include: expect.any(Object),
            orderBy: { createdAt: 'desc' },
        });
        await expect(service.findOne('transfer-1')).resolves.toEqual(expect.objectContaining({
            id: 'transfer-1',
            items: [expect.objectContaining({ productName: 'Pollo mixto' })],
            movements: [
                expect.objectContaining({ type: client_1.InventoryMovementType.TRANSFER_OUT }),
            ],
        }));
    });
    it('returns the existing transfer for a repeated create idempotency key with the same payload', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer());
        await expect(service.create({
            originLocationId: 'origin-1',
            destinationLocationId: 'destination-1',
            notes: 'Route load',
            items: [
                {
                    productId: 'product-1',
                    unit: client_1.ProductUnit.KG_AND_PIECE,
                    quantityKg: 12.5,
                    quantityPieces: 3,
                },
            ],
        }, 'warehouse-1', 'same-create-key')).resolves.toEqual(expect.objectContaining({ id: 'transfer-1' }));
        expect(prisma.inventoryTransfer.create).not.toHaveBeenCalled();
    });
    it('returns an already confirmed transfer for an idempotent confirm retry without duplicating movements', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer({
            status: client_1.InventoryTransferStatus.CONFIRMED,
            confirmedAt: now,
            inventoryMovements: [
                {
                    id: 'movement-out',
                    type: client_1.InventoryMovementType.TRANSFER_OUT,
                    reason: `Inventory transfer TRF-20260629-000001 confirmed ${idempotencyMarker('CONFIRM', 'same-confirm-key', { transferId: 'transfer-1', userId: 'warehouse-1' })}`,
                },
                { id: 'movement-in', type: client_1.InventoryMovementType.TRANSFER_IN },
            ],
        }));
        await expect(service.confirm('transfer-1', 'warehouse-1', 'same-confirm-key')).resolves.toEqual(expect.objectContaining({ status: client_1.InventoryTransferStatus.CONFIRMED }));
        expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
        expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    });
    it('returns an already confirmed transfer only when the confirm idempotency key matches the persisted command marker', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer({
            status: client_1.InventoryTransferStatus.CONFIRMED,
            confirmedAt: now,
            inventoryMovements: [
                {
                    id: 'movement-out',
                    type: client_1.InventoryMovementType.TRANSFER_OUT,
                    reason: `Inventory transfer TRF-20260629-000001 confirmed ${idempotencyMarker('CONFIRM', 'same-confirm-key', { transferId: 'transfer-1', userId: 'warehouse-1' })}`,
                },
            ],
        }));
        await expect(service.confirm('transfer-1', 'warehouse-1', 'same-confirm-key')).resolves.toEqual(expect.objectContaining({ status: client_1.InventoryTransferStatus.CONFIRMED }));
        expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
        expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    });
    it('rejects a different confirm idempotency key after completion instead of silently returning success', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer({
            status: client_1.InventoryTransferStatus.CONFIRMED,
            confirmedAt: now,
            inventoryMovements: [
                {
                    id: 'movement-out',
                    type: client_1.InventoryMovementType.TRANSFER_OUT,
                    reason: `Inventory transfer TRF-20260629-000001 confirmed ${idempotencyMarker('CONFIRM', 'same-confirm-key', { transferId: 'transfer-1', userId: 'warehouse-1' })}`,
                },
            ],
        }));
        await expect(service.confirm('transfer-1', 'warehouse-1', 'different-confirm-key')).rejects.toBeInstanceOf(common_1.ConflictException);
        expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
        expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    });
    it('returns an already cancelled transfer only when the cancel idempotency key and payload match the persisted marker', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer({
            status: client_1.InventoryTransferStatus.CANCELLED,
            cancelledAt: now,
            cancelledByUserId: 'warehouse-1',
            cancellationReason: `Operational mistake ${idempotencyMarker('CANCEL', 'same-cancel-key', { transferId: 'transfer-1', userId: 'warehouse-1', reason: 'Operational mistake' })}`,
        }));
        await expect(service.cancel('transfer-1', { reason: 'Operational mistake' }, 'warehouse-1', 'same-cancel-key')).resolves.toEqual(expect.objectContaining({
            status: client_1.InventoryTransferStatus.CANCELLED,
            cancellationReason: 'Operational mistake',
        }));
        expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    });
    it('rejects a different cancel idempotency key after completion instead of silently returning success', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer({
            status: client_1.InventoryTransferStatus.CANCELLED,
            cancelledAt: now,
            cancelledByUserId: 'warehouse-1',
            cancellationReason: `Operational mistake ${idempotencyMarker('CANCEL', 'same-cancel-key', { transferId: 'transfer-1', userId: 'warehouse-1', reason: 'Operational mistake' })}`,
        }));
        await expect(service.cancel('transfer-1', { reason: 'Operational mistake' }, 'warehouse-1', 'different-cancel-key')).rejects.toBeInstanceOf(common_1.ConflictException);
        expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    });
    it('rejects a repeated cancel without an idempotency key and does not mutate terminal cancellation fields', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(createTransfer({
            status: client_1.InventoryTransferStatus.CANCELLED,
            cancelledAt: now,
            cancelledByUserId: 'warehouse-1',
            cancellationReason: 'Operational mistake',
        }));
        await expect(service.cancel('transfer-1', { reason: 'Second cancellation reason' }, 'warehouse-2')).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.inventoryTransfer.update).not.toHaveBeenCalled();
    });
    it('throws NotFound when a transfer does not exist', async () => {
        const { service, prisma } = createService();
        prisma.inventoryTransfer.findUnique.mockResolvedValue(null);
        await expect(service.findOne('missing-transfer')).rejects.toBeInstanceOf(common_1.NotFoundException);
    });
});
//# sourceMappingURL=inventory-transfers.service.spec.js.map