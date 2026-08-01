import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle, Minus, ReceiptText, Search, UserRound, WalletCards } from 'lucide-react'
import { PaymentEntryControl } from '../components'
import { calculateCashChange, calculatePaymentsTotal, getCreditRestriction, toMoney, type CreditRestrictionOptions } from '../posLogic'
import { paymentMethodLabel } from '../saleLabels'
import type { CartItem, CustomerOption, PaymentType, PosTransactionState, SalePaymentInput } from '../types'
import { Money } from '../../../lib/money'

type CheckoutDockProps = {
  cart: CartItem[]
  conditionPanelRef?: RefObject<HTMLElement | null>
  confirmButtonRef?: RefObject<HTMLButtonElement | null>
  creditOptions?: CreditRestrictionOptions
  creditRestriction?: string | null
  customerSearch: string
  customerSearchRef?: RefObject<HTMLInputElement | null>
  customers: CustomerOption[]
  customersError: unknown
  customersLoading: boolean
  disabledReason?: string | null
  isSubmitting: boolean
  onConfirm: () => void
  onCustomerSearchChange: (search: string) => void
  onCustomerSelect: (customer: CustomerOption | null) => void
  onPaymentTypeChange: (type: PaymentType) => void
  onPaymentsChange: (payments: SalePaymentInput[]) => void
  paymentPanelRef?: RefObject<HTMLElement | null>
  paymentType: PaymentType
  payments: SalePaymentInput[]
  selectedCustomer: CustomerOption | null
  total: Money | string | number
  transactionState: PosTransactionState
}

type CheckoutVisualStateKind = 'LOCATION_REQUIRED' | 'CASH_CLOSED' | 'STOCK_INSUFFICIENT' | 'CART_EMPTY' | 'WEIGHT_PENDING' | 'CUSTOMER_REQUIRED' | 'CREDIT_UNVALIDATED' | 'CREDIT_BLOCKED' | 'SUPERVISOR_REQUIRED' | 'PAYMENT_NOT_STARTED' | 'PAYMENT_PARTIAL' | 'READY_TO_CHARGE' | 'PROCESSING' | 'SALE_REGISTERED' | 'TICKET_PRINTED' | 'OFFLINE' | 'BLOCKED'

type CheckoutVisualState = {
  kind: CheckoutVisualStateKind
  reason: string
}

type CheckoutVisualStateInput = Pick<CheckoutDockProps, 'disabledReason' | 'payments' | 'transactionState'>

// eslint-disable-next-line react-refresh/only-export-components
export function selectCheckoutVisualState({ disabledReason, payments, transactionState }: CheckoutVisualStateInput): CheckoutVisualState {
  const reason = disabledReason?.trim() ?? ''
  const normalizedReason = reason.toLocaleLowerCase('es-MX')
  const state = (kind: CheckoutVisualStateKind, fallback = '') => ({ kind, reason: reason || fallback })

  if (normalizedReason.startsWith('selecciona una ubicación')) return state('LOCATION_REQUIRED')
  if (normalizedReason.startsWith('abre un turno de caja') || normalizedReason.startsWith('abre una sesión de caja')) return state('CASH_CLOSED')
  if (/stock|existencia/.test(normalizedReason)) return state('STOCK_INSUFFICIENT')
  if (transactionState === 'EMPTY') return state('CART_EMPTY', 'Agrega al menos un producto.')
  if (transactionState === 'WEIGHT_PENDING') return state('WEIGHT_PENDING')
  if (transactionState === 'CUSTOMER_REQUIRED') return state('CUSTOMER_REQUIRED')
  if (/crédito disponible|excede el crédito|límite de crédito/.test(normalizedReason)) return state('CREDIT_UNVALIDATED')
  if (/crédito.*bloqueado|saldo vencido/.test(normalizedReason)) return state('CREDIT_BLOCKED')
  if (/administrador|autorización administrativa|supervisor/.test(normalizedReason)) return state('SUPERVISOR_REQUIRED')
  if (normalizedReason.startsWith('la venta de contado debe liquidarse')) return state(payments.length === 0 ? 'PAYMENT_NOT_STARTED' : 'PAYMENT_PARTIAL')
  if (transactionState === 'CART_ACTIVE') return state('PAYMENT_NOT_STARTED')
  if (transactionState === 'PAYMENT_PENDING') return state(payments.length === 0 ? 'PAYMENT_NOT_STARTED' : 'PAYMENT_PARTIAL')
  if (transactionState === 'READY_TO_CHARGE') return state('READY_TO_CHARGE')
  if (transactionState === 'PROCESSING') return state('PROCESSING')
  if (transactionState === 'SUCCESS' && normalizedReason.includes('ticket impreso')) return state('TICKET_PRINTED')
  if (transactionState === 'SUCCESS') return state('SALE_REGISTERED')
  if (normalizedReason.includes('sin conexión')) return state('OFFLINE')
  return state('BLOCKED')
}

