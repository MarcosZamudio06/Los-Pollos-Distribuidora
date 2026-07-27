import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle, Minus, ReceiptText, UserRound, WalletCards } from 'lucide-react'
import { PaymentEntryControl } from '../components'
import { calculateCashChange, getCreditRestriction, toMoney, type CreditRestrictionOptions } from '../posLogic'
import { paymentMethodLabel } from '../saleLabels'
import type { CartItem, CustomerOption, PaymentType, PosTransactionState, SalePaymentInput } from '../types'

type CheckoutDockProps = {
  cart: CartItem[]
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
  total: number
  transactionState: PosTransactionState
}

type CheckoutVisualStateKind = 'LOCATION_REQUIRED' | 'CASH_CLOSED' | 'STOCK_INSUFFICIENT' | 'CART_EMPTY' | 'WEIGHT_PENDING' | 'CUSTOMER_REQUIRED' | 'CREDIT_UNVALIDATED' | 'CREDIT_BLOCKED' | 'SUPERVISOR_REQUIRED' | 'PAYMENT_NOT_STARTED' | 'PAYMENT_PARTIAL' | 'READY_TO_CHARGE' | 'PROCESSING' | 'SALE_REGISTERED' | 'TICKET_PRINTED' | 'OFFLINE' | 'BLOCKED'

type CheckoutVisualState = {
  kind: CheckoutVisualStateKind
  reason: string
}

type CheckoutVisualStateInput = Pick<CheckoutDockProps, 'disabledReason' | 'payments' | 'transactionState'>

