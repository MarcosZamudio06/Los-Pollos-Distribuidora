import type {
  BuildCreateSalePayloadInput,
  CartItem,
  CreateSalePayload,
  CustomerOption,
  PaymentMethod,
  PaymentType,
} from './types'

export function toMoney(value: number | string | null | undefined) {
  const numericValue = Number(value ?? 0)
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(
    Number.isFinite(numericValue) ? numericValue : 0,
  )
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function itemQuantity(item: CartItem) {
  if (item.unit === 'KG') return item.quantityKg
  if (item.unit === 'PIECE') return item.quantityPieces
  return Math.max(item.quantityKg, 0) + Math.max(item.quantityPieces, 0)
}

export function calculateItemSubtotal(item: CartItem) {
  return roundMoney(item.unitPrice * itemQuantity(item))
}

export function calculateCartTotal(cart: CartItem[]) {
  return roundMoney(cart.reduce((total, item) => total + calculateItemSubtotal(item), 0))
}

export function getQuantityValidationError(item: CartItem) {
  const locationName = item.locationName ?? item.locationId

  if (item.unit === 'KG') {
    if (item.quantityKg <= 0) return 'Ingresa una cantidad mayor que cero.'
    if (item.quantityKg > item.availableKg) {
      return `La cantidad no puede exceder ${item.availableKg} kg disponibles en ${locationName}.`
    }
    return null
  }

  if (item.unit === 'PIECE') {
    if (item.quantityPieces <= 0) return 'Ingresa una cantidad mayor que cero.'
    if (!Number.isInteger(item.quantityPieces)) return 'Las piezas deben ser un número entero.'
    if (item.quantityPieces > item.availablePieces) {
      return `La cantidad no puede exceder ${item.availablePieces} piezas disponibles en ${locationName}.`
    }
    return null
  }

  if (item.quantityKg <= 0 || item.quantityPieces <= 0) return 'Ingresa kilos y piezas mayores que cero.'
  if (!Number.isInteger(item.quantityPieces)) return 'Las piezas deben ser un número entero.'
  if (item.quantityKg > item.availableKg) {
    return `La cantidad no puede exceder ${item.availableKg} kg disponibles en ${locationName}.`
  }
  if (item.quantityPieces > item.availablePieces) {
    return `La cantidad no puede exceder ${item.availablePieces} piezas disponibles en ${locationName}.`
  }
  return null
}

function numberFrom(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0)
  return Number.isFinite(numericValue) ? numericValue : 0
}

export function getCreditRestriction(paymentType: PaymentType, customer: CustomerOption | null, total: number) {
  if (paymentType !== 'CREDIT_SALE') return null
  if (!customer || customer.isActive === false || customer.active === false) {
    return 'Selecciona un cliente activo para una venta a crédito.'
  }

  const summary = customer.creditSummary
  const isBlocked = customer.isBlockedForCredit || summary?.isBlocked || summary?.isBlockedForCredit
  if (isBlocked || customer.creditStatus === 'BLOCKED' || summary?.creditStatus === 'BLOCKED') {
    return summary?.blockingReason ?? summary?.blockReason ?? 'El crédito del cliente está bloqueado.'
  }

  const availableCredit = numberFrom(summary?.availableCredit ?? customer.creditLimit)
  if (availableCredit >= 0 && total > availableCredit) {
    return `La venta excede el crédito disponible de ${toMoney(availableCredit)}.`
  }

  return null
}



export function getLocationValidationError(cart: CartItem[], locationId: string) {
  if (cart.some((item) => item.locationId !== locationId)) {
    return 'El carrito contiene stock de otra ubicación operativa. Actualiza el carrito para esta ubicación.'
  }
  return null
}

export function getSaleRestriction(
  paymentType: PaymentType,
  customer: CustomerOption | null,
  total: number,
  paymentMethod: PaymentMethod,
) {
  if (paymentType === 'CASH_SALE' && !paymentMethod && (!customer || customer.isActive === false || customer.active === false)) {
    return 'Selecciona un cliente activo cuando no se capture pago inicial.'
  }

  return getCreditRestriction(paymentType, customer, total)
}

export function buildCreateSalePayload(input: BuildCreateSalePayloadInput): CreateSalePayload {
  const physicalFolio = input.physicalFolio.trim()
  const billingRequestId = input.billingRequestId?.trim()
  const initialPaymentAmount = input.initialPaymentAmount ?? (input.paymentType === 'CASH_SALE' ? input.total : 0)
  const initialPayment =
    input.paymentMethod && initialPaymentAmount > 0
      ? {
          amount: roundMoney(initialPaymentAmount),
          paidAt: new Date().toISOString(),
          paymentMethod: input.paymentMethod,
        }
      : undefined

  return {
    customerId: input.customer?.id,
    locationId: input.locationId,
    saleChannel: input.saleChannel,
    documentType: input.documentType,
    physicalFolio: physicalFolio || undefined,
    requiresAdministrativeInvoice: input.requiresAdministrativeInvoice,
    paymentType: input.paymentType,
    initialPayment,
    discount: 0,
    commercialPolicyId: input.customer?.commercialPolicyId ?? input.customer?.creditSummary?.commercialPolicyId ?? undefined,
    billingRequestId: billingRequestId || undefined,
    items: input.cart.map((item) => ({
      productId: item.productId,
      presentationType: item.presentationType,
      unit: item.unit,
      quantityKg: item.quantityKg,
      quantityPieces: item.quantityPieces,
      unitEquivalentId: item.unitEquivalentId ?? undefined,
    })),
  }
}

export function canConfirmSale({
  cart,
  creditRestriction,
  isSubmitting,
  locationId,
}: {
  cart: CartItem[]
  creditRestriction: string | null
  isSubmitting: boolean
  locationId: string
}) {
  return Boolean(locationId) && cart.length > 0 && !isSubmitting && !creditRestriction && !getLocationValidationError(cart, locationId) && cart.every((item) => !getQuantityValidationError(item))
}
