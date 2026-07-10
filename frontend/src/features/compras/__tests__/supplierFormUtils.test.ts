import { describe, expect, it } from 'vitest'
import {
  cleanSupplierEmail,
  collapseSupplierSpaces,
  createSupplierFormDraft,
  normalizeSupplierTextInput,
  toCreateSupplierPayload,
  toUpdateSupplierPayload,
  validateSupplierField,
  validateSupplierForm,
  type SupplierFormDraft,
  type SupplierFormErrors,
} from '../supplierFormUtils'

const validDraft: SupplierFormDraft = {
  name: 'Granja del Norte',
  phone: '2291234567',
  email: 'ventas@granjanorte.com.mx',
  address: 'Carretera Xalapa-Veracruz km 12, Col. Rancheria, Xalapa, Ver.',
}

describe('supplier form utilities — normalization', () => {
  it('trims and collapses repeated spaces in text fields', () => {
    expect(collapseSupplierSpaces('   Granja   del   Norte   ')).toBe('Granja del Norte')
    expect(normalizeSupplierTextInput('  Carretera  Xalapa-Veracruz  ')).toBe('Carretera Xalapa-Veracruz')
  })

  it('normalizes email to lowercase without spaces for backend normalization parity', () => {
    expect(cleanSupplierEmail('  Ventas@GranjNorte.com.mx  ')).toBe('ventas@granjnorte.com.mx')
    expect(cleanSupplierEmail('ventas @granjanorte.com.mx')).toBe('ventas@granjanorte.com.mx')
  })

  it('creates an empty draft for a new supplier', () => {
    expect(createSupplierFormDraft()).toEqual({ address: '', email: '', name: '', phone: '' })
  })
})

describe('supplier form utilities — map draft to backend payload', () => {
  it('maps a valid draft to a create payload with normalized fields', () => {
    const payload = toCreateSupplierPayload(validDraft)
    expect(payload).toEqual({
      address: 'Carretera Xalapa-Veracruz km 12, Col. Rancheria, Xalapa, Ver.',
      email: 'ventas@granjanorte.com.mx',
      name: 'Granja del Norte',
      phone: '2291234567',
    })
  })

  it('maps only changed fields to a partial update payload', () => {
    const payload = toUpdateSupplierPayload({ ...validDraft, email: '  nuevo@granjanorte.com.mx  ' }, validDraft)
    expect(payload).toEqual({ email: 'nuevo@granjanorte.com.mx' })
  })

  it('returns an empty update payload when all fields are empty strings', () => {
    expect(toUpdateSupplierPayload(createSupplierFormDraft())).toEqual({})
  })

  it('omits empty string fields from create payload name', () => {
    const payload = toCreateSupplierPayload({ ...validDraft, address: '' })
    expect(payload.address).toBe('')
    expect(payload.name).toBe('Granja del Norte')
  })
})

describe('supplier form utilities — validation', () => {
  it('returns null errors when all required fields are valid', () => {
    const errors = validateSupplierForm(validDraft)
    expect(errors).toEqual({} as SupplierFormErrors)
    expect(Object.values(errors).some(Boolean)).toBe(false)
  })

  it('requires name, phone, email and address as non-empty after trim', () => {
    const errors = validateSupplierForm({ address: '   ', email: '', name: '   ', phone: '   ' })
    expect(errors.name).toBe('El nombre del proveedor es obligatorio.')
    expect(errors.phone).toBe('El teléfono del proveedor es obligatorio.')
    expect(errors.email).toBe('El email del proveedor es obligatorio.')
    expect(errors.address).toBe('La dirección del proveedor es obligatoria.')
  })

  it('rejects an invalid email format', () => {
    const errors = validateSupplierForm({ ...validDraft, email: 'not-an-email' })
    expect(errors.email).toBe('El email del proveedor debe tener un formato válido.')
  })

  it('rejects an email missing the domain dot', () => {
    expect(validateSupplierField('email', { ...validDraft, email: 'ventas@granjanorte' })).toBe(
      'El email del proveedor debe tener un formato válido.',
    )
  })

  it('accepts a well-formed email with subdomain', () => {
    expect(validateSupplierField('email', { ...validDraft, email: 'Ventas@Corpo.GranjaNorte.com.mx' })).toBeNull()
  })

  it('reports name and phone errors together when both are missing', () => {
    const errors = validateSupplierForm({ ...validDraft, name: '', phone: '' })
    expect(Object.keys(errors).sort()).toEqual(['name', 'phone'])
  })
})

describe('supplier form utilities — legacy null edit completion', () => {
  it('supplies empty strings for legacy null phone/email/address when editing a supplier record', () => {
    const legacySupplier = {
      address: null,
      email: null,
      id: 'sup-legacy',
      isActive: true,
      name: 'Granja Vieja',
      phone: null,
    } as import('../types').Supplier

    const draft = createSupplierFormDraft(legacySupplier)
    expect(draft).toEqual({ address: '', email: '', name: 'Granja Vieja', phone: '' })
  })

  it('edit-completes required field validation when legacy record has null required values', () => {
    const legacySupplier = {
      address: null,
      email: null,
      id: 'sup-legacy',
      isActive: true,
      name: '  Granja Vieja  ',
      phone: null,
    } as import('../types').Supplier

    const draft = createSupplierFormDraft(legacySupplier)
    const errors = validateSupplierForm(draft)
    expect(errors.name).toBeUndefined()
    expect(errors.phone).toBe('El teléfono del proveedor es obligatorio.')
    expect(errors.email).toBe('El email del proveedor es obligatorio.')
    expect(errors.address).toBe('La dirección del proveedor es obligatoria.')
  })

  it('edit-completes a valid mix of null and populated fields from legacy records', () => {
    const legacySupplier = {
      address: 'Carretera Xalapa km 8',
      email: null,
      id: 'sup-legacy-2',
      isActive: true,
      name: 'Granja Mítica',
      phone: '2299876543',
    } as import('../types').Supplier

    const draft = createSupplierFormDraft(legacySupplier)
    expect(draft).toEqual({ address: 'Carretera Xalapa km 8', email: '', name: 'Granja Mítica', phone: '2299876543' })
    const payload = toUpdateSupplierPayload({ ...draft, email: '  Contacto@GranjaMítica.com.mx  ' }, draft)
    expect(payload).toEqual({ email: 'contacto@granjamítica.com.mx' })
  })
})
