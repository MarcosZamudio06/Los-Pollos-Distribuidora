export const PERMISSIONS = {
  ACCESS_AUDIT_READ: 'access_audit.read',
  ACCESS_PROFILES_MANAGE: 'access_profiles.manage',
  COLLECTIONS_RECEIVE_CASH: 'collections.receive_cash',
  CASH_SHIFT_OPEN_OWN: 'cash_shift.open_own',
  CASH_SHIFT_CLOSE_OWN: 'cash_shift.close_own',
  CASH_SHIFTS_ADMINISTRATIVE_CLOSE: 'cash_shifts.administrative_close',
  CASH_TERMINALS_REASSIGN: 'cash_terminals.reassign',
  CEDIS_CLOSE: 'cedis.close',
  CEDIS_DISPATCH: 'cedis.dispatch',
  CEDIS_MANAGE: 'cedis.manage',
  CEDIS_RECEIVE_SUPPLIES: 'cedis.receive_supplies',
  CEDIS_RECEIVE_RETURNS: 'cedis.receive_returns',
  CEDIS_RECONCILE: 'cedis.reconcile',
  CEDIS_VIEW: 'cedis.view',
  CEDIS_VIEW_COSTS: 'cedis.view_costs',
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
  'Access' | 'Cash' | 'CEDIS' | 'Finance' | 'Information' | 'Security';

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
    key: PERMISSIONS.COLLECTIONS_RECEIVE_CASH,
    description: 'Receive fixed-location cash collection payments.',
  },
  {
    key: PERMISSIONS.CASH_SHIFT_OPEN_OWN,
    description: "Open and inspect the authenticated user's own cash shift.",
  },
  {
    key: PERMISSIONS.CASH_SHIFT_CLOSE_OWN,
    description: "Close the authenticated user's own cash shift.",
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
    key: PERMISSIONS.CEDIS_CLOSE,
    description: 'Close CEDIS operational cycles.',
  },
  {
    key: PERMISSIONS.CEDIS_DISPATCH,
    description: 'Dispatch inventory from an authorized CEDIS.',
  },
  {
    key: PERMISSIONS.CEDIS_MANAGE,
    description: 'Manage CEDIS hierarchy and operational configuration.',
  },
  {
    key: PERMISSIONS.CEDIS_RECEIVE_RETURNS,
    description: 'Receive authorized branch returns at a CEDIS.',
  },
  {
    key: PERMISSIONS.CEDIS_RECEIVE_SUPPLIES,
    description: 'Receive supplies delivered from an authorized CEDIS.',
  },
  {
    key: PERMISSIONS.CEDIS_RECONCILE,
    description: 'Reconcile CEDIS operational cycles.',
  },
  {
    key: PERMISSIONS.CEDIS_VIEW,
    description: 'View authorized CEDIS hierarchy and operations.',
  },
  {
    key: PERMISSIONS.CEDIS_VIEW_COSTS,
    description: 'View CEDIS cost and utility information.',
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
  [PERMISSIONS.COLLECTIONS_RECEIVE_CASH]: { group: 'Cash', risk: 'sensitive' },
  [PERMISSIONS.CASH_SHIFT_OPEN_OWN]: { group: 'Cash', risk: 'sensitive' },
  [PERMISSIONS.CASH_SHIFT_CLOSE_OWN]: { group: 'Cash', risk: 'sensitive' },
  [PERMISSIONS.CASH_SHIFTS_ADMINISTRATIVE_CLOSE]: {
    group: 'Cash',
    risk: 'critical',
  },
  [PERMISSIONS.CASH_TERMINALS_REASSIGN]: { group: 'Cash', risk: 'critical' },
  [PERMISSIONS.CEDIS_CLOSE]: { group: 'CEDIS', risk: 'critical' },
  [PERMISSIONS.CEDIS_DISPATCH]: { group: 'CEDIS', risk: 'sensitive' },
  [PERMISSIONS.CEDIS_MANAGE]: { group: 'CEDIS', risk: 'critical' },
  [PERMISSIONS.CEDIS_RECEIVE_SUPPLIES]: { group: 'CEDIS', risk: 'sensitive' },
  [PERMISSIONS.CEDIS_RECEIVE_RETURNS]: { group: 'CEDIS', risk: 'sensitive' },
  [PERMISSIONS.CEDIS_RECONCILE]: { group: 'CEDIS', risk: 'critical' },
  [PERMISSIONS.CEDIS_VIEW]: { group: 'CEDIS', risk: 'standard' },
  [PERMISSIONS.CEDIS_VIEW_COSTS]: { group: 'CEDIS', risk: 'sensitive' },
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
  COLLECTIONS: [
    PERMISSIONS.COLLECTIONS_RECEIVE_CASH,
    PERMISSIONS.CASH_SHIFT_OPEN_OWN,
    PERMISSIONS.CASH_SHIFT_CLOSE_OWN,
  ],
  DRIVER: [],
  SELLER: [
    PERMISSIONS.CEDIS_VIEW,
    PERMISSIONS.CEDIS_RECEIVE_SUPPLIES,
    PERMISSIONS.CASH_SHIFT_OPEN_OWN,
    PERMISSIONS.CASH_SHIFT_CLOSE_OWN,
  ],
  WAREHOUSE: [
    PERMISSIONS.COSTS_READ,
    PERMISSIONS.CEDIS_VIEW,
    PERMISSIONS.CEDIS_DISPATCH,
    PERMISSIONS.CEDIS_RECEIVE_SUPPLIES,
    PERMISSIONS.CEDIS_RECEIVE_RETURNS,
  ],
};
