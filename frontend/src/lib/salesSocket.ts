import { io, type Socket } from 'socket.io-client'

export const SALE_CREATED_EVENT = 'sale.created' as const

export type SaleOrderItem = {
  id: string
  productId: string
  productName: string
  unit: 'KG' | 'PIECE' | 'KG_AND_PIECE'
  quantityKg: string | null
  quantityPieces: number | null
}

export type SaleOrder = {
  id: string
  saleNumber: string
  createdAt: string
  location: { id: string; name: string }
  customer: { id: string; name: string } | null
  items: SaleOrderItem[]
  total: string
  status: 'CONFIRMED'
}

type SalesServerEvents = {
  [SALE_CREATED_EVENT]: (order: SaleOrder) => void
}

type SalesSocket = Socket<SalesServerEvents>

type SalesSocketHandlers = {
  onConnected: () => void
  onConnectionError: () => void
  onDisconnected: () => void
  onOrderCreated: (order: SaleOrder) => void
  onReconnecting: () => void
}

function getSocketOrigin() {
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? '/api').trim()
  if (!/^https?:\/\//i.test(apiBaseUrl)) return undefined
  return new URL(apiBaseUrl).origin
}

export function getSalesSocketUrl() {
  const origin = getSocketOrigin()
  return origin ? `${origin}/sales` : '/sales'
}

class SalesSocketClient {
  private socket: SalesSocket | null = null
  private locationId: string | null = null
  private token: string | null = null

  subscribe(token: string, locationId: string, handlers: SalesSocketHandlers) {
    const shouldReconnect = this.locationId !== locationId || this.token !== token
    const socket = this.getSocket()

    if (shouldReconnect) {
      socket.disconnect()
      this.locationId = locationId
      this.token = token
      socket.auth = { locationId, token }
    }

    socket.on(SALE_CREATED_EVENT, handlers.onOrderCreated)
    socket.on('connect', handlers.onConnected)
    socket.on('connect_error', handlers.onConnectionError)
    socket.on('disconnect', handlers.onDisconnected)
    socket.io.on('reconnect_attempt', handlers.onReconnecting)

    if (!socket.connected) socket.connect()

    return () => {
      socket.off(SALE_CREATED_EVENT, handlers.onOrderCreated)
      socket.off('connect', handlers.onConnected)
      socket.off('connect_error', handlers.onConnectionError)
      socket.off('disconnect', handlers.onDisconnected)
      socket.io.off('reconnect_attempt', handlers.onReconnecting)
      socket.disconnect()
    }
  }

  private getSocket(): SalesSocket {
    if (this.socket) return this.socket

    this.socket = io(getSalesSocketUrl(), {
      autoConnect: false,
      path: '/api/socket.io',
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      transports: ['websocket', 'polling'],
    })
    return this.socket
  }
}

export const salesSocket = new SalesSocketClient()
