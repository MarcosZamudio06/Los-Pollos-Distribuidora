import { Link } from 'react-router-dom'
import { useAuth } from '../useAuth'

export function ForbiddenPage() {
  const { user } = useAuth()

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f3ee] px-6 py-10 text-[#20211f]">
      <section className="w-full max-w-xl rounded-[2rem] border border-[#20211f]/10 bg-white p-8 shadow-[0_24px_80px_rgba(32,33,31,0.10)]">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-[#9d2d24]">403</p>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.06em]">No tienes acceso a este módulo</h1>
        <p className="mt-4 leading-7 text-[#68645c]">
          Tu sesión está activa{user ? ` como ${user.role}` : ''}, pero este módulo requiere otro permiso.
          Pide a un ADMIN que revise tu rol si necesitas operar aquí.
        </p>
        <Link
          className="mt-8 inline-flex rounded-2xl bg-[#20211f] px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition hover:bg-[#9d2d24] focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/40"
          to="/"
        >
          Volver al inicio
        </Link>
      </section>
    </main>
  )
}
