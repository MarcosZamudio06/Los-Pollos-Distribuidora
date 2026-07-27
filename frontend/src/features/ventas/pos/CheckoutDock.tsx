import { useEffect, useRef, useState, type RefObject } from 'react'
import { ConfirmSaleButton, PaymentEntryControl, SaleSummary } from '../components'
import { getCreditRestriction, toMoney, type CreditRestrictionOptions } from '../posLogic'
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

type PosCustomerSummaryProps = Pick<CheckoutDockProps, 'customerSearch' | 'customerSearchRef' | 'customers' | 'customersError' | 'customersLoading' | 'onCustomerSearchChange' | 'onCustomerSelect' | 'paymentType' | 'selectedCustomer'>

function PosCustomerSummary({ customerSearch, customerSearchRef, customers, customersError, customersLoading, onCustomerSearchChange, onCustomerSelect, paymentType, selectedCustomer }: PosCustomerSummaryProps) {
  const [isOpen, setIsOpen] = useState(false)
  const searchFieldRef = useRef<HTMLInputElement>(null)
  const errorId = 'pos-customer-search-error'
  const isCreditBlocked = selectedCustomer?.isBlockedForCredit || selectedCustomer?.creditSummary?.isBlockedForCredit || selectedCustomer?.creditSummary?.effectiveCreditStatus === 'BLOCKED'
  const overdueAmount = Number(selectedCustomer?.creditSummary?.overdueAmount ?? 0)
  const customerRequired = paymentType === 'CREDIT_SALE' && !selectedCustomer
  const customerStatus = customerRequired
    ? 'Cliente requerido para venta a crédito'
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
    setIsOpen(false)
  }

  return (
    <section className="relative min-w-0 p-3" aria-label="Cliente de la venta">
      <input aria-label="Abrir selección de cliente" className="sr-only" onFocus={() => setIsOpen(true)} ref={customerSearchRef} tabIndex={-1} />
      <button aria-controls="pos-customer-selection" aria-expanded={isOpen} className="block w-full text-left outline-none" onClick={() => setIsOpen(true)} type="button">
        <span className="flex items-start gap-2"><span className="mt-0.5 font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Cliente</span><span className="min-w-0 flex-1 break-words text-sm font-bold leading-tight text-[var(--pos-ink)]">{selectedCustomer?.name ?? 'Público general'}</span><span className="mt-0.5 shrink-0 font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">F4</span></span>
        <span className={`mt-1 block break-words text-xs font-semibold leading-tight ${customerRequired || isCreditBlocked ? 'text-[var(--pos-red)]' : overdueAmount > 0 ? 'text-[var(--pos-amber)]' : 'text-[var(--pos-muted)]'}`} role={customerRequired || isCreditBlocked ? 'alert' : undefined}>{customerStatus}</span>
      </button>
      {isOpen && <>
        <button aria-label="Cerrar selección de cliente" className="fixed inset-0 z-40 bg-[rgba(22,26,24,0.36)] min-[1280px]:hidden" onClick={() => setIsOpen(false)} type="button" />
        <section aria-label="Seleccionar cliente" className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--pos-steel)] bg-white p-4 shadow-[0_-18px_48px_rgba(23,33,30,0.18)] min-[1280px]:absolute min-[1280px]:bottom-full min-[1280px]:left-0 min-[1280px]:mb-2 min-[1280px]:w-[min(34rem,calc(100vw-2rem))] min-[1280px]:border min-[1280px]:shadow-[0_18px_48px_rgba(23,33,30,0.18)]" id="pos-customer-selection" onKeyDown={(event) => { if (event.key === 'Escape') setIsOpen(false) }} role="dialog">
          <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Cliente</p><h2 className="mt-1 text-lg font-bold">Seleccionar cliente</h2></div><button className="h-11 px-3 text-xs font-bold text-[var(--pos-muted)] hover:text-[var(--pos-ink)]" onClick={() => setIsOpen(false)} type="button">Cerrar</button></div>
          <label className="mt-4 grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">Buscar cliente<input aria-describedby={customersError ? errorId : undefined} aria-label="Buscar cliente registrado" className="h-11 border border-[var(--pos-steel)] px-3 text-[var(--pos-ink)] outline-none transition focus:border-[var(--pos-focus)] focus:ring-2 focus:ring-[rgba(37,99,235,0.18)]" onChange={(event) => onCustomerSearchChange(event.target.value)} placeholder="Nombre, número o razón social" ref={searchFieldRef} value={customerSearch} /></label>
          {customersLoading && <p className="mt-3 text-xs font-bold text-[var(--pos-green)]">Cargando clientes...</p>}
          {Boolean(customersError) && <p className="mt-3 text-xs font-bold text-[var(--pos-red)]" id={errorId} role="alert">No se pudo cargar la búsqueda de clientes.</p>}
          <button className="mt-3 w-full border-y border-[var(--pos-steel)] px-3 py-3 text-left text-sm font-bold text-[var(--pos-ink)] hover:bg-[var(--pos-porcelain)]" onClick={() => selectCustomer(null)} type="button"><span className="block">Público general</span><span className="mt-0.5 block text-xs font-medium text-[var(--pos-muted)]">Venta sin cliente registrado</span></button>
          <div className="divide-y divide-[var(--pos-steel)]">
            {customers.map((customer) => <button className="w-full px-3 py-3 text-left transition hover:bg-[var(--pos-porcelain)] disabled:opacity-50" disabled={customer.isActive === false || customer.active === false} key={customer.id} onClick={() => selectCustomer(customer)} type="button"><span className="block break-words text-sm font-bold text-[var(--pos-ink)]">{customer.name}</span><span className="mt-0.5 block break-words text-xs font-medium text-[var(--pos-muted)]">{customer.customerType} · {customer.creditSummary?.effectiveCreditStatus === 'BLOCKED' || customer.isBlockedForCredit ? 'Crédito bloqueado' : customer.creditSummary?.overdueAmount ? `Saldo vencido ${toMoney(customer.creditSummary.overdueAmount)}` : customer.creditStatus ?? 'Crédito disponible'}</span></button>)}
          </div>
        </section>
      </>}
    </section>
  )
}

