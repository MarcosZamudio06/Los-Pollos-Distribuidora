import { useMemo } from 'react'
import L from 'leaflet'
import { Marker } from 'react-leaflet'
import type { RoutePlanStopInput } from '../types'
import { formatRouteDistance, formatRouteDuration } from './routeStopMetrics'

export type RouteStopDisplay = RoutePlanStopInput & {
  customerName?: string
  saleNumber?: string
}

export type RouteStopInfoMarkerProps = {
  stop: RouteStopDisplay
  index: number
  latitude: number
  longitude: number
  durationSeconds?: number | null
  distanceMeters?: number | null
  cumulativeDurationSeconds?: number | null
  cumulativeDistanceMeters?: number | null
  isOrigin?: boolean
  isDestination?: boolean
  isSelected?: boolean
  showInfo?: boolean
  visualOffset?: { x: number; y: number }
  onSelect?: () => void
  onMove?: (latitude: number, longitude: number) => void
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
}

function markerLabel(index: number, isOrigin: boolean) {
  if (isOrigin) return 'A'
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
}

export function RouteStopInfoMarker({
  stop, index, latitude, longitude, durationSeconds, distanceMeters,
  cumulativeDurationSeconds, cumulativeDistanceMeters, isOrigin = false,
  isDestination = false, isSelected = false, showInfo = true,
  visualOffset = { x: 0, y: 0 }, onSelect, onMove,
}: RouteStopInfoMarkerProps) {
  const duration = formatRouteDuration(durationSeconds)
  const distance = formatRouteDistance(distanceMeters)
  const cumulativeDuration = formatRouteDuration(cumulativeDurationSeconds)
  const cumulativeDistance = formatRouteDistance(cumulativeDistanceMeters)
  const label = markerLabel(index, isOrigin)
  const title = isOrigin ? 'Origen' : `Parada ${index}: ${stop.customerName ?? stop.saleNumber ?? stop.deliveryAddress}`

  const icon = useMemo(() => {
    const tone = isOrigin ? '#2563a8' : isSelected ? '#176b45' : '#238052'
    const details = [
      stop.customerName && `<strong>${escapeHtml(stop.customerName)}</strong>`,
      stop.deliveryAddress && `<span>${escapeHtml(stop.deliveryAddress)}</span>`,
      !isOrigin && `<span>Orden de visita: ${index}</span>`,
      isDestination && cumulativeDuration && cumulativeDistance && `<span>Total: ${cumulativeDuration} · ${cumulativeDistance}</span>`,
    ].filter(Boolean).join('')
    const metrics = duration && distance
      ? `<span class="route-stop-card__duration">${duration}</span><span>${distance}</span>`
      : !isOrigin ? '<span class="route-stop-card__pending">Calculando…</span>' : ''
    return L.divIcon({
      className: 'route-stop-info-icon',
      iconAnchor: [28 - visualOffset.x, 44 - visualOffset.y],
      iconSize: [56, 88],
      html: `<div class="route-stop-info ${isSelected ? 'is-selected' : ''}" style="--route-stop-tone:${tone};transform:translate(${visualOffset.x}px,${visualOffset.y}px)">
        ${showInfo && !isOrigin ? `<div class="route-stop-card" role="status" aria-label="${escapeHtml(`${duration ?? 'Calculando'}, ${distance ?? 'distancia pendiente'}`)}">${metrics}<i aria-hidden="true"></i><div class="route-stop-card__details">${details}</div></div>` : ''}
        <span class="route-stop-dot" aria-hidden="true">${label}</span>
      </div>`,
    })
  }, [cumulativeDistance, cumulativeDuration, distance, duration, index, isDestination, isOrigin, isSelected, label, showInfo, stop.customerName, stop.deliveryAddress, visualOffset.x, visualOffset.y])

  return (
    <Marker
      draggable={!isOrigin && Boolean(onMove)}
      eventHandlers={{
        click: () => onSelect?.(),
        dragend: (event) => { const point = event.target.getLatLng(); onMove?.(point.lat, point.lng) },
      }}
      icon={icon}
      keyboard
      position={[latitude, longitude]}
      riseOnHover
      title={title}
      zIndexOffset={isSelected ? 800 : isOrigin ? 500 : 600}
    />
  )
}
