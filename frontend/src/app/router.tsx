import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ROUTE_ACCESS_ROLES } from '../components/layout/routeAccess'
import {
  ForbiddenPage,
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
import { DeliveryRoutesPage, MyRoutesPage, RouteDetailPage, RouteEvidenceReview, RouteSettlementView } from '../features/rutas-reparto'
import { SaleDetailPage, SalesHistoryPage, SalesPosPage } from '../features/ventas'

function AdminOnlyPage() {
  return (
    <section className="flex min-h-full items-center justify-center px-6 py-10 text-[#20211f]">
      <div className="w-full max-w-xl rounded-[2rem] border border-[#20211f]/10 bg-white p-8 shadow-[0_24px_80px_rgba(32,33,31,0.10)]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#39798b]">ADMIN</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.06em]">Ruta administrativa protegida</h1>
        <p className="mt-4 leading-7 text-[#68645c]">
          Esta pantalla existe para validar RoleRoute antes de construir módulos administrativos reales.
        </p>
        <Link className="mt-8 inline-flex font-bold text-[#9d2d24]" to="/">
          Volver al centro operativo
        </Link>
      </div>
    </section>
  )
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/logout" element={<LogoutPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/403" element={<ForbiddenPage />} />
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
          path="/admin"
          element={
            <RoleRoute roles={ROUTE_ACCESS_ROLES.admin}>
              <AdminOnlyPage />
            </RoleRoute>
          }
        />
        <Route index element={<DashboardPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  )
}
