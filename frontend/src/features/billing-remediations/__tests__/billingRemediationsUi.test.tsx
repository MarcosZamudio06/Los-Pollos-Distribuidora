// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@/lib/api'
import { BillingRemediationsPage, getRemediationErrorDetails } from '../BillingRemediationsPage'
import { billingRemediationsService, buildBillingRemediationsPath } from '../service'

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

  it('sends concurrency tokens and an idempotency key when resolving', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'rem-1' }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await billingRemediationsService.resolve({
      id: 'rem-1', idempotencyKey: 'resolve-key-1', expectedRemediationVersion: 2, expectedSaleVersion: 7,
      expectedDocumentVersions: [{ saleDocumentId: 'document-1', expectedVersion: 3 }], reason: 'Correction',
    }, 'access-token')

    const [, request] = fetchMock.mock.calls[0]
    expect(new Headers(request?.headers).get('idempotency-key')).toBe('resolve-key-1')
    expect(request?.body).toBe(JSON.stringify({
      expectedRemediationVersion: 2, expectedSaleVersion: 7,
      expectedDocumentVersions: [{ saleDocumentId: 'document-1', expectedVersion: 3 }], reason: 'Correction',
    }))
    fetchMock.mockRestore()
  })

  it('exposes canonical consistency findings as actionable messages', () => {
    const error = new ApiClientError('La venta conserva inconsistencias monetarias y no puede cerrarse.', 409, {
      code: 'SALE_CONSISTENCY_VALIDATION_FAILED',
      findings: [
        { code: 'ITEM_TOTALS_MISMATCH', message: 'Las partidas no coinciden con la cabecera.' },
        { code: 'RECEIVABLE_BALANCE_MISMATCH', message: 'La cuenta por cobrar no coincide.' },
      ],
    })

    expect(getRemediationErrorDetails(error)).toEqual([
      'Las partidas no coinciden con la cabecera.',
      'La cuenta por cobrar no coincide.',
    ])
  })
})
