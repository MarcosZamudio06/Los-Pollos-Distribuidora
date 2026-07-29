import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Boxes, CircleAlert, CircleCheck, Maximize2, Minimize2, Store } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, Select } from '@/components/ui'
import { useQueryClient } from '@tanstack/react-query'
import { salesSocket, type SaleOrder } from '@/lib/salesSocket'
import { useAuth } from '../auth'
import { usePurchaseLocations } from '../compras/hooks'
import { money } from '../ventas/saleLabels'
import { useBranchOrders } from './hooks'
import { mergeOrders } from './orderUtils'
import type { BranchOrderFilters } from './ordersService'

type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting'

const connectionCopy: Record<ConnectionStatus, { label: string; tone: 'green' | 'red' | 'amber' }> = {
  connected: { label: 'Conectado', tone: 'green' },
  disconnected: { label: 'Desconectado', tone: 'red' },
  reconnecting: { label: 'Reconectando', tone: 'amber' },
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function todayRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { dateFrom: start.toISOString(), dateTo: end.toISOString() }
}

function formatQuantity(item: SaleOrder['items'][number]) {
  const values: string[] = []
  if (item.quantityKg && Number(item.quantityKg) > 0) values.push(`${item.quantityKg} kg`)
  if (item.quantityPieces && item.quantityPieces > 0) values.push(`${item.quantityPieces} pza`)
  return values.join(' + ') || 'Sin cantidad'
}

