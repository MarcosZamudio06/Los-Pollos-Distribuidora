import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import {
  DEVELOPMENT_ADMIN_PASSWORD,
  getInitialAdminPassword,
  initialAdminUser,
  initialCategories,
  initialProducts,
  initialRoles,
  initialSeedLocation,
  seed,
} from '../../prisma/seed';

const packageJsonPath = resolve(__dirname, '../../package.json');
type AdminUserUpsertPayload = {
  where: { email: string };
  update: {
    name: string;
    passwordHash: string;
    isActive: boolean;
    role: { connect: { name: string } };
  };
  create: {
    email: string;
    name: string;
    passwordHash: string;
    isActive: boolean;
    role: { connect: { name: string } };
  };
};
type UpsertMock = jest.MockedFunction<(args: unknown) => Promise<void>>;
type PrismaSeedMockClient = {
  role: { upsert: UpsertMock };
  user: {
    upsert: jest.MockedFunction<
      (args: AdminUserUpsertPayload) => Promise<void>
    >;
  };
  operationalLocation: { upsert: UpsertMock };
  category: { upsert: UpsertMock };
  product: { upsert: UpsertMock };
};

function createUpsertMock(): UpsertMock {
  return jest
    .fn<(args: unknown) => Promise<void>>()
    .mockResolvedValue(undefined);
}

function createPrismaSeedMock(): {
  prisma: PrismaSeedMockClient;
  userUpsertMock: jest.MockedFunction<
    (args: AdminUserUpsertPayload) => Promise<void>
  >;
} {
  const userUpsertMock = jest
    .fn<(args: AdminUserUpsertPayload) => Promise<void>>()
    .mockResolvedValue(undefined);
  const prisma = {
    role: { upsert: createUpsertMock() },
    user: { upsert: userUpsertMock },
    operationalLocation: { upsert: createUpsertMock() },
    category: { upsert: createUpsertMock() },
    product: { upsert: createUpsertMock() },
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
        role: { connect: { name: 'ADMIN' } },
      },
      create: {
        email: initialAdminUser.email,
        name: initialAdminUser.name,
        isActive: true,
        role: { connect: { name: 'ADMIN' } },
      },
    });

    const createPasswordHash = userUpsert?.create.passwordHash;
    const updatePasswordHash = userUpsert?.update.passwordHash;

    expect(createPasswordHash).not.toBe('contract-admin-password-source');
    expect(updatePasswordHash).not.toBe('contract-admin-password-source');
    await expect(
      bcrypt.compare(
        'contract-admin-password-source',
        createPasswordHash ?? '',
      ),
    ).resolves.toBe(true);
    await expect(
      bcrypt.compare(
        'contract-admin-password-source',
        updatePasswordHash ?? '',
      ),
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