type PosCustomerSummaryProps = Pick<CheckoutDockProps, 'customerSearch' | 'customerSearchRef' | 'customers' | 'customersError' | 'customersLoading' | 'onCustomerSearchChange' | 'onCustomerSelect' | 'selectedCustomer'> & { visualState: CheckoutVisualState }

function PosCustomerSummary({ customerSearch, customerSearchRef, customers, customersError, customersLoading, onCustomerSearchChange, onCustomerSelect, selectedCustomer, visualState }: PosCustomerSummaryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const searchFieldRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const errorId = 'pos-customer-search-error'
  const isCreditBlocked = selectedCustomer?.isBlockedForCredit || selectedCustomer?.creditSummary?.isBlockedForCredit || selectedCustomer?.creditSummary?.effectiveCreditStatus === 'BLOCKED'
  const overdueAmount = Money.from(selectedCustomer?.creditSummary?.overdueAmount)
  const customerRequired = visualState.kind === 'CUSTOMER_REQUIRED'
  const customerStatus = customerRequired
    ? visualState.reason
    : isCreditBlocked
       ? `Crédito bloqueado${overdueAmount.isPositive() ? ` · Saldo vencido ${toMoney(overdueAmount)}` : ''}`
       : overdueAmount.isPositive()
        ? `Saldo vencido ${toMoney(overdueAmount)}`
        : selectedCustomer
          ? `${selectedCustomer.customerType} · ${selectedCustomer.creditStatus ?? 'Crédito disponible'}`
          : 'Venta de contado'

  useEffect(() => {
    if (!isOpen) return
    searchFieldRef.current?.focus()
  }, [isOpen])

  const selectCustomer = (customer: CustomerOption | null) => {
    onCustomerSelect(customer)
    closePanel()
  }

  const closePanel = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <section className="relative min-h-0 min-w-0 bg-[var(--pos-surface)] p-4 min-[1024px]:max-[1279px]:p-3" aria-label="Cliente de la venta">
      <input aria-label="Abrir selección de cliente" className="sr-only" onFocus={() => setIsOpen(true)} ref={customerSearchRef} tabIndex={-1} />
      <button aria-controls="pos-customer-selection" aria-expanded={isOpen} className="block min-h-11 w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] focus-visible:ring-inset" onClick={() => setIsOpen(true)} ref={triggerRef} type="button">
         <span className="flex items-start gap-2"><UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--pos-neutral)]" /><span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Cliente</span><span className="min-w-0 flex-1 break-words text-sm font-bold leading-tight text-[var(--pos-ink)]">{selectedCustomer?.name ?? 'Público general'}</span><span className="mt-0.5 shrink-0 font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">F4</span></span>
         <span aria-atomic="true" aria-live="polite" className={`mt-1 block break-words text-xs font-semibold leading-tight ${customerRequired || isCreditBlocked ? 'text-[var(--pos-red)]' : overdueAmount.isPositive() ? 'text-[var(--pos-amber)]' : 'text-[var(--pos-muted)]'}`} role={customerRequired || isCreditBlocked ? 'alert' : undefined}>{customerStatus}</span>
      </button>
      {isOpen && <>
        <button aria-label="Cerrar selección de cliente" className="fixed inset-0 z-40 bg-[rgba(22,26,24,0.36)] min-[1440px]:hidden" onClick={closePanel} type="button" />
         <section aria-describedby="pos-customer-selection-description" aria-keyshortcuts="F4" aria-labelledby="pos-customer-selection-title" aria-modal="true" className="fixed inset-x-0 bottom-0 z-50 max-h-[min(86dvh,42rem)] overflow-y-auto border-t border-[var(--pos-steel)] bg-[var(--pos-surface)] p-4 shadow-[0_-18px_42px_rgba(23,33,30,0.14)] min-[1440px]:absolute min-[1440px]:bottom-full min-[1440px]:left-0 min-[1440px]:mb-2 min-[1440px]:max-h-[min(72vh,42rem)] min-[1440px]:w-[min(48rem,calc(100vw-2rem))] min-[1440px]:border min-[1440px]:shadow-[0_18px_40px_rgba(23,33,30,0.16)]" id="pos-customer-selection" onKeyDown={(event) => { if (event.key === 'Escape') closePanel() }} role="dialog">
           <div className="border-b border-[var(--pos-steel)] pb-4">
             <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-green)]">Directorio de clientes · F4</p><h2 className="mt-1 font-[var(--pos-display)] text-xl font-bold uppercase tracking-[-0.02em]" id="pos-customer-selection-title">Seleccionar cliente</h2><p className="mt-1 text-xs text-[var(--pos-muted)]" id="pos-customer-selection-description">Busca por nombre, número o razón social.</p></div><button className="h-11 shrink-0 px-3 text-xs font-bold text-[var(--pos-muted)] transition hover:text-[var(--pos-ink)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)]" onClick={closePanel} type="button">Cerrar</button></div>
             <label className="relative mt-4 block"><span className="sr-only">Buscar cliente registrado</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-5 text-[var(--pos-neutral)]" /><input aria-describedby={customersError ? errorId : 'pos-customer-selection-description'} aria-label="Buscar cliente registrado" className="h-12 w-full border-2 border-[var(--pos-steel)] bg-white pl-10 pr-3 text-sm font-semibold text-[var(--pos-ink)] outline-none transition placeholder:text-[var(--pos-muted)] focus:border-[var(--pos-focus)] focus:ring-2 focus:ring-[rgba(37,99,235,0.14)]" onChange={(event) => onCustomerSearchChange(event.target.value)} placeholder="Nombre, número o razón social" ref={searchFieldRef} value={customerSearch} /></label>
           </div>
           <div className="mt-3 flex items-center justify-between gap-3"><p className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[var(--pos-muted)]">Clientes disponibles</p><span className="text-xs font-semibold text-[var(--pos-muted)]">{customersLoading ? 'Buscando…' : customers.length ? 'Selecciona un cliente' : 'Sin coincidencias'}</span></div>
           {customersLoading && <p className="mt-2 text-xs font-bold text-[var(--pos-green)]" role="status">Cargando clientes...</p>}
           {Boolean(customersError) && <p aria-live="assertive" className="mt-2 text-xs font-bold text-[var(--pos-red)]" id={errorId} role="alert">No se pudo cargar la búsqueda de clientes.</p>}
           <div className="mt-2 grid max-h-[min(48dvh,26rem)] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
             <button aria-current={!selectedCustomer ? 'true' : undefined} className="group min-h-[4.75rem] border-l-2 border-[var(--pos-action)] bg-[var(--pos-surface-secondary)] px-3 py-2.5 text-left transition hover:bg-[var(--pos-porcelain)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] sm:col-span-2" onClick={() => selectCustomer(null)} type="button"><span className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center bg-[var(--pos-action)] text-white"><UserRound aria-hidden="true" className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--pos-ink)]">Público general</span><span className="mt-0.5 block text-xs text-[var(--pos-muted)]">Venta sin cliente registrado</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--pos-muted)] transition-transform group-hover:translate-x-0.5" /></span></button>
             {!customersLoading && !customersError && customers.length === 0 && <div className="border border-dashed border-[var(--pos-steel)] px-3 py-4 text-sm text-[var(--pos-muted)] sm:col-span-2">No encontramos clientes con esa búsqueda. Prueba con otro nombre o número.</div>}
             {customers.map((customer) => {
               const status = customer.creditSummary?.effectiveCreditStatus ?? customer.effectiveCreditStatus
               const isBlocked = status === 'BLOCKED' || customer.creditSummary?.isBlockedForCredit || customer.isBlockedForCredit
               const creditLabel = isBlocked ? 'Crédito bloqueado' : status === 'WARNING' ? 'Advertencia de crédito' : 'Crédito disponible'
               const creditClass = isBlocked ? 'bg-[rgba(182,42,34,0.08)] text-[var(--pos-red)]' : status === 'WARNING' ? 'bg-[rgba(233,167,47,0.16)] text-[#7d5a12]' : 'bg-[rgba(35,113,90,0.08)] text-[var(--pos-green)]'
               const isSelected = selectedCustomer?.id === customer.id
               return <button aria-current={isSelected ? 'true' : undefined} className={`group min-h-[4.75rem] border px-3 py-2.5 text-left transition focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] disabled:cursor-not-allowed disabled:opacity-50 ${isSelected ? 'border-[var(--pos-action)] bg-[rgba(35,113,90,0.08)]' : 'border-[var(--pos-steel)] bg-white hover:border-[var(--pos-green)] hover:bg-[var(--pos-porcelain)]'}`} disabled={customer.isActive === false || customer.active === false} key={customer.id} onClick={() => selectCustomer(customer)} type="button"><span className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center border border-[var(--pos-steel)] bg-[var(--pos-porcelain)] text-[var(--pos-neutral)]"><UserRound aria-hidden="true" className="size-4" /></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-bold text-[var(--pos-ink)]">{customer.name}</span><span className={`shrink-0 px-1.5 py-0.5 text-[0.58rem] font-bold ${creditClass}`}>{creditLabel}</span></span><span className="mt-1 block truncate font-mono text-[0.62rem] text-[var(--pos-muted)]">{customer.customerNumber ?? customer.customerType}{customer.commercialName ? ` · ${customer.commercialName}` : ''}</span><span className="mt-1 block text-xs font-semibold text-[var(--pos-muted)]">{customer.creditSummary?.availableCredit !== undefined ? `Disponible ${toMoney(customer.creditSummary.availableCredit)}` : customer.creditSummary?.overdueAmount ? `Vencido ${toMoney(customer.creditSummary.overdueAmount)}` : 'Saldo sin dato'}</span></span><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-[var(--pos-muted)] transition-transform group-hover:translate-x-0.5" /></span></button>
             })}
           </div>
         </section>
      </>}
    </section>
  )
}

