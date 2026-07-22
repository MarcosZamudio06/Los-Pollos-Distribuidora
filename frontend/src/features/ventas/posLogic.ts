import type {
  BuildCreateSalePayloadInput,
  CartItem,
  CreateSalePayload,
  CustomerOption,
  PaymentMethod,
  PaymentType,
} from './types'
import { formatMoney } from '../../lib/money'

export { formatMoney as toMoney } from '../../lib/money'

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function itemQuantity(item: CartItem) {
  if (item.unit === 'KG') return item.quantityKg
  if (item.unit === 'PIECE') return item.quantityPieces
  const factor = item.equivalentFactor ?? 0
  const piecesInKg = item.equivalentUnitFrom === 'PIECE' && item.equivalentUnitTo === 'KG'
    ? item.quantityPieces * factor
    : item.equivalentUnitFrom === 'KG' && item.equivalentUnitTo === 'PIECE' && factor > 0
      ? item.quantityPieces / factor
      : 0
  return Math.max(item.quantityKg, 0) + Math.max(piecesInKg, 0)
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
  if (!item.unitEquivalentId || !item.equivalentFactor || !item.equivalentUnitFrom || !item.equivalentUnitTo) {
    return 'El producto requiere una equivalencia activa entre kilos y piezas.'
  }
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

export type CreditRestrictionOptions = {
  isAdmin?: boolean
  overrideEnabled?: boolean
  overrideReason?: string
}

export function getCreditRestriction(paymentType: PaymentType, customer: CustomerOption | null, total: number, options: CreditRestrictionOptions = {}) {
  if (paymentType !== 'CREDIT_SALE') return null
  if (!customer || customer.isActive === false || customer.active === false) {
    return 'Selecciona un cliente activo para una venta a crédito.'
  }

  const summary = customer.creditSummary
  const isBlocked = summary?.effectiveCreditStatus === 'BLOCKED' || customer.effectiveCreditStatus === 'BLOCKED' || customer.isBlockedForCredit || summary?.isBlocked || summary?.isBlockedForCredit
  if (isBlocked || customer.creditStatus === 'BLOCKED' || summary?.creditStatus === 'BLOCKED') {
    const administrativelyBlocked = summary?.blockingReasons?.includes('CREDIT_ADMINISTRATIVELY_BLOCKED') || customer.creditStatus === 'BLOCKED' || customer.creditStatus === 'SUSPENDED'
    const canOverride = options.isAdmin && summary?.canAdministrativeOverride && !administrativelyBlocked
    if (options.overrideEnabled && canOverride) {
      if (!options.overrideReason?.trim()) return 'Captura el motivo de la autorización administrativa.'
      return null
    }
    return summary?.blockingReason ?? summary?.blockReason ?? 'El crédito del cliente está bloqueado.'
  }

  const availableCredit = numberFrom(summary?.availableCredit ?? customer.creditLimit)
  if (availableCredit >= 0 && total > availableCredit) {
    return `La venta excede el crédito disponible de ${formatMoney(availableCredit)}.`
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
  options: CreditRestrictionOptions = {},
) {
  if (paymentType === 'CASH_SALE' && !paymentMethod && (!customer || customer.isActive === false || customer.active === false)) {
    return 'Selecciona un cliente activo cuando no se capture pago inicial.'
  }

  return getCreditRestriction(paymentType, customer, total, options)
}

const CREDIT_ERROR_MESSAGES: Record<string, string> = {
  CREDIT_ADMINISTRATIVELY_BLOCKED: 'El crédito del cliente está bloqueado administrativamente.',
  CREDIT_CONCURRENCY_RETRY_EXHAUSTED: 'El crédito cambió durante la venta. Actualiza el cliente e inténtalo nuevamente.',
  CREDIT_LIMIT_EXCEEDED: 'La venta excede el límite de crédito disponible del cliente.',
  CREDIT_OVERDUE_BLOCKED: 'El cliente tiene saldo vencido y su política bloquea nuevas ventas a crédito.',
  CREDIT_OVERRIDE_FORBIDDEN: 'Solo un administrador puede autorizar esta excepción de crédito.',
  CREDIT_OVERRIDE_NOT_ALLOWED: 'La política comercial del cliente no permite autorizaciones administrativas.',
  CREDIT_OVERRIDE_NOT_APPLICABLE: 'La autorización administrativa ya no aplica. Actualiza el estado de crédito del cliente.',
  CREDIT_OVERRIDE_REASON_REQUIRED: 'Captura el motivo de la autorización administrativa.',
  CREDIT_POLICY_MISMATCH: 'La política comercial enviada no coincide con la asignada al cliente. Actualiza la información del cliente.',
}

export function getSaleErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'payload' in error) {
    const payload = (error as { payload?: unknown }).payload
    if (typeof payload === 'object' && payload !== null && 'code' in payload) {
      const code = String((payload as { code?: unknown }).code ?? '')
      if (CREDIT_ERROR_MESSAGES[code]) return CREDIT_ERROR_MESSAGES[code]
    }
  }
  return error instanceof Error && error.message ? error.message : 'La confirmación de la venta falló.'
}

export function buildCreateSalePayload(input: BuildCreateSalePayloadInput): CreateSalePayload {
  const physicalFolio = input.physicalFolio.trim()
  const billingRequestReason = input.billingRequestReason?.trim()
  const billingRequestNotes = input.billingRequestNotes?.trim()
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
    billingRequest: input.requiresAdministrativeInvoice && billingRequestReason
      ? { reason: billingRequestReason, notes: billingRequestNotes || undefined }
      : undefined,
    paymentType: input.paymentType,
    initialPayment,
    discount: 0,
    commercialPolicyId: input.customer?.commercialPolicyId ?? input.customer?.creditSummary?.commercialPolicyId ?? undefined,
    administrativeOverrideReason: input.administrativeOverrideReason?.trim() || undefined,
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
