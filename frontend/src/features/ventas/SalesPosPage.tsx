import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiClientError } from '../../lib/api'
import { useAuth } from '../auth'
import { useCustomers } from '../clientes/hooks/useCustomers'
import type { Customer } from '../clientes/types'
import { useProducts } from '../inventario/hooks/useProducts'
import type { Product } from '../inventario/types'
import {
  BillingRequestPanel,
  Cart,
  ConfirmSaleButton,
  CustomerSelector,
  PaymentMethodSelector,
  ProductSearch,
  SaleSummary,
  TicketModal,
} from './components'
import { useCreateSale, useSaleTicket } from './hooks'
import { buildCreateSalePayload, calculateCartTotal, canConfirmSale, getLocationValidationError, getQuantityValidationError, getSaleRestriction, toMoney } from './posLogic'
import type { CartItem, CustomerOption, PaymentMethod, PaymentType, ProductOption, SaleChannel, SaleDocumentType, TicketData } from './types'

function canAccessPos(role?: string | null) {
  return role === 'ADMIN' || role === 'SELLER'
}

function asNumber(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function productToOption(product: Product, locationId: string): ProductOption {
  const balance = product.inventoryBalance ?? product.locationBalance ?? product.balances?.[0]
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    presentationType: product.presentationType ?? product.presentation ?? 'CUT',
    unit: product.unit ?? product.operationalUnit ?? 'KG',
    salePrice: asNumber(product.salePrice),
    unitPrice: asNumber(product.salePrice),
    locationId: balance?.locationId ?? locationId,
    locationName: balance?.locationName,
    availableKg: asNumber(balance?.quantityKg),
    availablePieces: asNumber(balance?.quantityPieces),
    isLowStock: balance?.isLowStock,
    equivalentPolicyStatus: product.equivalentPolicyStatus ?? product.equivalencePolicyStatus,
    unitEquivalentId: product.activeEquivalences?.[0]?.id,
  }
}

function customerToOption(customer: Customer): CustomerOption {
  return {
    id: customer.id,
    name: customer.name,
    commercialName: customer.commercialName,
    customerNumber: customer.customerNumber,
    customerType: customer.customerType,
    creditStatus: customer.creditStatus,
    creditLimit: customer.creditLimit,
    isActive: customer.isActive,
    active: customer.active,
    isBlockedForCredit: customer.isBlockedForCredit,
    commercialPolicyId: customer.commercialPolicyId,
    creditSummary: customer.creditSummary,
  }
}

function getSubmitBlocker({
  cart,
  customer,
  locationId,
  paymentMethod,
  paymentType,
  submitting,
}: {
  cart: CartItem[]
  customer: CustomerOption | null
  locationId: string
  paymentMethod: PaymentMethod
  paymentType: PaymentType
  submitting: boolean
}) {
  if (!locationId) return 'Selecciona una ubicación operativa.'
  if (cart.length === 0) return 'Agrega al menos un producto.'
  const locationError = getLocationValidationError(cart, locationId)
  if (locationError) return locationError
  const invalidItem = cart.find((item) => getQuantityValidationError(item))
  if (invalidItem) return getQuantityValidationError(invalidItem)
  return canConfirmSale({
    cart,
    creditRestriction: getSaleRestriction(paymentType, customer, calculateCartTotal(cart), paymentMethod),
    isSubmitting: submitting,
    locationId,
  })
    ? null
    : getSaleRestriction(paymentType, customer, calculateCartTotal(cart), paymentMethod) ?? 'La venta todavía no puede confirmarse.'
}

function saleResponseToTicketFallback(response: TicketData | null, locationId: string): TicketData | null {
  if (!response) return null
  return {
    ...response,
    locationId: response.locationId ?? locationId,
    legend: response.legend ?? 'Comprobante interno sin validez fiscal.',
  }
}

