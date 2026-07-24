import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Keyboard, MapPin, Maximize2, Minimize2, Printer, ReceiptText, Ruler, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
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
  NumericPad,
  PaymentMethodSelector,
  ProductSearch,
  SaleSummary,
  TicketModal,
} from './components'
import { useCreateSale, useSaleTicket } from './hooks'
import { buildCreateSalePayload, calculateCartTotal, calculateItemSubtotal, canConfirmSale, getLocationValidationError, getPaymentsValidationError, getPosLocationOptions, getQuantityValidationError, getSaleChannelsForLocation, getSaleErrorMessage, getSaleRestriction, toMoney } from './posLogic'
import type { CartItem, CustomerOption, PaymentType, ProductOption, SaleChannel, SaleDocumentType, SalePaymentInput } from './types'
import { ConfirmationDialog } from '@/components/shared/confirmation-dialog'
import { toast } from 'sonner'
import { documentTypeLabel, paymentMethodLabel, paymentTypeLabel, saleChannelLabel } from './saleLabels'

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
    categoryName: typeof product.category === 'object' && product.category ? product.category.name : typeof product.category === 'string' ? product.category : null,
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

function formatQuantity(value: number) {
  return value.toLocaleString('es-MX', { maximumFractionDigits: 3 })
}

type PendingSale = {
  payload: ReturnType<typeof buildCreateSalePayload>
  idempotencyKey: string
  cart: CartItem[]
  customer: CustomerOption | null
  customerName: string
  locationName: string
  paymentType: PaymentType
  payments: SalePaymentInput[]
  saleChannel: SaleChannel
  documentType: SaleDocumentType
  physicalFolio: string
  requiresAdministrativeInvoice: boolean
  billingRequestReason: string
  billingRequestNotes: string
  locationId: string
  total: number
}

function getSubmitBlocker({
  cart,
  customer,
  locationId,
  payments,
  paymentType,
  submitting,
  requiresAdministrativeInvoice,
  billingRequestReason,
  isAdmin,
  overrideEnabled,
  overrideReason,
  saleChannel,
  allowedSaleChannels,
}: {
  cart: CartItem[]
  customer: CustomerOption | null
  locationId: string
  payments: SalePaymentInput[]
  paymentType: PaymentType
  submitting: boolean
  requiresAdministrativeInvoice: boolean
  billingRequestReason: string
  isAdmin: boolean
  overrideEnabled: boolean
  overrideReason: string
  saleChannel: SaleChannel
  allowedSaleChannels: readonly SaleChannel[]
}) {
  if (!locationId) return 'Selecciona una ubicación operativa.'
  if (!allowedSaleChannels.includes(saleChannel)) return 'Selecciona un canal válido para la ubicación operativa.'
  if (cart.length === 0) return 'Agrega al menos un producto.'
  const locationError = getLocationValidationError(cart, locationId)
  if (locationError) return locationError
  const invalidItem = cart.find((item) => getQuantityValidationError(item))
  if (invalidItem) return getQuantityValidationError(invalidItem)
  if (requiresAdministrativeInvoice && !customer) return 'Selecciona un cliente para crear la solicitud administrativa.'
  if (requiresAdministrativeInvoice && !billingRequestReason.trim()) return 'Captura el motivo de la solicitud administrativa.'
  const total = calculateCartTotal(cart)
  const paymentsError = payments.length > 0 ? getPaymentsValidationError(payments, total) : null
  if (paymentsError) return paymentsError
  return canConfirmSale({
    cart,
    creditRestriction: getSaleRestriction(paymentType, customer, total, payments.length > 0, { isAdmin, overrideEnabled, overrideReason }),
    isSubmitting: submitting,
    locationId,
  })
    ? null
    : getSaleRestriction(paymentType, customer, total, payments.length > 0, { isAdmin, overrideEnabled, overrideReason }) ?? 'La venta todavía no puede confirmarse.'
}

