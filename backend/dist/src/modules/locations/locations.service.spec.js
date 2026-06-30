"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const locations_service_1 = require("./locations.service");
const now = new Date('2026-06-29T12:00:00.000Z');
function createLocation(overrides = {}) {
    return {
        id: 'location-1',
        name: 'Almacén Principal',
        code: 'ALM-001',
        type: client_1.OperationalLocationType.WAREHOUSE,
        parentId: null,
        address: 'Dirección operativa',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}
function createPrisma() {
    return {
        operationalLocation: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        },
        inventoryTransfer: { findFirst: jest.fn() },
        pointOfSaleDailyClose: { findFirst: jest.fn() },
        deliveryRoute: { findFirst: jest.fn() },
    };
}
function createService(prisma = createPrisma()) {
    return {
        service: new locations_service_1.LocationsService(prisma),
        prisma,
    };
}
describe('LocationsService', () => {
    it('lists operational locations with active-by-default filters and no required hierarchy', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findMany.mockResolvedValue([
            createLocation(),
            createLocation({
                id: 'location-2',
                name: 'Pollería externa',
                code: 'EXT-001',
                type: client_1.OperationalLocationType.EXTERNAL_POINT_OF_SALE,
                parentId: null,
            }),
        ]);
        await expect(service.findAll({
            page: 2,
            limit: 5,
            search: 'alm',
            type: client_1.OperationalLocationType.WAREHOUSE,
            parentId: 'parent-1',
        })).resolves.toEqual({
            items: [
                expect.objectContaining({
                    id: 'location-1',
                    type: client_1.OperationalLocationType.WAREHOUSE,
                    parentId: null,
                    isActive: true,
                    createdAt: now,
                    updatedAt: now,
                }),
                expect.objectContaining({
                    id: 'location-2',
                    type: client_1.OperationalLocationType.EXTERNAL_POINT_OF_SALE,
                    parentId: null,
                }),
            ],
        });
        expect(prisma.operationalLocation.findMany).toHaveBeenCalledWith({
            where: expect.objectContaining({
                isActive: true,
                type: client_1.OperationalLocationType.WAREHOUSE,
                parentId: 'parent-1',
                OR: [
                    { name: { contains: 'alm', mode: 'insensitive' } },
                    { code: { contains: 'alm', mode: 'insensitive' } },
                    { address: { contains: 'alm', mode: 'insensitive' } },
                ],
            }),
            orderBy: { name: 'asc' },
            skip: 5,
            take: 5,
        });
    });
    it('creates active branch, warehouse, mixed, external POS, and route stock locations without forcing parentId', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findUnique.mockResolvedValue(null);
        prisma.operationalLocation.create.mockImplementation(({ data }) => Promise.resolve(createLocation(data)));
        const supportedTypes = [
            client_1.OperationalLocationType.BRANCH,
            client_1.OperationalLocationType.WAREHOUSE,
            client_1.OperationalLocationType.MIXED,
            client_1.OperationalLocationType.EXTERNAL_POINT_OF_SALE,
            client_1.OperationalLocationType.ROUTE_STOCK,
        ];
        for (const type of supportedTypes) {
            await expect(service.create({ name: `${type} location`, code: type, type })).resolves.toEqual(expect.objectContaining({ type, isActive: true }));
        }
        expect(prisma.operationalLocation.create).toHaveBeenLastCalledWith({
            data: expect.objectContaining({
                name: 'ROUTE_STOCK location',
                code: 'ROUTE_STOCK',
                type: client_1.OperationalLocationType.ROUTE_STOCK,
                parentId: null,
                isActive: true,
            }),
        });
    });
    it('enforces unique codes and existing parent locations before writing', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findUnique.mockResolvedValueOnce(createLocation({ id: 'duplicate-location' }));
        await expect(service.create({
            name: 'Almacén duplicado',
            code: 'ALM-001',
            type: client_1.OperationalLocationType.WAREHOUSE,
        })).rejects.toBeInstanceOf(common_1.ConflictException);
        prisma.operationalLocation.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(null);
        await expect(service.create({
            name: 'Almacén hijo',
            code: 'ALM-002',
            type: client_1.OperationalLocationType.WAREHOUSE,
            parentId: 'missing-parent',
        })).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.operationalLocation.create).not.toHaveBeenCalled();
    });
    it('updates administrative data and soft-deactivates without physical delete', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findUnique.mockResolvedValueOnce(createLocation());
        prisma.operationalLocation.update.mockResolvedValueOnce(createLocation({ address: 'Nueva dirección' }));
        await expect(service.update('location-1', { address: 'Nueva dirección' })).resolves.toEqual(expect.objectContaining({ address: 'Nueva dirección' }));
        expect(prisma.operationalLocation.update).toHaveBeenCalledWith({
            where: { id: 'location-1' },
            data: { address: 'Nueva dirección' },
        });
        prisma.operationalLocation.findFirst.mockResolvedValueOnce(createLocation());
        prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
        prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce(null);
        prisma.deliveryRoute.findFirst.mockResolvedValueOnce(null);
        prisma.operationalLocation.update.mockResolvedValueOnce(createLocation({ isActive: false }));
        await expect(service.deactivate('location-1')).resolves.toEqual(expect.objectContaining({ isActive: false }));
        expect(prisma.operationalLocation.update).toHaveBeenLastCalledWith({
            where: { id: 'location-1' },
            data: { isActive: false },
        });
        expect(prisma.operationalLocation).not.toHaveProperty('delete');
    });
    it('blocks deactivation when open operational dependencies still use the location', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findFirst.mockResolvedValue(createLocation());
        prisma.inventoryTransfer.findFirst.mockResolvedValueOnce({
            id: 'transfer-1',
            status: client_1.InventoryTransferStatus.IN_TRANSIT,
        });
        await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
        prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce({
            id: 'close-1',
            status: client_1.PointOfSaleDailyCloseStatus.DRAFT,
        });
        await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
        prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce(null);
        prisma.deliveryRoute.findFirst.mockResolvedValueOnce({
            id: 'route-1',
        });
        await expect(service.deactivate('location-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
    });
    it('runs the same dependency guard when PATCH deactivates a location', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findUnique.mockResolvedValueOnce(createLocation());
        prisma.inventoryTransfer.findFirst.mockResolvedValueOnce({
            id: 'transfer-1',
            status: client_1.InventoryTransferStatus.IN_TRANSIT,
        });
        await expect(service.update('location-1', { isActive: false })).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.operationalLocation.update).not.toHaveBeenCalled();
        prisma.operationalLocation.findUnique.mockResolvedValueOnce(createLocation());
        prisma.inventoryTransfer.findFirst.mockResolvedValueOnce(null);
        prisma.pointOfSaleDailyClose.findFirst.mockResolvedValueOnce(null);
        prisma.deliveryRoute.findFirst.mockResolvedValueOnce(null);
        prisma.operationalLocation.update.mockResolvedValueOnce(createLocation({ isActive: false }));
        await expect(service.update('location-1', { isActive: false })).resolves.toEqual(expect.objectContaining({ isActive: false }));
    });
    it('blocks inactive locations from new sales, purchases, adjustments, and transfers', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findUnique.mockResolvedValue(createLocation({ isActive: false }));
        await expect(service.assertLocationCanBeUsedForSale('location-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        await expect(service.assertLocationCanBeUsedForPurchase('location-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        await expect(service.assertLocationCanBeUsedForAdjustment('location-1')).rejects.toBeInstanceOf(common_1.BadRequestException);
        await expect(service.assertLocationsCanBeUsedForTransfer('location-1', 'location-2')).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.operationalLocation.findUnique).toHaveBeenCalledWith({
            where: { id: 'location-1' },
            select: { id: true, isActive: true },
        });
    });
    it('returns NotFoundException for missing location reads or operational usage checks', async () => {
        const { service, prisma } = createService();
        prisma.operationalLocation.findUnique.mockResolvedValue(null);
        await expect(service.findOne('missing-location')).rejects.toBeInstanceOf(common_1.NotFoundException);
        await expect(service.assertLocationCanBeUsedForSale('missing-location')).rejects.toBeInstanceOf(common_1.NotFoundException);
    });
});
//# sourceMappingURL=locations.service.spec.js.map