import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const productionRoles = [
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

const productionLocation = {
  name: 'Main Location',
  code: 'MAIN',
  type: 'BRANCH',
  address: null,
  isActive: true,
} as const;

const productionAdmin = {
  name: 'System Administrator',
  email: 'admin@pollos.local',
  controlNumber: 'EPDP-000001',
  phone: '+520000000001',
  isActive: true,
  mustChangePassword: true,
} as const;

export type ProductionBootstrapClient = {
  role: {
    upsert: (args: Prisma.RoleUpsertArgs) => Promise<unknown>;
  };
  operationalLocation: {
    upsert: (args: Prisma.OperationalLocationUpsertArgs) => Promise<unknown>;
  };
  user: {
    upsert: (args: Prisma.UserUpsertArgs) => Promise<unknown>;
  };
};

export type ProductionBootstrapEnv = {
  NODE_ENV?: string;
  SEED_ADMIN_PASSWORD?: string;
};

type ProductionBootstrapDependencies = {
  hashPassword?: (password: string, rounds: number) => Promise<string>;
};

export async function bootstrapProduction(
  prisma: ProductionBootstrapClient,
  env: ProductionBootstrapEnv,
  dependencies: ProductionBootstrapDependencies = {},
): Promise<void> {
  if (env.NODE_ENV !== 'production') {
    throw new Error('Production bootstrap requires NODE_ENV=production');
  }

  if (!env.SEED_ADMIN_PASSWORD?.trim()) {
    throw new Error('SEED_ADMIN_PASSWORD is required for production bootstrap');
  }

  const hashPassword = dependencies.hashPassword ?? bcrypt.hash;
  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD, 12);

  for (const role of productionRoles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  await prisma.operationalLocation.upsert({
    where: { code: productionLocation.code },
    update: productionLocation,
    create: productionLocation,
  });

  await prisma.user.upsert({
    where: { email: productionAdmin.email },
    update: {
      name: productionAdmin.name,
      isActive: productionAdmin.isActive,
      mustChangePassword: productionAdmin.mustChangePassword,
      role: { connect: { name: 'ADMIN' } },
      operationalLocation: { connect: { code: productionLocation.code } },
    },
    create: {
      ...productionAdmin,
      passwordHash,
      role: { connect: { name: 'ADMIN' } },
      operationalLocation: { connect: { code: productionLocation.code } },
    },
  });
}

if (require.main === module) {
  const prisma = new PrismaClient();

  bootstrapProduction(prisma, process.env)
    .then(async () => {
      await prisma.$disconnect();
    })
    .catch(async (error: unknown) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
