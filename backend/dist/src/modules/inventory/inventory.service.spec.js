"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const inventory_service_1 = require("./inventory.service");
const now = new Date('2026-06-29T12:00:00.000Z');
function decimal(value) {
    return new client_1.Prisma.Decimal(value);
}
function createPrisma() {
    const prisma = {
        $transaction: jest.fn(),
        product: { findUnique: jest.fn() },
        operationalLocation: { findUnique: jest.fn() },
        inventoryBalance: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            upsert: jest.fn(),
        },
        inventoryMovement: { create: jest.fn(), findMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    return prisma;
}
function createService(prisma = createPrisma()) {
    return {
        service: new inventory_service_1.InventoryService(prisma),
        prisma,
    };
}
describe('InventoryService', () => {
    it('registers a kilo adjustment in one transaction and creates the movement with operational location balances', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValue({
            id: 'product-1',
            name: 'Pechuga',
            unit: client_1.ProductUnit.KG,
            isActive: true,
        });
        prisma.operationalLocation.findUnique.mockResolvedValue({
            id: 'location-1',
            name: 'Matriz',
            isActive: true,
        });
        prisma.inventoryBalance.upsert.mockResolvedValue({});
        prisma.inventoryBalance.findUnique.mockResolvedValue({
            id: 'balance-1',
            productId: 'product-1',
            locationId: 'location-1',
            quantityKg: decimal('10.000'),
            quantityPieces: 0,
            minQuantityKg: decimal(0),
            minQuantityPieces: 0,
        });
        prisma.inventoryMovement.create.mockImplementation(({ data }) => Promise.resolve({
            id: 'movement-1',
            createdAt: now,
            product: { name: 'Pechuga' },
            location: { name: 'Matriz' },
            ...data,
        }));
        const result = await service.createAdjustment({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            unit: client_1.ProductUnit.KG,
            quantityKg: 2.5,
            reason: 'Physical count correction',
            referenceType: 'MANUAL',
        }, 'user-1');
        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.inventoryBalance.upsert).toHaveBeenCalledWith({
            where: {
                productId_locationId: {
                    productId: 'product-1',
                    locationId: 'location-1',
                },
            },
            create: {
                productId: 'product-1',
                locationId: 'location-1',
                quantityKg: 2.5,
                quantityPieces: 0,
            },
            update: {
                quantityKg: { increment: 2.5 },
                quantityPieces: { increment: 0 },
            },
        });
        expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
        expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                productId: 'product-1',
                locationId: 'location-1',
                userId: 'user-1',
                type: client_1.InventoryMovementType.ADJUSTMENT,
                quantity: 2.5,
                quantityKg: 2.5,
                quantityPieces: 0,
                previousQuantityKg: 7.5,
                newQuantityKg: 10,
                previousQuantityPieces: 0,
                newQuantityPieces: 0,
                reason: 'Physical count correction',
                referenceType: 'MANUAL',
            }),
            include: { product: true, location: true },
        });
        expect(result).toEqual(expect.objectContaining({
            id: 'movement-1',
            productId: 'product-1',
            productName: 'Pechuga',
            locationId: 'location-1',
            locationName: 'Matriz',
            quantityKg: 2.5,
            previousQuantityKg: 7.5,
            newQuantityKg: 10,
        }));
    });
    it('rejects manual adjustments without a reason before changing balances', async () => {
        const { service, prisma } = createService();
        await expect(service.createAdjustment({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            unit: client_1.ProductUnit.KG,
            quantityKg: 1,
        }, 'user-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });
    it('does not allow shrinkage to make location stock negative', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValue({
            id: 'product-1',
            name: 'Pechuga',
            unit: client_1.ProductUnit.KG,
            isActive: true,
        });
        prisma.operationalLocation.findUnique.mockResolvedValue({
            id: 'location-1',
            name: 'Matriz',
            isActive: true,
        });
        prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.createAdjustment({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.SHRINKAGE,
            unit: client_1.ProductUnit.KG,
            quantityKg: 3,
            reason: 'Spoilage found during count',
        }, 'user-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
        expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });
    it('decrements stock through a guarded atomic update so concurrent shrinkage cannot cross below zero', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValue({
            id: 'product-1',
            name: 'Pechuga',
            unit: client_1.ProductUnit.KG,
            isActive: true,
        });
        prisma.operationalLocation.findUnique.mockResolvedValue({
            id: 'location-1',
            name: 'Matriz',
            isActive: true,
        });
        prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 1 });
        prisma.inventoryBalance.findUnique.mockResolvedValue({
            id: 'balance-1',
            productId: 'product-1',
            locationId: 'location-1',
            quantityKg: decimal(3),
            quantityPieces: 0,
            minQuantityKg: decimal(0),
            minQuantityPieces: 0,
        });
        prisma.inventoryMovement.create.mockImplementation(({ data }) => Promise.resolve({
            id: 'movement-1',
            createdAt: now,
            product: { name: 'Pechuga' },
            location: { name: 'Matriz' },
            ...data,
        }));
        await service.createAdjustment({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.SHRINKAGE,
            unit: client_1.ProductUnit.KG,
            quantityKg: 2,
            reason: 'Spoilage found during count',
        }, 'user-1');
        expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
            where: {
                productId: 'product-1',
                locationId: 'location-1',
                quantityKg: { gte: 2 },
                quantityPieces: { gte: 0 },
            },
            data: {
                quantityKg: { decrement: 2 },
                quantityPieces: { decrement: 0 },
            },
        });
        expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
        expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                previousQuantityKg: 5,
                newQuantityKg: 3,
            }),
        }));
    });
    it('rejects negative stock when the guarded database update does not match a balance row', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValue({
            id: 'product-1',
            name: 'Pechuga',
            unit: client_1.ProductUnit.KG,
            isActive: true,
        });
        prisma.operationalLocation.findUnique.mockResolvedValue({
            id: 'location-1',
            name: 'Matriz',
            isActive: true,
        });
        prisma.inventoryBalance.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.createAdjustment({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.SHRINKAGE,
            unit: client_1.ProductUnit.KG,
            quantityKg: 2,
            reason: 'Spoilage found during count',
        }, 'user-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.inventoryBalance.updateMany).toHaveBeenCalledWith({
            where: {
                productId: 'product-1',
                locationId: 'location-1',
                quantityKg: { gte: 2 },
                quantityPieces: { gte: 0 },
            },
            data: {
                quantityKg: { decrement: 2 },
                quantityPieces: { decrement: 0 },
            },
        });
        expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
    });
    it('increments stock through an atomic upsert instead of writing absolute balance values', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValue({
            id: 'product-1',
            name: 'Pechuga',
            unit: client_1.ProductUnit.KG,
            isActive: true,
        });
        prisma.operationalLocation.findUnique.mockResolvedValue({
            id: 'location-1',
            name: 'Matriz',
            isActive: true,
        });
        prisma.inventoryBalance.upsert.mockResolvedValue({});
        prisma.inventoryBalance.findUnique.mockResolvedValue({
            id: 'balance-1',
            productId: 'product-1',
            locationId: 'location-1',
            quantityKg: decimal(10),
            quantityPieces: 0,
            minQuantityKg: decimal(0),
            minQuantityPieces: 0,
        });
        prisma.inventoryMovement.create.mockImplementation(({ data }) => Promise.resolve({
            id: 'movement-1',
            createdAt: now,
            product: { name: 'Pechuga' },
            location: { name: 'Matriz' },
            ...data,
        }));
        await service.createAdjustment({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            unit: client_1.ProductUnit.KG,
            quantityKg: 2.5,
            reason: 'Physical count correction',
        }, 'user-1');
        expect(prisma.inventoryBalance.upsert).toHaveBeenCalledWith({
            where: {
                productId_locationId: {
                    productId: 'product-1',
                    locationId: 'location-1',
                },
            },
            create: {
                productId: 'product-1',
                locationId: 'location-1',
                quantityKg: 2.5,
                quantityPieces: 0,
            },
            update: {
                quantityKg: { increment: 2.5 },
                quantityPieces: { increment: 0 },
            },
        });
        expect(prisma.inventoryBalance.update).not.toHaveBeenCalled();
        expect(prisma.inventoryMovement.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                previousQuantityKg: 7.5,
                newQuantityKg: 10,
            }),
        }));
    });
    it('registers piece adjustments only for piece-compatible products', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValue({
            id: 'product-1',
            name: 'Pollo entero',
            unit: client_1.ProductUnit.PIECE,
            isActive: true,
        });
        prisma.operationalLocation.findUnique.mockResolvedValue({
            id: 'location-1',
            name: 'Matriz',
            isActive: true,
        });
        prisma.inventoryBalance.upsert.mockResolvedValue({});
        prisma.inventoryBalance.findUnique.mockResolvedValue({
            id: 'balance-1',
            productId: 'product-1',
            locationId: 'location-1',
            quantityKg: decimal(0),
            quantityPieces: 4,
            minQuantityKg: decimal(0),
            minQuantityPieces: 0,
        });
        prisma.inventoryMovement.create.mockResolvedValue({
            id: 'movement-1',
            productId: 'product-1',
            locationId: 'location-1',
            userId: 'user-1',
            type: client_1.InventoryMovementType.RETURN,
            quantityKg: 0,
            quantityPieces: 4,
            previousQuantityKg: 0,
            newQuantityKg: 0,
            previousQuantityPieces: 0,
            newQuantityPieces: 4,
            reason: 'Customer return',
            referenceType: 'MANUAL',
            referenceId: null,
            transferId: null,
            saleId: null,
            purchaseId: null,
            routeSettlementId: null,
            pointOfSaleDailyCloseId: null,
            createdAt: now,
            product: { name: 'Pollo entero' },
            location: { name: 'Matriz' },
        });
        await expect(service.createAdjustment({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.RETURN,
            unit: client_1.ProductUnit.PIECE,
            quantityPieces: 4,
            reason: 'Customer return',
            referenceType: 'MANUAL',
        }, 'user-1')).resolves.toEqual(expect.objectContaining({ quantityPieces: 4 }));
        expect(prisma.inventoryBalance.upsert).toHaveBeenCalledWith({
            where: {
                productId_locationId: {
                    productId: 'product-1',
                    locationId: 'location-1',
                },
            },
            create: {
                productId: 'product-1',
                locationId: 'location-1',
                quantityKg: 0,
                quantityPieces: 4,
            },
            update: {
                quantityKg: { increment: 0 },
                quantityPieces: { increment: 4 },
            },
        });
        expect(prisma.inventoryBalance.create).not.toHaveBeenCalled();
    });
    it('lists movements with product and location names using the documented filters', async () => {
        const { service, prisma } = createService();
        prisma.inventoryMovement.findMany.mockResolvedValue([
            {
                id: 'movement-1',
                productId: 'product-1',
                locationId: 'location-1',
                userId: 'user-1',
                type: client_1.InventoryMovementType.ADJUSTMENT,
                quantityKg: decimal(2.5),
                quantityPieces: 0,
                previousQuantityKg: decimal(7.5),
                newQuantityKg: decimal(10),
                previousQuantityPieces: 0,
                newQuantityPieces: 0,
                reason: 'Physical count correction',
                referenceType: 'MANUAL',
                referenceId: null,
                transferId: null,
                saleId: null,
                purchaseId: null,
                routeSettlementId: null,
                pointOfSaleDailyCloseId: null,
                createdAt: now,
                product: { name: 'Pechuga' },
                location: { name: 'Matriz' },
            },
        ]);
        const result = await service.findMovements({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            referenceType: 'MANUAL',
            dateFrom: '2026-06-01T00:00:00.000Z',
            dateTo: '2026-06-30T23:59:59.999Z',
        });
        expect(prisma.inventoryMovement.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                productId: 'product-1',
                locationId: 'location-1',
                type: client_1.InventoryMovementType.ADJUSTMENT,
                referenceType: 'MANUAL',
                createdAt: {
                    gte: new Date('2026-06-01T00:00:00.000Z'),
                    lte: new Date('2026-06-30T23:59:59.999Z'),
                },
            }),
            include: { product: true, location: true },
            orderBy: { createdAt: 'desc' },
        }));
        expect(result.items).toEqual([
            expect.objectContaining({
                id: 'movement-1',
                productName: 'Pechuga',
                locationName: 'Matriz',
                previousQuantityKg: 7.5,
                newQuantityKg: 10,
            }),
        ]);
    });
    it('lists inventory balances by product and operational location without global consolidation', async () => {
        const { service, prisma } = createService();
        prisma.inventoryBalance.findMany.mockResolvedValue([
            {
                id: 'balance-1',
                productId: 'product-1',
                locationId: 'location-1',
                quantityKg: decimal(8),
                quantityPieces: 0,
                minQuantityKg: decimal(10),
                minQuantityPieces: 0,
                product: {
                    name: 'Pechuga',
                    sku: 'PECH-001',
                    unit: client_1.ProductUnit.KG,
                },
                location: { name: 'Matriz' },
            },
            {
                id: 'balance-2',
                productId: 'product-1',
                locationId: 'location-2',
                quantityKg: decimal(20),
                quantityPieces: 0,
                minQuantityKg: decimal(10),
                minQuantityPieces: 0,
                product: {
                    name: 'Pechuga',
                    sku: 'PECH-001',
                    unit: client_1.ProductUnit.KG,
                },
                location: { name: 'Sucursal Norte' },
            },
        ]);
        const result = await service.findBalances({
            productId: 'product-1',
            search: 'pech',
        });
        expect(prisma.inventoryBalance.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                productId: 'product-1',
                product: expect.objectContaining({
                    OR: expect.arrayContaining([
                        { name: { contains: 'pech', mode: 'insensitive' } },
                        { sku: { contains: 'pech', mode: 'insensitive' } },
                    ]),
                }),
            }),
            include: { product: true, location: true },
            orderBy: [{ location: { name: 'asc' } }, { product: { name: 'asc' } }],
        }));
        expect(result.items).toEqual([
            expect.objectContaining({
                productId: 'product-1',
                locationId: 'location-1',
                quantityKg: 8,
                minQuantityKg: 10,
                isLowStock: true,
            }),
            expect.objectContaining({
                productId: 'product-1',
                locationId: 'location-2',
                quantityKg: 20,
                isLowStock: false,
            }),
        ]);
    });
    it('rejects missing products and inactive locations', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValue(null);
        await expect(service.createAdjustment({
            productId: 'missing-product',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            unit: client_1.ProductUnit.KG,
            quantityKg: 1,
            reason: 'Physical count correction',
        }, 'user-1')).rejects.toBeInstanceOf(common_1.NotFoundException);
        prisma.product.findUnique.mockResolvedValue({
            id: 'product-1',
            name: 'Pechuga',
            unit: client_1.ProductUnit.KG,
            isActive: true,
        });
        prisma.operationalLocation.findUnique.mockResolvedValue({
            id: 'location-1',
            name: 'Closed store',
            isActive: false,
        });
        await expect(service.createAdjustment({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            unit: client_1.ProductUnit.KG,
            quantityKg: 1,
            reason: 'Physical count correction',
        }, 'user-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
});
//# sourceMappingURL=inventory.service.spec.js.map