type PaymentConditionControlProps = Pick<CheckoutDockProps, 'conditionPanelRef' | 'creditOptions' | 'disabledReason' | 'isSubmitting' | 'onPaymentTypeChange' | 'paymentType' | 'selectedCustomer'> & { total: Money; visualState: CheckoutVisualState }

function PaymentConditionControl({ conditionPanelRef, creditOptions, disabledReason, isSubmitting, onPaymentTypeChange, paymentType, selectedCustomer, total, visualState }: PaymentConditionControlProps) {
  const creditRestriction = getCreditRestriction('CREDIT_SALE', selectedCustomer, total, creditOptions)
  const offlineRestricted = disabledReason?.includes('Sin conexión')
  const hasValidCustomer = Boolean(selectedCustomer && selectedCustomer.isActive !== false && selectedCustomer.active !== false)
  const requiresSupervisor = Boolean(creditRestriction && selectedCustomer?.creditSummary?.canAdministrativeOverride && !creditOptions?.isAdmin)
  const creditDisabled = Boolean(!hasValidCustomer || offlineRestricted || creditRestriction || isSubmitting)
  const localCreditReason = offlineRestricted
    ? 'Crédito no disponible sin conexión.'
    : !hasValidCustomer
      ? 'Selecciona un cliente válido para habilitar crédito.'
    : requiresSupervisor
      ? 'Supervisor requerido para autorizar crédito.'
      : creditRestriction?.includes('excede')
        ? 'Crédito disponible insuficiente.'
        : creditRestriction
          ? 'Crédito bloqueado.'
          : ''
  const creditReason = ['CREDIT_UNVALIDATED', 'CREDIT_BLOCKED', 'SUPERVISOR_REQUIRED'].includes(visualState.kind)
    ? visualState.reason
    : localCreditReason

  return (
    <section aria-keyshortcuts="F7" className="grid min-h-0 min-w-0 grid-rows-[auto_2rem] bg-[var(--pos-surface)] p-4 min-[1024px]:max-[1279px]:p-3" aria-label="Condición comercial" ref={conditionPanelRef} title="Atajo F7: cambiar condición de venta">
      <div><div className="flex items-center justify-between gap-2"><p className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Condición</p><span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">F7</span></div><div aria-keyshortcuts="F7" aria-label="Condición comercial" className="mt-2 grid h-11 grid-cols-2 border border-[var(--pos-steel)]" role="radiogroup" title="Atajo F7: cambiar condición de venta"><button aria-checked={paymentType === 'CASH_SALE'} className={`min-w-0 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-focus)] ${paymentType === 'CASH_SALE' ? 'bg-[var(--pos-action)] text-white' : 'text-[var(--pos-muted)] hover:bg-[var(--pos-surface-secondary)]'} disabled:cursor-not-allowed disabled:bg-[var(--pos-surface-secondary)] disabled:text-[var(--pos-muted)]`} disabled={isSubmitting} onClick={() => onPaymentTypeChange('CASH_SALE')} role="radio" type="button">Contado</button><button aria-checked={paymentType === 'CREDIT_SALE'} aria-describedby={creditReason ? 'pos-credit-condition-reason' : undefined} aria-disabled={creditDisabled} className={`min-w-0 border-l border-[var(--pos-steel)] text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-focus)] ${paymentType === 'CREDIT_SALE' ? 'bg-[var(--pos-action)] text-white' : 'text-[var(--pos-muted)] hover:bg-[var(--pos-surface-secondary)]'} disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--pos-surface-secondary)] disabled:text-[var(--pos-muted)]`} disabled={creditDisabled} onClick={() => onPaymentTypeChange('CREDIT_SALE')} role="radio" tabIndex={creditDisabled ? -1 : undefined} type="button">Crédito</button></div></div>
      <p aria-atomic="true" aria-live="polite" className="self-end text-[0.68rem] font-semibold leading-3 text-[var(--pos-red)]" id="pos-credit-condition-reason" role={creditReason ? 'status' : undefined}>{creditReason}</p>
    </section>
  )
}

