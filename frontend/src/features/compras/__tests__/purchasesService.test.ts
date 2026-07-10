import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { purchasesService } from '../purchasesService'

const jsonHeaders = { 'content-type': 'application/json' }

function okJson(data: unknown) {
  return new Response(JSON.stringify({ data }), { headers: jsonHeaders, status: 200 })
}

function lastRequest() {
  const call = vi.mocked(fetch).mock.calls.at(-1)
  if (!call) throw new Error('No fetch request was captured.')
  return {
    init: call[1] as RequestInit | undefined,
    url: String(call[0]),
  }
}

describe('supplier service contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('crypto', { randomUUID: () => 'supplier-idempotency-key' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lists suppliers with search and active status filters', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ items: [{ id: 'sup-1', name: 'Granja Norte' }] }))

    const suppliers = await purchasesService.listSuppliers({ isActive: false, limit: 25, page: 1, search: 'granja' }, 'access-token')

    expect(suppliers).toEqual([{ id: 'sup-1', name: 'Granja Norte' }])
    const request = lastRequest()
    expect(request.url).toBe('/api/suppliers?isActive=false&limit=25&page=1&search=granja')
    expect(request.init?.method).toBe('GET')
    expect(new Headers(request.init?.headers).get('authorization')).toBe('Bearer access-token')
  })

  it('creates suppliers through POST /api/suppliers with idempotency', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ id: 'sup-1', name: 'Granja Norte', isActive: true }))

    const supplier = await purchasesService.createSupplier(
      { address: 'Carretera Norte', email: 'ventas@granja.mx', name: 'Granja Norte', phone: '2291234567' },
      'access-token',
    )

    expect(supplier).toMatchObject({ id: 'sup-1', name: 'Granja Norte' })
    const request = lastRequest()
    expect(request.url).toBe('/api/suppliers')
    expect(request.init?.method).toBe('POST')
    expect(JSON.parse(String(request.init?.body))).toEqual({ address: 'Carretera Norte', email: 'ventas@granja.mx', name: 'Granja Norte', phone: '2291234567' })
    expect(new Headers(request.init?.headers).get('idempotency-key')).toBe('supplier-idempotency-key')
  })

  it('updates suppliers through PATCH /api/suppliers/:id with partial fields', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ id: 'sup-1', name: 'Granja Norte Renovada' }))

    await purchasesService.updateSupplier('sup-1', { name: 'Granja Norte Renovada' }, 'access-token')

    const request = lastRequest()
    expect(request.url).toBe('/api/suppliers/sup-1')
    expect(request.init?.method).toBe('PATCH')
    expect(JSON.parse(String(request.init?.body))).toEqual({ name: 'Granja Norte Renovada' })
  })

  it('deactivates suppliers through DELETE /api/suppliers/:id', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ id: 'sup-1', isActive: false, name: 'Granja Norte' }))

    const supplier = await purchasesService.deactivateSupplier('sup-1', 'access-token')

    expect(supplier).toMatchObject({ id: 'sup-1', isActive: false })
    const request = lastRequest()
    expect(request.url).toBe('/api/suppliers/sup-1')
    expect(request.init?.method).toBe('DELETE')
  })
})
