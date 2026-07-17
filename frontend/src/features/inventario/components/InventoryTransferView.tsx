import { useState, type FormEvent } from 'react'
import { AsyncState } from './AsyncState'
import { useCancelInventoryTransfer, useConfirmInventoryTransfer, useCreateInventoryTransfer, useInventoryLocations, useInventoryTransferDetail, useInventoryTransfers } from '../hooks/useProducts'
import { CatalogSelect } from '@/components/shared/operational-catalogs'
import type { InventoryTransfer, InventoryTransferValues } from '../types'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { toast } from 'sonner'

type InventoryTransferViewProps = {
  canManage: boolean
}

const emptyTransfer: InventoryTransferValues = { originLocationId: '', destinationLocationId: '', notes: '', items: [{ productId: '', unit: 'KG' }] }
const fieldClass =
  'h-11 rounded-xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 text-sm text-[var(--erp-foreground)] shadow-sm outline-none transition placeholder:text-[var(--erp-muted-foreground)] focus:border-[var(--erp-brand-gold)] focus:ring-4 focus:ring-[rgba(214,155,45,0.16)]'
const cellClass = 'px-4 py-3 align-middle'

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
  const [pendingTransfer, setPendingTransfer] = useState<InventoryTransferValues | null>(null)
  const transfers = useInventoryTransfers()
  const detail = useInventoryTransferDetail(selectedId)
  const createTransfer = useCreateInventoryTransfer()
  const confirmTransfer = useConfirmInventoryTransfer()
  const cancelTransfer = useCancelInventoryTransfer()
  const locations = useInventoryLocations()
  const locationOptions = locations.data?.map((location) => ({ id: location.id, label: location.name ?? location.id }))

  function validate() {
    if (!values.originLocationId || !values.destinationLocationId) return 'El origen y el destino son obligatorios.'
    if (values.originLocationId === values.destinationLocationId) return 'El origen y el destino no pueden ser iguales.'
    if (values.items.length === 0 || values.items.some((item) => !item.productId)) return 'Se requiere al menos un producto.'
    if (values.items.some((item) => (item.quantityKg ?? 0) <= 0 && (item.quantityPieces ?? 0) <= 0)) return 'Las cantidades deben ser mayores que cero.'
    if (values.items.some((item) => item.quantityPieces !== undefined && !Number.isInteger(item.quantityPieces))) return 'Las piezas deben ser números enteros.'
    return null
  }

  function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) return setError(validationError)
    setError(null)
    setPendingTransfer(structuredClone(values))
  }

  async function confirmRegistration() {
    if (!pendingTransfer || createTransfer.isPending) return
    try {
      await createTransfer.mutateAsync(pendingTransfer)
      toast.success('Traspaso registrado correctamente.')
      setValues(emptyTransfer)
      setPendingTransfer(null)
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
    <section className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_50px_rgba(16,24,32,0.06)]">
      <div>
        <h2 className="text-xl font-bold tracking-[-0.03em] text-[var(--erp-foreground)]">Traspasos de inventario</h2>
        <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Registro visual de movimientos entre ubicaciones operativas.</p>
      </div>
      {canManage && (
        <form onSubmit={submitTransfer} className="grid gap-4 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-4">
          {error && <p role="alert" className="rounded-xl border border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.08)] p-3 text-sm font-semibold text-[var(--erp-danger)]">{error}</p>}
          <div className="grid gap-3 md:grid-cols-3"><CatalogSelect className={fieldClass} error={locations.error} isLoading={locations.isLoading} label="Ubicación de origen" onChange={(originLocationId) => setValues({ ...values, originLocationId })} options={locationOptions} placeholder="Selecciona origen" value={values.originLocationId} /><CatalogSelect className={fieldClass} error={locations.error} isLoading={locations.isLoading} label="Ubicación de destino" onChange={(destinationLocationId) => setValues({ ...values, destinationLocationId })} options={locationOptions?.filter((item) => item.id !== values.originLocationId)} placeholder="Selecciona destino" value={values.destinationLocationId} /><input className={fieldClass} placeholder="Notas" value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} /></div>
          {values.items.map((item, index) => <div key={index} className="grid gap-3 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-3 md:grid-cols-4"><input className={fieldClass} placeholder="ID del producto" value={item.productId} onChange={(event) => setValues({ ...values, items: values.items.map((line, lineIndex) => lineIndex === index ? { ...line, productId: event.target.value } : line) })} /><select className={fieldClass} value={item.unit} onChange={(event) => setValues({ ...values, items: values.items.map((line, lineIndex) => lineIndex === index ? { ...line, unit: event.target.value as typeof item.unit } : line) })}><option value="KG">Kilo</option><option value="PIECE">Pieza</option><option value="KG_AND_PIECE">Kilo y pieza</option></select><input className={fieldClass} min="0" step="0.001" type="number" placeholder="Kg" value={item.quantityKg || ''} onChange={(event) => setValues({ ...values, items: values.items.map((line, lineIndex) => lineIndex === index ? { ...line, quantityKg: Number(event.target.value) } : line) })} /><input className={fieldClass} min="0" step="1" type="number" placeholder="Piezas" value={item.quantityPieces || ''} onChange={(event) => setValues({ ...values, items: values.items.map((line, lineIndex) => lineIndex === index ? { ...line, quantityPieces: Number(event.target.value) } : line) })} /></div>)}
          <button disabled={createTransfer.isPending} className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] px-5 text-sm font-semibold text-[var(--erp-on-brand)] shadow-[0_14px_32px_rgba(157,45,36,0.18)] transition hover:bg-[var(--erp-brand-red-strong)] disabled:opacity-60">Crear traspaso</button>
        </form>
      )}
      <AsyncState empty={!transfers.data?.length} emptyMessage="No se han registrado traspasos." error={transfers.error} isLoading={transfers.isLoading}>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr]">
          <div className="overflow-hidden rounded-2xl border border-[var(--erp-border)]"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-[var(--erp-border)] bg-[var(--erp-surface-muted)] text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><tr><th className={cellClass}>Origen</th><th className={cellClass}>Destino</th><th className={cellClass}>Estado</th><th className={cellClass}>Responsable</th><th className={cellClass}>Acciones</th></tr></thead><tbody>{transfers.data?.map((transfer) => <tr key={transfer.id} className="border-t border-[var(--erp-border)] transition hover:bg-[var(--erp-surface-muted)]/70"><td className={cellClass}>{transfer.originLocationName ?? transfer.originLocationId ?? '—'}</td><td className={cellClass}>{transfer.destinationLocationName ?? transfer.destinationLocationId ?? '—'}</td><td className={cellClass}><span className="rounded-full border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">{transfer.status}</span></td><td className={cellClass}>{transfer.responsibleName ?? transfer.userId ?? '—'}</td><td className={cellClass}><button className="rounded-lg border border-[var(--erp-border)] px-3 py-1.5 text-xs font-semibold text-[var(--erp-danger)] transition hover:bg-[rgba(157,45,36,0.08)]" onClick={() => setSelectedId(transfer.id)} type="button">Ver detalle</button></td></tr>)}</tbody></table></div></div>
          <aside className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5"><h3 className="text-lg font-bold text-[var(--erp-foreground)]">Detalle del traspaso</h3>{detail.isLoading && <p className="mt-3 text-sm text-[var(--erp-muted-foreground)]">Cargando detalle...</p>}{detail.error && <p role="alert" className="mt-3 text-sm font-semibold text-[var(--erp-danger)]">{detail.error instanceof Error ? detail.error.message : 'No se pudo cargar el detalle.'}</p>}{detail.data ? <div className="mt-4 grid gap-3 text-sm text-[var(--erp-foreground)]"><p><strong>Estado:</strong> {detail.data.status}</p><p><strong>Creado:</strong> {new Date(detail.data.createdAt).toLocaleString()}</p><p><strong>Confirmado:</strong> {detail.data.confirmedAt ? new Date(detail.data.confirmedAt).toLocaleString() : 'Pendiente'}</p><div className="grid gap-2">{detail.data.items?.map((item, index) => <p className="rounded-xl bg-[var(--erp-surface-muted)] px-3 py-2" key={index}>{item.productName ?? item.productId}: {item.quantityKg ?? 0} kg / {item.quantityPieces ?? 0} piezas</p>)}</div>{detail.data.movements?.length ? <div className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-surface-muted)] p-3"><p className="font-semibold">Movimientos del traspaso</p>{detail.data.movements.map((movement) => <p key={movement.id}>{movement.type}: {movement.quantityKg ?? 0} kg / {movement.quantityPieces ?? 0} piezas</p>)}</div> : null}{canManage && <div className="grid gap-3"><textarea className={`${fieldClass} min-h-24 py-3`} disabled={!canCancelTransfer(detail.data)} placeholder="Motivo de cancelación" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /><div className="flex flex-wrap gap-3"><button className="rounded-xl border border-[var(--erp-success)] bg-[var(--erp-success)] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!canConfirmTransfer(detail.data) || confirmTransfer.isPending} onClick={() => void confirmTransfer.mutateAsync(detail.data.id)} type="button">Confirmar</button><button className="rounded-xl border border-[var(--erp-danger)] bg-[var(--erp-danger)] px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!canCancelTransfer(detail.data) || cancelTransfer.isPending} onClick={() => void handleCancel(detail.data.id)} type="button">Cancelar</button></div></div>}</div> : <p className="mt-4 text-sm text-[var(--erp-muted-foreground)]">Selecciona un traspaso para consultar su detalle en la API.</p>}</aside>
        </div>
      </AsyncState>
      <ConfirmationDialog confirmLabel="Confirmar registro" description="Verifique el movimiento antes de afectar el flujo de inventario." isLoading={createTransfer.isPending} onConfirm={confirmRegistration} onOpenChange={(open) => { if (!open) setPendingTransfer(null) }} open={Boolean(pendingTransfer)} title="Confirmar traspaso">
        <p><strong>Origen:</strong> {pendingTransfer?.originLocationId}</p><p><strong>Destino:</strong> {pendingTransfer?.destinationLocationId}</p><p><strong>Productos:</strong> {pendingTransfer?.items.length ?? 0}</p>
        {error && <p className="font-semibold text-[var(--erp-danger)]" role="alert">{error}</p>}
      </ConfirmationDialog>
    </section>
  )
}
