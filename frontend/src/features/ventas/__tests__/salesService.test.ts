import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { salesService } from '../salesService'

const jsonHeaders = { 'content-type': 'application/json' }

function okJson(data: unknown) {
  return new Response(JSON.stringify({ data }), { headers: jsonHeaders, status: 200 })
}

function lastRequest() {
  const call = vi.mocked(fetch).mock.calls.at(-1)
  if (!call) throw new Error('No se registró ninguna petición fetch.')
  return {
    init: call[1] as RequestInit | undefined,
    url: String(call[0]),
  }
}

describe('salesService TASK-055 contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('crypto', { randomUUID: () => 'idempotency-test-key' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('consulta el historial con los filtros del contrato GET /api/sales', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ items: [] }))

    await salesService.listSales(
      {
        collectionStatus: 'UNPAID',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-03',
        documentType: 'SIMPLE_NOTE',
        limit: 50,
        locationId: 'loc-counter',
        page: 1,
        paymentType: 'CASH_SALE',
        physicalFolio: 'A-1024',
        saleChannel: 'COUNTER',
        status: 'CONFIRMED',
      },
      'access-token',
    )

    const request = lastRequest()
    expect(request.url).toBe('/api/sales?collectionStatus=UNPAID&dateFrom=2026-07-01&dateTo=2026-07-03&documentType=SIMPLE_NOTE&limit=50&locationId=loc-counter&page=1&paymentType=CASH_SALE&physicalFolio=A-1024&saleChannel=COUNTER&status=CONFIRMED')
    expect(request.init?.method).toBe('GET')
    expect(new Headers(request.init?.headers).get('authorization')).toBe('Bearer access-token')
  })

  it('carga el detalle de venta desde GET /api/sales/:id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ id: 'sale-1', items: [], status: 'CONFIRMED' }))

    const sale = await salesService.getSale('sale-1', 'access-token')

    expect(sale).toMatchObject({ id: 'sale-1', status: 'CONFIRMED' })
    expect(lastRequest().url).toBe('/api/sales/sale-1')
    expect(lastRequest().init?.method).toBe('GET')
  })

  it('carga el ticket para reimpresión desde GET /api/sales/:id/ticket', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ saleNumber: 'V-1', ticketNumber: 'T-1' }))

    const ticket = await salesService.getTicket('sale-1', 'access-token')

    expect(ticket).toMatchObject({ saleNumber: 'V-1', ticketNumber: 'T-1' })
    expect(lastRequest().url).toBe('/api/sales/sale-1/ticket')
    expect(lastRequest().init?.method).toBe('GET')
  })

  it('reutiliza la clave de idempotencia proporcionada para cada reintento de venta', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(okJson({ sale: { id: 'sale-1' } }))
      .mockResolvedValueOnce(okJson({ sale: { id: 'sale-1' } }))
    const payload = {
      documentType: 'SIMPLE_NOTE' as const,
      items: [{ presentationType: 'CUT' as const, productId: 'product-1', quantityKg: 1, quantityPieces: 0, unit: 'KG' as const }],
      locationId: 'loc-1',
      paymentType: 'CASH_SALE' as const,
      requiresAdministrativeInvoice: false,
      saleChannel: 'COUNTER' as const,
    }

    await salesService.createSale(payload, 'sale-attempt-key', 'access-token')
    await salesService.createSale(payload, 'sale-attempt-key', 'access-token')

    expect(vi.mocked(fetch).mock.calls).toHaveLength(2)
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('idempotency-key')).toBe('sale-attempt-key')
    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get('idempotency-key')).toBe('sale-attempt-key')
  })

  it('consulta documentos internos desde GET /api/sales/:saleId/documents', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ items: [{ id: 'doc-1', documentType: 'SIMPLE_NOTE' }] }))

    const documents = await salesService.getSaleDocuments('sale-1', 'access-token')

    expect(documents.items).toEqual([{ id: 'doc-1', documentType: 'SIMPLE_NOTE' }])
    expect(lastRequest().url).toBe('/api/sales/sale-1/documents')
    expect(lastRequest().init?.method).toBe('GET')
  })

  it('envía cancelación con payload { reason, expectedVersion } e idempotencia', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ sale: { id: 'sale-1', status: 'CANCELLED' } }))

    await salesService.cancelSale('sale-1', { expectedVersion: 4, reason: 'Cliente canceló pedido' }, 'cancel-attempt-key', 'access-token')

    const request = lastRequest()
    expect(request.url).toBe('/api/sales/sale-1/cancel')
    expect(request.init?.method).toBe('POST')
    expect(JSON.parse(String(request.init?.body))).toEqual({ expectedVersion: 4, reason: 'Cliente canceló pedido' })
    expect(new Headers(request.init?.headers).get('idempotency-key')).toBe('cancel-attempt-key')
  })

  it('expone estado no autorizado cuando la API responde 401', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'No autorizado' }), { headers: jsonHeaders, status: 401, statusText: 'Unauthorized' }))

    await expect(salesService.getSale('sale-1', 'access-token')).rejects.toMatchObject({
      message: 'No autorizado',
      statusCode: 401,
    })
  })
})
