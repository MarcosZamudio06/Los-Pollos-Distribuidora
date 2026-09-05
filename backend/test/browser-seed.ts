import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_KEYS,
} from '../src/common/authorization/permissions';
import { readBrowserEnvironment } from './browser-environment';

/** No development seed, deletes, reset, token issuance or application mocks. */
export async function seedBrowserDatabase() {
  const env = readBrowserEnvironment();
  const prisma = new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
  });
  try {
    const versions = await prisma.$queryRaw<
      Array<{ postgres: string; postgis: string }>
    >`
      SELECT version() AS postgres, postgis_full_version() AS postgis
    `;
    console.log(JSON.stringify(versions[0]));
    const passwordHash = await bcrypt.hash(env.password, 12);
    await prisma.$transaction(
      async (tx) => {
        const role = await tx.role.upsert({
          where: { name: 'ADMIN' },
          update: {},
          create: {
            name: 'ADMIN',
            description: 'System administrator with full access.',
          },
        });
        for (const definition of PERMISSION_DEFINITIONS) {
          if (!ROLE_PERMISSION_KEYS.ADMIN.includes(definition.key)) continue;
          const permission = await tx.permission.upsert({
            where: { key: definition.key },
            update: {},
            create: definition,
          });
          await tx.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: { roleId: role.id, permissionId: permission.id },
          });
        }
        const cedis = await tx.operationalLocation.upsert({
          where: { code: `BROWSER-${env.runId}-CEDIS` },
          update: {},
          create: {
            code: `BROWSER-${env.runId}-CEDIS`,
            name: `Browser E2E ${env.runId} CEDIS`,
            type: 'DISTRIBUTION_CENTER',
          },
        });
        const location = await tx.operationalLocation.upsert({
          where: { code: `BROWSER-${env.runId}-BRANCH` },
          update: {},
          create: {
            code: `BROWSER-${env.runId}-BRANCH`,
            name: `Browser E2E ${env.runId} Branch`,
            type: 'BRANCH',
            parentId: cedis.id,
          },
        });
        const user = {
          name: `Browser E2E ${env.runId}`,
          email: env.email,
          passwordHash,
          controlNumber: `BROWSER-${env.runId}`,
          phone: `+999${BigInt(
            '0x' +
              createHash('sha256').update(env.runId).digest('hex').slice(0, 9),
          )
            .toString()
            .padStart(12, '0')}`,
          roleId: role.id,
          operationalLocationId: location.id,
          isActive: true,
          mustChangePassword: false,
        };
        // The reserved email is the run identity; upsert never touches development users.
        await tx.user.upsert({
          where: { email: env.email },
          create: user,
          update: user,
        });
      },
      { timeout: 30_000 },
    );
    console.log(
      `Browser seed ready: ${env.runId} (ADMIN, canonical permissions, CEDIS and branch)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
