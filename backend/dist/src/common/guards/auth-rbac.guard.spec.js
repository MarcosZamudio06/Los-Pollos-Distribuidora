"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const auth_service_1 = require("../../modules/auth/auth.service");
const current_user_decorator_1 = require("../decorators/current-user.decorator");
const roles_decorator_1 = require("../decorators/roles.decorator");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const roles_guard_1 = require("./roles.guard");
const adminUser = {
    id: 'user-1',
    name: 'Development Admin',
    email: 'dev.admin@pollos.local',
    role: 'ADMIN',
    mustChangePassword: false,
};
const cashierUser = {
    id: 'user-2',
    name: 'Development Cashier',
    email: 'dev.cashier@pollos.local',
    role: 'CASHIER',
    mustChangePassword: false,
};
let GuardTestController = class GuardTestController {
    protected(user) {
        return { user };
    }
    adminOnly(user) {
        return { user };
    }
};
__decorate([
    (0, common_1.Get)('protected'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GuardTestController.prototype, "protected", null);
__decorate([
    (0, common_1.Get)('admin'),
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, roles_guard_1.RolesGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GuardTestController.prototype, "adminOnly", null);
GuardTestController = __decorate([
    (0, common_1.Controller)('guard-test')
], GuardTestController);
describe('Common auth and RBAC guards', () => {
    let app;
    let authService;
    beforeEach(async () => {
        authService = {
            verifyAccessToken: jest.fn((token) => {
                if (token === 'admin-token') {
                    return Promise.resolve(adminUser);
                }
                if (token === 'cashier-token') {
                    return Promise.resolve(cashierUser);
                }
                return Promise.reject(new Error('Invalid token'));
            }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [GuardTestController],
            providers: [
                jwt_auth_guard_1.JwtAuthGuard,
                roles_guard_1.RolesGuard,
                { provide: auth_service_1.AuthService, useValue: authService },
            ],
        }).compile();
        app = moduleFixture.createNestApplication();
        await app.init();
    });
    afterEach(async () => {
        await app.close();
    });
    it('rejects a protected endpoint when no bearer token is provided', async () => {
        await (0, supertest_1.default)(app.getHttpServer()).get('/guard-test/protected').expect(401);
        expect(authService.verifyAccessToken).not.toHaveBeenCalled();
    });
    it('injects the current user for a protected endpoint with a valid bearer token', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/guard-test/protected')
            .set('Authorization', 'Bearer admin-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({ user: adminUser });
        });
    });
    it('allows a restricted endpoint when the authenticated user has an allowed role', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/guard-test/admin')
            .set('Authorization', 'Bearer admin-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({ user: adminUser });
        });
    });
    it('rejects a restricted endpoint when the authenticated user has the wrong role', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/guard-test/admin')
            .set('Authorization', 'Bearer cashier-token')
            .expect(403);
    });
});
//# sourceMappingURL=auth-rbac.guard.spec.js.map