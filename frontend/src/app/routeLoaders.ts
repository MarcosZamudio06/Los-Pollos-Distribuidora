import { lazy, type ComponentType } from "react";
import type { NavigationItemKey } from "../components/layout/navigation";

type RouteModule = object;

export function createLazyRoute<
  TModule extends RouteModule,
  TExport extends keyof TModule,
>(importer: () => Promise<TModule>, exportName: TExport) {
  type RouteComponent = ComponentType;
  let loadedModule: Promise<{ default: RouteComponent }> | undefined;

  const load = () => {
    loadedModule ??= importer().then((module) => {
      const component = module[exportName];

      if (typeof component !== "function") {
        throw new Error(`Route export "${String(exportName)}" is not a component.`);
      }

      return { default: component as RouteComponent };
    });

    return loadedModule;
  };

  return {
    Component: lazy(load),
    preload: () => load().then(() => undefined),
  };
}

const loginRoute = createLazyRoute(
  () => import("../features/auth/pages/LoginPage"),
  "LoginPage",
);
const logoutRoute = createLazyRoute(
  () => import("../features/auth/pages/LogoutPage"),
  "LogoutPage",
);
const changePasswordRoute = createLazyRoute(
  () => import("../features/auth/pages/ChangePasswordPage"),
  "ChangePasswordPage",
);
const forbiddenRoute = createLazyRoute(
  () => import("../features/auth/pages/ForbiddenPage"),
  "ForbiddenPage",
);
const dashboardRoute = createLazyRoute(
  () => import("../features/dashboard"),
  "DashboardPage",
);
const customersRoute = createLazyRoute(
  () => import("../features/clientes"),
  "CustomersPage",
);
const accountsReceivableRoute = createLazyRoute(
  () => import("../features/cobranza"),
  "AccountsReceivablePage",
);
const purchasesRoute = createLazyRoute(
  () => import("../features/compras"),
  "PurchasesPage",
);
const purchaseFormRoute = createLazyRoute(
  () => import("../features/compras"),
  "PurchaseFormPage",
);
const purchaseDetailRoute = createLazyRoute(
  () => import("../features/compras"),
  "PurchaseDetailPage",
);
const suppliersRoute = createLazyRoute(
  () => import("../features/compras"),
  "SuppliersPage",
);
const reportsRoute = createLazyRoute(
  () => import("../features/reportes"),
  "ReportsPage",
);
const productListRoute = createLazyRoute(
  () => import("../features/inventario"),
  "ProductListPage",
);
const employeesRoute = createLazyRoute(
  () => import("../features/employees"),
  "EmployeesPage",
);
const deliveryRoutesRoute = createLazyRoute(
  () => import("../features/rutas-reparto"),
  "DeliveryRoutesPage",
);
const myRoutesRoute = createLazyRoute(
  () => import("../features/rutas-reparto"),
  "MyRoutesPage",
);
const driverNavigationRoute = createLazyRoute(
  () => import("../features/chofer"),
  "DriverNavigationPage",
);
const fleetLiveRoute = createLazyRoute(
  () => import("../features/fleet"),
  "FleetLivePage",
);
const fleetVehiclesRoute = createLazyRoute(
  () => import("../features/fleet"),
  "FleetVehiclesPage",
);
const routeDetailRoute = createLazyRoute(
  () => import("../features/rutas-reparto"),
  "RouteDetailPage",
);
const routePlannerRoute = createLazyRoute(
  () => import("../features/rutas-reparto"),
  "RoutePlannerPage",
);
const routeEvidenceReviewRoute = createLazyRoute(
  () => import("../features/rutas-reparto"),
  "RouteEvidenceReview",
);
const routeSettlementRoute = createLazyRoute(
  () => import("../features/rutas-reparto"),
  "RouteSettlementView",
);
const salesPosRoute = createLazyRoute(
  () => import("../features/ventas"),
  "SalesPosPage",
);
const salesHistoryRoute = createLazyRoute(
  () => import("../features/ventas"),
  "SalesHistoryPage",
);
const saleDetailRoute = createLazyRoute(
  () => import("../features/ventas"),
  "SaleDetailPage",
);
const billingRequestDetailRoute = createLazyRoute(
  () => import("../features/billing-requests"),
  "BillingRequestDetailPage",
);
const billingRequestsRoute = createLazyRoute(
  () => import("../features/billing-requests"),
  "BillingRequestsPage",
);
const billingReportableNotesRoute = createLazyRoute(
  () => import("../features/billing-reportable-notes"),
  "BillingReportableNotesPage",
);
const billingRemediationsRoute = createLazyRoute(
  () => import("../features/billing-remediations"),
  "BillingRemediationsPage",
);
const dailyCloseRoute = createLazyRoute(
  () => import("../features/cierre-diario"),
  "DailyClosePage",
);
const ordersRoute = createLazyRoute(
  () => import("../features/pedidos"),
  "PedidosPage",
);
const posTerminalsRoute = createLazyRoute(
  () => import("../features/terminales-pos"),
  "PosTerminalsPage",
);
const accessProfilesRoute = createLazyRoute(
  () => import("../features/access-control"),
  "AccessProfilesPage",
);
const cedisBranchDetailRoute = createLazyRoute(
  () => import("../features/cedis"),
  "CedisBranchDetailPage",
);
const cedisBranchCreateRoute = createLazyRoute(
  () => import("../features/cedis"),
  "CedisBranchCreatePage",
);
const cedisDashboardRoute = createLazyRoute(
  () => import("../features/cedis"),
  "CedisDashboardPage",
);
const cedisIncomingSuppliesRoute = createLazyRoute(
  () => import("../features/cedis"),
  "CedisIncomingSuppliesPage",
);
const cedisReturnsRoute = createLazyRoute(
  () => import("../features/cedis"),
  "CedisBranchReturnsPage",
);

