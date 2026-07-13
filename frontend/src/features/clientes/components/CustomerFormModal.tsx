import { useMemo, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useCommercialPolicies, useSaveCustomer } from '../hooks/useCustomers'
import { useDeliveryRoutes } from '../../rutas-reparto/hooks'
import type { Customer, CustomerType, CreditStatus } from '../types'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { toast } from 'sonner'
import {
  cleanCustomerNumber,
  cleanEmail,
  cleanTaxId,
  collapseSpaces,
  firstCustomerFormErrorField,
  formatCreditDaysInput,
  formatCurrencyDisplay,
  formatMexicanPhone,
  hasCustomerFormErrors,
  normalizeCurrencyInput,
  toCustomerFormDraft,
  toCustomerFormValues,
  validateCustomerField,
  validateCustomerForm,
  type CustomerFormCatalogs,
  type CustomerFormDraft,
  type CustomerFormErrors,
  type CustomerFormField,
} from '../customerFormUtils'

type Props = { canManageCommercialTerms: boolean; customer?: Customer | null; onClose: () => void }

const fieldBaseClass =
  'h-11 w-full rounded-xl border border-[color:var(--erp-border)] bg-white px-3.5 text-sm text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition placeholder:text-[var(--erp-muted-foreground)]/70 focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:cursor-not-allowed disabled:bg-[var(--erp-surface-muted)] disabled:opacity-70'
const validFieldClass = 'border-[rgba(33,150,83,0.42)] focus:border-[rgba(33,150,83,0.42)] focus:ring-[rgba(33,150,83,0.10)]'
const invalidFieldClass = 'border-[rgba(157,45,36,0.50)] focus:border-[rgba(157,45,36,0.60)] focus:ring-[rgba(157,45,36,0.12)]'
const textareaClass = cn(fieldBaseClass, 'h-auto min-h-24 py-3')

const customerTypeOptions: Array<{ value: CustomerType; label: string }> = [
  { value: 'RETAIL', label: 'Minorista' },
  { value: 'WHOLESALE', label: 'Mayorista' },
  { value: 'INSTITUTIONAL', label: 'Institucional' },
]

const creditStatusOptions: Array<{ value: CreditStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'BLOCKED', label: 'Bloqueado' },
  { value: 'SUSPENDED', label: 'Suspendido' },
]

function inputClass(hasError: boolean, isValid: boolean) {
  return cn(fieldBaseClass, hasError ? invalidFieldClass : isValid ? validFieldClass : null)
}

function textareaFieldClass(hasError: boolean, isValid: boolean) {
  return cn(textareaClass, hasError ? invalidFieldClass : isValid ? validFieldClass : null)
}

function getFieldId(field: CustomerFormField) {
  return `customer-form-${field}`
}

function getErrorId(field: CustomerFormField) {
  return `${getFieldId(field)}-error`
}

function getHelpId(field: CustomerFormField) {
  return `${getFieldId(field)}-help`
}

function mergeDescribedBy(field: CustomerFormField, hasError: boolean, hasHelp: boolean) {
  return [hasError ? getErrorId(field) : null, hasHelp ? getHelpId(field) : null].filter(Boolean).join(' ') || undefined
}

function sanitizeText(value: string) {
  return collapseSpaces(value)
}

function validationCatalogs(routes: Array<{ id: string }>, policies: Array<{ id: string }>): CustomerFormCatalogs {
  return {
    deliveryRouteIds: new Set(routes.map((route) => route.id)),
    commercialPolicyIds: new Set(policies.map((policy) => policy.id)),
  }
}

