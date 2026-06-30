"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const client_1 = require("@prisma/client");
const supertest_1 = __importDefault(require("supertest"));
const auth_service_1 = require("../auth/auth.service");
const inventory_controller_1 = require("./inventory.controller");
const inventory_service_1 = require("./inventory.service");
const adminUser = {
    id: 'admin-1',
    name: 'Development Admin',
    email: 'admin@pollos.local',
    role: 'ADMIN',
    mustChangePassword: false,
};
const warehouseUser = {
    id: 'warehouse-1',
    name: 'Warehouse User',
    email: 'warehouse@pollos.local',
    role: 'WAREHOUSE',
    mustChangePassword: false,
};
const sellerUser = {
    id: 'seller-1',
    name: 'Seller User',
    email: 'seller@pollos.local',
    role: 'SELLER',
    mustChangePassword: false,
};
const movementResponse = {
    id: 'movement-1',
    productId: 'product-1',
    productName: 'Pechuga',
    locationId: 'location-1',
    locationName: 'Matriz',
    type: client_1.InventoryMovementType.ADJUSTMENT,
    unit: client_1.ProductUnit.KG,
    quantityKg: 2.5,
    quantityPieces: 0,
    previousQuantityKg: 7.5,
    newQuantityKg: 10,
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
    userId: 'warehouse-1',
    createdAt: new Date('2026-06-29T12:00:00.000Z'),
};
const balanceResponse = {
    productId: 'product-1',
    productName: 'Pechuga',
    sku: 'PECH-001',
    unit: client_1.ProductUnit.KG,
    locationId: 'location-1',
    locationName: 'Matriz',
    quantityKg: 8,
    quantityPieces: 0,
    minQuantityKg: 10,
    minQuantityPieces: 0,
    isLowStock: true,
};
describe('InventoryController API', () => {
    let app;
    let authService;
    let inventoryService;
    beforeEach(async () => {
        authService = {
            verifyAccessToken: jest.fn((token) => {
                if (token === 'admin-token')
                    return Promise.resolve(adminUser);
                if (token === 'warehouse-token')
                    return Promise.resolve(warehouseUser);
                if (token === 'seller-token')
                    return Promise.resolve(sellerUser);
                return Promise.reject(new Error('Invalid token'));
            }),
        };
        inventoryService = {
            createAdjustment: jest.fn().mockResolvedValue(movementResponse),
            findBalances: jest.fn().mockResolvedValue({ items: [balanceResponse] }),
            findMovements: jest.fn().mockResolvedValue({ items: [movementResponse] }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [inventory_controller_1.InventoryController],
            providers: [
                { provide: auth_service_1.AuthService, useValue: authService },
                { provide: inventory_service_1.InventoryService, useValue: inventoryService },
            ],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('api');
        app.useGlobalPipes(new common_1.ValidationPipe({
            forbidUnknownValues: true,
            transform: true,
            whitelist: true,
        }));
        await app.init();
    });
    afterEach(async () => {
        await app.close();
    });
    it('creates inventory adjustments through the documented wrapper and authenticated user', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/inventory/adjustments')
            .set('Authorization', 'Bearer warehouse-token')
            .send({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            quantityKg: 2.5,
            quantityPieces: 0,
            unit: client_1.ProductUnit.KG,
            reason: 'Physical count correction',
            referenceType: 'MANUAL',
        })
            .expect(201)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Inventory adjustment registered successfully',
                data: {
                    ...movementResponse,
                    createdAt: '2026-06-29T12:00:00.000Z',
                },
            });
        });
        expect(inventoryService.createAdjustment).toHaveBeenCalledWith(expect.objectContaining({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            unit: client_1.ProductUnit.KG,
            quantityKg: 2.5,
            reason: 'Physical count correction',
        }), 'warehouse-1');
    });
    it('lists inventory movements with documented filters', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/inventory/movements?productId=product-1&locationId=location-1&type=ADJUSTMENT&referenceType=MANUAL')
            .set('Authorization', 'Bearer admin-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Inventory movements retrieved successfully',
                data: {
                    items: [
                        {
                            ...movementResponse,
                            createdAt: '2026-06-29T12:00:00.000Z',
                        },
                    ],
                },
            });
        });
        expect(inventoryService.findMovements).toHaveBeenCalledWith(expect.objectContaining({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            referenceType: 'MANUAL',
        }));
    });
    it('lists inventory balances for ADMIN, WAREHOUSE, and SELLER without consolidating global stock', async () => {
        for (const token of ['admin-token', 'warehouse-token', 'seller-token']) {
            await (0, supertest_1.default)(app.getHttpServer())
                .get('/api/inventory/balances?locationId=location-1&search=pech&lowStock=true')
                .set('Authorization', `Bearer ${token}`)
                .expect(200)
                .expect(({ body }) => {
                expect(body).toEqual({
                    success: true,
                    message: 'Inventory balances retrieved successfully',
                    data: {
                        items: [balanceResponse],
                    },
                });
            });
        }
        expect(inventoryService.findBalances).toHaveBeenCalledWith(expect.objectContaining({
            locationId: 'location-1',
            search: 'pech',
            lowStock: true,
        }));
    });
    it('rejects invalid movement date filters before calling the service', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/inventory/movements?dateFrom=not-a-date&dateTo=2026-06-30')
            .set('Authorization', 'Bearer admin-token')
            .expect(400)
            .expect(({ body }) => {
            expect(body.message).toEqual(expect.arrayContaining([
                expect.stringContaining('dateFrom must be a valid ISO 8601 date'),
            ]));
        });
        expect(inventoryService.findMovements).not.toHaveBeenCalled();
    });
    it('rejects SELLER access and invalid adjustment payloads', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/inventory/movements')
            .set('Authorization', 'Bearer seller-token')
            .expect(403);
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/inventory/adjustments')
            .set('Authorization', 'Bearer admin-token')
            .send({
            productId: 'product-1',
            locationId: 'location-1',
            type: client_1.InventoryMovementType.ADJUSTMENT,
            quantityKg: 2.5,
            unit: client_1.ProductUnit.KG,
        })
            .expect(400);
        expect(inventoryService.createAdjustment).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=inventory.controller.spec.js.map