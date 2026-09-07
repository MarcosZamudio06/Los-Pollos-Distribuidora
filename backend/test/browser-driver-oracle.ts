import { PrismaClient } from '@prisma/client';
import { readBrowserEnvironment } from './browser-environment';
import { browserDriverFixture } from './browser-driver-fixture';

export type BrowserDriverSnapshot = {
  routeOwnerId: string | null;
  routeStatus: string;
  pendingOrdersCount: number;
  deliveryOrderCount: number;
  deliveryOrderStatus: string;
  deliveredAt: string | null;
  deliveredByUserId: string | null;
  evidenceCount: number;
  photoEvidenceCount: number;
  capturedByUserId: string | null;
  photoMetadata: Record<string, unknown> | null;
  photoStorageKey: string | null;
  photoMimeType: string | null;
  photoSha256: string | null;
  photoSizeBytes: number | null;
  paymentCount: number;
  accountReceivableCount: number;
  incidentCount: number;
  positionCount: number;
  positionAccuracyMeters: number | null;
  positionRecordedAt: string | null;
};

export async function createBrowserDriverOracle() {
  const env = readBrowserEnvironment();
  const fixture = browserDriverFixture(env.runId);
  const prisma = new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
  });
  const [driver, routeStock, vehicle, customer, product, sale, route, order] =
    await Promise.all([
      prisma.user.findUnique({
        where: { email: fixture.driverEmail },
        select: { id: true },
      }),
      prisma.operationalLocation.findUnique({
        where: { code: fixture.routeStockCode },
        select: { id: true },
      }),
      prisma.vehicle.findUnique({
        where: { code: fixture.vehicleCode },
        select: { id: true },
      }),
      prisma.customer.findUnique({
        where: { customerNumber: fixture.customerNumber },
        select: { id: true },
      }),
      prisma.product.findUnique({
        where: { sku: fixture.productSku },
        select: { id: true },
      }),
      prisma.sale.findUnique({
        where: { id: fixture.saleId },
        select: { id: true },
      }),
      prisma.deliveryRoute.findUnique({
        where: { id: fixture.routeId },
        select: { id: true },
      }),
      prisma.deliveryOrder.findUnique({
        where: { id: fixture.orderId },
        select: { id: true },
      }),
    ]);
  if (
    !driver ||
    !routeStock ||
    !vehicle ||
    !customer ||
    !product ||
    !sale ||
    !route ||
    !order
  ) {
    await prisma.$disconnect();
    throw new Error(
      'Browser DRIVER fixture is incomplete; run browser:prepare first',
    );
  }

  const resolvedFixture = {
    ...fixture,
    customerId: customer.id,
    driverId: driver.id,
    orderId: order.id,
    productId: product.id,
    routeId: route.id,
    routeStockId: routeStock.id,
    saleId: sale.id,
    vehicleId: vehicle.id,
  };

  async function refreshPersistedPosition() {
    const updated = await prisma.vehiclePosition.updateMany({
      where: {
        id: resolvedFixture.positionId,
        routeId: resolvedFixture.routeId,
        driverId: resolvedFixture.driverId,
        vehicleId: resolvedFixture.vehicleId,
      },
      data: { recordedAt: new Date(), receivedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new Error('Browser DRIVER persisted GPS fixture is missing');
    }
  }

  async function snapshot(): Promise<BrowserDriverSnapshot> {
    const [
      routeRow,
      orders,
      evidence,
      payments,
      receivables,
      incidents,
      positions,
    ] = await Promise.all([
      prisma.deliveryRoute.findUnique({
        where: { id: resolvedFixture.routeId },
        select: { driverId: true, status: true },
      }),
      prisma.deliveryOrder.findMany({
        where: { routeId: resolvedFixture.routeId },
        select: {
          id: true,
          status: true,
          deliveredAt: true,
          deliveredByUserId: true,
        },
        orderBy: { id: 'asc' },
      }),
      prisma.deliveryEvidence.findMany({
        where: { deliveryOrderId: resolvedFixture.orderId },
        select: {
          type: true,
          capturedByUserId: true,
          metadata: true,
          storageKey: true,
          mimeType: true,
          sha256: true,
          sizeBytes: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.payment.count({ where: { saleId: resolvedFixture.saleId } }),
      prisma.accountReceivable.count({
        where: { saleId: resolvedFixture.saleId },
      }),
      prisma.deliveryIncident.count({
        where: {
          OR: [
            { routeId: resolvedFixture.routeId },
            { deliveryOrderId: resolvedFixture.orderId },
          ],
        },
      }),
      prisma.vehiclePosition.findMany({
        where: {
          routeId: resolvedFixture.routeId,
          driverId: resolvedFixture.driverId,
          vehicleId: resolvedFixture.vehicleId,
        },
        select: { accuracyMeters: true, recordedAt: true },
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const deliveryOrder = orders.length === 1 ? orders[0] : null;
    const photos = evidence.filter((item) => item.type === 'PHOTO');
    const photo = photos.length === 1 ? photos[0] : null;
    const latestPosition = positions[0] ?? null;
    return {
      routeOwnerId: routeRow?.driverId ?? null,
      routeStatus: routeRow?.status ?? 'MISSING',
      pendingOrdersCount: orders.filter((item) =>
        ['PENDING', 'IN_ROUTE'].includes(item.status),
      ).length,
      deliveryOrderCount: orders.length,
      deliveryOrderStatus: deliveryOrder?.status ?? 'MISSING',
      deliveredAt: deliveryOrder?.deliveredAt?.toISOString() ?? null,
      deliveredByUserId: deliveryOrder?.deliveredByUserId ?? null,
      evidenceCount: evidence.length,
      photoEvidenceCount: photos.length,
      capturedByUserId: photo?.capturedByUserId ?? null,
      photoMetadata:
        photo?.metadata && typeof photo.metadata === 'object'
          ? (photo.metadata as Record<string, unknown>)
          : null,
      photoStorageKey: photo?.storageKey ?? null,
      photoMimeType: photo?.mimeType ?? null,
      photoSha256: photo?.sha256 ?? null,
      photoSizeBytes: photo?.sizeBytes ?? null,
      paymentCount: payments,
      accountReceivableCount: receivables,
      incidentCount: incidents,
      positionCount: positions.length,
      positionAccuracyMeters:
        latestPosition?.accuracyMeters == null
          ? null
          : Number(latestPosition.accuracyMeters),
      positionRecordedAt: latestPosition?.recordedAt.toISOString() ?? null,
    };
  }

  return {
    fixture: resolvedFixture,
    objectStorageOrigin: new URL(env.objectStoragePublicEndpoint).origin,
    refreshPersistedPosition,
    snapshot,
    disconnect: () => prisma.$disconnect(),
  };
}
