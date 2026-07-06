import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  DEVELOPMENT_ADMIN_PASSWORD,
  DEVELOPMENT_ROLE_TEST_PASSWORD,
  getInitialAdminPassword,
  initialAdminUser,
  initialCategories,
  initialRoleTestUsers,
  initialProducts,
  initialRoles,
  initialSeedLocation,
  seed,
  SeedPrismaClient,
} from '../../prisma/seed';

const packageJsonPath = resolve(__dirname, '../../package.json');
type UpsertMock<TArgs> = jest.MockedFunction<(args: TArgs) => Promise<unknown>>;
type PrismaSeedMockClient = {
  role: { upsert: UpsertMock<Prisma.RoleUpsertArgs> };
  user: {
    upsert: UpsertMock<Prisma.UserUpsertArgs>;
  };
  operationalLocation: {
    upsert: UpsertMock<Prisma.OperationalLocationUpsertArgs>;
  };
  category: { upsert: UpsertMock<Prisma.CategoryUpsertArgs> };
  product: { upsert: UpsertMock<Prisma.ProductUpsertArgs> };
};

function createUpsertMock<TArgs>(): UpsertMock<TArgs> {
  return jest.fn<Promise<unknown>, [TArgs]>().mockResolvedValue(undefined);
}

function createPrismaSeedMock(): {
  prisma: SeedPrismaClient;
  userUpsertMock: UpsertMock<Prisma.UserUpsertArgs>;
} {
  const userUpsertMock = jest
    .fn<Promise<unknown>, [Prisma.UserUpsertArgs]>()
    .mockResolvedValue(undefined);
  const prisma: PrismaSeedMockClient = {
    role: { upsert: createUpsertMock<Prisma.RoleUpsertArgs>() },
    user: { upsert: userUpsertMock },
    operationalLocation: {
      upsert: createUpsertMock<Prisma.OperationalLocationUpsertArgs>(),
    },
    category: { upsert: createUpsertMock<Prisma.CategoryUpsertArgs>() },
    product: { upsert: createUpsertMock<Prisma.ProductUpsertArgs>() },
  };

  return { prisma, userUpsertMock };
}

