import { Navigate, useLocation } from 'react-router-dom'
import { LoaderCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../useAuth'
import type { PropsWithChildren } from 'react'

export function ProtectedRoute({ children }: PropsWithChildren) {
  const { isAuthenticated, status } = useAuth()
  const location = useLocation()

  if (status === 'checking') {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--erp-background)] px-6 text-[var(--erp-foreground)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(214,155,45,0.20),transparent_22rem),radial-gradient(circle_at_70%_70%,rgba(182,42,34,0.10),transparent_20rem)]" />
        <section
          aria-live="polite"
          className="relative w-full max-w-sm rounded-[1.75rem] border border-[color:var(--erp-border)] bg-white/90 p-7 text-center shadow-[var(--erp-shadow-elevated)] backdrop-blur"
          role="status"
        >
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[rgba(214,155,45,0.14)] text-[var(--erp-brand-gold-deep)]">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-[var(--erp-danger)]">
            Verificando sesión
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--erp-muted-foreground)]">
            Confirmando acceso y estado activo antes de abrir el ERP.
          </p>
          <LoaderCircle
            aria-hidden="true"
            className="mx-auto mt-5 h-5 w-5 animate-spin text-[var(--erp-danger)]"
          />
        </section>
      </main>
    )
  }

  if (!isAuthenticated) {
    return <Navigate replace state={{ from: location }} to="/login" />
  }

  return children
}
