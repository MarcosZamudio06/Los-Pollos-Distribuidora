import { describe, expect, it, vi } from 'vitest'
import { animateRoutePath, cancelRouteAnimations, routeGeometryRevision, sampleDirectionMarkers } from '../components/routeGeometry'

describe('route geometry presentation', () => {
  it('samples arrows by travelled distance and preserves route bearing', () => {
    const markers = sampleDirectionMarkers({
      type: 'LineString',
      coordinates: [[-96.2, 19.1], [-96.1, 19.1], [-96.0, 19.1]],
    }, 7_500)

    expect(markers).toHaveLength(2)
    expect(markers[0].longitude).toBeCloseTo(-96.128, 2)
    expect(markers[1].longitude).toBeCloseTo(-96.057, 2)
    expect(markers.every(({ bearing }) => bearing > 80 && bearing < 100)).toBe(true)
  })

  it('does not cluster arrows around dense geometry points', () => {
    const markers = sampleDirectionMarkers({
      type: 'LineString',
      coordinates: [[0, 0], [0.001, 0], [0.002, 0], [0.003, 0], [0.1, 0]],
    }, 3_000)

    expect(markers).toHaveLength(3)
    expect(markers[0].longitude).toBeGreaterThan(0.02)
  })

  it('reveals the final route immediately when reduced motion is preferred', () => {
    const animate = vi.fn()
    const path = { getTotalLength: () => 320, style: {}, animate } as unknown as SVGPathElement

    animateRoutePath(path, true)

    expect(animate).not.toHaveBeenCalled()
    expect(path.style.strokeDasharray).toBe('none')
    expect(path.style.strokeDashoffset).toBe('0')
  })

  it('animates a newly rendered route from hidden to fully drawn', () => {
    const animation = { cancel: vi.fn() }
    const animate = vi.fn(() => animation)
    const path = { getTotalLength: () => 320, style: {}, animate } as unknown as SVGPathElement

    const result = animateRoutePath(path, false)

    expect(animate).toHaveBeenCalledWith(
      [{ strokeDashoffset: '320' }, { strokeDashoffset: '0' }],
      { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
    )
    expect(result).toBe(animation)
    cancelRouteAnimations(result ? [result] : [])
    expect(animation.cancel).toHaveBeenCalledOnce()
  })

  it('changes the layer revision when geometry changes under the same plan', () => {
    const initial = { type: 'LineString', coordinates: [[-96.2, 19.1], [-96.1, 19.1]] } as Parameters<typeof routeGeometryRevision>[0]
    const updated = { type: 'LineString', coordinates: [[-96.2, 19.1], [-96.05, 19.15]] } as Parameters<typeof routeGeometryRevision>[0]

    expect(routeGeometryRevision(initial)).toBe(routeGeometryRevision(initial))
    expect(routeGeometryRevision(updated)).not.toBe(routeGeometryRevision(initial))
  })
})