export function selectCheckoutVisualState({ disabledReason, payments, transactionState }: CheckoutVisualStateInput): CheckoutVisualState {
  const reason = disabledReason?.trim() ?? ''
  const normalizedReason = reason.toLocaleLowerCase('es-MX')
  const state = (kind: CheckoutVisualStateKind, fallback = '') => ({ kind, reason: reason || fallback })

  if (normalizedReason.startsWith('selecciona una ubicación')) return state('LOCATION_REQUIRED')
  if (normalizedReason.startsWith('abre una sesión de caja')) return state('CASH_CLOSED')
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
  const overdueAmount = Number(selectedCustomer?.creditSummary?.overdueAmount ?? 0)
  const customerRequired = visualState.kind === 'CUSTOMER_REQUIRED'
  const customerStatus = customerRequired
    ? visualState.reason
    : isCreditBlocked
      ? `Crédito bloqueado${overdueAmount > 0 ? ` · Saldo vencido ${toMoney(overdueAmount)}` : ''}`
      : overdueAmount > 0
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
    <section className="relative min-w-0 bg-[var(--pos-surface)] p-4" aria-label="Cliente de la venta">
      <input aria-label="Abrir selección de cliente" className="sr-only" onFocus={() => setIsOpen(true)} ref={customerSearchRef} tabIndex={-1} />
      <button aria-controls="pos-customer-selection" aria-expanded={isOpen} className="block min-h-11 w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] focus-visible:ring-inset" onClick={() => setIsOpen(true)} ref={triggerRef} type="button">
        <span className="flex items-start gap-2"><UserRound aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--pos-neutral)]" /><span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Cliente</span><span className="min-w-0 flex-1 break-words text-sm font-bold leading-tight text-[var(--pos-ink)]">{selectedCustomer?.name ?? 'Público general'}</span><span className="mt-0.5 shrink-0 font-mono text-[0.62rem] font-bold text-[var(--pos-muted)] min-[1024px]:max-[1439px]:hidden">F4</span></span>
        <span aria-atomic="true" aria-live="polite" className={`mt-1 block break-words text-xs font-semibold leading-tight ${customerRequired || isCreditBlocked ? 'text-[var(--pos-red)]' : overdueAmount > 0 ? 'text-[var(--pos-amber)]' : 'text-[var(--pos-muted)]'}`} role={customerRequired || isCreditBlocked ? 'alert' : undefined}>{customerStatus}</span>
      </button>
      {isOpen && <>
        <button aria-label="Cerrar selección de cliente" className="fixed inset-0 z-40 bg-[rgba(22,26,24,0.36)] min-[1440px]:hidden" onClick={closePanel} type="button" />
        <section aria-label="Seleccionar cliente" aria-modal="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--pos-steel)] bg-[var(--pos-surface)] p-4 shadow-sm min-[1440px]:absolute min-[1440px]:bottom-full min-[1440px]:left-0 min-[1440px]:mb-2 min-[1440px]:w-[min(34rem,calc(100vw-2rem))] min-[1440px]:border" id="pos-customer-selection" onKeyDown={(event) => { if (event.key === 'Escape') closePanel() }} role="dialog">
          <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Cliente</p><h2 className="mt-1 text-lg font-bold">Seleccionar cliente</h2></div><button className="h-11 px-3 text-xs font-bold text-[var(--pos-muted)] hover:text-[var(--pos-ink)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)]" onClick={closePanel} type="button">Cerrar</button></div>
          <label className="mt-4 grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">Buscar cliente<input aria-describedby={customersError ? errorId : undefined} aria-label="Buscar cliente registrado" className="h-11 border border-[var(--pos-steel)] px-3 text-[var(--pos-ink)] outline-none transition focus:border-[var(--pos-focus)] focus:ring-2 focus:ring-[rgba(37,99,235,0.18)]" onChange={(event) => onCustomerSearchChange(event.target.value)} placeholder="Nombre, número o razón social" ref={searchFieldRef} value={customerSearch} /></label>
          {customersLoading && <p className="mt-3 text-xs font-bold text-[var(--pos-green)]">Cargando clientes...</p>}
          {Boolean(customersError) && <p aria-live="assertive" className="mt-3 text-xs font-bold text-[var(--pos-red)]" id={errorId} role="alert">No se pudo cargar la búsqueda de clientes.</p>}
          <button className="mt-3 min-h-11 w-full border-y border-[var(--pos-steel)] px-3 py-3 text-left text-sm font-bold text-[var(--pos-ink)] hover:bg-[var(--pos-porcelain)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)]" onClick={() => selectCustomer(null)} type="button"><span className="block">Público general</span><span className="mt-0.5 block text-xs font-medium text-[var(--pos-muted)]">Venta sin cliente registrado</span></button>
          <div className="divide-y divide-[var(--pos-steel)]">
            {customers.map((customer) => <button className="min-h-11 w-full px-3 py-3 text-left transition hover:bg-[var(--pos-porcelain)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] disabled:opacity-50" disabled={customer.isActive === false || customer.active === false} key={customer.id} onClick={() => selectCustomer(customer)} type="button"><span className="block break-words text-sm font-bold text-[var(--pos-ink)]">{customer.name}</span><span className="mt-0.5 block break-words text-xs font-medium text-[var(--pos-muted)]">{customer.customerType} · {customer.creditSummary?.effectiveCreditStatus === 'BLOCKED' || customer.isBlockedForCredit ? 'Crédito bloqueado' : customer.creditSummary?.overdueAmount ? `Saldo vencido ${toMoney(customer.creditSummary.overdueAmount)}` : customer.creditStatus ?? 'Crédito disponible'}</span></button>)}
          </div>
        </section>
      </>}
    </section>
  )
}

type PaymentConditionControlProps = Pick<CheckoutDockProps, 'creditOptions' | 'disabledReason' | 'isSubmitting' | 'onPaymentTypeChange' | 'paymentType' | 'selectedCustomer' | 'total'> & { visualState: CheckoutVisualState }

