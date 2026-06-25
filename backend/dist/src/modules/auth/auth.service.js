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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_service_1 = require("../../database/prisma.service");
let AuthService = class AuthService {
    prisma;
    jwtService;
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    async login(credentials) {
        const user = await this.findUserByEmail(credentials.email);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        if (!user.isActive) {
            throw new common_1.ForbiddenException('User is inactive');
        }
        const passwordMatches = await bcryptjs_1.default.compare(credentials.password, user.passwordHash);
        if (!passwordMatches) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const sanitizedUser = this.toAuthenticatedUser(user);
        return {
            accessToken: await this.signToken(sanitizedUser, 'access'),
            refreshToken: await this.signToken(sanitizedUser, 'refresh'),
            user: sanitizedUser,
        };
    }
    async refresh(refreshToken) {
        const payload = await this.verifyToken(refreshToken, 'refresh');
        const user = await this.findUserByEmail(payload.email);
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        if (!user.isActive) {
            throw new common_1.ForbiddenException('User is inactive');
        }
        const sanitizedUser = this.toAuthenticatedUser(user);
        return {
            accessToken: await this.signToken(sanitizedUser, 'access'),
            refreshToken: await this.signToken(sanitizedUser, 'refresh'),
            user: sanitizedUser,
        };
    }
    async verifyAccessToken(token) {
        const payload = await this.verifyToken(token, 'access');
        const user = await this.findUserByEmail(payload.email);
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        return this.toAuthenticatedUser(user);
    }
    logout() {
        return { success: true };
    }
    async findUserByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
            include: { role: true },
        });
    }
    toAuthenticatedUser(user) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.name,
        };
    }
    async signToken(user, type) {
        const secret = this.getSecret(type);
        return this.jwtService.signAsync({
            sub: user.id,
            email: user.email,
            role: user.role,
            type,
        }, {
            expiresIn: type === 'access' ? '15m' : '7d',
            secret,
        });
    }
    async verifyToken(token, expectedType) {
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.getSecret(expectedType),
            });
            if (payload.type !== expectedType) {
                throw new common_1.UnauthorizedException('Invalid token');
            }
            return payload;
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            throw new common_1.UnauthorizedException('Invalid token');
        }
    }
    getSecret(type) {
        const envKey = type === 'access' ? 'JWT_ACCESS_SECRET' : 'JWT_REFRESH_SECRET';
        const secret = process.env[envKey]?.trim();
        if (!secret) {
            throw new common_1.InternalServerErrorException(`${envKey} is required`);
        }
        return secret;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map