import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deliveryService } from '../deliveryService'

const jsonHeaders = { 'content-type': 'application/json' }
const okJson = (data: unknown) => new Response(JSON.stringify({ data }), { headers: jsonHeaders, status: 200 })

function requestAt(index = -1) {
  const call = vi.mocked(fetch).mock.calls.at(index)
  if (!call) throw new Error('No request captured')
  return { url: String(call[0]), init: call[1] as RequestInit }
}

describe('delivery route planning API contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('crypto', { randomUUID: () => 'route-idempotency-key' })
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

  it('lists eligible sales and searches Photon through the backend proxy', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(okJson({ items: [{ saleId: 'sale-1', saleNumber: 'V-1001', suggestedDeliveryAddress: 'Centro' }] }))
      .mockResolvedValueOnce(okJson({ items: [{ label: 'Centro, Veracruz', latitude: 19.17, longitude: -96.13 }] }))

    await deliveryService.listEligibleSales({ originLocationId: 'origin-1', search: 'V-1001' }, 'token')
    await deliveryService.searchAddresses({ q: 'Centro Veracruz', latitude: 19.18, longitude: -96.14 }, 'token')

    expect(requestAt(0).url).toBe('/api/delivery-route-planning/eligible-sales?originLocationId=origin-1&search=V-1001')
    expect(requestAt(1).url).toContain('/api/geocoding/search?')
    expect(requestAt(1).url).toContain('q=Centro+Veracruz')
    expect(new Headers(requestAt(1).init.headers).get('authorization')).toBe('Bearer token')
  })

  it('allows the planner to search an unassigned folio without an implicit origin filter', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({
      items: [{ saleId: 'sale-ver', saleNumber: 'V-2001', suggestedDeliveryAddress: 'Veracruz' }],
    }))

    await deliveryService.listEligibleSales({ limit: 100, search: 'V-2001' }, 'token')

    expect(requestAt().url).toBe('/api/delivery-route-planning/eligible-sales?limit=100&search=V-2001')
    expect(requestAt().url).not.toContain('originLocationId')
  })

  it('creates a plan and consumes it with a stable idempotency key', async () => {
    const planPayload = { driverId: 'driver-1', scheduledDate: '2026-07-15', originLocationId: 'origin-1', stops: [{ saleId: 'sale-1', deliveryAddress: 'Centro', latitude: 19.17, longitude: -96.13 }] }
    vi.mocked(fetch)
      .mockResolvedValueOnce(okJson({ id: 'plan-1', orderedStops: [], geometry: { type: 'LineString', coordinates: [] }, distanceMeters: 1000, durationSeconds: 300 }))
      .mockResolvedValueOnce(okJson({ id: 'route-1' }))

    await deliveryService.createRoutePlan(planPayload, 'token')
    await deliveryService.createOptimizedRoute({ name: 'Ruta Centro', driverId: 'driver-1', scheduledDate: '2026-07-15', originLocationId: 'origin-1', routePlanId: 'plan-1' }, 'route-key', 'token')

    expect(requestAt(0).url).toBe('/api/delivery-route-plans')
    expect(requestAt(0).init.method).toBe('POST')
    expect(requestAt(1).url).toBe('/api/delivery-routes')
    expect(new Headers(requestAt(1).init.headers).get('idempotency-key')).toBe('route-key')
  })

  it('retrieves the persisted DRIVER route map and approved stop sequence', async () => {
    const geometry = { type: 'LineString' as const, coordinates: [[-96.14, 19.18], [-96.13, 19.17]] as [number, number][] }
    vi.mocked(fetch).mockResolvedValueOnce(okJson({
      id: 'route-1',
      mapAvailable: true,
      geometry,
      distanceMeters: 8600,
      durationSeconds: 1440,
      orders: [{ id: 'order-1', stopSequence: 1, customerName: 'Polleria Centro', latitude: 19.17, longitude: -96.13 }],
    }))

    await expect(deliveryService.getRoute('route-1', 'driver-token')).resolves.toEqual(expect.objectContaining({
      mapAvailable: true,
      geometry,
      orders: [expect.objectContaining({ stopSequence: 1, customerName: 'Polleria Centro' })],
    }))
    expect(requestAt().url).toBe('/api/delivery-routes/route-1')
    expect(new Headers(requestAt().init.headers).get('authorization')).toBe('Bearer driver-token')
  })

  it('retrieves the ADMIN routing technical status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okJson({ status: 'operational', dataset: { version: 'mx-2026-07', ageDays: 13 }, services: [{ name: 'PostGIS', status: 'up', latencyMs: 4 }] }))
    await expect(deliveryService.getRoutingTechnicalStatus('admin-token')).resolves.toEqual(expect.objectContaining({ status: 'operational' }))
    expect(requestAt().url).toBe('/api/delivery-routing/technical-status')
    expect(new Headers(requestAt().init.headers).get('authorization')).toBe('Bearer admin-token')
  })
})
