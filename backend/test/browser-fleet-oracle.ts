import { PrismaClient } from '@prisma/client';
import { browserFleetFixture } from './browser-fleet-fixture';
import { readBrowserEnvironment } from './browser-environment';

export type BrowserFleetPositionSnapshot = {
  id: string;
  clientEventId: string;
  vehicleId: string;
  routeId: string;
  driverId: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
  receivedAt: string;
};

export type BrowserFleetSnapshot = {
  routeOwnerId: string | null;
  routeVehicleId: string | null;
  routeStatus: string;
  positionCount: number;
  positions: BrowserFleetPositionSnapshot[];
  latestPosition: BrowserFleetPositionSnapshot | null;
  saleCount: number;
  paymentCount: number;
  accountReceivableCount: number;
  evidenceCount: number;
  incidentCount: number;
};

export async function createBrowserFleetOracle() {
  const env = readBrowserEnvironment();
  const fixture = browserFleetFixture(env.runId);
  const prisma = new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
  });
  const [driver, vehicle, route, sale, order] = await Promise.all([
    prisma.user.findUnique({
      where: { email: fixture.driverEmail },
      select: { id: true },
    }),
    prisma.vehicle.findUnique({
      where: { code: fixture.vehicleCode },
      select: { id: true },
    }),
    prisma.deliveryRoute.findUnique({
      where: { id: fixture.routeId },
      select: { id: true },
    }),
    prisma.sale.findUnique({
      where: { id: fixture.saleId },
      select: { id: true },
    }),
    prisma.deliveryOrder.findUnique({
      where: { id: fixture.orderId },
      select: { id: true },
    }),
  ]);
  if (!driver || !vehicle || !route || !sale || !order) {
    await prisma.$disconnect();
    throw new Error(
      'Browser FLEET fixture is incomplete; run browser:prepare first',
    );
  }

  const resolvedFixture = {
    ...fixture,
    driverId: driver.id,
    routeId: route.id,
    saleId: sale.id,
    vehicleId: vehicle.id,
  };

  async function snapshot(): Promise<BrowserFleetSnapshot> {
    const [
      routeRow,
      positions,
      saleCount,
      paymentCount,
      accountReceivableCount,
      evidenceCount,
      incidentCount,
    ] = await Promise.all([
      prisma.deliveryRoute.findUnique({
        where: { id: resolvedFixture.routeId },
        select: { driverId: true, vehicleId: true, status: true },
      }),
      prisma.vehiclePosition.findMany({
        where: {
          routeId: resolvedFixture.routeId,
          driverId: resolvedFixture.driverId,
          vehicleId: resolvedFixture.vehicleId,
        },
        select: {
          id: true,
          clientEventId: true,
          vehicleId: true,
          routeId: true,
          driverId: true,
          latitude: true,
          longitude: true,
          accuracyMeters: true,
          recordedAt: true,
          receivedAt: true,
        },
        orderBy: [
          { recordedAt: 'desc' },
          { receivedAt: 'desc' },
          { id: 'desc' },
        ],
      }),
      prisma.sale.count({ where: { id: resolvedFixture.saleId } }),
      prisma.payment.count({ where: { saleId: resolvedFixture.saleId } }),
      prisma.accountReceivable.count({
        where: { saleId: resolvedFixture.saleId },
      }),
      prisma.deliveryEvidence.count({
        where: { deliveryOrderId: resolvedFixture.orderId },
      }),
      prisma.deliveryIncident.count({
        where: {
          OR: [
            { routeId: resolvedFixture.routeId },
            { deliveryOrderId: resolvedFixture.orderId },
          ],
        },
      }),
    ]);
    const normalizedPositions = positions.map((position) => ({
      id: position.id,
      clientEventId: position.clientEventId,
      vehicleId: position.vehicleId,
      routeId: position.routeId,
      driverId: position.driverId,
      latitude: Number(position.latitude),
      longitude: Number(position.longitude),
      accuracyMeters:
        position.accuracyMeters == null
          ? null
          : Number(position.accuracyMeters),
      recordedAt: position.recordedAt.toISOString(),
      receivedAt: position.receivedAt.toISOString(),
    }));

    return {
      routeOwnerId: routeRow?.driverId ?? null,
      routeVehicleId: routeRow?.vehicleId ?? null,
      routeStatus: routeRow?.status ?? 'MISSING',
      positionCount: normalizedPositions.length,
      positions: normalizedPositions,
      latestPosition: normalizedPositions[0] ?? null,
      saleCount,
      paymentCount,
      accountReceivableCount,
      evidenceCount,
      incidentCount,
    };
  }

  return {
    fixture: resolvedFixture,
    snapshot,
    disconnect: () => prisma.$disconnect(),
  };
}