type PaymentSummaryProps = Pick<CheckoutDockProps, 'confirmButtonRef' | 'onPaymentsChange' | 'paymentPanelRef' | 'paymentType' | 'payments'> & { total: Money; visualState: CheckoutVisualState }

function PaymentSummary({ confirmButtonRef, onPaymentsChange, paymentPanelRef, paymentType, payments, total, visualState }: PaymentSummaryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const firstCashInputRef = useRef<HTMLInputElement>(null)
  const paymentEntryRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const paid = calculatePaymentsTotal(payments)
  const pending = total.subtract(paid).compare(Money.zero()) > 0 ? total.subtract(paid) : Money.zero()
  const change = payments.reduce((sum, payment) => payment.paymentMethod === 'CASH' && payment.cashTendered !== undefined && Money.from(payment.cashTendered).compare(payment.amount) >= 0 ? sum.add(calculateCashChange(payment.cashTendered, payment.amount)) : sum, Money.zero())
  const methods = Array.from(payments.reduce((items, payment) => {
    if (!Money.from(payment.amount).isPositive()) return items
    items.set(payment.paymentMethod, (items.get(payment.paymentMethod) ?? Money.zero()).add(payment.amount))
    return items
  }, new Map<string, Money>()))
  const firstPaymentMethod = payments[0]?.paymentMethod
  const creditWithoutPayment = paymentType === 'CREDIT_SALE' && paid.isZero()
  const paymentValidationMessage = visualState.reason && visualState.kind === 'PAYMENT_NOT_STARTED'
    ? 'Captura el pago.'
    : visualState.reason && visualState.kind === 'PAYMENT_PARTIAL'
      ? 'Completa el pago.'
      : ''

  useEffect(() => {
    if (!isOpen) return
    if (firstPaymentMethod === 'CASH') firstCashInputRef.current?.focus()
    else paymentEntryRef.current?.querySelector<HTMLElement>('select, input, button')?.focus()
  }, [firstPaymentMethod, isOpen, payments.length])

  const openPanel = () => {
    if (payments.length === 0 && total.isPositive()) onPaymentsChange([{ amount: total.toString(), paymentMethod: 'CASH' }])
    setIsOpen(true)
  }

  const closePanel = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const completeCashCapture = () => {
    setIsOpen(false)
    window.setTimeout(() => confirmButtonRef?.current?.focus(), 0)
  }

  return (
    <section className="relative min-h-0 min-w-0 bg-[var(--pos-surface)] p-4 min-[1024px]:max-[1279px]:p-3" aria-label="Resumen de pago" ref={paymentPanelRef}>
      <input aria-label="Abrir captura de pagos" className="sr-only" onFocus={openPanel} tabIndex={-1} />
      <button aria-controls="pos-payment-entry" aria-expanded={isOpen} aria-keyshortcuts="F6" className="block min-h-11 w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] focus-visible:ring-inset" onClick={openPanel} ref={triggerRef} title="Atajo F6: abrir o editar pagos" type="button">
        <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]"><WalletCards aria-hidden="true" className="size-4 text-[var(--pos-neutral)]" />Pago</span><span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">F6</span></span>
        <span aria-atomic="true" aria-live="polite" className={`mt-2 flex h-5 items-center overflow-hidden text-xs font-semibold leading-4 ${paymentValidationMessage ? 'text-[var(--pos-amber)]' : 'text-[var(--pos-muted)]'}`} role={paymentValidationMessage || creditWithoutPayment ? 'status' : undefined}>{paymentValidationMessage || (creditWithoutPayment ? 'Venta a crédito sin pago inmediato' : methods.length === 0 ? 'Sin pagos aplicados' : <span className="flex min-w-0 gap-2 overflow-hidden whitespace-nowrap">{methods.slice(0, 3).map(([method, amount]) => <span className="shrink-0 font-mono text-[0.65rem] font-bold text-[var(--pos-ink)]" key={method}>{paymentMethodLabel(method)} {toMoney(amount)}</span>)}{methods.length > 3 && <span className="shrink-0 text-[0.65rem] font-bold text-[var(--pos-muted)]">+{methods.length - 3} métodos</span>}</span>)}</span>
       <dl className="mt-2 grid h-12 grid-cols-3 gap-px bg-[var(--pos-steel)] text-xs"><div className="min-w-0 bg-[var(--pos-surface)] px-2 py-1.5"><dt className="text-[0.58rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]">Pagado</dt><dd aria-atomic="true" aria-live="polite" className="mt-0.5 whitespace-nowrap font-mono font-bold tabular-nums">{toMoney(paid)}</dd></div><div className="min-w-0 bg-[var(--pos-surface)] px-2 py-1.5"><dt className="text-[0.58rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]">Pendiente</dt><dd aria-atomic="true" aria-live="polite" className="mt-0.5 whitespace-nowrap font-mono font-bold tabular-nums">{toMoney(pending)}</dd></div><div className={`min-w-0 px-2 py-1.5 ${change.isPositive() ? 'bg-[rgba(22,117,82,0.12)] text-[var(--pos-success)]' : 'bg-[var(--pos-surface)]'}`}><dt className="text-[0.58rem] font-bold uppercase tracking-[0.1em]">Cambio</dt><dd aria-atomic="true" aria-live="polite" className="mt-0.5 whitespace-nowrap font-mono font-black tabular-nums">{toMoney(change)}</dd></div></dl>
      </button>
      {isOpen && <>
        <button aria-label="Cerrar captura de pagos" className="fixed inset-0 z-40 bg-[rgba(22,26,24,0.36)] min-[1440px]:hidden" onClick={closePanel} type="button" />
        <section aria-label="Captura de pagos" aria-modal="true" className="fixed inset-x-0 bottom-0 z-50 max-h-[86dvh] overflow-y-auto border-t border-[var(--pos-steel)] bg-[var(--pos-surface)] p-4 shadow-sm min-[1440px]:absolute min-[1440px]:bottom-full min-[1440px]:left-0 min-[1440px]:mb-2 min-[1440px]:w-[min(42rem,calc(100vw-2rem))] min-[1440px]:border" id="pos-payment-entry" onKeyDown={(event) => { if (event.key === 'Escape') closePanel() }} role="dialog"><div className="flex items-center justify-between gap-4"><span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Captura de pagos</span><button className="h-11 px-4 text-xs font-bold text-[var(--pos-neutral)] hover:text-[var(--pos-ink)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)]" onClick={closePanel} type="button">Cerrar</button></div><PaymentEntryControl firstCashInputRef={firstCashInputRef} onCashTenderedSelect={completeCashCapture} onPaymentsChange={onPaymentsChange} panelRef={paymentEntryRef} payments={payments} total={total} /></section>
      </>}
    </section>
  )
}

