"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const product_equivalences_service_1 = require("./product-equivalences.service");
const now = new Date('2026-06-29T12:00:00.000Z');
function decimal(value) {
    return new client_1.Prisma.Decimal(value);
}
function createPrisma() {
    return {
        product: { findFirst: jest.fn() },
        productUnitEquivalent: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        saleItem: { count: jest.fn().mockResolvedValue(0) },
        purchaseItem: { count: jest.fn().mockResolvedValue(0) },
    };
}
function createEquivalent(overrides = {}) {
    return {
        id: 'equivalence-1',
        productId: 'product-1',
        unitFrom: client_1.ProductUnit.PIECE,
        unitTo: client_1.ProductUnit.KG,
        factor: decimal('1.8'),
        roundingMode: 'PENDING_BUSINESS_RULE',
        effectiveFrom: new Date('2026-06-19T00:00:00.000Z'),
        effectiveTo: null,
        status: client_1.EquivalentStatus.DRAFT,
        approvedByUserId: null,
        createdByUserId: 'admin-1',
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}
function createService(prisma = createPrisma()) {
    return {
        service: new product_equivalences_service_1.ProductEquivalencesService(prisma),
        prisma,
    };
}
describe('ProductEquivalencesService', () => {
    it('creates a draft equivalence and maps decimal factors to numbers', async () => {
        const { service, prisma } = createService();
        prisma.product.findFirst.mockResolvedValue({ id: 'product-1', isActive: true });
        prisma.productUnitEquivalent.findFirst.mockResolvedValue(null);
        prisma.productUnitEquivalent.create.mockImplementation(({ data }) => Promise.resolve(createEquivalent(data)));
        const result = await service.create('product-1', 'admin-1', {
            unitFrom: client_1.ProductUnit.PIECE,
            unitTo: client_1.ProductUnit.KG,
            factor: 1.8,
            roundingMode: 'PENDING_BUSINESS_RULE',
            effectiveFrom: '2026-06-19',
            effectiveTo: null,
            status: client_1.EquivalentStatus.DRAFT,
        });
        expect(prisma.productUnitEquivalent.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                productId: 'product-1',
                unitFrom: client_1.ProductUnit.PIECE,
                unitTo: client_1.ProductUnit.KG,
                factor: 1.8,
                roundingMode: 'PENDING_BUSINESS_RULE',
                status: client_1.EquivalentStatus.DRAFT,
                createdByUserId: 'admin-1',
            }),
        });
        expect(result).toEqual(expect.objectContaining({ id: 'equivalence-1', factor: 1.8 }));
    });
    it('rejects same units and active date overlaps for the product unit pair', async () => {
        const { service, prisma } = createService();
        prisma.product.findFirst.mockResolvedValue({ id: 'product-1', isActive: true });
        await expect(service.create('product-1', 'admin-1', {
            unitFrom: client_1.ProductUnit.KG,
            unitTo: client_1.ProductUnit.KG,
            factor: 1.8,
            status: client_1.EquivalentStatus.DRAFT,
        })).rejects.toBeInstanceOf(common_1.BadRequestException);
        await expect(service.create('product-1', 'admin-1', {
            unitFrom: client_1.ProductUnit.KG_AND_PIECE,
            unitTo: client_1.ProductUnit.KG,
            factor: 1.8,
            status: client_1.EquivalentStatus.DRAFT,
        })).rejects.toBeInstanceOf(common_1.BadRequestException);
        prisma.productUnitEquivalent.findFirst.mockResolvedValue(createEquivalent({ status: client_1.EquivalentStatus.ACTIVE }));
        await expect(service.create('product-1', 'admin-1', {
            unitFrom: client_1.ProductUnit.PIECE,
            unitTo: client_1.ProductUnit.KG,
            factor: 1.7,
            effectiveFrom: '2026-07-01',
            status: client_1.EquivalentStatus.ACTIVE,
        })).rejects.toBeInstanceOf(common_1.ConflictException);
    });
    it('activates only equivalences with effectiveFrom and without active overlap', async () => {
        const { service, prisma } = createService();
        prisma.productUnitEquivalent.findUnique.mockResolvedValue(createEquivalent({ status: client_1.EquivalentStatus.DRAFT, effectiveFrom: new Date('2026-06-19T00:00:00.000Z') }));
        prisma.productUnitEquivalent.findFirst.mockResolvedValue(null);
        prisma.productUnitEquivalent.update.mockResolvedValue(createEquivalent({ status: client_1.EquivalentStatus.ACTIVE }));
        const result = await service.activate('equivalence-1', 'admin-1');
        expect(prisma.productUnitEquivalent.update).toHaveBeenCalledWith({
            where: { id: 'equivalence-1' },
            data: { status: client_1.EquivalentStatus.ACTIVE, approvedByUserId: 'admin-1' },
        });
        expect(result.status).toBe(client_1.EquivalentStatus.ACTIVE);
    });
    it('rejects overwriting active or historically used equivalence factors and vigencies', async () => {
        const { service, prisma } = createService();
        prisma.productUnitEquivalent.findUnique.mockResolvedValueOnce(createEquivalent({ status: client_1.EquivalentStatus.ACTIVE, factor: decimal('1.8') }));
        await expect(service.update('equivalence-1', 'admin-1', { factor: 1.9 })).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.productUnitEquivalent.update).not.toHaveBeenCalled();
        prisma.productUnitEquivalent.findUnique.mockResolvedValueOnce(createEquivalent({ status: client_1.EquivalentStatus.INACTIVE, factor: decimal('1.8') }));
        prisma.saleItem.count.mockResolvedValueOnce(1);
        prisma.purchaseItem.count.mockResolvedValueOnce(0);
        await expect(service.update('equivalence-1', 'admin-1', { effectiveFrom: '2026-07-01' })).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.productUnitEquivalent.update).not.toHaveBeenCalled();
    });
    it('records approval actor when PATCH activates an equivalence', async () => {
        const { service, prisma } = createService();
        prisma.productUnitEquivalent.findUnique.mockResolvedValue(createEquivalent({ status: client_1.EquivalentStatus.DRAFT, effectiveFrom: new Date('2026-06-19T00:00:00.000Z') }));
        prisma.productUnitEquivalent.findFirst.mockResolvedValue(null);
        prisma.productUnitEquivalent.update.mockResolvedValue(createEquivalent({ status: client_1.EquivalentStatus.ACTIVE, approvedByUserId: 'admin-1' }));
        const result = await service.update('equivalence-1', 'admin-1', { status: client_1.EquivalentStatus.ACTIVE });
        expect(prisma.productUnitEquivalent.update).toHaveBeenCalledWith({
            where: { id: 'equivalence-1' },
            data: { status: client_1.EquivalentStatus.ACTIVE, approvedByUserId: 'admin-1' },
        });
        expect(result.approvedByUserId).toBe('admin-1');
    });
    it('returns not found for missing equivalences and deactivates without deletion', async () => {
        const { service, prisma } = createService();
        prisma.productUnitEquivalent.findUnique.mockResolvedValueOnce(null);
        await expect(service.deactivate('missing-id')).rejects.toBeInstanceOf(common_1.NotFoundException);
        prisma.productUnitEquivalent.findUnique.mockResolvedValueOnce(createEquivalent({ status: client_1.EquivalentStatus.ACTIVE }));
        prisma.productUnitEquivalent.update.mockResolvedValueOnce(createEquivalent({ status: client_1.EquivalentStatus.INACTIVE }));
        const result = await service.deactivate('equivalence-1');
        expect(prisma.productUnitEquivalent.update).toHaveBeenCalledWith({
            where: { id: 'equivalence-1' },
            data: { status: client_1.EquivalentStatus.INACTIVE },
        });
        expect(result.status).toBe(client_1.EquivalentStatus.INACTIVE);
    });
});
//# sourceMappingURL=product-equivalences.service.spec.js.map