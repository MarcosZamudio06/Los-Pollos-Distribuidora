import { Link, Navigate, Route, Routes } from 'react-router-dom'
import {
  ForbiddenPage,
  LoginPage,
  LogoutPage,
  ProtectedRoute,
  RoleRoute,
  useAuth,
} from '../features/auth'
import { CustomersPage } from '../features/clientes'
import { AccountsReceivablePage } from '../features/cobranza'
import { PurchaseDetailPage, PurchaseFormPage, PurchasesPage } from '../features/compras'
import { ProductListPage } from '../features/inventario'
import { SaleDetailPage, SalesHistoryPage, SalesPosPage } from '../features/ventas'

function OperationsHomePage() {
  const { user } = useAuth()

  return (
    <main className="min-h-screen bg-[#f5f3ee] px-6 py-8 text-[#20211f] sm:px-10">
      <section className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-[#20211f]/10 bg-white p-6 shadow-[0_24px_80px_rgba(32,33,31,0.08)] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#9d2d24]">
              Pollos Distribuidor
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.06em]">
              Centro operativo
            </h1>
            <p className="mt-2 text-sm text-[#68645c]">
              Sesión activa para {user?.name}. Rol: {user?.role}.
            </p>
          </div>
          <Link
            className="rounded-2xl border border-[#20211f]/15 px-5 py-3 text-center text-sm font-bold uppercase tracking-[0.16em] transition hover:border-[#9d2d24] hover:text-[#9d2d24] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/40"
            to="/logout"
          >
            Cerrar sesión
          </Link>
        </header>

        {user?.mustChangePassword && (
          <aside className="rounded-[1.5rem] border border-[#d43f2f]/25 bg-[#d43f2f]/8 p-5 text-[#9d2d24]">
            <p className="font-bold">Cambio de contraseña requerido</p>
            <p className="mt-1 text-sm">
              Completa el cambio de contraseña antes de operar módulos normales.
            </p>
          </aside>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          <article className="rounded-[1.75rem] bg-[#20211f] p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#f0b44c]">Caja</p>
            <h2 className="mt-4 text-2xl font-black tracking-[-0.04em]">Turno protegido</h2>
            <p className="mt-3 text-sm leading-6 text-white/70">
              La ruta principal ya exige sesión válida antes de mostrar operación.
            </p>
          </article>
          <article className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#39798b]">Roles</p>
            <h2 className="mt-4 text-2xl font-black tracking-[-0.04em]">ADMIN controlado</h2>
            <p className="mt-3 text-sm leading-6 text-[#68645c]">
              La ruta de administración valida rol y manda a 403 cuando no corresponde.
            </p>
            <div className="mt-5 flex flex-wrap gap-4">
              <Link className="inline-flex font-bold text-[#9d2d24]" to="/admin">
                Probar ruta ADMIN
              </Link>
              <Link className="inline-flex font-bold text-[#39798b]" to="/inventory">
                Abrir inventario
              </Link>
              <Link className="inline-flex font-bold text-[#9d2d24]" to="/sales">
                Abrir ventas
              </Link>
              {(user?.role === 'ADMIN' || user?.role === 'WAREHOUSE') && (
                <Link className="inline-flex font-bold text-[#39798b]" to="/purchases">
                  Abrir compras
                </Link>
              )}
              <Link className="inline-flex font-bold text-[#39798b]" to="/sales/history">
                Historial de ventas
              </Link>
            </div>
          </article>
          <article className="rounded-[1.75rem] border border-[#20211f]/10 bg-white p-6">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#9d2d24]">Clientes</p>
            <h2 className="mt-4 text-2xl font-black tracking-[-0.04em]">Cartera controlada</h2>
            <p className="mt-3 text-sm leading-6 text-[#68645c]">
              Consulta clientes, crédito y perfil administrativo sin mezclarlo con CFDI.
            </p>
            <div className="mt-5 flex flex-wrap gap-4">
              <Link className="inline-flex font-bold text-[#9d2d24]" to="/customers">
                Abrir clientes
              </Link>
              {(user?.role === 'ADMIN' || user?.role === 'COLLECTIONS' || user?.role === 'SELLER') && (
                <Link className="inline-flex font-bold text-[#39798b]" to="/accounts-receivable">
                  Abrir cobranza
                </Link>
              )}
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}

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
            <OperationsHomePage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
