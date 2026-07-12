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
const node_crypto_1 = require("node:crypto");
const prisma_service_1 = require("../../database/prisma.service");
const ADMIN_ROLE_NAME = 'ADMIN';
const PASSWORD_HASH_ROUNDS = 12;
const MIN_TEMPORARY_PASSWORD_LENGTH = 10;
const EMPLOYEE_LOCATION_TYPES = ['BRANCH', 'MIXED', 'EXTERNAL_POINT_OF_SALE'];
const LAST_ADMIN_TRANSACTION_OPTIONS = {
    isolationLevel: 'Serializable',
};
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(query) {
        const where = this.buildListWhere(query);
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const [users, total] = await Promise.all([this.prisma.user.findMany({
                where,
                include: { role: true, operationalLocation: true },
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
            }), this.prisma.user.count({ where })]);
        return { items: users.map((user) => this.toUserResponse(user)), total, page, limit };
    }
    async findRoles() {
        return this.prisma.role.findMany({ orderBy: { name: 'asc' } });
    }
    async findOne(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: { role: true, operationalLocation: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('User not found');
        }
        return this.toUserResponse(user);
    }
    async create(dto) {
        const email = this.normalizeEmail(dto.email);
        const phone = this.normalizePhone(dto.phone);
        await this.assertEmailAvailable(email);
        await this.assertPhoneAvailable(phone);
        await this.assertRoleExists(dto.roleId);
        await this.assertEmployeeLocation(dto.operationalLocationId);
        const temporaryPassword = this.generateTemporaryPassword();
        const passwordHash = await bcryptjs_1.default.hash(temporaryPassword, PASSWORD_HASH_ROUNDS);
        const user = await this.prisma.user
            .create({
            data: {
                name: dto.name,
                email,
                phone,
                controlNumber: await this.nextControlNumber(),
                roleId: dto.roleId,
                operationalLocationId: dto.operationalLocationId,
                passwordHash,
                isActive: true,
                mustChangePassword: true,
            },
            include: { role: true, operationalLocation: true },
        })
            .catch((error) => {
            this.throwUniqueConstraintConflict(error);
            throw error;
        });
        return { ...this.toUserResponse(user), temporaryPassword };
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
                include: { role: true, operationalLocation: true },
            });
            return this.toUserResponse(user);
        }, LAST_ADMIN_TRANSACTION_OPTIONS)
            .catch((error) => {
            this.throwUniqueConstraintConflict(error);
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
            include: { role: true, operationalLocation: true },
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
                include: { role: true, operationalLocation: true },
            });
            return this.toUserResponse(user);
        }, LAST_ADMIN_TRANSACTION_OPTIONS);
    }
    toUserResponse(user) {
        return {
            id: user.id,
            name: user.name,
            email: user.email,
            controlNumber: user.controlNumber,
            phone: user.phone,
            roleId: user.roleId,
            operationalLocationId: user.operationalLocationId,
            operationalLocation: user.operationalLocation,
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
        const status = query.status === 'all' || query.includeInactive === true
            ? undefined : query.status === 'inactive' ? false : true;
        const search = query.search?.trim();
        return {
            ...(status === undefined ? {} : { isActive: status }),
            ...(query.roleId ? { roleId: query.roleId } : {}),
            ...(query.operationalLocationId ? { operationalLocationId: query.operationalLocationId } : {}),
            ...(search ? { OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { phone: { contains: search, mode: 'insensitive' } },
                    { controlNumber: { contains: search, mode: 'insensitive' } },
                ] } : {}),
        };
    }
    normalizeEmail(email) {
        return email.trim().toLowerCase();
    }
    normalizePhone(phone) {
        return phone.replace(/[\s-]/g, '').trim();
    }
    generateTemporaryPassword() {
        return (0, node_crypto_1.randomBytes)(12).toString('base64url');
    }
    async nextControlNumber() {
        const rows = await this.prisma.$queryRawUnsafe('SELECT nextval(\'"User_controlNumber_seq"\') AS value');
        return `EPDP-${String(rows[0].value).padStart(6, '0')}`;
    }
    async assertPhoneAvailable(phone) {
        const existing = await this.prisma.user.findUnique({ where: { phone } });
        if (existing)
            throw new common_1.ConflictException('Phone is already registered');
    }
    async assertEmployeeLocation(locationId) {
        const location = await this.prisma.operationalLocation.findUnique({ where: { id: locationId } });
        if (!location || !location.isActive || !EMPLOYEE_LOCATION_TYPES.includes(location.type)) {
            throw new common_1.BadRequestException('Operational location is not available for employees');
        }
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
            include: { role: true, operationalLocation: true },
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
    throwUniqueConstraintConflict(error) {
        if (this.isUniqueConstraintError(error)) {
            const target = this.getUniqueConstraintTarget(error);
            if (target.includes('phone')) {
                throw new common_1.ConflictException('Phone is already registered');
            }
            if (target.includes('controlNumber')) {
                throw new common_1.ConflictException('Control number is already registered');
            }
            throw new common_1.ConflictException('Email is already registered');
        }
    }
    getUniqueConstraintTarget(error) {
        if (typeof error !== 'object' || error === null || !('meta' in error))
            return [];
        const meta = error.meta;
        if (typeof meta !== 'object' || meta === null || !('target' in meta))
            return [];
        const target = meta.target;
        return Array.isArray(target) ? target.filter((value) => typeof value === 'string') : typeof target === 'string' ? [target] : [];
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