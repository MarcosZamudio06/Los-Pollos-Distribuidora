import { Money, type DecimalInput, toMoneyString } from '../../../shared/money'

export { Money, toMoneyString }

export const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
})

export function formatMoney(value: DecimalInput | null | undefined) {
  try {
    return moneyFormatter.format(Number(Money.from(value).toString()))
  } catch {
    return moneyFormatter.format(0)
  }
}
