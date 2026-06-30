"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const auth_service_1 = require("../auth/auth.service");
const categories_controller_1 = require("./categories.controller");
const categories_service_1 = require("./categories.service");
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
const categoryResponse = {
    id: 'category-1',
    name: 'Cortes',
    description: 'Cortes por kilogramo',
    isActive: true,
};
describe('CategoriesController API', () => {
    let app;
    let authService;
    let categoriesService;
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
        categoriesService = {
            findAll: jest.fn().mockResolvedValue({ items: [categoryResponse] }),
            create: jest.fn().mockResolvedValue(categoryResponse),
            update: jest.fn().mockResolvedValue(categoryResponse),
            deactivate: jest.fn().mockResolvedValue({
                ...categoryResponse,
                isActive: false,
            }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [categories_controller_1.CategoriesController],
            providers: [
                { provide: auth_service_1.AuthService, useValue: authService },
                { provide: categories_service_1.CategoriesService, useValue: categoriesService },
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
    it('allows ADMIN, WAREHOUSE, and SELLER to list categories with documented filters', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/categories?page=1&limit=10&search=cor&isActive=true')
            .set('Authorization', 'Bearer seller-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Categories retrieved successfully',
                data: { items: [categoryResponse] },
            });
        });
        expect(categoriesService.findAll).toHaveBeenCalledWith(expect.objectContaining({
            page: 1,
            limit: 10,
            search: 'cor',
            isActive: true,
        }));
    });
    it('allows ADMIN and WAREHOUSE to create and update categories, but rejects missing names', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/categories')
            .set('Authorization', 'Bearer warehouse-token')
            .send({ name: 'Cortes', description: 'Cortes por kilogramo' })
            .expect(201)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Category created successfully',
                data: categoryResponse,
            });
        });
        expect(categoriesService.create).toHaveBeenCalledWith({
            name: 'Cortes',
            description: 'Cortes por kilogramo',
        });
        await (0, supertest_1.default)(app.getHttpServer())
            .patch('/api/categories/category-1')
            .set('Authorization', 'Bearer admin-token')
            .send({ description: 'Cortes actualizados' })
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Category updated successfully',
                data: categoryResponse,
            });
        });
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/categories')
            .set('Authorization', 'Bearer admin-token')
            .send({ description: 'Sin nombre' })
            .expect(400);
    });
    it('rejects blank category names before reaching the service', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/categories')
            .set('Authorization', 'Bearer admin-token')
            .send({ name: '   ' })
            .expect(400);
        expect(categoriesService.create).not.toHaveBeenCalled();
    });
    it('restricts writes by role and soft-deactivates categories through DELETE', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/categories')
            .set('Authorization', 'Bearer seller-token')
            .send({ name: 'Cortes' })
            .expect(403);
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/categories/category-1')
            .set('Authorization', 'Bearer warehouse-token')
            .expect(403);
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/categories/category-1')
            .set('Authorization', 'Bearer admin-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Category deactivated successfully',
                data: { ...categoryResponse, isActive: false },
            });
        });
        expect(categoriesService.deactivate).toHaveBeenCalledWith('category-1');
    });
});
//# sourceMappingURL=categories.controller.spec.js.map