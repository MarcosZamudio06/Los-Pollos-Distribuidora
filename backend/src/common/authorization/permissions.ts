export const PERMISSIONS = {
  ACCESS_AUDIT_READ: 'access_audit.read',
  ACCESS_PROFILES_MANAGE: 'access_profiles.manage',
  CASH_SHIFTS_ADMINISTRATIVE_CLOSE: 'cash_shifts.administrative_close',
  CASH_TERMINALS_REASSIGN: 'cash_terminals.reassign',
  COSTS_READ: 'costs.read',
  DAILY_CLOSES_DIFFERENCES_AUTHORIZE: 'daily_closes.differences.authorize',
  DAILY_CLOSES_REOPEN: 'daily_closes.reopen',
  FISCAL_INFORMATION_EXPORT: 'fiscal_information.export',
  PAYMENTS_CANCEL: 'payments.cancel',
  ROLES_READ: 'roles.read',
  USERS_MANAGE: 'users.manage',
  USER_SESSIONS_REVOKE: 'user_sessions.revoke',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const CANONICAL_ROLE_NAMES = [
  'ADMIN',
  'BILLING',
  'COLLECTIONS',
  'DRIVER',
  'SELLER',
  'WAREHOUSE',
] as const;

export type PermissionRisk = 'standard' | 'sensitive' | 'critical';
export type PermissionGroup =
  | 'Access'
  | 'Cash'
  | 'Finance'
  | 'Information'
  | 'Security';

export const PERMISSION_DEFINITIONS = [
  {
    key: PERMISSIONS.ACCESS_AUDIT_READ,
    description: 'Read access-control audit history.',
  },
  {
    key: PERMISSIONS.ACCESS_PROFILES_MANAGE,
    description: 'Manage access profiles and their permissions.',
  },
  {
    key: PERMISSIONS.CASH_SHIFTS_ADMINISTRATIVE_CLOSE,
    description:
      'Close an abandoned or inaccessible cash shift administratively.',
  },
  {
    key: PERMISSIONS.CASH_TERMINALS_REASSIGN,
    description: 'Reassign cash terminals to an operational location.',
  },
  {
    key: PERMISSIONS.COSTS_READ,
    description: 'Read purchase costs and margin information.',
  },
  {
    key: PERMISSIONS.DAILY_CLOSES_DIFFERENCES_AUTHORIZE,
    description: 'Authorize daily close differences.',
  },
  {
    key: PERMISSIONS.DAILY_CLOSES_REOPEN,
    description: 'Reopen a closed daily close.',
  },
  {
    key: PERMISSIONS.FISCAL_INFORMATION_EXPORT,
    description: 'Export fiscal information.',
  },
  {
    key: PERMISSIONS.PAYMENTS_CANCEL,
    description: 'Cancel registered payments.',
  },
  {
    key: PERMISSIONS.ROLES_READ,
    description: 'Read access profiles.',
  },
  {
    key: PERMISSIONS.USERS_MANAGE,
    description: 'Manage internal users.',
  },
  {
    key: PERMISSIONS.USER_SESSIONS_REVOKE,
    description: 'Revoke active sessions for internal users.',
  },
] as const satisfies ReadonlyArray<{ key: Permission; description: string }>;

export const PERMISSION_METADATA: Record<
  Permission,
  { group: PermissionGroup; risk: PermissionRisk }
> = {
  [PERMISSIONS.ACCESS_AUDIT_READ]: { group: 'Security', risk: 'sensitive' },
  [PERMISSIONS.ACCESS_PROFILES_MANAGE]: { group: 'Security', risk: 'critical' },
  [PERMISSIONS.CASH_SHIFTS_ADMINISTRATIVE_CLOSE]: {
    group: 'Cash',
    risk: 'critical',
  },
  [PERMISSIONS.CASH_TERMINALS_REASSIGN]: { group: 'Cash', risk: 'critical' },
  [PERMISSIONS.COSTS_READ]: { group: 'Information', risk: 'sensitive' },
  [PERMISSIONS.DAILY_CLOSES_DIFFERENCES_AUTHORIZE]: {
    group: 'Finance',
    risk: 'critical',
  },
  [PERMISSIONS.DAILY_CLOSES_REOPEN]: { group: 'Finance', risk: 'critical' },
  [PERMISSIONS.FISCAL_INFORMATION_EXPORT]: {
    group: 'Information',
    risk: 'sensitive',
  },
  [PERMISSIONS.PAYMENTS_CANCEL]: { group: 'Finance', risk: 'critical' },
  [PERMISSIONS.ROLES_READ]: { group: 'Security', risk: 'standard' },
  [PERMISSIONS.USERS_MANAGE]: { group: 'Access', risk: 'critical' },
  [PERMISSIONS.USER_SESSIONS_REVOKE]: { group: 'Security', risk: 'critical' },
};

export const ROLE_PERMISSION_KEYS: Record<string, readonly Permission[]> = {
  ADMIN: PERMISSION_DEFINITIONS.map(({ key }) => key),
  BILLING: [PERMISSIONS.FISCAL_INFORMATION_EXPORT],
  COLLECTIONS: [],
  DRIVER: [],
  SELLER: [],
  WAREHOUSE: [PERMISSIONS.COSTS_READ],
};
