import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ROUTE_ACCESS_ROLES } from '../components/layout/routeAccess'
import {
  ForbiddenPage,
  ChangePasswordPage,
  LoginPage,
  LogoutPage,
  ProtectedRoute,
  RoleRoute,
} from '../features/auth'
import { CustomersPage } from '../features/clientes'
import { AccountsReceivablePage } from '../features/cobranza'
import { PurchaseDetailPage, PurchaseFormPage, PurchasesPage, SuppliersPage } from '../features/compras'
import { DashboardPage } from '../features/dashboard'
import { ReportsPage } from '../features/reportes'
import { ProductListPage } from '../features/inventario'
import { EmployeesPage } from '../features/employees'
import { DeliveryRoutesPage, MyRoutesPage, RouteDetailPage, RouteEvidenceReview, RoutePlannerPage, RouteSettlementView } from '../features/rutas-reparto'
import { SaleDetailPage, SalesHistoryPage, SalesPosPage } from '../features/ventas'
import { BillingRequestDetailPage, BillingRequestsPage } from '../features/billing-requests'
import { BillingReportableNotesPage } from '../features/billing-reportable-notes'
import { BillingRemediationsPage } from '../features/billing-remediations'
import { DailyClosePage } from '../features/cierre-diario'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/logout" element={<LogoutPage />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePasswordPage />
          </ProtectedRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/billing-requests/:id" element={<RoleRoute roles={ROUTE_ACCESS_ROLES.billingRequests}><BillingRequestDetailPage /></RoleRoute>} />
        <Route path="/billing-requests" element={<RoleRoute roles={ROUTE_ACCESS_ROLES.billingRequests}><BillingRequestsPage /></RoleRoute>} />
        <Route path="/billing/reportable-notes" element={<RoleRoute roles={ROUTE_ACCESS_ROLES.billingReportableNotes}><BillingReportableNotesPage /></RoleRoute>} />
        <Route path="/billing/remediations" element={<RoleRoute roles={ROUTE_ACCESS_ROLES.billingRemediations}><BillingRemediationsPage /></RoleRoute>} />
        <Route
          path="/customers"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.customers}>
              <CustomersPage />
            </RoleRoute>
          }
        />
        <Route
          path="/accounts-receivable"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.accountsReceivable}>
              <AccountsReceivablePage />
            </RoleRoute>
          }
        />
        <Route
          path="/sales/history"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.salesHistory}>
              <SalesHistoryPage />
            </RoleRoute>
          }
        />
        <Route
          path="/sales/:saleId"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.saleDetail}>
              <SaleDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="/sales"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.salesPos}>
              <SalesPosPage />
            </RoleRoute>
          }
        />
        <Route
          path="/purchases/suppliers"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.purchaseSuppliers}>
              <SuppliersPage />
            </RoleRoute>
          }
        />
        <Route
          path="/purchases/new"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.purchaseNew}>
              <PurchaseFormPage />
            </RoleRoute>
          }
        />
        <Route
          path="/purchases/:purchaseId"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.purchaseDetail}>
              <PurchaseDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="/purchases"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.purchases}>
              <PurchasesPage />
            </RoleRoute>
          }
        />
        <Route
          path="/my-routes"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.myRoutes}>
              <MyRoutesPage />
            </RoleRoute>
          }
        />
        <Route
          path="/route-settlements/:settlementId"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.routeSettlement}>
              <RouteSettlementView />
            </RoleRoute>
          }
        />
        <Route
          path="/delivery-routes/new"
          element={<RoleRoute roles={ROUTE_ACCESS_ROLES.deliveryRoutePlanner}><RoutePlannerPage /></RoleRoute>}
        />
        <Route
          path="/delivery-routes/:routeId/reoptimize"
          element={<RoleRoute roles={ROUTE_ACCESS_ROLES.deliveryRoutePlanner}><RoutePlannerPage /></RoleRoute>}
        />
        <Route
          path="/delivery-routes/:routeId/evidence"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.deliveryRouteEvidence}>
              <RouteEvidenceReview />
            </RoleRoute>
          }
        />
        <Route
          path="/delivery-routes/:routeId"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.deliveryRouteDetail}>
              <RouteDetailPage />
            </RoleRoute>
          }
        />
        <Route
          path="/delivery-routes"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.deliveryRoutes}>
              <DeliveryRoutesPage />
            </RoleRoute>
          }
        />
        <Route
          path="/daily-close"
          element={<RoleRoute roles={ROUTE_ACCESS_ROLES.dailyClose}><DailyClosePage /></RoleRoute>}
        />
        <Route
          path="/reports"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.reports}>
              <ReportsPage />
            </RoleRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.inventory}>
              <ProductListPage />
            </RoleRoute>
          }
        />
        <Route
          path="/admin/employees"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.admin}>
              <EmployeesPage />
            </RoleRoute>
          }
        />
        <Route index element={<DashboardPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  )
}
