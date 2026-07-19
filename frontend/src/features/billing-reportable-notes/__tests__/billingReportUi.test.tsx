// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BillingReportableNotesPage } from '../BillingReportableNotesPage'
import { getDetailPropertyLabel } from '../detailLabels'
import { areNotesCompatible } from '../selection'
import { buildBillingReportPath, normalizeBillingReportDetail } from '../service'
import type { BillingReportDetail, BillingReportList } from '../types'

const mockState = vi.hoisted(() => ({
  auth: { user: { role: 'ADMIN' } as { role: string } },
  command: { error: null, isPending: false, mutateAsync: vi.fn() },
  detail: { data: undefined as BillingReportDetail | undefined, error: null, isLoading: false },
  report: { data: undefined as BillingReportList | undefined, error: null as Error | null, isFetching: false, isLoading: false, refetch: vi.fn() },
}))

vi.mock('../hooks', () => ({
  useBillingReport: () => mockState.report,
  useBillingReportDetail: () => mockState.detail,
  useBillingRequestCommand: () => mockState.command,
}))

vi.mock('../../auth', () => ({ useAuth: () => mockState.auth }))

const note = {
  saleDocumentId: 'doc-1', customerId: 'customer-1', currencyCode: 'MXN', legalEntityId: 'legal-1',
  billingStatus: 'BILLABLE', pendingInvoice: '100.00',
} as const

const reportData: BillingReportList = {
  items: [{
    ...note, saleId: 'sale-1', saleNumber: 'V-1001', issuedAt: '2026-07-18T12:00:00.000Z',
    documentType: 'SIMPLE_NOTE', physicalFolio: 'N-1', customerName: 'Cliente Uno', taxId: 'XAXX010101000',
    fiscalProfileComplete: true, sellerName: 'Vendedor Uno', locationName: 'Centro', total: '100.00',
    activeRequested: '0.00', activeInvoiced: '0.00', activePaid: '20.00', collectionBalance: '80.00', blockingCodes: [],
  }],
  pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
  summary: { totalDocuments: 1, billableDocuments: 1, blockedDocuments: 0, totalBillable: '100.00', totalRequested: '0.00', totalInvoiced: '0.00', totalPending: '100.00' },
  generatedAt: '2026-07-18T12:00:00.000Z', dataAsOf: '2026-07-18T11:58:00.000Z', freshnessSeconds: 120, isStale: true,
}

function renderPage() {
  return renderToStaticMarkup(<MemoryRouter initialEntries={['/billing/reportable-notes']}><BillingReportableNotesPage /></MemoryRouter>)
}

describe('billing reportable notes UI contracts', () => {
  beforeEach(() => {
    mockState.auth = { user: { role: 'ADMIN' } }
    mockState.report = { data: undefined, error: null, isFetching: false, isLoading: false, refetch: vi.fn() }
    mockState.detail = { data: undefined, error: null, isLoading: false }
  })

  it('persists report filters and backend sorting in the URL', () => {
    expect(buildBillingReportPath({ page: 2, limit: 25, search: 'V-101', billingStatus: 'BILLABLE', sortBy: 'pendingInvoice', sortOrder: 'desc' }))
      .toBe('/billing/reportable-notes?page=2&limit=25&search=V-101&billingStatus=BILLABLE&sortBy=pendingInvoice&sortOrder=desc')
  })

  it('selects only documents with the same customer, currency and legal entity and an available balance', () => {
    expect(areNotesCompatible(note, { ...note, saleDocumentId: 'doc-2' })).toBe(true)
    expect(areNotesCompatible(note, { ...note, saleDocumentId: 'doc-3', customerId: 'customer-2' })).toBe(false)
    expect(areNotesCompatible(note, { ...note, saleDocumentId: 'doc-4', pendingInvoice: '0.00' })).toBe(false)
  })

  it('renders loading, error, and empty report states', () => {
    mockState.report = { ...mockState.report, isLoading: true }
    expect(renderPage()).toContain('Cargando notas')

    mockState.report = { ...mockState.report, isLoading: false, error: new Error('network') }
    expect(renderPage()).toContain('No se pudieron cargar las notas facturables')

    mockState.report = { ...mockState.report, error: null, data: { ...reportData, items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } } }
    expect(renderPage()).toContain('No hay notas con estos filtros')
  })

  it('renders stale evidence, indicators, row data, and backend pagination', () => {
    mockState.report = { ...mockState.report, data: reportData }

    const html = renderPage()

    expect(html).toContain('Los datos tienen 120 segundos de antigüedad')
    expect(html).toContain('V-1001')
    expect(html).toContain('Cliente Uno')
    expect(html).toContain('Página 1 de 1')
    expect(html).toContain('Ver detalle')
  })

  it('keeps COLLECTIONS read-only in the report UI', () => {
    mockState.auth = { user: { role: 'COLLECTIONS' } }
    mockState.report = { ...mockState.report, data: reportData }

    const html = renderPage()

    expect(html).not.toContain('Crear solicitud agrupada')
    expect(html).toContain('disabled=""')
  })

  it('normalizes omitted detail collections so opening legacy records cannot crash the page', () => {
    const detail = normalizeBillingReportDetail({
      ...reportData.items[0],
      items: [],
      requests: [],
      invoices: [],
      payments: [],
      delivery: null,
    })

    expect(detail.audit).toEqual([])
  })

  it('translates detail property names into Spanish labels', () => {
    expect(getDetailPropertyLabel('productName')).toBe('Producto')
    expect(getDetailPropertyLabel('requestedTotal')).toBe('Total solicitado')
    expect(getDetailPropertyLabel('paymentMethod')).toBe('Método de pago')
    expect(getDetailPropertyLabel('actorName')).toBe('Responsable')
  })

  it('keeps the detail panel mounted while its closing animation finishes', async () => {
    mockState.report = { ...mockState.report, data: reportData }
    mockState.detail = {
      data: normalizeBillingReportDetail({ ...reportData.items[0], items: [], requests: [], invoices: [], payments: [], delivery: null, audit: [] }),
      error: null,
      isLoading: false,
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

    await act(async () => root.render(<MemoryRouter><BillingReportableNotesPage /></MemoryRouter>))
    const detailButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Ver detalle') as HTMLButtonElement
    await act(async () => detailButton.click())
    const closeButton = container.querySelector('[aria-label="Cerrar detalle"]') as HTMLButtonElement
    expect(closeButton).not.toBeNull()

    await act(async () => closeButton.click())
    expect(container.querySelector('[aria-label="Detalle de nota facturable"]')).not.toBeNull()

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)) })
    expect(container.querySelector('[aria-label="Detalle de nota facturable"]')).toBeNull()
    await act(async () => root.unmount())
    container.remove()
  })
})