type PaymentConditionControlProps = Pick<CheckoutDockProps, 'creditOptions' | 'disabledReason' | 'isSubmitting' | 'onPaymentTypeChange' | 'paymentType' | 'selectedCustomer' | 'total'>

function PaymentConditionControl({ creditOptions, disabledReason, isSubmitting, onPaymentTypeChange, paymentType, selectedCustomer, total }: PaymentConditionControlProps) {
  const creditRestriction = getCreditRestriction('CREDIT_SALE', selectedCustomer, total, creditOptions)
  const offlineRestricted = disabledReason?.includes('Sin conexión')
  const requiresSupervisor = Boolean(creditRestriction && selectedCustomer?.creditSummary?.canAdministrativeOverride && !creditOptions?.isAdmin)
  const creditDisabled = Boolean(offlineRestricted || creditRestriction || isSubmitting)
  const creditReason = offlineRestricted
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

  return (
    <section className="grid min-w-0 grid-rows-[auto_2rem] p-3" aria-label="Condición comercial">
      <div><div className="flex items-center justify-between gap-2"><p className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Condición</p><span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">F6</span></div><div aria-label="Condición comercial" className="mt-2 grid h-11 grid-cols-2 border border-[var(--pos-steel)]" role="radiogroup"><button aria-checked={paymentType === 'CASH_SALE'} className={`min-w-0 text-xs font-black transition focus-visible:relative focus-visible:z-10 ${paymentType === 'CASH_SALE' ? 'bg-[var(--pos-ink)] text-white' : 'text-[var(--pos-muted)] hover:bg-[var(--pos-surface-secondary)]'} disabled:cursor-not-allowed disabled:bg-[var(--pos-surface-secondary)] disabled:text-[var(--pos-muted)]`} disabled={isSubmitting} onClick={() => onPaymentTypeChange('CASH_SALE')} role="radio" type="button">Contado</button><button aria-checked={paymentType === 'CREDIT_SALE'} className={`min-w-0 border-l border-[var(--pos-steel)] text-xs font-black transition focus-visible:relative focus-visible:z-10 ${paymentType === 'CREDIT_SALE' ? 'bg-[var(--pos-ink)] text-white' : 'text-[var(--pos-muted)] hover:bg-[var(--pos-surface-secondary)]'} disabled:cursor-not-allowed disabled:bg-[var(--pos-surface-secondary)] disabled:text-[var(--pos-muted)]`} disabled={creditDisabled} onClick={() => onPaymentTypeChange('CREDIT_SALE')} role="radio" type="button">Crédito</button></div></div>
      <p className="self-end text-[0.68rem] font-semibold leading-3 text-[var(--pos-red)]" role={creditReason ? 'status' : undefined}>{creditReason}</p>
    </section>
  )
}

export function CheckoutDock({
  cart,
  confirmButtonRef,
  creditOptions,
  creditRestriction,
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

  return (
    <footer className="z-20 h-40 shrink-0 overflow-visible border-t border-[var(--pos-steel)] bg-white" aria-label="Confirmación de venta">
      <div className="grid h-full grid-cols-2 grid-rows-2 divide-x divide-y divide-[var(--pos-steel)] min-[1440px]:grid-cols-[20fr_13fr_22fr_45fr] min-[1440px]:grid-rows-1 min-[1440px]:divide-y-0">
        <PosCustomerSummary customerSearch={customerSearch} customerSearchRef={customerSearchRef} customers={customers} customersError={customersError} customersLoading={customersLoading} onCustomerSearchChange={onCustomerSearchChange} onCustomerSelect={onCustomerSelect} paymentType={paymentType} selectedCustomer={selectedCustomer} />
        <PaymentConditionControl creditOptions={creditOptions} disabledReason={disabledReason} isSubmitting={isSubmitting} onPaymentTypeChange={onPaymentTypeChange} paymentType={paymentType} selectedCustomer={selectedCustomer} total={total} />
        <PaymentEntryControl compact onPaymentsChange={onPaymentsChange} panelRef={paymentPanelRef} payments={payments} total={total} />
        <div className="grid min-w-0 grid-rows-[minmax(0,1fr)_4rem]">
          <SaleSummary compact cart={cart} creditOptions={creditOptions} creditRestriction={creditRestriction} customer={selectedCustomer} payments={payments} paymentType={paymentType} summaryOnly />
          <div className="grid grid-cols-[40fr_60fr] border-t border-[var(--pos-steel)]">
            <div className="flex min-w-0 items-center justify-between gap-2 px-4"><span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.14em] text-[var(--pos-muted)]">Total</span><output aria-atomic="true" aria-live="polite" className="truncate font-[var(--pos-display)] text-2xl font-bold tracking-[-0.04em]">{toMoney(total)}<span className="sr-only"> Total en vivo</span></output></div>
            <div className="border-l border-[var(--pos-steel)] px-1 py-1"><ConfirmSaleButton buttonRef={confirmButtonRef} compact disabledReason={disabledReason} isSubmitting={isSubmitting} onConfirm={onConfirm} pendingAmount={pendingAmount} total={total} transactionState={transactionState} /></div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export type { CheckoutDockProps }
