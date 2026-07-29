import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { latestOrder, mergeOrders } from '../orderUtils'
import { ordersService } from '../ordersService'

function okJson(data: unknown) {
  return new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' }, status: 200 })
}

describe('branch orders service', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('requests orders for exactly one operational location', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ items: [] }))

    await ordersService.listBranchOrders({ locationId: 'loc-1', paymentType: 'CASH_SALE' }, 'access-token')

    expect(fetch).toHaveBeenCalledWith('/api/sales/orders?locationId=loc-1&paymentType=CASH_SALE', expect.objectContaining({ method: 'GET' }))
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit
    expect(new Headers(request.headers).get('authorization')).toBe('Bearer access-token')
  })

  it('merges a recovered REST order and a socket event by sale id without duplication', () => {
    const order = {
      id: 'sale-1', saleNumber: 'SALE-000001', createdAt: '2026-07-27T10:00:00.000Z',
      location: { id: 'loc-1', name: 'Sucursal Centro' }, customer: null, items: [], total: '250', status: 'CONFIRMED' as const,
    }

    expect(mergeOrders([order], [order])).toEqual([order])
  })

  it('keeps only the newest sale in the monitor after a socket update', () => {
    const firstOrder = {
      id: 'sale-1', saleNumber: 'SALE-000001', createdAt: '2026-07-27T10:00:00.000Z',
      location: { id: 'loc-1', name: 'Sucursal Centro' }, customer: null, items: [], total: '250', status: 'CONFIRMED' as const,
    }
    const latestSale = { ...firstOrder, id: 'sale-2', saleNumber: 'SALE-000002', createdAt: '2026-07-27T10:05:00.000Z' }

    expect(latestOrder([firstOrder], [latestSale])).toEqual([latestSale])
  })
})
