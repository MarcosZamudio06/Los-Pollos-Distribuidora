import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useSaveCustomer } from '../hooks/useCustomers'
import type { Customer, CustomerFormValues, CustomerType, CreditStatus } from '../types'

type Props = { canManageCommercialTerms: boolean; customer?: Customer | null; onClose: () => void }

function numberOrNull(value: string | number | null | undefined) { const numberValue = Number(value ?? 0); return Number.isFinite(numberValue) ? numberValue : null }
function toValues(customer?: Customer | null): CustomerFormValues { return { customerNumber: customer?.customerNumber ?? '', name: customer?.name ?? '', commercialName: customer?.commercialName ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '', billingEmail: customer?.billingEmail ?? '', address: customer?.address ?? '', customerType: customer?.customerType ?? 'RETAIL', priceListId: customer?.priceListId ?? '', creditLimit: customer?.creditLimit == null ? null : numberOrNull(customer.creditLimit), creditDays: customer?.creditDays ?? null, creditStatus: (customer?.creditStatus as CreditStatus | undefined) ?? 'ACTIVE', requiresBilling: customer?.requiresBilling ?? false, deliveryAddress: customer?.deliveryAddress ?? '', assignedRouteId: customer?.assignedRouteId ?? '', commercialPolicyId: customer?.commercialPolicyId ?? '', fiscalName: customer?.fiscalName ?? '', taxId: customer?.taxId ?? '', fiscalAddress: customer?.fiscalAddress ?? '' } }
function validEmail(value: string) { return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) }

export function CustomerFormModal({ canManageCommercialTerms, customer, onClose }: Props) {
  const [values, setValues] = useState<CustomerFormValues>(() => toValues(customer))
  const [error, setError] = useState<string | null>(null)
  const saveCustomer = useSaveCustomer(customer?.id, canManageCommercialTerms)

  function validate() {
    if (!values.name.trim()) return 'El nombre del cliente es obligatorio.'
    if (!validEmail(values.email)) return 'El email no tiene un formato válido.'
    if (!validEmail(values.billingEmail)) return 'El email de facturación no tiene un formato válido.'
    if (!values.customerType) return 'El tipo de cliente es obligatorio.'
    if ((values.creditLimit ?? 0) < 0) return 'El límite de crédito no puede ser negativo.'
    if ((values.creditDays ?? 0) < 0) return 'Los días de crédito no pueden ser negativos.'
    return null
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validationError = validate()
    if (validationError) return setError(validationError)
    try { await saveCustomer.mutateAsync(values); onClose() } catch (caughtError) { setError(caughtError instanceof Error ? caughtError.message : 'No se pudo guardar el cliente.') }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(17,24,21,0.58)] px-4 py-8 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="mx-auto grid max-w-4xl gap-5 overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] bg-white p-6 shadow-2xl">
        <header className="flex justify-between gap-4 border-b border-[color:var(--erp-border)] pb-5"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--erp-info)]">Clientes</p><h2 className="text-3xl font-black tracking-[-0.05em]">{customer ? 'Editar cliente' : 'Nuevo cliente'}</h2><p className="mt-2 text-sm text-[var(--erp-muted-foreground)]"></p></div><button className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-white text-[var(--erp-muted-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:text-[var(--erp-foreground)]" onClick={onClose} type="button" aria-label="Cerrar"><X className="h-4 w-4" /></button></header>
        {error && <p role="alert" className="rounded-2xl bg-[rgba(157,45,36,0.10)] p-3 text-sm font-semibold text-[var(--erp-danger)]">{error}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-semibold">Número interno<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.customerNumber} onChange={(event) => setValues({ ...values, customerNumber: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold md:col-span-2">Nombre<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Nombre comercial<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.commercialName} onChange={(event) => setValues({ ...values, commercialName: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Teléfono<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Tipo<select className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.customerType} onChange={(event) => setValues({ ...values, customerType: event.target.value as CustomerType })}><option value="RETAIL">Minorista</option><option value="WHOLESALE">Mayorista</option><option value="INSTITUTIONAL">Institucional</option></select></label>
          <label className="grid gap-2 text-sm font-semibold">Email<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Email de facturación<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" type="email" value={values.billingEmail} onChange={(event) => setValues({ ...values, billingEmail: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Lista de precios<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.priceListId} onChange={(event) => setValues({ ...values, priceListId: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold md:col-span-3">Dirección<textarea className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.address} onChange={(event) => setValues({ ...values, address: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Límite de crédito<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:bg-[var(--erp-surface-muted)]" disabled={!canManageCommercialTerms} min="0" type="number" value={values.creditLimit ?? ''} onChange={(event) => setValues({ ...values, creditLimit: event.target.value === '' ? null : Number(event.target.value) })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Días de crédito<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:bg-[var(--erp-surface-muted)]" disabled={!canManageCommercialTerms} min="0" type="number" value={values.creditDays ?? ''} onChange={(event) => setValues({ ...values, creditDays: event.target.value === '' ? null : Number(event.target.value) })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Estado de crédito<select className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:bg-[var(--erp-surface-muted)]" disabled={!canManageCommercialTerms} value={values.creditStatus} onChange={(event) => setValues({ ...values, creditStatus: event.target.value as CreditStatus })}><option value="ACTIVE">Activo</option><option value="BLOCKED">Bloqueado</option><option value="SUSPENDED">Suspendido</option></select></label>
          <label className="grid gap-2 text-sm font-semibold">Ruta asignada<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.assignedRouteId} onChange={(event) => setValues({ ...values, assignedRouteId: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Política comercial<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:bg-[var(--erp-surface-muted)]" disabled={!canManageCommercialTerms} value={values.commercialPolicyId} onChange={(event) => setValues({ ...values, commercialPolicyId: event.target.value })} /></label>
          <label className="flex items-center gap-3 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 text-sm font-semibold"><input checked={values.requiresBilling} type="checkbox" onChange={(event) => setValues({ ...values, requiresBilling: event.target.checked })} /> Requiere facturación administrativa</label>
          <label className="grid gap-2 text-sm font-semibold md:col-span-3">Dirección de entrega<textarea className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.deliveryAddress} onChange={(event) => setValues({ ...values, deliveryAddress: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Razón social<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.fiscalName} onChange={(event) => setValues({ ...values, fiscalName: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">RFC<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.taxId} onChange={(event) => setValues({ ...values, taxId: event.target.value })} /></label>
          <label className="grid gap-2 text-sm font-semibold">Dirección fiscal<input className="rounded-xl border border-[color:var(--erp-border)] bg-white p-3 transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)]" value={values.fiscalAddress} onChange={(event) => setValues({ ...values, fiscalAddress: event.target.value })} /></label>
        </div>
        <button disabled={saveCustomer.isPending} className="justify-self-end rounded-xl bg-[var(--erp-charcoal)] px-5 py-3 font-black text-white transition hover:bg-[var(--erp-graphite)] disabled:opacity-60">Guardar cliente</button>
      </form>
    </div>
  )
}
