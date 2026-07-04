import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSales } from './hooks'
import { collectionStatusLabel, dateTime, documentTypeLabel, money, paymentTypeLabel, saleChannelLabel, saleStatusLabel } from './saleLabels'
import type { CollectionStatus, PaymentType, SaleChannel, SaleDocumentType, SaleStatus } from './types'

export function SalesHistoryPage() {
  const [filters, setFilters] = useState({
    collectionStatus: '' as CollectionStatus | '',
    dateFrom: '',
    dateTo: '',
    documentType: '' as SaleDocumentType | '',
    locationId: '',
    paymentType: '' as PaymentType | '',
    physicalFolio: '',
    saleChannel: '' as SaleChannel | '',
    status: '' as SaleStatus | '',
  })
  const queryFilters = useMemo(() => ({ ...filters, limit: 50, page: 1 }), [filters])
  const sales = useSales(queryFilters)
  const items = sales.data?.items ?? []

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-6">
        <header className="overflow-hidden rounded-[2rem] border border-[#20211f]/10 bg-[#20211f] text-white shadow-[0_24px_80px_rgba(32,33,31,0.16)]">
          <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0b44c]">Historial de ventas</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">Bitácora de mostrador, ruta y mayoreo</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Filtra ventas confirmadas, pendientes de cobranza o canceladas sin mezclar comprobantes internos con documentos fiscales.</p>
            </div>
            <Link className="rounded-2xl border border-white/15 px-5 py-3 text-center text-sm font-black text-[#f0b44c]" to="/sales">Registrar venta</Link>
          </div>
        </header>

        <section className="grid gap-3 rounded-[2rem] border border-[#20211f]/10 bg-white p-5 shadow-[0_20px_60px_rgba(32,33,31,0.07)] md:grid-cols-4">
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Desde<input className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} type="date" value={filters.dateFrom} /></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Hasta<input className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} type="date" value={filters.dateTo} /></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Ubicación operativa<input className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, locationId: event.target.value })} placeholder="ID de ubicación" value={filters.locationId} /></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Folio físico<input className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, physicalFolio: event.target.value })} placeholder="Ej. A-1024" value={filters.physicalFolio} /></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Estado<select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, status: event.target.value as SaleStatus | '' })} value={filters.status}><option value="">Todos</option><option value="DRAFT">Borrador</option><option value="CONFIRMED">Confirmada</option><option value="CANCELLED">Cancelada</option></select></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Cobranza<select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, collectionStatus: event.target.value as CollectionStatus | '' })} value={filters.collectionStatus}><option value="">Todas</option><option value="UNPAID">Pendiente</option><option value="PARTIALLY_PAID">Parcialmente pagada</option><option value="PAID">Pagada</option><option value="CANCELLED">Cancelada</option></select></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Tipo de venta<select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, paymentType: event.target.value as PaymentType | '' })} value={filters.paymentType}><option value="">Todas</option><option value="CASH_SALE">Contado</option><option value="CREDIT_SALE">Crédito</option></select></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c]">Canal<select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, saleChannel: event.target.value as SaleChannel | '' })} value={filters.saleChannel}><option value="">Todos</option><option value="COUNTER">Mostrador</option><option value="EXTERNAL_POINT_OF_SALE">Punto externo</option><option value="ROUTE">Ruta</option><option value="INSTITUTIONAL">Institucional</option><option value="WHOLESALE">Mayoreo</option></select></label>
          <label className="grid gap-2 text-sm font-bold text-[#68645c] md:col-span-2">Documento<select className="rounded-2xl border border-[#20211f]/15 px-4 py-3 text-[#20211f]" onChange={(event) => setFilters({ ...filters, documentType: event.target.value as SaleDocumentType | '' })} value={filters.documentType}><option value="">Todos</option><option value="SCALE_TICKET">Ticket de báscula</option><option value="SIMPLE_NOTE">Nota sencilla</option><option value="LARGE_NOTE">Nota grande</option><option value="INTERNAL_RECEIPT">Comprobante interno</option></select></label>
          <div className="flex items-end">
            <button className="w-full rounded-2xl border border-[#20211f]/15 px-4 py-3 font-black text-[#9d2d24]" onClick={() => setFilters({ collectionStatus: '', dateFrom: '', dateTo: '', documentType: '', locationId: '', paymentType: '', physicalFolio: '', saleChannel: '', status: '' })} type="button">Limpiar filtros</button>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#9d2d24]">Consulta operativa</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">Ventas recientes</h2>
            </div>
            <p className="text-sm font-bold text-[#68645c]">{items.length} resultado(s)</p>
          </div>

          {sales.isLoading && <p className="mt-4 rounded-2xl bg-[#39798b]/10 p-3 text-sm font-bold text-[#39798b]">Cargando historial de ventas...</p>}
          {sales.error && <p role="alert" className="mt-4 rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">No se pudo cargar el historial de ventas.</p>}
          {!sales.isLoading && !sales.error && items.length === 0 && <p className="mt-4 rounded-2xl border border-dashed border-[#20211f]/20 p-5 text-sm text-[#68645c]">No hay ventas para los filtros seleccionados.</p>}

          {items.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.16em] text-[#68645c]">
                  <tr className="border-b border-[#20211f]/10"><th className="px-3 py-3">Venta</th><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Documento</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Cobranza</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Acciones</th></tr>
                </thead>
                <tbody>
                  {items.map((sale) => (
                    <tr className="border-b border-[#20211f]/8 align-top" key={sale.id}>
                      <td className="px-3 py-4"><p className="font-black">{sale.saleNumber ?? sale.id}</p><p className="text-xs text-[#68645c]">{saleChannelLabel(sale.saleChannel)} · {paymentTypeLabel(sale.paymentType)}</p></td>
                      <td className="px-3 py-4">{sale.customerName ?? 'Público general'}</td>
                      <td className="px-3 py-4">{documentTypeLabel(sale.documentType)}{sale.physicalFolio ? <span className="block text-xs text-[#68645c]">Folio {sale.physicalFolio}</span> : null}</td>
                      <td className="px-3 py-4 font-black">{money(sale.total)}</td>
                      <td className="px-3 py-4"><span className="rounded-full bg-[#20211f]/8 px-3 py-1 text-xs font-black">{saleStatusLabel(sale.status)}</span></td>
                      <td className="px-3 py-4"><span className="rounded-full bg-[#f0b44c]/20 px-3 py-1 text-xs font-black text-[#7a4a00]">{collectionStatusLabel(sale.collectionStatus)}</span></td>
                      <td className="px-3 py-4 text-[#68645c]">{dateTime(sale.createdAt)}</td>
                      <td className="px-3 py-4"><Link className="font-black text-[#9d2d24]" to={`/sales/${sale.id}`}>Ver detalle</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
