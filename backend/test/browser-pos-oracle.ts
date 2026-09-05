import { PrismaClient } from '@prisma/client';
import { readBrowserEnvironment } from './browser-environment';

const APP_TIMEZONE = 'America/Mexico_City';

export const BROWSER_POS_INITIAL_STOCK_PIECES = 5;
export const BROWSER_POS_SALE_PRICE = 12;

function currentBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: process.env.APP_TIMEZONE?.trim() || APP_TIMEZONE,
    year: 'numeric',
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function browserPosFixture(runId: string) {
  const prefix = `BROWSER-${runId}-POS`;
  return {
    runId,
    businessDate: currentBusinessDate(),
    locationCode: `BROWSER-${runId}-BRANCH`,
    locationName: `Browser E2E ${runId} Branch`,
    productSku: `${prefix}-SKU`,
    productName: `Browser E2E ${runId} POS product`,
    terminalCode: `${prefix}-TERMINAL`,
    terminalName: `Browser E2E ${runId} POS terminal`,
    deviceId: `${prefix}-DEVICE`,
    dailyCloseId: `browser-${runId}-daily-close`,
    cashShiftId: `browser-${runId}-cash-shift`,
    openingMovementId: `browser-${runId}-pos-opening`,
    initialStockPieces: BROWSER_POS_INITIAL_STOCK_PIECES,
    salePrice: BROWSER_POS_SALE_PRICE,
  };
}

export type BrowserPosFixture = ReturnType<typeof browserPosFixture> & {
  locationId: string;
  productId: string;
  terminalId: string;
};

export type BrowserPosSnapshot = {
  saleCount: number;
  saleItemCount: number;
  paymentCount: number;
  inventoryMovementCount: number;
  inventoryBalancePieces: number;
  cashShiftStatus: string;
  cashShiftCountedTotal: number | null;
  cashShiftDifferenceTotal: number | null;
  dailyCloseStatus: string;
};

export async function createBrowserPosOracle() {
  const env = readBrowserEnvironment();
  const fixture = browserPosFixture(env.runId);
  const prisma = new PrismaClient({
    datasources: { db: { url: env.databaseUrl } },
  });
  const [location, product, terminal, dailyClose, cashShift] =
    await Promise.all([
      prisma.operationalLocation.findUnique({
        where: { code: fixture.locationCode },
        select: { id: true },
      }),
      prisma.product.findUnique({
        where: { sku: fixture.productSku },
        select: { id: true },
      }),
      prisma.cashTerminal.findUnique({
        where: { deviceId: fixture.deviceId },
        select: { id: true },
      }),
      prisma.pointOfSaleDailyClose.findUnique({
        where: { id: fixture.dailyCloseId },
        select: { id: true },
      }),
      prisma.cashShift.findUnique({
        where: { id: fixture.cashShiftId },
        select: { id: true },
      }),
    ]);
  if (!location || !product || !terminal || !dailyClose || !cashShift) {
    await prisma.$disconnect();
    throw new Error(
      'Browser POS fixture is incomplete; run browser:prepare first',
    );
  }

  const resolvedFixture: BrowserPosFixture = {
    ...fixture,
    locationId: location.id,
    productId: product.id,
    terminalId: terminal.id,
  };

  async function snapshot(): Promise<BrowserPosSnapshot> {
    const [sales, payments, inventoryMovements, balance, shift, close] =
      await Promise.all([
        prisma.sale.findMany({
          where: {
            cashShiftId: resolvedFixture.cashShiftId,
            locationId: resolvedFixture.locationId,
          },
          include: { items: true },
        }),
        prisma.payment.findMany({
          where: { cashShiftId: resolvedFixture.cashShiftId },
          select: { id: true },
        }),
        prisma.inventoryMovement.findMany({
          where: {
            productId: resolvedFixture.productId,
            locationId: resolvedFixture.locationId,
            type: 'SALE',
          },
          select: { id: true },
        }),
        prisma.inventoryBalance.findUnique({
          where: {
            productId_locationId: {
              productId: resolvedFixture.productId,
              locationId: resolvedFixture.locationId,
            },
          },
          select: { quantityPieces: true },
        }),
        prisma.cashShift.findUnique({
          where: { id: resolvedFixture.cashShiftId },
          select: {
            status: true,
            cashCountedTotal: true,
            cashDifferenceTotal: true,
          },
        }),
        prisma.pointOfSaleDailyClose.findUnique({
          where: { id: resolvedFixture.dailyCloseId },
          select: { status: true },
        }),
      ]);
    return {
      saleCount: sales.length,
      saleItemCount: sales.reduce(
        (total, sale) => total + sale.items.length,
        0,
      ),
      paymentCount: payments.length,
      inventoryMovementCount: inventoryMovements.length,
      inventoryBalancePieces: balance?.quantityPieces ?? 0,
      cashShiftStatus: shift?.status ?? 'MISSING',
      cashShiftCountedTotal:
        shift?.cashCountedTotal === null ||
        shift?.cashCountedTotal === undefined
          ? null
          : Number(shift.cashCountedTotal),
      cashShiftDifferenceTotal:
        shift?.cashDifferenceTotal === null ||
        shift?.cashDifferenceTotal === undefined
          ? null
          : Number(shift.cashDifferenceTotal),
      dailyCloseStatus: close?.status ?? 'MISSING',
    };
  }

  async function records() {
    const [sales, payments, inventoryMovements, balance, shift, close] =
      await Promise.all([
        prisma.sale.findMany({
          where: {
            cashShiftId: resolvedFixture.cashShiftId,
            locationId: resolvedFixture.locationId,
          },
          include: { items: true, payments: true, accountReceivable: true },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.payment.findMany({
          where: { cashShiftId: resolvedFixture.cashShiftId },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.inventoryMovement.findMany({
          where: {
            productId: resolvedFixture.productId,
            locationId: resolvedFixture.locationId,
            type: 'SALE',
          },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.inventoryBalance.findUnique({
          where: {
            productId_locationId: {
              productId: resolvedFixture.productId,
              locationId: resolvedFixture.locationId,
            },
          },
        }),
        prisma.cashShift.findUnique({
          where: { id: resolvedFixture.cashShiftId },
        }),
        prisma.pointOfSaleDailyClose.findUnique({
          where: { id: resolvedFixture.dailyCloseId },
        }),
      ]);
    return { sales, payments, inventoryMovements, balance, shift, close };
  }

  return {
    fixture: resolvedFixture,
    prisma,
    snapshot,
    records,
    disconnect: () => prisma.$disconnect(),
  };
}
