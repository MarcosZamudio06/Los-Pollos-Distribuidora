import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bootstrapProduction,
  parseProductionBootstrapArgs,
  ProductionBootstrapClient,
} from '../../prisma/bootstrap-production';
import { PERMISSION_DEFINITIONS } from '../common/authorization/permissions';
import { assertSeedEnvironment } from '../../prisma/seed-guard';

type AsyncMock<T> = jest.MockedFunction<(args: T) => Promise<unknown>>;

function asyncMock<T>(): AsyncMock<T> {
  return jest.fn<Promise<unknown>, [T]>().mockResolvedValue(undefined);
}

function createClient() {
  const roleUpsert = asyncMock<Prisma.RoleUpsertArgs>();
  const roleFindUnique = jest
    .fn<Promise<{ id: string }>, [Prisma.RoleFindUniqueArgs]>()
    .mockResolvedValue({ id: 'role-id' });
  const permissionUpsert = asyncMock<Prisma.PermissionUpsertArgs>();
  const permissionFindUnique = jest
    .fn<Promise<{ id: string }>, [Prisma.PermissionFindUniqueArgs]>()
    .mockResolvedValue({ id: 'permission-id' });
  const rolePermissionCreateMany =
    asyncMock<Prisma.RolePermissionCreateManyArgs>();
  const locationUpsert = asyncMock<Prisma.OperationalLocationUpsertArgs>();
  const userUpsert = jest
    .fn<Promise<{ id: string }>, [Prisma.UserUpsertArgs]>()
    .mockResolvedValue({ id: 'admin-id' });
  const authSessionUpdateMany = asyncMock<Prisma.AuthSessionUpdateManyArgs>();
  const client: ProductionBootstrapClient = {
    role: { upsert: roleUpsert, findUnique: roleFindUnique },
    permission: { upsert: permissionUpsert, findUnique: permissionFindUnique },
    rolePermission: { createMany: rolePermissionCreateMany },
    operationalLocation: { upsert: locationUpsert },
    user: { upsert: userUpsert },
    authSession: { updateMany: authSessionUpdateMany },
  };

  return {
    client,
    roleUpsert,
    permissionUpsert,
    rolePermissionCreateMany,
    locationUpsert,
    userUpsert,
    authSessionUpdateMany,
  };
}

const productionEnv = {
  NODE_ENV: 'production',
  SEED_ADMIN_PASSWORD: 'production-secret',
};