describe('Prisma seed contract', () => {
  it('defines the required roles including collections', () => {
    expect(initialRoles.map((role) => role.name)).toEqual([
      'ADMIN',
      'SELLER',
      'WAREHOUSE',
      'DRIVER',
      'COLLECTIONS',
    ]);
  });

  it('resolves the initial admin password from env and only falls back to development-only outside production', () => {
    expect(
      getInitialAdminPassword({
        env: { SEED_ADMIN_PASSWORD: 'from-env-only' },
        nodeEnv: 'production',
      }),
    ).toEqual({ password: 'from-env-only', source: 'env' });

    expect(
      getInitialAdminPassword({ env: {}, nodeEnv: 'development' }),
    ).toEqual({
      password: DEVELOPMENT_ADMIN_PASSWORD,
      source: 'development-only',
    });

    expect(() =>
      getInitialAdminPassword({ env: {}, nodeEnv: 'production' }),
    ).toThrow('SEED_ADMIN_PASSWORD is required in production seed runs');
  });


  it('defines development role test users for the remaining canonical roles', () => {
    expect(initialRoleTestUsers.map((user) => user.roleName)).toEqual([
      'SELLER',
      'WAREHOUSE',
      'DRIVER',
      'COLLECTIONS',
    ]);

    initialRoleTestUsers.forEach((user) => {
      expect(user.email).toContain('dev.');
      expect(user.mustChangePassword).toBe(false);
      expect(user.isActive).toBe(true);
    });
  });

  it('upserts development role users with the canonical test password and connected roles', async () => {
    const { prisma, userUpsertMock } = createPrismaSeedMock();
    const previousSeedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const previousNodeEnv = process.env.NODE_ENV;

    process.env.SEED_ADMIN_PASSWORD = 'contract-admin-password-source';
    process.env.NODE_ENV = 'test';

    try {
      await seed(prisma);
    } finally {
      if (previousSeedAdminPassword === undefined) {
        delete process.env.SEED_ADMIN_PASSWORD;
      } else {
        process.env.SEED_ADMIN_PASSWORD = previousSeedAdminPassword;
      }

      process.env.NODE_ENV = previousNodeEnv;
    }

    const roleUserUpserts = userUpsertMock.mock.calls.slice(1).map((call) => call[0]);

    expect(roleUserUpserts).toHaveLength(initialRoleTestUsers.length);

    for (const [index, roleUser] of initialRoleTestUsers.entries()) {
      const upsert = roleUserUpserts[index];
      expect(upsert).toMatchObject({
        where: { email: roleUser.email },
        update: {
          name: roleUser.name,
          isActive: true,
          mustChangePassword: false,
          role: { connect: { name: roleUser.roleName } },
        },
        create: {
          email: roleUser.email,
          name: roleUser.name,
          isActive: true,
          mustChangePassword: false,
          role: { connect: { name: roleUser.roleName } },
        },
      });

      const createPasswordHash = upsert?.create.passwordHash;
      const updatePasswordHash = upsert?.update.passwordHash;

      if (
        typeof createPasswordHash !== 'string' ||
        typeof updatePasswordHash !== 'string'
      ) {
        throw new Error('Seed role user password hash must be a string');
      }

      await expect(
        bcrypt.compare(DEVELOPMENT_ROLE_TEST_PASSWORD, createPasswordHash),
      ).resolves.toBe(true);
      await expect(
        bcrypt.compare(DEVELOPMENT_ROLE_TEST_PASSWORD, updatePasswordHash),
      ).resolves.toBe(true);
    }
  });

  it('upserts an active initial admin user connected to ADMIN with a hash from the resolved password source', async () => {
    const { prisma, userUpsertMock } = createPrismaSeedMock();
    const previousSeedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    const previousNodeEnv = process.env.NODE_ENV;

    process.env.SEED_ADMIN_PASSWORD = 'contract-admin-password-source';
    process.env.NODE_ENV = 'test';

    try {
      await seed(prisma);
    } finally {
      if (previousSeedAdminPassword === undefined) {
        delete process.env.SEED_ADMIN_PASSWORD;
      } else {
        process.env.SEED_ADMIN_PASSWORD = previousSeedAdminPassword;
      }

      process.env.NODE_ENV = previousNodeEnv;
    }

    const userUpsert = userUpsertMock.mock.calls[0]?.[0];

    expect(userUpsert).toMatchObject({
      where: { email: initialAdminUser.email },
      update: {
        name: initialAdminUser.name,
        isActive: true,
        mustChangePassword: false,
        role: { connect: { name: 'ADMIN' } },
      },
      create: {
        email: initialAdminUser.email,
        name: initialAdminUser.name,
        isActive: true,
        mustChangePassword: false,
        role: { connect: { name: 'ADMIN' } },
      },
    });

    const createPasswordHash = userUpsert?.create.passwordHash;
    const updatePasswordHash = userUpsert?.update.passwordHash;

    if (
      typeof createPasswordHash !== 'string' ||
      typeof updatePasswordHash !== 'string'
    ) {
      throw new Error('Seed admin password hash must be a string');
    }

    expect(createPasswordHash).not.toBe('contract-admin-password-source');
    expect(updatePasswordHash).not.toBe('contract-admin-password-source');
    await expect(
      bcrypt.compare('contract-admin-password-source', createPasswordHash),
    ).resolves.toBe(true);
    await expect(
      bcrypt.compare('contract-admin-password-source', updatePasswordHash),
    ).resolves.toBe(true);
  });

  it('defines development-only location, base categories, and example products without global stock', () => {
    expect(initialSeedLocation).toMatchObject({
      code: 'DEV-MAIN',
      type: 'MIXED',
      isActive: true,
    });

    expect(initialCategories.map((category) => category.name)).toEqual([
      'Base chicken products',
      'Cuts',
      'Prepared products',
    ]);

    expect(initialProducts).toHaveLength(3);
    expect(initialProducts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sku: 'DEV-WHOLE-CHICKEN-KG', unit: 'KG' }),
        expect.objectContaining({ sku: 'DEV-BREAST-KG', unit: 'KG' }),
        expect.objectContaining({ sku: 'DEV-WINGS-PIECE', unit: 'PIECE' }),
      ]),
    );
    initialProducts.forEach((product) => {
      expect(product).not.toHaveProperty('stock');
      expect(product.description).toContain('Development/example seed data');
    });
  });

  it('registers the Prisma seed command minimally', () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      prisma?: { seed?: string };
    };

    expect(packageJson.prisma?.seed).toBe('ts-node prisma/seed.ts');
  });
});
