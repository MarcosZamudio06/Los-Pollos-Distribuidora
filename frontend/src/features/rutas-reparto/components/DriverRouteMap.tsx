import { useEffect, useMemo } from 'react'
import L from 'leaflet'
import { GeoJSON, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import type { DeliveryOrder, GeoJsonLineString } from '../types'

type RouteMapOrder = Omit<Pick<DeliveryOrder, 'id' | 'latitude' | 'longitude' | 'stopSequence' | 'customerName' | 'deliveryAddress'>, 'id'> & { id?: string }

type Props = {
  compact?: boolean
  currentOrder?: RouteMapOrder
  geometry: GeoJsonLineString
  orders?: RouteMapOrder[]
  routeName: string
}

function markerIcon(label: string, origin = false, current = false) {
  return L.divIcon({
    className: 'driver-route-pin',
    html: `<span style="display:grid;place-items:center;width:34px;height:34px;border:${current ? '4px solid #f0c56a' : '3px solid white'};border-radius:50% 50% 50% 12%;transform:rotate(-45deg);background:${origin ? '#1d2420' : '#b62a22'};color:${origin ? '#f0c56a' : '#fff'};box-shadow:0 8px 22px rgba(29,36,32,.28)"><b style="transform:rotate(45deg);font:800 12px system-ui">${label}</b></span>`,
    iconAnchor: [17, 32],
    iconSize: [34, 34],
  })
}

function isRenderableGeometry(geometry: GeoJsonLineString) {
  return geometry.type === 'LineString'
    && geometry.coordinates.length >= 2
    && geometry.coordinates.every((coordinate) => coordinate.length === 2 && coordinate.every(Number.isFinite))
}

function isSameOrder(order: RouteMapOrder, currentOrder: RouteMapOrder) {
  if (order.id && currentOrder.id) return order.id === currentOrder.id
  return order.latitude === currentOrder.latitude
    && order.longitude === currentOrder.longitude
    && order.stopSequence === currentOrder.stopSequence
}

function FitGeometry({ geometry }: { geometry: GeoJsonLineString }) {
  const map = useMap()
  useEffect(() => {
    const points = geometry.coordinates.map(([longitude, latitude]) => [latitude, longitude] as [number, number])
    if (points.length > 1) map.fitBounds(points, { padding: [36, 36] })
  }, [geometry, map])
  return null
}

export function DriverRouteMap({ compact = false, currentOrder, geometry, orders = [], routeName }: Props) {
  const origin = useMemo(() => {
    const point = geometry.coordinates[0]
    return point ? [point[1], point[0]] as [number, number] : undefined
  }, [geometry])
  const mappedCurrentOrder = currentOrder?.latitude != null && currentOrder.longitude != null ? currentOrder : null
  const mappedOrders = orders.filter((order) => (
    order.latitude != null
    && order.longitude != null
    && (!mappedCurrentOrder || !isSameOrder(order, mappedCurrentOrder))
  ))

  if (!origin || !isRenderableGeometry(geometry)) return null

  return (
    <div className={`${compact ? 'h-64 min-h-[256px]' : 'h-[28rem] min-h-[360px]'} relative z-0 isolate overflow-hidden rounded-[1.4rem] border border-black/10 bg-[#dce5df] shadow-[0_20px_60px_rgba(29,36,32,.16)]`} aria-label={`Mapa de ${routeName}`}>
      <MapContainer center={origin} className="h-full w-full" scrollWheelZoom={!compact} zoom={12}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitGeometry geometry={geometry} />
        <Marker icon={markerIcon('O', true)} position={origin} title="Origen y regreso" />
        {mappedOrders.map((order, index) => (
          <Marker
            icon={markerIcon(String(order.stopSequence ?? index + 1))}
            key={order.id ?? `${order.latitude}-${order.longitude}-${order.stopSequence ?? index}`}
            position={[Number(order.latitude), Number(order.longitude)]}
            title={`Parada ${order.stopSequence ?? index + 1}: ${order.customerName ?? order.deliveryAddress ?? 'Entrega'}`}
          />
        ))}
        {mappedCurrentOrder && (
          <Marker
            icon={markerIcon(String(mappedCurrentOrder.stopSequence ?? 'P'), false, true)}
            position={[Number(mappedCurrentOrder.latitude), Number(mappedCurrentOrder.longitude)]}
            title={`Pedido actual · Parada ${mappedCurrentOrder.stopSequence ?? 'asignada'}`}
          />
        )}
        <GeoJSON data={geometry} style={{ color: '#b62a22', weight: 6, opacity: 0.88 }} />
      </MapContainer>
    </div>
  )
}
