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
const locations_controller_1 = require("./locations.controller");
const locations_service_1 = require("./locations.service");
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
const driverUser = {
    id: 'driver-1',
    name: 'Driver User',
    email: 'driver@pollos.local',
    role: 'DRIVER',
    mustChangePassword: false,
};
const locationResponse = {
    id: 'location-1',
    name: 'Almacén Principal',
    code: 'ALM-001',
    type: client_1.OperationalLocationType.WAREHOUSE,
    parentId: null,
    address: 'Dirección operativa',
    isActive: true,
    createdAt: '2026-06-29T12:00:00.000Z',
    updatedAt: '2026-06-29T12:00:00.000Z',
};
describe('LocationsController API', () => {
    let app;
    let authService;
    let locationsService;
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
                if (token === 'driver-token') {
                    return Promise.resolve(driverUser);
                }
                return Promise.reject(new Error('Invalid token'));
            }),
        };
        locationsService = {
            findAll: jest.fn().mockResolvedValue({ items: [locationResponse] }),
            findOne: jest.fn().mockResolvedValue(locationResponse),
            create: jest.fn().mockResolvedValue(locationResponse),
            update: jest.fn().mockResolvedValue(locationResponse),
            deactivate: jest.fn().mockResolvedValue({
                ...locationResponse,
                isActive: false,
            }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [locations_controller_1.LocationsController],
            providers: [
                { provide: auth_service_1.AuthService, useValue: authService },
                { provide: locations_service_1.LocationsService, useValue: locationsService },
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
    it('exposes documented read routes for operational roles with filters', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/locations?page=1&limit=10&type=WAREHOUSE&isActive=true')
            .set('Authorization', 'Bearer seller-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Locations retrieved successfully',
                data: { items: [locationResponse] },
            });
        });
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/locations/location-1')
            .set('Authorization', 'Bearer driver-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body.data).toEqual(locationResponse);
        });
        expect(locationsService.findAll).toHaveBeenCalledWith(expect.objectContaining({
            page: 1,
            limit: 10,
            type: client_1.OperationalLocationType.WAREHOUSE,
            isActive: true,
        }));
        expect(locationsService.findOne).toHaveBeenCalledWith('location-1');
    });
    it('allows only ADMIN to create locations and validates the documented type catalog', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/locations')
            .set('Authorization', 'Bearer admin-token')
            .send({
            name: 'Punto externo',
            code: 'EXT-001',
            type: client_1.OperationalLocationType.EXTERNAL_POINT_OF_SALE,
            address: 'Dirección operativa',
        })
            .expect(201)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Location created successfully',
                data: locationResponse,
            });
        });
        expect(locationsService.create).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Punto externo',
            code: 'EXT-001',
            type: client_1.OperationalLocationType.EXTERNAL_POINT_OF_SALE,
        }));
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/locations')
            .set('Authorization', 'Bearer warehouse-token')
            .send({ name: 'Almacén', type: client_1.OperationalLocationType.WAREHOUSE })
            .expect(403);
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/locations')
            .set('Authorization', 'Bearer admin-token')
            .send({ name: 'Inválida', type: 'KITCHEN' })
            .expect(400);
    });
    it('updates and soft-deactivates locations through documented admin routes', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .patch('/api/locations/location-1')
            .set('Authorization', 'Bearer admin-token')
            .send({ address: 'Nueva dirección', isActive: true })
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Location updated successfully',
                data: locationResponse,
            });
        });
        expect(locationsService.update).toHaveBeenCalledWith('location-1', {
            address: 'Nueva dirección',
            isActive: true,
        });
        await (0, supertest_1.default)(app.getHttpServer())
            .delete('/api/locations/location-1')
            .set('Authorization', 'Bearer admin-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body.data).toEqual(expect.objectContaining({ isActive: false }));
        });
        expect(locationsService.deactivate).toHaveBeenCalledWith('location-1');
    });
});
//# sourceMappingURL=locations.controller.spec.js.map