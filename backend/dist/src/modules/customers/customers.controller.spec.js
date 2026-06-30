"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const auth_service_1 = require("../auth/auth.service");
const customers_controller_1 = require("./customers.controller");
const customers_service_1 = require("./customers.service");
const adminUser = {
    id: 'admin-1',
    name: 'Development Admin',
    email: 'admin@pollos.local',
    role: 'ADMIN',
    mustChangePassword: false,
};
const sellerUser = {
    id: 'seller-1',
    name: 'Seller User',
    email: 'seller@pollos.local',
    role: 'SELLER',
    mustChangePassword: false,
};
const collectionsUser = {
    id: 'collections-1',
    name: 'Collections User',
    email: 'collections@pollos.local',
    role: 'COLLECTIONS',
    mustChangePassword: false,
};
const warehouseUser = {
    id: 'warehouse-1',
    name: 'Warehouse User',
    email: 'warehouse@pollos.local',
    role: 'WAREHOUSE',
    mustChangePassword: false,
};
const customerResponse = {
    id: 'customer-1',
    customerNumber: 'C-1024',
    name: 'Restaurante El Centro',
    commercialName: 'El Centro',
    phone: '2290000000',
    email: 'cliente@example.com',
    billingEmail: 'facturacion@cliente.com',
    address: 'Customer address',
    customerType: 'INSTITUTIONAL',
    priceListId: 'price-list-1',
    creditLimit: '50000',
    creditDays: 15,
    creditStatus: 'ACTIVE',
    requiresBilling: true,
    isBlockedForCredit: false,
    fiscalName: 'Razón social opcional',
    taxId: 'RFC123456789',
    fiscalAddress: 'Fiscal address',
    deliveryAddress: 'Delivery address',
    assignedRouteId: 'route-1',
    commercialPolicyId: 'policy-1',
    isActive: true,
};
describe('CustomersController API', () => {
    let app;
    let customersService;
    beforeEach(async () => {
        const authService = {
            verifyAccessToken: jest.fn((token) => {
                if (token === 'admin-token')
                    return Promise.resolve(adminUser);
                if (token === 'seller-token')
                    return Promise.resolve(sellerUser);
                if (token === 'collections-token')
                    return Promise.resolve(collectionsUser);
                if (token === 'warehouse-token')
                    return Promise.resolve(warehouseUser);
                return Promise.reject(new Error('Invalid token'));
            }),
        };
        customersService = {
            findAll: jest.fn().mockResolvedValue({ items: [customerResponse] }),
            findOne: jest.fn().mockResolvedValue(customerResponse),
            create: jest.fn().mockResolvedValue(customerResponse),
            update: jest.fn().mockResolvedValue(customerResponse),
            deactivate: jest.fn().mockResolvedValue({ ...customerResponse, isActive: false }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [customers_controller_1.CustomersController],
            providers: [
                { provide: auth_service_1.AuthService, useValue: authService },
                { provide: customers_service_1.CustomersService, useValue: customersService },
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
    it('allows documented roles to list and get customers with filters', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/customers?page=1&limit=10&search=centro&customerType=INSTITUTIONAL&creditStatus=ACTIVE&commercialPolicyId=policy-1&assignedRouteId=route-1&isActive=true')
            .set('Authorization', 'Bearer collections-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Customers retrieved successfully',
                data: { items: [customerResponse] },
            });
        });
        expect(customersService.findAll).toHaveBeenCalledWith(expect.objectContaining({
            page: 1,
            limit: 10,
            search: 'centro',
            customerType: 'INSTITUTIONAL',
            creditStatus: 'ACTIVE',
            commercialPolicyId: 'policy-1',
            assignedRouteId: 'route-1',
            isActive: true,
        }));
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/customers/customer-1')
            .set('Authorization', 'Bearer seller-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body.data).toEqual(customerResponse);
        });
        expect(customersService.findOne).toHaveBeenCalledWith('customer-1');
    });
    it('validates customer creation body and sends current user for commercial authorization', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/customers')
            .set('Authorization', 'Bearer admin-token')
            .send({
            name: 'Restaurante El Centro',
            phone: '2290000000',
            email: 'cliente@example.com',
            billingEmail: 'facturacion@cliente.com',
            customerType: 'INSTITUTIONAL',
            creditLimit: 50000,
            creditDays: 15,
            creditStatus: 'ACTIVE',
            requiresBilling: true,
            fiscalName: 'Razón social opcional',
        })
            .expect(201)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Customer created successfully',
                data: customerResponse,
            });
        });
        expect(customersService.create).toHaveBeenCalledWith(expect.objectContaining({ creditLimit: 50000, creditDays: 15 }), expect.objectContaining({ role: 'ADMIN' }));
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/customers')
            .set('Authorization', 'Bearer admin-token')
            .send({ phone: '2290000000', customerType: 'RETAIL' })
            .expect(400);
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/customers')
            .set('Authorization', 'Bearer admin-token')
            .send({ name: 'Invalid Email', email: 'not-an-email', customerType: 'RETAIL' })
            .expect(400);
    });
    it('updates customers and restricts deactivation to ADMIN soft delete route', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .patch('/api/customers/customer-1')
            .set('Authorization', 'Bearer seller-token')
            .send({ deliveryAddress: 'New delivery address' })
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Customer updated successfully',
                data: customerResponse,
            });
        });
        expect(customersService.update).toHaveBeenCalledWith('customer-1', { deliveryAddress: 'New delivery address' }, expect.objectContaining({ role: 'SELLER' }));
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/customers/customer-1')
            .set('Authorization', 'Bearer warehouse-token')
            .expect(403);
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/customers/customer-1')
            .set('Authorization', 'Bearer admin-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body.data).toEqual({ ...customerResponse, isActive: false });
        });
        expect(customersService.deactivate).toHaveBeenCalledWith('customer-1');
    });
});
//# sourceMappingURL=customers.controller.spec.js.map