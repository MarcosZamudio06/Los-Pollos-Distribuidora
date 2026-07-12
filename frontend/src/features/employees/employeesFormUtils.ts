export type EmployeeFormDraft = {
  name: string
  email: string
  phone: string
  roleId: string
  operationalLocationId: string
}

export type EmployeeFormErrors = Partial<Record<'name' | 'email' | 'phone' | 'roleId' | 'operationalLocationId', string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmployeeForm(draft: EmployeeFormDraft): EmployeeFormErrors {
  const errors: EmployeeFormErrors = {}
  const name = draft.name.trim()
  const email = draft.email.trim()
  const phone = draft.phone.trim()

  if (!name) errors.name = 'El nombre es obligatorio.'
  else if (name.length > 300) errors.name = 'El nombre no puede exceder 300 caracteres.'

  if (!email) errors.email = 'El correo electrónico es obligatorio.'
  else if (!emailPattern.test(email)) errors.email = 'Ingresa un correo electrónico válido.'

  if (!phone) errors.phone = 'El teléfono es obligatorio.'
  else if (phone.length !== 10) errors.phone = 'El teléfono debe tener exactamente 10 caracteres.'

  if (!draft.roleId) errors.roleId = 'Selecciona un rol.'
  if (!draft.operationalLocationId) errors.operationalLocationId = 'Selecciona un punto de venta.'

  return errors
}
