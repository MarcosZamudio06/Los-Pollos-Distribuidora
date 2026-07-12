import { describe, expect, it, vi } from 'vitest'
import { validateEmployeeForm, type EmployeeFormDraft } from '../employeesFormUtils'

const validDraft: EmployeeFormDraft = {
  name: 'Ana Pérez',
  email: 'ana.perez@example.com',
  phone: '2291234567',
  roleId: 'role-1',
  operationalLocationId: 'location-1',
}

describe('employee form validation', () => {
  it('accepts a valid name, email and ten-character phone', () => {
    expect(validateEmployeeForm(validDraft)).toEqual({})
  })

  it('requires a role and operational location', () => {
    expect(validateEmployeeForm({ ...validDraft, roleId: '' }).roleId).toContain('rol')
    expect(validateEmployeeForm({ ...validDraft, operationalLocationId: '' }).operationalLocationId).toContain('punto')
  })

  it('rejects names longer than 300 characters', () => {
    expect(validateEmployeeForm({ ...validDraft, name: 'a'.repeat(301) }).name).toContain('300')
  })

  it('requires a valid email format', () => {
    expect(validateEmployeeForm({ ...validDraft, email: '' }).email).toBeTruthy()
    expect(validateEmployeeForm({ ...validDraft, email: 'not-an-email' }).email).toContain('válido')
  })

  it('prevents submit when required values are empty or malformed', () => {
    const submit = vi.fn()
    const invalidDraft = { ...validDraft, name: '', email: 'invalid', phone: '123' }
    if (Object.keys(validateEmployeeForm(invalidDraft)).length === 0) submit()
    expect(submit).not.toHaveBeenCalled()
  })

  it('requires the phone to have exactly ten characters', () => {
    expect(validateEmployeeForm({ ...validDraft, phone: '123456789' }).phone).toContain('10')
    expect(validateEmployeeForm({ ...validDraft, phone: '12345678901' }).phone).toContain('10')
  })
})
