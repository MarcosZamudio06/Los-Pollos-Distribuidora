import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui'
import { useAuth } from '../useAuth'
import type { PropsWithChildren } from 'react'

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { isAuthenticated, status } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  if (status === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] text-[#20211f]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9d2d24]">
          Verificando sesión
        </p>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50 sm:right-6 sm:top-6">
        <Button
          aria-label="Cerrar sesión"
          className="shadow-[0_14px_40px_rgba(32,33,31,0.18)]"
          onClick={() => navigate('/logout')}
          variant="secondary"
        >
          Cerrar sesión
        </Button>
      </div>
      {children}
    </>
  )
}
