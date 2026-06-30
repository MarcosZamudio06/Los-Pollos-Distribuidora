"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const testing_1 = require("@nestjs/testing");
const supertest_1 = __importDefault(require("supertest"));
const auth_controller_1 = require("./auth.controller");
const auth_service_1 = require("./auth.service");
const authenticatedUser = {
    id: 'user-1',
    name: 'Development Admin',
    email: 'dev.admin@pollos.local',
    role: 'ADMIN',
    mustChangePassword: false,
};
describe('AuthController API', () => {
    let app;
    let authService;
    beforeEach(async () => {
        authService = {
            login: jest.fn().mockResolvedValue({
                accessToken: 'access-token',
                refreshToken: 'refresh-token',
                user: authenticatedUser,
            }),
            refresh: jest.fn().mockResolvedValue({
                accessToken: 'new-access-token',
                refreshToken: 'new-refresh-token',
                user: authenticatedUser,
            }),
            logout: jest.fn().mockReturnValue({ success: true }),
            verifyAccessToken: jest.fn().mockResolvedValue(authenticatedUser),
            changeOwnPassword: jest.fn().mockResolvedValue({
                ...authenticatedUser,
                mustChangePassword: false,
            }),
        };
        const moduleFixture = await testing_1.Test.createTestingModule({
            controllers: [auth_controller_1.AuthController],
            providers: [{ provide: auth_service_1.AuthService, useValue: authService }],
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
    it('returns the documented login response for valid credentials', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email: authenticatedUser.email, password: 'valid-password' })
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Sesión iniciada correctamente',
                data: {
                    accessToken: 'access-token',
                    refreshToken: 'refresh-token',
                    user: authenticatedUser,
                },
            });
        });
    });
    it('rejects login when email is missing', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/login')
            .send({ password: 'valid-password' })
            .expect(400);
        expect(authService.login).not.toHaveBeenCalled();
    });
    it('rejects login when password is missing', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/login')
            .send({ email: authenticatedUser.email })
            .expect(400);
        expect(authService.login).not.toHaveBeenCalled();
    });
    it('returns refreshed tokens for a valid refresh token', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/refresh')
            .send({ refreshToken: 'refresh-token' })
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Sesión renovada correctamente',
                data: {
                    accessToken: 'new-access-token',
                    refreshToken: 'new-refresh-token',
                    user: authenticatedUser,
                },
            });
        });
    });
    it('rejects /me when no bearer token is provided', async () => {
        await (0, supertest_1.default)(app.getHttpServer()).get('/api/auth/me').expect(401);
        expect(authService.verifyAccessToken).not.toHaveBeenCalled();
    });
    it('returns the authenticated user for /me with a valid token', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/auth/me')
            .set('Authorization', 'Bearer access-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Usuario autenticado',
                data: { user: authenticatedUser },
            });
        });
    });
    it('rejects logout when no bearer token is provided', async () => {
        await (0, supertest_1.default)(app.getHttpServer()).post('/api/auth/logout').expect(401);
        expect(authService.logout).not.toHaveBeenCalled();
    });
    it('returns the logout response for an authenticated request', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/logout')
            .set('Authorization', 'Bearer access-token')
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Sesión cerrada correctamente',
                data: { success: true },
            });
        });
    });
    it('allows a pending-password user to change their own password with a bearer token', async () => {
        authService.verifyAccessToken.mockResolvedValue({
            ...authenticatedUser,
            mustChangePassword: true,
        });
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/change-password')
            .set('Authorization', 'Bearer access-token')
            .send({
            currentPassword: 'temporary-123',
            newPassword: 'new-secure-123',
        })
            .expect(200)
            .expect(({ body }) => {
            expect(body).toEqual({
                success: true,
                message: 'Contraseña actualizada correctamente',
                data: {
                    ...authenticatedUser,
                    mustChangePassword: false,
                },
            });
            expect(JSON.stringify(body)).not.toContain('passwordHash');
        });
        expect(authService.changeOwnPassword).toHaveBeenCalledWith('user-1', {
            currentPassword: 'temporary-123',
            newPassword: 'new-secure-123',
        });
    });
    it('rejects own password change without a bearer token', async () => {
        await (0, supertest_1.default)(app.getHttpServer())
            .post('/api/auth/change-password')
            .send({
            currentPassword: 'temporary-123',
            newPassword: 'new-secure-123',
        })
            .expect(401);
        expect(authService.changeOwnPassword).not.toHaveBeenCalled();
    });
    it('maps invalid bearer tokens to 401 at API level', async () => {
        authService.verifyAccessToken.mockRejectedValue(new common_1.UnauthorizedException('Invalid token'));
        await (0, supertest_1.default)(app.getHttpServer())
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalid-token')
            .expect(401);
    });
});
//# sourceMappingURL=auth.controller.spec.js.map