import { useState, type FormEvent } from 'react'
import { AsyncState } from './AsyncState'
import { useCancelInventoryTransfer, useConfirmInventoryTransfer, useCreateInventoryTransfer, useInventoryTransferDetail, useInventoryTransfers } from '../hooks/useProducts'
import type { InventoryTransfer, InventoryTransferValues } from '../types'

type InventoryTransferViewProps = {
  canManage: boolean
}

const emptyTransfer: InventoryTransferValues = { originLocationId: '', destinationLocationId: '', notes: '', items: [{ productId: '', unit: 'KG', quantityKg: 0, quantityPieces: 0 }] }

function canConfirmTransfer(transfer: InventoryTransfer) {
  return !['CONFIRMED', 'CANCELLED'].includes(transfer.status)
}

function canCancelTransfer(transfer: InventoryTransfer) {
  return transfer.status !== 'CONFIRMED' && transfer.status !== 'CANCELLED'
}

export function InventoryTransferView({ canManage }: InventoryTransferViewProps) {
  const [selectedId, setSelectedId] = useState<string>()
  const [values, setValues] = useState<InventoryTransferValues>(emptyTransfer)
  const [error, setError] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const transfers = useInventoryTransfers()
  const detail = useInventoryTransferDetail(selectedId)
  const createTransfer = useCreateInventoryTransfer()
  const confirmTransfer = useConfirmInventoryTransfer()
  const cancelTransfer = useCancelInventoryTransfer()

  function validate() {
    if (!values.originLocationId || !values.destinationLocationId) return 'El origen y el destino son obligatorios.'
    if (values.originLocationId === values.destinationLocationId) return 'El origen y el destino no pueden ser iguales.'
    if (values.items.length === 0 || values.items.some((item) => !item.productId)) return 'Se requiere al menos un producto.'
    if (values.items.some((item) => (item.quantityKg ?? 0) <= 0 && (item.quantityPieces ?? 0) <= 0)) return 'Las cantidades deben ser mayores que cero.'
    if (values.items.some((item) => item.quantityPieces !== undefined && !Number.isInteger(item.quantityPieces))) return 'Las piezas deben ser números enteros.'
    return null
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) return setError(validationError)
    try {
      await createTransfer.mutateAsync(values)
      setValues(emptyTransfer)
      setError(null)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No se pudo crear el traspaso.')
    }
  }

  async function handleCancel(id: string) {
    const reason = cancelReason.trim()
    if (!reason) {
      setError('El motivo de cancelación es obligatorio.')
      return
    }
    await cancelTransfer.mutateAsync({ id, reason })
    setCancelReason('')
    setError(null)
  }

  return (
    <section className="grid gap-4">
      <h2 className="text-2xl font-black tracking-[-0.04em]">Traspasos de inventario</h2>
      {canManage && (
        <form onSubmit={submitTransfer} className="grid gap-4 rounded-3xl bg-white p-5">
          {error && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
          <div className="grid gap-3 md:grid-cols-3"><input className="rounded-xl border p-3" placeholder="ID de ubicación origen" value={values.originLocationId} onChange={(event) => setValues({ ...values, originLocationId: event.target.value })} /><input className="rounded-xl border p-3" placeholder="ID de ubicación destino" value={values.destinationLocationId} onChange={(event) => setValues({ ...values, destinationLocationId: event.target.value })} /><input className="rounded-xl border p-3" placeholder="Notas" value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} /></div>
          {values.items.map((item, index) => <div key={index} className="grid gap-3 rounded-2xl bg-[#f5f3ee] p-3 md:grid-cols-4"><input className="rounded-xl border p-3" placeholder="ID del producto" value={item.productId} onChange={(event) => setValues({ ...values, items: values.items.map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value } : line) })} /><select className="rounded-xl border p-3" value={item.unit} onChange={(event) => setValues({ ...values, items: values.items.map((line, lineIndex) => lineIndex === index ? { ...line, unit: event.target.value as typeof item.unit } : line) })}><option value="KG">Kilo</option><option value="PIECE">Pieza</option><option value="KG_AND_PIECE">Kilo y pieza</option></select><input className="rounded-xl border p-3" min="0" step="0.001" type="number" placeholder="Kg" value={item.quantityKg ?? 0} onChange={(event) => setValues({ ...values, items: values.items.map((line, lineIndex) => lineIndex === index ? { ...line, quantityKg: Number(event.target.value) } : line) })} /><input className="rounded-xl border p-3" min="0" step="1" type="number" placeholder="Piezas" value={item.quantityPieces ?? 0} onChange={(event) => setValues({ ...values, items: values.items.map((line, lineIndex) => lineIndex === index ? { ...line, quantityPieces: Number(event.target.value) } : line) })} /></div>)}
          <button disabled={createTransfer.isPending} className="rounded-2xl bg-[#20211f] px-5 py-3 font-black text-white disabled:opacity-60">Crear traspaso</button>
        </form>
      )}
      <AsyncState empty={!transfers.data?.length} emptyMessage="No se han registrado traspasos." error={transfers.error} isLoading={transfers.isLoading}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
          <div className="overflow-x-auto rounded-3xl border bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-[#f5f3ee] text-xs uppercase tracking-[0.16em]"><tr><th className="p-4">Origen</th><th className="p-4">Destino</th><th className="p-4">Estado</th><th className="p-4">Responsable</th><th className="p-4">Acciones</th></tr></thead><tbody>{transfers.data?.map((transfer) => <tr key={transfer.id} className="border-t"><td className="p-4">{transfer.originLocationName ?? transfer.originLocationId ?? '—'}</td><td className="p-4">{transfer.destinationLocationName ?? transfer.destinationLocationId ?? '—'}</td><td className="p-4 font-bold">{transfer.status}</td><td className="p-4">{transfer.responsibleName ?? transfer.userId ?? '—'}</td><td className="p-4"><button className="font-bold text-[#9d2d24]" onClick={() => setSelectedId(transfer.id)} type="button">Ver detalle</button></td></tr>)}</tbody></table></div>
          <aside className="rounded-3xl border bg-white p-5"><h3 className="text-xl font-black">Detalle del traspaso</h3>{detail.isLoading && <p>Cargando detalle...</p>}{detail.error && <p role="alert" className="text-[#9d2d24]">{detail.error instanceof Error ? detail.error.message : 'No se pudo cargar el detalle.'}</p>}{detail.data ? <div className="mt-4 grid gap-3 text-sm"><p><strong>Estado:</strong> {detail.data.status}</p><p><strong>Creado:</strong> {new Date(detail.data.createdAt).toLocaleString()}</p><p><strong>Confirmado:</strong> {detail.data.confirmedAt ? new Date(detail.data.confirmedAt).toLocaleString() : 'Pendiente'}</p><div>{detail.data.items?.map((item, index) => <p key={index}>{item.productName ?? item.productId}: {item.quantityKg ?? 0} kg / {item.quantityPieces ?? 0} piezas</p>)}</div>{detail.data.movements?.length ? <div className="rounded-2xl bg-[#f5f3ee] p-3"><p className="font-bold">Movimientos del traspaso</p>{detail.data.movements.map((movement) => <p key={movement.id}>{movement.type}: {movement.quantityKg ?? 0} kg / {movement.quantityPieces ?? 0} piezas</p>)}</div> : null}{canManage && <div className="grid gap-3"><textarea className="rounded-xl border p-3" disabled={!canCancelTransfer(detail.data)} placeholder="Motivo de cancelación" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /><div className="flex flex-wrap gap-3"><button className="rounded-xl bg-[#2d6b4f] px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!canConfirmTransfer(detail.data) || confirmTransfer.isPending} onClick={() => void confirmTransfer.mutateAsync(detail.data.id)} type="button">Confirmar</button><button className="rounded-xl bg-[#9d2d24] px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!canCancelTransfer(detail.data) || cancelTransfer.isPending} onClick={() => void handleCancel(detail.data.id)} type="button">Cancelar</button></div></div>}</div> : <p className="mt-4 text-sm text-[#68645c]">Selecciona un traspaso para consultar su detalle en la API.</p>}</aside>
        </div>
      </AsyncState>
    </section>
  )
}
