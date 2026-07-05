import { useState, type FormEvent } from 'react'
import { useAssignDeliveryRouteOrders } from '../hooks'
import { Field, PrimaryButton, SecondaryButton, StatusMessage, TextInput } from './RouteUi'

type Props = {
  onClose: () => void
  routeId: string
  routeName: string
}

export function AssignOrdersModal({ onClose, routeId, routeName }: Props) {
  const [saleId, setSaleId] = useState('')
  const [accountReceivableId, setAccountReceivableId] = useState('')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const assignOrders = useAssignDeliveryRouteOrders(routeId)
  const canSubmit = Boolean(routeId && saleId.trim() && deliveryAddress.trim())

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    await assignOrders.mutateAsync({
      orders: [{ accountReceivableId: accountReceivableId.trim() || undefined, deliveryAddress: deliveryAddress.trim(), saleId: saleId.trim() }],
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1d2420]/55 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="assign-orders-title">
      <form className="w-full max-w-2xl border border-[#1d2420]/15 bg-white p-6 shadow-[0_30px_90px_rgba(29,36,32,0.30)]" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex items-start justify-between gap-4 border-b border-[#1d2420]/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8b2f2a]">Asignar pedidos</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.05em]" id="assign-orders-title">Pedido confirmado a ruta existente</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f786f]">Ruta: <strong>{routeName}</strong>. Backend rechaza ventas canceladas, duplicadas, rutas cerradas o rutas con liquidación abierta.</p>
          </div>
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Venta confirmada"><TextInput onChange={(event) => setSaleId(event.target.value)} placeholder="saleId" required value={saleId} /></Field>
          <Field label="Cuenta por cobrar"><TextInput onChange={(event) => setAccountReceivableId(event.target.value)} placeholder="accountReceivableId" value={accountReceivableId} /></Field>
          <Field label="Dirección de entrega"><TextInput onChange={(event) => setDeliveryAddress(event.target.value)} required value={deliveryAddress} /></Field>
        </div>
        {assignOrders.error && <div className="mt-4"><StatusMessage tone="error">No se pudo asignar el pedido. Confirma venta, ruta sin liquidación y permisos ADMIN.</StatusMessage></div>}
        <div className="mt-6 flex justify-end gap-3">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton disabled={!canSubmit || assignOrders.isPending} type="submit">{assignOrders.isPending ? 'Asignando...' : 'Asignar pedido'}</PrimaryButton>
        </div>
      </form>
    </div>
  )
}
