import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MapPin, Maximize2, Minimize2, ShieldCheck, Wifi, WifiOff } from 'lucide-react'
import { useAuth } from '../auth'
import { useOpenCashSession } from '../cierre-diario/hooks'
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
  PaymentEntryControl,
  PaymentTypeControl,
  ProductSearch,
  ScanCommandBar,
  SaleRegisteredScreen,
  SaleSummary,
  TicketModal,
} from './components'
import { useCreateSale, useSaleTicket } from './hooks'
import { buildCreateSalePayload, calculateCartTotal, calculateItemSubtotal, calculatePaymentsTotal, canConfirmSale, getLocationValidationError, getPaymentsValidationError, getPosLocationOptions, getQuantityValidationError, getSaleChannelsForLocation, getSaleErrorMessage, getSaleRestriction, toMoney } from './posLogic'
import type { CartItem, CreateSaleResponse, CustomerOption, PaymentType, ProductOption, SaleChannel, SaleDocumentType, SalePaymentInput, TicketData } from './types'
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

function findProductByLookup(products: ProductOption[], value: string) {
  const normalizedValue = value.trim().toLowerCase()
  if (!normalizedValue) return undefined

  return products.find((product) => product.barcode?.trim().toLowerCase() === normalizedValue)
    ?? products.find((product) => product.sku?.trim().toLowerCase() === normalizedValue)
    ?? products.find((product) => product.name.trim().toLowerCase() === normalizedValue)
}

function productToOption(product: Product, locationId: string): ProductOption {
  const balance = product.inventoryBalance ?? product.locationBalance ?? product.balances?.[0]
  const equivalent = product.activeEquivalences?.[0]
  return {
    id: product.id,
    name: product.name,
    categoryName: typeof product.category === 'object' && product.category ? product.category.name : typeof product.category === 'string' ? product.category : null,
    sku: product.sku,
    barcode: product.barcode,
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

type ConfirmedSale = {
  documentId?: string
  fallbackTicket: TicketData
  saleId: string
  saleNumber: string
  customerName: string
  total: number
}

type ScanFeedbackTone = 'success' | 'attention' | 'warning'

const OFFLINE_SALE_BLOCKER = 'Sin conexión. La venta no se registrará sin conexión.'

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
  cashSessionId,
  isOnline,
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
  cashSessionId?: string | null
  isOnline: boolean
}) {
  if (!locationId) return 'Selecciona una ubicación operativa.'
  if (!allowedSaleChannels.includes(saleChannel)) return 'Selecciona un canal válido para la ubicación operativa.'
  if (!isOnline) return OFFLINE_SALE_BLOCKER
  if ((paymentType === 'CASH_SALE' || payments.some((payment) => payment.paymentMethod === 'CASH')) && !cashSessionId) return 'Abre una sesión de caja antes de registrar ventas de contado o pagos en efectivo.'
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
  const saleRestriction = getSaleRestriction(paymentType, customer, total, calculatePaymentsTotal(payments), { isAdmin, overrideEnabled, overrideReason })
  return canConfirmSale({
    cart,
    creditRestriction: saleRestriction,
    isSubmitting: submitting,
    locationId,
  })
    ? null
    : saleRestriction ?? 'La venta todavía no puede confirmarse.'
}

