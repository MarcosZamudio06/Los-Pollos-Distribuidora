import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bootstrapProduction,
  ProductionBootstrapClient,
} from '../../prisma/bootstrap-production';
import { assertSeedEnvironment } from '../../prisma/seed-guard';

type UpsertMock<T> = jest.MockedFunction<(args: T) => Promise<unknown>>;

function upsertMock<T>(): UpsertMock<T> {
  return jest.fn<Promise<unknown>, [T]>().mockResolvedValue(undefined);
}

function createClient() {
  const roleUpsert = upsertMock<Prisma.RoleUpsertArgs>();
  const locationUpsert = upsertMock<Prisma.OperationalLocationUpsertArgs>();
  const userUpsert = upsertMock<Prisma.UserUpsertArgs>();
  const client: ProductionBootstrapClient = {
    role: { upsert: roleUpsert },
    operationalLocation: { upsert: locationUpsert },
    user: { upsert: userUpsert },
  };

  return { client, roleUpsert, locationUpsert, userUpsert };
}

describe('Production bootstrap contract', () => {
  it('registers a separate command and leaves prisma db seed unchanged', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(__dirname, '../../package.json'), 'utf8'),
    ) as {
      prisma?: { seed?: string };
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['bootstrap:production']).toBe(
      'ts-node prisma/bootstrap-production.ts',
    );
    expect(packageJson.scripts?.['seed:development']).toBe('prisma db seed');
    expect(packageJson.prisma?.seed).toBe('ts-node prisma/seed.ts');
    expect(packageJson.scripts?.['bootstrap:production']).not.toContain(
      'prisma db seed',
    );
  });

  it.each([undefined, '', '   '])(
    'rejects an unusable SEED_ADMIN_PASSWORD (%p) before writing data',
    async (password) => {
      const { client, roleUpsert, locationUpsert, userUpsert } = createClient();

      await expect(
        bootstrapProduction(client, {
          NODE_ENV: 'production',
          SEED_ADMIN_PASSWORD: password,
        }),
      ).rejects.toThrow(
        'SEED_ADMIN_PASSWORD is required for production bootstrap',
      );

      expect(roleUpsert).not.toHaveBeenCalled();
      expect(locationUpsert).not.toHaveBeenCalled();
      expect(userUpsert).not.toHaveBeenCalled();
    },
  );

  it('preserves surrounding whitespace in a nonempty password', async () => {
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
    await expect(bcrypt.compare('intentional secret', hash)).resolves.toBe(false);
  });

  it('rejects non-production execution without changing the development seed guard', async () => {
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

  it('idempotently upserts only roles, the initial location, and the administrator', async () => {
    const { client, roleUpsert, locationUpsert, userUpsert } = createClient();
    const env = {
      NODE_ENV: 'production',
      SEED_ADMIN_PASSWORD: 'production-secret',
    };

    await bootstrapProduction(client, env);
    await bootstrapProduction(client, env);

    expect(roleUpsert).toHaveBeenCalledTimes(10);
    expect(locationUpsert).toHaveBeenCalledTimes(2);
    expect(userUpsert).toHaveBeenCalledTimes(2);
    for (const call of roleUpsert.mock.calls) {
      const upsert = call[0];
      expect(upsert.where).toEqual({ name: upsert.create.name });
    }
    for (const call of locationUpsert.mock.calls) {
      expect(call[0]).toMatchObject({
        where: { code: 'MAIN' },
        create: { code: 'MAIN' },
      });
    }
    for (const call of userUpsert.mock.calls) {
      const adminUpsert = call[0];
      expect(adminUpsert).toMatchObject({
        where: { email: 'admin@pollos.local' },
        update: {
          name: 'System Administrator',
          isActive: true,
          mustChangePassword: true,
          role: { connect: { name: 'ADMIN' } },
          operationalLocation: { connect: { code: 'MAIN' } },
        },
        create: {
          name: 'System Administrator',
          email: 'admin@pollos.local',
          controlNumber: 'EPDP-000001',
          phone: '+520000000001',
          isActive: true,
          mustChangePassword: true,
          role: { connect: { name: 'ADMIN' } },
          operationalLocation: { connect: { code: 'MAIN' } },
        },
      });
      expect(adminUpsert.update).not.toHaveProperty('passwordHash');
      const hash = adminUpsert.create.passwordHash;
      if (typeof hash !== 'string') throw new Error('Expected password hash');
      await expect(bcrypt.compare('production-secret', hash)).resolves.toBe(true);
      expect(hash).toMatch(/^\$2[aby]\$12\$/);
    }
    expect(userUpsert.mock.calls[0]?.[0].create.passwordHash).not.toBe(
      userUpsert.mock.calls[1]?.[0].create.passwordHash,
    );
  });
});
