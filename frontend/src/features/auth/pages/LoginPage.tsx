import { useState, type FormEvent } from 'react'
import {
  AlertCircle,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Alert, Button, Card, CardContent, Input } from '@/components/ui'
import { useAuth } from '../useAuth'

type LocationState = {
  from?: {
    pathname?: string
  }
}

export function LoginPage() {
  const { error, isAuthenticated, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const state = location.state as LocationState | null
  const nextPath = state?.from?.pathname ?? '/'

  if (isAuthenticated) {
    return <Navigate replace to={nextPath} />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    try {
      await login({ email, password })
      navigate(nextPath, { replace: true })
    } catch {
      setFormError('Revisa tu correo y contraseña. Si el usuario está inactivo, pide reactivación a un ADMIN.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeError = formError ?? error

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--erp-background)] text-[var(--erp-foreground)]">
      <section className="relative grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_12%,rgba(214,155,45,0.20),transparent_26rem),radial-gradient(circle_at_92%_16%,rgba(182,42,34,0.12),transparent_24rem)]" />

        <div className="relative hidden overflow-hidden bg-[var(--erp-charcoal)] p-10 text-white lg:block">
          <div className="absolute inset-y-0 right-0 w-28 bg-[repeating-linear-gradient(90deg,rgba(182,42,34,0.92)_0_10px,rgba(214,155,45,0.92)_10px_16px,rgba(17,24,21,0.88)_16px_30px)] opacity-80" />
          <div className="absolute -left-24 top-20 h-72 w-72 rounded-full bg-[rgba(214,155,45,0.16)] blur-3xl" />
          <div className="relative flex h-full max-w-xl flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-soft)]">
                <ShieldCheck className="h-4 w-4" />
                Acceso operativo
              </div>
              <h1 className="mt-8 max-w-lg text-5xl font-black leading-[0.94] tracking-[-0.07em] text-white">
                Control diario para una operación sin puntos ciegos.
              </h1>
              <p className="mt-5 max-w-md text-base leading-7 text-white/68">
                Ventas, inventario, cobranza y reparto bajo una sesión segura del ERP.
              </p>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-[28rem]">
            <div className="mb-8 lg:hidden">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--erp-danger)]">
                Pollos Distribuidora
              </p>
              <h1 className="mt-3 text-4xl font-black leading-none tracking-[-0.06em] text-[var(--erp-foreground)]">
                Acceso operativo
              </h1>
            </div>

            <Card className="relative overflow-hidden border-[color:var(--erp-border)] bg-white/92 p-0 shadow-[var(--erp-shadow-elevated)] backdrop-blur">
              <div className="h-1.5 bg-[linear-gradient(90deg,var(--erp-brand-red),var(--erp-brand-gold),var(--erp-charcoal))]" />
              <CardContent className="p-6 sm:p-8">
                <form onSubmit={handleSubmit}>
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(182,42,34,0.10)] text-[var(--erp-danger)]">
                    <LockKeyhole className="h-6 w-6" />
                  </div>
                  <p className="mt-6 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-danger)]">
                    Iniciar sesión
                  </p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.055em] text-[var(--erp-foreground)]">
                    Identifica tu turno
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[var(--erp-muted-foreground)]">
                    Usa tu correo interno. El sistema validará tu estado activo y permisos.
                  </p>

                  <div className="mt-8 grid gap-5">
                    <label
                      className="grid gap-2 text-sm font-bold text-[var(--erp-foreground)]"
                      htmlFor="email"
                    >
                      Correo
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-muted-foreground)]" />
                        <Input
                          aria-describedby={activeError ? 'login-error' : undefined}
                          aria-invalid={Boolean(activeError)}
                          autoComplete="email"
                          className="h-12 rounded-2xl bg-[var(--erp-surface)] pl-10 text-base"
                          id="email"
                          onChange={(event) => setEmail(event.target.value)}
                          required
                          type="email"
                          value={email}
                        />
                      </div>
                    </label>

                    <label
                      className="grid gap-2 text-sm font-bold text-[var(--erp-foreground)]"
                      htmlFor="password"
                    >
                      Contraseña
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-muted-foreground)]" />
                        <Input
                          aria-describedby={activeError ? 'login-error' : undefined}
                          aria-invalid={Boolean(activeError)}
                          autoComplete="current-password"
                          className="h-12 rounded-2xl bg-[var(--erp-surface)] pl-10 pr-11 text-base"
                          id="password"
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                        />
                        <button
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[var(--erp-muted-foreground)] transition hover:bg-[var(--erp-surface-muted)] hover:text-[var(--erp-foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
                          onClick={() => setShowPassword((value) => !value)}
                          type="button"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </label>
                  </div>

                  {activeError && (
                    <Alert
                      className="mt-5 flex gap-3 text-sm font-semibold"
                      id="login-error"
                      role="alert"
                      tone="error"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{activeError}</span>
                    </Alert>
                  )}

                  <Button
                    className="mt-7 h-12 w-full rounded-2xl text-sm font-black uppercase tracking-[0.14em]"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? 'Validando acceso' : 'Entrar al sistema'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </main>
  )
}
