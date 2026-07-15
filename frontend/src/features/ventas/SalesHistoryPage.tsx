import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, FileText, FilterX, History, MapPin, ReceiptText, Search, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Table, Td, Th } from '@/components/ui'
import { cn } from '@/lib/utils'
import { TablePagination, useTablePagination } from '@/components/shared/table-pagination'
import { usePurchaseLocations } from '../compras/hooks'
import { useSales } from './hooks'
import { collectionStatusLabel, dateTime, documentTypeLabel, money, paymentTypeLabel, saleChannelLabel, saleStatusLabel } from './saleLabels'
import type { BadgeTone } from '@/components/ui'
import type { CollectionStatus, PaymentType, SaleChannel, SaleDocumentType, SaleStatus } from './types'

const filterLabelClass = 'grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]'

function saleStatusTone(status?: SaleStatus | string | null): BadgeTone {
  if (status === 'CONFIRMED') return 'green'
  if (status === 'CANCELLED') return 'red'
  return 'slate'
}

function collectionStatusTone(status?: CollectionStatus | string | null): BadgeTone {
  if (status === 'PAID') return 'green'
  if (status === 'CANCELLED') return 'red'
  if (status === 'PARTIALLY_PAID') return 'blue'
  return 'amber'
}

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
  const locations = usePurchaseLocations('')
  const sales = useSales(queryFilters)
  const items = sales.data?.items ?? []
  const pagination = useTablePagination(items)
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-5">
        <header className="relative overflow-hidden rounded-[2rem] border border-black/10 bg-[var(--erp-charcoal)] p-6 text-white shadow-[0_24px_80px_rgba(17,24,21,0.18)] sm:p-7">
          <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-[rgba(214,155,45,0.16)]" />
          <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-soft)]">
                <History className="h-4 w-4" />
                Historial de ventas
              </div>
              <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-[-0.06em] text-white sm:text-4xl">Bitácora comercial operativa</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">Consulta ventas de mostrador, ruta y mayoreo con filtros operativos, estados de cobranza y documentos internos sin mezclar comprobantes fiscales.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm">
                <span className="block text-xs font-black uppercase tracking-[0.16em] text-white/54">Resultados</span>
                <span className="mt-1 block text-2xl font-black tracking-[-0.05em] text-white">{items.length}</span>
              </div>
              <Link className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/8 px-5 text-sm font-black text-[var(--erp-brand-gold-soft)] transition hover:bg-white/12 focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]" to="/sales">
                <ReceiptText className="h-4 w-4" />
                Registrar venta
              </Link>
            </div>
          </div>
        </header>

        <Card className="p-5">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]">
                <SlidersHorizontal className="h-4 w-4" />
                Filtros operativos
              </div>
              <CardDescription className="mt-2">Ajusta el rango, canal, documento y estado conservando la consulta actual de ventas.</CardDescription>
            </div>
            <Button disabled={!hasFilters} onClick={() => setFilters({ collectionStatus: '', dateFrom: '', dateTo: '', documentType: '', locationId: '', paymentType: '', physicalFolio: '', saleChannel: '', status: '' })} variant="outline">
              <FilterX className="h-4 w-4" />
              Limpiar filtros
            </Button>
          </CardHeader>
          <CardContent className="mt-5 grid gap-3 md:grid-cols-4">
            <label className={filterLabelClass}>Desde<Input onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} type="date" value={filters.dateFrom} /></label>
            <label className={filterLabelClass}>Hasta<Input onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} type="date" value={filters.dateTo} /></label>
            <label className={filterLabelClass}>Ubicación operativa<Select disabled={locations.isLoading || Boolean(locations.error)} onChange={(event) => setFilters({ ...filters, locationId: event.target.value })} value={filters.locationId}><option value="">{locations.isLoading ? 'Cargando ubicaciones...' : locations.error ? 'No se pudieron cargar' : 'Todas las ubicaciones'}</option>{(locations.data ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}{location.code ? ` · ${location.code}` : ''}</option>)}</Select></label>
            <label className={filterLabelClass}>Folio físico<Input onChange={(event) => setFilters({ ...filters, physicalFolio: event.target.value })} placeholder="Ej. A-1024" value={filters.physicalFolio} /></label>
            <label className={filterLabelClass}>Estado<Select onChange={(event) => setFilters({ ...filters, status: event.target.value as SaleStatus | '' })} value={filters.status}><option value="">Todos</option><option value="DRAFT">Borrador</option><option value="CONFIRMED">Confirmada</option><option value="CANCELLED">Cancelada</option></Select></label>
            <label className={filterLabelClass}>Cobranza<Select onChange={(event) => setFilters({ ...filters, collectionStatus: event.target.value as CollectionStatus | '' })} value={filters.collectionStatus}><option value="">Todas</option><option value="UNPAID">Pendiente</option><option value="PARTIALLY_PAID">Parcialmente pagada</option><option value="PAID">Pagada</option><option value="CANCELLED">Cancelada</option></Select></label>
            <label className={filterLabelClass}>Tipo de venta<Select onChange={(event) => setFilters({ ...filters, paymentType: event.target.value as PaymentType | '' })} value={filters.paymentType}><option value="">Todas</option><option value="CASH_SALE">Contado</option><option value="CREDIT_SALE">Crédito</option></Select></label>
            <label className={filterLabelClass}>Canal<Select onChange={(event) => setFilters({ ...filters, saleChannel: event.target.value as SaleChannel | '' })} value={filters.saleChannel}><option value="">Todos</option><option value="COUNTER">Mostrador</option><option value="EXTERNAL_POINT_OF_SALE">Punto externo</option><option value="ROUTE">Ruta</option><option value="INSTITUTIONAL">Institucional</option><option value="WHOLESALE">Mayoreo</option></Select></label>
            <label className={cn(filterLabelClass, 'md:col-span-2')}>Documento<Select onChange={(event) => setFilters({ ...filters, documentType: event.target.value as SaleDocumentType | '' })} value={filters.documentType}><option value="">Todos</option><option value="SCALE_TICKET">Ticket de báscula</option><option value="SIMPLE_NOTE">Nota sencilla</option><option value="LARGE_NOTE">Nota grande</option><option value="INTERNAL_RECEIPT">Comprobante interno</option></Select></label>
          </CardContent>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">Consulta operativa</p>
              <CardTitle className="mt-1">Ventas recientes</CardTitle>
            </div>
            <Badge tone={hasFilters ? 'blue' : 'slate'}>{hasFilters ? 'Filtros activos' : 'Sin filtros'}</Badge>
          </div>

          <div className="p-5">
            {sales.isLoading && <p className="rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-4 text-sm font-bold text-[var(--erp-info)]">Cargando historial de ventas...</p>}
            {sales.error && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">No se pudo cargar el historial de ventas.</p>}
            {!sales.isLoading && !sales.error && items.length === 0 && <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-6 text-sm text-[var(--erp-muted-foreground)]">No hay ventas para los filtros seleccionados.</p>}

            {items.length > 0 && (
              <div className="overflow-x-auto rounded-[1.2rem] border border-[color:var(--erp-border)]">
                <Table className="min-w-[1080px]">
                  <thead>
                    <tr><Th>Venta</Th><Th>Cliente</Th><Th>Documento</Th><Th className="text-right">Total</Th><Th>Estado comercial</Th><Th>Asignación de ruta</Th><Th>Cobranza</Th><Th>Fecha</Th><Th className="text-right">Acciones</Th></tr>
                  </thead>
                  <tbody>
                    {pagination.pageItems.map((sale) => (
                      <tr className="transition hover:bg-[var(--erp-surface)]" key={sale.id}>
                        <Td><div className="flex items-start gap-3"><span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--erp-surface-muted)] text-[var(--erp-info)]"><ReceiptText className="h-4 w-4" /></span><div><p className="font-black">{sale.saleNumber ?? sale.id}</p><p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">{saleChannelLabel(sale.saleChannel)} · {paymentTypeLabel(sale.paymentType)}</p></div></div></Td>
                        <Td><p className="font-semibold">{sale.customerName ?? 'Público general'}</p><p className="mt-1 flex items-center gap-1 text-xs text-[var(--erp-muted-foreground)]"><MapPin className="h-3.5 w-3.5" />{sale.locationId ?? 'Sin ubicación'}</p></Td>
                        <Td><p className="font-semibold">{documentTypeLabel(sale.documentType)}</p>{sale.physicalFolio ? <p className="mt-1 flex items-center gap-1 text-xs text-[var(--erp-muted-foreground)]"><FileText className="h-3.5 w-3.5" />Folio {sale.physicalFolio}</p> : null}</Td>
                        <Td className="text-right text-base font-black tabular-nums">{money(sale.total)}</Td>
                        <Td><Badge tone={saleStatusTone(sale.status)}>{saleStatusLabel(sale.status)}</Badge></Td>
                        <Td><Badge tone={sale.routeId ? 'blue' : 'amber'}>{sale.routeId ? 'Ruta asignada' : 'Sin ruta asignada'}</Badge></Td>
                        <Td><Badge tone={collectionStatusTone(sale.collectionStatus)}>{collectionStatusLabel(sale.collectionStatus)}</Badge></Td>
                        <Td><p className="flex items-center gap-2 text-sm text-[var(--erp-muted-foreground)]"><CalendarDays className="h-4 w-4" />{dateTime(sale.createdAt)}</p></Td>
                        <Td className="text-right"><Link className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-3 text-sm font-black text-[var(--erp-danger)] transition hover:border-[var(--erp-danger)] hover:bg-[rgba(157,45,36,0.06)]" to={`/sales/${sale.id}`}><Search className="h-4 w-4" />Ver detalle</Link></Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
            <TablePagination {...pagination} total={items.length} onPageChange={pagination.setPage} />
          </div>
        </Card>
      </section>
    </main>
  )
}
