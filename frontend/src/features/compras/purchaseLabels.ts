import type { OperationalUnit, ProductPresentation } from '../inventario/types'
import { formatMoney } from '../../lib/money'

export function money(value?: number | string | null) {
  return formatMoney(value)
}

export function decimal(value?: number | string | null, digits = 3) {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0)
}

export function dateTime(value?: string | Date | null) {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Fecha inválida'
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function purchaseStatusLabel(status?: string | null) {
  if (status === 'CONFIRMED') return 'Confirmada'
  if (status === 'CANCELLED') return 'Cancelada'
  return status ?? 'Sin estado'
}

export function unitLabel(unit?: OperationalUnit | string | null) {
  if (unit === 'KG') return 'Kilo'
  if (unit === 'PIECE') return 'Pieza'
  if (unit === 'KG_AND_PIECE') return 'Kilo y pieza'
  return unit ?? 'Sin unidad'
}

export function presentationLabel(presentation?: ProductPresentation | string | null) {
  if (presentation === 'KG') return 'Producto por kilo'
  if (presentation === 'WHOLE') return 'Entero'
  if (presentation === 'CUT') return 'Corte'
  return presentation ?? 'Sin presentación'
}

export function locationTypeLabel(type?: string | null) {
  if (type === 'BRANCH') return 'Sucursal'
  if (type === 'WAREHOUSE') return 'Almacén'
  if (type === 'MIXED') return 'Mixta'
  if (type === 'EXTERNAL_POINT_OF_SALE') return 'Punto externo'
  if (type === 'ROUTE_STOCK') return 'Inventario de ruta'
  return type ?? 'Sin tipo'
}
