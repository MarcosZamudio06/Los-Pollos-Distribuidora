import { Link, Navigate, Route, Routes } from 'react-router-dom'
import {
  ForbiddenPage,
  LoginPage,
  LogoutPage,
  ProtectedRoute,
  RoleRoute,
} from '../features/auth'
import { CustomersPage } from '../features/clientes'
import { AccountsReceivablePage } from '../features/cobranza'
import { PurchaseDetailPage, PurchaseFormPage, PurchasesPage } from '../features/compras'
import { DashboardPage } from '../features/dashboard'
import { ReportsPage } from '../features/reportes'
import { ProductListPage } from '../features/inventario'
import { DeliveryRoutesPage, MyRoutesPage, RouteDetailPage, RouteEvidenceReview, RouteSettlementView } from '../features/rutas-reparto'
import { SaleDetailPage, SalesHistoryPage, SalesPosPage } from '../features/ventas'

function AdminOnlyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] px-6 py-10 text-[#20211f]">
      <section className="w-full max-w-xl rounded-[2rem] border border-[#20211f]/10 bg-white p-8 shadow-[0_24px_80px_rgba(32,33,31,0.10)]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#39798b]">ADMIN</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.06em]">Ruta administrativa protegida</h1>
        <p className="mt-4 leading-7 text-[#68645c]">
          Esta pantalla existe para validar RoleRoute antes de construir módulos administrativos reales.
        </p>
        <Link className="mt-8 inline-flex font-bold text-[#9d2d24]" to="/">
          Volver al centro operativo
        </Link>
      </section>
    </main>
  )
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/logout" element={<LogoutPage />} />
      <Route
        path="/403"
        element={
          <ProtectedRoute>
            <ForbiddenPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/customers"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'SELLER', 'COLLECTIONS']}>
              <CustomersPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounts-receivable"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'COLLECTIONS', 'SELLER']}>
              <AccountsReceivablePage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales/history"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'SELLER', 'COLLECTIONS']}>
              <SalesHistoryPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales/:saleId"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'SELLER', 'COLLECTIONS']}>
              <SaleDetailPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'SELLER']}>
              <SalesPosPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases/new"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'WAREHOUSE']}>
              <PurchaseFormPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases/:purchaseId"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'WAREHOUSE']}>
              <PurchaseDetailPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'WAREHOUSE']}>
              <PurchasesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-routes"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['DRIVER']}>
              <MyRoutesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/route-settlements/:settlementId"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'COLLECTIONS']}>
              <RouteSettlementView />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery-routes/:routeId/evidence"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'COLLECTIONS', 'WAREHOUSE']}>
              <RouteEvidenceReview />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery-routes/:routeId"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'COLLECTIONS', 'WAREHOUSE']}>
              <RouteDetailPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/delivery-routes"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'COLLECTIONS', 'WAREHOUSE']}>
              <DeliveryRoutesPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'SELLER', 'WAREHOUSE', 'COLLECTIONS', 'DRIVER']}>
              <ReportsPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN', 'WAREHOUSE', 'SELLER']}>
              <ProductListPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <RoleRoute roles={['ADMIN']}>
              <AdminOnlyPage />
            </RoleRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