export function CustomerFormModal({ canManageCommercialTerms, customer, onClose }: Props) {
  const [draft, setDraft] = useState<CustomerFormDraft>(() => toCustomerFormDraft(customer))
  const [errors, setErrors] = useState<CustomerFormErrors>({})
  const [touched, setTouched] = useState<Partial<Record<CustomerFormField, boolean>>>({})
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [creditLimitFocused, setCreditLimitFocused] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [pendingCustomer, setPendingCustomer] = useState<ReturnType<typeof toCustomerFormValues> | null>(null)

  const saveCustomer = useSaveCustomer(customer?.id, canManageCommercialTerms)
  const routes = useDeliveryRoutes({ limit: 100, page: 1 })
  const commercialPolicies = useCommercialPolicies()

  const routeOptions = useMemo(() => routes.data?.items ?? [], [routes.data])
  const policyOptions = useMemo(() => commercialPolicies.data ?? [], [commercialPolicies.data])
  const catalogs = useMemo(() => validationCatalogs(routeOptions, policyOptions), [policyOptions, routeOptions])
  const activeError = submitError ?? (hasCustomerFormErrors(errors) ? 'Corrige los campos marcados antes de guardar.' : null)

  function setDraftField(field: CustomerFormField, nextValue: string | boolean, transform?: (value: string) => string) {
    const normalizedValue = typeof nextValue === 'string' && transform ? transform(nextValue) : nextValue
    const nextDraft = { ...draft, [field]: normalizedValue } as CustomerFormDraft
    setDraft(nextDraft)
    if (touched[field] || isSubmitted) {
      const nextError = validateCustomerField(field, nextDraft, catalogs, canManageCommercialTerms)
      setErrors((current) => ({ ...current, [field]: nextError ?? undefined }))
    }
    setSubmitError(null)
  }

  function markTouched(field: CustomerFormField) {
    setTouched((current) => ({ ...current, [field]: true }))
    const nextError = validateCustomerField(field, draft, catalogs, canManageCommercialTerms)
    setErrors((current) => ({ ...current, [field]: nextError ?? undefined }))
  }

  function setMoneyField(rawValue: string) {
    const normalized = normalizeCurrencyInput(rawValue)
    const nextDraft = { ...draft, creditLimit: normalized } as CustomerFormDraft
    setDraft(nextDraft)
    if (touched.creditLimit || isSubmitted) {
      const nextError = validateCustomerField('creditLimit', nextDraft, catalogs, canManageCommercialTerms)
      setErrors((current) => ({ ...current, creditLimit: nextError ?? undefined }))
    }
    setSubmitError(null)
  }

  function blurMoneyField() {
    setTouched((current) => ({ ...current, creditLimit: true }))
    setCreditLimitFocused(false)
    const nextDraft = { ...draft, creditLimit: formatCurrencyDisplay(draft.creditLimit) || draft.creditLimit } as CustomerFormDraft
    setDraft(nextDraft)
    const nextError = validateCustomerField('creditLimit', nextDraft, catalogs, canManageCommercialTerms)
    setErrors((current) => ({ ...current, creditLimit: nextError ?? undefined }))
  }

  function validateCurrentForm(nextDraft: CustomerFormDraft) {
    const nextErrors = validateCustomerForm(nextDraft, catalogs, canManageCommercialTerms)
    setErrors(nextErrors)
    setTouched({
      customerNumber: true,
      name: true,
      commercialName: true,
      phone: true,
      email: true,
      billingEmail: true,
      customerType: true,
      priceListId: true,
      creditLimit: true,
      creditDays: true,
      creditStatus: true,
      deliveryAddress: true,
      assignedRouteId: true,
      commercialPolicyId: true,
      fiscalName: true,
      taxId: true,
      fiscalAddress: true,
      address: true,
    })
    return nextErrors
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitted(true)
    setSubmitError(null)

    const nextDraft = { ...draft, creditLimit: creditLimitFocused ? normalizeCurrencyInput(draft.creditLimit) : draft.creditLimit } as CustomerFormDraft
    const nextErrors = validateCurrentForm(nextDraft)
    if (hasCustomerFormErrors(nextErrors)) {
      const firstField = firstCustomerFormErrorField(nextErrors)
      if (firstField) {
        document.getElementById(getFieldId(firstField))?.focus()
      }
      return
    }

    const payload = toCustomerFormValues(nextDraft)
    if (!customer) {
      setPendingCustomer(payload)
      return
    }
    try {
      await saveCustomer.mutateAsync(payload)
      toast.success('Cliente actualizado correctamente.')
      onClose()
    } catch (caughtError) {
      setSubmitError(caughtError instanceof Error ? caughtError.message : 'No se pudo guardar el cliente.')
    }
  }

  async function confirmRegistration() {
    if (!pendingCustomer || saveCustomer.isPending) return
    try {
      await saveCustomer.mutateAsync(pendingCustomer)
      toast.success('Cliente registrado correctamente.')
      setPendingCustomer(null)
      onClose()
    } catch (caughtError) {
      setSubmitError(caughtError instanceof Error ? caughtError.message : 'No se pudo guardar el cliente.')
    }
  }

  const creditLimitDisplay = creditLimitFocused ? draft.creditLimit : formatCurrencyDisplay(draft.creditLimit)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[rgba(17,24,21,0.58)] px-4 py-8 backdrop-blur-sm">
      <form
        className="mx-auto grid max-w-5xl gap-5 overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] bg-white p-6 shadow-2xl"
        noValidate
        onSubmit={handleSubmit}
      >
        <header className="flex justify-between gap-4 border-b border-[color:var(--erp-border)] pb-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--erp-info)]">Clientes</p>
            <h2 className="text-3xl font-black tracking-[-0.05em]">{customer ? 'Editar cliente' : 'Nuevo cliente'}</h2>
            <p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Captura validada para formato empresarial en México, con RFC, teléfono y crédito controlados desde el formulario.</p>
          </div>
          <button
            aria-label="Cerrar"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-white text-[var(--erp-muted-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:text-[var(--erp-foreground)]"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {activeError && (
          <p className="rounded-2xl bg-[rgba(157,45,36,0.10)] p-3 text-sm font-semibold text-[var(--erp-danger)]" role="alert">
            {activeError}
          </p>
        )}

        <fieldset className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('customerNumber')}>
              Número interno
              <Input
                aria-describedby={mergeDescribedBy('customerNumber', Boolean(errors.customerNumber), false)}
                aria-invalid={Boolean(errors.customerNumber)}
                autoComplete="off"
                className={inputClass(Boolean(errors.customerNumber), Boolean(touched.customerNumber && draft.customerNumber && !errors.customerNumber))}
                id={getFieldId('customerNumber')}
                onBlur={() => markTouched('customerNumber')}
                onChange={(event) => setDraftField('customerNumber', event.target.value, cleanCustomerNumber)}
                placeholder="CLI-000123"
                value={draft.customerNumber}
              />
              {errors.customerNumber && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('customerNumber')}>{errors.customerNumber}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold md:col-span-2" htmlFor={getFieldId('name')}>
              Nombre
              <Input
                aria-describedby={mergeDescribedBy('name', Boolean(errors.name), false)}
                aria-invalid={Boolean(errors.name)}
                autoComplete="organization"
                className={inputClass(Boolean(errors.name), Boolean(touched.name && draft.name && !errors.name))}
                id={getFieldId('name')}
                onBlur={() => markTouched('name')}
                onChange={(event) => setDraftField('name', event.target.value, sanitizeText)}
                placeholder="Pollería Los Hermanos"
                required
                value={draft.name}
              />
              {errors.name && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('name')}>{errors.name}</span>}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('commercialName')}>
              Nombre comercial
              <Input
                aria-describedby={mergeDescribedBy('commercialName', Boolean(errors.commercialName), false)}
                aria-invalid={Boolean(errors.commercialName)}
                autoComplete="organization"
                className={inputClass(Boolean(errors.commercialName), Boolean(touched.commercialName && draft.commercialName && !errors.commercialName))}
                id={getFieldId('commercialName')}
                onBlur={() => markTouched('commercialName')}
                onChange={(event) => setDraftField('commercialName', event.target.value, sanitizeText)}
                placeholder="Pollería Los Hermanos"
                value={draft.commercialName}
              />
              {errors.commercialName && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('commercialName')}>{errors.commercialName}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('phone')}>
              Teléfono
              <Input
                aria-describedby={mergeDescribedBy('phone', Boolean(errors.phone), true)}
                aria-invalid={Boolean(errors.phone)}
                autoComplete="tel"
                className={inputClass(Boolean(errors.phone), Boolean(touched.phone && draft.phone.length === 10 && !errors.phone))}
                id={getFieldId('phone')}
                inputMode="tel"
                onBlur={() => markTouched('phone')}
                onChange={(event) => setDraftField('phone', event.target.value, formatMexicanPhone)}
                placeholder="229 123 4567"
                value={formatMexicanPhone(draft.phone)}
              />
              <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('phone')}>Captura nacional de 10 dígitos. El sistema guarda solo números.</span>
              {errors.phone && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('phone')}>{errors.phone}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('customerType')}>
              Tipo
              <Select
                aria-describedby={mergeDescribedBy('customerType', Boolean(errors.customerType), false)}
                aria-invalid={Boolean(errors.customerType)}
                className={inputClass(Boolean(errors.customerType), Boolean(touched.customerType && draft.customerType && !errors.customerType))}
                id={getFieldId('customerType')}
                onBlur={() => markTouched('customerType')}
                onChange={(event) => setDraftField('customerType', event.target.value)}
                value={draft.customerType}
              >
                <option value="">Selecciona un tipo</option>
                {customerTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              {errors.customerType && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('customerType')}>{errors.customerType}</span>}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('email')}>
              Email
              <Input
                aria-describedby={mergeDescribedBy('email', Boolean(errors.email), false)}
                aria-invalid={Boolean(errors.email)}
                autoComplete="email"
                className={inputClass(Boolean(errors.email), Boolean(touched.email && draft.email && !errors.email))}
                id={getFieldId('email')}
                inputMode="email"
                onBlur={() => markTouched('email')}
                onChange={(event) => setDraftField('email', event.target.value, cleanEmail)}
                placeholder="cliente@empresa.com.mx"
                type="email"
                value={draft.email}
              />
              {errors.email && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('email')}>{errors.email}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('billingEmail')}>
              Email de facturación
              <Input
                aria-describedby={mergeDescribedBy('billingEmail', Boolean(errors.billingEmail), false)}
                aria-invalid={Boolean(errors.billingEmail)}
                autoComplete="email"
                className={inputClass(Boolean(errors.billingEmail), Boolean(touched.billingEmail && draft.billingEmail && !errors.billingEmail))}
                id={getFieldId('billingEmail')}
                inputMode="email"
                onBlur={() => markTouched('billingEmail')}
                onChange={(event) => setDraftField('billingEmail', event.target.value, cleanEmail)}
                placeholder="cliente@empresa.com.mx"
                type="email"
                value={draft.billingEmail}
              />
              {errors.billingEmail && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('billingEmail')}>{errors.billingEmail}</span>}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('priceListId')}>
              Lista de precios
              <Input
                aria-describedby={mergeDescribedBy('priceListId', Boolean(errors.priceListId), false)}
                aria-invalid={Boolean(errors.priceListId)}
                autoComplete="off"
                className={inputClass(Boolean(errors.priceListId), Boolean(touched.priceListId && draft.priceListId && !errors.priceListId))}
                id={getFieldId('priceListId')}
                onBlur={() => markTouched('priceListId')}
                onChange={(event) => setDraftField('priceListId', event.target.value, sanitizeText)}
                placeholder="PL-MAYOREO-01"
                value={draft.priceListId}
              />
              {errors.priceListId && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('priceListId')}>{errors.priceListId}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('assignedRouteId')}>
              Ruta asignada
              <Select
                aria-describedby={mergeDescribedBy('assignedRouteId', Boolean(errors.assignedRouteId), false)}
                aria-invalid={Boolean(errors.assignedRouteId)}
                className={inputClass(Boolean(errors.assignedRouteId), Boolean(touched.assignedRouteId && draft.assignedRouteId && !errors.assignedRouteId))}
                disabled={routes.isLoading || Boolean(routes.error)}
                id={getFieldId('assignedRouteId')}
                onBlur={() => markTouched('assignedRouteId')}
                onChange={(event) => setDraftField('assignedRouteId', event.target.value, sanitizeText)}
                value={draft.assignedRouteId}
              >
                <option value="">{routes.isLoading ? 'Cargando rutas...' : 'Selecciona una ruta'}</option>
                {routeOptions.map((route) => (
                  <option key={route.id} value={route.id}>{route.name}</option>
                ))}
              </Select>
              {routes.error && <span className="text-xs font-medium text-[var(--erp-danger)]">No se pudieron cargar las rutas disponibles.</span>}
              {errors.assignedRouteId && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('assignedRouteId')}>{errors.assignedRouteId}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('commercialPolicyId')}>
              Política comercial
              <Select
                aria-describedby={mergeDescribedBy('commercialPolicyId', Boolean(errors.commercialPolicyId), false)}
                aria-invalid={Boolean(errors.commercialPolicyId)}
                className={inputClass(Boolean(errors.commercialPolicyId), Boolean(touched.commercialPolicyId && draft.commercialPolicyId && !errors.commercialPolicyId))}
                disabled={!canManageCommercialTerms || commercialPolicies.isLoading || Boolean(commercialPolicies.error)}
                id={getFieldId('commercialPolicyId')}
                onBlur={() => markTouched('commercialPolicyId')}
                onChange={(event) => setDraftField('commercialPolicyId', event.target.value, sanitizeText)}
                value={draft.commercialPolicyId}
              >
                <option value="">{commercialPolicies.isLoading ? 'Cargando políticas...' : 'Selecciona una política'}</option>
                {policyOptions.map((policy) => (
                  <option key={policy.id} value={policy.id}>{policy.name}</option>
                ))}
              </Select>
              {commercialPolicies.error && <span className="text-xs font-medium text-[var(--erp-danger)]">No se pudieron cargar las políticas comerciales.</span>}
              {errors.commercialPolicyId && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('commercialPolicyId')}>{errors.commercialPolicyId}</span>}
            </label>
          </div>

          <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('address')}>
            Dirección
            <textarea
              aria-describedby={mergeDescribedBy('address', Boolean(errors.address), false)}
              aria-invalid={Boolean(errors.address)}
              className={textareaFieldClass(Boolean(errors.address), Boolean(touched.address && draft.address && !errors.address))}
              id={getFieldId('address')}
              onBlur={() => markTouched('address')}
              onChange={(event) => setDraftField('address', event.target.value, sanitizeText)}
              placeholder="Av. Independencia #245, Col. Centro, Veracruz, Ver."
              value={draft.address}
            />
            {errors.address && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('address')}>{errors.address}</span>}
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('creditLimit')}>
              Límite de crédito
              <Input
                aria-describedby={mergeDescribedBy('creditLimit', Boolean(errors.creditLimit), true)}
                aria-invalid={Boolean(errors.creditLimit)}
                className={inputClass(Boolean(errors.creditLimit), Boolean(touched.creditLimit && draft.creditLimit && !errors.creditLimit))}
                disabled={!canManageCommercialTerms}
                id={getFieldId('creditLimit')}
                inputMode="decimal"
                onBlur={blurMoneyField}
                onChange={(event) => setMoneyField(event.target.value)}
                onFocus={() => {
                  setCreditLimitFocused(true)
                  setDraft((current) => ({ ...current, creditLimit: normalizeCurrencyInput(current.creditLimit) }))
                }}
                placeholder="25,000.00"
                value={creditLimitFocused ? draft.creditLimit : creditLimitDisplay}
              />
              <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('creditLimit')}>Se guarda como monto numérico y siempre se muestra con separador de miles y dos decimales.</span>
              {errors.creditLimit && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('creditLimit')}>{errors.creditLimit}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('creditDays')}>
              Días de crédito
              <Input
                aria-describedby={mergeDescribedBy('creditDays', Boolean(errors.creditDays), true)}
                aria-invalid={Boolean(errors.creditDays)}
                className={inputClass(Boolean(errors.creditDays), Boolean(touched.creditDays && draft.creditDays && !errors.creditDays))}
                disabled={!canManageCommercialTerms}
                id={getFieldId('creditDays')}
                inputMode="numeric"
                onBlur={() => markTouched('creditDays')}
                onChange={(event) => setDraftField('creditDays', event.target.value, formatCreditDaysInput)}
                placeholder="30"
                value={draft.creditDays}
              />
              <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('creditDays')}>Rango recomendado para ERP: 0 a 365 días.</span>
              {errors.creditDays && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('creditDays')}>{errors.creditDays}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('creditStatus')}>
              Estado de crédito
              <Select
                aria-describedby={mergeDescribedBy('creditStatus', Boolean(errors.creditStatus), false)}
                aria-invalid={Boolean(errors.creditStatus)}
                className={inputClass(Boolean(errors.creditStatus), Boolean(touched.creditStatus && draft.creditStatus && !errors.creditStatus))}
                disabled={!canManageCommercialTerms}
                id={getFieldId('creditStatus')}
                onBlur={() => markTouched('creditStatus')}
                onChange={(event) => setDraftField('creditStatus', event.target.value)}
                value={draft.creditStatus}
              >
                <option value="">Selecciona un estado</option>
                {creditStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>
              {errors.creditStatus && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('creditStatus')}>{errors.creditStatus}</span>}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('deliveryAddress')}>
              Dirección de entrega
              <textarea
                aria-describedby={mergeDescribedBy('deliveryAddress', Boolean(errors.deliveryAddress), false)}
                aria-invalid={Boolean(errors.deliveryAddress)}
                className={textareaFieldClass(Boolean(errors.deliveryAddress), Boolean(touched.deliveryAddress && draft.deliveryAddress && !errors.deliveryAddress))}
                id={getFieldId('deliveryAddress')}
                onBlur={() => markTouched('deliveryAddress')}
                onChange={(event) => setDraftField('deliveryAddress', event.target.value, sanitizeText)}
                placeholder="Av. Independencia #245, Col. Centro, Veracruz, Ver."
                value={draft.deliveryAddress}
              />
              {errors.deliveryAddress && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('deliveryAddress')}>{errors.deliveryAddress}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('fiscalName')}>
              Razón social
              <Input
                aria-describedby={mergeDescribedBy('fiscalName', Boolean(errors.fiscalName), false)}
                aria-invalid={Boolean(errors.fiscalName)}
                autoComplete="organization"
                className={inputClass(Boolean(errors.fiscalName), Boolean(touched.fiscalName && draft.fiscalName && !errors.fiscalName))}
                id={getFieldId('fiscalName')}
                onBlur={() => markTouched('fiscalName')}
                onChange={(event) => setDraftField('fiscalName', event.target.value, sanitizeText)}
                placeholder="Comercializadora del Golfo S.A. de C.V."
                value={draft.fiscalName}
              />
              {errors.fiscalName && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('fiscalName')}>{errors.fiscalName}</span>}
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('taxId')}>
              RFC
              <Input
                aria-describedby={mergeDescribedBy('taxId', Boolean(errors.taxId), true)}
                aria-invalid={Boolean(errors.taxId)}
                autoComplete="off"
                className={inputClass(Boolean(errors.taxId), Boolean(touched.taxId && draft.taxId && !errors.taxId))}
                id={getFieldId('taxId')}
                onBlur={() => markTouched('taxId')}
                onChange={(event) => setDraftField('taxId', event.target.value, cleanTaxId)}
                placeholder="ABC010203AB9"
                value={draft.taxId}
              />
              <span className="text-xs text-[var(--erp-muted-foreground)]" id={getHelpId('taxId')}>RFC SAT: 12 caracteres para persona moral y 13 para persona física.</span>
              {errors.taxId && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('taxId')}>{errors.taxId}</span>}
            </label>

            <label className="grid gap-2 text-sm font-semibold" htmlFor={getFieldId('fiscalAddress')}>
              Dirección fiscal
              <textarea
                aria-describedby={mergeDescribedBy('fiscalAddress', Boolean(errors.fiscalAddress), false)}
                aria-invalid={Boolean(errors.fiscalAddress)}
                className={textareaFieldClass(Boolean(errors.fiscalAddress), Boolean(touched.fiscalAddress && draft.fiscalAddress && !errors.fiscalAddress))}
                id={getFieldId('fiscalAddress')}
                onBlur={() => markTouched('fiscalAddress')}
                onChange={(event) => setDraftField('fiscalAddress', event.target.value, sanitizeText)}
                placeholder="Av. Independencia #245, Col. Centro, Veracruz, Ver."
                value={draft.fiscalAddress}
              />
              {errors.fiscalAddress && <span className="text-xs font-medium text-[var(--erp-danger)]" id={getErrorId('fiscalAddress')}>{errors.fiscalAddress}</span>}
            </label>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-3 text-sm font-semibold">
            <input
              checked={draft.requiresBilling}
              onChange={(event) => setDraftField('requiresBilling', event.target.checked)}
              type="checkbox"
            />
            Requiere facturación administrativa
          </label>
        </fieldset>

        <div className="flex flex-col items-end gap-3 sm:flex-row sm:justify-between">
          <div className="text-xs text-[var(--erp-muted-foreground)]">
            {routes.error || commercialPolicies.error
              ? 'Hay catálogos pendientes de carga; revisa la conexión antes de guardar.'
              : 'Todos los campos relevantes se validan al escribir, al salir del campo y antes de guardar.'}
          </div>
          <button
            className="justify-self-end rounded-xl bg-[var(--erp-charcoal)] px-5 py-3 font-black text-white transition hover:bg-[var(--erp-graphite)] disabled:opacity-60"
            disabled={saveCustomer.isPending || routes.isLoading || commercialPolicies.isLoading}
            type="submit"
          >
            {saveCustomer.isPending ? 'Guardando...' : 'Guardar cliente'}
          </button>
        </div>
      </form>
      <ConfirmationDialog confirmLabel="Confirmar registro" description="Verifique que la información del cliente sea correcta antes de guardarla." isLoading={saveCustomer.isPending} onConfirm={confirmRegistration} onOpenChange={(open) => { if (!open) setPendingCustomer(null) }} open={Boolean(pendingCustomer)} title="Confirmar registro">
        <p><strong>Cliente:</strong> {pendingCustomer?.name}</p><p><strong>Tipo:</strong> {pendingCustomer?.customerType}</p><p><strong>Teléfono:</strong> {pendingCustomer?.phone || '—'}</p>
        {submitError && <p className="font-semibold text-[var(--erp-danger)]" role="alert">{submitError}</p>}
      </ConfirmationDialog>
    </div>
  )
}
