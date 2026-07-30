export const PERMISSIONS = {
  ACCESS_PROFILES_MANAGE: 'access_profiles.manage',
  CASH_TERMINALS_REASSIGN: 'cash_terminals.reassign',
  COSTS_READ: 'costs.read',
  DAILY_CLOSES_DIFFERENCES_AUTHORIZE: 'daily_closes.differences.authorize',
  DAILY_CLOSES_REOPEN: 'daily_closes.reopen',
  FISCAL_INFORMATION_EXPORT: 'fiscal_information.export',
  PAYMENTS_CANCEL: 'payments.cancel',
  ROLES_READ: 'roles.read',
  USERS_MANAGE: 'users.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DEFINITIONS = [
  {
    key: PERMISSIONS.ACCESS_PROFILES_MANAGE,
    description: 'Manage access profiles and their permissions.',
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
] as const satisfies ReadonlyArray<{ key: Permission; description: string }>;

export const ROLE_PERMISSION_KEYS: Record<string, readonly Permission[]> = {
  ADMIN: PERMISSION_DEFINITIONS.map(({ key }) => key),
  BILLING: [PERMISSIONS.FISCAL_INFORMATION_EXPORT],
  COLLECTIONS: [],
  DRIVER: [],
  SELLER: [],
  WAREHOUSE: [PERMISSIONS.COSTS_READ],
};
