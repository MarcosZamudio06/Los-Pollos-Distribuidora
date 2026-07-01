import { useState, type FormEvent } from 'react'
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
    <div className="fixed inset-0 z-20 overflow-y-auto bg-[#20211f]/50 px-4 py-8">
      <form onSubmit={handleSubmit} className="mx-auto grid max-w-4xl gap-5 rounded-[2rem] bg-white p-6 shadow-2xl">
        <header className="flex justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.24em] text-[#39798b]">Clientes</p><h2 className="text-3xl font-black tracking-[-0.05em]">{customer ? 'Editar cliente' : 'Nuevo cliente'}</h2><p className="mt-2 text-sm text-[#68645c]">Los datos fiscales son administrativos del MVP; esta pantalla no emite CFDI.</p></div><button className="font-bold text-[#68645c]" onClick={onClose} type="button">Cerrar</button></header>
        {error && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-3 text-sm font-bold text-[#9d2d24]">{error}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          <label className="grid gap-1 text-sm font-bold">Número interno<input className="rounded-xl border p-3" value={values.customerNumber} onChange={(event) => setValues({ ...values, customerNumber: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold md:col-span-2">Nombre<input className="rounded-xl border p-3" required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Nombre comercial<input className="rounded-xl border p-3" value={values.commercialName} onChange={(event) => setValues({ ...values, commercialName: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Teléfono<input className="rounded-xl border p-3" value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Tipo<select className="rounded-xl border p-3" value={values.customerType} onChange={(event) => setValues({ ...values, customerType: event.target.value as CustomerType })}><option value="RETAIL">Minorista</option><option value="WHOLESALE">Mayorista</option><option value="INSTITUTIONAL">Institucional</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Email<input className="rounded-xl border p-3" type="email" value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Email de facturación<input className="rounded-xl border p-3" type="email" value={values.billingEmail} onChange={(event) => setValues({ ...values, billingEmail: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Lista de precios<input className="rounded-xl border p-3" value={values.priceListId} onChange={(event) => setValues({ ...values, priceListId: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold md:col-span-3">Dirección<textarea className="rounded-xl border p-3" value={values.address} onChange={(event) => setValues({ ...values, address: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Límite de crédito<input className="rounded-xl border p-3 disabled:bg-slate-100" disabled={!canManageCommercialTerms} min="0" type="number" value={values.creditLimit ?? ''} onChange={(event) => setValues({ ...values, creditLimit: event.target.value === '' ? null : Number(event.target.value) })} /></label>
          <label className="grid gap-1 text-sm font-bold">Días de crédito<input className="rounded-xl border p-3 disabled:bg-slate-100" disabled={!canManageCommercialTerms} min="0" type="number" value={values.creditDays ?? ''} onChange={(event) => setValues({ ...values, creditDays: event.target.value === '' ? null : Number(event.target.value) })} /></label>
          <label className="grid gap-1 text-sm font-bold">Estado de crédito<select className="rounded-xl border p-3 disabled:bg-slate-100" disabled={!canManageCommercialTerms} value={values.creditStatus} onChange={(event) => setValues({ ...values, creditStatus: event.target.value as CreditStatus })}><option value="ACTIVE">Activo</option><option value="BLOCKED">Bloqueado</option><option value="SUSPENDED">Suspendido</option></select></label>
          <label className="grid gap-1 text-sm font-bold">Ruta asignada<input className="rounded-xl border p-3" value={values.assignedRouteId} onChange={(event) => setValues({ ...values, assignedRouteId: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Política comercial<input className="rounded-xl border p-3 disabled:bg-slate-100" disabled={!canManageCommercialTerms} value={values.commercialPolicyId} onChange={(event) => setValues({ ...values, commercialPolicyId: event.target.value })} /></label>
          <label className="flex items-center gap-3 rounded-xl border p-3 text-sm font-bold"><input checked={values.requiresBilling} type="checkbox" onChange={(event) => setValues({ ...values, requiresBilling: event.target.checked })} /> Requiere facturación administrativa</label>
          <label className="grid gap-1 text-sm font-bold md:col-span-3">Dirección de entrega<textarea className="rounded-xl border p-3" value={values.deliveryAddress} onChange={(event) => setValues({ ...values, deliveryAddress: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Razón social<input className="rounded-xl border p-3" value={values.fiscalName} onChange={(event) => setValues({ ...values, fiscalName: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">RFC<input className="rounded-xl border p-3" value={values.taxId} onChange={(event) => setValues({ ...values, taxId: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-bold">Dirección fiscal<input className="rounded-xl border p-3" value={values.fiscalAddress} onChange={(event) => setValues({ ...values, fiscalAddress: event.target.value })} /></label>
        </div>
        <button disabled={saveCustomer.isPending} className="rounded-2xl bg-[#20211f] px-5 py-3 font-black text-white disabled:opacity-60">Guardar cliente</button>
      </form>
    </div>
  )
}
