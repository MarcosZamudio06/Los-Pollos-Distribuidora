import { isFinalOrderStatus } from "./labels";
import type { DeliveryRouteDetail } from "./types";

export type PendingNavigationCandidate = {
  address: string | null;
  id: string;
  kind: "DELIVERY_ORDER" | "LOGISTICS_STOP";
  label: string;
  latitude: number | null;
  longitude: number | null;
  stopSequence?: number;
};

export function isLogisticsRoute(type?: string | null) {
  return type === "BRANCH_RETURN" || type === "CEDIS_SUPPLY";
}

type CoordinateCandidate = {
  latitude?: number | null;
  longitude?: number | null;
};

export function hasNavigationCoordinates<T extends CoordinateCandidate>(
  candidate?: T | null,
): candidate is T & {
  latitude: number;
  longitude: number;
} {
  return Boolean(
    candidate &&
      candidate.latitude != null &&
      candidate.longitude != null &&
      Number.isFinite(candidate.latitude) &&
      Number.isFinite(candidate.longitude),
  );
}

export function getPendingNavigationCandidate(
  route?: DeliveryRouteDetail | null,
): PendingNavigationCandidate | null {
  if (!route) return null;

  if (route.type === "SALE_DELIVERY") {
    const order = [...(route.orders ?? [])]
      .filter((item) => !isFinalOrderStatus(item.status))
      .sort(
        (first, second) =>
          (first.stopSequence ?? Number.POSITIVE_INFINITY) -
          (second.stopSequence ?? Number.POSITIVE_INFINITY),
      )[0];
    if (!order) return null;

    return {
      address: order.deliveryAddress ?? null,
      id: order.id,
      kind: "DELIVERY_ORDER",
      label: order.customerName ?? order.saleNumber ?? "Entrega pendiente",
      latitude: order.latitude ?? null,
      longitude: order.longitude ?? null,
      ...(order.stopSequence == null
        ? {}
        : { stopSequence: order.stopSequence }),
    };
  }

  if (!isLogisticsRoute(route.type)) return null;
  const stop = route.logisticsStop;
  if (!stop || stop.status === "COMPLETED" || !stop.destination) return null;

  return {
    address: null,
    id: stop.inventoryTransferId,
    kind: "LOGISTICS_STOP",
    label: stop.destination.name,
    latitude: stop.destination.latitude ?? null,
    longitude: stop.destination.longitude ?? null,
  };
}

export function canOpenDriverNavigation(route?: DeliveryRouteDetail | null) {
  return Boolean(
    route?.status === "IN_PROGRESS" &&
      hasNavigationCoordinates(getPendingNavigationCandidate(route)),
  );
}