export function SalesPosPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const isSeller = user?.role === 'SELLER'
  const [adminLocationId, setAdminLocationId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null)
  const [paymentType, setPaymentType] = useState<PaymentType>('CASH_SALE')
  const [payments, setPayments] = useState<SalePaymentInput[]>([])
  const [selectedSaleChannel, setSelectedSaleChannel] = useState<SaleChannel | null>(null)
  const [documentType, setDocumentType] = useState<SaleDocumentType>('SIMPLE_NOTE')
  const [physicalFolio, setPhysicalFolio] = useState('')
  const [requiresAdministrativeInvoice, setRequiresAdministrativeInvoice] = useState(false)
  const [billingRequestReason, setBillingRequestReason] = useState('')
  const [billingRequestNotes, setBillingRequestNotes] = useState('')
  const [backendError, setBackendError] = useState<string | null>(null)
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [recentProducts, setRecentProducts] = useState<ProductOption[]>([])
  const [activeCartItemId, setActiveCartItemId] = useState<string>()
  const [activeQuantityField, setActiveQuantityField] = useState<'kg' | 'pieces'>('kg')
  const [keypadValue, setKeypadValue] = useState('')
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [showNewSaleDialog, setShowNewSaleDialog] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [confirmedSaleId, setConfirmedSaleId] = useState<string>()
  const [confirmedDocumentId, setConfirmedDocumentId] = useState<string>()
  const [pendingSale, setPendingSale] = useState<PendingSale | null>(null)
  const pageRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const customerSearchRef = useRef<HTMLInputElement>(null)
  const paymentPanelRef = useRef<HTMLElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const pendingScanRef = useRef<string | null>(null)

  const contextLocationId = isSeller ? user?.operationalLocationId ?? '' : adminLocationId
  const locations = usePurchaseLocations('')
  const locationOptions = useMemo(
    () => getPosLocationOptions(locations.data ?? [], user?.role, user?.operationalLocationId),
    [locations.data, user?.operationalLocationId, user?.role],
  )
  const selectedLocation = useMemo(() => locationOptions.find((location) => location.id === contextLocationId) ?? null, [contextLocationId, locationOptions])
  const locationId = selectedLocation?.id ?? ''
  const allowedSaleChannels = useMemo(() => getSaleChannelsForLocation(selectedLocation?.type), [selectedLocation?.type])
  const saleChannel = selectedSaleChannel && allowedSaleChannels.includes(selectedSaleChannel)
    ? selectedSaleChannel
    : allowedSaleChannels[0] ?? 'COUNTER'
  const products = useProducts({ isActive: 'true', locationId: selectedLocation?.id ?? '', search: productSearch })
  const customers = useCustomers({ isActive: 'true', search: customerSearch })
  const createSale = useCreateSale()
  const ticket = useSaleTicket(confirmedSaleId, confirmedDocumentId)

  const productOptions = useMemo(
    () => (products.data ?? []).map((product) => productToOption(product, selectedLocation?.id ?? '')).filter((product) => product.locationId === selectedLocation?.id),
    [products.data, selectedLocation?.id],
  )
  const frequentProducts = useMemo(
    () => recentProducts.filter((product) => product.locationId === selectedLocation?.id),
    [recentProducts, selectedLocation?.id],
  )
  const customerOptions = useMemo(() => (customers.data ?? []).map(customerToOption), [customers.data])
  const total = calculateCartTotal(cart)
  const activeCartItem = cart.find((item) => item.productId === activeCartItemId) ?? null
  const canOverrideCredit = Boolean(paymentType === 'CREDIT_SALE' && isAdmin && selectedCustomer?.creditSummary?.effectiveCreditStatus === 'BLOCKED' && selectedCustomer.creditSummary.canAdministrativeOverride && !selectedCustomer.creditSummary.blockingReasons?.includes('CREDIT_ADMINISTRATIVELY_BLOCKED'))
  const submitBlocker = getSubmitBlocker({ cart, customer: selectedCustomer, locationId, payments, paymentType, submitting: createSale.isPending, requiresAdministrativeInvoice, billingRequestReason, isAdmin, overrideEnabled, overrideReason, saleChannel, allowedSaleChannels })

  useEffect(() => {
    const pendingScan = pendingScanRef.current
    if (!pendingScan) return
    const match = productOptions.find((product) => product.sku?.trim().toLowerCase() === pendingScan || product.name.trim().toLowerCase() === pendingScan)
    if (!match) return
    pendingScanRef.current = null
    handleAddProduct(match)
    setProductSearch('')
    setScanStatus(`Agregado: ${match.name}`)
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }, [productOptions])

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
    if (isSeller) return
    setAdminLocationId(nextLocationId)
    pendingScanRef.current = null
    setCart([])
    setActiveCartItemId(undefined)
    setProductSearch('')
    setScanStatus(null)
    setBackendError(null)
    resetOverride()
  }

  function handleAddProduct(product: ProductOption) {
    setBackendError(null)
    setScanStatus(null)
    setActiveCartItemId(product.id)
    setActiveQuantityField(product.unit === 'PIECE' ? 'pieces' : 'kg')
    setKeypadValue(String(product.unit === 'PIECE' ? Math.min(1, product.availablePieces) : Math.min(1, product.availableKg)))
    setRecentProducts((current) => [product, ...current.filter((item) => item.id !== product.id)].slice(0, 6))
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
    if (productId === activeCartItemId) setKeypadValue(String(activeQuantityField === 'kg' ? quantityKg || '' : quantityPieces || ''))
  }

  function handleQuantityFocus(productId: string, field: 'kg' | 'pieces') {
    setActiveCartItemId(productId)
    setActiveQuantityField(field)
    const item = cart.find((current) => current.productId === productId)
    const value = field === 'kg' ? item?.quantityKg : item?.quantityPieces
    setKeypadValue(value ? String(value) : '')
  }

  function handleCartActivate(productId: string) {
    const item = cart.find((current) => current.productId === productId)
    const field = item?.unit === 'PIECE' ? 'pieces' : 'kg'
    handleQuantityFocus(productId, field)
  }

  function handleKeypadInput(key: string) {
    if (!activeCartItem || (key === '.' && activeQuantityField === 'pieces')) return
    if (key === '.' && keypadValue.includes('.')) return
    const nextValue = key === '.' ? `${keypadValue || '0'}.` : `${keypadValue}${key}`
    if (nextValue.length > 10) return
    setKeypadValue(nextValue)
    const numericValue = Number(nextValue)
    if (!Number.isFinite(numericValue)) return
    if (activeQuantityField === 'kg') handleQuantityChange(activeCartItem.productId, numericValue, activeCartItem.quantityPieces)
    else handleQuantityChange(activeCartItem.productId, activeCartItem.quantityKg, numericValue)
  }

  function handleKeypadDelete() {
    const nextValue = keypadValue.slice(0, -1)
    setKeypadValue(nextValue)
    const numericValue = Number(nextValue || 0)
    if (!activeCartItem) return
    if (activeQuantityField === 'kg') handleQuantityChange(activeCartItem.productId, numericValue, activeCartItem.quantityPieces)
    else handleQuantityChange(activeCartItem.productId, activeCartItem.quantityKg, numericValue)
  }

  function handleKeypadClear() {
    setKeypadValue('')
    if (!activeCartItem) return
    if (activeQuantityField === 'kg') handleQuantityChange(activeCartItem.productId, 0, activeCartItem.quantityPieces)
    else handleQuantityChange(activeCartItem.productId, activeCartItem.quantityKg, 0)
  }

  function handleProductSearchSubmit(value: string) {
    const normalizedValue = value.trim().toLowerCase()
    if (!normalizedValue) return
    const match = productOptions.find((product) => product.sku?.trim().toLowerCase() === normalizedValue || product.name.trim().toLowerCase() === normalizedValue)
    if (!match) {
      pendingScanRef.current = normalizedValue
      setScanStatus(`Buscando el código ${value.trim()}...`)
      return
    }
    pendingScanRef.current = null
    handleAddProduct(match)
    setProductSearch('')
    setScanStatus(`Agregado: ${match.name}`)
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  function clearSaleDraft() {
    pendingScanRef.current = null
    setCart([])
    setActiveCartItemId(undefined)
    setKeypadValue('')
    setSelectedCustomer(null)
    setProductSearch('')
    setCustomerSearch('')
    setPaymentType('CASH_SALE')
    setPayments([])
    setSelectedSaleChannel(null)
    setDocumentType('SIMPLE_NOTE')
    setPhysicalFolio('')
    setRequiresAdministrativeInvoice(false)
    setBillingRequestReason('')
    setBillingRequestNotes('')
    setBackendError(null)
    setScanStatus(null)
    resetOverride()
  }

  function hasDraftChanges() {
    return Boolean(cart.length || selectedCustomer || productSearch || customerSearch || payments.length || physicalFolio || requiresAdministrativeInvoice || billingRequestReason || billingRequestNotes || overrideEnabled || overrideReason)
  }

  function handleNewSale() {
    if (pendingSale) return
    if (hasDraftChanges()) {
      setShowNewSaleDialog(true)
      return
    }
    clearSaleDraft()
    setConfirmedSaleId(undefined)
    setConfirmedDocumentId(undefined)
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  function confirmNewSale() {
    clearSaleDraft()
    setConfirmedSaleId(undefined)
    setConfirmedDocumentId(undefined)
    setShowNewSaleDialog(false)
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  function handleConfirmSale() {
    if (pendingSale || createSale.isPending) return
    const blocker = getSubmitBlocker({ cart, customer: selectedCustomer, locationId, payments, paymentType, submitting: createSale.isPending, requiresAdministrativeInvoice, billingRequestReason, isAdmin, overrideEnabled, overrideReason, saleChannel, allowedSaleChannels })
    if (blocker) return
    setBackendError(null)
    setPendingSale({
      idempotencyKey: crypto.randomUUID(),
      payload: buildCreateSalePayload({
        administrativeOverrideReason: overrideEnabled ? overrideReason : undefined,
        billingRequestReason, billingRequestNotes, cart, customer: selectedCustomer, documentType,
        locationId, payments, paymentType, physicalFolio,
        requiresAdministrativeInvoice, saleChannel, total,
      }),
      cart: cart.map((item) => ({ ...item })),
      customer: selectedCustomer,
      customerName: selectedCustomer?.name ?? 'Público general',
      locationName: locationLabel(selectedLocation), paymentType, payments: payments.map((payment) => ({ ...payment })), saleChannel, documentType,
      physicalFolio, requiresAdministrativeInvoice, billingRequestReason, billingRequestNotes, locationId, total,
    })
  }

  async function confirmRegistration() {
    if (!pendingSale || createSale.isPending) return
    try {
      const response = await createSale.mutateAsync({ payload: pendingSale.payload, idempotencyKey: pendingSale.idempotencyKey })
      const sale = response.sale
      const saleId = sale?.id
      const documentId = response.documents?.find((document) => document.documentType === pendingSale.documentType)?.id
      setConfirmedSaleId(saleId)
      setConfirmedDocumentId(documentId)
      clearSaleDraft()
      setPendingSale(null)
      toast.success('Venta registrada correctamente.')
      if ((response.creditWarnings ?? sale?.creditWarnings ?? []).includes('CREDIT_OVERDUE_WARNING')) toast.warning('Venta registrada con advertencia por saldo vencido.')
      if ((response.creditWarnings ?? sale?.creditWarnings ?? []).includes('CREDIT_OVERRIDE_APPLIED')) toast.warning('Venta registrada con autorización administrativa de crédito.')
      void products.refetch()
    } catch (error) {
      setBackendError(getSaleErrorMessage(error))
    }
  }

  async function toggleFullscreen() {
    if (!document.fullscreenEnabled) {
      setFullscreenError('El navegador no permite pantalla completa en este entorno.')
      return
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await pageRef.current?.requestFullscreen()
      setFullscreenError(null)
    } catch {
      setFullscreenError('No se pudo cambiar a pantalla completa.')
    }
  }

  useEffect(() => {
    function updateOnlineState() {
      setIsOnline(navigator.onLine)
    }

    function updateFullscreenState() {
      setIsFullscreen(document.fullscreenElement === pageRef.current)
    }

    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)
    document.addEventListener('fullscreenchange', updateFullscreenState)
    return () => {
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
      document.removeEventListener('fullscreenchange', updateFullscreenState)
    }
  }, [])

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'F2') {
        event.preventDefault()
        searchInputRef.current?.focus()
      } else if (event.key === 'F4') {
        event.preventDefault()
        customerSearchRef.current?.focus()
      } else if (event.key === 'F6') {
        event.preventDefault()
        paymentPanelRef.current?.querySelector<HTMLElement>('select, input, button')?.focus()
      } else if (event.key === 'F8') {
        event.preventDefault()
        handleConfirmSale()
      } else if (event.key === 'F9') {
        event.preventDefault()
        handleNewSale()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  })

  const pendingPaid = pendingSale?.payments.reduce((sum, payment) => sum + payment.amount, 0) ?? 0
  const pendingOutstanding = Math.max((pendingSale?.total ?? 0) - pendingPaid, 0)
  const pendingCustomerBalance = pendingSale?.customer?.creditSummary?.outstandingAmount

  if (!canAccessPos(user?.role)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--pos-porcelain)] p-6 text-[var(--pos-ink)]">
        <section className="max-w-xl rounded-2xl border border-[var(--pos-steel)] bg-white p-8 shadow-[0_20px_50px_rgba(23,33,30,0.10)]">
          <h1 className="font-[var(--pos-display)] text-3xl font-bold uppercase tracking-[-0.02em]">Acceso al POS denegado</h1>
          <p className="mt-3 text-[var(--pos-muted)]">Solo los roles ADMIN y SELLER pueden registrar ventas desde el POS.</p>
          <Link className="mt-6 inline-flex font-bold text-[var(--pos-red)]" to="/">Volver a operaciones</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100dvh-4.5rem)] bg-[var(--pos-porcelain)] font-[var(--pos-body)] text-[var(--pos-ink)] fullscreen:min-h-screen" ref={pageRef}>
      <section className="mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-[1680px] flex-col gap-3 p-3 xl:h-[calc(100dvh-4.5rem)] xl:max-h-[calc(100dvh-4.5rem)] xl:overflow-hidden fullscreen:min-h-screen fullscreen:h-screen fullscreen:max-h-screen">
        <header className="shrink-0 rounded-2xl border border-[var(--pos-steel)] bg-white px-4 py-3 shadow-[0_10px_28px_rgba(23,33,30,0.06)] sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--pos-red)]">Ventas POS / caja</p>
              <h1 className="mt-1 font-[var(--pos-display)] text-2xl font-bold uppercase tracking-[-0.02em] sm:text-3xl">Punto de venta empresarial</h1>
              <p className="mt-1 hidden max-w-2xl text-xs text-[var(--pos-muted)] sm:block">Registra la venta completa desde una sola superficie: producto, cantidad, documento y cobro.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="rounded-xl bg-[var(--pos-ink)] px-4 py-2 text-right text-white">
                <span className="block font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-amber)]">Total en vivo</span>
                <span className="block font-[var(--pos-display)] text-3xl font-bold leading-none tracking-[-0.02em]">{toMoney(total)}</span>
              </div>
              <button aria-keyshortcuts="F9" className="rounded-xl border border-[var(--pos-red)] px-3 py-2.5 text-sm font-black text-[var(--pos-red)] transition hover:bg-[rgba(182,42,34,0.08)]" onClick={handleNewSale} type="button">Nueva venta <span className="font-mono text-[0.65rem]">F9</span></button>
              <button aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Activar pantalla completa'} className="rounded-xl border border-[var(--pos-steel)] p-2.5 text-[var(--pos-muted)] transition hover:border-[var(--pos-green)] hover:text-[var(--pos-green)]" onClick={() => void toggleFullscreen()} type="button">{isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}</button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 border-t border-[var(--pos-steel)] pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4" aria-label="Estado operativo del POS">
            <div className="flex min-w-0 items-center gap-2"><MapPin className="h-4 w-4 shrink-0 text-[var(--pos-green)]" /><span className="truncate"><strong className="font-bold">Ubicación:</strong> {locationLabel(selectedLocation)}</span></div>
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 shrink-0 text-[var(--pos-green)]" /><span><strong className="font-bold">Caja:</strong> {user?.name ?? 'Operador'} · {isAdmin ? 'ADMIN' : 'SELLER'}</span></div>
            <div className={`flex items-center gap-2 font-bold ${isOnline ? 'text-[var(--pos-green)]' : 'text-[var(--pos-red)]'}`}>{isOnline ? <Wifi className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}<span>{isOnline ? 'Conectado' : 'Sin conexión'}</span></div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[0.65rem] text-[var(--pos-muted)]"><span className="inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" /> Impresora: no configurada</span><span className="inline-flex items-center gap-1"><Ruler className="h-3.5 w-3.5" /> Báscula: captura manual</span></div>
          </div>
          {fullscreenError && <p className="mt-2 text-xs font-bold text-[var(--pos-red)]" role="status">{fullscreenError}</p>}
        </header>

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(220px,0.8fr)_minmax(360px,1.2fr)] xl:grid-cols-[minmax(245px,0.76fr)_minmax(360px,1.2fr)_minmax(320px,0.84fr)] xl:overflow-hidden">
          <section className="min-h-[32rem] min-w-0 xl:min-h-0 xl:h-full">
            <ProductSearch error={products.error} frequentProducts={frequentProducts} isLoading={products.isLoading} locationDisabled={isSeller} locationWarning={isAdmin ? 'ADMIN puede cambiar la ubicación, pero el cambio modifica la fuente de inventario y vacía el carrito actual.' : undefined} locations={locationOptions} locationsError={locations.error} locationsLoading={locations.isLoading} locationId={locationId} onAdd={handleAddProduct} onLocationChange={handleLocationChange} onSearchChange={setProductSearch} onSearchSubmit={handleProductSearchSubmit} products={productOptions} searchInputRef={searchInputRef} search={productSearch} />
            {scanStatus && <p className="mt-2 rounded-xl border border-[var(--pos-steel)] bg-white px-3 py-2 text-xs font-bold text-[var(--pos-muted)]" role="status">{scanStatus}</p>}
          </section>

          <section className="flex min-h-[34rem] min-w-0 flex-col gap-3 xl:min-h-0" aria-label="Carrito y captura de cantidades">
            <Cart activeItemId={activeCartItemId} items={cart} onActivate={handleCartActivate} onQuantityChange={handleQuantityChange} onQuantityFocus={handleQuantityFocus} onRemove={(productId) => { setCart((items) => items.filter((item) => item.productId !== productId)); if (productId === activeCartItemId) { setActiveCartItemId(undefined); setKeypadValue('') } }} />
            <NumericPad allowDecimal={activeQuantityField === 'kg'} disabled={!activeCartItem} label={activeCartItem ? `${activeCartItem.name} · ${activeQuantityField === 'kg' ? 'kilos' : 'piezas'}` : 'Selecciona kilos o piezas'} onChange={handleKeypadInput} onClear={handleKeypadClear} onDelete={handleKeypadDelete} value={keypadValue} />
          </section>

          <aside className="min-h-[34rem] min-w-0 space-y-3 lg:col-span-2 xl:col-span-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1" aria-label="Cobro y confirmación de venta">
            <section className="rounded-2xl border border-[var(--pos-ink)] bg-[var(--pos-ink)] p-4 text-white shadow-[0_18px_36px_rgba(23,33,30,0.18)]">
              <div className="flex items-start justify-between gap-4"><div><span className="sr-only">Resumen sticky</span><p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[var(--pos-amber)]">Cobro actual</p><h2 className="mt-1 font-[var(--pos-display)] text-4xl font-bold leading-none tracking-[-0.02em]">{toMoney(total)}</h2><p className="mt-2 text-xs text-white/65">{cart.length} partidas · {paymentTypeLabel(paymentType)}</p></div><ReceiptText className="h-6 w-6 text-[var(--pos-amber)]" /></div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/15 pt-3 text-xs"><span className="text-white/65">{cart.length} en carrito</span><strong className="text-right font-mono">{formatQuantity(cart.reduce((sum, item) => sum + item.quantityKg, 0))} kg · {cart.reduce((sum, item) => sum + item.quantityPieces, 0)} pzas</strong></div>
            </section>
            <CustomerSelector customers={customerOptions} error={customers.error} isLoading={customers.isLoading} onSearchChange={setCustomerSearch} onSelect={handleCustomerSelect} search={customerSearch} searchInputRef={customerSearchRef} selectedCustomer={selectedCustomer} />
            <PaymentMethodSelector onPaymentTypeChange={(type) => { setPaymentType(type); resetOverride() }} onPaymentsChange={setPayments} panelRef={paymentPanelRef} paymentType={paymentType} payments={payments} total={total} />
            <section className="rounded-2xl border border-[var(--pos-steel)] bg-white p-4 shadow-[0_12px_30px_rgba(23,33,30,0.06)]">
              <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Control documental</p><h2 className="mt-1 font-[var(--pos-display)] text-xl font-bold uppercase tracking-[-0.02em]">Documento de venta</h2></div><span className="font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]">{documentTypeLabel(documentType)}</span></div>
              <p className="mt-2 text-xs text-[var(--pos-muted)]">Comprobante interno del MVP. No es factura fiscal.</p>
              <div className="mt-3 grid gap-2">
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">Canal de venta<select aria-label="Canal de venta" className="rounded-xl border border-[var(--pos-steel)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--pos-ink)] disabled:cursor-not-allowed disabled:bg-[var(--pos-porcelain)]" disabled={!selectedLocation || allowedSaleChannels.length <= 1} onChange={(event) => setSelectedSaleChannel(event.target.value as SaleChannel)} value={saleChannel}>{!selectedLocation && <option value="COUNTER">Selecciona una ubicación</option>}{allowedSaleChannels.map((channel) => <option key={channel} value={channel}>{saleChannelLabel(channel)}</option>)}</select></label>
                {selectedLocation && allowedSaleChannels.length === 1 && <p className="rounded-xl bg-[rgba(35,113,90,0.08)] p-2.5 text-xs font-bold text-[var(--pos-green)]">El canal se deriva automáticamente de la ubicación.</p>}
                {!selectedLocation && <p className="rounded-xl bg-[rgba(233,167,47,0.16)] p-2.5 text-xs font-bold text-[#7d5a12]">Selecciona una ubicación operativa para conocer los canales válidos.</p>}
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">Tipo de documento<select aria-label="Tipo de documento" className="rounded-xl border border-[var(--pos-steel)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--pos-ink)]" onChange={(event) => setDocumentType(event.target.value as SaleDocumentType)} value={documentType}><option value="SCALE_TICKET">Ticket de báscula</option><option value="SIMPLE_NOTE">Nota sencilla</option><option value="LARGE_NOTE">Nota grande</option><option value="INTERNAL_RECEIPT">Comprobante interno</option></select></label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">Folio físico<input className="rounded-xl border border-[var(--pos-steel)] bg-white px-3 py-2.5 text-sm font-semibold text-[var(--pos-ink)]" onChange={(event) => setPhysicalFolio(event.target.value)} placeholder="Cuando aplique" value={physicalFolio} /></label>
              </div>
            </section>
            <BillingRequestPanel hasCustomer={Boolean(selectedCustomer)} notes={billingRequestNotes} onNotesChange={setBillingRequestNotes} onReasonChange={setBillingRequestReason} onRequiresAdministrativeInvoiceChange={setRequiresAdministrativeInvoice} reason={billingRequestReason} requiresAdministrativeInvoice={requiresAdministrativeInvoice} />
            {canOverrideCredit && <section className="rounded-2xl border border-[rgba(233,167,47,0.55)] bg-[rgba(233,167,47,0.12)] p-4 text-[#5b4310] shadow-[0_10px_24px_rgba(23,33,30,0.05)]"><label className="flex items-start gap-3 text-sm font-black"><input checked={overrideEnabled} name="credit-override" onChange={(event) => { setOverrideEnabled(event.target.checked); if (!event.target.checked) setOverrideReason('') }} type="checkbox" /><span>Autorizar excepción de crédito<span className="mt-1 block text-xs font-semibold text-[#7d5a12]">Solo ADMIN puede continuar y el motivo quedará registrado.</span></span></label>{overrideEnabled && <label className="mt-3 grid gap-1.5 text-xs font-black">Motivo obligatorio<textarea className="min-h-20 rounded-xl border border-[rgba(233,167,47,0.55)] bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-[rgba(233,167,47,0.35)]" name="credit-override-reason" onChange={(event) => setOverrideReason(event.target.value)} placeholder="Describe quién autorizó y por qué" value={overrideReason} /></label>}</section>}
            <SaleSummary cart={cart} creditOptions={{ isAdmin, overrideEnabled, overrideReason }} customer={selectedCustomer} paymentType={paymentType} />
            {backendError && <p role="alert" className="rounded-xl border border-[rgba(182,42,34,0.22)] bg-[rgba(182,42,34,0.08)] p-3 text-xs font-bold text-[var(--pos-red)]">{backendError}</p>}
            <ConfirmSaleButton buttonRef={confirmButtonRef} disabledReason={submitBlocker} isSubmitting={createSale.isPending} onConfirm={handleConfirmSale} />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pb-2 font-mono text-[0.62rem] font-bold text-[var(--pos-muted)]"><span className="inline-flex items-center gap-1"><Keyboard className="h-3.5 w-3.5" /> F2 buscar · F4 cliente · F6 pago · F8 confirmar</span><span>{isOnline ? 'Listo para registrar' : 'Requiere conexión'}</span></div>
          </aside>
        </div>
      </section>
      {confirmedDocumentId && <TicketModal isLoading={ticket.isLoading} onClose={() => { setConfirmedSaleId(undefined); setConfirmedDocumentId(undefined) }} ticket={ticket.data} />}
      <ConfirmationDialog confirmLabel="Confirmar registro" description="Verifique la venta antes de descontar inventario y registrar el cobro." isLoading={createSale.isPending} onConfirm={confirmRegistration} onOpenChange={(open) => { if (!open) setPendingSale(null) }} open={Boolean(pendingSale)} title="Confirmar venta">
        {pendingSale && <div className="grid gap-4">
          <div className="grid gap-2 sm:grid-cols-2"><p><strong>Cliente:</strong> {pendingSale.customerName}</p><p><strong>Sucursal:</strong> {pendingSale.locationName}</p><p><strong>Documento:</strong> {documentTypeLabel(pendingSale.documentType)}</p><p><strong>Folio:</strong> {pendingSale.physicalFolio || 'Sin folio físico'}</p><p><strong>Canal:</strong> {saleChannelLabel(pendingSale.saleChannel)}</p><p><strong>Tipo:</strong> {paymentTypeLabel(pendingSale.paymentType)}</p></div>
          <div className="overflow-x-auto rounded-xl border border-[var(--pos-steel)] bg-white"><table className="w-full min-w-[500px] text-left text-xs"><thead className="border-b border-[var(--pos-steel)] bg-[var(--pos-porcelain)] font-mono uppercase tracking-[0.08em] text-[var(--pos-muted)]"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2">Kilos</th><th className="px-3 py-2">Piezas</th><th className="px-3 py-2 text-right">P. unitario</th><th className="px-3 py-2 text-right">Importe</th></tr></thead><tbody>{pendingSale.cart.map((item) => <tr className="border-b border-[var(--pos-steel)] last:border-0" key={item.productId}><td className="px-3 py-2 font-bold">{item.name}</td><td className="px-3 py-2 font-mono">{item.quantityKg ? formatQuantity(item.quantityKg) : '—'}</td><td className="px-3 py-2 font-mono">{item.quantityPieces ? formatQuantity(item.quantityPieces) : '—'}</td><td className="px-3 py-2 text-right font-mono">{toMoney(item.unitPrice)}</td><td className="px-3 py-2 text-right font-mono font-bold">{toMoney(calculateItemSubtotal(item))}</td></tr>)}</tbody></table></div>
          <dl className="grid gap-1 border-t border-[var(--pos-steel)] pt-3 text-sm"><div className="flex justify-between"><dt>Subtotal</dt><dd className="font-mono font-bold">{toMoney(pendingSale.total)}</dd></div><div className="flex justify-between"><dt>Descuento autorizado</dt><dd className="font-mono font-bold">No aplicado</dd></div><div className="flex justify-between"><dt>Pagado</dt><dd className="font-mono font-bold">{toMoney(pendingPaid)}</dd></div><div className="flex justify-between"><dt>Saldo pendiente de esta venta</dt><dd className="font-mono font-bold">{toMoney(pendingOutstanding)}</dd></div>{pendingCustomerBalance !== undefined && <div className="flex justify-between text-[var(--pos-muted)]"><dt>Saldo histórico del cliente</dt><dd className="font-mono font-bold">{toMoney(pendingCustomerBalance)}</dd></div>}<div className="flex justify-between text-base font-black"><dt>Total</dt><dd className="font-mono">{toMoney(pendingSale.total)}</dd></div></dl>
          <div className="grid gap-1 text-xs"><p><strong>Pagos:</strong> {pendingSale.payments.length ? pendingSale.payments.map((payment) => `${paymentMethodLabel(payment.paymentMethod)} ${toMoney(payment.amount)}`).join(' · ') : 'Sin pago inmediato'}</p><p><strong>Solicitud administrativa:</strong> {pendingSale.requiresAdministrativeInvoice ? `Se creará · ${pendingSale.billingRequestReason || 'Motivo pendiente'}` : 'No se creará'}</p>{pendingSale.payload.administrativeOverrideReason && <p className="rounded-xl bg-[rgba(233,167,47,0.16)] p-3 text-[#5b4310]"><strong>Autorización administrativa:</strong> {pendingSale.payload.administrativeOverrideReason}</p>}</div>
        </div>}
        {backendError && <p className="font-semibold text-[var(--pos-red)]" role="alert">{backendError}</p>}
      </ConfirmationDialog>
      <ConfirmationDialog confirmLabel="Iniciar nueva venta" description="La captura actual se eliminará y no podrá recuperarse." onConfirm={confirmNewSale} onOpenChange={setShowNewSaleDialog} open={showNewSaleDialog} title="¿Iniciar nueva venta?">
        <p>Se borrarán productos, cliente, pagos, folio y solicitud administrativa de esta captura.</p>
      </ConfirmationDialog>
    </main>
  )
}
