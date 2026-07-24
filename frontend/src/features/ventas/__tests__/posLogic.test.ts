import { describe, expect, it } from 'vitest'
import {
  buildCreateSalePayload,
  calculateCashChange,
  calculateCartTotal,
  getCreditRestriction,
  getSaleErrorMessage,
  getQuantityValidationError,
  getLocationValidationError,
  getPaymentsValidationError,
  getPaymentReferenceValidationError,
  getSaleRestriction,
} from '../posLogic'
import type { CartItem, CustomerOption } from '../types'

const kgItem: CartItem = {
  id: 'prod-kg',
  productId: 'prod-kg',
  name: 'Breast fillet',
  sku: 'BREAST-001',
  presentationType: 'CUT',
  unit: 'KG',
  salePrice: 125.5,
  unitPrice: 125.5,
  locationId: 'loc-counter',
  locationName: 'Counter cooler',
  availableKg: 12.25,
  availablePieces: 0,
  quantityKg: 2.4,
  quantityPieces: 0,
}

const pieceItem: CartItem = {
  id: 'prod-piece',
  productId: 'prod-piece',
  name: 'Whole chicken',
  sku: 'WHOLE-001',
  presentationType: 'WHOLE',
  unit: 'PIECE',
  salePrice: 92,
  unitPrice: 92,
  locationId: 'loc-counter',
  locationName: 'Counter cooler',
  availableKg: 0,
  availablePieces: 5,
  quantityKg: 0,
  quantityPieces: 3,
}


const kgAndPieceItem: CartItem = {
  id: 'prod-both',
  productId: 'prod-both',
  name: 'Chicken combo',
  sku: 'COMBO-001',
  presentationType: 'CUT',
  unit: 'KG_AND_PIECE',
  salePrice: 80,
  unitPrice: 80,
  locationId: 'loc-counter',
  locationName: 'Counter cooler',
  availableKg: 10,
  availablePieces: 8,
  unitEquivalentId: 'eq-1',
  equivalentFactor: 1.25,
  equivalentUnitFrom: 'PIECE',
  equivalentUnitTo: 'KG',
  quantityKg: 2,
  quantityPieces: 3,
}

const activeCustomer: CustomerOption = {
  id: 'customer-active',
  name: 'Restaurant Active',
  customerType: 'WHOLESALE',
  creditStatus: 'ACTIVE',
  isActive: true,
  creditSummary: {
    creditLimit: 5000,
    availableCredit: 2600,
    outstandingAmount: 2400,
    overdueAmount: 0,
    isBlocked: false,
    hasOverdueBalance: false,
  },
}

