import { describe, expect, it } from 'vitest'
import { validateChangePassword } from '../changePasswordValidation'

describe('validateChangePassword', () => {
  it('accepts a valid password change', () => {
    expect(validateChangePassword({
      confirmPassword: 'nueva-segura-2026',
      currentPassword: 'temporal-2026',
      newPassword: 'nueva-segura-2026',
    })).toBeNull()
  })

  it.each([
    [{ currentPassword: '', newPassword: 'nueva-segura-2026', confirmPassword: 'nueva-segura-2026' }, 'Ingresa tu contraseña'],
    [{ currentPassword: 'temporal-2026', newPassword: 'corta', confirmPassword: 'corta' }, 'al menos 10 caracteres'],
    [{ currentPassword: 'misma-segura-2026', newPassword: 'misma-segura-2026', confirmPassword: 'misma-segura-2026' }, 'debe ser diferente'],
    [{ currentPassword: 'temporal-2026', newPassword: 'nueva-segura-2026', confirmPassword: 'otra-segura-2026' }, 'no coincide'],
  ])('rejects invalid values', (values, expectedMessage) => {
    expect(validateChangePassword(values)).toContain(expectedMessage)
  })
})
