import { useState, type FormEvent } from 'react'
import { useCreateDeliveryIncident } from '../hooks'
import { orderStatusLabel } from '../labels'
import type { DeliveryIncidentReturnedItem, DeliveryOrder, DeliveryOrderStatus, ReturnedItemUnit } from '../types'
import { Field, PrimaryButton, SecondaryButton, SelectInput, StatusMessage, TextInput } from './RouteUi'

type IncidentUiType = 'NOT_DELIVERED' | 'PARTIALLY_REJECTED' | 'RETURNED' | 'OPERATIONAL_INCIDENT'

const incidentOptions: Array<{ description: string; label: string; value: IncidentUiType }> = [
  { description: 'Pedido sin entrega al cliente.', label: 'No entrega', value: 'NOT_DELIVERED' },
  { description: 'Incidencia de ruta registrada como no entregado con nota obligatoria.', label: 'Incidencia operativa', value: 'OPERATIONAL_INCIDENT' },
  { description: 'Cliente rechaza parte del pedido y hay retorno parcial.', label: 'Rechazo parcial', value: 'PARTIALLY_REJECTED' },
  { description: 'La mercancía regresa a inventario por devolución.', label: 'Devolución', value: 'RETURNED' },
]
const units: ReturnedItemUnit[] = ['KG', 'PIECE', 'KG_AND_PIECE']

type DraftReturnedItem = DeliveryIncidentReturnedItem & { key: string; quantityKgText: string; quantityPiecesText: string }

function blankReturnedItem(): DraftReturnedItem {
  return { key: crypto.randomUUID(), productId: '', quantityKgText: '', quantityPiecesText: '', reason: '', unit: 'KG' }
}

type Props = {
  onClose: () => void
  order: DeliveryOrder
  routeId: string
}

