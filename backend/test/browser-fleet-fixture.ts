import { createHash } from 'node:crypto';

export const BROWSER_FLEET_POSITION_A = {
  latitude: 19.1748,
  longitude: -96.1334,
  accuracyMeters: 10,
} as const;

export const BROWSER_FLEET_POSITION_B = {
  latitude: 19.1761,
  longitude: -96.1321,
  accuracyMeters: 10,
} as const;

function fixturePhone(runId: string) {
  return `+995${BigInt(
    `0x${createHash('sha256')
      .update(`${runId}:fleet-realtime-driver`)
      .digest('hex')
      .slice(0, 9)}`,
  )
    .toString()
    .padStart(12, '0')}`;
}

export function browserFleetFixture(runId: string) {
  const prefix = `BROWSER-${runId}-FLEET-REALTIME`;
  return {
    runId,
    customerName: `Browser E2E ${runId} fleet realtime customer`,
    customerNumber: `${prefix}-CUSTOMER`,
    customerPhone: fixturePhone(runId),
    deliveryAddress: `Browser E2E ${runId} fleet realtime destination`,
    driverControlNumber: `${prefix}-DRIVER`,
    driverEmail: `browser-${runId}-fleet-driver@example.test`,
    driverName: `Browser E2E ${runId} fleet realtime driver`,
    initialClientEventId: `browser:${runId}:fleet:position-a-fixture`,
    initialPositionId: `browser-${runId}-fleet-position-a`,
    openingMovementId: `browser-${runId}-fleet-opening`,
    orderId: `browser-${runId}-fleet-order`,
    paymentId: `browser-${runId}-fleet-payment`,
    paymentIdempotencyKey: `browser:${runId}:fleet-payment`,
    productName: `Browser E2E ${runId} fleet realtime product`,
    productSku: `${prefix}-SKU`,
    routeId: `browser-${runId}-fleet-route`,
    routeName: `Browser E2E ${runId} fleet realtime route`,
    routeStockCode: `${prefix}-ROUTE-STOCK`,
    saleId: `browser-${runId}-fleet-sale`,
    saleItemId: `browser-${runId}-fleet-sale-item`,
    saleDocumentId: `browser-${runId}-fleet-sale-document`,
    saleNumber: `${prefix}-SALE`,
    saleTotal: 75,
    vehicleCode: `${prefix}-VEHICLE`,
    vehicleName: `Browser E2E ${runId} fleet realtime vehicle`,
    positionA: BROWSER_FLEET_POSITION_A,
    positionB: BROWSER_FLEET_POSITION_B,
    routeGeometry: {
      type: 'LineString' as const,
      coordinates: [
        [BROWSER_FLEET_POSITION_A.longitude, BROWSER_FLEET_POSITION_A.latitude],
        [BROWSER_FLEET_POSITION_B.longitude, BROWSER_FLEET_POSITION_B.latitude],
      ],
    },
  };
}