function OrderCard({ order, isLatest }: { order: SaleOrder; isLatest: boolean }) {
  return (
    <article className={`group relative w-full overflow-hidden rounded-[1.35rem] border ${isLatest ? 'border-[rgba(47,111,115,0.24)] bg-[var(--erp-surface-elevated)] shadow-[var(--erp-shadow-elevated)]' : 'border-[color:var(--erp-border)] bg-white shadow-sm'}`}>
      <div className="absolute inset-y-0 left-0 w-1 bg-[var(--erp-brand-gold)]" />
      {isLatest && <div className="flex items-center justify-between gap-3 border-b border-[color:var(--erp-border)] bg-[rgba(47,111,115,0.05)] px-5 py-2 md:px-7"><span className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-info)]">Última venta</span><Badge className="gap-1.5 px-2.5 py-1 font-black" tone="green"><CircleCheck className="h-3.5 w-3.5" />Confirmada</Badge></div>}
      <div className="grid gap-4 p-4 pl-5 md:grid-cols-2 md:gap-4 md:p-6 md:pl-7 lg:grid-cols-[minmax(14rem,0.85fr)_minmax(0,2.3fr)_minmax(11rem,0.75fr)] lg:gap-5 lg:pl-7">
        <section aria-label="Venta y cliente" className="min-w-0 md:order-1 md:border-r md:border-[color:var(--erp-border)] md:pr-5 lg:order-none lg:pr-6">
          <div className="min-w-0">
            <p className="font-mono text-2xl font-black tabular-nums tracking-[-0.05em] text-[var(--erp-foreground)]">{order.saleNumber}</p>
            <p className="mt-2 text-base font-bold text-[var(--erp-muted-foreground)]">{order.customer?.name ?? 'Público general'}</p>
            {!isLatest && <Badge className="mt-3 gap-1.5 font-black" tone="green"><CircleCheck className="h-3.5 w-3.5" />Confirmada</Badge>}
          </div>
        </section>

        <section aria-label="Productos del pedido" className="min-w-0 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 md:order-3 md:col-span-2 lg:order-none lg:col-span-1">
          <ul className="grid gap-2">
            {order.items.map((item) => (
              <li className="flex items-baseline justify-between gap-3 border-b border-[color:var(--erp-border)] pb-2 text-sm last:border-0 last:pb-0 md:text-base" key={item.id}>
                <span className="min-w-0 font-bold text-[var(--erp-foreground)]">{item.productName}</span>
                <span className="shrink-0 text-right font-mono font-black tabular-nums text-[var(--erp-info)]">{formatQuantity(item)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Resumen del pedido" className="flex items-end justify-between gap-4 rounded-xl border border-[rgba(47,111,115,0.18)] bg-[var(--erp-surface-muted)] p-3.5 md:order-2 md:row-start-1 md:text-right lg:order-none lg:row-auto lg:flex lg:h-full lg:flex-col lg:items-stretch lg:justify-between lg:gap-6">
          <div>
            <span className="block text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Hora</span>
            <time className="mt-1 block text-lg font-black tabular-nums text-[var(--erp-foreground)]">{formatTime(order.createdAt)}</time>
          </div>
          <div className="text-right">
            <span className="block text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Total</span>
            <span className="mt-1 block text-3xl font-black tracking-[-0.06em] tabular-nums text-[var(--erp-foreground)]">{money(order.total)}</span>
          </div>
        </section>
      </div>
    </article>
  )
}

export function PedidosPage() {
  const { accessToken, user } = useAuth()
  const queryClient = useQueryClient()
  const pageRef = useRef<HTMLElement | null>(null)
  const locations = usePurchaseLocations('')
  const [selectedLocationId, setSelectedLocationId] = useState(user?.role === 'ADMIN' ? '' : user?.operationalLocationId ?? '')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [dayRange, setDayRange] = useState(todayRange)

  const activeLocationId = user?.role === 'ADMIN' ? selectedLocationId : user?.operationalLocationId ?? ''
  const activeFilters = useMemo<BranchOrderFilters | null>(
    () => activeLocationId ? { ...dayRange, limit: 2, locationId: activeLocationId } : null,
    [activeLocationId, dayRange],
  )
  const ordersQuery = useBranchOrders(activeFilters)
  const orders = ordersQuery.data?.items ?? []

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === pageRef.current)
    document.addEventListener('fullscreenchange', updateFullscreen)
    return () => document.removeEventListener('fullscreenchange', updateFullscreen)
  }, [])

  useEffect(() => {
    const now = new Date()
    const nextDay = new Date(now)
    nextDay.setHours(24, 0, 0, 0)
    const timeout = window.setTimeout(() => setDayRange(todayRange()), nextDay.getTime() - now.getTime())
    return () => window.clearTimeout(timeout)
  }, [dayRange])

  useEffect(() => {
    if (!accessToken || !activeLocationId) return

    return salesSocket.subscribe(accessToken, activeLocationId, {
      onConnected: () => {
        setConnectionStatus('connected')
        void queryClient.invalidateQueries({ queryKey: ['branch-orders', activeFilters] })
      },
      onConnectionError: () => setConnectionStatus('disconnected'),
      onDisconnected: () => setConnectionStatus('disconnected'),
      onOrderCreated: (order) => {
        if (order.location.id !== activeLocationId) return
        queryClient.setQueryData<{ items: SaleOrder[] }>(['branch-orders', activeFilters], (current) => ({
          items: mergeOrders(current?.items ?? [], [order]),
        }))
      },
      onReconnecting: () => setConnectionStatus('reconnecting'),
    })
  }, [accessToken, activeFilters, activeLocationId, queryClient])

  const status = connectionCopy[connectionStatus]
  const canShowOrders = Boolean(activeLocationId)
  const selectedLocation = locations.data?.find((location) => location.id === activeLocationId)

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await pageRef.current?.requestFullscreen()
  }

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-3 py-4 text-[var(--erp-foreground)] sm:px-4 lg:px-6" ref={pageRef}>
      <section className="mx-auto grid max-w-[96rem] gap-3">
        <header className="relative overflow-hidden rounded-[2rem] border border-[color:var(--erp-border)] bg-white p-4 shadow-[var(--erp-shadow-elevated)] sm:p-5">
          <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(47,111,115,0.18)] bg-[rgba(47,111,115,0.08)] px-2.5 py-0.5 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><Activity className="h-4 w-4" /> Operación en vivo</div>
              <div className="mt-2 flex flex-col gap-1.5 lg:flex-row lg:items-baseline lg:gap-4">
                <h1 className="shrink-0 text-3xl font-black tracking-[-0.06em] sm:text-4xl">Pedidos de sucursal</h1>
                <p className="max-w-2xl text-sm leading-5 text-[var(--erp-muted-foreground)]">Las ventas confirmadas aparecen al instante durante el intervalo. Cada 10 minutos, REST limpia la bandeja y conserva las dos más recientes.</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 lg:pl-2">
              <Badge aria-live="polite" className="w-fit gap-1.5 whitespace-nowrap font-black" tone={status.tone}>{connectionStatus === 'connected' ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}{status.label}</Badge>
              <Button aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'} className="size-10 p-0" onClick={() => void toggleFullscreen()} size="sm" variant="outline">{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button>
            </div>
          </div>
        </header>

        <Card className="rounded-xl p-3.5 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <CardHeader className="min-w-0 flex-1 gap-1">
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]"><Store className="h-4 w-4" /> Sucursal operativa</div>
              <CardDescription className="leading-5">Las ventas nuevas se acumulan hasta la siguiente limpieza programada de la sucursal activa.</CardDescription>
            </CardHeader>
            <CardContent className="w-full lg:w-80 lg:shrink-0">
              <label className="grid gap-1.5 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">Ubicación
              <Select disabled={user?.role !== 'ADMIN' || locations.isLoading} onChange={(event) => setSelectedLocationId(event.target.value)} value={activeLocationId}>
                {user?.role === 'ADMIN' && <option value="">Selecciona una sucursal</option>}
                {user?.role === 'ADMIN' ? (locations.data ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>) : <option value={activeLocationId}>{selectedLocation?.name ?? user?.operationalLocationId ?? 'Sin ubicación asignada'}</option>}
              </Select>
              </label>
            </CardContent>
          </div>
        </Card>

        {!canShowOrders && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-5 text-sm font-bold text-[var(--erp-danger)]">Selecciona una sucursal para consultar pedidos.</p>}
        {canShowOrders && ordersQuery.isLoading && <p className="rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-5 text-sm font-bold text-[var(--erp-info)]">Cargando pedidos de la sucursal...</p>}
        {canShowOrders && ordersQuery.error && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-5 text-sm font-bold text-[var(--erp-danger)]">No se pudieron cargar los pedidos de esta sucursal.</p>}

        {canShowOrders && !ordersQuery.isLoading && !ordersQuery.error && (
          <section aria-label="Ventas recientes del día" className="grid gap-4">
            {orders.map((order, index) => <OrderCard key={order.id} isLatest={index === 0} order={order} />)}
            {orders.length === 0 && <div className="grid min-h-64 place-items-center rounded-[1.5rem] border border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-8 text-center"><div><Boxes className="mx-auto h-8 w-8 text-[var(--erp-brand-gold-deep)]" /><p className="mt-4 font-black">No hay ventas confirmadas hoy</p><p className="mt-2 max-w-md text-sm text-[var(--erp-muted-foreground)]">Las nuevas ventas de esta sucursal aparecerán aquí automáticamente.</p></div></div>}
          </section>
        )}
      </section>
    </main>
  )
}
