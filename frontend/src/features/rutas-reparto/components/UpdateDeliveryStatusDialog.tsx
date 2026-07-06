import { useState, type FormEvent } from 'react'
import { useUpdateDeliveryOrderStatus } from '../hooks'
import { orderStatusLabel } from '../labels'
import type { DeliveryOrder, DeliveryOrderStatus } from '../types'
import { Field, PrimaryButton, SecondaryButton, SelectInput, StatusMessage, TextInput } from './RouteUi'

const statuses: DeliveryOrderStatus[] = ['PENDING', 'IN_ROUTE', 'DELIVERED', 'NOT_DELIVERED', 'CANCELLED', 'PARTIALLY_REJECTED', 'RETURNED']
const noteRequiredStatuses = new Set(['NOT_DELIVERED', 'PARTIALLY_REJECTED', 'RETURNED'])

function nowForInput() {
  return new Date().toISOString().slice(0, 16)
}

function toIsoDateTime(value: string) {
  return new Date(value).toISOString()
}

type Props = {
  onClose: () => void
  order: DeliveryOrder
  routeId: string
}

export function UpdateDeliveryStatusDialog({ onClose, order, routeId }: Props) {
  const [status, setStatus] = useState<DeliveryOrderStatus>(order.status === 'PENDING' ? 'IN_ROUTE' : order.status)
  const [notes, setNotes] = useState(order.notes ?? '')
  const [deliveredAt, setDeliveredAt] = useState(nowForInput())
  const updateStatus = useUpdateDeliveryOrderStatus(routeId)
  const requiresNote = noteRequiredStatuses.has(status)
  const canSubmit = Boolean(status && (!requiresNote || notes.trim()) && (status !== 'DELIVERED' || deliveredAt))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    await updateStatus.mutateAsync({
      orderId: order.id,
      payload: {
        deliveredAt: status === 'DELIVERED' ? toIsoDateTime(deliveredAt) : undefined,
        notes: notes.trim() || undefined,
        status,
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1d2420]/55 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="status-title">
      <form className="w-full max-w-2xl border border-[#1d2420]/15 bg-white p-6 shadow-[0_30px_90px_rgba(29,36,32,0.30)]" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex items-start justify-between gap-4 border-b border-[#1d2420]/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8b2f2a]">Estado de pedido</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.05em]" id="status-title">Actualizar entrega</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f786f]">El backend valida que el pedido pertenezca a tu ruta. Para entrega se manda fecha y hora.</p>
          </div>
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Nuevo estado">
            <SelectInput onChange={(event) => setStatus(event.target.value)} value={status}>
              {statuses.map((item) => <option key={item} value={item}>{orderStatusLabel(item)}</option>)}
            </SelectInput>
          </Field>
          {status === 'DELIVERED' && (
            <Field label="Fecha y hora de entrega">
              <TextInput onChange={(event) => setDeliveredAt(event.target.value)} required type="datetime-local" value={deliveredAt} />
            </Field>
          )}
          <Field label={requiresNote ? 'Motivo o nota obligatoria' : 'Notas'} hint={requiresNote ? 'Requerido para no entrega, rechazo parcial o devolución.' : 'Opcional.'}>
            <TextInput onChange={(event) => setNotes(event.target.value)} required={requiresNote} value={notes} />
          </Field>
        </div>

        {updateStatus.error && <div className="mt-4"><StatusMessage tone="error">No se pudo actualizar el pedido. Revisa transición, permisos y motivo cuando aplique.</StatusMessage></div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton disabled={!canSubmit || updateStatus.isPending} type="submit">{updateStatus.isPending ? 'Actualizando...' : 'Actualizar estado'}</PrimaryButton>
        </div>
      </form>
    </div>
  )
}
