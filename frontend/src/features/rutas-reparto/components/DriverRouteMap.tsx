import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { GeoJSON, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import type { DeliveryOrder, GeoJsonLineString } from '../types'

type Props = {
  geometry: GeoJsonLineString
  orders: DeliveryOrder[]
  routeName: string
}

function markerIcon(label: string, origin = false) {
  return L.divIcon({
    className: 'driver-route-pin',
    html: `<span style="display:grid;place-items:center;width:34px;height:34px;border:3px solid white;border-radius:50% 50% 50% 12%;transform:rotate(-45deg);background:${origin ? '#1d2420' : '#b62a22'};color:${origin ? '#f0c56a' : '#fff'};box-shadow:0 8px 22px rgba(29,36,32,.28)"><b style="transform:rotate(45deg);font:800 12px system-ui">${label}</b></span>`,
    iconAnchor: [17, 32],
    iconSize: [34, 34],
  })
}

function FitGeometry({ geometry }: { geometry: GeoJsonLineString }) {
  const map = useMap()
  useEffect(() => {
    const points = geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number])
    if (points.length > 1) map.fitBounds(points, { padding: [36, 36] })
  }, [geometry, map])
  return null
}

export function DriverRouteMap({ geometry, orders, routeName }: Props) {
  const origin = useMemo(() => {
    const point = geometry.coordinates[0]
    return point ? [point[1], point[0]] as [number, number] : undefined
  }, [geometry])
  const mappedOrders = orders.filter((order) => order.latitude != null && order.longitude != null)

  if (!origin) return null

  return (
    <div className="h-[28rem] min-h-[360px] overflow-hidden rounded-[1.4rem] border border-black/10 bg-[#dce5df] shadow-[0_20px_60px_rgba(29,36,32,.16)]" aria-label={`Mapa de ${routeName}`}>
      <MapContainer center={origin} className="h-full w-full" scrollWheelZoom zoom={12}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitGeometry geometry={geometry} />
        <Marker icon={markerIcon('O', true)} position={origin} title="Origen y regreso" />
        {mappedOrders.map((order, index) => (
          <Marker
            icon={markerIcon(String(order.stopSequence ?? index + 1))}
            key={order.id}
            position={[Number(order.latitude), Number(order.longitude)]}
            title={`Parada ${order.stopSequence ?? index + 1}: ${order.customerName ?? order.deliveryAddress ?? 'Entrega'}`}
          />
        ))}
        <GeoJSON data={geometry} style={{ color: '#b62a22', weight: 6, opacity: 0.88 }} />
      </MapContainer>
    </div>
  )
}
