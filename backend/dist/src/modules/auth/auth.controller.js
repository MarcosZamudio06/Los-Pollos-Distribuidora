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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const allow_password_change_required_decorator_1 = require("../../common/decorators/allow-password-change-required.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_auth_guard_1 = require("../../common/guards/jwt-auth.guard");
const auth_service_1 = require("./auth.service");
const change_own_password_dto_1 = require("./dto/change-own-password.dto");
const login_dto_1 = require("./dto/login.dto");
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/api/auth';
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async login(body, response) {
        const session = await this.authService.login(body);
        this.setRefreshCookie(response, session);
        return {
            success: true,
            message: 'Sesión iniciada correctamente',
            data: this.toLoginResult(session),
        };
    }
    async refresh(cookieHeader, response) {
        const refreshToken = this.readRefreshCookie(cookieHeader);
        if (!refreshToken) {
            throw new common_1.UnauthorizedException('Refresh token is required');
        }
        const session = await this.authService.refresh(refreshToken);
        this.setRefreshCookie(response, session);
        return {
            success: true,
            message: 'Sesión renovada correctamente',
            data: this.toLoginResult(session),
        };
    }
    async logout(user, response) {
        this.clearRefreshCookie(response);
        return {
            success: true,
            message: 'Sesión cerrada correctamente',
            data: await this.authService.logout(user.authSessionId),
        };
    }
    async changePassword(user, body, response) {
        const updatedUser = await this.authService.changeOwnPassword(user.id, body);
        this.clearRefreshCookie(response);
        return {
            success: true,
            message: 'Contraseña actualizada correctamente',
            data: updatedUser,
        };
    }
    me(user) {
        const { authSessionId: _authSessionId, ...authenticatedUser } = user;
        return {
            success: true,
            message: 'Usuario autenticado',
            data: { user: authenticatedUser },
        };
    }
    setRefreshCookie(response, session) {
        response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
            httpOnly: true,
            maxAge: Math.max(session.refreshTokenExpiresAt.getTime() - Date.now(), 0),
            path: REFRESH_COOKIE_PATH,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
        });
    }
    clearRefreshCookie(response) {
        response.clearCookie(REFRESH_COOKIE_NAME, {
            httpOnly: true,
            path: REFRESH_COOKIE_PATH,
            sameSite: 'strict',
            secure: process.env.NODE_ENV === 'production',
        });
    }
    readRefreshCookie(cookieHeader) {
        const encodedValue = cookieHeader
            ?.split(';')
            .map((cookie) => cookie.trim().split('='))
            .find(([name]) => name === REFRESH_COOKIE_NAME)
            ?.slice(1)
            .join('=');
        if (!encodedValue) {
            return null;
        }
        try {
            return decodeURIComponent(encodedValue);
        }
        catch {
            throw new common_1.UnauthorizedException('Invalid refresh token cookie');
        }
    }
    toLoginResult(session) {
        return {
            accessToken: session.accessToken,
            user: session.user,
        };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Headers)('cookie')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('change-password'),
    (0, common_1.HttpCode)(200),
    (0, allow_password_change_required_decorator_1.AllowPasswordChangeRequired)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, change_own_password_dto_1.ChangeOwnPasswordDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, allow_password_change_required_decorator_1.AllowPasswordChangeRequired)(),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map