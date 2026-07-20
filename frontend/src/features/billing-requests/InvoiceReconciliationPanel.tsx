import { useMemo, useState } from 'react'
import { FileCheck2 } from 'lucide-react'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@/components/ui'
import { useLinkBillingInvoice } from './hooks'
import { buildInvoiceReconciliation, reconciliationBalances } from './invoiceReconciliation'
import type { BillingRequestDetail, InvoiceReconciliationInput } from './types'

const fieldClass = 'grid gap-1.5 text-xs font-black uppercase tracking-[.08em] text-[var(--erp-muted-foreground)]'
const amountKeys = ['subtotalApplied', 'taxApplied', 'totalApplied'] as const

export function InvoiceReconciliationPanel({ request, role }: { request: BillingRequestDetail; role?: string | null }) {
  const [draft, setDraft] = useState(() => buildInvoiceReconciliation(request))
  const [success, setSuccess] = useState(false)
  const mutation = useLinkBillingInvoice(request.id)
  const balances = useMemo(() => reconciliationBalances(draft), [draft])
  const balanced = Object.values(balances).every((value) => value === 0)
  if ((role !== 'ADMIN' && role !== 'BILLING') || request.status !== 'APPROVED') return null

  const setInvoice = (key: keyof InvoiceReconciliationInput['invoice'], value: string) => setDraft((current) => ({ ...current, invoice: { ...current.invoice, [key]: value } }))
  const setApplication = (documentIndex: number, key: typeof amountKeys[number], value: string) => setDraft((current) => ({ ...current, applications: current.applications.map((item, index) => index === documentIndex ? { ...item, [key]: value } : item) }))
  const setItem = (documentIndex: number, itemIndex: number, key: typeof amountKeys[number], value: string) => setDraft((current) => ({ ...current, applications: current.applications.map((document, index) => index === documentIndex ? { ...document, items: document.items.map((item, indexItem) => indexItem === itemIndex ? { ...item, [key]: value } : item) } : document) }))
  const required = draft.invoice.legalEntityId && draft.invoice.series.trim() && draft.invoice.folio.trim() && Number(draft.invoice.total) > 0 && draft.applications.length > 0

  async function submit() {
    if (!balanced || !required) return
    await mutation.mutateAsync({ ...draft, invoice: { ...draft.invoice, series: draft.invoice.series.trim(), folio: draft.invoice.folio.trim(), uuid: draft.invoice.uuid?.trim() || undefined } })
    setSuccess(true)
  }

  return <Card className="overflow-hidden border-[color:var(--erp-brand-gold)]">
    <CardHeader className="bg-[var(--erp-charcoal)] p-5 text-white">
      <CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-[var(--erp-brand-gold-soft)]" />Conciliación de factura externa</CardTitle>
      <CardDescription className="text-white/70">Registra la factura emitida fuera del sistema y distribuye exactamente sus importes entre notas y partidas.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-6 p-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className={fieldClass}>Serie<Input onChange={(event) => setInvoice('series', event.target.value)} value={draft.invoice.series} /></label>
        <label className={fieldClass}>Folio<Input onChange={(event) => setInvoice('folio', event.target.value)} value={draft.invoice.folio} /></label>
        <label className={`${fieldClass} sm:col-span-2`}>UUID (opcional)<Input onChange={(event) => setInvoice('uuid', event.target.value)} value={draft.invoice.uuid ?? ''} /></label>
        {(['subtotal', 'discount', 'tax', 'total'] as const).map((key) => <label className={fieldClass} key={key}>{key === 'tax' ? 'Impuesto' : key === 'discount' ? 'Descuento' : key === 'subtotal' ? 'Subtotal' : 'Total'}<Input inputMode="decimal" onChange={(event) => setInvoice(key, event.target.value)} value={draft.invoice[key]} /></label>)}
      </section>
      <div className="rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] p-4 text-sm"><strong>Entidad emisora:</strong> {draft.invoice.legalEntityId || 'No disponible'} <span className="mx-2">·</span><strong>Moneda:</strong> {draft.invoice.currencyCode}</div>
      {draft.applications.map((application, documentIndex) => <section className="grid gap-4 rounded-2xl border border-[color:var(--erp-border)] p-4" key={application.saleDocumentId}>
        <div><p className="text-xs font-black uppercase tracking-[.14em] text-[var(--erp-brand-gold-deep)]">Aplicación por nota</p><h3 className="font-black">{application.label}</h3></div>
        <div className="grid gap-3 sm:grid-cols-3">{amountKeys.map((key) => <label className={fieldClass} key={key}>{key === 'taxApplied' ? 'Impuesto aplicado' : key === 'subtotalApplied' ? 'Subtotal aplicado' : 'Total aplicado'}<Input inputMode="decimal" onChange={(event) => setApplication(documentIndex, key, event.target.value)} value={application[key]} /></label>)}</div>
        <div className="grid gap-3">{application.items.map((item, itemIndex) => <div className="grid gap-3 rounded-xl bg-[var(--erp-surface-muted)] p-3 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]" key={item.saleItemId}><p className="self-center text-sm font-bold">{item.productName}</p>{amountKeys.map((key) => <label className={fieldClass} key={key}>{key === 'taxApplied' ? 'Impuesto' : key === 'subtotalApplied' ? 'Subtotal' : 'Total'}<Input inputMode="decimal" onChange={(event) => setItem(documentIndex, itemIndex, key, event.target.value)} value={item[key]} /></label>)}</div>)}</div>
      </section>)}
      {!balanced && <p className="rounded-xl bg-[color:var(--erp-danger-soft)] p-3 text-sm font-bold text-[var(--erp-danger)]">La conciliación no cuadra. Diferencias: subtotal {balances.subtotalDifference.toFixed(2)}, impuesto {balances.taxDifference.toFixed(2)}, total {balances.totalDifference.toFixed(2)}, partidas {balances.itemDifference.toFixed(2)}.</p>}
      {mutation.error && <p className="font-bold text-[var(--erp-danger)]">{mutation.error.message}</p>}
      {success && <p className="font-bold text-[var(--erp-success)]">Factura vinculada y conciliada correctamente.</p>}
      <div className="flex justify-end"><Button disabled={!balanced || !required || mutation.isPending} onClick={submit}>{mutation.isPending ? 'Vinculando…' : 'Vincular factura externa'}</Button></div>
    </CardContent>
  </Card>
}
