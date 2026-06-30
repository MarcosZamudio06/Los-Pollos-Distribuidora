"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const seed_1 = require("../../prisma/seed");
const packageJsonPath = (0, node_path_1.resolve)(__dirname, '../../package.json');
function createUpsertMock() {
    return jest.fn().mockResolvedValue(undefined);
}
function createPrismaSeedMock() {
    const userUpsertMock = jest
        .fn()
        .mockResolvedValue(undefined);
    const prisma = {
        role: { upsert: createUpsertMock() },
        user: { upsert: userUpsertMock },
        operationalLocation: {
            upsert: createUpsertMock(),
        },
        category: { upsert: createUpsertMock() },
        product: { upsert: createUpsertMock() },
    };
    return { prisma, userUpsertMock };
}
describe('Prisma seed contract', () => {
    it('defines the required roles including collections', () => {
        expect(seed_1.initialRoles.map((role) => role.name)).toEqual([
            'ADMIN',
            'SELLER',
            'WAREHOUSE',
            'DRIVER',
            'COLLECTIONS',
        ]);
    });
    it('resolves the initial admin password from env and only falls back to development-only outside production', () => {
        expect((0, seed_1.getInitialAdminPassword)({
            env: { SEED_ADMIN_PASSWORD: 'from-env-only' },
            nodeEnv: 'production',
        })).toEqual({ password: 'from-env-only', source: 'env' });
        expect((0, seed_1.getInitialAdminPassword)({ env: {}, nodeEnv: 'development' })).toEqual({
            password: seed_1.DEVELOPMENT_ADMIN_PASSWORD,
            source: 'development-only',
        });
        expect(() => (0, seed_1.getInitialAdminPassword)({ env: {}, nodeEnv: 'production' })).toThrow('SEED_ADMIN_PASSWORD is required in production seed runs');
    });
    it('upserts an active initial admin user connected to ADMIN with a hash from the resolved password source', async () => {
        const { prisma, userUpsertMock } = createPrismaSeedMock();
        const previousSeedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
        const previousNodeEnv = process.env.NODE_ENV;
        process.env.SEED_ADMIN_PASSWORD = 'contract-admin-password-source';
        process.env.NODE_ENV = 'test';
        try {
            await (0, seed_1.seed)(prisma);
        }
        finally {
            if (previousSeedAdminPassword === undefined) {
                delete process.env.SEED_ADMIN_PASSWORD;
            }
            else {
                process.env.SEED_ADMIN_PASSWORD = previousSeedAdminPassword;
            }
            process.env.NODE_ENV = previousNodeEnv;
        }
        const userUpsert = userUpsertMock.mock.calls[0]?.[0];
        expect(userUpsert).toMatchObject({
            where: { email: seed_1.initialAdminUser.email },
            update: {
                name: seed_1.initialAdminUser.name,
                isActive: true,
                mustChangePassword: false,
                role: { connect: { name: 'ADMIN' } },
            },
            create: {
                email: seed_1.initialAdminUser.email,
                name: seed_1.initialAdminUser.name,
                isActive: true,
                mustChangePassword: false,
                role: { connect: { name: 'ADMIN' } },
            },
        });
        const createPasswordHash = userUpsert?.create.passwordHash;
        const updatePasswordHash = userUpsert?.update.passwordHash;
        if (typeof createPasswordHash !== 'string' ||
            typeof updatePasswordHash !== 'string') {
            throw new Error('Seed admin password hash must be a string');
        }
        expect(createPasswordHash).not.toBe('contract-admin-password-source');
        expect(updatePasswordHash).not.toBe('contract-admin-password-source');
        await expect(bcryptjs_1.default.compare('contract-admin-password-source', createPasswordHash)).resolves.toBe(true);
        await expect(bcryptjs_1.default.compare('contract-admin-password-source', updatePasswordHash)).resolves.toBe(true);
    });
    it('defines development-only location, base categories, and example products without global stock', () => {
        expect(seed_1.initialSeedLocation).toMatchObject({
            code: 'DEV-MAIN',
            type: 'MIXED',
            isActive: true,
        });
        expect(seed_1.initialCategories.map((category) => category.name)).toEqual([
            'Base chicken products',
            'Cuts',
            'Prepared products',
        ]);
        expect(seed_1.initialProducts).toHaveLength(3);
        expect(seed_1.initialProducts).toEqual(expect.arrayContaining([
            expect.objectContaining({ sku: 'DEV-WHOLE-CHICKEN-KG', unit: 'KG' }),
            expect.objectContaining({ sku: 'DEV-BREAST-KG', unit: 'KG' }),
            expect.objectContaining({ sku: 'DEV-WINGS-PIECE', unit: 'PIECE' }),
        ]));
        seed_1.initialProducts.forEach((product) => {
            expect(product).not.toHaveProperty('stock');
            expect(product.description).toContain('Development/example seed data');
        });
    });
    it('registers the Prisma seed command minimally', () => {
        const packageJson = JSON.parse((0, node_fs_1.readFileSync)(packageJsonPath, 'utf8'));
        expect(packageJson.prisma?.seed).toBe('ts-node prisma/seed.ts');
    });
});
//# sourceMappingURL=seed.contract.spec.js.map