function PaymentConditionControl({ creditOptions, disabledReason, isSubmitting, onPaymentTypeChange, paymentType, selectedCustomer, total, visualState }: PaymentConditionControlProps) {
  const creditRestriction = getCreditRestriction('CREDIT_SALE', selectedCustomer, total, creditOptions)
  const offlineRestricted = disabledReason?.includes('Sin conexión')
  const requiresSupervisor = Boolean(creditRestriction && selectedCustomer?.creditSummary?.canAdministrativeOverride && !creditOptions?.isAdmin)
  const creditDisabled = Boolean(offlineRestricted || creditRestriction || isSubmitting)
  const localCreditReason = offlineRestricted
    ? 'Crédito no disponible sin conexión.'
    : requiresSupervisor
      ? 'Supervisor requerido para autorizar crédito.'
      : !selectedCustomer
        ? 'Cliente requerido para crédito.'
        : creditRestriction?.includes('excede')
          ? 'Crédito disponible insuficiente.'
          : creditRestriction
            ? 'Crédito bloqueado.'
            : ''
  const creditReason = ['CREDIT_UNVALIDATED', 'CREDIT_BLOCKED', 'SUPERVISOR_REQUIRED'].includes(visualState.kind)
    ? visualState.reason
    : localCreditReason

  return (
    <section className="grid min-w-0 grid-rows-[auto_2rem] bg-[var(--pos-surface)] p-4" aria-label="Condición comercial">
      <div><div className="flex items-center justify-between gap-2"><p className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Condición</p><span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)] min-[1024px]:max-[1439px]:hidden">F6</span></div><div aria-label="Condición comercial" className="mt-2 grid h-11 grid-cols-2 border border-[var(--pos-steel)]" role="radiogroup"><button aria-checked={paymentType === 'CASH_SALE'} className={`min-w-0 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-focus)] ${paymentType === 'CASH_SALE' ? 'bg-[var(--pos-action)] text-white' : 'text-[var(--pos-muted)] hover:bg-[var(--pos-surface-secondary)]'} disabled:cursor-not-allowed disabled:bg-[var(--pos-surface-secondary)] disabled:text-[var(--pos-muted)]`} disabled={isSubmitting} onClick={() => onPaymentTypeChange('CASH_SALE')} role="radio" type="button">Contado</button><button aria-checked={paymentType === 'CREDIT_SALE'} className={`min-w-0 border-l border-[var(--pos-steel)] text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-focus)] ${paymentType === 'CREDIT_SALE' ? 'bg-[var(--pos-action)] text-white' : 'text-[var(--pos-muted)] hover:bg-[var(--pos-surface-secondary)]'} disabled:cursor-not-allowed disabled:bg-[var(--pos-surface-secondary)] disabled:text-[var(--pos-muted)]`} disabled={creditDisabled} onClick={() => onPaymentTypeChange('CREDIT_SALE')} role="radio" type="button">Crédito</button></div></div>
      <p aria-atomic="true" aria-live="polite" className="self-end text-[0.68rem] font-semibold leading-3 text-[var(--pos-red)]" role={creditReason ? 'status' : undefined}>{creditReason}</p>
    </section>
  )
}

type PaymentSummaryProps = Pick<CheckoutDockProps, 'onPaymentsChange' | 'paymentPanelRef' | 'paymentType' | 'payments' | 'total'> & { visualState: CheckoutVisualState }

