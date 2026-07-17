// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { formatRouteDistance, formatRouteDuration, selectedRouteSegment } from '../components/routeStopMetrics'
import type { DeliveryRoutePlan } from '../types'

const plan: DeliveryRoutePlan = {
  id: 'plan-1', expiresAt: '2026-07-16T12:00:00.000Z', routingProfile: 'driving', routingDataVersion: 'test',
  distanceMeters: 3300, durationSeconds: 660,
  geometry: { type: 'LineString', coordinates: [[-96.2, 19.1], [-96.15, 19.15], [-96.1, 19.2], [-96.05, 19.25]] },
  orderedStops: [
    { saleId: 'sale-a', deliveryAddress: 'A', latitude: 19.2, longitude: -96.1, sequence: 1, legDistanceMeters: 1600, legDurationSeconds: 300 },
    { saleId: 'sale-b', deliveryAddress: 'B', latitude: 19.25, longitude: -96.05, sequence: 2, legDistanceMeters: 1700, legDurationSeconds: 360 },
  ],
}

describe('route stop information', () => {
  it('formats actual duration and distance without inventing missing values', () => {
    expect(formatRouteDuration(660)).toBe('11 min')
    expect(formatRouteDuration(3660)).toBe('1 h 1 min')
    expect(formatRouteDistance(850)).toBe('850 m')
    expect(formatRouteDistance(3300)).toBe('3.3 km')
    expect(formatRouteDuration(null)).toBeNull()
    expect(formatRouteDistance(undefined)).toBeNull()
  })

  it('selects the geometry corresponding to the selected stop leg', () => {
    expect(selectedRouteSegment(plan, 'sale-a', [19.1, -96.2])?.coordinates).toEqual([
      [-96.2, 19.1], [-96.15, 19.15], [-96.1, 19.2],
    ])
    expect(selectedRouteSegment(plan, 'sale-b', [19.1, -96.2])?.coordinates).toEqual([
      [-96.1, 19.2], [-96.05, 19.25],
    ])
    expect(selectedRouteSegment(plan, 'missing', [19.1, -96.2])).toBeNull()
  })
})
