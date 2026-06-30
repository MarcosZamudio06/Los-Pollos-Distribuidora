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
const inventory_transfers_controller_1 = require("./inventory-transfers.controller");
const inventory_transfers_service_1 = require("./inventory-transfers.service");
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
const transferResponse = {
    id: 'transfer-1',
    transferNumber: 'TRF-20260629-000001',
    originLocationId: 'origin-1',
    destinationLocationId: 'destination-1',
    status: client_1.InventoryTransferStatus.REQUESTED,
    userId: 'warehouse-1',
    notes: 'Route load',
    requestedAt: new Date('2026-06-29T12:00:00.000Z'),
    confirmedAt: null,
    cancelledAt: null,
    cancelledByUserId: null,
    cancellationReason: null,
    itemsCount: 1,
    createdAt: new Date('2026-06-29T12:00:00.000Z'),
    updatedAt: new Date('2026-06-29T12:00:00.000Z'),
    items: [
        {
            productId: 'product-1',
            productName: 'Pollo mixto',
            unit: client_1.ProductUnit.KG_AND_PIECE,
            quantityKg: 12.5,
            quantityPieces: 3,
        },
    ],
    movements: [],
};
const confirmedTransferResponse = {
    ...transferResponse,
    status: client_1.InventoryTransferStatus.CONFIRMED,
    confirmedAt: new Date('2026-06-29T12:05:00.000Z'),
    movements: [
        {
            id: 'movement-out',
            productId: 'product-1',
            productName: 'Pollo mixto',
            locationId: 'origin-1',
            locationName: 'Matriz',
            type: client_1.InventoryMovementType.TRANSFER_OUT,
            unit: client_1.ProductUnit.KG_AND_PIECE,
            quantityKg: 12.5,
            quantityPieces: 3,
            previousQuantityKg: 30,
            newQuantityKg: 17.5,
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
            userId: 'warehouse-1',
            createdAt: new Date('2026-06-29T12:05:00.000Z'),
        },
    ],
};
describe('InventoryTransfersController API', () => {
    let app;
    let authService;
    let transfersService;
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
        transfersService = {
            findAll: jest.fn().mockResolvedValue({ items: [transferResponse] }),
            findOne: jest.fn().mockResolvedValue(transferResponse),
            create: jest.fn().mockResolvedValue(transferResponse),
            confirm: jest.fn().mockResolvedValue(confirmedTransferResponse),
            cancel: jest.fn().mockResolvedValue({
                ...transferResponse,
                status: client_1.InventoryTransferStatus.CANCELLED,
                cancelledAt: new Date('2026-06-29T12:10:00.000Z'),
                cancelledByUserId: 'warehouse-1',
                cancellationReason: 'Operational mistake',
            }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [inventory_transfers_controller_1.InventoryTransfersController],
            providers: [
                { provide: auth_service_1.AuthService, useValue: authService },
                { provide: inventory_transfers_service_1.InventoryTransfersService, useValue: transfersService },
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
    it('exposes only documented transfer list and detail routes to ADMIN and WAREHOUSE', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/inventory-transfers?originLocationId=origin-1&status=REQUESTED')
            .set('Authorization', 'Bearer admin-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Inventory transfers retrieved successfully',
                data: {
                    items: [
                        {
                            ...transferResponse,
                            requestedAt: '2026-06-29T12:00:00.000Z',
                            createdAt: '2026-06-29T12:00:00.000Z',
                            updatedAt: '2026-06-29T12:00:00.000Z',
                        },
                    ],
                },
            });
        });
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/inventory-transfers/transfer-1')
            .set('Authorization', 'Bearer warehouse-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body.data.id).toBe('transfer-1');
            expect(body.data.items).toHaveLength(1);
        });
        expect(transfersService.findAll).toHaveBeenCalledWith(expect.objectContaining({
            originLocationId: 'origin-1',
            status: client_1.InventoryTransferStatus.REQUESTED,
        }));
        expect(transfersService.findOne).toHaveBeenCalledWith('transfer-1');
    });
    it('creates transfer requests with authenticated responsible user and validates body quantities', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/inventory-transfers')
            .set('Authorization', 'Bearer warehouse-token')
            .send({
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
        })
            .expect(201)
            .expect(({ body }) => {
            expect(body.data.id).toBe('transfer-1');
            expect(body.data.items[0]).toEqual(expect.objectContaining({
                productId: 'product-1',
                quantityKg: 12.5,
                quantityPieces: 3,
            }));
        });
        expect(transfersService.create).toHaveBeenCalledWith(expect.objectContaining({
            originLocationId: 'origin-1',
            destinationLocationId: 'destination-1',
            items: [
                expect.objectContaining({
                    unit: client_1.ProductUnit.KG_AND_PIECE,
                    quantityKg: 12.5,
                    quantityPieces: 3,
                }),
            ],
        }), 'warehouse-1');
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/inventory-transfers')
            .set('Authorization', 'Bearer admin-token')
            .send({
            originLocationId: 'origin-1',
            destinationLocationId: 'destination-1',
            items: [{ productId: 'product-1', unit: client_1.ProductUnit.KG }],
        })
            .expect(400);
    });
    it('confirms and cancels transfers through documented command routes with responsible user', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/inventory-transfers/transfer-1/confirm')
            .set('Authorization', 'Bearer warehouse-token')
            .expect(201)
            .expect(({ body }) => {
            expect(body.data.status).toBe(client_1.InventoryTransferStatus.CONFIRMED);
            expect(body.data.movements).toEqual([
                expect.objectContaining({ type: client_1.InventoryMovementType.TRANSFER_OUT }),
            ]);
        });
        expect(transfersService.confirm).toHaveBeenCalledWith('transfer-1', 'warehouse-1');
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/inventory-transfers/transfer-1/cancel')
            .set('Authorization', 'Bearer warehouse-token')
            .send({ reason: 'Operational mistake' })
            .expect(201)
            .expect(({ body }) => {
            expect(body.data.status).toBe(client_1.InventoryTransferStatus.CANCELLED);
            expect(body.data.cancelledByUserId).toBe('warehouse-1');
        });
        expect(transfersService.cancel).toHaveBeenCalledWith('transfer-1', expect.objectContaining({ reason: 'Operational mistake' }), 'warehouse-1');
    });
    it('rejects SELLER access to transfer routes', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/inventory-transfers')
            .set('Authorization', 'Bearer seller-token')
            .expect(403);
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/inventory-transfers')
            .set('Authorization', 'Bearer seller-token')
            .send({
            originLocationId: 'origin-1',
            destinationLocationId: 'destination-1',
            items: [
                { productId: 'product-1', unit: client_1.ProductUnit.KG, quantityKg: 1 },
            ],
        })
            .expect(403);
    });
});
//# sourceMappingURL=inventory-transfers.controller.spec.js.map