"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const users_service_1 = require("./users.service");
const adminRole = { id: 'role-admin', name: 'ADMIN' };
const sellerRole = { id: 'role-seller', name: 'SELLER' };
const now = new Date('2026-06-26T12:00:00.000Z');
function createUser(overrides = {}) {
    return {
        id: 'user-1',
        name: 'Development Admin',
        email: 'admin@pollos.local',
        passwordHash: 'hashed-password',
        roleId: adminRole.id,
        role: adminRole,
        isActive: true,
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
        deactivatedAt: null,
        deactivatedByUserId: null,
        deactivationReason: null,
        ...overrides,
    };
}
function createPrisma() {
    const prisma = {
        user: {
            findMany: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
        },
        role: {
            findUnique: jest.fn(),
        },
        $transaction: jest.fn(async (callback) => callback(prisma)),
    };
    return prisma;
}
function createService(prisma = createPrisma()) {
    return {
        service: new users_service_1.UsersService(prisma),
        prisma,
    };
}
describe('UsersService', () => {
    it('creates a user with unique email, hashed temporary password and sanitized response', async () => {
        const { service, prisma } = createService();
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.role.findUnique.mockResolvedValue(sellerRole);
        prisma.user.create.mockImplementation(({ data }) => Promise.resolve(createUser({
            ...data,
            id: 'user-2',
            roleId: sellerRole.id,
            role: sellerRole,
            mustChangePassword: true,
        })));
        const expectedCreateData = expect.objectContaining({
            name: 'Counter Seller',
            email: 'seller@pollos.local',
            roleId: sellerRole.id,
            mustChangePassword: true,
            isActive: true,
        });
        const result = await service.create({
            name: 'Counter Seller',
            email: 'seller@pollos.local',
            roleId: sellerRole.id,
            temporaryPassword: 'temporary-123',
        });
        expect(prisma.user.create).toHaveBeenCalledWith({
            data: expectedCreateData,
            include: { role: true },
        });
        const [[createArgs]] = prisma.user.create.mock.calls;
        expect(createArgs.data.passwordHash).not.toBe('temporary-123');
        await expect(bcryptjs_1.default.compare('temporary-123', createArgs.data.passwordHash)).resolves.toBe(true);
        expect(result).toEqual(expect.objectContaining({
            id: 'user-2',
            email: 'seller@pollos.local',
            role: sellerRole,
            mustChangePassword: true,
        }));
        expect(result).not.toHaveProperty('passwordHash');
        expect(result).not.toHaveProperty('temporaryPassword');
    });
    it('rejects duplicate email and weak temporary password before persistence', async () => {
        const { service, prisma } = createService();
        prisma.user.findUnique.mockResolvedValueOnce(createUser());
        await expect(service.create({
            name: 'Duplicated Admin',
            email: 'admin@pollos.local',
            roleId: adminRole.id,
            temporaryPassword: 'temporary-123',
        })).rejects.toBeInstanceOf(common_1.ConflictException);
        await expect(service.create({
            name: 'Weak Password User',
            email: 'weak@pollos.local',
            roleId: adminRole.id,
            temporaryPassword: 'short',
        })).rejects.toBeInstanceOf(common_1.BadRequestException);
        expect(prisma.user.create).not.toHaveBeenCalled();
    });
    it('maps unique email races during create to ConflictException', async () => {
        const { service, prisma } = createService();
        prisma.user.findUnique.mockResolvedValue(null);
        prisma.role.findUnique.mockResolvedValue(sellerRole);
        prisma.user.create.mockRejectedValue({ code: 'P2002' });
        await expect(service.create({
            name: 'Racing Seller',
            email: 'seller@pollos.local',
            roleId: sellerRole.id,
            temporaryPassword: 'temporary-123',
        })).rejects.toBeInstanceOf(common_1.ConflictException);
    });
    it('lists only active users by default and supports explicit inactive filters', async () => {
        const { service, prisma } = createService();
        prisma.user.findMany.mockResolvedValueOnce([createUser()]);
        await service.findAll({});
        expect(prisma.user.findMany).toHaveBeenLastCalledWith({
            where: { isActive: true },
            include: { role: true },
            orderBy: { createdAt: 'desc' },
        });
        prisma.user.findMany.mockResolvedValueOnce([
            createUser({ id: 'inactive-user', isActive: false }),
        ]);
        await service.findAll({ status: 'inactive' });
        expect(prisma.user.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { isActive: false } }));
        prisma.user.findMany.mockResolvedValueOnce([createUser()]);
        await service.findAll({ includeInactive: true });
        expect(prisma.user.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: undefined }));
        prisma.user.findMany.mockResolvedValueOnce([createUser()]);
        await service.findAll({ status: 'all' });
        expect(prisma.user.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: undefined }));
    });
    it('updates user data while rejecting duplicate email and protecting the last active ADMIN from demotion', async () => {
        const { service, prisma } = createService();
        prisma.role.findUnique.mockResolvedValueOnce(sellerRole);
        prisma.user.findFirst.mockResolvedValueOnce(createUser());
        prisma.user.count.mockResolvedValueOnce(1);
        await expect(service.update('user-1', { roleId: sellerRole.id })).rejects.toBeInstanceOf(common_1.ForbiddenException);
        prisma.user.findUnique.mockResolvedValueOnce(createUser({ id: 'user-3' }));
        await expect(service.update('user-1', { email: 'taken@pollos.local' })).rejects.toBeInstanceOf(common_1.ConflictException);
    });
    it('runs last-ADMIN mutations in a serializable transaction and maps update email races to ConflictException', async () => {
        const { service, prisma } = createService();
        prisma.role.findUnique.mockResolvedValueOnce(sellerRole);
        prisma.user.findFirst.mockResolvedValueOnce(createUser());
        prisma.user.count.mockResolvedValueOnce(2);
        prisma.user.update.mockResolvedValueOnce(createUser({ role: sellerRole }));
        await service.update('user-1', { roleId: sellerRole.id });
        expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({
            isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable,
        }));
        prisma.user.findUnique.mockResolvedValueOnce(null);
        prisma.user.findFirst.mockResolvedValueOnce(createUser());
        prisma.user.update.mockRejectedValueOnce({ code: 'P2002' });
        await expect(service.update('user-1', { email: 'raced@pollos.local' })).rejects.toBeInstanceOf(common_1.ConflictException);
    });
    it('changes password with a hash, mustChangePassword=true and sanitized response', async () => {
        const { service, prisma } = createService();
        prisma.user.findUnique.mockResolvedValueOnce(createUser());
        prisma.user.update.mockImplementation(({ data }) => Promise.resolve(createUser({ ...data, mustChangePassword: true })));
        const result = await service.updatePassword('user-1', {
            temporaryPassword: 'temporary-456',
        });
        const [[updateArgs]] = prisma.user.update.mock.calls;
        expect(updateArgs.data.mustChangePassword).toBe(true);
        expect(updateArgs.data.passwordHash).not.toBe('temporary-456');
        await expect(bcryptjs_1.default.compare('temporary-456', updateArgs.data.passwordHash)).resolves.toBe(true);
        expect(result).not.toHaveProperty('passwordHash');
    });
    it('logically deactivates users and blocks physical deletion of the last active ADMIN', async () => {
        const { service, prisma } = createService();
        prisma.user.findFirst.mockResolvedValueOnce(createUser());
        prisma.user.count.mockResolvedValueOnce(2);
        prisma.user.update.mockResolvedValueOnce(createUser({
            isActive: false,
            deactivatedAt: now,
            deactivatedByUserId: 'actor-admin',
            deactivationReason: 'Left company',
        }));
        const result = await service.deactivate('user-1', 'actor-admin', {
            reason: 'Left company',
        });
        const expectedDeactivateData = expect.objectContaining({
            isActive: false,
            deactivatedByUserId: 'actor-admin',
            deactivationReason: 'Left company',
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'user-1' },
            data: expectedDeactivateData,
            include: { role: true },
        });
        expect(result).toEqual(expect.objectContaining({ isActive: false }));
        expect(result).not.toHaveProperty('passwordHash');
        prisma.user.findFirst.mockResolvedValueOnce(createUser());
        prisma.user.count.mockResolvedValueOnce(1);
        await expect(service.deactivate('user-1', 'actor-admin', {})).rejects.toBeInstanceOf(common_1.ForbiddenException);
        expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), expect.objectContaining({
            isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable,
        }));
    });
    it('logically deactivates users without a reason and persists deactivationReason as null', async () => {
        const { service, prisma } = createService();
        prisma.user.findFirst.mockResolvedValueOnce(createUser());
        prisma.user.count.mockResolvedValueOnce(2);
        prisma.user.update.mockResolvedValueOnce(createUser({
            isActive: false,
            deactivatedAt: now,
            deactivatedByUserId: 'actor-admin',
            deactivationReason: null,
        }));
        const result = await service.deactivate('user-1', 'actor-admin', {});
        const expectedDeactivateData = expect.objectContaining({
            isActive: false,
            deactivatedByUserId: 'actor-admin',
            deactivationReason: null,
        });
        expect(prisma.user.update).toHaveBeenCalledWith({
            where: { id: 'user-1' },
            data: expectedDeactivateData,
            include: { role: true },
        });
        expect(result).toEqual(expect.objectContaining({
            isActive: false,
            deactivatedByUserId: 'actor-admin',
            deactivationReason: null,
        }));
        expect(result).not.toHaveProperty('passwordHash');
    });
    it('throws NotFoundException when a requested user does not exist', async () => {
        const { service, prisma } = createService();
        prisma.user.findUnique.mockResolvedValue(null);
        await expect(service.findOne('missing-user')).rejects.toBeInstanceOf(common_1.NotFoundException);
    });
});
//# sourceMappingURL=users.service.spec.js.map