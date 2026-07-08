import { useMemo, useState } from 'react'
import { Building2 } from 'lucide-react'
import { Card, CardDescription, CardTitle, Input, Select } from '@/components/ui'
import { useSuppliers } from './hooks'
import type { Supplier } from './types'

type SupplierSelectorProps = {
  error?: string
  onChange: (supplier: Supplier | null) => void
  value: string
}

export function SupplierSelector({ error, onChange, value }: SupplierSelectorProps) {
  const [search, setSearch] = useState('')
  const suppliers = useSuppliers(search)
  const selected = useMemo(() => suppliers.data?.find((supplier) => supplier.id === value) ?? null, [suppliers.data, value])

  return (
    <Card className="p-5">
      <div>
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]"><Building2 className="h-4 w-4" />Proveedor</div>
        <CardTitle className="mt-1">Origen de la mercancía</CardTitle>
        <CardDescription className="mt-2">Selecciona un proveedor activo antes de capturar productos.</CardDescription>
      </div>
      <label className="mt-4 grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
        Buscar proveedor
        <Input onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, teléfono o correo" value={search} />
      </label>
      <label className="mt-4 grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
        Proveedor requerido
        <Select onChange={(event) => onChange(suppliers.data?.find((supplier) => supplier.id === event.target.value) ?? null)} value={value}>
          <option value="">Selecciona proveedor</option>
          {(suppliers.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </Select>
      </label>
      {suppliers.isLoading && <p className="mt-3 text-sm font-bold text-[var(--erp-info)]">Cargando proveedores...</p>}
      {suppliers.error && <p role="alert" className="mt-3 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">No se pudieron cargar proveedores activos.</p>}
      {error && <p role="alert" className="mt-3 rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">{error}</p>}
      {selected && <p className="mt-3 rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-4 text-sm text-[var(--erp-info)]">Proveedor seleccionado: <strong>{selected.name}</strong>{selected.email ? ` · ${selected.email}` : ''}</p>}
    </Card>
  )
}
