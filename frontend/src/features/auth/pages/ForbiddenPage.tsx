import { Link } from 'react-router-dom'
import { ArrowLeft, LockKeyhole, ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/ui'
import { useAuth } from '../useAuth'

export function ForbiddenPage() {
  const { user } = useAuth()

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--erp-background)] px-5 py-10 text-[var(--erp-foreground)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_12%,rgba(214,155,45,0.20),transparent_25rem),radial-gradient(circle_at_84%_22%,rgba(182,42,34,0.12),transparent_24rem)]" />

      <Card className="relative w-full max-w-2xl overflow-hidden bg-white/92 shadow-[var(--erp-shadow-elevated)] backdrop-blur">
        <div className="h-1.5 bg-[linear-gradient(90deg,var(--erp-danger),var(--erp-brand-gold),var(--erp-charcoal))]" />
        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[rgba(157,45,36,0.10)] text-[var(--erp-danger)]">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--erp-danger)]">Error 403</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.06em] text-[var(--erp-foreground)]">
                No tienes acceso a este módulo
              </h1>
              <p className="mt-4 max-w-xl leading-7 text-[var(--erp-muted-foreground)]">
                Tu sesión está activa{user ? ` como ${user.role}` : ''}, pero este módulo requiere otro permiso.
                Pide a un ADMIN que revise tu rol si necesitas operar aquí.
              </p>
            </div>
          </div>

          <div className="mt-7 rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--erp-foreground)]">
              <LockKeyhole className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />
              La autorización del módulo se mantiene protegida.
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">
              Esta pantalla solo informa el bloqueo; no cambia permisos ni rutas protegidas.
            </p>
          </div>

          <Link
            className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] px-5 text-sm font-black uppercase tracking-[0.14em] text-white shadow-[0_10px_28px_rgba(182,42,34,0.16)] transition hover:bg-[var(--erp-brand-red-strong)] focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]"
            to="/"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