describe('POS cart calculations and validation', () => {
  it('calculates a real-time total using kg and piece quantities without sending it as source of truth', () => {
    expect(calculateCartTotal([kgItem, pieceItem])).toBe(577.2)
  })

  it('converts KG_AND_PIECE pieces to kilograms before calculating the preview subtotal', () => {
    expect(calculateCartTotal([kgAndPieceItem])).toBe(460)
  })

  it('rejects empty, non-positive, over-stock, and fractional piece quantities per operational stock', () => {
    expect(getQuantityValidationError({ ...kgItem, quantityKg: 0 })).toBe('Ingresa una cantidad mayor que cero.')
    expect(getQuantityValidationError({ ...kgItem, quantityKg: 12.5 })).toBe('La cantidad no puede exceder 12.25 kg disponibles en Counter cooler.')
    expect(getQuantityValidationError({ ...pieceItem, quantityPieces: 5.5 })).toBe('Las piezas deben ser un número entero.')
    expect(getQuantityValidationError({ ...pieceItem, quantityPieces: 6 })).toBe('La cantidad no puede exceder 5 piezas disponibles en Counter cooler.')
    expect(getQuantityValidationError(pieceItem)).toBeNull()
  })

  it('allows kg-and-piece products to sell kilos, pieces, or both, requiring equivalence only for pieces', () => {
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: 2, quantityPieces: 0, unitEquivalentId: undefined, equivalentFactor: undefined, equivalentUnitFrom: undefined, equivalentUnitTo: undefined })).toBeNull()
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: 0, quantityPieces: 3 })).toBeNull()
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: 0, quantityPieces: 3, unitEquivalentId: undefined })).toBe('El producto requiere una equivalencia activa entre kilos y piezas.')
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: 0, quantityPieces: 0 })).toBe('Ingresa kilos, piezas o ambas cantidades.')
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: 2, quantityPieces: -2 })).toBe('Ingresa kilos, piezas o ambas cantidades.')
    expect(getQuantityValidationError(kgAndPieceItem)).toBeNull()
  })

  it('requires payment evidence only for non-cash methods that need reconciliation', () => {
    const emptyReference = { bankName: '', referenceNumber: '', cardLastFour: '' }
    expect(getPaymentReferenceValidationError('CASH', emptyReference)).toBeNull()
    expect(getPaymentReferenceValidationError('TRANSFER', emptyReference)).toBe('Captura el banco y la referencia del pago.')
    expect(getPaymentReferenceValidationError('CARD', { ...emptyReference, referenceNumber: 'AUTH-1', cardLastFour: '4242' })).toBeNull()
  })

  it('validates every split payment amount, evidence, and combined amount before submission', () => {
    expect(getPaymentsValidationError([{ amount: 0, paymentMethod: 'CASH' }], 100)).toBe('Captura un método y un monto mayor que cero para cada pago.')
    expect(getPaymentsValidationError([{ amount: 101, paymentMethod: 'CASH' }], 100)).toBe('El total recibido no puede exceder el total de la venta.')
    expect(getPaymentsValidationError([{ amount: 100, paymentMethod: 'CARD', referenceNumber: 'AUTH-1', cardLastFour: '4242' }], 100)).toBeNull()
  })

  it('rejects split payments whose individual money rounding changes their combined amount before submission', () => {
    const payments = [
      { amount: 33.334, paymentMethod: 'CASH' as const },
      { amount: 33.334, paymentMethod: 'CASH' as const },
      { amount: 33.334, paymentMethod: 'CASH' as const },
    ]

    expect(buildCreateSalePayload({
      cart: [kgItem], customer: null, documentType: 'SIMPLE_NOTE', locationId: 'loc-counter',
      payments, paymentType: 'CASH_SALE', physicalFolio: '', requiresAdministrativeInvoice: false,
      saleChannel: 'COUNTER', total: 100,
    }).payments).toEqual([
      { amount: 33.33, paymentMethod: 'CASH' },
      { amount: 33.33, paymentMethod: 'CASH' },
      { amount: 33.33, paymentMethod: 'CASH' },
    ])
    expect(getPaymentsValidationError(payments, 100)).toBe('Los montos de pago no pueden alterar el total al redondearse a centavos.')
  })

  it('validates cash tendered only for cash and calculates change from its individual applied amount', () => {
    expect(calculateCashChange(200, 187.5)).toBe(12.5)
    expect(calculateCashChange(120, 100)).toBe(20)
    expect(getPaymentsValidationError([{ amount: 187.5, paymentMethod: 'CASH', cashTendered: 180 } as never], 187.5)).toBe('El efectivo entregado no puede ser menor al monto aplicado.')
    expect(getPaymentsValidationError([{ amount: 33.334, paymentMethod: 'CASH', cashTendered: 33.33 } as never], 100)).toBeNull()
    expect(getPaymentsValidationError([{ amount: 100, paymentMethod: 'CARD', cashTendered: 100, referenceNumber: 'AUTH-1', cardLastFour: '4242' } as never], 100)).toBe('El efectivo entregado solo aplica a pagos en efectivo.')
  })

  it('rejects cart items whose displayed stock belongs to another operational location', () => {
    expect(getLocationValidationError([{ ...kgItem, locationId: 'loc-old', locationName: 'Old counter' }], 'loc-new')).toBe('El carrito contiene stock de otra ubicación operativa. Actualiza el carrito para esta ubicación.')
    expect(getLocationValidationError([kgItem], 'loc-counter')).toBeNull()
  })
})

