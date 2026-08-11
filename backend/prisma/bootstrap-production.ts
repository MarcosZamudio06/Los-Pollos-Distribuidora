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

const productionDistributionCenter = {
  name: 'Main Distribution Center',
  code: 'MAIN-CEDIS',
  type: 'DISTRIBUTION_CENTER',
  address: null,
  isActive: true,
} as const;

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

const MIN_PASSWORD_LENGTH = 10;

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
    upsert: (args: Prisma.UserUpsertArgs) => Promise<{ id: string }>;
  };
  authSession: {
    updateMany: (args: Prisma.AuthSessionUpdateManyArgs) => Promise<unknown>;
  };
};

export type ProductionBootstrapEnv = {
  NODE_ENV?: string;
  SEED_ADMIN_PASSWORD?: string;
};

type ProductionBootstrapDependencies = {
  hashPassword?: (password: string, rounds: number) => Promise<string>;
};

export type ProductionBootstrapOptions = {
  rotateAdminPassword?: boolean;
};

export function parseProductionBootstrapArgs(
  argv: string[],
): ProductionBootstrapOptions {
  if (argv.length === 0) return { rotateAdminPassword: false };
  if (argv.length === 1 && argv[0] === '--rotate-admin-password') {
    return { rotateAdminPassword: true };
  }

  const unknownArgument = argv.find(
    (argument) => argument !== '--rotate-admin-password',
  );
  throw new Error(
    `Unknown argument: ${unknownArgument ?? '--rotate-admin-password'}`,
  );
}

export async function bootstrapProduction(
  prisma: ProductionBootstrapClient,
  env: ProductionBootstrapEnv,
  dependencies: ProductionBootstrapDependencies = {},
  options: ProductionBootstrapOptions = {},
): Promise<void> {
  if (env.NODE_ENV !== 'production') {
    throw new Error('Production bootstrap requires NODE_ENV=production');
  }

  if (!env.SEED_ADMIN_PASSWORD?.trim()) {
    throw new Error('SEED_ADMIN_PASSWORD is required for production bootstrap');
  }
  if (env.SEED_ADMIN_PASSWORD.length < MIN_PASSWORD_LENGTH) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 10 characters long');
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
    where: { code: productionDistributionCenter.code },
    update: productionDistributionCenter,
    create: productionDistributionCenter,
  });

  await prisma.operationalLocation.upsert({
    where: { code: productionLocation.code },
    update: {
      ...productionLocation,
      parent: { connect: { code: productionDistributionCenter.code } },
    },
    create: {
      ...productionLocation,
      parent: { connect: { code: productionDistributionCenter.code } },
    },
  });

  const adminUpdate: Prisma.UserUpdateInput = {
    name: productionAdmin.name,
    isActive: productionAdmin.isActive,
    role: { connect: { name: 'ADMIN' } },
    operationalLocation: { connect: { code: productionLocation.code } },
  };

  if (options.rotateAdminPassword) {
    Object.assign(adminUpdate, {
      passwordHash,
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    });
  }

  const admin = await prisma.user.upsert({
    where: { email: productionAdmin.email },
    update: adminUpdate,
    create: {
      ...productionAdmin,
      passwordHash,
      role: { connect: { name: 'ADMIN' } },
      operationalLocation: { connect: { code: productionLocation.code } },
    },
  });

  if (options.rotateAdminPassword) {
    await prisma.authSession.updateMany({
      where: { userId: admin.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

async function main(): Promise<void> {
  let prisma: PrismaClient | undefined;
  try {
    const options = parseProductionBootstrapArgs(process.argv.slice(2));
    prisma = new PrismaClient();
    await bootstrapProduction(prisma, process.env, {}, options);
  } catch (error: unknown) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  void main();
}