function PaymentSummary({ onPaymentsChange, paymentPanelRef, paymentType, payments, total, visualState }: PaymentSummaryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const paymentEntryRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0)
  const pending = Math.max(total - paid, 0)
  const change = payments.reduce((sum, payment) => payment.paymentMethod === 'CASH' && payment.cashTendered !== undefined && payment.cashTendered >= payment.amount ? sum + calculateCashChange(payment.cashTendered, payment.amount) : sum, 0)
  const methods = Array.from(payments.reduce((items, payment) => {
    if (payment.amount <= 0) return items
    items.set(payment.paymentMethod, (items.get(payment.paymentMethod) ?? 0) + payment.amount)
    return items
  }, new Map<string, number>()))
  const creditWithoutPayment = paymentType === 'CREDIT_SALE' && paid === 0
  const paymentReason = ['PAYMENT_NOT_STARTED', 'PAYMENT_PARTIAL'].includes(visualState.kind) ? visualState.reason : ''

  useEffect(() => {
    if (!isOpen) return
    paymentEntryRef.current?.querySelector<HTMLElement>('select, input, button')?.focus()
  }, [isOpen])

  const closePanel = () => {
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <section className="relative min-w-0 bg-[var(--pos-surface)] p-4" aria-label="Resumen de pago" ref={paymentPanelRef}>
      <input aria-label="Abrir captura de pagos" className="sr-only" onFocus={() => setIsOpen(true)} tabIndex={-1} />
      <button aria-controls="pos-payment-entry" aria-expanded={isOpen} className="block min-h-11 w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] focus-visible:ring-inset" onClick={() => setIsOpen(true)} ref={triggerRef} type="button">
        <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]"><WalletCards aria-hidden="true" className="size-4 text-[var(--pos-neutral)]" />Pago</span><span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)] min-[1024px]:max-[1439px]:hidden">F6</span></span>
        {paymentReason ? <span aria-atomic="true" aria-live="polite" className="mt-2 block text-xs font-semibold leading-3 text-[var(--pos-error)]" role="status">{paymentReason}</span> : creditWithoutPayment ? <span aria-live="polite" className="mt-2 block text-xs font-semibold text-[var(--pos-muted)]">Venta a crédito sin pago inmediato</span> : <span className="mt-2 flex min-h-5 flex-wrap gap-2 min-[1024px]:max-[1439px]:hidden">{methods.length === 0 ? <span className="text-xs font-semibold text-[var(--pos-muted)]">Sin pagos aplicados</span> : <>{methods.slice(0, 3).map(([method, amount]) => <span className="font-mono text-[0.65rem] font-bold text-[var(--pos-ink)]" key={method}>{paymentMethodLabel(method)} {toMoney(amount)}</span>)}{methods.length > 3 && <span className="text-[0.65rem] font-bold text-[var(--pos-muted)]">+{methods.length - 3} métodos</span>}</>}</span>}
        <dl className="mt-2 grid grid-cols-3 divide-x divide-[var(--pos-steel)] text-xs min-[1024px]:max-[1439px]:grid-cols-1 min-[1024px]:max-[1439px]:divide-x-0"><div className="min-w-0 pr-2 min-[1024px]:max-[1439px]:hidden"><dt className="text-[0.58rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]">Pagado</dt><dd aria-atomic="true" aria-live="polite" className="mt-0.5 whitespace-nowrap font-mono font-bold tabular-nums">{toMoney(paid)}</dd></div><div className="min-w-0 px-2 min-[1024px]:max-[1439px]:px-0"><dt className="text-[0.58rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]">Pendiente</dt><dd aria-atomic="true" aria-live="polite" className="mt-0.5 whitespace-nowrap font-mono font-bold tabular-nums">{toMoney(pending)}</dd></div><div className="min-w-0 pl-2 min-[1024px]:max-[1439px]:hidden"><dt className="text-[0.58rem] font-bold uppercase tracking-[0.1em] text-[var(--pos-muted)]">Cambio</dt><dd aria-atomic="true" aria-live="polite" className="mt-0.5 whitespace-nowrap font-mono font-bold tabular-nums">{toMoney(change)}</dd></div></dl>
      </button>
      {isOpen && <>
        <button aria-label="Cerrar captura de pagos" className="fixed inset-0 z-40 bg-[rgba(22,26,24,0.36)] min-[1440px]:hidden" onClick={closePanel} type="button" />
        <section aria-label="Captura de pagos" aria-modal="true" className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--pos-steel)] bg-[var(--pos-surface)] p-4 shadow-sm min-[1440px]:absolute min-[1440px]:bottom-full min-[1440px]:left-0 min-[1440px]:mb-2 min-[1440px]:w-[min(38rem,calc(100vw-2rem))] min-[1440px]:border" id="pos-payment-entry" onKeyDown={(event) => { if (event.key === 'Escape') closePanel() }} role="dialog"><div className="flex items-center justify-between gap-4"><span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Captura de pagos</span><button className="h-11 px-4 text-xs font-bold text-[var(--pos-neutral)] hover:text-[var(--pos-ink)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)]" onClick={closePanel} type="button">Cerrar</button></div><PaymentEntryControl onPaymentsChange={onPaymentsChange} panelRef={paymentEntryRef} payments={payments} total={total} /></section>
      </>}
    </section>
  )
}

type TransactionSummaryDisclosureProps = {
  adjustment?: number
  discount?: number
  promotion?: number
  subtotal: number
  tax?: number
}

