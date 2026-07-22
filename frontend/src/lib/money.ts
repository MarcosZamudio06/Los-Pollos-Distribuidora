export const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

export function formatMoney(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0)
  return moneyFormatter.format(Number.isFinite(numericValue) ? numericValue : 0)
}
