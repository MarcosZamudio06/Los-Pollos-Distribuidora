import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CreditStateDetails } from '../components/CreditStateDetails'

describe('CreditStateDetails', () => {
  it('separates administrative status from a policy warning', () => {
    const html = renderToStaticMarkup(<CreditStateDetails customer={{ id: 'customer-1', name: 'Cliente', customerType: 'WHOLESALE', creditStatus: 'ACTIVE' }} summary={{
      creditStatus: 'ACTIVE', effectiveCreditStatus: 'WARNING', blockingReasons: ['CREDIT_OVERDUE_WARNING'], overdueBlockingMode: 'WARN_ONLY', overdueAmount: 250, maximumDaysOverdue: 5, canAdministrativeOverride: false,
    }} />)

    expect(html).toContain('Advertencia')
    expect(html).toContain('Estado administrativo')
    expect(html).toContain('Activo')
    expect(html).toContain('Saldo vencido')
    expect(html).toContain('$250.00')
    expect(html).toContain('5 días')
    expect(html).toContain('Solo advertencia')
    expect(html).not.toContain('Bloqueo administrativo')
  })

  it('shows stable blocking reasons and override eligibility', () => {
    const html = renderToStaticMarkup(<CreditStateDetails customer={{ id: 'customer-2', name: 'Cliente', customerType: 'INSTITUTIONAL', creditStatus: 'ACTIVE' }} summary={{
      creditStatus: 'ACTIVE', effectiveCreditStatus: 'BLOCKED', blockingReasons: ['CREDIT_OVERDUE_BLOCKED', 'CREDIT_LIMIT_EXCEEDED'], overdueBlockingMode: 'BLOCK_NEW_CREDIT', overdueAmount: 900, maximumDaysOverdue: 12, canAdministrativeOverride: true,
    }} />)

    expect(html).toContain('Bloqueado')
    expect(html).toContain('Saldo vencido bloquea crédito nuevo')
    expect(html).toContain('Límite de crédito excedido')
    expect(html).toContain('Autorización administrativa disponible')
  })
})
