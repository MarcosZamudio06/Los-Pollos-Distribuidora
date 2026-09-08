import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { browserFleetFixture } from './browser-fleet-fixture';

type BrowserFleetSeedInput = {
  tx: Prisma.TransactionClient;
  adminUserId: string;
  businessDate: Date;
  cedisLocationId: string;
  driverRoleId: string;
  passwordHash: string;
  runId: string;
};

/** Seeds a complete paid delivery route so the DRIVER can start real navigation. */
export async function seedBrowserFleetFixture({
  tx,
  adminUserId,
  businessDate,
  cedisLocationId,
  driverRoleId,
  passwordHash,
  runId,
}: BrowserFleetSeedInput) {
  const fixture = browserFleetFixture(runId);
  const existingRoute = await tx.deliveryRoute.findUnique({
    where: { id: fixture.routeId },
    select: { id: true },
  });
  if (existingRoute) {
    throw new Error(
      `Browser FLEET fixture ${runId} was already used; provide a new E2E_RUN_ID before rerunning`,
    );
  }

  const driver = await tx.user.upsert({
    where: { email: fixture.driverEmail },
    update: {
      name: fixture.driverName,
      controlNumber: fixture.driverControlNumber,
      phone: fixture.customerPhone.replace('+995', '+994'),
      passwordHash,
      roleId: driverRoleId,
      operationalLocationId: cedisLocationId,
      cedisLocationId,
      isActive: true,
      mustChangePassword: false,
    },
    create: {
      name: fixture.driverName,
      email: fixture.driverEmail,
      controlNumber: fixture.driverControlNumber,
      phone: fixture.customerPhone.replace('+995', '+994'),
      passwordHash,
      roleId: driverRoleId,
      operationalLocationId: cedisLocationId,
      cedisLocationId,
      isActive: true,
      mustChangePassword: false,
    },
  });
  const routeStock = await tx.operationalLocation.upsert({
    where: { code: fixture.routeStockCode },
    update: {
      name: `${fixture.routeName} stock`,
      type: 'ROUTE_STOCK',
      parentId: cedisLocationId,
      address: fixture.deliveryAddress,
      latitude: fixture.positionB.latitude,
      longitude: fixture.positionB.longitude,
      isActive: true,
    },
    create: {
      code: fixture.routeStockCode,
      name: `${fixture.routeName} stock`,
      type: 'ROUTE_STOCK',
      parentId: cedisLocationId,
      address: fixture.deliveryAddress,
      latitude: fixture.positionB.latitude,
      longitude: fixture.positionB.longitude,
      isActive: true,
    },
  });
  const vehicle = await tx.vehicle.upsert({
    where: { code: fixture.vehicleCode },
    update: {
      displayName: fixture.vehicleName,
      homeLocationId: cedisLocationId,
      isActive: true,
    },
    create: {
      code: fixture.vehicleCode,
      displayName: fixture.vehicleName,
      homeLocationId: cedisLocationId,
      isActive: true,
    },
  });
  const customer = await tx.customer.upsert({
    where: { customerNumber: fixture.customerNumber },
    update: {
      name: fixture.customerName,
      phone: fixture.customerPhone,
      address: fixture.deliveryAddress,
      deliveryAddress: fixture.deliveryAddress,
      customerType: 'RETAIL',
      isActive: true,
    },
    create: {
      customerNumber: fixture.customerNumber,
      name: fixture.customerName,
      phone: fixture.customerPhone,
      address: fixture.deliveryAddress,
      deliveryAddress: fixture.deliveryAddress,
      customerType: 'RETAIL',
      isActive: true,
    },
  });
  const product = await tx.product.upsert({
    where: { sku: fixture.productSku },
    update: {
      name: fixture.productName,
      presentationType: 'WHOLE',
      salePrice: fixture.saleTotal,
      purchaseCost: 50,
      unit: 'PIECE',
      isActive: true,
    },
    create: {
      name: fixture.productName,
      sku: fixture.productSku,
      presentationType: 'WHOLE',
      salePrice: fixture.saleTotal,
      purchaseCost: 50,
      unit: 'PIECE',
      isActive: true,
    },
  });
  const startedAt = new Date();
  const deliveryRoute = await tx.deliveryRoute.create({
    data: {
      id: fixture.routeId,
      name: fixture.routeName,
      type: 'SALE_DELIVERY',
      driverId: driver.id,
      vehicleId: vehicle.id,
      status: 'IN_PROGRESS',
      scheduledDate: businessDate,
      originLocationId: cedisLocationId,
      routeStockLocationId: routeStock.id,
      geometry: fixture.routeGeometry,
      startedAt,
    },
  });
  await tx.customer.update({
    where: { id: customer.id },
    data: { assignedRouteId: deliveryRoute.id },
  });
  await tx.inventoryBalance.upsert({
    where: {
      productId_locationId: {
        productId: product.id,
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
      productId: product.id,
      locationId: routeStock.id,
      quantityKg: 0,
      quantityPieces: 0,
      reservedQuantityKg: 0,
      reservedQuantityPieces: 0,
    },
  });
  await tx.inventoryMovement.create({
    data: {
      id: fixture.openingMovementId,
      productId: product.id,
      locationId: routeStock.id,
      userId: adminUserId,
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
      reason: 'Browser E2E Fleet realtime opening route stock',
      referenceType: 'BROWSER_E2E_FIXTURE',
      referenceId: runId,
    },
  });

  const sale = await tx.sale.create({
    data: {
      id: fixture.saleId,
      saleNumber: fixture.saleNumber,
      customerId: customer.id,
      userId: adminUserId,
      locationId: routeStock.id,
      saleChannel: 'ROUTE',
      documentType: 'SIMPLE_NOTE',
      routeId: deliveryRoute.id,
      businessDate,
      registeredAt: startedAt,
      collectionStatus: 'PAID',
      subtotal: fixture.saleTotal,
      discount: 0,
      tax: 0,
      total: fixture.saleTotal,
      paymentType: 'CASH_SALE',
      status: 'CONFIRMED',
    },
  });
  await tx.saleItem.create({
    data: {
      id: fixture.saleItemId,
      saleId: sale.id,
      productId: product.id,
      quantity: 1,
      quantityKg: 0,
      quantityPieces: 1,
      unit: 'PIECE',
      unitPrice: fixture.saleTotal,
      productNameSnapshot: fixture.productName,
      productSkuSnapshot: fixture.productSku,
      unitPriceSnapshot: fixture.saleTotal,
      quantitySnapshot: 1,
      subtotal: fixture.saleTotal,
      discount: 0,
      taxableBase: fixture.saleTotal,
      tax: 0,
      total: fixture.saleTotal,
      unitCostSnapshot: 50,
      costSubtotalSnapshot: 50,
      costSnapshotSource: 'SALE_CONFIRMATION',
    },
  });
  await tx.saleDocument.create({
    data: {
      id: fixture.saleDocumentId,
      saleId: sale.id,
      documentType: 'SIMPLE_NOTE',
      operationalLocationId: routeStock.id,
      status: 'ISSUED',
      routeId: deliveryRoute.id,
      customerSnapshot: {
        id: customer.id,
        name: fixture.customerName,
      },
      productSnapshot: [
        {
          id: product.id,
          name: fixture.productName,
          sku: fixture.productSku,
        },
      ],
      priceSnapshot: { total: fixture.saleTotal },
    },
  });
  await tx.inventoryMovement.create({
    data: {
      id: `browser-${runId}-fleet-sale-movement`,
      productId: product.id,
      locationId: routeStock.id,
      userId: adminUserId,
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
      reason: 'Browser E2E Fleet realtime paid sale',
      referenceType: 'SALE',
      referenceId: sale.id,
      saleId: sale.id,
    },
  });
  const paymentPayloadHash = createHash('sha256')
    .update(`${fixture.paymentId}:${fixture.saleTotal}`)
    .digest('hex');
  await tx.payment.create({
    data: {
      id: fixture.paymentId,
      saleId: sale.id,
      customerId: customer.id,
      userId: adminUserId,
      amount: fixture.saleTotal,
      paymentMethod: 'CASH',
      operationalLocationId: routeStock.id,
      status: 'APPLIED',
      paidAt: startedAt,
      idempotencyKey: fixture.paymentIdempotencyKey,
      idempotencyPayloadHash: paymentPayloadHash,
    },
  });
  await tx.deliveryOrder.create({
    data: {
      id: fixture.orderId,
      routeId: deliveryRoute.id,
      saleId: sale.id,
      status: 'PENDING',
      deliveryAddress: fixture.deliveryAddress,
      latitude: fixture.positionB.latitude,
      longitude: fixture.positionB.longitude,
      stopSequence: 1,
      legDistanceMeters: 250,
      legDurationSeconds: 120,
    },
  });

  const initialRecordedAt = new Date(Date.now() - 30_000);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "VehiclePosition" (
      "id",
      "clientEventId",
      "vehicleId",
      "routeId",
      "driverId",
      "latitude",
      "longitude",
      "positionPoint",
      "accuracyMeters",
      "recordedAt"
    )
    VALUES (
      ${fixture.initialPositionId},
      ${fixture.initialClientEventId},
      ${vehicle.id},
      ${deliveryRoute.id},
      ${driver.id},
      ${fixture.positionA.latitude},
      ${fixture.positionA.longitude},
      ST_SetSRID(
        ST_MakePoint(${fixture.positionA.longitude}, ${fixture.positionA.latitude}),
        4326
      ),
      ${fixture.positionA.accuracyMeters},
      ${initialRecordedAt}
    )
  `);
}
