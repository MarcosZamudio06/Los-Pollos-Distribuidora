import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_KEYS,
} from '../src/common/authorization/permissions';
import { readBrowserEnvironment } from './browser-environment';

const BROWSER_POS_INITIAL_STOCK_PIECES = 5;
const BROWSER_POS_SALE_PRICE = 12;

function currentBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: process.env.APP_TIMEZONE?.trim() || 'America/Mexico_City',
    year: 'numeric',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

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
          update: { isActive: true },
          create: {
            code: `BROWSER-${env.runId}-CEDIS`,
            name: `Browser E2E ${env.runId} CEDIS`,
            type: 'DISTRIBUTION_CENTER',
            isActive: true,
          },
        });
        const location = await tx.operationalLocation.upsert({
          where: { code: `BROWSER-${env.runId}-BRANCH` },
          update: {
            name: `Browser E2E ${env.runId} Branch`,
            type: 'BRANCH',
            parentId: cedis.id,
            isActive: true,
          },
          create: {
            code: `BROWSER-${env.runId}-BRANCH`,
            name: `Browser E2E ${env.runId} Branch`,
            type: 'BRANCH',
            parentId: cedis.id,
            isActive: true,
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
        const seededUser = await tx.user.upsert({
          where: { email: env.email },
          create: user,
          update: user,
        });

        const businessDateValue = currentBusinessDate();
        const businessDate = new Date(`${businessDateValue}T00:00:00.000Z`);
        const fixturePrefix = `BROWSER-${env.runId}-POS`;
        const productSku = `${fixturePrefix}-SKU`;
        const terminalCode = `${fixturePrefix}-TERMINAL`;
        const deviceId = `${fixturePrefix}-DEVICE`;
        const dailyCloseId = `browser-${env.runId}-daily-close`;
        const cashShiftId = `browser-${env.runId}-cash-shift`;
        const openingMovementId = `browser-${env.runId}-pos-opening`;

        const existingShift = await tx.cashShift.findUnique({
          where: { id: cashShiftId },
          select: { status: true },
        });
        if (existingShift) {
          const existingSales = await tx.sale.count({
            where: { cashShiftId: cashShiftId },
          });
          if (existingSales > 0 || existingShift.status !== 'OPEN') {
            throw new Error(
              `Browser POS fixture ${env.runId} was already used; provide a new E2E_RUN_ID before rerunning`,
            );
          }
        }

        const terminal = await tx.cashTerminal.upsert({
          where: {
            operationalLocationId_code: {
              operationalLocationId: location.id,
              code: terminalCode,
            },
          },
          update: {
            name: `Browser E2E ${env.runId} POS terminal`,
            deviceId,
            isActive: true,
          },
          create: {
            operationalLocationId: location.id,
            code: terminalCode,
            name: `Browser E2E ${env.runId} POS terminal`,
            deviceId,
            isActive: true,
          },
        });
        const product = await tx.product.upsert({
          where: { sku: productSku },
          update: {
            name: `Browser E2E ${env.runId} POS product`,
            presentationType: 'WHOLE',
            salePrice: BROWSER_POS_SALE_PRICE,
            purchaseCost: 8,
            unit: 'PIECE',
            isActive: true,
          },
          create: {
            name: `Browser E2E ${env.runId} POS product`,
            sku: productSku,
            presentationType: 'WHOLE',
            salePrice: BROWSER_POS_SALE_PRICE,
            purchaseCost: 8,
            unit: 'PIECE',
            isActive: true,
          },
        });
        const dailyClose = await tx.pointOfSaleDailyClose.upsert({
          where: { id: dailyCloseId },
          update: {},
          create: {
            id: dailyCloseId,
            operationalLocationId: location.id,
            businessDate,
            terminalIdentifier: terminal.name,
            openedByUserId: seededUser.id,
            status: 'DRAFT',
            cashSessionStatus: 'OPEN',
          },
        });
        await tx.inventoryBalance.upsert({
          where: {
            productId_locationId: {
              productId: product.id,
              locationId: location.id,
            },
          },
          update: {},
          create: {
            productId: product.id,
            locationId: location.id,
            quantityKg: 0,
            quantityPieces: BROWSER_POS_INITIAL_STOCK_PIECES,
            reservedQuantityKg: 0,
            reservedQuantityPieces: 0,
          },
        });
        await tx.inventoryMovement.upsert({
          where: { id: openingMovementId },
          update: {},
          create: {
            id: openingMovementId,
            productId: product.id,
            locationId: location.id,
            userId: seededUser.id,
            type: 'ADJUSTMENT',
            quantity: BROWSER_POS_INITIAL_STOCK_PIECES,
            quantityKg: 0,
            quantityPieces: BROWSER_POS_INITIAL_STOCK_PIECES,
            previousStock: 0,
            newStock: BROWSER_POS_INITIAL_STOCK_PIECES,
            previousQuantityKg: 0,
            newQuantityKg: 0,
            previousQuantityPieces: 0,
            newQuantityPieces: BROWSER_POS_INITIAL_STOCK_PIECES,
            reason: 'Browser E2E POS opening stock',
            referenceType: 'BROWSER_E2E_FIXTURE',
            referenceId: env.runId,
            pointOfSaleDailyCloseId: dailyClose.id,
            createdAt: new Date(businessDate.getTime() - 12 * 60 * 60 * 1000),
          },
        });
        await tx.cashShift.upsert({
          where: { id: cashShiftId },
          update: {},
          create: {
            id: cashShiftId,
            terminalId: terminal.id,
            operationalLocationId: location.id,
            pointOfSaleDailyCloseId: dailyClose.id,
            cashierUserId: seededUser.id,
            businessDate,
            status: 'OPEN',
            initialCashFund: 0,
            initialCashIn: 0,
            initialCashOut: 0,
          },
        });
      },
      { timeout: 30_000 },
    );
    console.log(
      `Browser seed ready: ${env.runId} (ADMIN, branch, POS terminal, open shift, product and opening inventory)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