function buildProvisionalTicket(response: CreateSaleResponse, pendingSale: PendingSale, sellerName?: string | null): TicketData {
  const sale = response.sale
  const saleItems = sale?.items ?? []
  const items = saleItems.length > 0
    ? saleItems.map((item, index) => ({
      productName: item.productName ?? item.productNameSnapshot ?? pendingSale.cart[index]?.name,
      sku: item.sku ?? pendingSale.cart[index]?.sku,
      unit: item.unit ?? pendingSale.cart[index]?.unit,
      quantityKg: item.quantityKg ?? pendingSale.cart[index]?.quantityKg,
      quantityPieces: item.quantityPieces ?? pendingSale.cart[index]?.quantityPieces,
      unitPrice: item.unitPrice ?? pendingSale.cart[index]?.unitPrice,
      subtotal: item.subtotal ?? (pendingSale.cart[index] ? calculateItemSubtotal(pendingSale.cart[index]) : undefined),
    }))
    : pendingSale.cart.map((item) => ({
      productName: item.name,
      sku: item.sku,
      unit: item.unit,
      quantityKg: item.quantityKg,
      quantityPieces: item.quantityPieces,
      unitPrice: item.unitPrice,
      subtotal: calculateItemSubtotal(item),
    }))
  const payments = response.payments ?? (response.payment ? [response.payment] : [])
  const paid = payments.reduce((sum, payment) => sum + asNumber(payment.amount), 0)
  const total = asNumber(sale?.total ?? pendingSale.total)

  return {
    ticketId: response.ticketId ?? undefined,
    ticketNumber: pendingSale.physicalFolio || sale?.saleNumber || response.ticketId || undefined,
    saleNumber: sale?.saleNumber,
    createdAt: sale?.createdAt,
    documentType: sale?.documentType ?? pendingSale.documentType,
    physicalFolio: pendingSale.physicalFolio || null,
    requiresAdministrativeInvoice: pendingSale.requiresAdministrativeInvoice,
    sellerName: sellerName ?? undefined,
    customerName: sale?.customerName ?? pendingSale.customerName,
    locationId: sale?.locationId ?? pendingSale.locationId,
    locationName: pendingSale.locationName,
    items,
    subtotal: sale?.subtotal ?? total,
    discount: sale?.discount ?? 0,
    tax: sale?.tax ?? 0,
    total,
    paid,
    outstanding: response.accountReceivable?.balance ?? response.accountReceivable?.outstandingAmount ?? Math.max(total - paid, 0),
    dueDate: response.accountReceivable?.dueDate ?? null,
    paymentType: sale?.paymentType ?? pendingSale.paymentType,
    collectionStatus: sale?.collectionStatus,
    status: sale?.status,
    payments: payments.map((payment) => ({
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      cashTendered: payment.cashTendered,
      changeGiven: payment.changeGiven,
      paidAt: payment.paidAt ?? undefined,
    })),
  }
}