export const LoginPage = loginRoute.Component;
export const LogoutPage = logoutRoute.Component;
export const ChangePasswordPage = changePasswordRoute.Component;
export const ForbiddenPage = forbiddenRoute.Component;
export const DashboardPage = dashboardRoute.Component;
export const CustomersPage = customersRoute.Component;
export const AccountsReceivablePage = accountsReceivableRoute.Component;
export const PurchasesPage = purchasesRoute.Component;
export const PurchaseFormPage = purchaseFormRoute.Component;
export const PurchaseDetailPage = purchaseDetailRoute.Component;
export const SuppliersPage = suppliersRoute.Component;
export const ReportsPage = reportsRoute.Component;
export const ProductListPage = productListRoute.Component;
export const EmployeesPage = employeesRoute.Component;
export const DeliveryRoutesPage = deliveryRoutesRoute.Component;
export const MyRoutesPage = myRoutesRoute.Component;
export const DriverNavigationPage = driverNavigationRoute.Component;
export const FleetLivePage = fleetLiveRoute.Component;
export const FleetVehiclesPage = fleetVehiclesRoute.Component;
export const RouteDetailPage = routeDetailRoute.Component;
export const RoutePlannerPage = routePlannerRoute.Component;
export const RouteEvidenceReview = routeEvidenceReviewRoute.Component;
export const RouteSettlementView = routeSettlementRoute.Component;
export const SalesPosPage = salesPosRoute.Component;
export const SalesHistoryPage = salesHistoryRoute.Component;
export const SaleDetailPage = saleDetailRoute.Component;
export const BillingRequestDetailPage = billingRequestDetailRoute.Component;
export const BillingRequestsPage = billingRequestsRoute.Component;
export const BillingReportableNotesPage = billingReportableNotesRoute.Component;
export const BillingRemediationsPage = billingRemediationsRoute.Component;
export const DailyClosePage = dailyCloseRoute.Component;
export const PedidosPage = ordersRoute.Component;
export const PosTerminalsPage = posTerminalsRoute.Component;
export const AccessProfilesPage = accessProfilesRoute.Component;
export const CedisBranchDetailPage = cedisBranchDetailRoute.Component;
export const CedisBranchCreatePage = cedisBranchCreateRoute.Component;
export const CedisDashboardPage = cedisDashboardRoute.Component;
export const CedisIncomingSuppliesPage = cedisIncomingSuppliesRoute.Component;
export const CedisBranchReturnsPage = cedisReturnsRoute.Component;

const navigationPreloaders: Partial<
  Record<NavigationItemKey, () => Promise<void>>
> = {
  home: dashboardRoute.preload,
  sales: salesPosRoute.preload,
  cedis: cedisDashboardRoute.preload,
  "cedis-branch-create": cedisBranchCreateRoute.preload,
  "cedis-incoming": cedisIncomingSuppliesRoute.preload,
  "cedis-returns": cedisReturnsRoute.preload,
  "sales-history": salesHistoryRoute.preload,
  orders: ordersRoute.preload,
  customers: customersRoute.preload,
  "accounts-receivable": accountsReceivableRoute.preload,
  "billing-requests": billingRequestsRoute.preload,
  "billing-reportable-notes": billingReportableNotesRoute.preload,
  "billing-remediations": billingRemediationsRoute.preload,
  inventory: productListRoute.preload,
  purchases: purchasesRoute.preload,
  "purchase-suppliers": suppliersRoute.preload,
  "purchases-new": purchaseFormRoute.preload,
  "my-routes": myRoutesRoute.preload,
  "fleet-live": fleetLiveRoute.preload,
  "fleet-vehicles": fleetVehiclesRoute.preload,
  "route-planner": routePlannerRoute.preload,
  "delivery-routes": deliveryRoutesRoute.preload,
  "daily-close": dailyCloseRoute.preload,
  reports: reportsRoute.preload,
  employees: employeesRoute.preload,
  "cash-terminals": posTerminalsRoute.preload,
};

export function preloadRoute(key: NavigationItemKey) {
  return navigationPreloaders[key]?.() ?? Promise.resolve();
}
