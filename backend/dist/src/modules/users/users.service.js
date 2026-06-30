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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_service_1 = require("../../database/prisma.service");
const ADMIN_ROLE_NAME = 'ADMIN';
const PASSWORD_HASH_ROUNDS = 12;
const MIN_TEMPORARY_PASSWORD_LENGTH = 10;
const LAST_ADMIN_TRANSACTION_OPTIONS = {
    isolationLevel: 'Serializable',
};
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query) {
        const users = await this.prisma.user.findMany({
            where: this.buildListWhere(query),
            include: { role: true },
            orderBy: { createdAt: 'desc' },
        });
        return users.map((user) => this.toUserResponse(user));
    }
    async findOne(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: { role: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.toUserResponse(user);
    }
    async create(dto) {
        this.assertTemporaryPassword(dto.temporaryPassword);
        const email = this.normalizeEmail(dto.email);
        await this.assertEmailAvailable(email);
        await this.assertRoleExists(dto.roleId);
        const passwordHash = await bcryptjs_1.default.hash(dto.temporaryPassword, PASSWORD_HASH_ROUNDS);
        const user = await this.prisma.user
            .create({
            data: {
                name: dto.name,
                email,
                roleId: dto.roleId,
                passwordHash,
                isActive: true,
                mustChangePassword: true,
            },
            include: { role: true },
        })
            .catch((error) => {
            this.throwDuplicateEmailConflict(error);
            throw error;
        });
        return this.toUserResponse(user);
    }
    async update(id, dto) {
        return this.prisma
            .$transaction(async (tx) => {
            const client = tx;
            const email = dto.email ? this.normalizeEmail(dto.email) : undefined;
            if (email) {
                await this.assertEmailAvailable(email, id, client);
            }
            const nextRole = dto.roleId
                ? await this.assertRoleExists(dto.roleId, client)
                : undefined;
            const currentUser = await this.findActiveUserForMutation(id, client);
            if (nextRole && nextRole.name !== ADMIN_ROLE_NAME) {
                await this.assertNotLastActiveAdmin(currentUser, client);
            }
            const user = await client.user.update({
                where: { id },
                data: {
                    ...(dto.name !== undefined ? { name: dto.name } : {}),
                    ...(email !== undefined ? { email } : {}),
                    ...(dto.roleId !== undefined ? { roleId: dto.roleId } : {}),
                },
                include: { role: true },
            });
            return this.toUserResponse(user);
        }, LAST_ADMIN_TRANSACTION_OPTIONS)
            .catch((error) => {
            this.throwDuplicateEmailConflict(error);
            throw error;
        });
    }
    async updatePassword(id, dto) {
        this.assertTemporaryPassword(dto.temporaryPassword);
        await this.ensureUserExists(id);
        const passwordHash = await bcryptjs_1.default.hash(dto.temporaryPassword, PASSWORD_HASH_ROUNDS);
        const user = await this.prisma.user.update({
            where: { id },
            data: {
                passwordHash,
                mustChangePassword: true,
            },
            include: { role: true },
        });
        return this.toUserResponse(user);
    }
    async deactivate(id, actorUserId, dto) {
        return this.prisma.$transaction(async (tx) => {
            const client = tx;
            const currentUser = await this.findActiveUserForMutation(id, client);
            await this.assertNotLastActiveAdmin(currentUser, client);
            const user = await client.user.update({
                where: { id },
                data: {
                    isActive: false,
                    deactivatedAt: new Date(),
                    deactivatedByUserId: actorUserId,
                    deactivationReason: dto.reason ?? null,
                },
                include: { role: true },
            });
            return this.toUserResponse(user);
        }, LAST_ADMIN_TRANSACTION_OPTIONS);
    }
    toUserResponse(user) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            roleId: user.roleId,
            role: user.role,
            isActive: user.isActive,
            mustChangePassword: user.mustChangePassword,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            deactivatedAt: user.deactivatedAt,
            deactivatedByUserId: user.deactivatedByUserId,
            deactivationReason: user.deactivationReason,
        };
    }
    buildListWhere(query) {
        if (query.status === 'all' || query.includeInactive === true) {
            return undefined;
        }
        if (query.status === 'inactive') {
            return { isActive: false };
        }
        return { isActive: true };
    }
    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }
    assertTemporaryPassword(temporaryPassword) {
        if (temporaryPassword.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
            throw new common_1.BadRequestException('Temporary password must be at least 10 characters long');
        }
    }
    async assertEmailAvailable(email, currentUserId, client = this.prisma) {
        const existingUser = await client.user.findUnique({ where: { email } });
        if (existingUser && existingUser.id !== currentUserId) {
            throw new common_1.ConflictException('Email is already registered');
        }
    }
    async assertRoleExists(roleId, client = this.prisma) {
        const role = await client.role.findUnique({ where: { id: roleId } });
        if (!role) {
            throw new common_1.BadRequestException('Role does not exist');
        }
        return role;
    }
    async ensureUserExists(id) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
    }
    async findActiveUserForMutation(id, client) {
        const user = await client.user.findFirst({
            where: { id, isActive: true },
            include: { role: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return user;
    }
    async assertNotLastActiveAdmin(user, client) {
        if (user.role.name !== ADMIN_ROLE_NAME || !user.isActive) {
            return;
        }
        const activeAdminCount = await client.user.count({
            where: {
                isActive: true,
                role: { name: ADMIN_ROLE_NAME },
            },
        });
        if (activeAdminCount <= 1) {
            throw new common_1.ForbiddenException('Cannot modify the last active ADMIN');
        }
    }
    throwDuplicateEmailConflict(error) {
        if (this.isUniqueConstraintError(error)) {
            throw new common_1.ConflictException('Email is already registered');
        }
    }
    isUniqueConstraintError(error) {
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2002');
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map