type TransactionSummaryDisclosureProps = {
  adjustment?: Money
  discount?: Money
  promotion?: Money
  subtotal: Money
  tax?: Money
}

function TransactionSummaryDisclosure({ adjustment = Money.zero(), discount = Money.zero(), promotion = Money.zero(), subtotal, tax = Money.zero() }: TransactionSummaryDisclosureProps) {
  const hasException = [discount, promotion, tax, adjustment].some((value) => !value.isZero())
  const [isOpen, setIsOpen] = useState(hasException)
  const rows: Array<readonly [string, Money]> = [
    ['Subtotal', subtotal],
    ...(!discount.isZero() ? [['Descuento', Money.zero().subtract(discount)] as const] : []),
    ...(!promotion.isZero() ? [['Promociones', Money.zero().subtract(promotion)] as const] : []),
    ...(!tax.isZero() ? [['IVA', tax] as const] : []),
    ...(!adjustment.isZero() ? [['Ajustes', adjustment] as const] : []),
  ]

  useEffect(() => {
    if (!hasException) return
    const timer = window.setTimeout(() => setIsOpen(true), 0)
    return () => window.clearTimeout(timer)
  }, [hasException])

  return (
    <section aria-label="Resumen de transacción" className="min-w-0 px-4 py-2">
       <button aria-expanded={isOpen} className="flex min-h-11 w-full items-center gap-2 text-left text-[0.68rem] font-semibold leading-3 text-[var(--pos-muted)] hover:text-[var(--pos-ink)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] focus-visible:ring-inset" onClick={() => setIsOpen((open) => !open)} type="button"><ReceiptText aria-hidden="true" className="size-4 shrink-0 text-[var(--pos-neutral)]" /><span>Subtotal {toMoney(subtotal)}</span>{!tax.isZero() && <span>· IVA {toMoney(tax)}</span>}{!discount.isZero() && <span>· Descuento {toMoney(Money.zero().subtract(discount))}</span>}<span className="ml-auto flex shrink-0"><ChevronDown className={`size-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} /></span></button>
      {isOpen && <dl className="mt-2 grid gap-2 text-[0.65rem] leading-3">{rows.map(([label, amount]) => <div className="flex items-center justify-between gap-4" key={label}><dt>{label}</dt><dd className="font-mono font-bold tabular-nums text-[var(--pos-ink)]">{toMoney(amount)}</dd></div>)}</dl>}
    </section>
  )
}

type PosTotalProps = Pick<CheckoutDockProps, 'cart'> & { total: Money }

function PosTotal({ cart, total }: PosTotalProps) {
  const totalWeightKg = cart.reduce((weight, item) => weight + item.quantityKg, 0)
  const itemsLabel = `${cart.length} ${cart.length === 1 ? 'partida' : 'partidas'}`

  return (
    <section aria-label="Total de la venta" className="flex min-w-0 flex-col justify-center px-4 py-2">
      <div className="flex items-center gap-2 font-mono text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--pos-muted)]"><span>TOTAL</span><span className="h-px flex-1 bg-[var(--pos-steel)]" /><span className="shrink-0 normal-case tracking-normal">{itemsLabel}{totalWeightKg > 0 && ` · ${totalWeightKg.toLocaleString('es-MX', { maximumFractionDigits: 3 })} kg`}</span></div>
      <output aria-atomic="true" aria-live="polite" className="mt-0.5 whitespace-nowrap font-[var(--pos-display)] text-[clamp(2.25rem,3.2vw,3rem)] font-black leading-none tracking-[-0.05em] tabular-nums text-[var(--pos-ink)]">{toMoney(total)}<span className="sr-only"> Total en vivo</span></output>
    </section>
  )
}

type PosPrimaryActionProps = Pick<CheckoutDockProps, 'confirmButtonRef' | 'customerSearchRef' | 'isSubmitting' | 'onConfirm' | 'paymentPanelRef'> & { pendingAmount: Money; total: Money; visualState: CheckoutVisualState }

function PosPrimaryAction({ confirmButtonRef, customerSearchRef, isSubmitting, onConfirm, paymentPanelRef, pendingAmount, visualState }: PosPrimaryActionProps) {
  const [isActivating, setIsActivating] = useState(false)
  const reason = visualState.reason
  const action = visualState.kind === 'WEIGHT_PENDING'
    ? { label: 'Capturar peso', type: 'weight' as const }
    : visualState.kind === 'CUSTOMER_REQUIRED'
      ? { label: 'Seleccionar cliente', type: 'customer' as const }
      : visualState.kind === 'PAYMENT_NOT_STARTED'
        ? { label: 'Registrar pago', type: 'payment' as const }
        : visualState.kind === 'PAYMENT_PARTIAL'
          ? { label: `Registrar pago · Falta ${toMoney(pendingAmount)}`, type: 'payment' as const }
      : visualState.kind === 'READY_TO_CHARGE'
            ? { label: 'Confirmar venta', type: 'confirm' as const }
            : visualState.kind === 'PROCESSING'
              ? { label: 'Procesando…', type: 'none' as const }
              : visualState.kind === 'SALE_REGISTERED'
                ? { label: 'Imprimir ticket', type: 'none' as const }
                : visualState.kind === 'TICKET_PRINTED'
                  ? { label: 'Nueva venta', type: 'none' as const }
                  : visualState.kind === 'CREDIT_UNVALIDATED'
                    ? { label: 'Validar crédito', type: 'none' as const }
                    : visualState.kind === 'CREDIT_BLOCKED'
                      ? { label: 'Cliente sin crédito disponible', type: 'none' as const }
                      : visualState.kind === 'SUPERVISOR_REQUIRED'
                        ? { label: 'Validar crédito', type: 'none' as const }
                        : { label: 'Confirmar venta', type: 'none' as const }
  const isExecutable = action.type !== 'none' && !isSubmitting
  const isBusy = isSubmitting || isActivating || visualState.kind === 'PROCESSING'

  const activate = () => {
    if (!isExecutable || isBusy) return

    setIsActivating(true)
    if (action.type === 'customer') customerSearchRef?.current?.focus()
    if (action.type === 'payment') paymentPanelRef?.current?.querySelector<HTMLInputElement>('input[aria-label="Abrir captura de pagos"]')?.focus()
    if (action.type === 'weight') document.querySelector<HTMLInputElement>('input[aria-describedby^="cart-validation-"], input[aria-label^="Kilos capturados"], input[aria-label^="Piezas capturadas"]')?.focus()
    if (action.type === 'confirm') onConfirm()
    window.setTimeout(() => setIsActivating(false), 150)
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'F8' || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      event.stopImmediatePropagation()
      activate()
    }

    window.addEventListener('keydown', handleShortcut, true)
    return () => window.removeEventListener('keydown', handleShortcut, true)
  })

  return (
    <button aria-atomic="true" aria-busy={isBusy || undefined} aria-describedby={reason ? 'pos-primary-action-reason' : undefined} aria-keyshortcuts={isExecutable ? 'F8 Enter' : undefined} aria-live="polite" className="grid h-full min-h-14 w-full grid-cols-[3.25rem_minmax(0,1fr)_2rem] items-center bg-[var(--pos-action)] text-left text-white transition-[background-color,color,opacity,transform] duration-150 hover:bg-[#0d2e25] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-focus)] disabled:cursor-not-allowed disabled:bg-[rgba(96,112,107,0.72)]" data-pos-primary-action disabled={!isExecutable || isBusy} onClick={activate} ref={confirmButtonRef} type="button">
      <span aria-hidden="true" className="grid h-14 w-[3.25rem] place-items-center border-r border-white/20">{isBusy ? <LoaderCircle className="size-4 animate-spin" /> : isExecutable ? <ChevronRight className="size-5" /> : <Minus className="size-5" />}</span>
      <span className="min-w-0 px-2"><span className="block truncate text-sm font-black leading-4 tabular-nums">{action.label}</span>{reason && <span className="block truncate text-[0.65rem] font-semibold leading-3 text-white/75" id="pos-primary-action-reason">{reason}</span>}</span>
      <span aria-hidden="true" className="justify-self-center font-mono text-[0.62rem] font-bold text-white/75">{isExecutable ? 'F8' : ''}</span>
    </button>
  )
}

type TransactionSummaryAreaProps = Pick<CheckoutDockProps, 'cart'> & { total: Money }

function TransactionSummaryArea({ cart, total }: TransactionSummaryAreaProps) {
  return (
    <section aria-label="Resumen de transacción y total" className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center bg-[var(--pos-surface)] px-2 py-1 min-[1280px]:grid-cols-1 min-[1280px]:grid-rows-[auto_minmax(0,1fr)]">
      <TransactionSummaryDisclosure subtotal={total} />
      <PosTotal cart={cart} total={total} />
    </section>
  )
}

export function CheckoutDock({
  cart,
  conditionPanelRef,
  confirmButtonRef,
  creditOptions,
  customerSearch,
  customerSearchRef,
  customers,
  customersError,
  customersLoading,
  disabledReason,
  isSubmitting,
  onConfirm,
  onCustomerSearchChange,
  onCustomerSelect,
  onPaymentTypeChange,
  onPaymentsChange,
  paymentPanelRef,
  paymentType,
  payments,
  selectedCustomer,
  total,
  transactionState,
}: CheckoutDockProps) {
  const exactTotal = Money.from(total)
  const pendingAmount = exactTotal.subtract(calculatePaymentsTotal(payments)).compare(Money.zero()) > 0
    ? exactTotal.subtract(calculatePaymentsTotal(payments))
    : Money.zero()
  const visualState = selectCheckoutVisualState({ disabledReason, payments, transactionState })

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'F4') {
        event.preventDefault()
        event.stopImmediatePropagation()
        customerSearchRef?.current?.focus()
      }
      if (event.key === 'F6') {
        event.preventDefault()
        event.stopImmediatePropagation()
        paymentPanelRef?.current?.querySelector<HTMLInputElement>('input[aria-label="Abrir captura de pagos"]')?.focus()
      }
      if (event.key === 'F7') {
        event.preventDefault()
        event.stopImmediatePropagation()
        conditionPanelRef?.current?.querySelector<HTMLElement>('[role="radio"]')?.focus()
      }
    }

    window.addEventListener('keydown', handleShortcut, true)
    return () => window.removeEventListener('keydown', handleShortcut, true)
  }, [conditionPanelRef, customerSearchRef, paymentPanelRef])

  return (
    <footer className="z-20 h-60 shrink-0 overflow-visible border-t border-[var(--pos-steel)] bg-[var(--pos-surface)] min-[1024px]:h-60 min-[1280px]:h-36" aria-label="Confirmación de venta">
      <div className="grid h-full grid-cols-2 grid-rows-[repeat(3,minmax(0,1fr))] gap-px bg-[var(--pos-steel)] min-[1024px]:grid-cols-[20fr_13fr_22fr] min-[1024px]:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] min-[1280px]:grid-cols-[20fr_13fr_22fr_20fr_25fr] min-[1280px]:grid-rows-1">
        <PosCustomerSummary customerSearch={customerSearch} customerSearchRef={customerSearchRef} customers={customers} customersError={customersError} customersLoading={customersLoading} onCustomerSearchChange={onCustomerSearchChange} onCustomerSelect={onCustomerSelect} selectedCustomer={selectedCustomer} visualState={visualState} />
        <PaymentConditionControl conditionPanelRef={conditionPanelRef} creditOptions={creditOptions} disabledReason={disabledReason} isSubmitting={isSubmitting} onPaymentTypeChange={onPaymentTypeChange} paymentType={paymentType} selectedCustomer={selectedCustomer} total={exactTotal} visualState={visualState} />
        <PaymentSummary confirmButtonRef={confirmButtonRef} onPaymentsChange={onPaymentsChange} paymentPanelRef={paymentPanelRef} paymentType={paymentType} payments={payments} total={exactTotal} visualState={visualState} />
        <div className="col-start-2 row-start-2 min-w-0 min-[1024px]:col-start-1 min-[1024px]:col-span-2 min-[1024px]:row-start-2 min-[1440px]:col-start-auto min-[1440px]:col-span-1 min-[1440px]:row-auto"><TransactionSummaryArea cart={cart} total={exactTotal} /></div>
        <div className="col-span-2 row-start-3 min-w-0 bg-[var(--pos-action)] min-[1024px]:col-start-3 min-[1024px]:col-span-1 min-[1024px]:row-start-2 min-[1440px]:col-start-auto min-[1440px]:row-start-2 min-[1440px]:col-start-auto min-[1440px]:row-auto"><PosPrimaryAction confirmButtonRef={confirmButtonRef} customerSearchRef={customerSearchRef} isSubmitting={isSubmitting} onConfirm={onConfirm} paymentPanelRef={paymentPanelRef} pendingAmount={pendingAmount} total={exactTotal} visualState={visualState} /></div>
      </div>
    </footer>
  )
}

export type { CheckoutDockProps }
