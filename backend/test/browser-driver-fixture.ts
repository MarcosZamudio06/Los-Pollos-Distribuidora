import { createHash } from 'node:crypto';

export const BROWSER_DRIVER_SALE_TOTAL = 75;
export const BROWSER_DRIVER_DESTINATION = {
  latitude: 19.1761,
  longitude: -96.1321,
} as const;

function fixturePhone(runId: string) {
  return `+997${BigInt(
    `0x${createHash('sha256')
      .update(`${runId}:delivery-driver`)
      .digest('hex')
      .slice(0, 9)}`,
  )
    .toString()
    .padStart(12, '0')}`;
}

export function browserDriverFixture(runId: string) {
  const prefix = `BROWSER-${runId}-DRIVER-DELIVERY`;
  return {
    runId,
    customerName: `Browser E2E ${runId} delivery customer`,
    customerNumber: `${prefix}-CUSTOMER`,
    customerPhone: fixturePhone(runId),
    deliveryAddress: `Browser E2E ${runId} delivery destination`,
    driverControlNumber: `${prefix}-USER`,
    driverEmail: `browser-${runId}-delivery-driver@example.test`,
    driverName: `Browser E2E ${runId} delivery driver`,
    openingMovementId: `browser-${runId}-driver-opening`,
    orderId: `browser-${runId}-delivery-order`,
    paymentId: `browser-${runId}-sale-payment`,
    paymentIdempotencyKey: `browser:${runId}:sale-payment`,
    productName: `Browser E2E ${runId} delivery product`,
    productSku: `${prefix}-SKU`,
    routeId: `browser-${runId}-delivery-route`,
    routeName: `Browser E2E ${runId} DRIVER delivery`,
    routeStockCode: `${prefix}-ROUTE-STOCK`,
    saleId: `browser-${runId}-delivery-sale`,
    saleMovementId: `browser-${runId}-driver-sale-movement`,
    saleNumber: `${prefix}-SALE`,
    saleTotal: BROWSER_DRIVER_SALE_TOTAL,
    vehicleCode: `${prefix}-VEHICLE`,
    vehicleName: `Browser E2E ${runId} delivery vehicle`,
    ...BROWSER_DRIVER_DESTINATION,
  };
}
