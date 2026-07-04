import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePurchaseLocations, usePurchases, useSuppliers } from './hooks'
import { dateTime, money, purchaseStatusLabel } from './purchaseLabels'
import type { PurchaseStatus } from './types'

export function PurchasesPage() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', locationId: '', status: '' as PurchaseStatus | '', supplierId: '' })
  const queryFilters = useMemo(() => ({ ...filters, limit: 50, page: 1 }), [filters])
  const purchases = usePurchases(queryFilters)
  const suppliers = useSuppliers('')
  const locations = usePurchaseLocations('')
  const items = purchases.data?.items ?? []
  const supplierNameById = useMemo(() => new Map((suppliers.data ?? []).map((supplier) => [supplier.id, supplier.name])), [suppliers.data])
  const locationNameById = useMemo(() => new Map((locations.data ?? []).map((location) => [location.id, location.name])), [locations.data])

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="overflow-hidden rounded-[2rem] border border-[#20211f]/10 bg-[#20211f] text-white shadow-[0_24px_80px_rgba(32,33,31,0.16)]">
          <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0b44c]">Compras</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">Entradas de mercancía por ubicación</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Registra compras confirmadas, consulta proveedor, ubicación receptora y movimientos sin consolidar stock global.</p>
            </div>
            <Link className="rounded-2xl border border-white/15 px-5 py-3 text-center text-sm font-black text-[#f0b44c]" to="/purchases/new">Nueva compra</Link>
          </div>
        </header>

        <section className="grid gap-3 rounded-[2rem] border border-[#20211f]/10 bg-white p-5 shadow-[0_20px_60px_rgba(32,33,31,0.07)] md:grid-cols-5">
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Proveedor<select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })} value={filters.supplierId}><option value="">Todos</option>{(suppliers.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Ubicación receptora<select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, locationId: event.target.value })} value={filters.locationId}><option value="">Todas</option>{(locations.data ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Estado<select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, status: event.target.value })} value={filters.status}><option value="">Todos</option><option value="CONFIRMED">Confirmada</option><option value="CANCELLED">Cancelada</option></select></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Desde<input className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} type="date" value={filters.dateFrom} /></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Hasta<input className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} type="date" value={filters.dateTo} /></label>
        </section>

        <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d2d24]">Consulta operativa</p><h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">Compras recientes</h2></div>
            <p className="text-sm font-bold text-[#68645c]">{items.length} resultado(s)</p>
          </div>
          {purchases.isLoading && <p className="mt-4 rounded-2xl bg-[#39798b]/10 p-3 text-sm font-bold text-[#39798b]">Cargando compras...</p>}
          {purchases.error && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">No se pudieron cargar las compras.</p>}
          {!purchases.isLoading && !purchases.error && items.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-[#20211f]/20 p-5 text-sm text-[#68645c]">No hay compras para los filtros seleccionados.</p>}
          {items.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-[#68645c]"><tr className="border-b border-[#20211f]/10"><th className="px-3 py-3">Número</th><th className="px-3 py-3">Proveedor</th><th className="px-3 py-3">Ubicación receptora</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Usuario</th><th className="px-3 py-3">Acciones</th></tr></thead>
                <tbody>{items.map((purchase) => <tr className="border-b border-[#20211f]/8 align-top" key={purchase.id}><td className="px-3 py-4 font-black">{purchase.purchaseNumber ?? purchase.id}</td><td className="px-3 py-4">{purchase.supplierName ?? supplierNameById.get(purchase.supplierId) ?? purchase.supplierId}</td><td className="px-3 py-4">{purchase.locationName ?? locationNameById.get(purchase.locationId) ?? purchase.locationId}</td><td className="px-3 py-4 text-[#68645c]">{dateTime(purchase.createdAt)}</td><td className="px-3 py-4 font-black">{money(purchase.total)}</td><td className="px-3 py-4"><span className="rounded-full bg-[#20211f]/8 px-3 py-1 text-xs font-black">{purchaseStatusLabel(purchase.status)}</span></td><td className="px-3 py-4">{purchase.userName ?? purchase.userId ?? 'Sin usuario'}</td><td className="px-3 py-4"><Link className="font-black text-[#9d2d24]" to={`/purchases/${purchase.id}`}>Ver detalle</Link></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
