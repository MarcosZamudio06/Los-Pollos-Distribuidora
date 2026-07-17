import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ClipboardCheck, Filter, Plus, Search } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { MiniAjaxSelect } from '../../components/shared/operational-catalogs'
import { ConfirmationDialog } from '../../components/shared/confirmation-dialog'
import { useAuth } from '../auth'
import { useSale } from '../ventas/hooks'
import { BillingRequestStatusBadge } from './BillingRequestStatusBadge'
import { useBillingRequests, useCreateBillingRequest } from './hooks'
import type { BillingRequestFilters, BillingRequestStatus } from './types'
import { billingRequestStatusLabel } from './status'

const field = 'h-11 w-full rounded-xl border border-[color:var(--erp-border)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--erp-brand-gold)]'
const statuses: BillingRequestStatus[] = ['REQUESTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED']

function CreateRequestCard() {
  const navigate = useNavigate()
  const [saleId, setSaleId] = useState('')
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const sale = useSale(saleId)
  const create = useCreateBillingRequest()
  const customerId = sale.data?.customerId ?? undefined
  const disabledReason = !saleId ? 'Selecciona una venta.' : sale.isLoading ? 'Consultando venta…' : !customerId ? 'La venta no tiene cliente.' : sale.data?.status === 'CANCELLED' ? 'La venta está cancelada.' : sale.data?.billingRequestId ? 'La venta ya tiene una solicitud.' : !reason.trim() ? 'Captura el motivo.' : null

  async function submit() {
    if (disabledReason || !customerId) return
    const result = await create.mutateAsync({ saleId, customerId, reason: reason.trim(), notes: notes.trim() || undefined })
    setConfirmOpen(false)
    navigate(`/billing-requests/${result.id}`)
  }

  return <Card className="p-5"><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-[var(--erp-brand-gold-deep)]" />Nueva solicitud</CardTitle><CardDescription>Créala para una venta existente sin escribir identificadores internos de solicitud.</CardDescription></CardHeader><CardContent className="mt-4 grid gap-3">
    <MiniAjaxSelect className={field} endpoint="/sales" label="Venta" onChange={setSaleId} placeholder="Busca por número de venta" value={saleId} />
    <input className={field} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obligatorio" value={reason} />
    <textarea className={`${field} min-h-24 py-3`} onChange={(event) => setNotes(event.target.value)} placeholder="Notas opcionales" value={notes} />
    {disabledReason && <p className="text-xs font-semibold text-[var(--erp-muted-foreground)]">{disabledReason}</p>}
    {create.error && <p className="text-sm font-semibold text-[var(--erp-danger)]">{create.error.message}</p>}
    <Button disabled={Boolean(disabledReason) || create.isPending} onClick={() => setConfirmOpen(true)}>{create.isPending ? 'Creando…' : 'Crear solicitud'}</Button>
  </CardContent><ConfirmationDialog confirmLabel="Crear solicitud" description="Se registrará un control administrativo asociado a la venta. No se emitirá ningún documento fiscal." isLoading={create.isPending} onConfirm={submit} onOpenChange={setConfirmOpen} open={confirmOpen} title="Confirmar solicitud"><p><strong>Venta:</strong> {sale.data?.saleNumber ?? saleId}</p><p><strong>Motivo:</strong> {reason}</p></ConfirmationDialog></Card>
}