describe('Production bootstrap contract', () => {
  it('registers separate normal and explicit rotation commands without changing development seed', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as {
      prisma?: { seed?: string };
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['bootstrap:production']).toBe(
      'ts-node prisma/bootstrap-production.ts',
    );
    expect(packageJson.scripts?.['bootstrap:production:rotate-admin']).toBe(
      'ts-node prisma/bootstrap-production.ts --rotate-admin-password',
    );
    expect(packageJson.scripts?.['seed:development']).toBe('prisma db seed');
    expect(packageJson.prisma?.seed).toBe('ts-node prisma/seed.ts');
    expect(packageJson.scripts?.['bootstrap:production']).not.toContain(
      'prisma db seed',
    );
    expect(
      packageJson.scripts?.['bootstrap:production:rotate-admin'],
    ).not.toContain('prisma db seed');
  });

  it.each([
    [undefined, 'SEED_ADMIN_PASSWORD is required for production bootstrap'],
    ['', 'SEED_ADMIN_PASSWORD is required for production bootstrap'],
    ['   ', 'SEED_ADMIN_PASSWORD is required for production bootstrap'],
    ['shortpass', 'SEED_ADMIN_PASSWORD must be at least 10 characters long'],
  ])(
    'rejects an unusable SEED_ADMIN_PASSWORD (%p) before hashing or writing data',
    async (password, expectedError) => {
      const {
        client,
        roleUpsert,
        permissionUpsert,
        rolePermissionCreateMany,
        locationUpsert,
        userUpsert,
        authSessionUpdateMany,
      } = createClient();
      const hashPassword = jest.fn().mockResolvedValue('unused-hash');

      await expect(
        bootstrapProduction(
          client,
          {
            NODE_ENV: 'production',
            SEED_ADMIN_PASSWORD: password,
          },
          { hashPassword },
        ),
      ).rejects.toThrow(expectedError);

      expect(hashPassword).not.toHaveBeenCalled();
      expect(roleUpsert).not.toHaveBeenCalled();
      expect(permissionUpsert).not.toHaveBeenCalled();
      expect(rolePermissionCreateMany).not.toHaveBeenCalled();
      expect(locationUpsert).not.toHaveBeenCalled();
      expect(userUpsert).not.toHaveBeenCalled();
      expect(authSessionUpdateMany).not.toHaveBeenCalled();
    },
  );

  it('preserves surrounding whitespace in a valid password', async () => {
    const { client, userUpsert } = createClient();

    await bootstrapProduction(client, {
      NODE_ENV: 'production',
      SEED_ADMIN_PASSWORD: '  intentional secret  ',
    });

    const hash = userUpsert.mock.calls[0]?.[0].create.passwordHash;
    if (typeof hash !== 'string') throw new Error('Expected password hash');
    await expect(bcrypt.compare('  intentional secret  ', hash)).resolves.toBe(
      true,
    );
    await expect(bcrypt.compare('intentional secret', hash)).resolves.toBe(
      false,
    );
  });

  it('rejects non-production execution before writing and leaves development seed guarded', async () => {
    const { client, roleUpsert } = createClient();

    await expect(
      bootstrapProduction(client, {
        NODE_ENV: 'development',
        SEED_ADMIN_PASSWORD: 'production-secret',
      }),
    ).rejects.toThrow('Production bootstrap requires NODE_ENV=production');

    expect(roleUpsert).not.toHaveBeenCalled();
    expect(() => assertSeedEnvironment('production')).toThrow(
      'Development and operational seeds are disabled when NODE_ENV=production',
    );
    expect(() => assertSeedEnvironment('development')).not.toThrow();
  });

  it('creates the complete operational set on an empty database', async () => {
    const {
      client,
      roleUpsert,
      permissionUpsert,
      rolePermissionCreateMany,
      locationUpsert,
      userUpsert,
    } = createClient();

    await bootstrapProduction(client, productionEnv, {
      hashPassword: jest.fn().mockResolvedValue('hashed-production-secret'),
    });

    expect(roleUpsert).toHaveBeenCalledTimes(6);
    expect(permissionUpsert).toHaveBeenCalledTimes(
      PERMISSION_DEFINITIONS.length,
    );
    expect(rolePermissionCreateMany).toHaveBeenCalledTimes(6);
    expect(locationUpsert).toHaveBeenCalledTimes(2);
    expect(userUpsert).toHaveBeenCalledTimes(1);
    expect(userUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: { email: 'admin@pollos.local' },
      update: { name: 'System Administrator' },
      create: {
        name: 'System Administrator',
        email: 'admin@pollos.local',
        controlNumber: 'EPDP-000001',
        phone: '+520000000001',
        passwordHash: 'hashed-production-secret',
        role: { connect: { name: 'ADMIN' } },
        operationalLocation: { connect: { code: 'MAIN' } },
      },
    });
    expect(locationUpsert.mock.calls.map(([args]) => args.where)).toEqual([
      { code: 'MAIN-CEDIS' },
      { code: 'MAIN' },
    ]);
    expect(locationUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: { code: 'MAIN-CEDIS' },
      create: { name: 'Main Distribution Center', code: 'MAIN-CEDIS' },
      update: { name: 'Main Distribution Center', code: 'MAIN-CEDIS' },
    });
    expect(locationUpsert.mock.calls[1]?.[0]).toMatchObject({
      where: { code: 'MAIN' },
      create: {
        name: 'Main Location',
        code: 'MAIN',
        parent: { connect: { code: 'MAIN-CEDIS' } },
      },
      update: {
        name: 'Main Location',
        code: 'MAIN',
        parent: { connect: { code: 'MAIN-CEDIS' } },
      },
    });
    expect(rolePermissionCreateMany.mock.calls).toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ skipDuplicates: true })],
      ]),
    );
  });

  it('uses custom production bootstrap identity values', async () => {
    const { client, locationUpsert, userUpsert } = createClient();
    const hashPassword = jest.fn().mockResolvedValue('custom-admin-hash');

    await bootstrapProduction(
      client,
      {
        ...productionEnv,
        SEED_CEDIS_NAME: 'Acme Distribution Center',
        SEED_CEDIS_CODE: 'ACME-CEDIS',
        SEED_LOCATION_NAME: 'Acme Branch',
        SEED_LOCATION_CODE: 'ACME-BRANCH',
        SEED_ADMIN_NAME: 'Acme Administrator',
        SEED_ADMIN_EMAIL: 'admin@acme.example',
        SEED_ADMIN_CONTROL_NUMBER: 'ACME-000001',
        SEED_ADMIN_PHONE: '+5215550102030',
      },
      { hashPassword },
    );

    expect(hashPassword).toHaveBeenCalledWith('production-secret', 12);
    expect(locationUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: { code: 'ACME-CEDIS' },
      create: { name: 'Acme Distribution Center', code: 'ACME-CEDIS' },
      update: { name: 'Acme Distribution Center', code: 'ACME-CEDIS' },
    });
    expect(locationUpsert.mock.calls[1]?.[0]).toMatchObject({
      where: { code: 'ACME-BRANCH' },
      create: {
        name: 'Acme Branch',
        code: 'ACME-BRANCH',
        parent: { connect: { code: 'ACME-CEDIS' } },
      },
      update: {
        name: 'Acme Branch',
        code: 'ACME-BRANCH',
        parent: { connect: { code: 'ACME-CEDIS' } },
      },
    });
    expect(userUpsert.mock.calls[0]?.[0]).toMatchObject({
      where: { email: 'admin@acme.example' },
      update: { name: 'Acme Administrator' },
      create: {
        name: 'Acme Administrator',
        email: 'admin@acme.example',
        controlNumber: 'ACME-000001',
        phone: '+5215550102030',
        passwordHash: 'custom-admin-hash',
        role: { connect: { name: 'ADMIN' } },
        operationalLocation: { connect: { code: 'ACME-BRANCH' } },
      },
    });
  });

  it.each([
    {
      env: { SEED_CEDIS_NAME: '   ' },
      expectedError: 'SEED_CEDIS_NAME must not be blank',
    },
    {
      env: { SEED_CEDIS_CODE: '' },
      expectedError: 'SEED_CEDIS_CODE must not be blank',
    },
    {
      env: { SEED_LOCATION_NAME: '   ' },
      expectedError: 'SEED_LOCATION_NAME must not be blank',
    },
    {
      env: { SEED_LOCATION_CODE: '' },
      expectedError: 'SEED_LOCATION_CODE must not be blank',
    },
    {
      env: { SEED_ADMIN_NAME: '   ' },
      expectedError: 'SEED_ADMIN_NAME must not be blank',
    },
    {
      env: { SEED_ADMIN_EMAIL: '' },
      expectedError: 'SEED_ADMIN_EMAIL must not be blank',
    },
    {
      env: { SEED_ADMIN_CONTROL_NUMBER: '   ' },
      expectedError: 'SEED_ADMIN_CONTROL_NUMBER must not be blank',
    },
    {
      env: { SEED_ADMIN_PHONE: '' },
      expectedError: 'SEED_ADMIN_PHONE must not be blank',
    },
    {
      env: {
        SEED_CEDIS_CODE: 'DUPLICATE',
        SEED_LOCATION_CODE: 'DUPLICATE',
      },
      expectedError: 'SEED_CEDIS_CODE and SEED_LOCATION_CODE must be different',
    },
    {
      env: { SEED_ADMIN_EMAIL: 'not-an-email' },
      expectedError: 'SEED_ADMIN_EMAIL must be a valid email address',
    },
  ])(
    'rejects invalid bootstrap identity before hashing or writes: $expectedError',
    async ({ env, expectedError }) => {
      const { client, roleUpsert, locationUpsert, userUpsert } = createClient();
      const hashPassword = jest.fn().mockResolvedValue('unused-hash');

      await expect(
        bootstrapProduction(
          client,
          { ...productionEnv, ...env },
          {
            hashPassword,
          },
        ),
      ).rejects.toThrow(expectedError);

      expect(hashPassword).not.toHaveBeenCalled();
      expect(roleUpsert).not.toHaveBeenCalled();
      expect(locationUpsert).not.toHaveBeenCalled();
      expect(userUpsert).not.toHaveBeenCalled();
    },
  );

  it('does not change password or session state during a normal rerun', async () => {
    const { client, userUpsert, authSessionUpdateMany } = createClient();

    await bootstrapProduction(client, productionEnv, {
      hashPassword: jest.fn().mockResolvedValue('hashed-production-secret'),
    });
    await bootstrapProduction(client, {
      ...productionEnv,
      SEED_ADMIN_PASSWORD: 'a-different-secret',
    });

    const normalRerun = userUpsert.mock.calls[1]?.[0];
    expect(normalRerun?.update).not.toHaveProperty('passwordHash');
    expect(normalRerun?.update).not.toHaveProperty('mustChangePassword');
    expect(normalRerun?.update).not.toHaveProperty('sessionVersion');
    expect(authSessionUpdateMany).not.toHaveBeenCalled();
  });

  it('rotates the existing administrator only through the explicit route', async () => {
    const { client, userUpsert, authSessionUpdateMany } = createClient();

    await bootstrapProduction(
      client,
      { ...productionEnv, SEED_ADMIN_PASSWORD: 'rotated-secret' },
      { hashPassword: jest.fn().mockResolvedValue('rotated-hash') },
      { rotateAdminPassword: true },
    );

    const rotation = userUpsert.mock.calls[0]?.[0];
    expect(rotation?.update).toMatchObject({
      passwordHash: 'rotated-hash',
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    });
    expect(Object.keys(rotation?.update ?? {}).sort()).toEqual([
      'isActive',
      'mustChangePassword',
      'name',
      'operationalLocation',
      'passwordHash',
      'role',
      'sessionVersion',
    ]);
    expect(authSessionUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'admin-id', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('parses only the documented explicit rotation flag', () => {
    expect(parseProductionBootstrapArgs([])).toEqual({
      rotateAdminPassword: false,
    });
    expect(parseProductionBootstrapArgs(['--rotate-admin-password'])).toEqual({
      rotateAdminPassword: true,
    });
    expect(() => parseProductionBootstrapArgs(['--unknown'])).toThrow(
      'Unknown argument: --unknown',
    );
    expect(() =>
      parseProductionBootstrapArgs(['--rotate-admin-password', '--unknown']),
    ).toThrow('Unknown argument: --unknown');
  });

  it('wires the one-shot migration-profile bootstrap without leaking its secret to backend', () => {
    const compose = readFileSync(
      resolve(__dirname, '../../../docker-compose.production.yml'),
      'utf8',
    );
    const backendStart = compose.indexOf('\n  backend:');
    const frontendStart = compose.indexOf('\n  frontend:');
    const backendSection = compose.slice(backendStart, frontendStart);
    const bootstrapStart = compose.indexOf('\n  bootstrap:');
    const bootstrapSection = compose.slice(bootstrapStart, backendStart);

    expect(compose).toContain('  bootstrap:');
    expect(compose).toContain('profiles: ["migration"]');
    expect(compose).toContain('command: npm run bootstrap:production');
    expect(compose).toContain('SEED_ADMIN_PASSWORD: ${SEED_ADMIN_PASSWORD:-}');
    expect(bootstrapSection).toContain(
      'SEED_CEDIS_NAME: "${SEED_CEDIS_NAME-Main Distribution Center}"',
    );
    expect(bootstrapSection).toContain(
      'SEED_CEDIS_CODE: "${SEED_CEDIS_CODE-MAIN-CEDIS}"',
    );
    expect(bootstrapSection).toContain(
      'SEED_LOCATION_NAME: "${SEED_LOCATION_NAME-Main Location}"',
    );
    expect(bootstrapSection).toContain(
      'SEED_LOCATION_CODE: "${SEED_LOCATION_CODE-MAIN}"',
    );
    expect(bootstrapSection).toContain(
      'SEED_ADMIN_NAME: "${SEED_ADMIN_NAME-System Administrator}"',
    );
    expect(bootstrapSection).toContain(
      'SEED_ADMIN_EMAIL: "${SEED_ADMIN_EMAIL-admin@pollos.local}"',
    );
    expect(bootstrapSection).toContain(
      'SEED_ADMIN_CONTROL_NUMBER: "${SEED_ADMIN_CONTROL_NUMBER-EPDP-000001}"',
    );
    expect(bootstrapSection).toContain(
      'SEED_ADMIN_PHONE: "${SEED_ADMIN_PHONE-+520000000001}"',
    );
    expect(compose).not.toContain(
      'SEED_ADMIN_PASSWORD: ${SEED_ADMIN_PASSWORD:?SEED_ADMIN_PASSWORD is required for production bootstrap}',
    );
    expect(compose).toContain(
      '    depends_on:\n      migrate:\n        condition: service_completed_successfully',
    );
    expect(compose).toContain('bootstrap:\n    profiles: ["migration"]');
    expect(compose).not.toContain(
      'command: npm run bootstrap:production --rotate-admin-password',
    );
    for (const variable of [
      'SEED_ADMIN_PASSWORD',
      'SEED_CEDIS_NAME',
      'SEED_CEDIS_CODE',
      'SEED_LOCATION_NAME',
      'SEED_LOCATION_CODE',
      'SEED_ADMIN_NAME',
      'SEED_ADMIN_EMAIL',
      'SEED_ADMIN_CONTROL_NUMBER',
      'SEED_ADMIN_PHONE',
    ]) {
      expect(backendSection).not.toContain(variable);
    }
  });

  it('documents the safe deployment path, verifiable postconditions, and explicit rerun rotation', () => {
    const envExample = readFileSync(
      resolve(__dirname, '../../../.env.example'),
      'utf8',
    );
    const productionEnvExample = readFileSync(
      resolve(__dirname, '../../../.env.production.example'),
      'utf8',
    );
    const runbook = readFileSync(
      resolve(__dirname, '../../../docs/runbooks/backend-deployment.md'),
      'utf8',
    );

    expect(envExample).toContain('SEED_ADMIN_PASSWORD=\n');
    expect(envExample).not.toMatch(/SEED_ADMIN_PASSWORD=\S+/);
    for (const example of [envExample, productionEnvExample]) {
      expect(example).toContain('SEED_CEDIS_NAME=Main Distribution Center');
      expect(example).toContain('SEED_CEDIS_CODE=MAIN-CEDIS');
      expect(example).toContain('SEED_LOCATION_NAME=Main Location');
      expect(example).toContain('SEED_LOCATION_CODE=MAIN');
      expect(example).toContain('SEED_ADMIN_NAME=System Administrator');
      expect(example).toContain('SEED_ADMIN_EMAIL=admin@pollos.local');
      expect(example).toContain('SEED_ADMIN_CONTROL_NUMBER=EPDP-000001');
      expect(example).toContain('SEED_ADMIN_PHONE=+520000000001');
    }
    expect(runbook).toContain('at least 10 characters');
    expect(runbook).toContain('read -r -s');
    expect(runbook).toContain(
      'docker compose -f docker-compose.production.yml --profile migration run --rm migrate',
    );
    expect(runbook).toContain(
      'docker compose -f docker-compose.production.yml --profile migration run --rm bootstrap',
    );
    expect(runbook).toContain('--rotate-admin-password');
    expect(runbook).toContain('JOIN "Role"');
    expect(runbook).toContain('JOIN "OperationalLocation"');
    expect(runbook).toContain('GROUP BY r.name');
    expect(runbook).not.toContain('COUNT(*) AS role_permission_count');
    expect(runbook).toContain('passwordHash');
    expect(runbook).toContain('sessionVersion');
    expect(runbook).toMatch(
      /must not be printed,?\s*committed,?\s*or included in logs/,
    );
    expect(runbook).not.toMatch(/SEED_ADMIN_PASSWORD\s*=\s*[^\n#]+\S/);
  });

  it('closes Prisma on both CLI success and failure', () => {
    const source = readFileSync(
      resolve(__dirname, '../../prisma/bootstrap-production.ts'),
      'utf8',
    );

    expect(source).toContain('finally');
    expect(source).toContain('await prisma.$disconnect()');
    expect(source).toContain('process.exitCode = 1');
  });
});