describe('POS credit restrictions', () => {
  it('requires a registered customer for credit sales', () => {
    expect(getCreditRestriction('CREDIT_SALE', null, 100)).toBe('Selecciona un cliente activo para una venta a crédito.')
  })

  it('blocks credit when the customer is blocked or the sale exceeds available credit', () => {
    expect(getCreditRestriction('CREDIT_SALE', { ...activeCustomer, isBlockedForCredit: true }, 100)).toBe('El crédito del cliente está bloqueado.')
    expect(getCreditRestriction('CREDIT_SALE', { ...activeCustomer, creditSummary: { ...activeCustomer.creditSummary, availableCredit: 0 } }, 1)).toBe('La venta excede el crédito disponible de $0.00.')
    expect(getCreditRestriction('CREDIT_SALE', activeCustomer, 2700)).toBe('La venta excede el crédito disponible de $2,600.00.')
    expect(getCreditRestriction('CREDIT_SALE', activeCustomer, 2500)).toBeNull()
  })

  it('permits warnings and only bypasses an eligible block with an intentional admin override', () => {
    const warningCustomer: CustomerOption = {
      ...activeCustomer,
      creditSummary: {
        ...activeCustomer.creditSummary,
        effectiveCreditStatus: 'WARNING',
        blockingReasons: ['CREDIT_OVERDUE_WARNING'],
      },
    }
    const blockedCustomer: CustomerOption = {
      ...activeCustomer,
      creditSummary: {
        ...activeCustomer.creditSummary,
        effectiveCreditStatus: 'BLOCKED',
        isBlockedForCredit: true,
        canAdministrativeOverride: true,
        blockingReasons: ['CREDIT_OVERDUE_BLOCKED'],
        blockingReason: 'Saldo vencido',
      },
    }

    expect(getCreditRestriction('CREDIT_SALE', warningCustomer, 100)).toBeNull()
    expect(getCreditRestriction('CREDIT_SALE', blockedCustomer, 100, { isAdmin: true, overrideEnabled: true, overrideReason: '' })).toBe('Captura el motivo de la autorización administrativa.')
    expect(getCreditRestriction('CREDIT_SALE', blockedCustomer, 100, { isAdmin: true, overrideEnabled: true, overrideReason: 'Autorizado por dirección' })).toBeNull()
    expect(getCreditRestriction('CREDIT_SALE', blockedCustomer, 100, { isAdmin: false, overrideEnabled: true, overrideReason: 'No autorizado' })).toBe('Saldo vencido')
  })
})

describe('POS sale-level restrictions', () => {
  it('requires a registered customer when a cash sale is delivered without payments', () => {
    expect(getSaleRestriction('CASH_SALE', null, 100, false)).toBe('Selecciona un cliente activo cuando no se capturen pagos.')
    expect(getSaleRestriction('CASH_SALE', activeCustomer, 100, false)).toBeNull()
    expect(getSaleRestriction('CASH_SALE', null, 100, true)).toBeNull()
  })
})

