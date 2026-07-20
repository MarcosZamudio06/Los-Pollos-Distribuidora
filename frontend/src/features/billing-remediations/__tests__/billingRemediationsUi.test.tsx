// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { BillingRemediationsPage } from '../BillingRemediationsPage'
import { buildBillingRemediationsPath } from '../service'

vi.mock('../hooks', () => ({
  useBillingRemediations: () => ({
    data: { items: [{ id: 'rem-1', code: 'MISSING_LEGAL_ENTITY_MAPPING', entityType: 'Sale', entityId: 'sale-1', details: {}, createdAt: '2026-07-19T12:00:00.000Z', updatedAt: '2026-07-19T12:00:00.000Z', resolvedAt: null, resolvedByUserId: null, resolutionNotes: null, resolvedBy: null, sale: { id: 'sale-1', saleNumber: 'V-1001', legalEntityId: null, legalEntity: null, subtotal: '100.00', discount: '0.00', tax: '0.00', total: '100.00', documents: [], items: [] } }], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 }, legalEntities: [{ id: 'legal-1', legalName: 'Distribuidora Principal', taxId: 'AAA010101AAA' }] },
    error: null, isLoading: false, refetch: vi.fn(),
  }),
  useResolveBillingRemediation: () => ({ error: null, isPending: false, mutateAsync: vi.fn() }),
}))
vi.mock('../../auth', () => ({ useAuth: () => ({ user: { role: 'ADMIN' } }) }))

describe('billing remediations UI contracts', () => {
  it('builds backend filters and renders a validated-resolution inbox', () => {
    expect(buildBillingRemediationsPath({ page: 2, limit: 25, status: 'OPEN', code: 'INVALID_SALE_TOTAL', search: 'V-1' })).toBe('/billing/remediations?page=2&limit=25&status=OPEN&code=INVALID_SALE_TOTAL&search=V-1')
    const html = renderToStaticMarkup(<MemoryRouter><BillingRemediationsPage /></MemoryRouter>)
    expect(html).toContain('Remediaciones contables')
    expect(html).toContain('V-1001')
    expect(html).toContain('Asignar entidad legal')
    expect(html).toContain('validará nuevamente')
  })
})
