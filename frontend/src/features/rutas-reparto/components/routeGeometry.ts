import type { GeoJsonLineString } from '../types'

export type DirectionMarker = {
  latitude: number
  longitude: number
  bearing: number
}

const earthRadiusMeters = 6_371_000

function radians(value: number) {
  return value * Math.PI / 180
}

function degrees(value: number) {
  return value * 180 / Math.PI
}

function segmentDistance([fromLongitude, fromLatitude]: [number, number], [toLongitude, toLatitude]: [number, number]) {
  const latitudeDelta = radians(toLatitude - fromLatitude)
  const longitudeDelta = radians(toLongitude - fromLongitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(fromLatitude)) * Math.cos(radians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function segmentBearing([fromLongitude, fromLatitude]: [number, number], [toLongitude, toLatitude]: [number, number]) {
  const longitudeDelta = radians(toLongitude - fromLongitude)
  const fromLatitudeRadians = radians(fromLatitude)
  const toLatitudeRadians = radians(toLatitude)
  const y = Math.sin(longitudeDelta) * Math.cos(toLatitudeRadians)
  const x = Math.cos(fromLatitudeRadians) * Math.sin(toLatitudeRadians)
    - Math.sin(fromLatitudeRadians) * Math.cos(toLatitudeRadians) * Math.cos(longitudeDelta)
  return (degrees(Math.atan2(y, x)) + 360) % 360
}

export function sampleDirectionMarkers(geometry: GeoJsonLineString, spacingMeters: number): DirectionMarker[] {
  const coordinates = geometry.coordinates
  if (coordinates.length < 2 || spacingMeters <= 0) return []

  const result: DirectionMarker[] = []
  let travelled = 0
  let nextSample = spacingMeters

  for (let index = 1; index < coordinates.length; index += 1) {
    const from = coordinates[index - 1]
    const to = coordinates[index]
    const distance = segmentDistance(from, to)
    if (!Number.isFinite(distance) || distance <= 0) continue

    while (nextSample < travelled + distance) {
      const ratio = (nextSample - travelled) / distance
      result.push({
        longitude: from[0] + (to[0] - from[0]) * ratio,
        latitude: from[1] + (to[1] - from[1]) * ratio,
        bearing: segmentBearing(from, to),
      })
      nextSample += spacingMeters
    }
    travelled += distance
  }

  return result
}

export function routeLengthMeters(geometry: GeoJsonLineString) {
  return geometry.coordinates.slice(1).reduce(
    (total, coordinate, index) => total + segmentDistance(geometry.coordinates[index], coordinate),
    0,
  )
}

export function routeGeometryRevision(geometry: GeoJsonLineString) {
  const serialized = JSON.stringify(geometry.coordinates)
  let hash = 2_166_136_261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return `${geometry.coordinates.length}-${(hash >>> 0).toString(36)}`
}

export function animateRoutePath(path: SVGPathElement, reducedMotion: boolean) {
  if (reducedMotion) {
    path.style.strokeDasharray = 'none'
    path.style.strokeDashoffset = '0'
    return undefined
  }

  const length = path.getTotalLength()
  path.style.strokeDasharray = `${length}`
  path.style.strokeDashoffset = `${length}`
  if (typeof path.animate !== 'function') {
    path.style.strokeDashoffset = '0'
    return undefined
  }
  return path.animate(
    [{ strokeDashoffset: `${length}` }, { strokeDashoffset: '0' }],
    { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'forwards' },
  )
}

export function cancelRouteAnimations(animations: Animation[]) {
  animations.forEach((animation) => animation.cancel())
}
