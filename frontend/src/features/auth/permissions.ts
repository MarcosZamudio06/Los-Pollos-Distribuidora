import type { AuthUser } from './types'

export const PERMISSIONS = {
  accessAuditRead: 'access_audit.read',
  accessProfilesManage: 'access_profiles.manage',
  cashTerminalsReassign: 'cash_terminals.reassign',
  costsRead: 'costs.read',
  dailyCloseDifferencesAuthorize: 'daily_closes.differences.authorize',
  dailyClosesReopen: 'daily_closes.reopen',
  paymentsCancel: 'payments.cancel',
  rolesRead: 'roles.read',
  usersManage: 'users.manage',
  userSessionsRevoke: 'user_sessions.revoke',
} as const

export function hasPermission(user: AuthUser | null | undefined, permission: string) {
  return user?.permissions?.includes(permission) ?? false
}