describe('POS sale payload', () => {
  it('builds the create-sale contract for a paid cash sale with one payment item', () => {
    expect(
      buildCreateSalePayload({
        cart: [kgItem],
        customer: null,
        documentType: 'SIMPLE_NOTE',
        locationId: 'loc-counter',
        payments: [{ amount: 301.2, paymentMethod: 'CASH' }],
        paymentType: 'CASH_SALE',
        physicalFolio: ' note-42 ',
        requiresAdministrativeInvoice: false,
        saleChannel: 'COUNTER',
        total: 301.2,
      }),
    ).toEqual({
      customerId: undefined,
      documentType: 'SIMPLE_NOTE',
      payments: [{ amount: 301.2, paymentMethod: 'CASH' }],
      items: [
        {
          presentationType: 'CUT',
          productId: 'prod-kg',
          quantityKg: 2.4,
          quantityPieces: 0,
          unit: 'KG',
          unitEquivalentId: undefined,
        },
      ],
      locationId: 'loc-counter',
      paymentType: 'CASH_SALE',
      physicalFolio: 'note-42',
      requiresAdministrativeInvoice: false,
      saleChannel: 'COUNTER',
    })
  })

  it('sends cashTendered without a client-provided changeGiven', () => {
    const payload = buildCreateSalePayload({
      cart: [kgItem], customer: null, documentType: 'SIMPLE_NOTE', locationId: 'loc-counter',
      payments: [{ amount: 187.5, paymentMethod: 'CASH', cashTendered: 200 } as never],
      paymentType: 'CASH_SALE', physicalFolio: '', requiresAdministrativeInvoice: false, saleChannel: 'COUNTER', total: 187.5,
    })

    expect(payload.payments).toEqual([{ amount: 187.5, paymentMethod: 'CASH', cashTendered: 200 }])
    expect(payload.payments?.[0]).not.toHaveProperty('changeGiven')
  })

  it('builds the credit sale contract without an immediate payment', () => {
    expect(
      buildCreateSalePayload({
        cart: [pieceItem],
        customer: activeCustomer,
        documentType: 'LARGE_NOTE',
        locationId: 'loc-counter',
        payments: [],
        paymentType: 'CREDIT_SALE',
        physicalFolio: '',
        requiresAdministrativeInvoice: true,
        billingRequestReason: 'Cliente solicita seguimiento',
        billingRequestNotes: 'Enviar a administración',
        saleChannel: 'WHOLESALE',
        total: 276,
      }),
    ).toMatchObject({
      customerId: 'customer-active',
      documentType: 'LARGE_NOTE',
      payments: undefined,
      locationId: 'loc-counter',
      paymentType: 'CREDIT_SALE',
      physicalFolio: undefined,
      requiresAdministrativeInvoice: true,
      billingRequest: {
        reason: 'Cliente solicita seguimiento',
        notes: 'Enviar a administración',
      },
      saleChannel: 'WHOLESALE',
    })
  })

  it('builds a credit sale with split initial payments when payment data is captured', () => {
    expect(
      buildCreateSalePayload({
        cart: [pieceItem],
        customer: activeCustomer,
        documentType: 'LARGE_NOTE',
        locationId: 'loc-counter',
        payments: [
          { amount: 40, paymentMethod: 'CASH' },
          { amount: 60, paymentMethod: 'TRANSFER', bankName: 'Banco Norte', referenceNumber: 'TRANSFER-001' },
        ],
        paymentType: 'CREDIT_SALE',
        physicalFolio: 'credit-9',
        requiresAdministrativeInvoice: false,
        saleChannel: 'WHOLESALE',
        total: 276,
      }),
    ).toMatchObject({
      customerId: 'customer-active',
      payments: [
        { amount: 40, paymentMethod: 'CASH' },
        { amount: 60, paymentMethod: 'TRANSFER', bankName: 'Banco Norte', referenceNumber: 'TRANSFER-001' },
      ],
      paymentType: 'CREDIT_SALE',
    })
  })

  it('creates an administrative billing request without accepting an internal id', () => {
    expect(
      buildCreateSalePayload({
        billingRequestReason: ' Motivo administrativo ',
        billingRequestNotes: ' Nota opcional ',
        cart: [kgItem],
        customer: activeCustomer,
        documentType: 'SIMPLE_NOTE',
        locationId: 'loc-counter',
        payments: [{ amount: 301.2, paymentMethod: 'CASH' }],
        paymentType: 'CASH_SALE',
        physicalFolio: '',
        requiresAdministrativeInvoice: true,
        saleChannel: 'COUNTER',
        total: 301.2,
      }),
    ).toMatchObject({
      billingRequest: { reason: 'Motivo administrativo', notes: 'Nota opcional' },
      customerId: 'customer-active',
      requiresAdministrativeInvoice: true,
    })
  })

  it('only sends a trimmed administrative override reason when it was intentionally captured', () => {
    const payload = buildCreateSalePayload({
      administrativeOverrideReason: '  Autorizado por dirección  ',
      cart: [pieceItem],
      customer: activeCustomer,
      documentType: 'LARGE_NOTE',
      locationId: 'loc-counter',
        payments: [],
      paymentType: 'CREDIT_SALE',
      physicalFolio: '',
      requiresAdministrativeInvoice: false,
      saleChannel: 'WHOLESALE',
      total: 276,
    })

    expect(payload.administrativeOverrideReason).toBe('Autorizado por dirección')
  })
})

describe('POS backend credit errors', () => {
  it('maps stable credit codes to actionable Spanish messages', () => {
    expect(getSaleErrorMessage({ payload: { code: 'CREDIT_OVERDUE_BLOCKED' } })).toBe('El cliente tiene saldo vencido y su política bloquea nuevas ventas a crédito.')
    expect(getSaleErrorMessage({ payload: { code: 'CREDIT_POLICY_MISMATCH' } })).toBe('La política comercial enviada no coincide con la asignada al cliente. Actualiza la información del cliente.')
  })
})