function TransactionSummaryDisclosure({ adjustment = 0, discount = 0, promotion = 0, subtotal, tax = 0 }: TransactionSummaryDisclosureProps) {
  const hasException = Boolean(discount || promotion || tax || adjustment)
  const [isOpen, setIsOpen] = useState(hasException)
  const rows = [
    ['Subtotal', subtotal],
    ...(discount ? [['Descuento', -Math.abs(discount)] as const] : []),
    ...(promotion ? [['Promociones', -Math.abs(promotion)] as const] : []),
    ...(tax ? [['IVA', tax] as const] : []),
    ...(adjustment ? [['Ajustes', adjustment] as const] : []),
  ]

  useEffect(() => {
    if (hasException) setIsOpen(true)
  }, [hasException])

  return (
    <section aria-label="Resumen de transacción" className="min-w-0 px-4 py-2">
      <button aria-expanded={isOpen} className="flex min-h-11 w-full items-center gap-2 text-left text-[0.68rem] font-semibold leading-3 text-[var(--pos-muted)] hover:text-[var(--pos-ink)] focus-visible:ring-2 focus-visible:ring-[var(--pos-focus)] focus-visible:ring-inset" onClick={() => setIsOpen((open) => !open)} type="button"><ReceiptText aria-hidden="true" className="size-4 shrink-0 text-[var(--pos-neutral)]" /><span>Subtotal {toMoney(subtotal)}</span>{tax !== 0 && <span>· IVA {toMoney(tax)}</span>}{discount !== 0 && <span>· Descuento {toMoney(-Math.abs(discount))}</span>}<span className="ml-auto flex shrink-0"><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} /></span></button>
      {isOpen && <dl className="mt-2 grid gap-2 text-[0.65rem] leading-3">{rows.map(([label, amount]) => <div className="flex items-center justify-between gap-4" key={label}><dt>{label}</dt><dd className="font-mono font-bold tabular-nums text-[var(--pos-ink)]">{toMoney(amount)}</dd></div>)}</dl>}
    </section>
  )
}

type PosTotalProps = Pick<CheckoutDockProps, 'cart' | 'total'>

function PosTotal({ cart, total }: PosTotalProps) {
  const totalWeightKg = cart.reduce((weight, item) => weight + item.quantityKg, 0)
  const itemsLabel = `${cart.length} ${cart.length === 1 ? 'partida' : 'partidas'}`

  return (
    <section aria-label="Total de la venta" className="flex min-w-0 flex-col justify-center border-t border-[var(--pos-steel)] px-4 py-2 min-[1024px]:border-t-0 min-[1440px]:border-t">
      <div className="flex items-center gap-2 font-mono text-[0.58rem] font-bold uppercase tracking-[0.14em] text-[var(--pos-muted)]"><span>TOTAL</span><span className="h-px flex-1 bg-[var(--pos-steel)]" /><span className="shrink-0 normal-case tracking-normal">{itemsLabel}{totalWeightKg > 0 && ` · ${totalWeightKg.toLocaleString('es-MX', { maximumFractionDigits: 3 })} kg`}</span></div>
      <output aria-atomic="true" aria-live="polite" className="mt-0.5 whitespace-nowrap font-[var(--pos-display)] text-[clamp(2rem,3.2vw,3rem)] font-bold leading-none tracking-[-0.05em] tabular-nums text-[var(--pos-ink)]">{toMoney(total)}<span className="sr-only"> Total en vivo</span></output>
    </section>
  )
}

type PosPrimaryActionProps = Pick<CheckoutDockProps, 'confirmButtonRef' | 'customerSearchRef' | 'isSubmitting' | 'onConfirm' | 'paymentPanelRef' | 'total'> & { pendingAmount: number; visualState: CheckoutVisualState }

function PosPrimaryAction({ confirmButtonRef, customerSearchRef, isSubmitting, onConfirm, paymentPanelRef, pendingAmount, total, visualState }: PosPrimaryActionProps) {
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
            ? { label: `Cobrar ${toMoney(total)}`, type: 'confirm' as const }
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
                        : { label: 'Agregar productos', type: 'none' as const }
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
    <button aria-atomic="true" aria-busy={isBusy || undefined} aria-describedby={reason ? 'pos-primary-action-reason' : undefined} aria-keyshortcuts={isExecutable ? 'F8' : undefined} aria-live="polite" className="grid h-14 w-full grid-cols-[3.25rem_minmax(0,1fr)_2rem] items-center bg-[var(--pos-action)] text-left text-white transition-[background-color,color,opacity,transform] duration-150 hover:bg-[#0d2e25] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--pos-focus)] disabled:cursor-not-allowed disabled:bg-[rgba(96,112,107,0.72)]" data-pos-primary-action disabled={!isExecutable || isBusy} onClick={activate} ref={confirmButtonRef} type="button">
      <span aria-hidden="true" className="grid h-14 w-[3.25rem] place-items-center border-r border-white/20">{isBusy ? <LoaderCircle className="size-4 animate-spin" /> : isExecutable ? <ChevronRight className="size-5" /> : <Minus className="size-5" />}</span>
      <span className="min-w-0 px-2"><span className="block truncate text-sm font-black leading-4 tabular-nums">{action.label}</span>{reason && <span className="block truncate text-[0.65rem] font-semibold leading-3 text-white/75" id="pos-primary-action-reason">{reason}</span>}</span>
      <span aria-hidden="true" className="justify-self-center font-mono text-[0.62rem] font-bold text-white/75">{isExecutable ? 'F8' : ''}</span>
    </button>
  )
}

