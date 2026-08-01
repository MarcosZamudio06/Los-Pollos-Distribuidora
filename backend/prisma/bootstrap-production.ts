import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_KEYS,
} from '../src/common/authorization/permissions';

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
  {
    name: 'BILLING',
    description: 'Billing review, reconciliation and invoice linking user.',
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
    findUnique: (
      args: Prisma.RoleFindUniqueArgs,
    ) => Promise<{ id: string } | null>;
  };
  permission: {
    upsert: (args: Prisma.PermissionUpsertArgs) => Promise<unknown>;
    findUnique: (
      args: Prisma.PermissionFindUniqueArgs,
    ) => Promise<{ id: string } | null>;
  };
  rolePermission: {
    createMany: (args: Prisma.RolePermissionCreateManyArgs) => Promise<unknown>;
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

  for (const permission of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }

  for (const role of productionRoles) {
    const permissionKeys = ROLE_PERMISSION_KEYS[role.name] ?? [];
    const persistedRole = await prisma.role.findUnique({
      where: { name: role.name },
      select: { id: true },
    });
    if (!persistedRole) throw new Error(`Role ${role.name} was not created`);

    const permissionIds = await Promise.all(
      permissionKeys.map(async (key) => {
        const permission = await prisma.permission.findUnique({
          where: { key },
          select: { id: true },
        });
        if (!permission) throw new Error(`Permission ${key} was not created`);
        return { roleId: persistedRole.id, permissionId: permission.id };
      }),
    );
    await prisma.rolePermission.createMany({
      data: permissionIds,
      skipDuplicates: true,
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
