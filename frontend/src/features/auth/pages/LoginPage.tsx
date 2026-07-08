import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
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

  return (
    <main className="min-h-screen bg-[#f5f3ee] text-[#20211f]">
      <section className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-[#20211f] p-10 text-[#f5f3ee] lg:block">
          <div className="absolute inset-y-0 right-0 w-24 bg-[repeating-linear-gradient(90deg,#d43f2f_0_10px,#f0b44c_10px_16px,#20211f_16px_30px)] opacity-90" />
          <div className="relative flex h-full max-w-xl flex-col justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#f0b44c]">
                Acceso operativo
              </p>
            </div>
            <div className="rounded-[2rem] border border-[#f5f3ee]/15 bg-[#f5f3ee]/8 p-6 backdrop-blur">
              <p className="mt-3 text-2xl font-semibold leading-tight">
                Bienvenido a El Pollo de los pollos
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-6 py-12 sm:px-10">
          <div className="w-full max-w-md">
            <div className="mb-10 lg:hidden">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#9d2d24]">
                Pollos Distribuidor
              </p>
              <h1 className="mt-3 text-4xl font-black leading-none tracking-[-0.06em]">
                Acceso operativo
              </h1>
            </div>

            <form
              className="rounded-[2rem] border border-[#20211f]/10 bg-white p-7 shadow-[0_24px_80px_rgba(32,33,31,0.12)] sm:p-8"
              onSubmit={handleSubmit}
            >
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#9d2d24]">
                Iniciar sesión
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-[#20211f]">
                Identifica tu turno
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#68645c]">
                Usa tu correo interno. El sistema validará tu estado activo y permisos.
              </p>

              <label className="mt-8 block text-sm font-semibold text-[#20211f]" htmlFor="email">
                Correo
              </label>
              <input
                autoComplete="email"
                className="mt-2 w-full rounded-2xl border border-[#d7d1c5] bg-[#fbfaf7] px-4 py-3 text-base outline-none transition focus:border-[#9d2d24] focus:ring-4 focus:ring-[#d43f2f]/15"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />

              <label className="mt-5 block text-sm font-semibold text-[#20211f]" htmlFor="password">
                Contraseña
              </label>
              <input
                autoComplete="current-password"
                className="mt-2 w-full rounded-2xl border border-[#d7d1c5] bg-[#fbfaf7] px-4 py-3 text-base outline-none transition focus:border-[#9d2d24] focus:ring-4 focus:ring-[#d43f2f]/15"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />

              {(formError || error) && (
                <p className="mt-5 rounded-2xl border border-[#d43f2f]/25 bg-[#d43f2f]/8 px-4 py-3 text-sm font-medium text-[#9d2d24]">
                  {formError ?? error}
                </p>
              )}

              <button
                className="mt-7 w-full rounded-2xl bg-[#20211f] px-5 py-3.5 text-sm font-bold uppercase tracking-[0.16em] text-white transition hover:bg-[#9d2d24] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/40 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'Validando acceso' : 'Entrar al sistema'}
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
