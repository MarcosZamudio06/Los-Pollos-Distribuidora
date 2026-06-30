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
const products_controller_1 = require("./products.controller");
const products_service_1 = require("./products.service");
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
const productResponse = {
    id: 'product-1',
    name: 'Pechuga de pollo',
    sku: 'PECH-001',
    description: 'Pechuga por kilogramo',
    categoryId: 'category-1',
    presentationType: client_1.ProductPresentationType.CUT,
    salePrice: 120,
    purchaseCost: 90,
    minStock: 10,
    unit: client_1.ProductUnit.KG,
    pieceWeightEquivalent: null,
    equivalentPolicyStatus: client_1.EquivalentStatus.DRAFT,
    isActive: true,
};
describe('ProductsController API', () => {
    let app;
    let authService;
    let productsService;
    beforeEach(async () => {
        authService = {
            verifyAccessToken: jest.fn((token) => {
                if (token === 'admin-token') {
                    return Promise.resolve(adminUser);
                }
                if (token === 'warehouse-token') {
                    return Promise.resolve(warehouseUser);
                }
                if (token === 'seller-token') {
                    return Promise.resolve(sellerUser);
                }
                return Promise.reject(new Error('Invalid token'));
            }),
        };
        productsService = {
            findAll: jest.fn().mockResolvedValue({ items: [productResponse] }),
            findOne: jest.fn().mockResolvedValue(productResponse),
            create: jest.fn().mockResolvedValue(productResponse),
            update: jest.fn().mockResolvedValue(productResponse),
            deactivate: jest.fn().mockResolvedValue({
                ...productResponse,
                isActive: false,
            }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [products_controller_1.ProductsController],
            providers: [
                { provide: auth_service_1.AuthService, useValue: authService },
                { provide: products_service_1.ProductsService, useValue: productsService },
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
    it.each([
        ['GET', '/api/products'],
        ['GET', '/api/products/product-1'],
    ])('allows SELLER read access for %s %s', async (method, path) => {
        await (0, supertest_1.default)(app.getHttpServer())[method.toLowerCase()](path)
            .set('Authorization', 'Bearer seller-token')
            .expect(200);
    });
    it.each([
        ['POST', '/api/products'],
        ['PATCH', '/api/products/product-1'],
        ['DELETE', '/api/products/product-1'],
    ])('rejects %s %s when the user is SELLER', async (method, path) => {
        await (0, supertest_1.default)(app.getHttpServer())[method.toLowerCase()](path)
            .set('Authorization', 'Bearer seller-token')
            .send({})
            .expect(403);
    });
    it('lists products with filters and the documented wrapper', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/products?presentationType=CUT&unit=KG&isActive=true')
            .set('Authorization', 'Bearer warehouse-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Products retrieved successfully',
                data: { items: [productResponse] },
            });
            expect(JSON.stringify(body)).not.toContain('stock');
        });
        expect(productsService.findAll).toHaveBeenCalledWith(expect.objectContaining({
            presentationType: client_1.ProductPresentationType.CUT,
            unit: client_1.ProductUnit.KG,
            isActive: true,
        }));
    });
    it('creates products with semantic presentation and rejects global stock payloads', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/products')
            .set('Authorization', 'Bearer admin-token')
            .send({
            name: 'Pechuga de pollo',
            sku: 'PECH-001',
            presentationType: client_1.ProductPresentationType.CUT,
            salePrice: 120,
            purchaseCost: 90,
            minStock: 10,
            unit: client_1.ProductUnit.KG,
            equivalentPolicyStatus: client_1.EquivalentStatus.DRAFT,
        })
            .expect(201)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Product created successfully',
                data: productResponse,
            });
        });
        expect(productsService.create).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Pechuga de pollo',
            presentationType: client_1.ProductPresentationType.CUT,
            salePrice: 120,
            unit: client_1.ProductUnit.KG,
        }));
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/products')
            .set('Authorization', 'Bearer admin-token')
            .send({
            name: 'Invalid stock product',
            presentationType: client_1.ProductPresentationType.CUT,
            salePrice: 120,
            purchaseCost: 90,
            minStock: 10,
            unit: client_1.ProductUnit.KG,
            stock: 100,
        })
            .expect(400);
    });
    it('updates and soft-deletes products through documented routes', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .patch('/api/products/product-1')
            .set('Authorization', 'Bearer warehouse-token')
            .send({ salePrice: 125, stock: 10 })
            .expect(400);
        expect(productsService.update).not.toHaveBeenCalled();
        await (0, supertest_1.default)(app.getHttpServer())
            .patch('/api/products/product-1')
            .set('Authorization', 'Bearer warehouse-token')
            .send({ salePrice: 125 })
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Product updated successfully',
                data: productResponse,
            });
        });
        expect(productsService.update).toHaveBeenCalledWith('product-1', {
            salePrice: 125,
        });
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/products/product-1')
            .set('Authorization', 'Bearer admin-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body.data).toEqual(expect.objectContaining({ isActive: false }));
        });
    });
});
//# sourceMappingURL=products.controller.spec.js.map