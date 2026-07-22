export { formatMoney } from '../../../lib/money'

export function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX')
}
