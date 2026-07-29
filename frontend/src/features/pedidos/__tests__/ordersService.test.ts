import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeOrders } from '../orderUtils'
import { ordersService } from '../ordersService'
import { getSalesSocketUrl } from '@/lib/salesSocket'

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

  it('requests two persisted orders when the periodic cleanup runs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ items: [] }))

    await ordersService.listBranchOrders({ locationId: 'loc-1', limit: 2 }, 'access-token')

    expect(fetch).toHaveBeenCalledWith('/api/sales/orders?locationId=loc-1&limit=2', expect.any(Object))
  })

  it('uses the sales namespace instead of the socket root', () => {
    expect(getSalesSocketUrl()).toBe('/sales')
  })

  it('merges a recovered REST order and a socket event by sale id without duplication', () => {
    const order = {
      id: 'sale-1', saleNumber: 'SALE-000001', createdAt: '2026-07-27T10:00:00.000Z',
      location: { id: 'loc-1', name: 'Sucursal Centro' }, customer: null, items: [], total: '250', status: 'CONFIRMED' as const,
    }

    expect(mergeOrders([order], [order])).toEqual([order])
  })

  it('accumulates every socket sale until the scheduled cleanup', () => {
    const firstOrder = {
      id: 'sale-1', saleNumber: 'SALE-000001', createdAt: '2026-07-27T10:00:00.000Z',
      location: { id: 'loc-1', name: 'Sucursal Centro' }, customer: null, items: [], total: '250', status: 'CONFIRMED' as const,
    }
    const secondSale = { ...firstOrder, id: 'sale-2', saleNumber: 'SALE-000002', createdAt: '2026-07-27T10:05:00.000Z' }
    const latestSale = { ...firstOrder, id: 'sale-3', saleNumber: 'SALE-000003', createdAt: '2026-07-27T10:10:00.000Z' }

    expect(mergeOrders([firstOrder, secondSale], [latestSale])).toEqual([latestSale, secondSale, firstOrder])
  })

  it('uses the two persisted orders returned by REST during cleanup', async () => {
    const firstOrder = {
      id: 'sale-1', saleNumber: 'SALE-000001', createdAt: '2026-07-27T10:00:00.000Z',
      location: { id: 'loc-1', name: 'Sucursal Centro' }, customer: null, items: [], total: '250', status: 'CONFIRMED' as const,
    }
    const secondSale = { ...firstOrder, id: 'sale-2', saleNumber: 'SALE-000002', createdAt: '2026-07-27T10:05:00.000Z' }
    const latestSale = { ...firstOrder, id: 'sale-3', saleNumber: 'SALE-000003', createdAt: '2026-07-27T10:10:00.000Z' }

    vi.mocked(fetch).mockResolvedValueOnce(okJson({ items: [latestSale, secondSale] }))

    await expect(ordersService.listBranchOrders({ locationId: 'loc-1', limit: 2 }, 'access-token')).resolves.toEqual({
      items: [latestSale, secondSale],
    })
  })
})
