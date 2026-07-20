import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, LoaderCircle, Search } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { useAuth } from '../auth'
import { useBillingRemediations, useResolveBillingRemediation } from './hooks'
import type { BillingRemediationFilters, BillingRemediationItem, BillingRemediationStatus } from './types'

const field = 'h-11 w-full rounded-xl border border-[color:var(--erp-border)] bg-white px-3 text-sm font-semibold outline-none focus:border-[var(--erp-brand-gold)] focus:ring-2 focus:ring-[rgba(214,155,45,.18)]'
const codeLabels: Record<string, string> = {
  MISSING_LEGAL_ENTITY_MAPPING: 'Asignar entidad legal',
  AMBIGUOUS_SALE_DOCUMENT: 'Resolver documentos ambiguos',
  UNALLOCATED_ITEM_AMOUNTS: 'Distribuir importes legacy',
  INVALID_SALE_TOTAL: 'Corregir totales inválidos',
}
function parseFilters(params: URLSearchParams): BillingRemediationFilters { return { page: Number(params.get('page') || 1), limit: 25, status: (params.get('status') || 'OPEN') as BillingRemediationStatus, code: params.get('code') || '', search: params.get('search') || '' } }

export function BillingRemediationsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const filters = useMemo(() => parseFilters(params), [params])
  const query = useBillingRemediations(filters)
  const command = useResolveBillingRemediation()
  const [selected, setSelected] = useState<BillingRemediationItem>()
  const [reason, setReason] = useState('')
  const [applyCorrection, setApplyCorrection] = useState(true)
  const [correction, setCorrection] = useState<Record<string, string>>({})
  const canResolve = user?.role === 'ADMIN'

  function update(next: Partial<BillingRemediationFilters>) { const merged = { ...filters, ...next, page: next.page ?? 1 }; const nextParams = new URLSearchParams(); Object.entries(merged).forEach(([key, value]) => { if (value !== undefined && value !== '') nextParams.set(key, String(value)) }); setParams(nextParams) }
  function open(item: BillingRemediationItem) {
    setSelected(item); setReason(''); setApplyCorrection(true)
    setCorrection(item.code === 'INVALID_SALE_TOTAL' && item.sale ? { subtotal: item.sale.subtotal, discount: item.sale.discount, tax: item.sale.tax, total: item.sale.total } : Object.fromEntries((item.code === 'UNALLOCATED_ITEM_AMOUNTS' ? item.sale?.items ?? [] : []).flatMap((line) => [['subtotal:'+line.id, line.subtotal], ['discount:'+line.id, line.discount], ['tax:'+line.id, line.tax], ['total:'+line.id, line.total]])))
  }
  function buildCorrection() {
    if (!selected || !applyCorrection) return undefined
    if (selected.code === 'MISSING_LEGAL_ENTITY_MAPPING') return correction.legalEntityId ? { legalEntityId: correction.legalEntityId } : undefined
    if (selected.code === 'AMBIGUOUS_SALE_DOCUMENT') return correction.selectedSaleDocumentId ? { selectedSaleDocumentId: correction.selectedSaleDocumentId } : undefined
    if (selected.code === 'INVALID_SALE_TOTAL') return { subtotal: correction.subtotal, discount: correction.discount, tax: correction.tax, total: correction.total }
    if (selected.code === 'UNALLOCATED_ITEM_AMOUNTS') return { items: (selected.sale?.items ?? []).map((line) => ({ saleItemId: line.id, subtotal: correction['subtotal:'+line.id], discount: correction['discount:'+line.id], tax: correction['tax:'+line.id], total: correction['total:'+line.id] })) }
    return undefined
  }
  async function resolve() {
    if (!selected || !reason.trim()) return
    await command.mutateAsync({ id: selected.id, expectedUpdatedAt: selected.updatedAt, reason: reason.trim(), correction: buildCorrection() })
    setSelected(undefined)
  }

  return <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8"><div className="mx-auto grid max-w-[1450px] gap-5">
    <header className="relative overflow-hidden rounded-[1.75rem] bg-[var(--erp-charcoal)] p-6 text-white shadow-[var(--erp-shadow-elevated)] sm:p-8"><div className="absolute inset-y-0 right-0 w-2 bg-[var(--erp-brand-gold)]" /><p className="text-xs font-black uppercase tracking-[.22em] text-[var(--erp-brand-gold-soft)]">Integridad de facturación</p><h1 className="mt-3 text-3xl font-black tracking-[-.05em] sm:text-4xl">Remediaciones contables</h1><p className="mt-2 max-w-3xl text-sm text-white/70">Corrige inconsistencias de origen. El sistema validará nuevamente los datos antes de registrar una resolución.</p></header>
    <Card className="p-5"><div className="grid gap-3 md:grid-cols-3"><label className="relative"><span className="sr-only">Buscar</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--erp-muted-foreground)]" /><input className={`${field} pl-9`} onChange={(event) => update({ search: event.target.value })} placeholder="Venta, código o nota" value={filters.search} /></label><select aria-label="Estado de remediación" className={field} onChange={(event) => update({ status: event.target.value as BillingRemediationStatus })} value={filters.status}><option value="OPEN">Abiertas</option><option value="RESOLVED">Resueltas</option><option value="ALL">Todas</option></select><select aria-label="Tipo de inconsistencia" className={field} onChange={(event) => update({ code: event.target.value })} value={filters.code}><option value="">Todos los tipos</option>{Object.entries(codeLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></div></Card>
    <Card className="overflow-hidden"><div className="border-b border-[color:var(--erp-border)] p-5"><h2 className="text-lg font-black">Bandeja de inconsistencias</h2><p className="text-sm text-[var(--erp-muted-foreground)]">{query.data?.pagination.total ?? 0} registros encontrados</p></div>
      {query.isLoading && <div className="flex items-center justify-center gap-3 p-14"><LoaderCircle className="h-5 w-5 animate-spin" />Cargando remediaciones…</div>}
      {query.error && <div className="p-10 text-center"><p className="font-black text-[var(--erp-danger)]">No se pudieron cargar las remediaciones.</p><Button className="mt-4" onClick={() => void query.refetch()} variant="outline">Reintentar</Button></div>}
      {!query.isLoading && !query.error && !query.data?.items.length && <div className="p-14 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><p className="mt-3 font-black">No hay inconsistencias con estos filtros</p></div>}
      {!!query.data?.items.length && <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[var(--erp-surface)] text-xs uppercase tracking-[.12em] text-[var(--erp-muted-foreground)]"><tr><th className="p-4">Estado</th><th className="p-4">Inconsistencia</th><th className="p-4">Venta</th><th className="p-4">Detectada</th><th className="p-4">Contexto</th><th className="p-4">Acción</th></tr></thead><tbody>{query.data.items.map((item) => <tr className="border-t border-[color:var(--erp-border)]" key={item.id}><td className="p-4"><span className={`rounded-full px-2.5 py-1 text-xs font-black ${item.resolvedAt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{item.resolvedAt ? 'Resuelta' : 'Abierta'}</span></td><td className="p-4"><strong>{codeLabels[item.code] ?? item.code}</strong><p className="mt-1 font-mono text-xs text-[var(--erp-muted-foreground)]">{item.code}</p></td><td className="p-4"><strong>{item.sale?.saleNumber ?? item.entityId}</strong><p className="text-xs">{item.sale?.legalEntity?.legalName ?? 'Sin entidad legal'}</p></td><td className="p-4">{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</td><td className="max-w-sm p-4"><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(item.details, null, 2)}</pre></td><td className="p-4">{canResolve && !item.resolvedAt ? <Button onClick={() => open(item)}>Resolver inconsistencia</Button> : <span className="text-xs text-[var(--erp-muted-foreground)]">{item.resolutionNotes ?? 'Solo lectura'}</span>}</td></tr>)}</tbody></table></div>}
      <div className="flex items-center justify-between border-t border-[color:var(--erp-border)] p-4"><Button disabled={filters.page <= 1} onClick={() => update({ page: filters.page - 1 })} variant="outline">Anterior</Button><span className="text-sm font-bold">Página {query.data?.pagination.page ?? 1} de {Math.max(query.data?.pagination.totalPages ?? 1, 1)}</span><Button disabled={filters.page >= (query.data?.pagination.totalPages ?? 1)} onClick={() => update({ page: filters.page + 1 })} variant="outline">Siguiente</Button></div>
    </Card>
  </div><ConfirmationDialog confirmDisabled={!reason.trim()} confirmLabel="Validar y resolver" description="La operación corregirá los datos seleccionados y volverá a evaluar la inconsistencia dentro de la misma transacción. Si continúa presente, no se guardará ningún cambio." isLoading={command.isPending} onConfirm={resolve} onOpenChange={(open) => { if (!open) setSelected(undefined) }} open={Boolean(selected)} title="Resolver inconsistencia de datos">
    {selected && <div className="grid gap-4"><div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p>No es un cierre administrativo. La resolución depende de que la validación contable posterior sea satisfactoria.</p></div><label className="flex items-center gap-2 font-bold"><input checked={applyCorrection} onChange={(event) => setApplyCorrection(event.target.checked)} type="checkbox" />Aplicar corrección desde esta bandeja</label>{applyCorrection && <CorrectionFields correction={correction} item={selected} legalEntities={query.data?.legalEntities ?? []} onChange={(key, value) => setCorrection((current) => ({ ...current, [key]: value }))} />}<label className="grid gap-2 font-bold">Motivo de resolución<textarea autoFocus className={`${field} min-h-24 py-3`} onChange={(event) => setReason(event.target.value)} value={reason} /></label>{command.error && <p className="font-bold text-[var(--erp-danger)]">{command.error.message}</p>}</div>}
  </ConfirmationDialog></main>
}

function CorrectionFields({ item, correction, legalEntities, onChange }: { item: BillingRemediationItem; correction: Record<string, string>; legalEntities: Array<{ id: string; legalName: string; taxId: string }>; onChange: (key: string, value: string) => void }) {
  if (item.code === 'MISSING_LEGAL_ENTITY_MAPPING') return <label className="grid gap-2 font-bold">Entidad legal<select className={field} onChange={(event) => onChange('legalEntityId', event.target.value)} value={correction.legalEntityId ?? ''}><option value="">Selecciona una entidad</option>{legalEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.legalName} · {entity.taxId}</option>)}</select></label>
  if (item.code === 'AMBIGUOUS_SALE_DOCUMENT') return <label className="grid gap-2 font-bold">Documento primario<select className={field} onChange={(event) => onChange('selectedSaleDocumentId', event.target.value)} value={correction.selectedSaleDocumentId ?? ''}><option value="">Selecciona el documento correcto</option>{item.sale?.documents.filter((document) => document.status !== 'CANCELLED' && document.documentType === item.sale?.documentType).map((document) => <option key={document.id} value={document.id}>{document.physicalFolio ?? document.id}{document._count.billingRequestDocuments + document._count.invoiceDocuments ? ' · con relaciones contables' : ''}</option>)}</select></label>
  if (item.code === 'INVALID_SALE_TOTAL') return <AmountFields correction={correction} onChange={onChange} />
  if (item.code === 'UNALLOCATED_ITEM_AMOUNTS') return <div className="grid gap-3">{item.sale?.items.map((line) => <fieldset className="rounded-xl border border-[color:var(--erp-border)] p-3" key={line.id}><legend className="px-1 font-black">{line.productNameSnapshot}</legend><AmountFields correction={Object.fromEntries(['subtotal','discount','tax','total'].map((key) => [key, correction[key+':'+line.id]]))} onChange={(key, value) => onChange(key+':'+line.id, value)} /></fieldset>)}</div>
  return <p>Este código solo admite validar una corrección realizada previamente.</p>
}
function AmountFields({ correction, onChange }: { correction: Record<string, string>; onChange: (key: string, value: string) => void }) { return <div className="grid grid-cols-2 gap-2">{[['subtotal','Subtotal'],['discount','Descuento'],['tax','Impuesto'],['total','Total']].map(([key, label]) => <label className="grid gap-1 text-xs font-bold" key={key}>{label}<input className={field} min="0" onChange={(event) => onChange(key, event.target.value)} step="0.01" type="number" value={correction[key] ?? ''} /></label>)}</div> }
