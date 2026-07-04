import { useMemo, useState } from 'react'
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
    <section className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-5 shadow-[0_18px_50px_rgba(32,33,31,0.06)]">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d2d24]">Proveedor</p>
        <h2 className="text-2xl font-black tracking-[-0.05em]">Origen de la mercancía</h2>
        <p className="text-sm text-[#68645c]">Selecciona un proveedor activo antes de capturar productos.</p>
      </div>
      <label className="mt-4 grid gap-2 text-sm font-bold text-[#68645c]">
        Buscar proveedor
        <input className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/35" onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, teléfono o correo" value={search} />
      </label>
      <label className="mt-4 grid gap-2 text-sm font-bold text-[#68645c]">
        Proveedor requerido
        <select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/35" onChange={(event) => onChange(suppliers.data?.find((supplier) => supplier.id === event.target.value) ?? null)} value={value}>
          <option value="">Selecciona proveedor</option>
          {(suppliers.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </label>
      {suppliers.isLoading && <p className="mt-3 text-sm font-bold text-[#39798b]">Cargando proveedores...</p>}
      {suppliers.error && <p role="alert" className="mt-3 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">No se pudieron cargar proveedores activos.</p>}
      {error && <p role="alert" className="mt-3 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
      {selected && <p className="mt-3 rounded-2xl bg-[#39798b]/10 p-3 text-sm text-[#315f6f]">Proveedor seleccionado: <strong>{selected.name}</strong>{selected.email ? ` · ${selected.email}` : ''}</p>}
    </section>
  )
}
