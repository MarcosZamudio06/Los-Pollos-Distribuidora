import { describe, expect, it } from 'vitest'
import { formatMoney, moneyFormatter } from '../money'

describe('formatMoney', () => {
  it('formats finite amounts as Mexican pesos', () => {
    expect(moneyFormatter.resolvedOptions()).toMatchObject({
      currency: 'MXN',
      locale: 'es-MX',
      style: 'currency',
    })
    expect(formatMoney(1234.5)).toBe('$1,234.50')
  })

  it('formats missing and invalid amounts as zero Mexican pesos', () => {
    expect(formatMoney(null)).toBe('$0.00')
    expect(formatMoney('invalid')).toBe('$0.00')
  })
})
