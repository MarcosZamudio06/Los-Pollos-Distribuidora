import { InventoryMovementType, PrismaClient } from '@prisma/client';
import { readBrowserEnvironment } from './browser-environment';

export const BROWSER_CEDIS_INITIAL_STOCK_PIECES = 10;
export const BROWSER_CEDIS_SUPPLY_QUANTITY_PIECES = 3;

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

export function browserCedisFixture(runId: string) {
  const supplyPrefix = `BROWSER-${runId}-CEDIS-SUPPLY`;
  return {
    runId,
    businessDate: currentBusinessDate(),
    cedisCode: `BROWSER-${runId}-CEDIS`,
    cedisName: `Browser E2E ${runId} CEDIS`,
    branchCode: `BROWSER-${runId}-BRANCH`,
    branchName: `Browser E2E ${runId} Branch`,
    productSku: `${supplyPrefix}-SKU`,
    productName: `Browser E2E ${runId} CEDIS supply product`,
    cycleId: `browser-${runId}-cedis-cycle`,
    driverEmail: `browser-${runId}-driver@example.test`,
    driverName: `Browser E2E ${runId} Driver`,
    vehicleCode: `${supplyPrefix}-VEHICLE`,
    vehicleName: `Browser E2E ${runId} supply vehicle`,
    openingMovementId: `browser-${runId}-cedis-opening`,
    initialStockPieces: BROWSER_CEDIS_INITIAL_STOCK_PIECES,
    supplyQuantityPieces: BROWSER_CEDIS_SUPPLY_QUANTITY_PIECES,
  };
}

export type BrowserCedisFixture = ReturnType<typeof browserCedisFixture> & {
  cedisId: string;
  branchId: string;
  productId: string;
  driverId: string;
  vehicleId: string;
};

type NonInterferenceRows = Array<{
  id: string;
  updatedAt: string;
}>;

type RawNonInterferenceRows = Array<{
  id: string;
  updatedAt: Date;
}>;

export type BrowserCedisSnapshot = {
  cycleStatus: string;
  cycleVersion: number;
  cedisQuantityPieces: number;
  cedisReservedQuantityPieces: number;
  branchQuantityPieces: number;
  branchReservedQuantityPieces: number;
  transferCount: number;
  cycleTransferLinkCount: number;
  receiptCount: number;
  receiptItemCount: number;
  inventoryMovementCount: number;
  transferOutCount: number;
  transferInCount: number;
  shrinkageCount: number;
  surplusInCount: number;
  routeCount: number;
  cycleEventCount: number;
  openedEventCount: number;
  transferLinkedEventCount: number;
  transferStateChangedEventCount: number;
  transferId: string | null;
  transferNumber: string | null;
  transferStatus: string | null;
  nonInterference: {
    sales: NonInterferenceRows;
    payments: NonInterferenceRows;
    accountReceivables: NonInterferenceRows;
    cashShifts: NonInterferenceRows;
    dailyCloses: NonInterferenceRows;
  };
};

