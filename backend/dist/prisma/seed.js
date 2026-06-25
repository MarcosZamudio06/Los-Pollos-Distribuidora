"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialProducts = exports.initialCategories = exports.initialSeedLocation = exports.initialAdminUser = exports.initialRoles = exports.DEVELOPMENT_ADMIN_PASSWORD = void 0;
exports.getInitialAdminPassword = getInitialAdminPassword;
exports.seed = seed;
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
exports.DEVELOPMENT_ADMIN_PASSWORD = 'DevOnly-ChangeMe-2026!';
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
};
exports.initialSeedLocation = {
    name: 'Development Main Location',
    code: 'DEV-MAIN',
    type: 'MIXED',
    address: 'Development-only operational location',
    isActive: true,
};
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
            role: { connect: { name: 'ADMIN' } },
        },
        create: {
            ...exports.initialAdminUser,
            passwordHash,
            role: { connect: { name: 'ADMIN' } },
        },
    });
    if (passwordResolution.source === 'development-only') {
        console.warn('Using development-only seed admin password. Set SEED_ADMIN_PASSWORD for non-local environments.');
    }
}
async function seedInitialLocation(prisma) {
    await prisma.operationalLocation.upsert({
        where: { code: exports.initialSeedLocation.code },
        update: exports.initialSeedLocation,
        create: exports.initialSeedLocation,
    });
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
    await seedRoles(prisma);
    await seedInitialAdmin(prisma);
    await seedInitialLocation(prisma);
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