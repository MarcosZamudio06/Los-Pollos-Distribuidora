import { useMemo, useState, type FormEvent } from 'react'
import { useCreateDeliveryRoute } from '../hooks'
import type { CreateDeliveryRouteOrderPayload } from '../types'
import { Field, PrimaryButton, SecondaryButton, StatusMessage, TextInput } from './RouteUi'

type Props = {
  onClose: () => void
  onCreated?: (routeId: string) => void
}

type DraftOrder = CreateDeliveryRouteOrderPayload & { key: string }

function blankOrder(): DraftOrder {
  return { accountReceivableId: '', deliveryAddress: '', key: crypto.randomUUID(), saleId: '' }
}

export function CreateRouteModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [driverId, setDriverId] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [originLocationId, setOriginLocationId] = useState('')
  const [routeStockLocationId, setRouteStockLocationId] = useState('')
  const [orders, setOrders] = useState<DraftOrder[]>([blankOrder()])
  const createRoute = useCreateDeliveryRoute()
  const validOrders = useMemo(
    () => orders.filter((order) => order.saleId.trim() && order.deliveryAddress.trim()),
    [orders],
  )
  const canSubmit = Boolean(name.trim() && driverId.trim() && scheduledDate && validOrders.length > 0)

  function updateOrder(key: string, patch: Partial<DraftOrder>) {
    setOrders((current) => current.map((order) => (order.key === key ? { ...order, ...patch } : order)))
  }

  function removeOrder(key: string) {
    setOrders((current) => (current.length === 1 ? current : current.filter((order) => order.key !== key)))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    const route = await createRoute.mutateAsync({
      driverId: driverId.trim(),
      name: name.trim(),
      orders: validOrders.map((order) => ({
        accountReceivableId: order.accountReceivableId?.trim() || undefined,
        deliveryAddress: order.deliveryAddress.trim(),
        saleId: order.saleId.trim(),
      })),
      originLocationId: originLocationId.trim() || undefined,
      routeStockLocationId: routeStockLocationId.trim() || undefined,
      scheduledDate,
    })
    onCreated?.(route.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1d2420]/55 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="create-route-title">
      <form className="max-h-[92vh] w-full max-w-4xl overflow-y-auto border border-[#1d2420]/15 bg-white p-6 shadow-[0_30px_90px_rgba(29,36,32,0.30)]" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex flex-col gap-3 border-b border-[#1d2420]/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8b2f2a]">Crear ruta</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.05em]" id="create-route-title">Ruta con pedidos confirmados</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6f786f]">La API valida que las ventas estén confirmadas y que no estén canceladas. No se captura liquidación aquí.</p>
          </div>
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Nombre de ruta"><TextInput onChange={(event) => setName(event.target.value)} placeholder="Ruta Centro" required value={name} /></Field>
          <Field label="Repartidor" hint="Usa el identificador del usuario DRIVER asignado."><TextInput onChange={(event) => setDriverId(event.target.value)} placeholder="driverId" required value={driverId} /></Field>
          <Field label="Fecha programada"><TextInput onChange={(event) => setScheduledDate(event.target.value)} required type="date" value={scheduledDate} /></Field>
          <Field label="Ubicación origen" hint="Opcional cuando la operación la define."><TextInput onChange={(event) => setOriginLocationId(event.target.value)} placeholder="originLocationId" value={originLocationId} /></Field>
          <Field label="Ubicación ROUTE_STOCK" hint="Opcional si backend la autogenera."><TextInput onChange={(event) => setRouteStockLocationId(event.target.value)} placeholder="routeStockLocationId" value={routeStockLocationId} /></Field>
        </div>

        <section className="mt-6 border border-[#1d2420]/10 bg-[#f7f5ef] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2f6f73]">Pedidos</p>
              <h3 className="text-xl font-black tracking-[-0.04em]">Asignación inicial</h3>
            </div>
            <SecondaryButton onClick={() => setOrders((current) => [...current, blankOrder()])}>Agregar pedido</SecondaryButton>
          </div>
          <div className="mt-4 grid gap-3">
            {orders.map((order) => (
              <div className="grid gap-3 border border-[#1d2420]/10 bg-white p-3 lg:grid-cols-[1fr_1fr_2fr_auto]" key={order.key}>
                <Field label="Venta confirmada"><TextInput onChange={(event) => updateOrder(order.key, { saleId: event.target.value })} placeholder="saleId" required value={order.saleId} /></Field>
                <Field label="Cuenta por cobrar"><TextInput onChange={(event) => updateOrder(order.key, { accountReceivableId: event.target.value })} placeholder="accountReceivableId" value={order.accountReceivableId} /></Field>
                <Field label="Dirección de entrega"><TextInput onChange={(event) => updateOrder(order.key, { deliveryAddress: event.target.value })} placeholder="Dirección del cliente" required value={order.deliveryAddress} /></Field>
                <div className="flex items-end"><SecondaryButton disabled={orders.length === 1} onClick={() => removeOrder(order.key)}>Quitar</SecondaryButton></div>
              </div>
            ))}
          </div>
        </section>

        {createRoute.error && <div className="mt-4"><StatusMessage tone="error">No se pudo crear la ruta. Revisa permisos, ventas confirmadas y ubicación ROUTE_STOCK.</StatusMessage></div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton disabled={!canSubmit || createRoute.isPending} type="submit">{createRoute.isPending ? 'Creando ruta...' : 'Crear ruta'}</PrimaryButton>
        </div>
      </form>
    </div>
  )
}
