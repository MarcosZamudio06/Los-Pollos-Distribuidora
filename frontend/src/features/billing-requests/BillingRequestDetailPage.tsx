import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock3, FileText, ShieldCheck } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { useAuth } from '../auth'
import { BillingRequestStatusBadge } from './BillingRequestStatusBadge'
import { useBillingRequest, useUpdateBillingRequest } from './hooks'
import { availableBillingRequestActions, billingRequestStatusLabel } from './status'
import type { BillingRequestDetail, BillingRequestStatus } from './types'

function RequestEditor({ data, role }: { data: BillingRequestDetail; role?: string | null }) {
  const update = useUpdateBillingRequest(data.id)
  const [reason, setReason] = useState(data.reason ?? '')
  const [notes, setNotes] = useState(data.notes ?? '')
  const actions = availableBillingRequestActions(data.status, role)
  const sellerCanEdit = role === 'SELLER' && data.status === 'REQUESTED'

  async function mutate(status?: BillingRequestStatus) {
    if (!reason.trim()) return
    await update.mutateAsync({ status, reason: reason.trim(), notes: notes.trim() || undefined })
  }

  return (
    <Card className="p-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Información administrativa</CardTitle>
        <CardDescription>El estado no modifica inventario, pagos ni importes de la venta.</CardDescription>
      </CardHeader>
      <CardContent className="mt-4 grid gap-4">
        <label className="grid gap-2 text-sm font-bold">Motivo
          <textarea className="min-h-24 rounded-xl border border-[color:var(--erp-border)] p-3" disabled={!sellerCanEdit && role !== 'ADMIN'} onChange={(event) => setReason(event.target.value)} value={reason} />
        </label>
        <label className="grid gap-2 text-sm font-bold">Notas
          <textarea className="min-h-24 rounded-xl border border-[color:var(--erp-border)] p-3" disabled={!sellerCanEdit && role !== 'ADMIN'} onChange={(event) => setNotes(event.target.value)} value={notes} />
        </label>
        {sellerCanEdit && <Button disabled={!reason.trim() || update.isPending} onClick={() => mutate()}>Guardar cambios</Button>}
        {actions.length > 0 && <div className="flex flex-wrap gap-2">
          {actions.map((status) => <Button disabled={!reason.trim() || update.isPending} key={status} onClick={() => mutate(status)} variant={status === 'CANCELLED' || status === 'REJECTED' ? 'destructive' : 'primary'}>{status === 'IN_REVIEW' ? 'Iniciar revisión' : billingRequestStatusLabel(status)}</Button>)}
        </div>}
        {update.error && <p className="font-semibold text-[var(--erp-danger)]">{update.error.message}</p>}
      </CardContent>
    </Card>
  )
}

export function BillingRequestDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const request = useBillingRequest(id)
  const data = request.data

  if (request.isLoading) return <main className="p-8">Cargando solicitud…</main>
  if (!data || request.error) return <main className="p-8"><p className="font-semibold text-[var(--erp-danger)]">No se encontró la solicitud.</p><Link to="/billing-requests">Volver</Link></main>

  return (
    <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-6">
        <Link className="inline-flex items-center gap-2 font-bold text-[var(--erp-info)]" to="/billing-requests"><ArrowLeft className="h-4 w-4" />Volver a solicitudes</Link>
        <header className="rounded-[1.6rem] bg-[var(--erp-charcoal)] p-6 text-white shadow-[var(--erp-shadow-elevated)]">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--erp-brand-gold-soft)]">Solicitud {data.id}</p><h1 className="mt-3 text-3xl font-black">Venta {data.sale?.saleNumber ?? data.saleNumber ?? data.saleId}</h1><p className="mt-2 text-white/70">{data.customer?.name ?? data.customerName ?? data.customerId}</p></div><BillingRequestStatusBadge status={data.status} /></div>
        </header>
        <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <RequestEditor data={data} key={data.updatedAt} role={user?.role} />
          <Card className="p-5"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Relaciones</CardTitle></CardHeader><CardContent className="mt-4 grid gap-3 text-sm"><p><strong>Venta:</strong> <Link className="text-[var(--erp-info)]" to={`/sales/${data.saleId}`}>{data.sale?.saleNumber ?? data.saleId}</Link></p><p><strong>Cliente:</strong> {data.customer?.name ?? data.customerId}</p><p><strong>Cuenta por cobrar:</strong> {data.accountReceivable?.id ?? 'No aplica'}</p><p><strong>Solicitó:</strong> {data.requestedBy?.name ?? data.requestedByUserId}</p><p><strong>Revisó:</strong> {data.reviewedBy?.name ?? data.reviewedByUserId ?? 'Pendiente'}</p></CardContent></Card>
        </div>
        <Card className="p-5"><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" />Historial de estados</CardTitle><CardDescription>Bitácora cronológica de actor, fecha, motivo y notas.</CardDescription></CardHeader><CardContent className="mt-5 grid gap-4">{data.history?.map((entry) => <article className="relative border-l-2 border-[var(--erp-brand-gold)] pl-5" key={entry.id}><div className="flex flex-wrap items-center gap-2"><BillingRequestStatusBadge status={entry.toStatus} /><span className="text-xs font-semibold text-[var(--erp-muted-foreground)]">{new Date(entry.changedAt).toLocaleString('es-MX')}</span></div><p className="mt-2 font-bold">{entry.reason}</p><p className="text-sm text-[var(--erp-muted-foreground)]">{entry.notes || 'Sin notas'} · {entry.changedBy?.name ?? entry.changedByUserId}</p></article>)}</CardContent></Card>
      </div>
    </main>
  )
}
