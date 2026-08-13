import {
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  ClipboardCheck,
  FileCheck2,
  ListChecks,
  History,
  Home,
  MapPinned,
  RadioTower,
  Package,
  Route,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Store,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import {
  ROUTE_ACCESS_ROLES,
  type KnownRole,
  type RouteAccessKey,
} from "./routeAccess";

export type NavigationItemKey =
  | "home"
  | "cedis"
  | "cedis-incoming"
  | "sales"
  | "sales-history"
  | "orders"
  | "customers"
  | "accounts-receivable"
  | "billing-requests"
  | "billing-reportable-notes"
  | "billing-remediations"
  | "inventory"
  | "purchases"
  | "purchase-suppliers"
  | "purchases-new"
  | "my-routes"
  | "fleet-live"
  | "route-planner"
  | "delivery-routes"
  | "reports"
  | "daily-close"
  | "employees"
  | "cash-terminals";

export type NavigationItem = {
  key: NavigationItemKey;
  label: string;
  description: string;
  to: string;
  icon: LucideIcon;
  allowedRoles: readonly KnownRole[];
  routeAccessKey: RouteAccessKey;
  activePaths: readonly string[];
  section: "operations" | "commercial" | "financial" | "admin";
};

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    activePaths: ["/"],
    allowedRoles: ROUTE_ACCESS_ROLES.dashboard,
    routeAccessKey: "dashboard",
    description: "Resumen operativo",
    icon: Home,
    key: "home",
    label: "Inicio",
    section: "operations",
    to: "/",
  },
  {
    activePaths: ["/sales"],
    allowedRoles: ROUTE_ACCESS_ROLES.salesPos,
    routeAccessKey: "salesPos",
    description: "Punto de venta",
    icon: ShoppingCart,
    key: "sales",
    label: "Ventas POS",
    section: "commercial",
    to: "/sales",
  },
  {
    activePaths: ["/cedis"],
    allowedRoles: ROUTE_ACCESS_ROLES.cedis,
    routeAccessKey: "cedis",
    description: "Operación CEDIS y sucursales",
    icon: Warehouse,
    key: "cedis",
    label: "CEDIS",
    section: "operations",
    to: "/cedis",
  },
  {
    activePaths: ["/cedis/incoming"],
    allowedRoles: ROUTE_ACCESS_ROLES.cedisIncoming,
    routeAccessKey: "cedisIncoming",
    description: "Recepción de envíos del CEDIS",
    icon: ClipboardCheck,
    key: "cedis-incoming",
    label: "Recepción CEDIS",
    section: "operations",
    to: "/cedis/incoming",
  },
  {
    activePaths: ["/sales/history", "/sales/"],
    allowedRoles: ROUTE_ACCESS_ROLES.salesHistory,
    routeAccessKey: "salesHistory",
    description: "Consulta de ventas",
    icon: History,
    key: "sales-history",
    label: "Historial de ventas",
    section: "commercial",
    to: "/sales/history",
  },
  {
    activePaths: ["/orders"],
    allowedRoles: ROUTE_ACCESS_ROLES.orders,
    routeAccessKey: "orders",
    description: "Pedidos por sucursal en vivo",
    icon: ClipboardList,
    key: "orders",
    label: "Pedidos",
    section: "operations",
    to: "/orders",
  },
  {
    activePaths: ["/customers"],
    allowedRoles: ROUTE_ACCESS_ROLES.customers,
    routeAccessKey: "customers",
    description: "Cartera comercial",
    icon: Users,
    key: "customers",
    label: "Clientes",
    section: "commercial",
    to: "/customers",
  },
  {
    activePaths: ["/accounts-receivable"],
    allowedRoles: ROUTE_ACCESS_ROLES.accountsReceivable,
    routeAccessKey: "accountsReceivable",
    description: "Cobranza autorizada",
    icon: CircleDollarSign,
    key: "accounts-receivable",
    label: "Cuentas por cobrar",
    section: "financial",
    to: "/accounts-receivable",
  },
  {
    activePaths: ["/billing-requests", "/billing-requests/"],
    allowedRoles: ROUTE_ACCESS_ROLES.billingRequests,
    routeAccessKey: "billingRequests",
    description: "Seguimiento administrativo",
    icon: ClipboardCheck,
    key: "billing-requests",
    label: "Solicitudes de facturación",
    section: "financial",
    to: "/billing-requests",
  },
  {
    activePaths: ["/billing/reportable-notes"],
    allowedRoles: ROUTE_ACCESS_ROLES.billingReportableNotes,
    routeAccessKey: "billingReportableNotes",
    description: "Conciliación documental",
    icon: FileCheck2,
    key: "billing-reportable-notes",
    label: "Notas facturables",
    section: "financial",
    to: "/billing/reportable-notes",
  },
  {
    activePaths: ["/billing/remediations"],
    allowedRoles: ROUTE_ACCESS_ROLES.billingRemediations,
    routeAccessKey: "billingRemediations",
    description: "Integridad de datos contables",
    icon: ListChecks,
    key: "billing-remediations",
    label: "Remediaciones contables",
    section: "financial",
    to: "/billing/remediations",
  },
  {
    activePaths: ["/inventory"],
    allowedRoles: ROUTE_ACCESS_ROLES.inventory,
    routeAccessKey: "inventory",
    description: "Existencias por ubicación",
    icon: Package,
    key: "inventory",
    label: "Inventario",
    section: "operations",
    to: "/inventory",
  },
  {
    activePaths: ["/purchases", "/purchases/"],
    allowedRoles: ROUTE_ACCESS_ROLES.purchases,
    routeAccessKey: "purchases",
    description: "Recepción de compras",
    icon: ShoppingBasket,
    key: "purchases",
    label: "Compras",
    section: "operations",
    to: "/purchases",
  },
  {
    activePaths: ["/purchases/suppliers"],
    allowedRoles: ROUTE_ACCESS_ROLES.purchaseSuppliers,
    routeAccessKey: "purchaseSuppliers",
    description: "Alta de proveedores",
    icon: Store,
    key: "purchase-suppliers",
    label: "Proveedores",
    section: "operations",
    to: "/purchases/suppliers",
  },
  {
    activePaths: ["/purchases/new"],
    allowedRoles: ROUTE_ACCESS_ROLES.purchaseNew,
    routeAccessKey: "purchaseNew",
    description: "Alta de compra",
    icon: ClipboardList,
    key: "purchases-new",
    label: "Nueva compra",
    section: "operations",
    to: "/purchases/new",
  },
  {
    activePaths: ["/delivery-routes/new"],
    allowedRoles: ROUTE_ACCESS_ROLES.deliveryRoutePlanner,
    routeAccessKey: "deliveryRoutePlanner",
    description: "Optimización geoespacial",
    icon: MapPinned,
    key: "route-planner",
    label: "Planificar ruta",
    section: "operations",
    to: "/delivery-routes/new",
  },
  {
    activePaths: ["/my-routes"],
    allowedRoles: ROUTE_ACCESS_ROLES.myRoutes,
    routeAccessKey: "myRoutes",
    description: "Secuencia y entregas asignadas",
    icon: MapPinned,
    key: "my-routes",
    label: "Mi ruta en mapa",
    section: "operations",
    to: "/my-routes",
  },
  {
    activePaths: [
      "/delivery-routes",
      "/delivery-routes/",
      "/route-settlements/",
    ],
    allowedRoles: ROUTE_ACCESS_ROLES.deliveryRoutes,
    routeAccessKey: "deliveryRoutes",
    description: "Operación de reparto",
    icon: Route,
    key: "delivery-routes",
    label: "Reparto / Rutas",
    section: "operations",
    to: "/delivery-routes",
  },
  {
    activePaths: ["/delivery-routes/live"],
    allowedRoles: ROUTE_ACCESS_ROLES.fleetLive,
    routeAccessKey: "fleetLive",
    description: "Unidades y rutas activas en tiempo real",
    icon: RadioTower,
    key: "fleet-live",
    label: "Monitoreo de flota",
    section: "operations",
    to: "/delivery-routes/live",
  },
  {
    activePaths: ["/daily-close"],
    allowedRoles: ROUTE_ACCESS_ROLES.dailyClose,
    routeAccessKey: "dailyClose",
    description: "Conciliación de jornada",
    icon: ClipboardCheck,
    key: "daily-close",
    label: "Cierre diario",
    section: "financial",
    to: "/daily-close",
  },
  {
    activePaths: ["/reports"],
    allowedRoles: ROUTE_ACCESS_ROLES.reports,
    routeAccessKey: "reports",
    description: "Indicadores por rol",
    icon: BarChart3,
    key: "reports",
    label: "Reportes",
    section: "financial",
    to: "/reports",
  },
  {
    activePaths: ["/admin/employees"],
    allowedRoles: ROUTE_ACCESS_ROLES.admin,
    routeAccessKey: "admin",
    description: "Configuración del ERP",
    icon: Settings,
    key: "employees",
    label: "Empleados",
    section: "admin",
    to: "/admin/employees",
  },
  {
    activePaths: ["/admin/cash-terminals"],
    allowedRoles: ROUTE_ACCESS_ROLES.cashTerminals,
    routeAccessKey: "cashTerminals",
    description: "Dispositivos de caja",
    icon: Settings,
    key: "cash-terminals",
    label: "Terminales POS",
    section: "admin",
    to: "/admin/cash-terminals",
  },
];

export const DEFAULT_NAVIGATION_ITEM = NAVIGATION_ITEMS[0];

export const QUICK_ACTION_KEYS = [
  "sales",
  "purchases-new",
  "delivery-routes",
  "reports",
] as const satisfies readonly NavigationItemKey[];

export function getNavigationItemByKey(key: NavigationItemKey) {
  return (
    NAVIGATION_ITEMS.find((item) => item.key === key) ?? DEFAULT_NAVIGATION_ITEM
  );
}
