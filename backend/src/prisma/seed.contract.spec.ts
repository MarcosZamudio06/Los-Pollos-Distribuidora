import { spawnSync } from 'node:child_process';
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
  initialSeedLocations,
  seed,
  SeedPrismaClient,
} from '../../prisma/seed';

const packageJsonPath = resolve(__dirname, '../../package.json');
const developmentComposePath = resolve(
  __dirname,
  '../../../docker-compose.yml',
);
const productionComposePath = resolve(
  __dirname,
  '../../../docker-compose.production.yml',
);
const frontendDockerfilePath = resolve(
  __dirname,
  '../../../docker/frontend/Dockerfile',
);
const environmentExamplePath = resolve(__dirname, '../../../.env.example');
const qualityGateWorkflowPath = resolve(
  __dirname,
  '../../../.github/workflows/quality-gate.yml',
);
const releaseWorkflowPath = resolve(
  __dirname,
  '../../../.github/workflows/release-images.yml',
);
const publicOriginValidatorPath = resolve(
  __dirname,
  '../../../scripts/validate-public-origin.mjs',
);
type UpsertMock<TArgs> = jest.MockedFunction<(args: TArgs) => Promise<unknown>>;
type PrismaSeedMockClient = {
  role: {
    upsert: UpsertMock<Prisma.RoleUpsertArgs>;
    update: UpsertMock<Prisma.RoleUpdateArgs>;
  };
  permission: { upsert: UpsertMock<Prisma.PermissionUpsertArgs> };
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
    role: {
      upsert: createUpsertMock<Prisma.RoleUpsertArgs>(),
      update: createUpsertMock<Prisma.RoleUpdateArgs>(),
    },
    permission: { upsert: createUpsertMock<Prisma.PermissionUpsertArgs>() },
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
  it('defines the required roles including billing and collections', () => {
    expect(initialRoles.map((role) => role.name)).toEqual([
      'ADMIN',
      'SELLER',
      'WAREHOUSE',
      'DRIVER',
      'COLLECTIONS',
      'BILLING',
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

  it('refuses the complete development seed in production even when an admin password exists', async () => {
    const { prisma, userUpsertMock } = createPrismaSeedMock();
    const previousNodeEnv = process.env.NODE_ENV;
    const previousSeedAdminPassword = process.env.SEED_ADMIN_PASSWORD;
    process.env.NODE_ENV = 'production';
    process.env.SEED_ADMIN_PASSWORD = 'not-enough-to-enable-a-production-seed';

    try {
      await expect(seed(prisma)).rejects.toThrow(
        'Development and operational seeds are disabled when NODE_ENV=production',
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;

      if (previousSeedAdminPassword === undefined) {
        delete process.env.SEED_ADMIN_PASSWORD;
      } else {
        process.env.SEED_ADMIN_PASSWORD = previousSeedAdminPassword;
      }
    }

    expect(userUpsertMock).not.toHaveBeenCalled();
  });

  it('defines development role test users for the remaining canonical roles', () => {
    expect(initialRoleTestUsers.map((user) => user.roleName)).toEqual([
      'SELLER',
      'WAREHOUSE',
      'DRIVER',
      'COLLECTIONS',
      'BILLING',
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

    const roleUserUpserts = userUpsertMock.mock.calls
      .slice(1)
      .map((call) => call[0]);

    expect(roleUserUpserts).toHaveLength(initialRoleTestUsers.length);

    for (const [index, roleUser] of initialRoleTestUsers.entries()) {
      const upsert = roleUserUpserts[index];
      expect(upsert).toMatchObject({
        where: { controlNumber: roleUser.controlNumber },
        update: {
          name: roleUser.name,
          email: roleUser.email,
          controlNumber: roleUser.controlNumber,
          phone: roleUser.phone,
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
      expect(upsert?.update.operationalLocation).toEqual({
        connect: { code: roleUser.operationalLocationCode },
      });
      expect(upsert?.create.operationalLocation).toEqual({
        connect: { code: roleUser.operationalLocationCode },
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
      where: {
        controlNumber: initialAdminUser.controlNumber,
      },
      update: {
        name: initialAdminUser.name,
        email: initialAdminUser.email,
        controlNumber: initialAdminUser.controlNumber,
        phone: initialAdminUser.phone,
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

  it('defines an operational CEDIS with three directly mapped branches, base categories, and example products without global stock', () => {
    expect(initialSeedLocations).toHaveLength(4);
    expect(initialSeedLocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'CEDIS Veracruz',
          code: 'CEDIS-VER',
          type: 'DISTRIBUTION_CENTER',
          parentCode: null,
          isActive: true,
        }),
        expect.objectContaining({
          name: 'Veracruz',
          code: 'VER',
          type: 'BRANCH',
          parentCode: 'CEDIS-VER',
          isActive: true,
        }),
        expect.objectContaining({
          name: 'Boca del Río',
          code: 'BDR',
          type: 'BRANCH',
          parentCode: 'CEDIS-VER',
          isActive: true,
        }),
        expect.objectContaining({
          name: 'Alvarado',
          code: 'ALV',
          type: 'BRANCH',
          parentCode: 'CEDIS-VER',
          isActive: true,
        }),
      ]),
    );

    expect(initialSeedLocations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'VER',
          latitude: 19.183,
          longitude: -96.134,
        }),
        expect.objectContaining({
          code: 'BDR',
          latitude: 19.1065,
          longitude: -96.108,
        }),
        expect.objectContaining({
          code: 'ALV',
          latitude: 18.7735,
          longitude: -95.7615,
        }),
      ]),
    );
    initialSeedLocations.forEach((location) => {
      expect(Number.isFinite(location.latitude)).toBe(true);
      expect(Number.isFinite(location.longitude)).toBe(true);
      expect(location.latitude).toBeGreaterThanOrEqual(-90);
      expect(location.latitude).toBeLessThanOrEqual(90);
      expect(location.longitude).toBeGreaterThanOrEqual(-180);
      expect(location.longitude).toBeLessThanOrEqual(180);
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
      scripts?: {
        'migrate:deploy'?: string;
        'start:docker'?: string;
      };
    };

    expect(packageJson.prisma?.seed).toBe('ts-node prisma/seed.ts');
    expect(packageJson.scripts?.['migrate:deploy']).toBe(
      'prisma migrate deploy',
    );
    expect(packageJson.scripts?.['start:docker']).toBe('npm run start:prod');
    expect(packageJson.scripts?.['start:docker']).not.toContain('migrate');
    expect(packageJson.scripts?.['start:docker']).not.toContain('seed');
  });

  it('runs migrations as a separate deployment job', () => {
    const developmentCompose = readFileSync(developmentComposePath, 'utf8');
    const productionCompose = readFileSync(productionComposePath, 'utf8');

    expect(developmentCompose).toContain('  migrate:\n');
    expect(developmentCompose).toContain('npm run migrate:deploy');
    expect(developmentCompose).toContain(
      'condition: service_completed_successfully',
    );
    expect(developmentCompose).not.toContain('command: npm run start:docker');
    expect(productionCompose).toContain('  migrate:\n');
    expect(productionCompose).toContain('profiles: ["migration"]');
    expect(productionCompose).toContain('npm run migrate:deploy');
    expect(productionCompose).not.toContain('command: npm run start:docker');
  });

  it('provisions local routing providers and PostGIS on the production private network', () => {
    const productionCompose = readFileSync(productionComposePath, 'utf8');

    for (const service of [
      'postgres',
      'photon',
      'osrm',
      'vroom',
      'tileserver',
      'backend',
      'frontend',
    ]) {
      expect(productionCompose).toContain(`  ${service}:\n`);
      expect(productionCompose).toContain(`  ${service}:`);
    }

    expect(productionCompose).toContain('image: postgis/postgis:16-3.5-alpine');
    expect(productionCompose).toContain(
      'postgres_data:/var/lib/postgresql/data',
    );
    expect(productionCompose).toContain(
      'DATABASE_URL: postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}@postgres:5432/${POSTGRES_DB:-pollo_distribucion}?sslmode=disable',
    );
    expect(productionCompose).toContain('OSRM_URL: http://osrm:5000');
    expect(productionCompose).toContain('PHOTON_URL: http://photon:2322');
    expect(productionCompose).toContain('VROOM_URL: http://vroom:3000');
    expect(productionCompose).toContain(
      'MAP_TILES_URL: http://tileserver:8080',
    );
    expect(productionCompose).not.toContain('${DATABASE_URL');
    expect(productionCompose).not.toContain('${OSRM_URL');
    expect(productionCompose).not.toContain('${PHOTON_URL');
    expect(productionCompose).not.toContain('${VROOM_URL');
    expect(productionCompose).not.toContain('Managed PostgreSQL');
    expect(productionCompose).not.toContain('Managed Photon');
    expect(productionCompose).not.toContain('Managed OSRM');
    expect(productionCompose).not.toContain('Managed VROOM');
    expect(productionCompose).toContain(
      '    depends_on:\n      postgres:\n        condition: service_healthy',
    );
    const backendSection =
      productionCompose.match(
        /^ {2}backend:\n([\s\S]*?)(?=^ {2}photon:)/m,
      )?.[0] ?? '';
    for (const optionalDependency of [
      'photon',
      'osrm',
      'vroom',
      'tileserver',
    ]) {
      expect(backendSection).not.toContain(
        `      ${optionalDependency}:\n        condition: service_healthy`,
      );
    }
    expect(productionCompose).toContain(
      '      - "127.0.0.1:${FRONTEND_PORT:-3000}:3000"',
    );
    expect(productionCompose).not.toContain('FRONTEND_BIND_ADDRESS');
    expect(productionCompose).toContain('      - "127.0.0.1:8333:8333"');
    expect(productionCompose.match(/^ {4}ports:$/gm) ?? []).toHaveLength(2);
    expect(productionCompose).toContain(
      'ROUTING_TIMEOUT_MS: ${ROUTING_TIMEOUT_MS:-10000}',
    );
  });

  it('builds the frontend CSP from one explicit Object Storage public origin', () => {
    const developmentCompose = readFileSync(developmentComposePath, 'utf8');
    const productionCompose = readFileSync(productionComposePath, 'utf8');
    const frontendDockerfile = readFileSync(frontendDockerfilePath, 'utf8');
    const environmentExample = readFileSync(environmentExamplePath, 'utf8');
    const releaseWorkflow = readFileSync(releaseWorkflowPath, 'utf8');
    const publicOriginValidator = readFileSync(
      publicOriginValidatorPath,
      'utf8',
    );

    expect(
      frontendDockerfile.match(/^ARG OBJECT_STORAGE_PUBLIC_ORIGIN$/gm),
    ).toHaveLength(2);
    expect(frontendDockerfile).toContain(
      "img-src 'self' data: blob: ${OBJECT_STORAGE_PUBLIC_ORIGIN};",
    );
    expect(frontendDockerfile).not.toContain(
      "img-src 'self' data: blob: http://127.0.0.1:8333;",
    );
    expect(publicOriginValidator).toContain(
      'OBJECT_STORAGE_PUBLIC_ORIGIN must be an explicit HTTP(S) origin without wildcards',
    );
    expect(publicOriginValidator).toContain('origin.includes("*")');
    expect(publicOriginValidator).toContain('url.origin === origin');
    expect(frontendDockerfile).toContain(
      'node /app/scripts/validate-public-origin.mjs "${OBJECT_STORAGE_PUBLIC_ORIGIN}"',
    );

    const validateOrigin = (origin: string, production = false) =>
      spawnSync(
        process.execPath,
        [
          publicOriginValidatorPath,
          origin,
          ...(production ? ['--production'] : []),
        ],
        {
          env: { ...process.env, OPENSSL_CONF: '/dev/null' },
        },
      ).status;

    expect(validateOrigin('https://objects.example.test')).toBe(0);
    expect(validateOrigin('http://127.0.0.1:8333')).toBe(0);
    for (const forbiddenOrigin of [
      'https:',
      '*',
      'https://*.example.test',
      'https://objects.example.test/path',
    ]) {
      expect(validateOrigin(forbiddenOrigin)).not.toBe(0);
    }
    expect(validateOrigin('https://objects.example.com', true)).not.toBe(0);
    expect(validateOrigin('https://objects.pollos.mx', true)).toBe(0);

    expect(developmentCompose).toContain(
      'OBJECT_STORAGE_PUBLIC_ORIGIN: ${OBJECT_STORAGE_PUBLIC_ORIGIN:-http://127.0.0.1:8333}',
    );
    expect(productionCompose).toContain(
      'image: ${FRONTEND_IMAGE:?FRONTEND_IMAGE is required for production}',
    );
    expect(productionCompose).not.toContain(
      'OBJECT_STORAGE_PUBLIC_ORIGIN: ${OBJECT_STORAGE_PUBLIC_ORIGIN:',
    );
    expect(releaseWorkflow).toContain(
      'OBJECT_STORAGE_PUBLIC_ORIGIN: ${{ vars.OBJECT_STORAGE_PUBLIC_ORIGIN }}',
    );
    expect(releaseWorkflow).toContain(
      'REQUIRE_APPROVED_OBJECT_STORAGE_ORIGIN=true',
    );
    expect(productionCompose).toContain(
      'OBJECT_STORAGE_ENDPOINT: http://object-storage:8333',
    );
    expect(productionCompose).toContain(
      'OBJECT_STORAGE_PUBLIC_ENDPOINT: ${OBJECT_STORAGE_PUBLIC_ENDPOINT:?OBJECT_STORAGE_PUBLIC_ENDPOINT is required}',
    );
    expect(environmentExample).toContain('OBJECT_STORAGE_PUBLIC_ENDPOINT=');
    expect(environmentExample).toContain('OBJECT_STORAGE_PUBLIC_ORIGIN=');
  });

  it('provides every required production Compose variable to Docker CI validation', () => {
    const productionCompose = readFileSync(productionComposePath, 'utf8');
    const qualityGateWorkflow = readFileSync(qualityGateWorkflowPath, 'utf8');
    const dockerConfigStepStart = qualityGateWorkflow.indexOf(
      '      - name: Validate production Compose configuration\n',
    );
    const dockerConfigStepEnd = qualityGateWorkflow.indexOf(
      '      - name: Build backend image',
      dockerConfigStepStart,
    );

    expect(dockerConfigStepStart).toBeGreaterThanOrEqual(0);
    expect(dockerConfigStepEnd).toBeGreaterThan(dockerConfigStepStart);

    const dockerConfigStep = qualityGateWorkflow.slice(
      dockerConfigStepStart,
      dockerConfigStepEnd,
    );
    const requiredVariables = [
      ...new Set(
        [...productionCompose.matchAll(/\$\{([A-Z0-9_]+):\?/g)].map(
          ([, variable]) => variable,
        ),
      ),
    ];

    for (const variable of requiredVariables) {
      expect(dockerConfigStep).toContain(`          ${variable}:`);
    }
  });
});
