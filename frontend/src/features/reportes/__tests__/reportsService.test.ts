import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reportsService } from '../reportsService'

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

describe('TASK-091 reports dashboard service', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('consulta GET /api/reports/dashboard con filtros y Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ generatedAt: '2026-07-06T12:00:00.000Z', lowStockByLocation: [] }))

    await reportsService.getDashboard({ date: '2026-07-06', locationId: 'loc-1' }, 'access-token')

    const request = lastRequest()
    expect(request.url).toBe('/api/reports/dashboard?date=2026-07-06&locationId=loc-1')
    expect(request.init?.method).toBe('GET')
    expect(new Headers(request.init?.headers).get('authorization')).toBe('Bearer access-token')
  })

  it('propaga estado no autorizado cuando la API responde 403', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'No autorizado' }), { headers: jsonHeaders, status: 403, statusText: 'Forbidden' }))

    await expect(reportsService.getDashboard({}, 'access-token')).rejects.toMatchObject({
      message: 'No autorizado',
      statusCode: 403,
    })
  })
})