type FinancialActionAreaProps = Pick<CheckoutDockProps, 'cart' | 'confirmButtonRef' | 'customerSearchRef' | 'isSubmitting' | 'onConfirm' | 'paymentPanelRef' | 'total'> & { pendingAmount: number; visualState: CheckoutVisualState }

function FinancialActionArea({ cart, confirmButtonRef, customerSearchRef, isSubmitting, onConfirm, paymentPanelRef, pendingAmount, total, visualState }: FinancialActionAreaProps) {
  return (
    <div className="col-span-2 row-start-3 grid min-w-0 grid-cols-[46fr_54fr] grid-rows-[minmax(0,1fr)_4rem] min-[1024px]:col-span-3 min-[1024px]:row-start-2 min-[1024px]:grid-cols-[20fr_34fr_46fr] min-[1024px]:grid-rows-1 min-[1024px]:border-t min-[1024px]:border-[var(--pos-steel)] min-[1440px]:col-span-1 min-[1440px]:row-auto min-[1440px]:grid-cols-[46fr_54fr] min-[1440px]:grid-rows-[minmax(0,1fr)_4rem] min-[1440px]:border-t-0">
      <div className="col-span-2 min-[1024px]:col-span-1 min-[1440px]:col-span-2"><TransactionSummaryDisclosure subtotal={total} /></div>
      <PosTotal cart={cart} total={total} />
      <div className="border-l border-t border-[var(--pos-steel)] min-[1024px]:border-t-0 min-[1440px]:border-t"><PosPrimaryAction confirmButtonRef={confirmButtonRef} customerSearchRef={customerSearchRef} isSubmitting={isSubmitting} onConfirm={onConfirm} paymentPanelRef={paymentPanelRef} pendingAmount={pendingAmount} total={total} visualState={visualState} /></div>
    </div>
  )
}

export function CheckoutDock({
  cart,
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
  const pendingAmount = Math.max(total - payments.reduce((sum, payment) => sum + payment.amount, 0), 0)
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
    }

    window.addEventListener('keydown', handleShortcut, true)
    return () => window.removeEventListener('keydown', handleShortcut, true)
  }, [customerSearchRef, paymentPanelRef])

  return (
    <footer className="z-20 h-60 shrink-0 overflow-visible border-t border-[var(--pos-steel)] bg-[var(--pos-surface)] min-[1024px]:h-48 min-[1440px]:h-40" aria-label="Confirmación de venta">
      <div className="grid h-full grid-cols-2 grid-rows-3 divide-x divide-y divide-[var(--pos-steel)] min-[1024px]:grid-cols-[20fr_13fr_22fr] min-[1024px]:grid-rows-2 min-[1024px]:divide-y-0 min-[1440px]:grid-cols-[20fr_13fr_22fr_45fr] min-[1440px]:grid-rows-1">
        <PosCustomerSummary customerSearch={customerSearch} customerSearchRef={customerSearchRef} customers={customers} customersError={customersError} customersLoading={customersLoading} onCustomerSearchChange={onCustomerSearchChange} onCustomerSelect={onCustomerSelect} selectedCustomer={selectedCustomer} visualState={visualState} />
        <PaymentConditionControl creditOptions={creditOptions} disabledReason={disabledReason} isSubmitting={isSubmitting} onPaymentTypeChange={onPaymentTypeChange} paymentType={paymentType} selectedCustomer={selectedCustomer} total={total} visualState={visualState} />
        <PaymentSummary onPaymentsChange={onPaymentsChange} paymentPanelRef={paymentPanelRef} paymentType={paymentType} payments={payments} total={total} visualState={visualState} />
        <FinancialActionArea cart={cart} confirmButtonRef={confirmButtonRef} customerSearchRef={customerSearchRef} isSubmitting={isSubmitting} onConfirm={onConfirm} paymentPanelRef={paymentPanelRef} pendingAmount={pendingAmount} total={total} visualState={visualState} />
      </div>
    </footer>
  )
}

export type { CheckoutDockProps }
