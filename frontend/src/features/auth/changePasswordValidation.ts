export type ChangePasswordFormValues = {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export function validateChangePassword(values: ChangePasswordFormValues): string | null {
  if (!values.currentPassword) return 'Ingresa tu contraseña temporal o actual.'
  if (values.newPassword.length < 10) return 'La nueva contraseña debe tener al menos 10 caracteres.'
  if (values.newPassword === values.currentPassword) return 'La nueva contraseña debe ser diferente a la actual.'
  if (values.newPassword !== values.confirmPassword) return 'La confirmación no coincide con la nueva contraseña.'
  return null
}
