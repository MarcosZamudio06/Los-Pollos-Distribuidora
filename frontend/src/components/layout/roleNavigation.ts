import type { UserRole } from '../../features/auth'
import { DEFAULT_NAVIGATION_ITEM, NAVIGATION_ITEMS, QUICK_ACTION_KEYS, type NavigationItem } from './navigation'
import { canAccessWithRole, getKnownRole, getRoleLabel, type KnownRole } from './routeAccess'

export { getRoleLabel }

export function canViewNavigationItem(role: UserRole | null | undefined, item: NavigationItem) {
  return canAccessWithRole(role, item.allowedRoles)
}

export function getNavigationForRole(role?: UserRole | null) {
  if (!getKnownRole(role)) {
    return [DEFAULT_NAVIGATION_ITEM]
  }

  return NAVIGATION_ITEMS.filter((item) => canViewNavigationItem(role, item))
}

export function getQuickActionsForRole(role?: UserRole | null) {
  const visibleItems = getNavigationForRole(role)

  return QUICK_ACTION_KEYS.map((key) => visibleItems.find((item) => item.key === key)).filter(
    (item): item is NavigationItem => Boolean(item),
  )
}

export function getActiveNavigationItem(pathname: string) {
  const matchingItem = [...NAVIGATION_ITEMS]
    .sort((left, right) => right.to.length - left.to.length)
    .find((item) =>
      item.activePaths.some((activePath) => {
        if (activePath === '/') {
          return pathname === '/'
        }

        return pathname === activePath || pathname.startsWith(activePath)
      }),
    )

  return matchingItem ?? DEFAULT_NAVIGATION_ITEM
}

export function getActiveSidebarItemKey(pathname: string) {
  return getActiveNavigationItem(pathname).key
}

export function getSidebarNavForRole(role?: UserRole | null) {
  return getNavigationForRole(role)
}

export type { KnownRole, NavigationItem }
