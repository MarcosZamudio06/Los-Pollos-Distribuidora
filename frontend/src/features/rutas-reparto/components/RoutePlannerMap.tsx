import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { DeliveryRoutePlan, PlannerLocation, RoutePlanStopInput } from '../types'
import { animateRoutePath, cancelRouteAnimations, routeGeometryRevision, routeLengthMeters, sampleDirectionMarkers } from './routeGeometry'
import { RouteStopInfoMarker, type RouteStopDisplay } from './RouteStopInfoMarker'
import { selectedRouteSegment } from './routeStopMetrics'

type Props = {
  activeSaleId?: string
  origin?: PlannerLocation
  plan?: DeliveryRoutePlan | null
  stops: RouteStopDisplay[]
  onMoveStop: (saleId: string, latitude: number, longitude: number) => void
  onSelectStop: (saleId: string) => void
}

const fallbackCenter: [number, number] = [19.1738, -96.1342]

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
  const [showStopInfo, setShowStopInfo] = useState(true)
  const originPoint = useMemo(() => origin?.latitude != null && origin?.longitude != null ? [Number(origin.latitude), Number(origin.longitude)] as [number, number] : undefined, [origin])
  const points = useMemo(() => [originPoint, ...stops.filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)).map((stop) => [stop.latitude, stop.longitude] as [number, number])].filter(Boolean) as [number, number][], [originPoint, stops])
  const geometryRevision = plan?.geometry ? routeGeometryRevision(plan.geometry) : undefined
  const selectedSegment = useMemo(() => plan && activeSaleId ? selectedRouteSegment(plan, activeSaleId, originPoint) : null, [activeSaleId, originPoint, plan])
  const plannedBySale = useMemo(() => new Map((plan?.orderedStops ?? []).map((stop) => [stop.saleId, stop])), [plan])
  const cumulativeBySale = useMemo(() => {
    const ordered = [...(plan?.orderedStops ?? [])].sort((a, b) => a.sequence - b.sequence)
    return new Map(ordered.map((stop, index) => [stop.saleId, ordered.slice(0, index + 1).reduce((total, item) => ({ distance: total.distance + item.legDistanceMeters, duration: total.duration + item.legDurationSeconds }), { distance: 0, duration: 0 })]))
  }, [plan])
  const visualOffsets = useMemo(() => stops.map((stop, index) => {
    const nearbyBefore = stops.slice(0, index).filter((candidate) => Math.abs(candidate.latitude - stop.latitude) < 0.00018 && Math.abs(candidate.longitude - stop.longitude) < 0.00018).length
    if (!nearbyBefore) return { x: 0, y: 0 }
    const angle = nearbyBefore * 2.4
    return { x: Math.round(Math.cos(angle) * 22), y: Math.round(Math.sin(angle) * 18) }
  }), [stops])

  const originStop: RoutePlanStopInput = { saleId: 'route-origin', deliveryAddress: origin?.address ?? origin?.name ?? 'Origen', latitude: originPoint?.[0] ?? 0, longitude: originPoint?.[1] ?? 0 }

  return (
    <div className="route-planner-map relative z-0 isolate h-[34rem] min-h-[420px] overflow-hidden rounded-[1.4rem] border border-black/10 bg-[#dce5df] shadow-[0_20px_60px_rgba(29,36,32,.16)]" aria-label="Mapa para planificar la ruta">
      <button aria-pressed={showStopInfo} className="absolute right-4 top-4 z-[500] rounded-xl border border-white/70 bg-white/95 px-3 py-2 text-xs font-black text-[var(--erp-foreground)] shadow-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]" onClick={() => setShowStopInfo((current) => !current)} type="button">
        {showStopInfo ? 'Ocultar tiempos' : 'Mostrar tiempos'}
      </button>
      <MapContainer center={originPoint ?? fallbackCenter} className="h-full w-full" scrollWheelZoom zoom={12}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClick activeSaleId={activeSaleId} onMoveStop={onMoveStop} />
        <FitRoute points={points} />
        {plan?.geometry && <AnimatedRoute key={`${plan.id}:${geometryRevision}`} plan={plan} />}
        {selectedSegment && <GeoJSON data={selectedSegment} interactive={false} style={{ color: '#176b45', weight: 9, opacity: 0.95 }} />}
        {originPoint && <RouteStopInfoMarker index={0} isOrigin latitude={originPoint[0]} longitude={originPoint[1]} stop={originStop} />}
        {stops.map((stop, index) => {
          const planned = plannedBySale.get(stop.saleId)
          const cumulative = cumulativeBySale.get(stop.saleId)
          const displayIndex = planned?.sequence ?? index + 1
          return <RouteStopInfoMarker cumulativeDistanceMeters={cumulative?.distance} cumulativeDurationSeconds={cumulative?.duration} distanceMeters={planned?.legDistanceMeters} durationSeconds={planned?.legDurationSeconds} index={displayIndex} isDestination={displayIndex === plan?.orderedStops.length} isSelected={activeSaleId === stop.saleId} key={stop.saleId} latitude={stop.latitude} longitude={stop.longitude} onMove={(lat, lon) => onMoveStop(stop.saleId, lat, lon)} onSelect={() => onSelectStop(stop.saleId)} showInfo={showStopInfo} stop={stop} visualOffset={visualOffsets[index]} />
        })}
      </MapContainer>
      <style>{`.route-stop-info-icon{background:transparent!important;border:0!important}.route-stop-info{display:flex;flex-direction:column;align-items:center;gap:5px;width:max-content;min-width:56px}.route-stop-card{position:relative;display:grid;min-width:76px;padding:7px 10px 8px;border-radius:11px;background:var(--route-stop-tone);color:#fff;text-align:center;font:700 12px/1.15 ui-sans-serif,system-ui;box-shadow:0 7px 18px rgba(15,23,42,.24);transition:transform .15s ease}.route-stop-card__duration{font-size:15px}.route-stop-card i{position:absolute;bottom:-6px;left:50%;width:12px;height:12px;background:var(--route-stop-tone);transform:translateX(-50%) rotate(45deg)}.route-stop-dot{display:grid;width:34px;height:34px;place-items:center;border:3px solid #fff;border-radius:999px;background:var(--route-stop-tone);color:#fff;font:900 13px ui-sans-serif,system-ui;box-shadow:0 5px 14px rgba(15,23,42,.25)}.route-stop-info.is-selected .route-stop-dot{outline:4px solid rgba(255,255,255,.72);transform:scale(1.08)}.route-stop-card__details{position:absolute;left:50%;bottom:calc(100% + 8px);display:none;width:190px;transform:translateX(-50%);gap:3px;padding:10px;border-radius:10px;background:#17211d;color:#fff;text-align:left;font-size:11px;box-shadow:0 10px 26px rgba(15,23,42,.3)}.route-stop-card__details span,.route-stop-card__details strong{display:block}.route-stop-card:hover .route-stop-card__details,.route-stop-card:focus-within .route-stop-card__details,.route-stop-info.is-selected .route-stop-card__details,.leaflet-marker-icon:focus .route-stop-card__details{display:grid}.leaflet-marker-icon:focus{outline:3px solid #2563a8;outline-offset:3px;border-radius:12px}@media(max-width:640px){.route-stop-card{min-width:68px;padding:6px 8px;font-size:11px}.route-stop-card__duration{font-size:13px}.route-stop-card__details{width:160px}}@media(prefers-reduced-motion:reduce){.route-stop-card,.route-stop-dot{transition:none!important}}`}</style>
    </div>
  )
}