export function SalesPosPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
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
  const [showAdvancedSaleFields, setShowAdvancedSaleFields] = useState(false)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [overrideEnabled, setOverrideEnabled] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [recentProducts, setRecentProducts] = useState<ProductOption[]>([])
  const [activeCartItemId, setActiveCartItemId] = useState<string>()
  const [activeQuantityField, setActiveQuantityField] = useState<'kg' | 'pieces'>('kg')
  const [keypadValue, setKeypadValue] = useState('')
  const [scanStatus, setScanStatus] = useState<string | null>(null)
  const [scanFeedbackTone, setScanFeedbackTone] = useState<ScanFeedbackTone>('success')
  const [showNewSaleDialog, setShowNewSaleDialog] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [confirmedSale, setConfirmedSale] = useState<ConfirmedSale | null>(null)
  const [showTicket, setShowTicket] = useState(false)
  const [pendingSale, setPendingSale] = useState<PendingSale | null>(null)
  const pageRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const customerSearchRef = useRef<HTMLInputElement>(null)
  const paymentPanelRef = useRef<HTMLElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const pendingScanRef = useRef<string | null>(null)
  const cartRef = useRef<CartItem[]>([])
  const scanAudioContextRef = useRef<AudioContext | null>(null)

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
  const ticket = useSaleTicket(confirmedSale?.saleId, confirmedSale?.documentId)
  const openCashSession = useOpenCashSession(locationId)
  const requiresCashSession = paymentType === 'CASH_SALE' || payments.some((payment) => payment.paymentMethod === 'CASH')
  const cashSessionId = requiresCashSession ? openCashSession.data?.id : undefined

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
  const submitBlocker = getSubmitBlocker({ cart, customer: selectedCustomer, locationId, payments, paymentType, submitting: createSale.isPending, requiresAdministrativeInvoice, billingRequestReason, isAdmin, overrideEnabled, overrideReason, saleChannel, allowedSaleChannels, cashSessionId, isOnline })

  useEffect(() => {
    cartRef.current = cart
  }, [cart])

  useEffect(() => () => {
    void scanAudioContextRef.current?.close()
  }, [])

  function playScanSound(tone: ScanFeedbackTone) {
    if (typeof window === 'undefined') return
    const audioWindow = window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }
    const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext ?? globalThis.AudioContext
    if (!AudioContextConstructor) return

    try {
      const context = scanAudioContextRef.current ?? new AudioContextConstructor()
      scanAudioContextRef.current = context
      if (context.state === 'suspended') void context.resume().catch(() => undefined)
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const now = context.currentTime
      const frequency = tone === 'success' ? 880 : tone === 'attention' ? 520 : 220
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(now)
      oscillator.stop(now + 0.1)
    } catch {
      // Audio feedback is progressive enhancement; scanning must still work silently.
    }
  }

  function showScanFeedback(message: string, tone: ScanFeedbackTone) {
    setScanStatus(message)
    setScanFeedbackTone(tone)
    playScanSound(tone)
  }

  useEffect(() => {
    const pendingScan = pendingScanRef.current
    if (!pendingScan) return
    const match = findProductByLookup(productOptions, pendingScan)
    if (!match) return
    pendingScanRef.current = null
    handleAddProduct(match)
    setProductSearch('')
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
    cartRef.current = []
    setCart([])
    setActiveCartItemId(undefined)
    setProductSearch('')
    setScanStatus(null)
    setBackendError(null)
    resetOverride()
  }

  function handleAddProduct(product: ProductOption) {
    const hasNoStock = product.availableKg <= 0 && product.availablePieces <= 0
    if (hasNoStock) {
      showScanFeedback(`Producto sin existencia en ${product.locationName ?? product.locationId}.`, 'warning')
      return
    }

    setBackendError(null)
    const existing = cartRef.current.find((item) => item.productId === product.id)
    const isActiveMixedLine = existing?.unit === 'KG_AND_PIECE' && activeCartItemId === product.id
    const scanField = product.unit === 'PIECE' ? 'pieces' : product.unit === 'KG' ? 'kg' : isActiveMixedLine ? activeQuantityField : 'kg'
    setActiveCartItemId(product.id)
    setActiveQuantityField(scanField)
    setRecentProducts((current) => [product, ...current.filter((item) => item.id !== product.id)].slice(0, 6))

    if (!existing) {
      const nextItem: CartItem = {
        ...product,
        productId: product.id,
        quantityKg: product.unit === 'KG' || product.unit === 'KG_AND_PIECE' ? Math.min(1, product.availableKg) : 0,
        quantityPieces: product.unit === 'PIECE' ? Math.min(1, product.availablePieces) : 0,
      }
      const nextCart = [...cartRef.current, nextItem]
      cartRef.current = nextCart
      setCart(nextCart)
      setKeypadValue(String(scanField === 'pieces' ? nextItem.quantityPieces : nextItem.quantityKg))
      showScanFeedback(`Agregado: ${product.name}`, 'success')
      return
    }

    if (scanField === 'pieces') {
      const availablePieces = Math.max(0, Math.trunc(existing.availablePieces))
      if (existing.quantityPieces >= availablePieces) {
        setKeypadValue(String(existing.quantityPieces || ''))
        showScanFeedback(`Stock máximo: ${product.name} (${formatQuantity(existing.quantityPieces)} piezas)`, 'warning')
        return
      }
      const nextPieces = existing.quantityPieces + 1
      const nextCart = cartRef.current.map((item) => item.productId === product.id ? { ...item, quantityPieces: nextPieces } : item)
      cartRef.current = nextCart
      setCart(nextCart)
      setKeypadValue(String(nextPieces))
      showScanFeedback(`Incrementado: ${product.name} (${formatQuantity(nextPieces)} ${nextPieces === 1 ? 'pieza' : 'piezas'})`, 'success')
      return
    }

    setKeypadValue('')
    showScanFeedback(`Captura el peso de ${product.name}`, 'attention')
  }

  function handleQuantityChange(productId: string, quantityKg: number, quantityPieces: number) {
    const nextCart = cartRef.current.map((item) => (item.productId === productId ? { ...item, quantityKg, quantityPieces } : item))
    cartRef.current = nextCart
    setCart(nextCart)
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
    const match = findProductByLookup(productOptions, normalizedValue)
    if (!match) {
      pendingScanRef.current = normalizedValue
      showScanFeedback(`Buscando el código ${value.trim()}...`, 'warning')
      return
    }
    pendingScanRef.current = null
    handleAddProduct(match)
    setProductSearch('')
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  function clearSaleDraft() {
    pendingScanRef.current = null
    cartRef.current = []
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
    setShowAdvancedSaleFields(false)
    setBackendError(null)
    setScanStatus(null)
    setScanFeedbackTone('success')
    resetOverride()
  }

  function clearConfirmedSale() {
    setShowTicket(false)
    setConfirmedSale(null)
  }

  function handleRemoveProduct(productId: string) {
    const nextCart = cartRef.current.filter((item) => item.productId !== productId)
    cartRef.current = nextCart
    setCart(nextCart)
    if (productId === activeCartItemId) {
      setActiveCartItemId(undefined)
      setKeypadValue('')
    }
  }

  function hasDraftChanges() {
    return Boolean(cart.length || selectedCustomer || productSearch || customerSearch || payments.length || physicalFolio || requiresAdministrativeInvoice || billingRequestReason || billingRequestNotes || overrideEnabled || overrideReason)
  }

  function handleNewSale() {
    if (pendingSale) return
    if (confirmedSale) {
      clearConfirmedSale()
      clearSaleDraft()
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
      return
    }
    if (hasDraftChanges()) {
      setShowNewSaleDialog(true)
      return
    }
    clearSaleDraft()
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  function confirmNewSale() {
    clearSaleDraft()
    clearConfirmedSale()
    setShowNewSaleDialog(false)
    window.setTimeout(() => searchInputRef.current?.focus(), 0)
  }

  function handleConfirmSale() {
    if (pendingSale || createSale.isPending) return
    const blocker = getSubmitBlocker({ cart, customer: selectedCustomer, locationId, payments, paymentType, submitting: createSale.isPending, requiresAdministrativeInvoice, billingRequestReason, isAdmin, overrideEnabled, overrideReason, saleChannel, allowedSaleChannels, cashSessionId, isOnline })
    if (blocker) return
    setBackendError(null)
    setPendingSale({
      idempotencyKey: crypto.randomUUID(),
      payload: buildCreateSalePayload({
        administrativeOverrideReason: overrideEnabled ? overrideReason : undefined,
        billingRequestReason, billingRequestNotes, cart, customer: selectedCustomer, documentType,
        locationId, payments, paymentType, physicalFolio, pointOfSaleDailyCloseId: cashSessionId,
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
    if (!isOnline) {
      setBackendError(OFFLINE_SALE_BLOCKER)
      return
    }
    try {
      const response = await createSale.mutateAsync({ payload: pendingSale.payload, idempotencyKey: pendingSale.idempotencyKey })
      const sale = response.sale
      const saleId = sale?.id
      if (!saleId) {
        setBackendError('La venta fue procesada, pero la respuesta no incluyó su identificador. Revisa el historial antes de reintentar.')
        return
      }
      const documentId = response.documents?.find((document) => document.documentType === pendingSale.documentType)?.id ?? response.ticketId ?? undefined
      const fallbackTicket = buildProvisionalTicket(response, pendingSale, user?.name)
      setConfirmedSale({
        documentId,
        fallbackTicket,
        saleId,
        saleNumber: sale?.saleNumber ?? saleId,
        customerName: sale?.customerName ?? pendingSale.customerName,
        total: asNumber(sale?.total ?? pendingSale.total),
      })
      setShowTicket(false)
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

  function handleRetryPrint() {
    setShowTicket(true)
    if (confirmedSale?.documentId) void ticket.refetch()
  }

  function handleOpenHistory() {
    clearConfirmedSale()
    navigate('/sales/history')
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
  const ticketLoading = Boolean(ticket.isLoading || ticket.isFetching)
  const printStatus = confirmedSale
    ? ticketLoading
      ? 'loading'
      : ticket.data
        ? 'ready'
        : ticket.error
          ? 'error'
          : confirmedSale.documentId
            ? 'loading'
            : 'unavailable'
    : undefined

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
    <main className="relative min-h-[calc(100dvh-4.5rem)] bg-[var(--pos-porcelain)] font-[var(--pos-body)] text-[var(--pos-ink)] fullscreen:min-h-screen" ref={pageRef}>
      <section className="mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-[1680px] flex-col border-x border-[var(--pos-steel)] bg-white fullscreen:min-h-screen">
        <header className="flex h-[52px] shrink-0 items-center border-b border-[var(--pos-steel)] px-3 text-xs" aria-label="Estado operativo del POS">
          <label className="flex min-w-0 items-center gap-2 border-r border-[var(--pos-steel)] pr-3"><MapPin className="h-4 w-4 shrink-0 text-[var(--pos-green)]" /><span className="sr-only">Ubicación operativa</span><select className="min-w-0 max-w-48 truncate bg-transparent font-bold outline-none" disabled={isSeller} onChange={(event) => handleLocationChange(event.target.value)} value={locationId}><option value="">Selecciona ubicación</option>{locationOptions.map((location) => <option key={location.id} value={location.id}>{location.name}{location.code ? ` · ${location.code}` : ''}</option>)}</select></label>
          <div className={`ml-3 flex min-w-0 items-center gap-1.5 font-bold ${openCashSession.data ? 'text-[var(--pos-ink)]' : 'text-[var(--pos-red)]'}`}><ShieldCheck className="h-4 w-4 shrink-0" /><span className="truncate">{openCashSession.isLoading ? 'Consultando caja' : openCashSession.data?.terminalIdentifier ?? 'Caja sin abrir'}</span>{!openCashSession.data && <Link className="ml-1 shrink-0 underline underline-offset-2" to="/daily-close">Abrir caja</Link>}</div>
          <span className="mx-3 hidden h-4 border-l border-[var(--pos-steel)] lg:block" /><span className="hidden truncate font-medium lg:block">{openCashSession.data?.openedBy?.name ?? user?.name ?? 'Sin cajero'}</span>
          <span className="ml-auto hidden font-[var(--pos-mono)] text-[0.68rem] text-[var(--pos-muted)] xl:inline">{new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
          <span className={`ml-3 inline-flex items-center gap-1.5 font-bold ${isOnline ? 'text-[var(--pos-green)]' : 'text-[var(--pos-red)]'}`}>{isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}<span className="hidden sm:inline">{isOnline ? 'En línea' : 'Sin conexión'}</span></span>
          <button aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Activar pantalla completa'} className="ml-3 p-2 text-[var(--pos-muted)] transition hover:text-[var(--pos-ink)]" onClick={() => void toggleFullscreen()} type="button">{isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
          <button aria-keyshortcuts="F9" className="ml-1 h-9 border-l border-[var(--pos-steel)] pl-3 text-xs font-bold text-[#1D5FD1] transition hover:text-[var(--pos-ink)]" onClick={handleNewSale} type="button">Nueva venta <span className="font-[var(--pos-mono)]">F9</span></button>
          {fullscreenError && <p className="sr-only" role="status">{fullscreenError}</p>}
          <p className="sr-only">Impresora: no configurada. Báscula: captura manual.</p>
        </header>

        <ScanCommandBar onSearchChange={setProductSearch} onSearchSubmit={handleProductSearchSubmit} search={productSearch} searchInputRef={searchInputRef} />
        {scanStatus && <p className={`shrink-0 border-b px-4 py-1.5 text-xs font-bold ${scanFeedbackTone === 'success' ? 'border-[rgba(35,113,90,0.25)] bg-[rgba(35,113,90,0.08)] text-[var(--pos-green)]' : scanFeedbackTone === 'attention' ? 'border-[rgba(233,167,47,0.35)] bg-[rgba(233,167,47,0.14)] text-[#7d5a12]' : 'border-[rgba(182,42,34,0.25)] bg-[rgba(182,42,34,0.08)] text-[var(--pos-red)]'}`} role="status" aria-live="polite">{scanStatus}</p>}

        <div className="grid min-h-0 flex-1 grid-cols-[38fr_62fr] overflow-hidden">
          <section className="min-w-0 border-r border-[var(--pos-steel)]" aria-label="Resultados de productos"><ProductSearch error={products.error} frequentProducts={frequentProducts} isLoading={products.isLoading} locationDisabled={isSeller} locations={locationOptions} locationsError={locations.error} locationsLoading={locations.isLoading} locationId={locationId} onAdd={handleAddProduct} onLocationChange={handleLocationChange} products={productOptions} search={productSearch} showLocationSelector={false} /></section>
          <section className="relative flex min-w-0 flex-col" aria-label="Carrito y captura de cantidades"><Cart activeItemId={activeCartItemId} items={cart} onActivate={handleCartActivate} onQuantityChange={handleQuantityChange} onQuantityFocus={handleQuantityFocus} onRemove={handleRemoveProduct} />{activeCartItem && <div className="absolute bottom-3 right-3 z-10 w-52 shadow-[0_18px_36px_rgba(23,33,30,0.18)]"><NumericPad allowDecimal={activeQuantityField === 'kg'} disabled={!activeCartItem} label={`${activeCartItem.name} · ${activeQuantityField === 'kg' ? 'kilos' : 'piezas'}`} onChange={handleKeypadInput} onClear={handleKeypadClear} onDelete={handleKeypadDelete} value={keypadValue} /></div>}</section>
        </div>

        <details className="absolute right-3 top-[60px] z-40" onToggle={(event) => setShowAdvancedSaleFields(event.currentTarget.open)} open={showAdvancedSaleFields || Boolean(canOverrideCredit || requiresAdministrativeInvoice)}>
          <summary className="h-11 cursor-pointer list-none border border-[var(--pos-steel)] bg-white px-3 leading-[2.75rem] text-xs font-bold text-[var(--pos-muted)] shadow-[0_8px_18px_rgba(23,33,30,0.10)]">Opciones de venta</summary>
          <div className="absolute right-0 top-full mt-2 grid w-[min(96vw,58rem)] gap-3 border border-[var(--pos-steel)] bg-white p-3 shadow-[0_18px_40px_rgba(23,33,30,0.16)] lg:grid-cols-3">
            <section className="rounded-xl border border-[var(--pos-steel)] bg-[var(--pos-porcelain)] p-3">
              <div className="flex items-center justify-between gap-3"><div><p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.16em] text-[var(--pos-muted)]">Control documental</p><h2 className="mt-1 font-[var(--pos-display)] text-lg font-bold uppercase tracking-[-0.02em]">Documento de venta</h2></div></div>
              <p className="mt-2 text-xs text-[var(--pos-muted)]">Comprobante interno del MVP. No es factura fiscal.</p>
              <div className="mt-3 grid gap-2">
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">Canal de venta<select aria-label="Canal de venta" className="rounded-lg border border-[var(--pos-steel)] bg-white px-3 py-2 text-sm font-semibold text-[var(--pos-ink)] disabled:cursor-not-allowed disabled:bg-[var(--pos-porcelain)]" disabled={!selectedLocation || allowedSaleChannels.length <= 1} onChange={(event) => setSelectedSaleChannel(event.target.value as SaleChannel)} value={saleChannel}>{!selectedLocation && <option value="COUNTER">Selecciona una ubicación</option>}{allowedSaleChannels.map((channel) => <option key={channel} value={channel}>{saleChannelLabel(channel)}</option>)}</select></label>
                {selectedLocation && allowedSaleChannels.length === 1 && <p className="rounded-lg bg-[rgba(35,113,90,0.08)] p-2 text-xs font-bold text-[var(--pos-green)]">El canal se deriva automáticamente de la ubicación.</p>}
                {!selectedLocation && <p className="rounded-lg bg-[rgba(233,167,47,0.16)] p-2 text-xs font-bold text-[#7d5a12]">Selecciona una ubicación operativa para conocer los canales válidos.</p>}
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">Tipo de documento<select aria-label="Tipo de documento" className="rounded-lg border border-[var(--pos-steel)] bg-white px-3 py-2 text-sm font-semibold text-[var(--pos-ink)]" onChange={(event) => setDocumentType(event.target.value as SaleDocumentType)} value={documentType}><option value="SCALE_TICKET">Ticket de báscula</option><option value="SIMPLE_NOTE">Nota sencilla</option><option value="LARGE_NOTE">Nota grande</option><option value="INTERNAL_RECEIPT">Comprobante interno</option></select></label>
                <label className="grid gap-1.5 text-xs font-bold text-[var(--pos-muted)]">Folio físico<input className="rounded-lg border border-[var(--pos-steel)] bg-white px-3 py-2 text-sm font-semibold text-[var(--pos-ink)]" onChange={(event) => setPhysicalFolio(event.target.value)} placeholder="Cuando aplique" value={physicalFolio} /></label>
              </div>
            </section>
            <BillingRequestPanel hasCustomer={Boolean(selectedCustomer)} notes={billingRequestNotes} onNotesChange={setBillingRequestNotes} onReasonChange={setBillingRequestReason} onRequiresAdministrativeInvoiceChange={setRequiresAdministrativeInvoice} reason={billingRequestReason} requiresAdministrativeInvoice={requiresAdministrativeInvoice} />
            {canOverrideCredit && <section className="rounded-xl border border-[rgba(233,167,47,0.55)] bg-[rgba(233,167,47,0.12)] p-3 text-[#5b4310] shadow-[0_10px_24px_rgba(23,33,30,0.05)]"><label className="flex items-start gap-3 text-sm font-black"><input checked={overrideEnabled} name="credit-override" onChange={(event) => { setOverrideEnabled(event.target.checked); if (!event.target.checked) setOverrideReason('') }} type="checkbox" /><span>Autorizar excepción de crédito<span className="mt-1 block text-xs font-semibold text-[#7d5a12]">Solo ADMIN puede continuar y el motivo quedará registrado.</span></span></label>{overrideEnabled && <label className="mt-3 grid gap-1.5 text-xs font-black">Motivo obligatorio<textarea className="min-h-20 rounded-lg border border-[rgba(233,167,47,0.55)] bg-white px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-[rgba(233,167,47,0.35)]" name="credit-override-reason" onChange={(event) => setOverrideReason(event.target.value)} placeholder="Describe quién autorizó y por qué" value={overrideReason} /></label>}</section>}
          </div>
        </details>

        <footer className="z-20 h-36 shrink-0 overflow-hidden border-t-2 border-[var(--pos-ink)] bg-white" aria-label="Confirmación de venta">
          <div className="grid h-full grid-cols-2 grid-rows-2 divide-x divide-y divide-[var(--pos-steel)] xl:grid-cols-[27fr_23fr_20fr_30fr] xl:grid-rows-1 xl:divide-y-0">
            <CustomerSelector compact customers={customerOptions} error={customers.error} isLoading={customers.isLoading} onSearchChange={setCustomerSearch} onSelect={handleCustomerSelect} search={customerSearch} searchInputRef={customerSearchRef} selectedCustomer={selectedCustomer} />
            <PaymentTypeControl compact onPaymentTypeChange={(type) => { setPaymentType(type); resetOverride() }} paymentType={paymentType} />
            <PaymentEntryControl compact onPaymentsChange={setPayments} panelRef={paymentPanelRef} payments={payments} total={total} />
            <div className="grid min-w-0 grid-cols-[1fr_1.1fr] gap-3 p-3"><SaleSummary compact cart={cart} creditOptions={{ isAdmin, overrideEnabled, overrideReason }} customer={selectedCustomer} paymentType={paymentType} /><ConfirmSaleButton buttonRef={confirmButtonRef} compact disabledReason={submitBlocker} isSubmitting={createSale.isPending} onConfirm={handleConfirmSale} total={total} /></div>
          </div>
          {backendError && <p role="alert" className="absolute bottom-36 left-0 right-0 border-t border-[rgba(182,42,34,0.22)] bg-[rgba(182,42,34,0.08)] px-3 py-2 text-xs font-bold text-[var(--pos-red)]">{backendError}</p>}
        </footer>
      </section>
      {confirmedSale && <SaleRegisteredScreen customerName={confirmedSale.customerName} onNewSale={handleNewSale} onOpenHistory={handleOpenHistory} onRetryPrint={handleRetryPrint} printStatus={printStatus} saleNumber={confirmedSale.saleNumber} total={confirmedSale.total} />}
      {confirmedSale && showTicket && <TicketModal fallback={ticketLoading ? undefined : confirmedSale.fallbackTicket} isLoading={ticketLoading} isProvisional={!ticketLoading && !ticket.data} onClose={() => setShowTicket(false)} ticket={ticket.data} />}
      <ConfirmationDialog confirmDisabled={!isOnline} confirmLabel="Confirmar registro" description={isOnline ? 'Verifique la venta antes de descontar inventario y registrar el cobro.' : OFFLINE_SALE_BLOCKER} isLoading={createSale.isPending} onConfirm={confirmRegistration} onOpenChange={(open) => { if (!open) setPendingSale(null) }} open={Boolean(pendingSale)} title="Confirmar venta">
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
