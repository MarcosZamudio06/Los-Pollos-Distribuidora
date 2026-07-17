import type { DeliveryRoutePlan, GeoJsonLineString } from '../types'

export function formatRouteDuration(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return null
  const totalMinutes = Math.max(0, Math.round(value / 60))
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`
}

export function formatRouteDistance(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return null
  if (value < 1000) return `${Math.max(0, Math.round(value))} m`
  return `${(value / 1000).toFixed(1)} km`
}

function nearestCoordinateIndex(coordinates: [number, number][], latitude: number, longitude: number) {
  return coordinates.reduce((best, coordinate, index) => {
    const score = (coordinate[0] - longitude) ** 2 + (coordinate[1] - latitude) ** 2
    return score < best.score ? { index, score } : best
  }, { index: 0, score: Number.POSITIVE_INFINITY }).index
}

export function selectedRouteSegment(plan: DeliveryRoutePlan, saleId: string, origin?: [number, number]): GeoJsonLineString | null {
  const ordered = [...plan.orderedStops].sort((a, b) => a.sequence - b.sequence)
  const selectedIndex = ordered.findIndex((stop) => stop.saleId === saleId)
  if (selectedIndex < 0 || plan.geometry.coordinates.length < 2) return null
  const selected = ordered[selectedIndex]
  const previous = selectedIndex === 0 ? origin : [ordered[selectedIndex - 1].latitude, ordered[selectedIndex - 1].longitude] as [number, number]
  if (!previous) return null
  const startIndex = nearestCoordinateIndex(plan.geometry.coordinates, previous[0], previous[1])
  const endIndex = nearestCoordinateIndex(plan.geometry.coordinates, selected.latitude, selected.longitude)
  const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex]
  const coordinates = plan.geometry.coordinates.slice(from, to + 1)
  return coordinates.length > 1 ? { type: 'LineString', coordinates } : null
}
