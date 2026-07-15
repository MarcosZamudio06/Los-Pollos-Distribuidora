import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { GeoJSON, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { DeliveryRoutePlan, PlannerLocation, RoutePlanStopInput } from '../types'

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

export function RoutePlannerMap({ activeSaleId, origin, plan, stops, onMoveStop, onSelectStop }: Props) {
  const originPoint = useMemo(() => origin?.latitude != null && origin?.longitude != null ? [Number(origin.latitude), Number(origin.longitude)] as [number, number] : undefined, [origin])
  const sequence = useMemo(() => new Map((plan?.orderedStops ?? []).map((stop) => [stop.saleId, stop.sequence])), [plan])
  const points = useMemo(() => [originPoint, ...stops.filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)).map((stop) => [stop.latitude, stop.longitude] as [number, number])].filter(Boolean) as [number, number][], [originPoint, stops])

  return (
    <div className="h-[34rem] min-h-[420px] overflow-hidden rounded-[1.4rem] border border-black/10 bg-[#dce5df] shadow-[0_20px_60px_rgba(29,36,32,.16)]" aria-label="Mapa para planificar la ruta">
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
        {plan?.geometry && <GeoJSON data={plan.geometry} key={plan.id} style={{ color: '#b62a22', weight: 6, opacity: 0.88 }} />}
      </MapContainer>
    </div>
  )
}