export function SalesPosPage() {
  const { user } = useAuth()
  const [locationId, setLocationId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH_SALE')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH')
  const [initialPaymentAmount, setInitialPaymentAmount] = useState(0)
  const [saleChannel, setSaleChannel] = useState<SaleChannel>('COUNTER')
  const [documentType, setDocumentType] = useState<SaleDocumentType>('SIMPLE_NOTE')
  const [physicalFolio, setPhysicalFolio] = useState('')
  const [requiresAdministrativeInvoice, setRequiresAdministrativeInvoice] = useState(false)
  const [billingRequestId, setBillingRequestId] = useState('')
  const [backendError, setBackendError] = useState<string | null>(null)
  const [confirmedSaleId, setConfirmedSaleId] = useState<string>()
  const [ticketFallback, setTicketFallback] = useState<TicketData | null>(null)

  const products = useProducts({ isActive: 'true', locationId, search: productSearch })
  const customers = useCustomers({ isActive: 'true', search: customerSearch })
  const createSale = useCreateSale()
  const ticket = useSaleTicket(confirmedSaleId)

  const productOptions = useMemo(
    () => (products.data ?? []).map((product) => productToOption(product, locationId)).filter((product) => product.locationId === locationId),
    [locationId, products.data],
  )
  const customerOptions = useMemo(() => (customers.data ?? []).map(customerToOption), [customers.data])
  const total = calculateCartTotal(cart)
  const submitBlocker = getSubmitBlocker({ cart, customer: selectedCustomer, locationId, paymentMethod, paymentType, submitting: createSale.isPending })

  function handleLocationChange(nextLocationId: string) {
    setLocationId(nextLocationId)
    setCart([])
    setBackendError(null)
  }

  function handleAddProduct(product: ProductOption) {
    setBackendError(null)
    setCart((currentCart) => {
      const existing = currentCart.find((item) => item.productId === product.id)
      if (existing) return currentCart
      const nextItem: CartItem = {
        ...product,
        productId: product.id,
        quantityKg: product.unit === 'KG' || product.unit === 'KG_AND_PIECE' ? Math.min(1, product.availableKg) : 0,
        quantityPieces: product.unit === 'PIECE' ? Math.min(1, product.availablePieces) : 0,
      }
      return [...currentCart, nextItem]
    })
  }

  function handleQuantityChange(productId: string, quantityKg: number, quantityPieces: number) {
    setCart((currentCart) => currentCart.map((item) => (item.productId === productId ? { ...item, quantityKg, quantityPieces } : item)))
  }

  async function handleConfirmSale() {
    const blocker = getSubmitBlocker({ cart, customer: selectedCustomer, locationId, paymentMethod, paymentType, submitting: createSale.isPending })
    if (blocker) return
    setBackendError(null)

    try {
      const response = await createSale.mutateAsync(
        buildCreateSalePayload({
          billingRequestId,
          cart,
          customer: selectedCustomer,
          documentType,
          initialPaymentAmount: paymentType === 'CREDIT_SALE' ? initialPaymentAmount : undefined,
          locationId,
          paymentMethod,
          paymentType,
          physicalFolio,
          requiresAdministrativeInvoice,
          saleChannel,
          total,
        }),
      )
      const sale = response.sale
      const saleId = sale?.id
      setConfirmedSaleId(saleId)
      setTicketFallback(
        saleResponseToTicketFallback(
          {
            ticketId: response.ticketId ?? saleId,
            saleNumber: sale?.saleNumber,
            documentType,
            physicalFolio: physicalFolio.trim() || undefined,
            requiresAdministrativeInvoice,
            customerName: selectedCustomer?.name,
            locationId,
            items: sale?.items,
            total: sale?.total ?? total,
            paymentType,
            collectionStatus: sale?.collectionStatus,
            status: sale?.status,
            payments: response.payment ? [{ amount: response.payment.amount, paymentMethod: response.payment.paymentMethod }] : [],
          },
          locationId,
        ),
      )
      setCart([])
      setPaymentType('CASH_SALE')
      setPaymentMethod('CASH')
      setInitialPaymentAmount(0)
      setPhysicalFolio('')
      setRequiresAdministrativeInvoice(false)
      setBillingRequestId('')
      void products.refetch()
    } catch (error) {
      setBackendError(error instanceof ApiClientError || error instanceof Error ? error.message : 'La confirmación de la venta falló.')
    }
  }

  if (!canAccessPos(user?.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] p-6 text-[#20211f]">
        <section className="max-w-xl rounded-[2rem] bg-white p-8">
          <h1 className="text-3xl font-black tracking-[-0.05em]">Acceso al POS denegado</h1>
          <p className="mt-3 text-[#68645c]">Solo los roles ADMIN y SELLER pueden registrar ventas desde el POS.</p>
          <Link className="mt-6 inline-flex font-bold text-[#9d2d24]" to="/">Volver a operaciones</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto grid max-w-7xl gap-8">
        <header className="overflow-hidden rounded-[2rem] border border-[#20211f]/10 bg-[#20211f] text-white shadow-[0_24px_80px_rgba(32,33,31,0.16)]">
          <div className="grid gap-6 p-6 md:grid-cols-[1.2fr_0.8fr] md:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#f0b44c]">Punto de venta</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">Ventas rápidas con stock por ubicación</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Registra ventas de contado o crédito sin stock global, sin promesas de factura fiscal ni atajos de cobranza.</p>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 text-sm text-white/75">
              <p className="font-black text-white">Total en vivo</p>
              <p className="mt-1 text-4xl font-black tracking-[-0.06em] text-[#f0b44c]">{toMoney(total)}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="grid gap-6">
            <ProductSearch error={products.error} isLoading={products.isLoading} locationId={locationId} onAdd={handleAddProduct} onLocationChange={handleLocationChange} onSearchChange={setProductSearch} products={productOptions} search={productSearch} />
            <Cart items={cart} onQuantityChange={handleQuantityChange} onRemove={(productId) => setCart((items) => items.filter((item) => item.productId !== productId))} />
          </div>

          <aside className="grid content-start gap-6">
            <CustomerSelector customers={customerOptions} error={customers.error} isLoading={customers.isLoading} onSearchChange={setCustomerSearch} onSelect={setSelectedCustomer} search={customerSearch} selectedCustomer={selectedCustomer} />
            <PaymentMethodSelector
              initialPaymentAmount={initialPaymentAmount}
              onInitialPaymentAmountChange={setInitialPaymentAmount}
              onPaymentMethodChange={setPaymentMethod}
              onPaymentTypeChange={(type) => { setPaymentType(type); if (type === 'CASH_SALE') setInitialPaymentAmount(0) }}
              paymentMethod={paymentMethod}
              paymentType={paymentType}
            />
            <section className="rounded-[2rem] border border-[#20211f]/10 bg-white p-5">
              <h2 className="text-xl font-black tracking-[-0.04em]">Documento de venta</h2>
              <div className="mt-3 grid gap-3">
                <select className="rounded-2xl border border-[#20211f]/15 px-4 py-3" onChange={(event) => setSaleChannel(event.target.value as SaleChannel)} value={saleChannel}>
                  <option value="COUNTER">Mostrador</option>
                  <option value="EXTERNAL_POINT_OF_SALE">Punto externo de venta</option>
                  <option value="ROUTE">Ruta</option>
                  <option value="INSTITUTIONAL">Institucional</option>
                  <option value="WHOLESALE">Mayoreo</option>
                </select>
                <select className="rounded-2xl border border-[#20211f]/15 px-4 py-3" onChange={(event) => setDocumentType(event.target.value as SaleDocumentType)} value={documentType}>
                  <option value="SCALE_TICKET">Ticket de báscula</option>
                  <option value="SIMPLE_NOTE">Nota sencilla</option>
                  <option value="LARGE_NOTE">Nota grande</option>
                  <option value="INTERNAL_RECEIPT">Comprobante interno</option>
                </select>
                <input className="rounded-2xl border border-[#20211f]/15 px-4 py-3" onChange={(event) => setPhysicalFolio(event.target.value)} placeholder="Folio físico cuando aplique" value={physicalFolio} />
              </div>
            </section>
            <BillingRequestPanel
              billingRequestId={billingRequestId}
              onBillingRequestIdChange={setBillingRequestId}
              onRequiresAdministrativeInvoiceChange={setRequiresAdministrativeInvoice}
              requiresAdministrativeInvoice={requiresAdministrativeInvoice}
            />
            <SaleSummary cart={cart} customer={selectedCustomer} paymentType={paymentType} />
            {backendError && <p role="alert" className="rounded-2xl bg-[#d43f2f]/10 p-4 text-sm font-bold text-[#9d2d24]">{backendError}</p>}
            <ConfirmSaleButton disabledReason={submitBlocker} isSubmitting={createSale.isPending} onConfirm={handleConfirmSale} />
          </aside>
        </div>
      </section>
      {(ticketFallback || ticket.data) && <TicketModal fallback={ticketFallback} isLoading={ticket.isLoading} onClose={() => { setConfirmedSaleId(undefined); setTicketFallback(null) }} ticket={ticket.data} />}
    </main>
  )
}
