import type { DeliveryOrderStatus, DeliveryRouteStatus, EvidenceType, PaymentMethod, RouteSettlementStatus } from './types'
import { formatMoney } from '../../lib/money'

export function money(value: number | string | null | undefined) {
  return formatMoney(value)
}

export function date(value: string | null | undefined) {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(value))
}

export function dateTime(value: string | null | undefined) {
  if (!value) return 'Sin registro'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function routeStatusLabel(status: DeliveryRouteStatus) {
  const labels: Record<string, string> = {
    CANCELLED: 'Cancelada',
    COMPLETED: 'Completada',
    IN_PROGRESS: 'En ruta',
    PENDING: 'Pendiente',
  }
  return labels[status] ?? status
}

export function orderStatusLabel(status: DeliveryOrderStatus) {
  const labels: Record<string, string> = {
    CANCELLED: 'Cancelado',
    DELIVERED: 'Entregado',
    IN_ROUTE: 'En ruta',
    NOT_DELIVERED: 'No entregado',
    PARTIALLY_REJECTED: 'Rechazo parcial',
    PENDING: 'Pendiente',
    RETURNED: 'Devuelto',
  }
  return labels[status] ?? status
}

export function settlementStatusLabel(status: RouteSettlementStatus) {
  const labels: Record<string, string> = {
    CLOSED: 'Cerrada',
    OPEN: 'Abierta',
    REVIEW_REQUIRED: 'Requiere revisión',
  }
  return labels[status] ?? status
}

export function evidenceTypeLabel(type: EvidenceType) {
  const labels: Record<string, string> = {
    GEOLOCATION: 'Geolocalización',
    NOTE: 'Nota',
    PHOTO: 'Foto',
    SIGNATURE: 'Firma',
  }
  return labels[type] ?? type
}

export function paymentMethodLabel(method: PaymentMethod) {
  const labels: Record<string, string> = {
    CARD: 'Tarjeta',
    CASH: 'Efectivo',
    DEPOSIT: 'Depósito',
    TRANSFER: 'Transferencia',
  }
  return labels[method] ?? method
}

export function shortId(value: string | null | undefined) {
  if (!value) return 'Sin dato'
  return value.length > 10 ? `${value.slice(0, 8)}…` : value
}
