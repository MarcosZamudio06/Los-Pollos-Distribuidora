import { Money } from "../../lib/money";
import type { BadgeTone } from "../../components/ui";
import type { CedisCycleStatus, CedisDashboardCard } from "./types";

const numberFormatter = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 3,
});

export const cedisCycleStatusLabels: Record<CedisCycleStatus, string> = {
  OPEN: "Abierto",
  READY_FOR_REVIEW: "Listo para revisión",
  CLOSED: "Cerrado",
  CANCELLED: "Cancelado",
};

export const cedisCycleStatusTones: Record<CedisCycleStatus, BadgeTone> = {
  OPEN: "blue",
  READY_FOR_REVIEW: "amber",
  CLOSED: "green",
  CANCELLED: "red",
};

export function formatQuantity(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return numberFormatter.format(Number(value));
}

export function formatPhysicalQuantity(
  kg: string | number | null | undefined,
  pieces: string | number | null | undefined,
) {
  if (kg === null && pieces === null) return "—";

  const values: string[] = [];
  if (kg !== null && kg !== undefined && Number(kg) !== 0) {
    values.push(`${formatQuantity(kg)} kg`);
  }
  if (pieces !== null && pieces !== undefined && Number(pieces) !== 0) {
    values.push(`${formatQuantity(pieces)} piezas`);
  }

  return values.length > 0 ? values.join(" · ") : "0 kg · 0 piezas";
}

export function salesDifference(card: CedisDashboardCard) {
  if (!card.financial) return null;
  return Money.from(card.financial.actualSales).subtract(
    card.financial.expectedSales,
  );
}

export type CashState = {
  label: string;
  tone: BadgeTone;
};

export function cashState(card: CedisDashboardCard): CashState {
  if (!card.cash) return { label: "Sin caja", tone: "slate" };
  if (card.cash.counted === null) {
    return { label: "Pendiente de conteo", tone: "amber" };
  }

  const difference = Money.from(card.cash.difference);
  if (difference.isZero()) return { label: "Cuadrada", tone: "green" };
  if (difference.isPositive()) return { label: "Sobrante", tone: "blue" };
  return { label: "Faltante", tone: "red" };
}

export function branchDetailHref(
  card: CedisDashboardCard,
  filters: { cedisLocationId: string; businessDate: string },
) {
  const params = new URLSearchParams({
    cedis: filters.cedisLocationId,
    date: filters.businessDate,
  });
  if (card.cycle?.id) params.set("cycle", card.cycle.id);
  return `/cedis/branches/${encodeURIComponent(card.branch.id)}?${params.toString()}`;
}

export function formatCoordinates(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined,
) {
  if (latitude === null || latitude === undefined) return null;
  if (longitude === null || longitude === undefined) return null;
  const numericLatitude = Number(latitude);
  const numericLongitude = Number(longitude);
  if (Number.isNaN(numericLatitude) || Number.isNaN(numericLongitude)) {
    return null;
  }
  return `${numericLatitude.toFixed(6)}, ${numericLongitude.toFixed(6)}`;
}
