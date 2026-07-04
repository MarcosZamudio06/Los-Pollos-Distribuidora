import { useMemo, useState } from 'react'
import { usePurchaseLocations } from './hooks'
import { locationTypeLabel } from './purchaseLabels'
import type { OperationalLocation } from './types'

type PurchaseLocationSelectorProps = {
  error?: string
  onChange: (location: OperationalLocation | null) => void
  value: string
}

const receiverTypes = new Set(['BRANCH', 'WAREHOUSE', 'MIXED', 'EXTERNAL_POINT_OF_SALE'])

export function PurchaseLocationSelector({ error, onChange, value }: PurchaseLocationSelectorProps) {
  const [search, setSearch] = useState('')
  const locations = usePurchaseLocations(search)
  const receiverLocations = useMemo(() => (locations.data ?? []).filter((location) => receiverTypes.has(location.type)), [locations.data])
  const selected = useMemo(() => receiverLocations.find((location) => location.id === value) ?? null, [receiverLocations, value])

  return (
    <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 shadow-[0_18px_50px_rgba(32,33,31,0.06)]">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#39798b]">Ubicación receptora</p>
        <h2 className="text-2xl font-black tracking-[-0.05em]">Inventario por ubicación</h2>
        <p className="text-sm text-[#68645c]">La compra incrementa saldos solo en la ubicación operativa seleccionada. No existe stock global.</p>
      </div>
      <label className="mt-4 grid gap-2 text-sm font-bold text-[#68645c]">
        Buscar ubicación
        <input className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/35" onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o código" value={search} />
      </label>
      <label className="mt-4 grid gap-2 text-sm font-bold text-[#68645c]">
        Ubicación operativa requerida
        <select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/35" onChange={(event) => onChange(receiverLocations.find((location) => location.id === event.target.value) ?? null)} value={value}>
          <option value="">Selecciona ubicación receptora</option>
          {receiverLocations.map((location) => <option key={location.id} value={location.id}>{location.name} · {locationTypeLabel(location.type)}</option>)}
        </select>
      </label>
      {locations.isLoading && <p className="mt-3 text-sm font-bold text-[#39798b]">Cargando ubicaciones...</p>}
      {locations.error && <p role="alert" className="mt-3 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">No se pudieron cargar ubicaciones operativas.</p>}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
      {selected && <p className="mt-3 rounded-2xl bg-[#f0b44c]/20 p-3 text-sm text-[#7a4a00]">Recepción en <strong>{selected.name}</strong>. Tipo: {locationTypeLabel(selected.type)}.</p>}
    </section>
  )
}
