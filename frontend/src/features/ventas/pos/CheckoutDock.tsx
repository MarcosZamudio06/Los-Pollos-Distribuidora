import type { RefObject } from 'react'
import { ConfirmSaleButton, CustomerSelector, PaymentEntryControl, PaymentTypeControl, SaleSummary } from '../components'
import type { CreditRestrictionOptions } from '../posLogic'
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
    <footer className="z-20 h-36 shrink-0 overflow-hidden border-t-2 border-[var(--pos-ink)] bg-white" aria-label="Confirmación de venta">
      <div className="grid h-full grid-cols-2 grid-rows-2 divide-x divide-y divide-[var(--pos-steel)] xl:grid-cols-[27fr_23fr_20fr_30fr] xl:grid-rows-1 xl:divide-y-0">
        <CustomerSelector compact customers={customers} error={customersError} isLoading={customersLoading} onSearchChange={onCustomerSearchChange} onSelect={onCustomerSelect} search={customerSearch} searchInputRef={customerSearchRef} selectedCustomer={selectedCustomer} />
        <PaymentTypeControl compact onPaymentTypeChange={onPaymentTypeChange} paymentType={paymentType} />
        <PaymentEntryControl compact onPaymentsChange={onPaymentsChange} panelRef={paymentPanelRef} payments={payments} total={total} />
        <div className="grid min-w-0 grid-cols-[1fr_1.1fr] gap-3 p-3"><SaleSummary compact cart={cart} creditOptions={creditOptions} creditRestriction={creditRestriction} customer={selectedCustomer} paymentType={paymentType} /><ConfirmSaleButton buttonRef={confirmButtonRef} compact disabledReason={disabledReason} isSubmitting={isSubmitting} onConfirm={onConfirm} pendingAmount={pendingAmount} total={total} transactionState={transactionState} /></div>
      </div>
    </footer>
  )
}

export type { CheckoutDockProps }