async function nonInterferenceRows(prisma: PrismaClient) {
  const [sales, payments, accountReceivables, cashShifts, dailyCloses] =
    await Promise.all([
      prisma.sale.findMany({
        select: { id: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      prisma.payment.findMany({
        select: { id: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      prisma.accountReceivable.findMany({
        select: { id: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      prisma.cashShift.findMany({
        select: { id: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
      prisma.pointOfSaleDailyClose.findMany({
        select: { id: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
    ]);
  const normalize = (rows: RawNonInterferenceRows): NonInterferenceRows =>
    rows.map((row) => ({ id: row.id, updatedAt: row.updatedAt.toISOString() }));
  return {
    sales: normalize(sales),
    payments: normalize(payments),
    accountReceivables: normalize(accountReceivables),
    cashShifts: normalize(cashShifts),
    dailyCloses: normalize(dailyCloses),
  };
}

export async function createBrowserCedisOracle() {
  const env = readBrowserEnvironment();
  const fixture = browserCedisFixture(env.runId);
  const prisma = new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
  });
  const [cedis, branch, product, cycle, driver, vehicle] = await Promise.all([
    prisma.operationalLocation.findUnique({
      where: { code: fixture.cedisCode },
      select: { id: true },
    }),
    prisma.operationalLocation.findUnique({
      where: { code: fixture.branchCode },
      select: { id: true },
    }),
    prisma.product.findUnique({
      where: { sku: fixture.productSku },
      select: { id: true },
    }),
    prisma.branchSupplyCycle.findUnique({
      where: { id: fixture.cycleId },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { email: fixture.driverEmail },
      select: { id: true },
    }),
    prisma.vehicle.findUnique({
      where: { code: fixture.vehicleCode },
      select: { id: true },
    }),
  ]);
  if (!cedis || !branch || !product || !cycle || !driver || !vehicle) {
    await prisma.$disconnect();
    throw new Error(
      'Browser CEDIS fixture is incomplete; run browser:prepare first',
    );
  }

  const resolvedFixture: BrowserCedisFixture = {
    ...fixture,
    cedisId: cedis.id,
    branchId: branch.id,
    productId: product.id,
    driverId: driver.id,
    vehicleId: vehicle.id,
  };

  async function cycleLinks() {
    return prisma.branchSupplyCycleTransfer.findMany({
      where: {
        branchSupplyCycleId: resolvedFixture.cycleId,
      },
      select: { id: true, inventoryTransferId: true, role: true },
      orderBy: { linkedAt: 'asc' },
    });
  }

  async function fixtureTransfers() {
    return prisma.inventoryTransfer.findMany({
      where: {
        originLocationId: resolvedFixture.cedisId,
        destinationLocationId: resolvedFixture.branchId,
        items: { some: { productId: resolvedFixture.productId } },
      },
      select: { id: true, transferNumber: true, status: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function snapshot(): Promise<BrowserCedisSnapshot> {
    const [links, fixtureTransferRows] = await Promise.all([
      cycleLinks(),
      fixtureTransfers(),
    ]);
    const transferIds = fixtureTransferRows.map((transfer) => transfer.id);
    const receiptRows = await prisma.branchSupplyReceipt.findMany({
      where: { inventoryTransferId: { in: transferIds } },
      select: { id: true },
    });
    const receiptIds = receiptRows.map((receipt) => receipt.id);
    const [
      cycle,
      cedisBalance,
      branchBalance,
      receiptItemCount,
      movements,
      routeCount,
      events,
      nonInterference,
    ] = await Promise.all([
      prisma.branchSupplyCycle.findUnique({
        where: { id: resolvedFixture.cycleId },
        select: { status: true, version: true },
      }),
      prisma.inventoryBalance.findUnique({
        where: {
          productId_locationId: {
            productId: resolvedFixture.productId,
            locationId: resolvedFixture.cedisId,
          },
        },
        select: { quantityPieces: true, reservedQuantityPieces: true },
      }),
      prisma.inventoryBalance.findUnique({
        where: {
          productId_locationId: {
            productId: resolvedFixture.productId,
            locationId: resolvedFixture.branchId,
          },
        },
        select: { quantityPieces: true, reservedQuantityPieces: true },
      }),
      prisma.branchSupplyReceiptItem.count({
        where: { receiptId: { in: receiptIds } },
      }),
      prisma.inventoryMovement.findMany({
        where: { transferId: { in: transferIds } },
        select: { type: true },
      }),
      prisma.deliveryRoute.count({
        where: { inventoryTransferId: { in: transferIds } },
      }),
      prisma.branchSupplyCycleEvent.findMany({
        where: { branchSupplyCycleId: resolvedFixture.cycleId },
        select: { type: true },
      }),
      nonInterferenceRows(prisma),
    ]);
    const transfer =
      fixtureTransferRows.length === 1 ? fixtureTransferRows[0] : null;
    const countEvent = (type: string) =>
      events.filter((event) => event.type === type).length;
    return {
      cycleStatus: cycle?.status ?? 'MISSING',
      cycleVersion: cycle?.version ?? 0,
      cedisQuantityPieces: cedisBalance?.quantityPieces ?? 0,
      cedisReservedQuantityPieces: cedisBalance?.reservedQuantityPieces ?? 0,
      branchQuantityPieces: branchBalance?.quantityPieces ?? 0,
      branchReservedQuantityPieces: branchBalance?.reservedQuantityPieces ?? 0,
      transferCount: fixtureTransferRows.length,
      cycleTransferLinkCount: links.length,
      receiptCount: receiptRows.length,
      receiptItemCount,
      inventoryMovementCount: movements.length,
      transferOutCount: movements.filter(
        (movement) => movement.type === InventoryMovementType.TRANSFER_OUT,
      ).length,
      transferInCount: movements.filter(
        (movement) => movement.type === InventoryMovementType.TRANSFER_IN,
      ).length,
      shrinkageCount: movements.filter(
        (movement) => movement.type === InventoryMovementType.SHRINKAGE,
      ).length,
      surplusInCount: movements.filter(
        (movement) => movement.type === InventoryMovementType.IN,
      ).length,
      routeCount,
      cycleEventCount: events.length,
      openedEventCount: countEvent('OPENED'),
      transferLinkedEventCount: countEvent('TRANSFER_LINKED'),
      transferStateChangedEventCount: countEvent('TRANSFER_STATE_CHANGED'),
      transferId: transfer?.id ?? null,
      transferNumber: transfer?.transferNumber ?? null,
      transferStatus: transfer?.status ?? null,
      nonInterference,
    };
  }

  async function records() {
    const [links, fixtureTransferRows] = await Promise.all([
      cycleLinks(),
      fixtureTransfers(),
    ]);
    const transferIds = fixtureTransferRows.map((transfer) => transfer.id);
    const [transfers, events, balances] = await Promise.all([
      prisma.inventoryTransfer.findMany({
        where: { id: { in: transferIds } },
        include: {
          items: true,
          inventoryMovements: true,
          branchSupplyReceipt: { include: { items: true } },
          deliveryRoute: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.branchSupplyCycleEvent.findMany({
        where: { branchSupplyCycleId: resolvedFixture.cycleId },
        select: { id: true, type: true, cycleVersion: true },
        orderBy: { cycleVersion: 'asc' },
      }),
      prisma.inventoryBalance.findMany({
        where: {
          productId: resolvedFixture.productId,
          locationId: {
            in: [resolvedFixture.cedisId, resolvedFixture.branchId],
          },
        },
        orderBy: { locationId: 'asc' },
      }),
    ]);
    return { links, transfers, events, balances };
  }

  return {
    fixture: resolvedFixture,
    snapshot,
    records,
    disconnect: () => prisma.$disconnect(),
  };
}
