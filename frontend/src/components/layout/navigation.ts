import {
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  History,
  Home,
  MapPinned,
  Package,
  Route,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { ROUTE_ACCESS_ROLES, type KnownRole, type RouteAccessKey } from './routeAccess'

export type NavigationItemKey =
  | 'home'
  | 'sales'
  | 'sales-history'
  | 'customers'
  | 'accounts-receivable'
  | 'inventory'
  | 'purchases'
  | 'purchase-suppliers'
  | 'purchases-new'
  | 'my-routes'
  | 'route-planner'
  | 'delivery-routes'
  | 'reports'
  | 'employees'

export type NavigationItem = {
  key: NavigationItemKey
  label: string
  description: string
  to: string
  icon: LucideIcon
  allowedRoles: readonly KnownRole[]
  routeAccessKey: RouteAccessKey
  activePaths: readonly string[]
  section: 'operations' | 'commercial' | 'financial' | 'admin'
}


export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    activePaths: ['/'],
    allowedRoles: ROUTE_ACCESS_ROLES.dashboard,
    routeAccessKey: 'dashboard',
    description: 'Resumen operativo',
    icon: Home,
    key: 'home',
    label: 'Inicio',
    section: 'operations',
    to: '/',
  },
  {
    activePaths: ['/sales'],
    allowedRoles: ROUTE_ACCESS_ROLES.salesPos,
    routeAccessKey: 'salesPos',
    description: 'Punto de venta',
    icon: ShoppingCart,
    key: 'sales',
    label: 'Ventas POS',
    section: 'commercial',
    to: '/sales',
  },
  {
    activePaths: ['/sales/history', '/sales/'],
    allowedRoles: ROUTE_ACCESS_ROLES.salesHistory,
    routeAccessKey: 'salesHistory',
    description: 'Consulta de ventas',
    icon: History,
    key: 'sales-history',
    label: 'Historial de ventas',
    section: 'commercial',
    to: '/sales/history',
  },
  {
    activePaths: ['/customers'],
    allowedRoles: ROUTE_ACCESS_ROLES.customers,
    routeAccessKey: 'customers',
    description: 'Cartera comercial',
    icon: Users,
    key: 'customers',
    label: 'Clientes',
    section: 'commercial',
    to: '/customers',
  },
  {
    activePaths: ['/accounts-receivable'],
    allowedRoles: ROUTE_ACCESS_ROLES.accountsReceivable,
    routeAccessKey: 'accountsReceivable',
    description: 'Cobranza autorizada',
    icon: CircleDollarSign,
    key: 'accounts-receivable',
    label: 'Cuentas por cobrar',
    section: 'financial',
    to: '/accounts-receivable',
  },
  {
    activePaths: ['/inventory'],
    allowedRoles: ROUTE_ACCESS_ROLES.inventory,
    routeAccessKey: 'inventory',
    description: 'Existencias por ubicación',
    icon: Package,
    key: 'inventory',
    label: 'Inventario',
    section: 'operations',
    to: '/inventory',
  },
  {
    activePaths: ['/purchases', '/purchases/'],
    allowedRoles: ROUTE_ACCESS_ROLES.purchases,
    routeAccessKey: 'purchases',
    description: 'Recepción de compras',
    icon: ShoppingBasket,
    key: 'purchases',
    label: 'Compras',
    section: 'operations',
    to: '/purchases',
  },
  {
    activePaths: ['/purchases/suppliers'],
    allowedRoles: ROUTE_ACCESS_ROLES.purchaseSuppliers,
    routeAccessKey: 'purchaseSuppliers',
    description: 'Alta de proveedores',
    icon: Store,
    key: 'purchase-suppliers',
    label: 'Proveedores',
    section: 'operations',
    to: '/purchases/suppliers',
  },
  {
    activePaths: ['/purchases/new'],
    allowedRoles: ROUTE_ACCESS_ROLES.purchaseNew,
    routeAccessKey: 'purchaseNew',
    description: 'Alta de compra',
    icon: ClipboardList,
    key: 'purchases-new',
    label: 'Nueva compra',
    section: 'operations',
    to: '/purchases/new',
  },
  {
    activePaths: ['/delivery-routes/new'],
    allowedRoles: ROUTE_ACCESS_ROLES.deliveryRoutePlanner,
    routeAccessKey: 'deliveryRoutePlanner',
    description: 'Optimización geoespacial',
    icon: MapPinned,
    key: 'route-planner',
    label: 'Planificar ruta',
    section: 'operations',
    to: '/delivery-routes/new',
  },
  {
    activePaths: ['/my-routes'],
    allowedRoles: ROUTE_ACCESS_ROLES.myRoutes,
    routeAccessKey: 'myRoutes',
    description: 'Secuencia y entregas asignadas',
    icon: MapPinned,
    key: 'my-routes',
    label: 'Mi ruta en mapa',
    section: 'operations',
    to: '/my-routes',
  },
  {
    activePaths: ['/delivery-routes', '/delivery-routes/', '/route-settlements/'],
    allowedRoles: ROUTE_ACCESS_ROLES.deliveryRoutes,
    routeAccessKey: 'deliveryRoutes',
    description: 'Operación de reparto',
    icon: Route,
    key: 'delivery-routes',
    label: 'Reparto / Rutas',
    section: 'operations',
    to: '/delivery-routes',
  },
  {
    activePaths: ['/reports'],
    allowedRoles: ROUTE_ACCESS_ROLES.reports,
    routeAccessKey: 'reports',
    description: 'Indicadores por rol',
    icon: BarChart3,
    key: 'reports',
    label: 'Reportes',
    section: 'financial',
    to: '/reports',
  },
  {
    activePaths: ['/admin/employees'],
    allowedRoles: ROUTE_ACCESS_ROLES.admin,
    routeAccessKey: 'admin',
    description: 'Configuración del ERP',
    icon: Settings,
    key: 'employees',
    label: 'Empleados',
    section: 'admin',
    to: '/admin/employees',
  },
]

export const DEFAULT_NAVIGATION_ITEM = NAVIGATION_ITEMS[0]

export const QUICK_ACTION_KEYS = ['sales', 'purchases-new', 'delivery-routes', 'reports'] as const satisfies readonly NavigationItemKey[]

export function getNavigationItemByKey(key: NavigationItemKey) {
  return NAVIGATION_ITEMS.find((item) => item.key === key) ?? DEFAULT_NAVIGATION_ITEM
}
