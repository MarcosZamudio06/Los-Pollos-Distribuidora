import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeDollarSign, MapPin, ReceiptText, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { useAuth } from '../auth'
import { useCustomers } from '../clientes/hooks/useCustomers'
import type { Customer } from '../clientes/types'
import { usePurchaseLocations } from '../compras/hooks'
import type { OperationalLocation } from '../compras/types'
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
import { buildCreateSalePayload, calculateCartTotal, canConfirmSale, getLocationValidationError, getPaymentReferenceValidationError, getQuantityValidationError, getSaleErrorMessage, getSaleRestriction, toMoney } from './posLogic'
import type { CartItem, CustomerOption, InitialPaymentReference, PaymentMethod, PaymentType, ProductOption, SaleChannel, SaleDocumentType, TicketData } from './types'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { toast } from 'sonner'

function canAccessPos(role?: string | null) {
  return role === 'ADMIN' || role === 'SELLER'
}

function asNumber(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function productToOption(product: Product, locationId: string): ProductOption {
  const balance = product.inventoryBalance ?? product.locationBalance ?? product.balances?.[0]
  const equivalent = product.activeEquivalences?.[0]
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
    unitEquivalentId: equivalent?.id,
    equivalentFactor: equivalent?.factor,
    equivalentUnitFrom: equivalent?.unitFrom,
    equivalentUnitTo: equivalent?.unitTo,
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
    effectiveCreditStatus: customer.effectiveCreditStatus,
    commercialPolicyId: customer.commercialPolicyId,
    creditSummary: customer.creditSummary,
  }
}

function locationLabel(location?: OperationalLocation | null) {
  if (!location) return 'No seleccionada'
  return location.code ? `${location.name} · ${location.code}` : location.name
}

