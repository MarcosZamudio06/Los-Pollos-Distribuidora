import type { UserRole } from '../../features/auth'

export const KNOWN_ROLES = ['ADMIN', 'BILLING', 'SELLER', 'WAREHOUSE', 'COLLECTIONS', 'DRIVER'] as const
export const ALL_ROLES = KNOWN_ROLES

export type KnownRole = (typeof KNOWN_ROLES)[number]

export const ROUTE_ACCESS_ROLES = {
  accountsReceivable: ['ADMIN', 'COLLECTIONS'],
  billingRequests: ['ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS'],
  billingReportableNotes: ['ADMIN', 'BILLING', 'SELLER', 'COLLECTIONS'],
  billingRemediations: ['ADMIN', 'BILLING'],
  admin: ['ADMIN'],
  customers: ['ADMIN', 'SELLER', 'COLLECTIONS'],
  dashboard: ALL_ROLES,
  deliveryRouteDetail: ['ADMIN', 'COLLECTIONS', 'DRIVER'],
  deliveryRouteEvidence: ['ADMIN', 'COLLECTIONS', 'DRIVER'],
  deliveryRoutes: ['ADMIN', 'COLLECTIONS', 'WAREHOUSE'],
  deliveryRoutePlanner: ['ADMIN'],
  myRoutes: ['DRIVER'],
  purchaseDetail: ['ADMIN', 'WAREHOUSE'],
  purchaseNew: ['ADMIN', 'WAREHOUSE'],
  purchaseSuppliers: ['ADMIN', 'WAREHOUSE'],
  purchases: ['ADMIN', 'WAREHOUSE'],
  reports: ALL_ROLES,
  routeSettlement: ['ADMIN', 'COLLECTIONS'],
  saleDetail: ['ADMIN', 'SELLER', 'COLLECTIONS'],
  salesHistory: ['ADMIN', 'SELLER', 'COLLECTIONS'],
  salesPos: ['ADMIN', 'SELLER'],
  inventory: ['ADMIN', 'WAREHOUSE', 'SELLER'],
  dailyClose: ['ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS'],
} as const satisfies Record<string, readonly KnownRole[]>

export type RouteAccessKey = keyof typeof ROUTE_ACCESS_ROLES

export const ROLE_LABELS: Record<KnownRole | 'UNKNOWN', string> = {
  ADMIN: 'Administración',
  BILLING: 'Facturación',
  SELLER: 'Ventas',
  WAREHOUSE: 'Almacén',
  COLLECTIONS: 'Cobranza',
  DRIVER: 'Reparto',
  UNKNOWN: 'Operación',
}

const KNOWN_ROLE_SET = new Set<string>(KNOWN_ROLES)

export function isKnownRole(role?: UserRole | null): role is KnownRole {
  return Boolean(role && KNOWN_ROLE_SET.has(role))
}

export function getKnownRole(role?: UserRole | null): KnownRole | null {
  return isKnownRole(role) ? role : null
}

export function getRoleLabel(role?: UserRole | null) {
  const knownRole = getKnownRole(role)
  return knownRole ? ROLE_LABELS[knownRole] : ROLE_LABELS.UNKNOWN
}

export function canAccessWithRole(role: UserRole | null | undefined, allowedRoles: readonly KnownRole[]) {
  const knownRole = getKnownRole(role)
  return Boolean(knownRole && allowedRoles.includes(knownRole))
}
