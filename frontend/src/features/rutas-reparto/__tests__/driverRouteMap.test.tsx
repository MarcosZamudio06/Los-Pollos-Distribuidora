import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('leaflet', () => ({
  default: { divIcon: ({ html }: { html: string }) => ({ html }) },
}))

vi.mock('react-leaflet', () => ({
  GeoJSON: () => <div data-layer="route" />,
  MapContainer: ({ children, scrollWheelZoom }: { children: React.ReactNode; scrollWheelZoom: boolean }) => <div data-scroll={String(scrollWheelZoom)}>{children}</div>,
  Marker: ({ title }: { title: string }) => <span data-marker={title} />,
  TileLayer: () => null,
  useMap: () => ({ fitBounds: vi.fn() }),
}))

import { DriverRouteMap } from '../components/DriverRouteMap'

const geometry = { type: 'LineString' as const, coordinates: [[-96.14, 19.18], [-96.13, 19.17]] as [number, number][] }

describe('DriverRouteMap', () => {
  it('renders a compact current-order-only map without wheel zoom', () => {
    const html = renderToStaticMarkup(<DriverRouteMap compact currentOrder={{ latitude: 19.17, longitude: -96.13, stopSequence: 2 }} geometry={geometry} routeName="Ruta Norte" />)
    expect(html).toContain('h-64')
    expect(html).toContain('data-scroll="false"')
    expect(html).toContain('Pedido actual · Parada 2')
  })

  it('does not duplicate the current order when it is also present in orders', () => {
    const html = renderToStaticMarkup(<DriverRouteMap currentOrder={{ id: 'order-1', latitude: 19.17, longitude: -96.13, stopSequence: 2 }} geometry={geometry} orders={[{ id: 'order-1', latitude: 19.17, longitude: -96.13, stopSequence: 2 }]} routeName="Ruta Norte" />)
    expect(html.match(/data-marker=/g)).toHaveLength(2)
    expect(html).toContain('Origen y regreso')
    expect(html).toContain('Pedido actual · Parada 2')
  })

  it('returns no map for empty geometry', () => {
    expect(renderToStaticMarkup(<DriverRouteMap geometry={{ type: 'LineString', coordinates: [] }} routeName="Vacía" />)).toBe('')
  })
})
