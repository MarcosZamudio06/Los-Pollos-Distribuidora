import type { CollectionStatus, PaymentMethod, PaymentType, SaleChannel, SaleDocumentType, SaleStatus } from './types'
import type { OperationalUnit } from '../inventario/types'
import { formatMoney } from '../../lib/money'

export function money(value: number | string | null | undefined) {
  return formatMoney(value)
}

export function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString('es-MX') : '—'
}

export function paymentTypeLabel(value?: PaymentType | string | null) {
  const labels: Record<PaymentType, string> = {
    CASH_SALE: 'Venta de contado',
    CREDIT_SALE: 'Venta a crédito',
  }
  return value && value in labels ? labels[value as PaymentType] : '—'
}

export function paymentMethodLabel(value?: PaymentMethod | string | null) {
  const labels: Record<Exclude<PaymentMethod, ''>, string> = {
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    TRANSFER: 'Transferencia',
    DEPOSIT: 'Depósito',
    CHECK: 'Cheque',
    VOUCHER: 'Voucher',
    OTHER: 'Otro',
  }
  return value && value in labels ? labels[value as Exclude<PaymentMethod, ''>] : 'Sin pago registrado'
}

export function saleStatusLabel(value?: SaleStatus | string | null) {
  const labels: Record<SaleStatus, string> = {
    DRAFT: 'Borrador',
    CONFIRMED: 'Confirmada',
    CANCELLED: 'Cancelada',
  }
  return value && value in labels ? labels[value as SaleStatus] : '—'
}

export function collectionStatusLabel(value?: CollectionStatus | string | null) {
  const labels: Record<CollectionStatus, string> = {
    UNPAID: 'Pendiente',
    PARTIALLY_PAID: 'Parcialmente pagada',
    PAID: 'Pagada',
    CANCELLED: 'Cancelada',
  }
  return value && value in labels ? labels[value as CollectionStatus] : '—'
}

export function saleChannelLabel(value?: SaleChannel | string | null) {
  const labels: Record<SaleChannel, string> = {
    COUNTER: 'Mostrador',
    EXTERNAL_POINT_OF_SALE: 'Punto externo de venta',
    ROUTE: 'Ruta',
    INSTITUTIONAL: 'Institucional',
    WHOLESALE: 'Mayoreo',
  }
  return value && value in labels ? labels[value as SaleChannel] : '—'
}

export function documentTypeLabel(value?: SaleDocumentType | string | null) {
  const labels: Record<SaleDocumentType, string> = {
    SCALE_TICKET: 'Ticket de báscula',
    SIMPLE_NOTE: 'Nota sencilla',
    LARGE_NOTE: 'Nota grande',
    INTERNAL_RECEIPT: 'Comprobante interno',
  }
  return value && value in labels ? labels[value as SaleDocumentType] : '—'
}

export function operationalUnitLabel(value?: OperationalUnit | string | null) {
  const labels: Record<OperationalUnit, string> = {
    KG: 'Kilo',
    KG_AND_PIECE: 'Kilo y pieza',
    PIECE: 'Pieza',
  }
  return value && value in labels ? labels[value as OperationalUnit] : '—'
}
