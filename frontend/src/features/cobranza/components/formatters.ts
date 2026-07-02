export function toNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0
  const numberValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

export function formatMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat('es-MX', { currency: 'MXN', style: 'currency' }).format(toNumber(value))
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-MX')
}
