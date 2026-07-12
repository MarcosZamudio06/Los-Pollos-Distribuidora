import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CashClosingSummary } from '../ReportsPage'

describe('cash closing report', () => {
  it('renders the backend credit sales payload without treating it as an array group', () => {
    const html = renderToStaticMarkup(<CashClosingSummary data={{ creditSales: { amount: 1250, count: 3 } }} />)

    expect(html).toContain('Ventas a crédito')
    expect(html).toContain('3 venta(s) a crédito; no representa efectivo recibido.')
    expect(html).toContain('$1,250.00')
  })
})
