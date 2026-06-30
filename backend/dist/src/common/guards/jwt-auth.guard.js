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
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const allow_password_change_required_decorator_1 = require("../decorators/allow-password-change-required.decorator");
const auth_service_1 = require("../../modules/auth/auth.service");
let JwtAuthGuard = class JwtAuthGuard {
    authService;
    reflector;
    constructor(authService, reflector) {
        this.authService = authService;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = this.extractBearerToken(request.headers.authorization);
        if (!token) {
            throw new common_1.UnauthorizedException('Bearer token is required');
        }
        const user = await this.authService.verifyAccessToken(token);
        if (user.mustChangePassword &&
            !this.allowsPasswordChangeRequired(context)) {
            throw new common_1.ForbiddenException('Password change is required');
        }
        request.user = user;
        return true;
    }
    allowsPasswordChangeRequired(context) {
        return (this.reflector?.getAllAndOverride(allow_password_change_required_decorator_1.ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, [context.getHandler(), context.getClass()]) ?? false);
    }
    extractBearerToken(authorization) {
        const [scheme, token] = authorization?.split(' ') ?? [];
        if (scheme !== 'Bearer' || !token) {
            return null;
        }
        return token;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        core_1.Reflector])
], JwtAuthGuard);
//# sourceMappingURL=jwt-auth.guard.js.map