export function DeliveryIncidentDialog({ onClose, order, routeId }: Props) {
  const [incidentType, setIncidentType] = useState<IncidentUiType>('NOT_DELIVERED')
  const [reason, setReason] = useState('')
  const [returnedItems, setReturnedItems] = useState<DraftReturnedItem[]>([])
  const createIncident = useCreateDeliveryIncident(routeId)
  const status: DeliveryOrderStatus = incidentType === 'OPERATIONAL_INCIDENT' ? 'NOT_DELIVERED' : incidentType
  const requiresReturnedItems = incidentType === 'PARTIALLY_REJECTED' || incidentType === 'RETURNED'
  const isOperationalIncident = incidentType === 'OPERATIONAL_INCIDENT'
  const normalizedItems = returnedItems
    .filter((item) => item.productId.trim() || item.reason.trim() || item.quantityKgText || item.quantityPiecesText)
    .map((item) => ({
      productId: item.productId.trim(),
      quantityKg: item.quantityKgText ? Number(item.quantityKgText) : undefined,
      quantityPieces: item.quantityPiecesText ? Number(item.quantityPiecesText) : undefined,
      reason: item.reason.trim() || reason.trim(),
      unit: item.unit,
    }))
  const returnedItemsValid = !requiresReturnedItems || normalizedItems.every((item) => item.productId && item.reason && ((item.quantityKg ?? 0) > 0 || (item.quantityPieces ?? 0) > 0))
  const canSubmit = Boolean(reason.trim() && returnedItemsValid)

  function updateItem(key: string, patch: Partial<DraftReturnedItem>) {
    setReturnedItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    await createIncident.mutateAsync({
      orderId: order.id,
      payload: {
        reason: isOperationalIncident ? `Incidencia operativa: ${reason.trim()}` : reason.trim(),
        returnedItems: normalizedItems.length > 0 ? normalizedItems : undefined,
        status,
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1d2420]/55 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="incident-title">
      <form className="max-h-[92vh] w-full max-w-4xl overflow-y-auto border border-[#1d2420]/15 bg-white p-6 shadow-[0_30px_90px_rgba(29,36,32,0.30)]" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex items-start justify-between gap-4 border-b border-[#1d2420]/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#8b2f2a]">Incidencia</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.05em]" id="incident-title">Registrar incidencia o devolución</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f786f]">Venta {order.saleNumber ?? order.saleId ?? order.id}. La incidencia operativa se guarda con un estado final soportado por API y una nota clara.</p>
          </div>
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Tipo de incidencia" hint="La incidencia operativa usa NOT_DELIVERED en API; no se envía estado INCIDENT.">
            <SelectInput onChange={(event) => setIncidentType(event.target.value as IncidentUiType)} value={incidentType}>
              {incidentOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </SelectInput>
          </Field>
          <Field label="Motivo obligatorio">
            <TextInput onChange={(event) => setReason(event.target.value)} required value={reason} />
          </Field>
        </div>

        <div className={`mt-5 border p-4 text-sm ${isOperationalIncident ? 'border-[#8b2f2a]/35 bg-[#8b2f2a]/8 text-[#8b2f2a]' : 'border-[#1d2420]/10 bg-[#f7f5ef] text-[#4f5a52]'}`}>
          <p className="font-black">{incidentOptions.find((item) => item.value === incidentType)?.label}</p>
          <p className="mt-1 leading-6">{incidentOptions.find((item) => item.value === incidentType)?.description}</p>
          {isOperationalIncident && <p className="mt-2 font-semibold">Se enviará status {orderStatusLabel(status)} con la nota prefijada como incidencia operativa.</p>}
        </div>

        <section className="mt-6 border border-[#1d2420]/10 bg-[#f7f5ef] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2f6f73]">Productos devueltos</p>
              <h3 className="text-xl font-black tracking-[-0.04em]">Detalle cuando aplica</h3>
            </div>
            <SecondaryButton onClick={() => setReturnedItems((current) => [...current, blankReturnedItem()])}>Agregar producto</SecondaryButton>
          </div>
          {returnedItems.length === 0 ? (
            <div className="mt-4"><StatusMessage tone={requiresReturnedItems ? 'info' : 'empty'}>{requiresReturnedItems ? 'Agrega productos si la devolución o rechazo afecta inventario.' : isOperationalIncident ? 'La incidencia operativa no requiere productos devueltos; registra el motivo con precisión.' : 'No se requieren productos para una no entrega sin devolución.'}</StatusMessage></div>
          ) : (
            <div className="mt-4 grid gap-3">
              {returnedItems.map((item) => (
                <div className="grid gap-3 border border-[#1d2420]/10 bg-white p-3 lg:grid-cols-[1fr_0.8fr_0.8fr_0.8fr_1fr_auto]" key={item.key}>
                  <Field label="Producto"><TextInput onChange={(event) => updateItem(item.key, { productId: event.target.value })} placeholder="productId" value={item.productId} /></Field>
                  <Field label="Unidad"><SelectInput onChange={(event) => updateItem(item.key, { unit: event.target.value })} value={item.unit}>{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</SelectInput></Field>
                  <Field label="Kilos"><TextInput min="0" onChange={(event) => updateItem(item.key, { quantityKgText: event.target.value })} step="0.001" type="number" value={item.quantityKgText} /></Field>
                  <Field label="Piezas"><TextInput min="0" onChange={(event) => updateItem(item.key, { quantityPiecesText: event.target.value })} step="1" type="number" value={item.quantityPiecesText} /></Field>
                  <Field label="Motivo"><TextInput onChange={(event) => updateItem(item.key, { reason: event.target.value })} value={item.reason} /></Field>
                  <div className="flex items-end"><SecondaryButton onClick={() => setReturnedItems((current) => current.filter((candidate) => candidate.key !== item.key))}>Quitar</SecondaryButton></div>
                </div>
              ))}
            </div>
          )}
        </section>

        {!returnedItemsValid && <div className="mt-4"><StatusMessage tone="error">Para devolución o rechazo parcial, cada producto capturado necesita producto, motivo y cantidad.</StatusMessage></div>}
        {createIncident.error && <div className="mt-4"><StatusMessage tone="error">No se pudo registrar la incidencia. Revisa motivo, productos devueltos y permisos.</StatusMessage></div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton disabled={!canSubmit || createIncident.isPending} type="submit">{createIncident.isPending ? 'Registrando...' : 'Registrar incidencia'}</PrimaryButton>
        </div>
      </form>
    </div>
  )
}