function getSubmitBlocker({
  cart,
  customer,
  locationId,
  paymentMethod,
  paymentReference,
  paymentType,
  submitting,
  requiresAdministrativeInvoice,
  billingRequestReason,
  isAdmin,
  overrideEnabled,
  overrideReason,
}: {
  cart: CartItem[]
  customer: CustomerOption | null
  locationId: string
  paymentMethod: PaymentMethod
  paymentReference: InitialPaymentReference
  paymentType: PaymentType
  submitting: boolean
  requiresAdministrativeInvoice: boolean
  billingRequestReason: string
  isAdmin: boolean
  overrideEnabled: boolean
  overrideReason: string
}) {
  if (!locationId) return 'Selecciona una ubicación operativa.'
  if (cart.length === 0) return 'Agrega al menos un producto.'
  const locationError = getLocationValidationError(cart, locationId)
  if (locationError) return locationError
  const invalidItem = cart.find((item) => getQuantityValidationError(item))
  if (invalidItem) return getQuantityValidationError(invalidItem)
  if (requiresAdministrativeInvoice && !customer) return 'Selecciona un cliente para crear la solicitud administrativa.'
  if (requiresAdministrativeInvoice && !billingRequestReason.trim()) return 'Captura el motivo de la solicitud administrativa.'
  const paymentReferenceError = getPaymentReferenceValidationError(paymentMethod, paymentReference)
  if (paymentReferenceError) return paymentReferenceError
  return canConfirmSale({
    cart,
    creditRestriction: getSaleRestriction(paymentType, customer, calculateCartTotal(cart), paymentMethod, { isAdmin, overrideEnabled, overrideReason }),
    isSubmitting: submitting,
    locationId,
  })
    ? null
    : getSaleRestriction(paymentType, customer, calculateCartTotal(cart), paymentMethod, { isAdmin, overrideEnabled, overrideReason }) ?? 'La venta todavía no puede confirmarse.'
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
  const [paymentReference, setPaymentReference] = useState<InitialPaymentReference>({ bankName: '', referenceNumber: '', cardLastFour: '' })
  const [initialPaymentAmount, setInitialPaymentAmount] = useState(0)
  const [saleChannel, setSaleChannel] = useState<SaleChannel>('COUNTER')
  const [documentType, setDocumentType] = useState<SaleDocumentType>('SIMPLE_NOTE')
  const [physicalFolio, setPhysicalFolio] = useState('')
  const [requiresAdministrativeInvoice, setRequiresAdministrativeInvoice] = useState(false)
  const [billingRequestReason, setBillingRequestReason] = useState('')
  const [billingRequestNotes, setBillingRequestNotes] = useState('')
  const [backendError, setBackendError] = useState<string | null>(null)
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [confirmedSaleId, setConfirmedSaleId] = useState<string>()
  const [ticketFallback, setTicketFallback] = useState<TicketData | null>(null)
  const [pendingSale, setPendingSale] = useState<{ payload: ReturnType<typeof buildCreateSalePayload>; idempotencyKey: string; customerName: string; locationName: string; paymentMethod: PaymentMethod; paymentType: PaymentType; documentType: SaleDocumentType; physicalFolio: string; requiresAdministrativeInvoice: boolean; locationId: string; total: number } | null>(null)

  const products = useProducts({ isActive: 'true', locationId, search: productSearch })
  const customers = useCustomers({ isActive: 'true', search: customerSearch })
  const locations = usePurchaseLocations('')
  const createSale = useCreateSale()
  const ticket = useSaleTicket(confirmedSaleId)

  const productOptions = useMemo(
    () => (products.data ?? []).map((product) => productToOption(product, locationId)).filter((product) => product.locationId === locationId),
    [locationId, products.data],
  )
  const customerOptions = useMemo(() => (customers.data ?? []).map(customerToOption), [customers.data])
  const locationOptions = useMemo(() => locations.data ?? [], [locations.data])
  const selectedLocation = useMemo(() => locationOptions.find((location) => location.id === locationId) ?? null, [locationId, locationOptions])
  const total = calculateCartTotal(cart)
  const isAdmin = user?.role === 'ADMIN'
  const canOverrideCredit = Boolean(paymentType === 'CREDIT_SALE' && isAdmin && selectedCustomer?.creditSummary?.effectiveCreditStatus === 'BLOCKED' && selectedCustomer.creditSummary.canAdministrativeOverride && !selectedCustomer.creditSummary.blockingReasons?.includes('CREDIT_ADMINISTRATIVELY_BLOCKED'))
  const submitBlocker = getSubmitBlocker({ cart, customer: selectedCustomer, locationId, paymentMethod, paymentReference, paymentType, submitting: createSale.isPending, requiresAdministrativeInvoice, billingRequestReason, isAdmin, overrideEnabled, overrideReason })

  function resetOverride() {
    setOverrideEnabled(false)
    setOverrideReason('')
  }

  function handleCustomerSelect(customer: CustomerOption | null) {
    setSelectedCustomer(customer)
    resetOverride()
    setBackendError(null)
  }

  function handleLocationChange(nextLocationId: string) {
    setLocationId(nextLocationId)
    setCart([])
    setBackendError(null)
    resetOverride()
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

  function handleConfirmSale() {
    const blocker = getSubmitBlocker({ cart, customer: selectedCustomer, locationId, paymentMethod, paymentReference, paymentType, submitting: createSale.isPending, requiresAdministrativeInvoice, billingRequestReason, isAdmin, overrideEnabled, overrideReason })
    if (blocker) return
    setBackendError(null)
    setPendingSale({
      idempotencyKey: crypto.randomUUID(),
      payload: buildCreateSalePayload({
        administrativeOverrideReason: overrideEnabled ? overrideReason : undefined,
        billingRequestReason, billingRequestNotes, cart, customer: selectedCustomer, documentType,
        initialPaymentAmount: paymentType === 'CREDIT_SALE' ? initialPaymentAmount : undefined,
        locationId, paymentMethod, paymentReference, paymentType, physicalFolio,
        requiresAdministrativeInvoice, saleChannel, total,
      }),
      customerName: selectedCustomer?.name ?? 'Público general',
      locationName: locationLabel(selectedLocation), paymentMethod, paymentType, documentType,
      physicalFolio, requiresAdministrativeInvoice, locationId, total,
    })
  }

  async function confirmRegistration() {
    if (!pendingSale || createSale.isPending) return
    try {
      const response = await createSale.mutateAsync({ payload: pendingSale.payload, idempotencyKey: pendingSale.idempotencyKey })
      const sale = response.sale
      const saleId = sale?.id
      setConfirmedSaleId(saleId)
      setTicketFallback(
        saleResponseToTicketFallback(
          {
            ticketId: response.ticketId ?? saleId,
            saleNumber: sale?.saleNumber,
            documentType: pendingSale.documentType,
            physicalFolio: pendingSale.physicalFolio.trim() || undefined,
            requiresAdministrativeInvoice: pendingSale.requiresAdministrativeInvoice,
            customerName: pendingSale.customerName,
            locationId: pendingSale.locationId,
            items: sale?.items,
            total: sale?.total ?? pendingSale.total,
            paymentType: pendingSale.paymentType,
            collectionStatus: sale?.collectionStatus,
            status: sale?.status,
            billingRequest: response.billingRequest,
            payments: response.payment ? [{ amount: response.payment.amount, paymentMethod: response.payment.paymentMethod }] : [],
          },
          pendingSale.locationId,
        ),
      )
      setCart([])
      setSelectedCustomer(null)
      setPaymentType('CASH_SALE')
      setPaymentMethod('CASH')
      setPaymentReference({ bankName: '', referenceNumber: '', cardLastFour: '' })
      setInitialPaymentAmount(0)
      setPhysicalFolio('')
      setRequiresAdministrativeInvoice(false)
      setBillingRequestReason('')
      setBillingRequestNotes('')
      resetOverride()
      setPendingSale(null)
      toast.success('Venta registrada correctamente.')
      if ((response.creditWarnings ?? sale?.creditWarnings ?? []).includes('CREDIT_OVERDUE_WARNING')) toast.warning('Venta registrada con advertencia por saldo vencido.')
      if ((response.creditWarnings ?? sale?.creditWarnings ?? []).includes('CREDIT_OVERRIDE_APPLIED')) toast.warning('Venta registrada con autorización administrativa de crédito.')
      void products.refetch()
    } catch (error) {
      setBackendError(getSaleErrorMessage(error))
    }
  }

  if (!canAccessPos(user?.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--erp-surface)] p-6 text-[var(--erp-foreground)]">
        <section className="max-w-xl rounded-[2rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-8 shadow-[var(--erp-shadow)]">
          <h1 className="text-3xl font-black tracking-[-0.05em]">Acceso al POS denegado</h1>
          <p className="mt-3 text-[#68645c]">Solo los roles ADMIN y SELLER pueden registrar ventas desde el POS.</p>
          <Link className="mt-6 inline-flex font-bold text-[#9d2d24]" to="/">Volver a operaciones</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--erp-surface)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">
      <section className="mx-auto grid max-w-[1500px] gap-6">
        <PageHeader
          eyebrow="Ventas POS"
          title="Punto de venta empresarial"
          description="Registra ventas con inventario por ubicación, cliente, documento interno y pago sin modificar reglas de stock, crédito ni contratos de venta."
          actions={
            <div className="grid min-w-[240px] gap-1 rounded-[1.25rem] border border-[rgba(214,155,45,0.28)] bg-[rgba(214,155,45,0.12)] px-4 py-3 text-right">
              <span className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">Total en vivo</span>
              <span className="text-3xl font-black tracking-[-0.06em] text-[var(--erp-foreground)]">{toMoney(total)}</span>
            </div>
          }
        />

        <section className="grid gap-3 md:grid-cols-3" aria-label="Contexto operativo del POS">
          <div className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-4 shadow-[var(--erp-shadow)]">
            <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-[var(--erp-info)]" /><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Ubicación operativa</p></div>
            <p className="mt-2 truncate text-lg font-black">{locationLabel(selectedLocation)}</p>
          </div>
          <div className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-4 shadow-[var(--erp-shadow)]">
            <div className="flex items-center gap-3"><BadgeDollarSign className="h-5 w-5 text-[var(--erp-success)]" /><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Partidas</p></div>
            <p className="mt-2 text-lg font-black">{cart.length} en carrito</p>
          </div>
          <div className="rounded-[1.25rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-4 shadow-[var(--erp-shadow)]">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-[var(--erp-danger)]" /><p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--erp-muted-foreground)]">Acceso</p></div>
            <p className="mt-2 text-lg font-black">ADMIN / SELLER</p>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="grid content-start gap-6">
            <ProductSearch error={products.error} isLoading={products.isLoading} locations={locationOptions} locationsError={locations.error} locationsLoading={locations.isLoading} locationId={locationId} onAdd={handleAddProduct} onLocationChange={handleLocationChange} onSearchChange={setProductSearch} products={productOptions} search={productSearch} />
            <Cart items={cart} onQuantityChange={handleQuantityChange} onRemove={(productId) => setCart((items) => items.filter((item) => item.productId !== productId))} />
          </div>

          <aside className="grid content-start gap-5 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto xl:pr-1" aria-label="Carrito y confirmación de venta">
            <section className="rounded-[1.5rem] border border-[color:var(--erp-border)] bg-[var(--erp-foreground)] p-5 text-white shadow-[0_22px_70px_rgba(17,24,21,0.18)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold)]">Resumen sticky</p>
                  <h2 className="mt-1 text-2xl font-black tracking-[-0.05em]">{toMoney(total)}</h2>
                  <p className="mt-1 text-sm text-white/65">{cart.length} partidas · {paymentType === 'CREDIT_SALE' ? 'Venta a crédito' : 'Venta de contado'}</p>
                </div>
                <ReceiptText className="h-6 w-6 text-[var(--erp-brand-gold)]" />
              </div>
            </section>
            <CustomerSelector customers={customerOptions} error={customers.error} isLoading={customers.isLoading} onSearchChange={setCustomerSearch} onSelect={handleCustomerSelect} search={customerSearch} selectedCustomer={selectedCustomer} />
            <PaymentMethodSelector
              initialPaymentAmount={initialPaymentAmount}
              onInitialPaymentAmountChange={setInitialPaymentAmount}
              onPaymentMethodChange={(method) => { setPaymentMethod(method); setPaymentReference({ bankName: '', referenceNumber: '', cardLastFour: '' }) }}
              onPaymentTypeChange={(type) => { setPaymentType(type); resetOverride(); if (type === 'CASH_SALE') setInitialPaymentAmount(0) }}
              onPaymentReferenceChange={setPaymentReference}
              paymentMethod={paymentMethod}
              paymentReference={paymentReference}
              paymentType={paymentType}
            />
            <section className="rounded-[1.5rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[var(--erp-shadow)]">
              <h2 className="text-lg font-black tracking-[-0.04em]">Documento de venta</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--erp-muted-foreground)]">Control interno de comprobante, canal y folio físico cuando aplique.</p>
              <div className="mt-4 grid gap-3">
                <select className="rounded-xl border border-[color:var(--erp-border)] bg-white px-4 py-3 text-sm font-semibold" onChange={(event) => setSaleChannel(event.target.value as SaleChannel)} value={saleChannel}>
                  <option value="COUNTER">Mostrador</option>
                  <option value="EXTERNAL_POINT_OF_SALE">Punto externo de venta</option>
                  <option value="ROUTE">Ruta</option>
                  <option value="INSTITUTIONAL">Institucional</option>
                  <option value="WHOLESALE">Mayoreo</option>
                </select>
                <select className="rounded-xl border border-[color:var(--erp-border)] bg-white px-4 py-3 text-sm font-semibold" onChange={(event) => setDocumentType(event.target.value as SaleDocumentType)} value={documentType}>
                  <option value="SCALE_TICKET">Ticket de báscula</option>
                  <option value="SIMPLE_NOTE">Nota sencilla</option>
                  <option value="LARGE_NOTE">Nota grande</option>
                  <option value="INTERNAL_RECEIPT">Comprobante interno</option>
                </select>
                <input className="rounded-xl border border-[color:var(--erp-border)] bg-white px-4 py-3 text-sm font-semibold" onChange={(event) => setPhysicalFolio(event.target.value)} placeholder="Folio físico cuando aplique" value={physicalFolio} />
              </div>
            </section>
            <BillingRequestPanel
              hasCustomer={Boolean(selectedCustomer)}
              notes={billingRequestNotes}
              onNotesChange={setBillingRequestNotes}
              onReasonChange={setBillingRequestReason}
              onRequiresAdministrativeInvoiceChange={setRequiresAdministrativeInvoice}
              reason={billingRequestReason}
              requiresAdministrativeInvoice={requiresAdministrativeInvoice}
            />
            {canOverrideCredit && <section className="rounded-[1.5rem] border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-[var(--erp-shadow)]">
              <label className="flex items-start gap-3 font-black"><input checked={overrideEnabled} name="credit-override" onChange={(event) => { setOverrideEnabled(event.target.checked); if (!event.target.checked) setOverrideReason('') }} type="checkbox" /><span>Autorizar excepción de crédito<span className="mt-1 block text-sm font-semibold text-amber-800">Solo ADMIN puede continuar y el motivo quedará registrado en la venta.</span></span></label>
              {overrideEnabled && <label className="mt-4 grid gap-2 text-sm font-black">Motivo obligatorio<textarea className="min-h-24 rounded-xl border border-amber-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-amber-300" name="credit-override-reason" onChange={(event) => setOverrideReason(event.target.value)} placeholder="Describe quién autorizó y por qué" value={overrideReason} /></label>}
            </section>}
            <SaleSummary cart={cart} creditOptions={{ isAdmin, overrideEnabled, overrideReason }} customer={selectedCustomer} paymentType={paymentType} />
            {backendError && <p role="alert" className="rounded-2xl border border-[rgba(157,45,36,0.22)] bg-[rgba(157,45,36,0.08)] p-4 text-sm font-bold text-[var(--erp-danger)]">{backendError}</p>}
            <ConfirmSaleButton disabledReason={submitBlocker} isSubmitting={createSale.isPending} onConfirm={handleConfirmSale} />
          </aside>
        </div>
      </section>
      {(ticketFallback || ticket.data) && <TicketModal fallback={ticketFallback} isLoading={ticket.isLoading} onClose={() => { setConfirmedSaleId(undefined); setTicketFallback(null) }} ticket={ticket.data} />}
      <ConfirmationDialog confirmLabel="Confirmar registro" description="Verifique la venta antes de descontar inventario y registrar el cobro." isLoading={createSale.isPending} onConfirm={confirmRegistration} onOpenChange={(open) => { if (!open) setPendingSale(null) }} open={Boolean(pendingSale)} title="Confirmar venta">
        <p><strong>Cliente:</strong> {pendingSale?.customerName}</p><p><strong>Sucursal:</strong> {pendingSale?.locationName}</p><p><strong>Total:</strong> {toMoney(pendingSale?.total ?? 0)}</p><p><strong>Forma de pago:</strong> {pendingSale?.paymentMethod}</p>
        {pendingSale?.payload.administrativeOverrideReason && <p className="rounded-xl bg-amber-50 p-3 text-amber-900"><strong>Autorización administrativa:</strong> {pendingSale.payload.administrativeOverrideReason}</p>}
        {backendError && <p className="font-semibold text-[var(--erp-danger)]" role="alert">{backendError}</p>}
      </ConfirmationDialog>
    </main>
  )
}