export function BillingRequestsPage() {
  const { user } = useAuth()
  const [filters, setFilters] = useState<BillingRequestFilters>({ page: 1, limit: 20 })
  const requests = useBillingRequests(filters)
  const canCreate = user?.role === 'ADMIN' || user?.role === 'SELLER'
  const data = requests.data

  const update = (next: Partial<BillingRequestFilters>) => setFilters((current) => ({ ...current, ...next, page: next.page ?? 1 }))
  return <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl gap-6">
    <header className="overflow-hidden rounded-[1.6rem] bg-[var(--erp-charcoal)] p-6 text-white shadow-[var(--erp-shadow-elevated)]"><p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--erp-brand-gold-soft)]">Control administrativo</p><h1 className="mt-3 text-3xl font-black tracking-[-0.05em] sm:text-4xl">Solicitudes de facturación</h1><p className="mt-3 max-w-3xl text-sm text-white/70">Seguimiento interno asociado a ventas. No representa CFDI, SAT, timbrado ni documento fiscal.</p></header>
    {canCreate && <CreateRequestCard />}
    <Card className="p-5"><CardHeader><CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Filtros operativos</CardTitle></CardHeader><CardContent className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MiniAjaxSelect className={field} endpoint="/customers?isActive=true" label="Cliente" onChange={(customerId) => update({ customerId })} placeholder="Buscar cliente" value={filters.customerId} />
      <MiniAjaxSelect className={field} endpoint="/sales" label="Venta" onChange={(saleId) => update({ saleId })} placeholder="Buscar venta" value={filters.saleId} />
      <select aria-label="Estado" className={field} onChange={(event) => update({ status: event.target.value as BillingRequestStatus | '' })} value={filters.status ?? ''}><option value="">Todos los estados</option>{statuses.map((status) => <option key={status} value={status}>{billingRequestStatusLabel(status)}</option>)}</select>
      <MiniAjaxSelect className={field} endpoint="/locations" label="Ubicación" onChange={(locationId) => update({ locationId })} placeholder="Buscar ubicación" value={filters.locationId} />
      <input aria-label="Fecha inicial" className={field} onChange={(event) => update({ dateFrom: event.target.value })} type="date" value={filters.dateFrom ?? ''} />
      <input aria-label="Fecha final" className={field} onChange={(event) => update({ dateTo: event.target.value })} type="date" value={filters.dateTo ?? ''} />
    </CardContent></Card>
    <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-[color:var(--erp-border)] p-5"><div><CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" />Bandeja de seguimiento</CardTitle><CardDescription>{data?.pagination.total ?? 0} solicitudes encontradas</CardDescription></div><Search className="h-5 w-5 text-[var(--erp-muted-foreground)]" /></div>
      {requests.isLoading && <p className="p-6">Cargando solicitudes…</p>}{requests.error && <p className="p-6 font-semibold text-[var(--erp-danger)]">No se pudieron cargar las solicitudes.</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[var(--erp-surface)] text-xs uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]"><tr><th className="p-4">Venta</th><th className="p-4">Cliente</th><th className="p-4">Estado</th><th className="p-4">Motivo</th><th className="p-4">Solicitada</th><th className="p-4">Acción</th></tr></thead><tbody>{data?.items.map((item) => <tr className="border-t border-[color:var(--erp-border)]" key={item.id}><td className="p-4 font-black">{item.saleNumber ?? item.saleId}</td><td className="p-4">{item.customerName ?? item.customerId}</td><td className="p-4"><BillingRequestStatusBadge status={item.status} /></td><td className="max-w-sm p-4">{item.reason ?? '—'}</td><td className="p-4">{new Date(item.requestedAt).toLocaleDateString('es-MX')}</td><td className="p-4"><Link className="font-black text-[var(--erp-info)]" to={`/billing-requests/${item.id}`}>Ver detalle</Link></td></tr>)}</tbody></table></div>
      {!requests.isLoading && !data?.items.length && <p className="p-8 text-center text-[var(--erp-muted-foreground)]">No hay solicitudes con estos filtros.</p>}
      <div className="flex items-center justify-between border-t border-[color:var(--erp-border)] p-4"><Button disabled={(filters.page ?? 1) <= 1} onClick={() => update({ page: (filters.page ?? 1) - 1 })} variant="outline">Anterior</Button><span className="text-sm font-bold">Página {data?.pagination.page ?? 1} de {data?.pagination.totalPages ?? 1}</span><Button disabled={(filters.page ?? 1) >= (data?.pagination.totalPages ?? 1)} onClick={() => update({ page: (filters.page ?? 1) + 1 })} variant="outline">Siguiente</Button></div>
    </Card>
  </div></main>
}
