import { describe, expect, it } from 'vitest'
import {
  buildCreateSalePayload,
  calculateCartTotal,
  getCreditRestriction,
  getQuantityValidationError,
  getLocationValidationError,
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

  it('rejects empty, non-positive, over-stock, and fractional piece quantities per operational stock', () => {
    expect(getQuantityValidationError({ ...kgItem, quantityKg: 0 })).toBe('Ingresa una cantidad mayor que cero.')
    expect(getQuantityValidationError({ ...kgItem, quantityKg: 12.5 })).toBe('La cantidad no puede exceder 12.25 kg disponibles en Counter cooler.')
    expect(getQuantityValidationError({ ...pieceItem, quantityPieces: 5.5 })).toBe('Las piezas deben ser un número entero.')
    expect(getQuantityValidationError({ ...pieceItem, quantityPieces: 6 })).toBe('La cantidad no puede exceder 5 piezas disponibles en Counter cooler.')
    expect(getQuantityValidationError(pieceItem)).toBeNull()
  })

  it('rejects non-positive and negative kg-and-piece quantities per dimension', () => {
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: 0, quantityPieces: 3 })).toBe('Ingresa kilos y piezas mayores que cero.')
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: -1, quantityPieces: 3 })).toBe('Ingresa kilos y piezas mayores que cero.')
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: 2, quantityPieces: 0 })).toBe('Ingresa kilos y piezas mayores que cero.')
    expect(getQuantityValidationError({ ...kgAndPieceItem, quantityKg: 2, quantityPieces: -2 })).toBe('Ingresa kilos y piezas mayores que cero.')
    expect(getQuantityValidationError(kgAndPieceItem)).toBeNull()
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
})

describe('POS sale-level restrictions', () => {
  it('requires a registered customer when a cash sale is delivered without an initial payment', () => {
    expect(getSaleRestriction('CASH_SALE', null, 100, '')).toBe('Selecciona un cliente activo cuando no se capture pago inicial.')
    expect(getSaleRestriction('CASH_SALE', activeCustomer, 100, '')).toBeNull()
    expect(getSaleRestriction('CASH_SALE', null, 100, 'CASH')).toBeNull()
  })
})

describe('POS sale payload', () => {
  it('builds the create-sale contract for a paid cash sale with an initial payment', () => {
    expect(
      buildCreateSalePayload({
        cart: [kgItem],
        customer: null,
        documentType: 'SIMPLE_NOTE',
        locationId: 'loc-counter',
        paymentMethod: 'CASH',
        paymentType: 'CASH_SALE',
        physicalFolio: ' note-42 ',
        requiresAdministrativeInvoice: false,
        saleChannel: 'COUNTER',
        total: 301.2,
      }),
    ).toEqual({
      customerId: undefined,
      documentType: 'SIMPLE_NOTE',
      discount: 0,
      initialPayment: {
        amount: 301.2,
        paidAt: expect.any(String),
        paymentMethod: 'CASH',
      },
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

  it('builds the credit sale contract without requiring an immediate collection payment', () => {
    expect(
      buildCreateSalePayload({
        cart: [pieceItem],
        customer: activeCustomer,
        documentType: 'LARGE_NOTE',
        locationId: 'loc-counter',
        paymentMethod: '',
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
      initialPayment: undefined,
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

  it('builds a credit sale with an initial payment when payment data is captured', () => {
    expect(
      buildCreateSalePayload({
        cart: [pieceItem],
        customer: activeCustomer,
        documentType: 'LARGE_NOTE',
        initialPaymentAmount: 100,
        locationId: 'loc-counter',
        paymentMethod: 'TRANSFER',
        paymentType: 'CREDIT_SALE',
        physicalFolio: 'credit-9',
        requiresAdministrativeInvoice: false,
        saleChannel: 'WHOLESALE',
        total: 276,
      }),
    ).toMatchObject({
      customerId: 'customer-active',
      initialPayment: {
        amount: 100,
        paidAt: expect.any(String),
        paymentMethod: 'TRANSFER',
      },
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
        paymentMethod: 'CASH',
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
})
