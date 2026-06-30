import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../useAuth'
import type { PropsWithChildren } from 'react'

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { isAuthenticated, status } = useAuth()
  const location = useLocation()

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

  return children
}
