"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
function createHttpContext(authorization) {
    return {
        switchToHttp: () => ({
            getRequest: () => ({ headers: { authorization } }),
        }),
    };
}
describe('JwtAuthGuard', () => {
    it('rejects /auth/me when no bearer token is provided', async () => {
        const guard = new jwt_auth_guard_1.JwtAuthGuard({});
        await expect(guard.canActivate(createHttpContext())).rejects.toBeInstanceOf(common_1.UnauthorizedException);
    });
    it('accepts a valid bearer token and attaches the authenticated user', async () => {
        const request = { headers: { authorization: 'Bearer valid-access-token' } };
        const authService = {
            verifyAccessToken: jest.fn().mockResolvedValue({
                id: 'user-1',
                name: 'Development Admin',
                email: 'dev.admin@pollos.local',
                role: 'ADMIN',
                mustChangePassword: false,
            }),
        };
        const guard = new jwt_auth_guard_1.JwtAuthGuard(authService);
        const context = {
            switchToHttp: () => ({ getRequest: () => request }),
        };
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(request).toMatchObject({
            user: {
                id: 'user-1',
                name: 'Development Admin',
                email: 'dev.admin@pollos.local',
                role: 'ADMIN',
                mustChangePassword: false,
            },
        });
    });
    it('rejects normal protected access when the user must change password', async () => {
        const request = { headers: { authorization: 'Bearer valid-access-token' } };
        const authService = {
            verifyAccessToken: jest.fn().mockResolvedValue({
                id: 'user-1',
                name: 'Development Admin',
                email: 'dev.admin@pollos.local',
                role: 'ADMIN',
                mustChangePassword: true,
            }),
        };
        const guard = new jwt_auth_guard_1.JwtAuthGuard(authService);
        const context = {
            switchToHttp: () => ({ getRequest: () => request }),
        };
        await expect(guard.canActivate(context)).rejects.toBeInstanceOf(common_1.ForbiddenException);
        expect(request).not.toHaveProperty('user');
    });
    it('allows the password-change exception route when the user must change password', async () => {
        const request = { headers: { authorization: 'Bearer valid-access-token' } };
        const authService = {
            verifyAccessToken: jest.fn().mockResolvedValue({
                id: 'user-1',
                name: 'Development Admin',
                email: 'dev.admin@pollos.local',
                role: 'ADMIN',
                mustChangePassword: true,
            }),
        };
        const reflector = {
            getAllAndOverride: jest.fn().mockReturnValue(true),
        };
        const guard = new jwt_auth_guard_1.JwtAuthGuard(authService, reflector);
        const handler = jest.fn();
        const controller = class AuthController {
        };
        const context = {
            getHandler: () => handler,
            getClass: () => controller,
            switchToHttp: () => ({ getRequest: () => request }),
        };
        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(request).toMatchObject({
            user: {
                id: 'user-1',
                mustChangePassword: true,
            },
        });
    });
});
//# sourceMappingURL=jwt-auth.guard.spec.js.map