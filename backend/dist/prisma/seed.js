"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialProducts = exports.initialCategories = exports.initialSeedLocations = exports.initialRoleTestUsers = exports.initialAdminUser = exports.initialRoles = exports.DEVELOPMENT_ROLE_TEST_PASSWORD = exports.DEVELOPMENT_ADMIN_PASSWORD = void 0;
exports.getInitialAdminPassword = getInitialAdminPassword;
exports.seed = seed;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const seed_guard_1 = require("./seed-guard");
exports.DEVELOPMENT_ADMIN_PASSWORD = 'DevOnly-ChangeMe-2026!';
exports.DEVELOPMENT_ROLE_TEST_PASSWORD = 'DevRoleUsers-2026!';
exports.initialRoles = [
    { name: 'ADMIN', description: 'System administrator with full access.' },
    { name: 'SELLER', description: 'Point-of-sale and sales operations user.' },
    {
        name: 'WAREHOUSE',
        description: 'Inventory and warehouse operations user.',
    },
    { name: 'DRIVER', description: 'Route delivery operations user.' },
    {
        name: 'COLLECTIONS',
        description: 'Accounts receivable and collections user.',
    },
];
exports.initialAdminUser = {
    name: 'Development Admin',
    email: 'dev.admin@pollos.local',
    isActive: true,
    mustChangePassword: false,
    controlNumber: 'EPDP-000001',
    phone: '+520000000001',
};
exports.initialRoleTestUsers = [
    {
        roleName: 'SELLER',
        name: 'Development Seller',
        email: 'dev.seller@pollos.local',
        isActive: true,
        mustChangePassword: false,
        controlNumber: 'EPDP-000002', phone: '+520000000002',
    },
    {
        roleName: 'WAREHOUSE',
        name: 'Development Warehouse',
        email: 'dev.warehouse@pollos.local',
        isActive: true,
        mustChangePassword: false,
        controlNumber: 'EPDP-000003', phone: '+520000000003',
    },
    {
        roleName: 'DRIVER',
        name: 'Development Driver',
        email: 'dev.driver@pollos.local',
        isActive: true,
        mustChangePassword: false,
        controlNumber: 'EPDP-000004', phone: '+520000000004',
    },
    {
        roleName: 'COLLECTIONS',
        name: 'Development Collections',
        email: 'dev.collections@pollos.local',
        isActive: true,
        mustChangePassword: false,
        controlNumber: 'EPDP-000005', phone: '+520000000005',
    },
];
exports.initialSeedLocations = [
    {
        name: 'Veracruz',
        code: 'VER',
        type: 'BRANCH',
        address: 'Sucursal Veracruz',
        isActive: true,
    },
    {
        name: 'Boca del Río',
        code: 'BDR',
        type: 'BRANCH',
        address: 'Sucursal Boca del Río',
        isActive: true,
    },
    {
        name: 'Alvarado',
        code: 'ALV',
        type: 'BRANCH',
        address: 'Sucursal Alvarado',
        isActive: true,
    },
];
exports.initialCategories = [
    {
        name: 'Base chicken products',
        description: 'Development/example seed data for base poultry catalog items.',
    },
    {
        name: 'Cuts',
        description: 'Development/example seed data for poultry cuts.',
    },
    {
        name: 'Prepared products',
        description: 'Development/example seed data for prepared poultry products.',
    },
];
exports.initialProducts = [
    {
        name: 'Whole chicken by kg',
        sku: 'DEV-WHOLE-CHICKEN-KG',
        description: 'Development/example seed data. Not a production price list.',
        categoryName: 'Base chicken products',
        presentationType: 'WHOLE',
        unit: 'KG',
        salePrice: '58.00',
        purchaseCost: '42.00',
        minStock: '10.000',
    },
    {
        name: 'Chicken breast by kg',
        sku: 'DEV-BREAST-KG',
        description: 'Development/example seed data. Not a production price list.',
        categoryName: 'Cuts',
        presentationType: 'CUT',
        unit: 'KG',
        salePrice: '95.00',
        purchaseCost: '70.00',
        minStock: '5.000',
    },
    {
        name: 'Chicken wings by piece',
        sku: 'DEV-WINGS-PIECE',
        description: 'Development/example seed data. Not a production price list.',
        categoryName: 'Cuts',
        presentationType: 'CUT',
        unit: 'PIECE',
        salePrice: '12.00',
        purchaseCost: '8.00',
        minStock: '20.000',
    },
];
function getInitialAdminPassword({ env, nodeEnv, }) {
    if (env.SEED_ADMIN_PASSWORD) {
        return { password: env.SEED_ADMIN_PASSWORD, source: 'env' };
    }
    if (nodeEnv === 'production') {
        throw new Error('SEED_ADMIN_PASSWORD is required in production seed runs');
    }
    return {
        password: exports.DEVELOPMENT_ADMIN_PASSWORD,
        source: 'development-only',
    };
}
async function seedRoles(prisma) {
    for (const role of exports.initialRoles) {
        await prisma.role.upsert({
            where: { name: role.name },
            update: { description: role.description },
            create: role,
        });
    }
}
async function seedInitialAdmin(prisma) {
    const passwordResolution = getInitialAdminPassword({
        env: process.env,
        nodeEnv: process.env.NODE_ENV,
    });
    const passwordHash = await bcryptjs_1.default.hash(passwordResolution.password, 12);
    await prisma.user.upsert({
        where: { email: exports.initialAdminUser.email },
        update: {
            name: exports.initialAdminUser.name,
            passwordHash,
            isActive: exports.initialAdminUser.isActive,
            mustChangePassword: exports.initialAdminUser.mustChangePassword,
            role: { connect: { name: 'ADMIN' } },
            operationalLocation: { connect: { code: 'VER' } },
        },
        create: {
            ...exports.initialAdminUser,
            passwordHash,
            role: { connect: { name: 'ADMIN' } },
            operationalLocation: { connect: { code: 'VER' } },
        },
    });
    if (passwordResolution.source === 'development-only') {
        console.warn('Using development-only seed admin password. Set SEED_ADMIN_PASSWORD for non-local environments.');
    }
}
async function seedInitialLocation(prisma) {
    for (const location of exports.initialSeedLocations) {
        await prisma.operationalLocation.upsert({
            where: { code: location.code },
            update: location,
            create: location,
        });
    }
}
async function seedInitialRoleUsers(prisma) {
    const passwordHash = await bcryptjs_1.default.hash(exports.DEVELOPMENT_ROLE_TEST_PASSWORD, 12);
    for (const user of exports.initialRoleTestUsers) {
        await prisma.user.upsert({
            where: { email: user.email },
            update: {
                name: user.name,
                passwordHash,
                isActive: user.isActive,
                mustChangePassword: user.mustChangePassword,
                role: { connect: { name: user.roleName } },
                operationalLocation: { connect: { code: 'VER' } },
            },
            create: {
                name: user.name,
                email: user.email,
                controlNumber: user.controlNumber,
                phone: user.phone,
                passwordHash,
                isActive: user.isActive,
                mustChangePassword: user.mustChangePassword,
                role: { connect: { name: user.roleName } },
                operationalLocation: { connect: { code: 'VER' } },
            },
        });
    }
    await prisma.$executeRawUnsafe?.("SELECT setval('\"User_controlNumber_seq\"', GREATEST((SELECT COALESCE(MAX(SUBSTRING(\"controlNumber\" FROM 6)::bigint), 1) FROM \"User\"), 1), true)");
}
async function seedCategories(prisma) {
    for (const category of exports.initialCategories) {
        await prisma.category.upsert({
            where: { name: category.name },
            update: { description: category.description, isActive: true },
            create: { ...category, isActive: true },
        });
    }
}
async function seedExampleProducts(prisma) {
    for (const product of exports.initialProducts) {
        const { categoryName, ...productData } = product;
        await prisma.product.upsert({
            where: { sku: product.sku },
            update: {
                ...productData,
                isActive: true,
                category: { connect: { name: categoryName } },
            },
            create: {
                ...productData,
                isActive: true,
                category: { connect: { name: categoryName } },
            },
        });
    }
}
async function seed(prisma) {
    (0, seed_guard_1.assertSeedEnvironment)();
    await seedRoles(prisma);
    await seedInitialLocation(prisma);
    await seedInitialAdmin(prisma);
    await seedInitialRoleUsers(prisma);
    await seedCategories(prisma);
    await seedExampleProducts(prisma);
}
if (require.main === module) {
    const prisma = new client_1.PrismaClient();
    seed(prisma)
        .then(async () => {
        await prisma.$disconnect();
    })
        .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    });
}
//# sourceMappingURL=seed.js.map