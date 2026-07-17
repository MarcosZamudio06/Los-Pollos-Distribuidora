import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, ClipboardList, FilterX, MapPin, PackageCheck, Plus, Search, SlidersHorizontal, Truck } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Table, Td, Th } from '@/components/ui'
import type { BadgeTone } from '@/components/ui'
import { usePurchaseLocations, usePurchases, useSuppliers } from './hooks'
import { dateTime, money, purchaseStatusLabel } from './purchaseLabels'
import type { PurchaseStatus } from './types'
import { TablePagination, useTablePagination } from '@/components/shared/table-pagination'

const filterLabelClass = 'grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]'

function purchaseStatusTone(status?: PurchaseStatus | string | null): BadgeTone {
  if (status === 'CONFIRMED') return 'green'
  if (status === 'CANCELLED') return 'red'
  return 'slate'
}

export function PurchasesPage() {
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', locationId: '', status: '' as PurchaseStatus | '', supplierId: '' })
  const queryFilters = useMemo(() => ({ ...filters, limit: 50, page: 1 }), [filters])
  const purchases = usePurchases(queryFilters)
  const suppliers = useSuppliers('')
  const locations = usePurchaseLocations('')
  const items = purchases.data?.items ?? []
  const pagination = useTablePagination(items)
  const supplierNameById = useMemo(() => new Map((suppliers.data ?? []).map((supplier) => [supplier.id, supplier.name])), [suppliers.data])
  const locationNameById = useMemo(() => new Map((locations.data ?? []).map((location) => [location.id, location.name])), [locations.data])
  const hasFilters = Object.values(filters).some(Boolean)
  const confirmedCount = items.filter((purchase) => purchase.status === 'CONFIRMED').length
  const cancelledCount = items.filter((purchase) => purchase.status === 'CANCELLED').length
  const visibleTotal = items.reduce((sum, purchase) => sum + Number(purchase.total ?? 0), 0)

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-7xl gap-5">
        <header className="relative overflow-hidden rounded-[2rem] border border-[color:var(--erp-border)] bg-white p-6 text-[var(--erp-foreground)] shadow-[var(--erp-shadow-elevated)] sm:p-7">
          <div className="absolute right-0 top-0 h-36 w-36 rounded-bl-full bg-[rgba(214,155,45,0.16)]" />
          <div className="absolute bottom-0 left-0 h-24 w-56 rounded-tr-full bg-[rgba(182,42,34,0.16)]" />
          <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(214,155,45,0.28)] bg-[rgba(214,155,45,0.10)] px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">
                <ClipboardList className="h-4 w-4" />
                Compras
              </div>
              <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-[-0.06em] text-[var(--erp-foreground)] sm:text-4xl">Recepción de mercancía por ubicación</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--erp-muted-foreground)]">Consulta entradas confirmadas, proveedor, ubicación receptora y trazabilidad operativa.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-96">
              <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]/90 px-4 py-3">
                <span className="block text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Resultados</span>
                <span className="mt-1 block text-2xl font-black tracking-[-0.05em] text-[var(--erp-foreground)]">{items.length}</span>
              </div>
              <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)]/90 px-4 py-3">
                <span className="block text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Confirmadas</span>
                <span className="mt-1 block text-2xl font-black tracking-[-0.05em] text-[var(--erp-foreground)]">{confirmedCount}</span>
              </div>
              <Link className="inline-flex h-full min-h-16 items-center justify-center gap-2 rounded-2xl border border-[color:var(--erp-border)] bg-white px-4 text-sm font-black text-[var(--erp-brand-red)] transition hover:border-[var(--erp-brand-red)] hover:bg-[rgba(182,42,34,0.04)] focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)] sm:col-span-1" to="/purchases/new">
                <Plus className="h-4 w-4" />
                Nueva compra
              </Link>
            </div>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="p-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><PackageCheck className="h-4 w-4 text-[var(--erp-success)]" />Total visible</p>
            <p className="mt-3 text-2xl font-black tracking-[-0.05em] tabular-nums">{money(visibleTotal)}</p>
            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Suma de la consulta actual</p>
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><Truck className="h-4 w-4 text-[var(--erp-info)]" />Recepciones</p>
            <p className="mt-3 text-2xl font-black tracking-[-0.05em] tabular-nums">{confirmedCount}</p>
            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Entradas confirmadas visibles</p>
          </Card>
          <Card className="p-5">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]"><FilterX className="h-4 w-4 text-[var(--erp-danger)]" />Canceladas</p>
            <p className="mt-3 text-2xl font-black tracking-[-0.05em] tabular-nums">{cancelledCount}</p>
            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Registros anulados visibles</p>
          </Card>
        </div>

        <Card className="p-5">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-info)]">
                <SlidersHorizontal className="h-4 w-4" />
                Filtros operativos
              </div>
              <CardDescription className="mt-2">Refina proveedor, ubicación, estado y rango de recepción manteniendo la lógica actual.</CardDescription>
            </div>
            <Button disabled={!hasFilters} onClick={() => setFilters({ dateFrom: '', dateTo: '', locationId: '', status: '', supplierId: '' })} variant="outline">
              <FilterX className="h-4 w-4" />
              Limpiar filtros
            </Button>
          </CardHeader>
          <CardContent className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className={filterLabelClass}>Proveedor<Select onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })} value={filters.supplierId}><option value="">Todos</option>{(suppliers.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</Select></label>
            <label className={filterLabelClass}>Ubicación receptora<Select onChange={(event) => setFilters({ ...filters, locationId: event.target.value })} value={filters.locationId}><option value="">Todas</option>{(locations.data ?? []).map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></label>
            <label className={filterLabelClass}>Estado<Select onChange={(event) => setFilters({ ...filters, status: event.target.value as PurchaseStatus | '' })} value={filters.status}><option value="">Todos</option><option value="CONFIRMED">Confirmada</option><option value="CANCELLED">Cancelada</option></Select></label>
            <label className={filterLabelClass}>Desde<Input onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })} type="date" value={filters.dateFrom} /></label>
            <label className={filterLabelClass}>Hasta<Input onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })} type="date" value={filters.dateTo} /></label>
          </CardContent>
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] bg-white/70 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">Consulta operativa</p>
              <CardTitle className="mt-1">Compras recientes</CardTitle>
            </div>
            <Badge tone={hasFilters ? 'blue' : 'slate'}>{hasFilters ? 'Filtros activos' : 'Sin filtros'}</Badge>
          </div>

          <div className="p-5">
            {purchases.isLoading && <p className="rounded-2xl border border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] p-4 text-sm font-bold text-[var(--erp-info)]">Cargando compras...</p>}
            {purchases.error && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">No se pudieron cargar las compras.</p>}
            {!purchases.isLoading && !purchases.error && items.length === 0 && <p className="rounded-2xl border border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-6 text-sm text-[var(--erp-muted-foreground)]">No hay compras para los filtros seleccionados.</p>}

            {items.length > 0 && (
              <>
                <div className="grid gap-3 md:hidden">
                  {pagination.pageItems.map((purchase) => (
                    <Link className="rounded-2xl border border-[color:var(--erp-border)] bg-white p-4 transition hover:border-[var(--erp-brand-gold)]" key={purchase.id} to={`/purchases/${purchase.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-black">{purchase.purchaseNumber ?? purchase.id}</p>
                          <p className="mt-1 truncate text-sm text-[var(--erp-muted-foreground)]">{purchase.supplierName ?? supplierNameById.get(purchase.supplierId) ?? purchase.supplierId}</p>
                        </div>
                        <Badge tone={purchaseStatusTone(purchase.status)}>{purchaseStatusLabel(purchase.status)}</Badge>
                      </div>
                      <div className="mt-4 grid gap-2 text-sm text-[var(--erp-muted-foreground)]">
                        <span className="flex items-center gap-2"><MapPin className="h-4 w-4" />{purchase.locationName ?? locationNameById.get(purchase.locationId) ?? purchase.locationId}</span>
                        <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{dateTime(purchase.createdAt)}</span>
                      </div>
                      <p className="mt-4 text-xl font-black tabular-nums">{money(purchase.total)}</p>
                    </Link>
                  ))}
                </div>

                <div className="hidden overflow-x-auto rounded-[1.2rem] border border-[color:var(--erp-border)] md:block">
                  <Table className="min-w-[1040px]">
                    <thead>
                      <tr><Th>Número</Th><Th>Proveedor</Th><Th>Ubicación receptora</Th><Th>Fecha</Th><Th className="text-right">Total</Th><Th>Estado</Th><Th>Usuario</Th><Th className="text-right">Acciones</Th></tr>
                    </thead>
                    <tbody>{pagination.pageItems.map((purchase) => <tr className="transition hover:bg-[var(--erp-surface)]" key={purchase.id}><Td><p className="font-black">{purchase.purchaseNumber ?? purchase.id}</p></Td><Td>{purchase.supplierName ?? supplierNameById.get(purchase.supplierId) ?? purchase.supplierId}</Td><Td>{purchase.locationName ?? locationNameById.get(purchase.locationId) ?? purchase.locationId}</Td><Td className="text-[var(--erp-muted-foreground)]">{dateTime(purchase.createdAt)}</Td><Td className="text-right text-base font-black tabular-nums">{money(purchase.total)}</Td><Td><Badge tone={purchaseStatusTone(purchase.status)}>{purchaseStatusLabel(purchase.status)}</Badge></Td><Td>{purchase.userName ?? purchase.userId ?? 'Sin usuario'}</Td><Td className="text-right"><Link className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-white px-3 text-sm font-black text-[var(--erp-danger)] transition hover:border-[var(--erp-danger)] hover:bg-[rgba(157,45,36,0.06)]" to={`/purchases/${purchase.id}`}><Search className="h-4 w-4" />Ver detalle</Link></Td></tr>)}</tbody>
                  </Table>
                </div>
              </>
            )}
            <TablePagination {...pagination} total={items.length} onPageChange={pagination.setPage} />
          </div>
        </Card>
      </section>
    </main>
  )
}
