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
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../../database/prisma.service");
const PASSWORD_HASH_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;
const DEFAULT_ACCESS_TOKEN_EXPIRES_IN = '15m';
const DEFAULT_REFRESH_TOKEN_EXPIRES_IN = '7d';
const DEFAULT_ABSOLUTE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_IDLE_TTL_SECONDS = 24 * 60 * 60;
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
        const sessionId = (0, node_crypto_1.randomUUID)();
        const absoluteExpiresAt = new Date(Date.now() + this.getSessionTtlSeconds('absolute') * 1000);
        const issued = await this.issueTokens(user, sessionId, user.sessionVersion, 0);
        await this.prisma.authSession.create({
            data: {
                id: sessionId,
                userId: user.id,
                refreshTokenHash: this.hashToken(issued.refreshToken),
                absoluteExpiresAt,
            },
        });
        return {
            ...issued,
            refreshTokenExpiresAt: absoluteExpiresAt,
        };
    }
    async refresh(refreshToken) {
        const payload = await this.verifyToken(refreshToken, 'refresh');
        const session = await this.findSession(payload.sessionId);
        if (!session || session.userId !== payload.sub) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        const now = new Date();
        if (session.revokedAt ||
            session.absoluteExpiresAt <= now ||
            this.isIdleExpired(session, now) ||
            !session.user.isActive ||
            session.user.sessionVersion !== payload.sessionVersion ||
            session.tokenVersion !== payload.tokenVersion) {
            await this.revokeSession(session.id, now);
            throw new common_1.UnauthorizedException('Invalid token');
        }
        const presentedHash = this.hashToken(refreshToken);
        if (!this.tokenHashesMatch(session.refreshTokenHash, presentedHash)) {
            await this.revokeSession(session.id, now);
            throw new common_1.UnauthorizedException('Refresh token reuse detected');
        }
        const nextTokenVersion = session.tokenVersion + 1;
        const issued = await this.issueTokens(session.user, session.id, session.user.sessionVersion, nextTokenVersion);
        const replacementHash = this.hashToken(issued.refreshToken);
        const rotated = await this.prisma.authSession.updateMany({
            where: {
                id: session.id,
                refreshTokenHash: presentedHash,
                revokedAt: null,
                tokenVersion: session.tokenVersion,
            },
            data: {
                refreshTokenHash: replacementHash,
                tokenVersion: nextTokenVersion,
                lastUsedAt: now,
            },
        });
        if (rotated.count !== 1) {
            await this.revokeSession(session.id, now);
            throw new common_1.UnauthorizedException('Refresh token reuse detected');
        }
        return {
            ...issued,
            refreshTokenExpiresAt: session.absoluteExpiresAt,
        };
    }
    async verifyAccessToken(token) {
        const payload = await this.verifyToken(token, 'access');
        const session = await this.findSession(payload.sessionId);
        const now = new Date();
        if (!session ||
            session.userId !== payload.sub ||
            session.revokedAt ||
            session.absoluteExpiresAt <= now ||
            this.isIdleExpired(session, now) ||
            !session.user.isActive ||
            session.user.sessionVersion !== payload.sessionVersion) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        await this.prisma.authSession.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { lastUsedAt: now },
        });
        return {
            ...this.toAuthenticatedUser(session.user),
            authSessionId: session.id,
        };
    }
    async changeOwnPassword(userId, dto) {
        this.assertPasswordPolicy(dto.newPassword);
        const user = await this.findUserById(userId);
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
        const currentPasswordMatches = await bcryptjs_1.default.compare(dto.currentPassword, user.passwordHash);
        if (!currentPasswordMatches) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const passwordHash = await bcryptjs_1.default.hash(dto.newPassword, PASSWORD_HASH_ROUNDS);
        const now = new Date();
        const updatedUser = await this.prisma.$transaction(async (transaction) => {
            const updated = await transaction.user.update({
                where: { id: userId },
                data: {
                    passwordHash,
                    mustChangePassword: false,
                    sessionVersion: { increment: 1 },
                },
                include: {
                    role: { include: { permissions: { include: { permission: true } } } },
                },
            });
            await transaction.authSession.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: now },
            });
            return updated;
        });
        return this.toAuthenticatedUser(updatedUser);
    }
    async logout(sessionId) {
        await this.revokeSession(sessionId, new Date());
        return { success: true };
    }
    async issueTokens(user, sessionId, sessionVersion, tokenVersion) {
        const sanitizedUser = this.toAuthenticatedUser(user);
        const accessToken = await this.signToken(sanitizedUser, 'access', {
            sessionId,
            sessionVersion,
        });
        const refreshToken = await this.signToken(sanitizedUser, 'refresh', {
            sessionId,
            sessionVersion,
            tokenVersion,
        });
        return { accessToken, refreshToken, user: sanitizedUser };
    }
    async findSession(id) {
        return this.prisma.authSession.findUnique({
            where: { id },
            include: {
                user: {
                    include: {
                        role: { include: { permissions: { include: { permission: true } } } },
                    },
                },
            },
        });
    }
    async revokeSession(id, revokedAt) {
        await this.prisma.authSession.updateMany({
            where: { id, revokedAt: null },
            data: { revokedAt },
        });
    }
    isIdleExpired(session, now) {
        return (session.lastUsedAt.getTime() +
            this.getSessionTtlSeconds('idle') * 1000 <=
            now.getTime());
    }
    getSessionTtlSeconds(type) {
        const envKey = type === 'absolute'
            ? 'AUTH_SESSION_ABSOLUTE_TTL_SECONDS'
            : 'AUTH_SESSION_IDLE_TTL_SECONDS';
        const fallback = type === 'absolute'
            ? DEFAULT_ABSOLUTE_TTL_SECONDS
            : DEFAULT_IDLE_TTL_SECONDS;
        const configured = Number(process.env[envKey] ?? fallback);
        if (!Number.isInteger(configured) || configured <= 0) {
            throw new common_1.InternalServerErrorException(`${envKey} must be a positive integer`);
        }
        return configured;
    }
    hashToken(token) {
        return (0, node_crypto_1.createHash)('sha256').update(token).digest('hex');
    }
    tokenHashesMatch(expected, actual) {
        const expectedBuffer = Buffer.from(expected, 'hex');
        const actualBuffer = Buffer.from(actual, 'hex');
        return (expectedBuffer.length === actualBuffer.length &&
            (0, node_crypto_1.timingSafeEqual)(expectedBuffer, actualBuffer));
    }
    async findUserById(id) {
        return this.prisma.user.findUnique({
            where: { id },
            include: {
                role: { include: { permissions: { include: { permission: true } } } },
            },
        });
    }
    async findUserByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
            include: {
                role: { include: { permissions: { include: { permission: true } } } },
            },
        });
    }
    assertPasswordPolicy(password) {
        if (password.length < MIN_PASSWORD_LENGTH) {
            throw new common_1.BadRequestException('Password must be at least 10 characters long');
        }
    }
    toAuthenticatedUser(user) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role.name,
            permissions: user.role.permissions?.map(({ permission }) => permission.key) ?? [],
            mustChangePassword: user.mustChangePassword,
            ...(user.operationalLocationId
                ? { operationalLocationId: user.operationalLocationId }
                : {}),
        };
    }
    async signToken(user, type, session) {
        return this.jwtService.signAsync({
            sub: user.id,
            email: user.email,
            role: user.role,
            type,
            ...session,
            ...(type === 'refresh' ? { jti: (0, node_crypto_1.randomUUID)() } : {}),
        }, {
            expiresIn: this.getExpiresIn(type),
            secret: this.getSecret(type),
        });
    }
    async verifyToken(token, expectedType) {
        try {
            const payload = await this.jwtService.verifyAsync(token, {
                secret: this.getSecret(expectedType),
            });
            if (payload.type !== expectedType ||
                !payload.sessionId ||
                !Number.isInteger(payload.sessionVersion) ||
                (expectedType === 'refresh' && !Number.isInteger(payload.tokenVersion))) {
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
    getExpiresIn(type) {
        const envKey = type === 'access' ? 'JWT_ACCESS_EXPIRES_IN' : 'JWT_REFRESH_EXPIRES_IN';
        const configuredValue = process.env[envKey]?.trim();
        if (configuredValue) {
            return configuredValue;
        }
        return type === 'access'
            ? DEFAULT_ACCESS_TOKEN_EXPIRES_IN
            : DEFAULT_REFRESH_TOKEN_EXPIRES_IN;
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map