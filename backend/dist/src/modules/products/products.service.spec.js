"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const products_service_1 = require("./products.service");
const now = new Date('2026-06-28T12:00:00.000Z');
function decimal(value) {
    return new client_1.Prisma.Decimal(value);
}
function createProduct(overrides = {}) {
    return {
        id: 'product-1',
        name: 'Pechuga de pollo',
        sku: 'PECH-001',
        description: 'Pechuga por kilogramo',
        categoryId: 'category-1',
        presentationType: client_1.ProductPresentationType.CUT,
        salePrice: decimal(120),
        purchaseCost: decimal(90),
        minStock: decimal(10),
        unit: client_1.ProductUnit.KG,
        pieceWeightEquivalent: null,
        equivalentPolicyStatus: client_1.EquivalentStatus.DRAFT,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}
function createPrisma() {
    return {
        product: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        category: {
            findFirst: jest.fn(),
        },
    };
}
function createService(prisma = createPrisma()) {
    return {
        service: new products_service_1.ProductsService(prisma),
        prisma,
    };
}
describe('ProductsService', () => {
    it('creates an active semantic product without global stock and maps numeric fields', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValue(null);
        prisma.category.findFirst.mockResolvedValue({ id: 'category-1' });
        prisma.product.create.mockImplementation(({ data }) => Promise.resolve(createProduct(data)));
        const result = await service.create({
            name: 'Pechuga de pollo',
            sku: ' pech-001 ',
            description: 'Pechuga por kilogramo',
            categoryId: 'category-1',
            presentationType: client_1.ProductPresentationType.CUT,
            salePrice: 120,
            purchaseCost: 90,
            minStock: 10,
            unit: client_1.ProductUnit.KG,
            equivalentPolicyStatus: client_1.EquivalentStatus.DRAFT,
        });
        expect(prisma.product.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                name: 'Pechuga de pollo',
                sku: 'PECH-001',
                presentationType: client_1.ProductPresentationType.CUT,
                salePrice: 120,
                purchaseCost: 90,
                minStock: 10,
                unit: client_1.ProductUnit.KG,
                isActive: true,
            }),
            include: expect.any(Object),
        });
        expect(prisma.product.create.mock.calls[0][0].data).not.toHaveProperty('stock');
        expect(result).toEqual(expect.objectContaining({
            sku: 'PECH-001',
            salePrice: 120,
            purchaseCost: 90,
            minStock: 10,
            unit: client_1.ProductUnit.KG,
            isActive: true,
        }));
        expect(result).not.toHaveProperty('stock');
    });
    it('rejects invalid money and kilo/piece products without equivalent factor or policy status', async () => {
        const { service, prisma } = createService();
        await expect(service.create({
            name: 'Pollo entero',
            presentationType: client_1.ProductPresentationType.WHOLE,
            salePrice: 0,
            purchaseCost: 80,
            minStock: 0,
            unit: client_1.ProductUnit.PIECE,
        })).rejects.toBeInstanceOf(common_1.BadRequestException);
        await expect(service.create({
            name: 'Pollo kilo pieza',
            presentationType: client_1.ProductPresentationType.WHOLE,
            salePrice: 100,
            purchaseCost: -1,
            minStock: 0,
            unit: client_1.ProductUnit.KG_AND_PIECE,
        })).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.product.create).not.toHaveBeenCalled();
    });
    it('rejects kilo/piece products with inactive equivalent policy and no piece weight equivalent', async () => {
        const { service, prisma } = createService();
        prisma.product.findFirst.mockResolvedValueOnce(createProduct({ unit: client_1.ProductUnit.KG_AND_PIECE }));
        prisma.product.create.mockImplementation(({ data }) => Promise.resolve(createProduct(data)));
        prisma.product.update.mockImplementation(({ data }) => Promise.resolve(createProduct(data)));
        const invalidKiloPieceData = {
            name: 'Pollo kilo pieza',
            presentationType: client_1.ProductPresentationType.WHOLE,
            salePrice: 100,
            purchaseCost: 80,
            minStock: 0,
            unit: client_1.ProductUnit.KG_AND_PIECE,
            equivalentPolicyStatus: client_1.EquivalentStatus.INACTIVE,
        };
        await expect(service.create(invalidKiloPieceData)).rejects.toBeInstanceOf(common_1.BadRequestException);
        await expect(service.update('product-1', {
            unit: client_1.ProductUnit.KG_AND_PIECE,
            equivalentPolicyStatus: client_1.EquivalentStatus.INACTIVE,
        })).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.product.create).not.toHaveBeenCalled();
        expect(prisma.product.update).not.toHaveBeenCalled();
    });
    it('enforces unique SKU and maps unique races to ConflictException', async () => {
        const { service, prisma } = createService();
        prisma.product.findUnique.mockResolvedValueOnce(createProduct());
        await expect(service.create({
            name: 'Pechuga duplicada',
            sku: 'PECH-001',
            presentationType: client_1.ProductPresentationType.CUT,
            salePrice: 120,
            purchaseCost: 90,
            minStock: 0,
            unit: client_1.ProductUnit.KG,
        })).rejects.toBeInstanceOf(common_1.ConflictException);
        prisma.product.findUnique.mockResolvedValueOnce(null);
        prisma.product.create.mockRejectedValueOnce({ code: 'P2002' });
        await expect(service.create({
            name: 'Pechuga carrera',
            sku: 'RACE-001',
            presentationType: client_1.ProductPresentationType.CUT,
            salePrice: 120,
            purchaseCost: 90,
            minStock: 0,
            unit: client_1.ProductUnit.KG,
        })).rejects.toBeInstanceOf(common_1.ConflictException);
    });
    it('lists products with optional operational-location balance and low-stock guard', async () => {
        const { service, prisma } = createService();
        prisma.product.findMany.mockResolvedValue([
            createProduct({
                inventoryBalances: [
                    {
                        locationId: 'location-1',
                        quantityKg: decimal(3),
                        quantityPieces: 0,
                        minQuantityKg: decimal(5),
                        minQuantityPieces: 0,
                    },
                ],
            }),
        ]);
        const result = await service.findAll({
            locationId: 'location-1',
            lowStock: true,
            isActive: true,
        });
        expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ isActive: true }),
            include: expect.objectContaining({
                inventoryBalances: expect.any(Object),
            }),
        }));
        expect(result.items).toEqual([
            expect.objectContaining({
                id: 'product-1',
                inventoryBalance: expect.objectContaining({
                    locationId: 'location-1',
                    quantityKg: 3,
                    quantityPieces: 0,
                    isLowStock: true,
                }),
            }),
        ]);
        expect(result.items[0]).not.toHaveProperty('stock');
        await expect(service.findAll({ lowStock: true })).rejects.toBeInstanceOf(common_1.BadRequestException);
    });
    it('soft-deletes products and blocks inactive products from future sales', async () => {
        const { service, prisma } = createService();
        prisma.product.findFirst.mockResolvedValueOnce(createProduct());
        prisma.product.update.mockResolvedValueOnce(createProduct({ isActive: false }));
        await expect(service.deactivate('product-1')).resolves.toEqual(expect.objectContaining({ isActive: false }));
        expect(prisma.product.update).toHaveBeenCalledWith({
            where: { id: 'product-1' },
            data: { isActive: false },
            include: expect.any(Object),
        });
        prisma.product.findUnique.mockResolvedValueOnce(createProduct({ isActive: false }));
        await expect(service.assertProductCanBeSold('product-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        prisma.product.findFirst.mockResolvedValueOnce(null);
        await expect(service.deactivate('missing-product')).rejects.toBeInstanceOf(common_1.NotFoundException);
    });
});
//# sourceMappingURL=products.service.spec.js.map