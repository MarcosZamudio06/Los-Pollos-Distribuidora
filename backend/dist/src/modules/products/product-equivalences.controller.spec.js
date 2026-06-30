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
const product_equivalences_controller_1 = require("./product-equivalences.controller");
const product_equivalences_service_1 = require("./product-equivalences.service");
const adminUser = { id: 'admin-1', name: 'Admin', email: 'admin@pollos.local', role: 'ADMIN', mustChangePassword: false };
const warehouseUser = { id: 'warehouse-1', name: 'Warehouse', email: 'warehouse@pollos.local', role: 'WAREHOUSE', mustChangePassword: false };
const sellerUser = { id: 'seller-1', name: 'Seller', email: 'seller@pollos.local', role: 'SELLER', mustChangePassword: false };
const equivalenceResponse = {
    id: 'equivalence-1',
    productId: 'product-1',
    unitFrom: client_1.ProductUnit.PIECE,
    unitTo: client_1.ProductUnit.KG,
    factor: 1.8,
    roundingMode: 'PENDING_BUSINESS_RULE',
    effectiveFrom: '2026-06-19T00:00:00.000Z',
    effectiveTo: null,
    status: client_1.EquivalentStatus.DRAFT,
    approvedByUserId: null,
    createdByUserId: 'admin-1',
};
describe('ProductEquivalencesController API', () => {
    let app;
    let service;
    beforeEach(async () => {
        const authService = {
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
        service = {
            findAll: jest.fn().mockResolvedValue({ items: [equivalenceResponse] }),
            create: jest.fn().mockResolvedValue(equivalenceResponse),
            update: jest.fn().mockResolvedValue(equivalenceResponse),
            activate: jest.fn().mockResolvedValue({ ...equivalenceResponse, status: client_1.EquivalentStatus.ACTIVE }),
            deactivate: jest.fn().mockResolvedValue({ ...equivalenceResponse, status: client_1.EquivalentStatus.INACTIVE }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [product_equivalences_controller_1.ProductEquivalencesController],
            providers: [
                { provide: auth_service_1.AuthService, useValue: authService },
                { provide: product_equivalences_service_1.ProductEquivalencesService, useValue: service },
            ],
        }).compile();
        app = moduleFixture.createNestApplication();
        app.setGlobalPrefix('api');
        app.useGlobalPipes(new common_1.ValidationPipe({ forbidUnknownValues: true, transform: true, whitelist: true }));
        await app.init();
    });
    afterEach(async () => {
        await app.close();
    });
    it('allows SELLER read access and forwards documented filters', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/products/product-1/equivalences?status=DRAFT&unitFrom=PIECE&unitTo=KG&date=2026-06-29')
            .set('Authorization', 'Bearer seller-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({ success: true, message: 'Product equivalences retrieved successfully', data: { items: [equivalenceResponse] } });
        });
        expect(service.findAll).toHaveBeenCalledWith('product-1', expect.objectContaining({ status: client_1.EquivalentStatus.DRAFT, unitFrom: client_1.ProductUnit.PIECE, unitTo: client_1.ProductUnit.KG, date: '2026-06-29' }));
    });
    it('allows ADMIN to create, activate, and deactivate equivalences', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/products/product-1/equivalences')
            .set('Authorization', 'Bearer admin-token')
            .send({ unitFrom: client_1.ProductUnit.PIECE, unitTo: client_1.ProductUnit.KG, factor: 1.8, roundingMode: 'PENDING_BUSINESS_RULE', effectiveFrom: '2026-06-19', status: client_1.EquivalentStatus.DRAFT })
            .expect(201);
        expect(service.create).toHaveBeenCalledWith('product-1', 'admin-1', expect.objectContaining({ factor: 1.8 }));
        await (0, supertest_1.default)(app.getHttpServer()).post('/api/product-equivalences/equivalence-1/activate').set('Authorization', 'Bearer admin-token').expect(201);
        expect(service.activate).toHaveBeenCalledWith('equivalence-1', 'admin-1');
        await (0, supertest_1.default)(app.getHttpServer()).post('/api/product-equivalences/equivalence-1/deactivate').set('Authorization', 'Bearer admin-token').expect(201);
        expect(service.deactivate).toHaveBeenCalledWith('equivalence-1');
    });
    it('rejects SELLER and WAREHOUSE mutations', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/products/product-1/equivalences')
            .set('Authorization', 'Bearer warehouse-token')
            .send({ unitFrom: client_1.ProductUnit.PIECE, unitTo: client_1.ProductUnit.KG, factor: 1.8, status: client_1.EquivalentStatus.DRAFT })
            .expect(403);
        await (0, supertest_1.default)(app.getHttpServer())
            .patch('/api/product-equivalences/equivalence-1')
            .set('Authorization', 'Bearer seller-token')
            .send({ factor: 1.9 })
            .expect(403);
    });
    it('passes the current admin to PATCH and rejects invalid equivalence units at DTO level', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .patch('/api/product-equivalences/equivalence-1')
            .set('Authorization', 'Bearer admin-token')
            .send({ status: client_1.EquivalentStatus.INACTIVE })
            .expect(200);
        expect(service.update).toHaveBeenCalledWith('equivalence-1', 'admin-1', expect.objectContaining({ status: client_1.EquivalentStatus.INACTIVE }));
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/products/product-1/equivalences')
            .set('Authorization', 'Bearer admin-token')
            .send({ unitFrom: client_1.ProductUnit.KG_AND_PIECE, unitTo: client_1.ProductUnit.KG, factor: 1.8, status: client_1.EquivalentStatus.DRAFT })
            .expect(400);
    });
});
//# sourceMappingURL=product-equivalences.controller.spec.js.map