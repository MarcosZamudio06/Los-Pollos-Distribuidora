import { useState, type FormEvent } from 'react'
import { useCreateDeliveryEvidence } from '../hooks'
import { evidenceTypeLabel } from '../labels'
import type { DeliveryOrder, EvidenceType } from '../types'
import { Field, PrimaryButton, SecondaryButton, SelectInput, StatusMessage, TextInput } from './RouteUi'

const evidenceTypes: EvidenceType[] = ['PHOTO', 'SIGNATURE', 'GEOLOCATION', 'NOTE']

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

export function DeliveryEvidenceCapture({ onClose, order, routeId }: Props) {
  const [type, setType] = useState<EvidenceType>('PHOTO')
  const [value, setValue] = useState('')
  const [capturedAt, setCapturedAt] = useState(nowForInput())
  const createEvidence = useCreateDeliveryEvidence(routeId)
  const canSubmit = Boolean(value.trim() && capturedAt)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    await createEvidence.mutateAsync({
      orderId: order.id,
      payload: {
        capturedAt: toIsoDateTime(capturedAt),
        type,
        value: value.trim(),
      },
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#1d2420]/55 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="evidence-title">
      <form className="w-full max-w-2xl border border-[#1d2420]/15 bg-white p-6 shadow-[0_30px_90px_rgba(29,36,32,0.30)]" onSubmit={(event) => void handleSubmit(event)}>
        <div className="flex items-start justify-between gap-4 border-b border-[#1d2420]/10 pb-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2f6f73]">Evidencia</p>
            <h2 className="mt-1 text-3xl font-black tracking-[-0.05em]" id="evidence-title">Capturar evidencia</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f786f]">Venta {order.saleNumber ?? order.saleId ?? order.id}. La combinación obligatoria queda pendiente de negocio; aquí se registra una evidencia permitida.</p>
          </div>
          <SecondaryButton onClick={onClose}>Cerrar</SecondaryButton>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Tipo de evidencia">
            <SelectInput onChange={(event) => setType(event.target.value)} value={type}>
              {evidenceTypes.map((item) => <option key={item} value={item}>{evidenceTypeLabel(item)}</option>)}
            </SelectInput>
          </Field>
          <Field label="Fecha y hora de captura">
            <TextInput onChange={(event) => setCapturedAt(event.target.value)} required type="datetime-local" value={capturedAt} />
          </Field>
          <Field label="Referencia o valor" hint="Puede ser una referencia interna, URL, firma textual, coordenada o nota según el tipo.">
            <TextInput onChange={(event) => setValue(event.target.value)} placeholder="Referencia de evidencia" required value={value} />
          </Field>
        </div>

        {createEvidence.error && <div className="mt-4"><StatusMessage tone="error">No se pudo guardar la evidencia. Revisa permisos, ruta asignada y datos capturados.</StatusMessage></div>}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton disabled={!canSubmit || createEvidence.isPending} type="submit">{createEvidence.isPending ? 'Guardando...' : 'Guardar evidencia'}</PrimaryButton>
        </div>
      </form>
    </div>
  )
}
