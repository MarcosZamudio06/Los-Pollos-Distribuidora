import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  PERMISSION_DEFINITIONS,
  ROLE_PERMISSION_KEYS,
} from '../src/common/authorization/permissions';
import {
  BROWSER_DRIVER_DESTINATION,
  browserDriverFixture,
} from './browser-driver-fixture';
import { readBrowserEnvironment } from './browser-environment';

const BROWSER_POS_INITIAL_STOCK_PIECES = 5;
const BROWSER_POS_SALE_PRICE = 12;
const BROWSER_CEDIS_INITIAL_STOCK_PIECES = 10;

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
          update: {
            name: `Browser E2E ${env.runId} CEDIS`,
            type: 'DISTRIBUTION_CENTER',
            address: `Browser E2E ${env.runId} CEDIS address`,
            latitude: 19.1738,
            longitude: -96.1342,
            isActive: true,
          },
          create: {
            code: `BROWSER-${env.runId}-CEDIS`,
            name: `Browser E2E ${env.runId} CEDIS`,
            type: 'DISTRIBUTION_CENTER',
            address: `Browser E2E ${env.runId} CEDIS address`,
            latitude: 19.1738,
            longitude: -96.1342,
            isActive: true,
          },
        });
        const location = await tx.operationalLocation.upsert({
          where: { code: `BROWSER-${env.runId}-BRANCH` },
          update: {
            name: `Browser E2E ${env.runId} Branch`,
            type: 'BRANCH',
            parentId: cedis.id,
            address: `Browser E2E ${env.runId} Branch address`,
            latitude: 19.1761,
            longitude: -96.1321,
            isActive: true,
          },
          create: {
            code: `BROWSER-${env.runId}-BRANCH`,
            name: `Browser E2E ${env.runId} Branch`,
            type: 'BRANCH',
            parentId: cedis.id,
            address: `Browser E2E ${env.runId} Branch address`,
            latitude: 19.1761,
            longitude: -96.1321,
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
          cedisLocationId: cedis.id,
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

        const cedisSupplyPrefix = `BROWSER-${env.runId}-CEDIS-SUPPLY`;
        const cedisSupplyProductSku = `${cedisSupplyPrefix}-SKU`;
        const cedisSupplyCycleId = `browser-${env.runId}-cedis-cycle`;
        const cedisSupplyOpeningMovementId = `browser-${env.runId}-cedis-opening`;
        const cedisDriverEmail = `browser-${env.runId}-driver@example.test`;
        const cedisDriverControlNumber = `BROWSER-${env.runId}-DRIVER`;
        const cedisDriverPhone = `+998${BigInt(
          '0x' +
            createHash('sha256')
              .update(`${env.runId}:driver`)
              .digest('hex')
              .slice(0, 9),
        )
          .toString()
          .padStart(12, '0')}`;
        const cedisVehicleCode = `${cedisSupplyPrefix}-VEHICLE`;

        const existingCedisCycle = await tx.branchSupplyCycle.findUnique({
          where: { id: cedisSupplyCycleId },
          select: { status: true, version: true },
        });
        if (existingCedisCycle) {
          const existingTransfers = await tx.branchSupplyCycleTransfer.count({
            where: { branchSupplyCycleId: cedisSupplyCycleId },
          });
          if (
            existingTransfers > 0 ||
            existingCedisCycle.status !== 'OPEN' ||
            existingCedisCycle.version !== 1
          ) {
            throw new Error(
              `Browser CEDIS fixture ${env.runId} was already used; provide a new E2E_RUN_ID before rerunning`,
            );
          }
        }

        const driverRole = await tx.role.upsert({
          where: { name: 'DRIVER' },
          update: {},
          create: {
            name: 'DRIVER',
            description: 'Browser E2E logistics driver.',
          },
        });
        for (const definition of PERMISSION_DEFINITIONS) {
          if (!ROLE_PERMISSION_KEYS.DRIVER.includes(definition.key)) continue;
          const permission = await tx.permission.upsert({
            where: { key: definition.key },
            update: {},
            create: definition,
          });
          await tx.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: driverRole.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: { roleId: driverRole.id, permissionId: permission.id },
          });
        }
        await tx.user.upsert({
          where: { email: cedisDriverEmail },
          update: {
            name: `Browser E2E ${env.runId} Driver`,
            controlNumber: cedisDriverControlNumber,
            phone: cedisDriverPhone,
            passwordHash,
            roleId: driverRole.id,
            operationalLocationId: cedis.id,
            cedisLocationId: cedis.id,
            isActive: true,
            mustChangePassword: false,
          },
          create: {
            name: `Browser E2E ${env.runId} Driver`,
            email: cedisDriverEmail,
            controlNumber: cedisDriverControlNumber,
            phone: cedisDriverPhone,
            passwordHash,
            roleId: driverRole.id,
            operationalLocationId: cedis.id,
            cedisLocationId: cedis.id,
            isActive: true,
            mustChangePassword: false,
          },
        });
        await tx.vehicle.upsert({
          where: { code: cedisVehicleCode },
          update: {
            displayName: `Browser E2E ${env.runId} supply vehicle`,
            homeLocationId: cedis.id,
            isActive: true,
          },
          create: {
            code: cedisVehicleCode,
            displayName: `Browser E2E ${env.runId} supply vehicle`,
            homeLocationId: cedis.id,
            isActive: true,
          },
        });
        const cedisSupplyProduct = await tx.product.upsert({
          where: { sku: cedisSupplyProductSku },
          update: {
            name: `Browser E2E ${env.runId} CEDIS supply product`,
            presentationType: 'WHOLE',
            salePrice: 60,
            purchaseCost: 40,
            unit: 'PIECE',
            isActive: true,
          },
          create: {
            name: `Browser E2E ${env.runId} CEDIS supply product`,
            sku: cedisSupplyProductSku,
            presentationType: 'WHOLE',
            salePrice: 60,
            purchaseCost: 40,
            unit: 'PIECE',
            isActive: true,
          },
        });
        await tx.inventoryBalance.upsert({
          where: {
            productId_locationId: {
              productId: cedisSupplyProduct.id,
              locationId: cedis.id,
            },
          },
          update: {
            quantityKg: 0,
            quantityPieces: BROWSER_CEDIS_INITIAL_STOCK_PIECES,
            reservedQuantityKg: 0,
            reservedQuantityPieces: 0,
          },
          create: {
            productId: cedisSupplyProduct.id,
            locationId: cedis.id,
            quantityKg: 0,
            quantityPieces: BROWSER_CEDIS_INITIAL_STOCK_PIECES,
            reservedQuantityKg: 0,
            reservedQuantityPieces: 0,
          },
        });
        await tx.inventoryBalance.upsert({
          where: {
            productId_locationId: {
              productId: cedisSupplyProduct.id,
              locationId: location.id,
            },
          },
          update: {
            quantityKg: 0,
            quantityPieces: 0,
            reservedQuantityKg: 0,
            reservedQuantityPieces: 0,
          },
          create: {
            productId: cedisSupplyProduct.id,
            locationId: location.id,
            quantityKg: 0,
            quantityPieces: 0,
            reservedQuantityKg: 0,
            reservedQuantityPieces: 0,
          },
        });
        await tx.inventoryMovement.upsert({
          where: { id: cedisSupplyOpeningMovementId },
          update: {},
          create: {
            id: cedisSupplyOpeningMovementId,
            productId: cedisSupplyProduct.id,
            locationId: cedis.id,
            userId: seededUser.id,
            type: 'ADJUSTMENT',
            quantity: BROWSER_CEDIS_INITIAL_STOCK_PIECES,
            quantityKg: 0,
            quantityPieces: BROWSER_CEDIS_INITIAL_STOCK_PIECES,
            previousStock: 0,
            newStock: BROWSER_CEDIS_INITIAL_STOCK_PIECES,
            previousQuantityKg: 0,
            newQuantityKg: 0,
            previousQuantityPieces: 0,
            newQuantityPieces: BROWSER_CEDIS_INITIAL_STOCK_PIECES,
            reason: 'Browser E2E CEDIS opening stock',
            referenceType: 'BROWSER_E2E_FIXTURE',
            referenceId: env.runId,
            createdAt: new Date(businessDate.getTime() - 12 * 60 * 60 * 1000),
          },
        });
        await tx.branchSupplyCycle.upsert({
          where: { id: cedisSupplyCycleId },
          update: {
            distributionCenterLocationId: cedis.id,
            branchLocationId: location.id,
            businessDate,
            pointOfSaleDailyCloseId: dailyClose.id,
            status: 'OPEN',
            version: 1,
            notes: `Browser E2E ${env.runId} CEDIS supply cycle`,
            openedByUserId: seededUser.id,
          },
          create: {
            id: cedisSupplyCycleId,
            distributionCenterLocationId: cedis.id,
            branchLocationId: location.id,
            businessDate,
            pointOfSaleDailyCloseId: dailyClose.id,
            status: 'OPEN',
            version: 1,
            notes: `Browser E2E ${env.runId} CEDIS supply cycle`,
            openedByUserId: seededUser.id,
          },
        });
        await tx.branchSupplyCycleEvent.upsert({
          where: {
            idempotencyKey: `browser:${env.runId}:cedis-cycle-open`,
          },
          update: {},
          create: {
            branchSupplyCycleId: cedisSupplyCycleId,
            type: 'OPENED',
            cycleVersion: 1,
            toStatus: 'OPEN',
            actorUserId: seededUser.id,
            payload: {
              source: 'BROWSER_E2E_FIXTURE',
              runId: env.runId,
            },
            idempotencyKey: `browser:${env.runId}:cedis-cycle-open`,
          },
        });

        const driverFixture = browserDriverFixture(env.runId);
        const existingDriverRoute = await tx.deliveryRoute.findUnique({
          where: { id: driverFixture.routeId },
          select: { status: true },
        });
        if (existingDriverRoute) {
          throw new Error(
            `Browser DRIVER fixture ${env.runId} was already used; provide a new E2E_RUN_ID before rerunning`,
          );
        }

        const deliveryDriver = await tx.user.upsert({
          where: { email: driverFixture.driverEmail },
          update: {
            name: driverFixture.driverName,
            controlNumber: driverFixture.driverControlNumber,
            phone: driverFixture.customerPhone.replace('+997', '+996'),
            passwordHash,
            roleId: driverRole.id,
            operationalLocationId: cedis.id,
            cedisLocationId: cedis.id,
            isActive: true,
            mustChangePassword: false,
          },
          create: {
            name: driverFixture.driverName,
            email: driverFixture.driverEmail,
            controlNumber: driverFixture.driverControlNumber,
            phone: driverFixture.customerPhone.replace('+997', '+996'),
            passwordHash,
            roleId: driverRole.id,
            operationalLocationId: cedis.id,
            cedisLocationId: cedis.id,
            isActive: true,
            mustChangePassword: false,
          },
        });
        const routeStock = await tx.operationalLocation.upsert({
          where: { code: driverFixture.routeStockCode },
          update: {
            name: `${driverFixture.routeName} stock`,
            type: 'ROUTE_STOCK',
            parentId: cedis.id,
            address: driverFixture.deliveryAddress,
            latitude: BROWSER_DRIVER_DESTINATION.latitude,
            longitude: BROWSER_DRIVER_DESTINATION.longitude,
            isActive: true,
          },
          create: {
            code: driverFixture.routeStockCode,
            name: `${driverFixture.routeName} stock`,
            type: 'ROUTE_STOCK',
            parentId: cedis.id,
            address: driverFixture.deliveryAddress,
            latitude: BROWSER_DRIVER_DESTINATION.latitude,
            longitude: BROWSER_DRIVER_DESTINATION.longitude,
            isActive: true,
          },
        });
        const deliveryVehicle = await tx.vehicle.upsert({
          where: { code: driverFixture.vehicleCode },
          update: {
            displayName: driverFixture.vehicleName,
            homeLocationId: cedis.id,
            isActive: true,
          },
          create: {
            code: driverFixture.vehicleCode,
            displayName: driverFixture.vehicleName,
            homeLocationId: cedis.id,
            isActive: true,
          },
        });
        const deliveryCustomer = await tx.customer.upsert({
          where: { customerNumber: driverFixture.customerNumber },
          update: {
            name: driverFixture.customerName,
            phone: driverFixture.customerPhone,
            address: driverFixture.deliveryAddress,
            deliveryAddress: driverFixture.deliveryAddress,
            customerType: 'RETAIL',
            isActive: true,
          },
          create: {
            customerNumber: driverFixture.customerNumber,
            name: driverFixture.customerName,
            phone: driverFixture.customerPhone,
            address: driverFixture.deliveryAddress,
            deliveryAddress: driverFixture.deliveryAddress,
            customerType: 'RETAIL',
            isActive: true,
          },
        });
        const deliveryProduct = await tx.product.upsert({
          where: { sku: driverFixture.productSku },
          update: {
            name: driverFixture.productName,
            presentationType: 'WHOLE',
            salePrice: driverFixture.saleTotal,
            purchaseCost: 50,
            unit: 'PIECE',
            isActive: true,
          },
          create: {
            name: driverFixture.productName,
            sku: driverFixture.productSku,
            presentationType: 'WHOLE',
            salePrice: driverFixture.saleTotal,
            purchaseCost: 50,
            unit: 'PIECE',
            isActive: true,
          },
        });
        const deliveryRoute = await tx.deliveryRoute.create({
          data: {
            id: driverFixture.routeId,
            name: driverFixture.routeName,
            type: 'SALE_DELIVERY',
            driverId: deliveryDriver.id,
            vehicleId: deliveryVehicle.id,
            status: 'IN_PROGRESS',
            scheduledDate: businessDate,
            originLocationId: cedis.id,
            routeStockLocationId: routeStock.id,
            startedAt: new Date(),
          },
        });
        await tx.customer.update({
          where: { id: deliveryCustomer.id },
          data: { assignedRouteId: deliveryRoute.id },
        });
        await tx.inventoryBalance.upsert({
          where: {
            productId_locationId: {
              productId: deliveryProduct.id,
              locationId: routeStock.id,
            },
          },
          update: {
            quantityKg: 0,
            quantityPieces: 0,
            reservedQuantityKg: 0,
            reservedQuantityPieces: 0,
          },
          create: {
            productId: deliveryProduct.id,
            locationId: routeStock.id,
            quantityKg: 0,
            quantityPieces: 0,
            reservedQuantityKg: 0,
            reservedQuantityPieces: 0,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            id: driverFixture.openingMovementId,
            productId: deliveryProduct.id,
            locationId: routeStock.id,
            userId: seededUser.id,
            type: 'ADJUSTMENT',
            quantity: 1,
            quantityKg: 0,
            quantityPieces: 1,
            previousStock: 0,
            newStock: 1,
            previousQuantityKg: 0,
            newQuantityKg: 0,
            previousQuantityPieces: 0,
            newQuantityPieces: 1,
            reason: 'Browser E2E DRIVER opening route stock',
            referenceType: 'BROWSER_E2E_FIXTURE',
            referenceId: env.runId,
          },
        });
        const deliverySale = await tx.sale.create({
          data: {
            id: driverFixture.saleId,
            saleNumber: driverFixture.saleNumber,
            customerId: deliveryCustomer.id,
            userId: seededUser.id,
            locationId: routeStock.id,
            saleChannel: 'ROUTE',
            documentType: 'SIMPLE_NOTE',
            routeId: deliveryRoute.id,
            businessDate,
            registeredAt: new Date(),
            collectionStatus: 'PAID',
            subtotal: driverFixture.saleTotal,
            discount: 0,
            tax: 0,
            total: driverFixture.saleTotal,
            paymentType: 'CASH_SALE',
            status: 'CONFIRMED',
          },
        });
        await tx.saleItem.create({
          data: {
            id: `browser-${env.runId}-delivery-sale-item`,
            saleId: deliverySale.id,
            productId: deliveryProduct.id,
            quantity: 1,
            quantityKg: 0,
            quantityPieces: 1,
            unit: 'PIECE',
            unitPrice: driverFixture.saleTotal,
            productNameSnapshot: driverFixture.productName,
            productSkuSnapshot: driverFixture.productSku,
            unitPriceSnapshot: driverFixture.saleTotal,
            quantitySnapshot: 1,
            subtotal: driverFixture.saleTotal,
            discount: 0,
            taxableBase: driverFixture.saleTotal,
            tax: 0,
            total: driverFixture.saleTotal,
            unitCostSnapshot: 50,
            costSubtotalSnapshot: 50,
            costSnapshotSource: 'SALE_CONFIRMATION',
          },
        });
        await tx.saleDocument.create({
          data: {
            id: `browser-${env.runId}-delivery-sale-document`,
            saleId: deliverySale.id,
            documentType: 'SIMPLE_NOTE',
            operationalLocationId: routeStock.id,
            status: 'ISSUED',
            routeId: deliveryRoute.id,
            customerSnapshot: {
              id: deliveryCustomer.id,
              name: driverFixture.customerName,
            },
            productSnapshot: [
              {
                id: deliveryProduct.id,
                name: driverFixture.productName,
                sku: driverFixture.productSku,
              },
            ],
            priceSnapshot: { total: driverFixture.saleTotal },
          },
        });
        await tx.inventoryMovement.create({
          data: {
            id: driverFixture.saleMovementId,
            productId: deliveryProduct.id,
            locationId: routeStock.id,
            userId: seededUser.id,
            type: 'SALE',
            quantity: 1,
            quantityKg: 0,
            quantityPieces: 1,
            previousStock: 1,
            newStock: 0,
            previousQuantityKg: 0,
            newQuantityKg: 0,
            previousQuantityPieces: 1,
            newQuantityPieces: 0,
            reason: 'Browser E2E DRIVER paid sale',
            referenceType: 'SALE',
            referenceId: deliverySale.id,
            saleId: deliverySale.id,
          },
        });
        const paymentPayloadHash = createHash('sha256')
          .update(`${driverFixture.paymentId}:${driverFixture.saleTotal}`)
          .digest('hex');
        await tx.payment.create({
          data: {
            id: driverFixture.paymentId,
            saleId: deliverySale.id,
            customerId: deliveryCustomer.id,
            userId: seededUser.id,
            amount: driverFixture.saleTotal,
            paymentMethod: 'CASH',
            operationalLocationId: routeStock.id,
            status: 'APPLIED',
            paidAt: new Date(),
            idempotencyKey: driverFixture.paymentIdempotencyKey,
            idempotencyPayloadHash: paymentPayloadHash,
          },
        });
        await tx.deliveryOrder.create({
          data: {
            id: driverFixture.orderId,
            routeId: deliveryRoute.id,
            saleId: deliverySale.id,
            status: 'PENDING',
            deliveryAddress: driverFixture.deliveryAddress,
            latitude: BROWSER_DRIVER_DESTINATION.latitude,
            longitude: BROWSER_DRIVER_DESTINATION.longitude,
            stopSequence: 1,
            legDistanceMeters: 0,
            legDurationSeconds: 0,
          },
        });
      },
      { timeout: 30_000 },
    );
    console.log(
      `Browser seed ready: ${env.runId} (ADMIN, CEDIS/branch, POS, CEDIS supply and DRIVER delivery fixtures)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
