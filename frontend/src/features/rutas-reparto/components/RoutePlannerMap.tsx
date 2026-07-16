import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { DeliveryRoutePlan, PlannerLocation, RoutePlanStopInput } from '../types'
import { animateRoutePath, cancelRouteAnimations, routeGeometryRevision, routeLengthMeters, sampleDirectionMarkers } from './routeGeometry'

type Props = {
  activeSaleId?: string
  origin?: PlannerLocation
  plan?: DeliveryRoutePlan | null
  stops: RoutePlanStopInput[]
  onMoveStop: (saleId: string, latitude: number, longitude: number) => void
  onSelectStop: (saleId: string) => void
}

const fallbackCenter: [number, number] = [19.1738, -96.1342]

function pinIcon(label: string, tone: 'origin' | 'stop' | 'active') {
  const colors = tone === 'origin' ? ['#1d2420', '#f0c56a'] : tone === 'active' ? ['#b62a22', '#fff'] : ['#d69b2d', '#1d2420']
  return L.divIcon({
    className: 'route-planner-pin',
    html: `<span style="display:grid;place-items:center;width:34px;height:34px;border:3px solid white;border-radius:50% 50% 50% 12%;transform:rotate(-45deg);background:${colors[0]};color:${colors[1]};box-shadow:0 8px 22px rgba(29,36,32,.28)"><b style="transform:rotate(45deg);font:800 12px system-ui">${label}</b></span>`,
    iconAnchor: [17, 32], iconSize: [34, 34],
  })
}

function MapClick({ activeSaleId, onMoveStop }: Pick<Props, 'activeSaleId' | 'onMoveStop'>) {
  useMapEvents({ click: ({ latlng }) => { if (activeSaleId) onMoveStop(activeSaleId, latlng.lat, latlng.lng) } })
  return null
}

function FitRoute({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14)
    if (points.length > 1) map.fitBounds(points, { padding: [42, 42] })
  }, [map, points])
  return null
}

function directionIcon(bearing: number) {
  return L.divIcon({
    className: 'route-planner-direction',
    html: `<span aria-hidden="true" style="display:grid;place-items:center;width:24px;height:24px;transform:rotate(${bearing}deg);filter:drop-shadow(0 2px 3px rgba(29,36,32,.35))"><span style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:13px solid #f0c56a;filter:drop-shadow(0 0 1px #1d2420)"></span></span>`,
    iconAnchor: [12, 12],
    iconSize: [24, 24],
  })
}

function AnimatedRoute({ plan }: { plan: DeliveryRoutePlan }) {
  const routeLayer = useRef<L.GeoJSON>(null)
  const totalDistance = useMemo(() => routeLengthMeters(plan.geometry), [plan.geometry])
  const arrows = useMemo(() => {
    const spacing = Math.min(1_800, Math.max(350, totalDistance / 6))
    return sampleDirectionMarkers(plan.geometry, spacing)
  }, [plan.geometry, totalDistance])

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const animations: Animation[] = []
    routeLayer.current?.eachLayer((layer) => {
      if (layer instanceof L.Path) {
        const path = layer.getElement()
        if (path instanceof SVGPathElement) {
          const animation = animateRoutePath(path, reducedMotion)
          if (animation) animations.push(animation)
        }
      }
    })
    return () => cancelRouteAnimations(animations)
  }, [plan.id, plan.geometry])

  return (
    <>
      <GeoJSON ref={routeLayer} data={plan.geometry} style={{ color: '#b62a22', weight: 6, opacity: 0.88 }} />
      {arrows.map((arrow, index) => (
        <Marker
          interactive={false}
          keyboard={false}
          icon={directionIcon(arrow.bearing)}
          key={`${plan.id}-direction-${index}`}
          position={[arrow.latitude, arrow.longitude]}
          zIndexOffset={250}
        />
      ))}
    </>
  )
}

export function RoutePlannerMap({ activeSaleId, origin, plan, stops, onMoveStop, onSelectStop }: Props) {
  const originPoint = useMemo(() => origin?.latitude != null && origin?.longitude != null ? [Number(origin.latitude), Number(origin.longitude)] as [number, number] : undefined, [origin])
  const sequence = useMemo(() => new Map((plan?.orderedStops ?? []).map((stop) => [stop.saleId, stop.sequence])), [plan])
  const points = useMemo(() => [originPoint, ...stops.filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)).map((stop) => [stop.latitude, stop.longitude] as [number, number])].filter(Boolean) as [number, number][], [originPoint, stops])
  const geometryRevision = plan?.geometry ? routeGeometryRevision(plan.geometry) : undefined

  return (
    <div className="relative z-0 isolate h-[34rem] min-h-[420px] overflow-hidden rounded-[1.4rem] border border-black/10 bg-[#dce5df] shadow-[0_20px_60px_rgba(29,36,32,.16)]" aria-label="Mapa para planificar la ruta">
      <MapContainer center={originPoint ?? fallbackCenter} className="h-full w-full" scrollWheelZoom zoom={12}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClick activeSaleId={activeSaleId} onMoveStop={onMoveStop} />
        <FitRoute points={points} />
        {originPoint && <Marker icon={pinIcon('O', 'origin')} position={originPoint} title={`Origen: ${origin?.name}`} />}
        {stops.map((stop, index) => (
          <Marker
            draggable
            eventHandlers={{
              click: () => onSelectStop(stop.saleId),
              dragend: (event) => { const point = event.target.getLatLng(); onMoveStop(stop.saleId, point.lat, point.lng) },
            }}
            icon={pinIcon(String(sequence.get(stop.saleId) ?? index + 1), activeSaleId === stop.saleId ? 'active' : 'stop')}
            key={stop.saleId}
            position={[stop.latitude, stop.longitude]}
            title={`Parada ${sequence.get(stop.saleId) ?? index + 1}: ${stop.deliveryAddress}`}
          />
        ))}
        {plan?.geometry && <AnimatedRoute key={`${plan.id}:${geometryRevision}`} plan={plan} />}
      </MapContainer>
    </div>
  )
}
