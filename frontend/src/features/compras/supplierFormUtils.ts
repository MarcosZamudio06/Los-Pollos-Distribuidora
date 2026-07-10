import type { CreateSupplierPayload, Supplier, UpdateSupplierPayload } from './types'

export type SupplierFormDraft = {
  name: string
  phone: string
  email: string
  address: string
}

export type SupplierFormField = 'address' | 'email' | 'name' | 'phone'

export type SupplierFormErrors = Partial<Record<SupplierFormField, string>>

const MULTIPLE_SPACES = /\s+/g
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function collapseSupplierSpaces(value: string): string {
  return value.replace(MULTIPLE_SPACES, ' ').trim()
}

export function normalizeSupplierTextInput(value: string): string {
  return collapseSupplierSpaces(value)
}

export function cleanSupplierEmail(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase().trim()
}

export function createSupplierFormDraft(supplier?: Supplier | null): SupplierFormDraft {
  return {
    name: collapseSupplierSpaces(supplier?.name ?? ''),
    phone: collapseSupplierSpaces((supplier?.phone as string | null | undefined) ?? ''),
    email: supplier?.email ? cleanSupplierEmail(supplier.email) : '',
    address: collapseSupplierSpaces((supplier?.address as string | null | undefined) ?? ''),
  }
}

export function toCreateSupplierPayload(draft: SupplierFormDraft): CreateSupplierPayload {
  return {
    address: collapseSupplierSpaces(draft.address),
    email: cleanSupplierEmail(draft.email),
    name: collapseSupplierSpaces(draft.name),
    phone: collapseSupplierSpaces(draft.phone),
  }
}

export function toUpdateSupplierPayload(draft: SupplierFormDraft, original?: SupplierFormDraft | Supplier | null): UpdateSupplierPayload {
  const payload: UpdateSupplierPayload = {}
  const normalized = toCreateSupplierPayload(draft)
  const baseline = original ? toCreateSupplierPayload(createSupplierFormDraft(original as Supplier)) : null
  if (normalized.name && normalized.name !== baseline?.name) payload.name = normalized.name
  if (normalized.phone && normalized.phone !== baseline?.phone) payload.phone = normalized.phone
  if (normalized.email && normalized.email !== baseline?.email) payload.email = normalized.email
  if (normalized.address && normalized.address !== baseline?.address) payload.address = normalized.address
  return payload
}

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value)
}

export function validateSupplierField(field: SupplierFormField, draft: SupplierFormDraft): string | null {
  switch (field) {
    case 'name': {
      const value = collapseSupplierSpaces(draft.name)
      if (!value) return 'El nombre del proveedor es obligatorio.'
      return null
    }
    case 'phone': {
      const value = collapseSupplierSpaces(draft.phone)
      if (!value) return 'El teléfono del proveedor es obligatorio.'
      return null
    }
    case 'email': {
      const value = cleanSupplierEmail(draft.email)
      if (!value) return 'El email del proveedor es obligatorio.'
      return isValidEmail(value) ? null : 'El email del proveedor debe tener un formato válido.'
    }
    case 'address': {
      const value = collapseSupplierSpaces(draft.address)
      if (!value) return 'La dirección del proveedor es obligatoria.'
      return null
    }
    default:
      return null
  }
}

export function validateSupplierForm(draft: SupplierFormDraft): SupplierFormErrors {
  const fields: SupplierFormField[] = ['name', 'phone', 'email', 'address']
  return fields.reduce<SupplierFormErrors>((accumulator, field) => {
    const error = validateSupplierField(field, draft)
    if (error) accumulator[field] = error
    return accumulator
  }, {})
}

export function hasSupplierFormErrors(errors: SupplierFormErrors): boolean {
  return Object.values(errors).some(Boolean)
}
