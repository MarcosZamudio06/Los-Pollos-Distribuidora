import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

export const DEVELOPMENT_ADMIN_PASSWORD = 'DevOnly-ChangeMe-2026!';

export const initialRoles = [
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
] as const;

export const initialAdminUser = {
  name: 'Development Admin',
  email: 'dev.admin@pollos.local',
  isActive: true,
  mustChangePassword: false,
} as const;

export const initialSeedLocation = {
  name: 'Development Main Location',
  code: 'DEV-MAIN',
  type: 'MIXED',
  address: 'Development-only operational location',
  isActive: true,
} as const;

export const initialCategories = [
  {
    name: 'Base chicken products',
    description:
      'Development/example seed data for base poultry catalog items.',
  },
  {
    name: 'Cuts',
    description: 'Development/example seed data for poultry cuts.',
  },
  {
    name: 'Prepared products',
    description: 'Development/example seed data for prepared poultry products.',
  },
] as const;

export const initialProducts = [
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
] as const;

type PasswordResolutionInput = {
  env: { SEED_ADMIN_PASSWORD?: string };
  nodeEnv?: string;
};

type PasswordResolution = {
  password: string;
  source: 'env' | 'development-only';
};

export type SeedPrismaClient = {
  role: {
    upsert: (args: Prisma.RoleUpsertArgs) => Promise<unknown>;
  };
  user: {
    upsert: (args: Prisma.UserUpsertArgs) => Promise<unknown>;
  };
  operationalLocation: {
    upsert: (args: Prisma.OperationalLocationUpsertArgs) => Promise<unknown>;
  };
  category: {
    upsert: (args: Prisma.CategoryUpsertArgs) => Promise<unknown>;
  };
  product: {
    upsert: (args: Prisma.ProductUpsertArgs) => Promise<unknown>;
  };
};

export function getInitialAdminPassword({
  env,
  nodeEnv,
}: PasswordResolutionInput): PasswordResolution {
  if (env.SEED_ADMIN_PASSWORD) {
    return { password: env.SEED_ADMIN_PASSWORD, source: 'env' };
  }

  if (nodeEnv === 'production') {
    throw new Error('SEED_ADMIN_PASSWORD is required in production seed runs');
  }

  return {
    password: DEVELOPMENT_ADMIN_PASSWORD,
    source: 'development-only',
  };
}

async function seedRoles(prisma: SeedPrismaClient): Promise<void> {
  for (const role of initialRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
}

async function seedInitialAdmin(prisma: SeedPrismaClient): Promise<void> {
  const passwordResolution = getInitialAdminPassword({
    env: process.env,
    nodeEnv: process.env.NODE_ENV,
  });
  const passwordHash = await bcrypt.hash(passwordResolution.password, 12);

  await prisma.user.upsert({
    where: { email: initialAdminUser.email },
    update: {
      name: initialAdminUser.name,
      passwordHash,
      isActive: initialAdminUser.isActive,
      mustChangePassword: initialAdminUser.mustChangePassword,
      role: { connect: { name: 'ADMIN' } },
    },
    create: {
      ...initialAdminUser,
      passwordHash,
      role: { connect: { name: 'ADMIN' } },
    },
  });

  if (passwordResolution.source === 'development-only') {
    console.warn(
      'Using development-only seed admin password. Set SEED_ADMIN_PASSWORD for non-local environments.',
    );
  }
}

async function seedInitialLocation(prisma: SeedPrismaClient): Promise<void> {
  await prisma.operationalLocation.upsert({
    where: { code: initialSeedLocation.code },
    update: initialSeedLocation,
    create: initialSeedLocation,
  });
}

async function seedCategories(prisma: SeedPrismaClient): Promise<void> {
  for (const category of initialCategories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { description: category.description, isActive: true },
      create: { ...category, isActive: true },
    });
  }
}

async function seedExampleProducts(prisma: SeedPrismaClient): Promise<void> {
  for (const product of initialProducts) {
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

export async function seed(prisma: SeedPrismaClient): Promise<void> {
  await seedRoles(prisma);
  await seedInitialAdmin(prisma);
  await seedInitialLocation(prisma);
  await seedCategories(prisma);
  await seedExampleProducts(prisma);
}

if (require.main === module) {
  const prisma = new PrismaClient();

  seed(prisma)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
