import { useMemo, useState } from 'react'
import { MapPin } from 'lucide-react'
import { Card, CardDescription, CardTitle, Input, Select } from '@/components/ui'
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
    <Card className="p-5">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]"><MapPin className="h-4 w-4" />Ubicación receptora</div>
        <CardTitle className="mt-1">Inventario por ubicación</CardTitle>
        <CardDescription className="mt-2">La compra incrementa saldos solo en la ubicación operativa seleccionada. No existe stock global.</CardDescription>
      </div>
      <label className="mt-4 grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
        Buscar ubicación
        <Input onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o código" value={search} />
      </label>
      <label className="mt-4 grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
        Ubicación operativa requerida
        <Select onChange={(event) => onChange(receiverLocations.find((location) => location.id === event.target.value) ?? null)} value={value}>
          <option value="">Selecciona ubicación receptora</option>
          {receiverLocations.map((location) => <option key={location.id} value={location.id}>{location.name} · {locationTypeLabel(location.type)}</option>)}
        </Select>
      </label>
      {locations.isLoading && <p className="mt-3 text-sm font-bold text-[var(--erp-info)]">Cargando ubicaciones...</p>}
      {locations.error && <p role="alert" className="mt-3 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">No se pudieron cargar ubicaciones operativas.</p>}
      {error && <p role="alert" className="mt-3 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">{error}</p>}
      {selected && <p className="mt-3 rounded-2xl border border-[rgba(214,155,45,0.28)] bg-[rgba(214,155,45,0.12)] p-4 text-sm text-[var(--erp-brand-gold-deep)]">Recepción en <strong>{selected.name}</strong>. Tipo: {locationTypeLabel(selected.type)}.</p>}
    </Card>
  )
}
