import type { AuthUser } from './types'

export const PERMISSIONS = {
  cashTerminalsReassign: 'cash_terminals.reassign',
  costsRead: 'costs.read',
  dailyCloseDifferencesAuthorize: 'daily_closes.differences.authorize',
  dailyClosesReopen: 'daily_closes.reopen',
  paymentsCancel: 'payments.cancel',
} as const

export function hasPermission(user: AuthUser | null | undefined, permission: string) {
  return user?.permissions?.includes(permission) ?? false
}
