// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DeliveryRouteDetail } from '../types'
import { RouteDetailPage } from '../pages/RouteDetailPage'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockState = vi.hoisted(() => ({
  route: { data: null as DeliveryRouteDetail | null, error: null, isLoading: false },
}))

vi.mock('../hooks', () => ({
  useDeliveryRoute: () => mockState.route,
  useOpenRouteSettlement: () => ({ isPending: false, mutateAsync: vi.fn() }),
}))

vi.mock('../components/DriverRouteMap', () => ({
  DriverRouteMap: ({ compact, geometry, orders, routeName }: {
    compact?: boolean
    geometry: { coordinates: [number, number][] }
    orders: Array<{ id: string; stopSequence?: number | null }>
    routeName: string
  }) => (
    <div
      aria-label={`Mapa de ${routeName}`}
      data-compact={compact ? 'true' : 'false'}
      data-coordinates={JSON.stringify(geometry.coordinates)}
      data-stops={orders.map((order) => `${order.id}:${order.stopSequence}`).join(',')}
    />
  ),
}))

const baseRoute: DeliveryRouteDetail = {
  id: 'route-1',
  name: 'Ruta Centro',
  status: 'PENDING',
  scheduledDate: '2026-07-15',
  mapAvailable: true,
  geometry: { type: 'LineString', coordinates: [[-96.13, 19.17], [-96.14, 19.18]] },
  orders: [],
}

async function renderPage(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/delivery-routes/route-1']}>
        <Routes><Route element={<RouteDetailPage />} path="/delivery-routes/:routeId" /></Routes>
      </MemoryRouter>,
    )
  })
  return { container, root }
}

describe('route detail optimized map', () => {
  beforeEach(() => { mockState.route.data = { ...baseRoute, orders: [] } })

  it('passes the optimized geometry and every located stop in sequence order to the compact map', async () => {
    mockState.route.data = {
      ...baseRoute,
      orders: [
        { id: 'stop-3', status: 'PENDING', latitude: 19.19, longitude: -96.15, stopSequence: 3 },
        { id: 'stop-1', status: 'PENDING', latitude: 19.17, longitude: -96.13, stopSequence: 1 },
        { id: 'stop-2', status: 'PENDING', latitude: 19.18, longitude: -96.14, stopSequence: 2 },
      ],
    }
    const { container, root } = await renderPage()
    try {
      const map = container.querySelector('[aria-label="Mapa de Ruta Centro"]')
      expect(map?.getAttribute('data-compact')).toBe('true')
      expect(map?.getAttribute('data-coordinates')).toBe('[[-96.13,19.17],[-96.14,19.18]]')
      expect(map?.getAttribute('data-stops')).toBe('stop-1:1,stop-2:2,stop-3:3')
    } finally { await act(async () => root.unmount()); container.remove() }
  })

  it('shows an operational fallback when the route has no optimized map', async () => {
    mockState.route.data = { ...baseRoute, mapAvailable: false, geometry: null }
    const { container, root } = await renderPage()
    try {
      expect(container.textContent).toContain('El trazado optimizado no está disponible para esta ruta.')
      expect(container.querySelector('[aria-label^="Mapa de"]')).toBeNull()
    } finally { await act(async () => root.unmount()); container.remove() }
  })

  it('renders the map safely when the route has no orders', async () => {
    const { container, root } = await renderPage()
    try {
      expect(container.querySelector('[aria-label="Mapa de Ruta Centro"]')?.getAttribute('data-stops')).toBe('')
    } finally { await act(async () => root.unmount()); container.remove() }
  })
})
