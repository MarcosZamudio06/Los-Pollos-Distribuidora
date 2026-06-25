import { Navigate, Route, Routes } from 'react-router-dom'

function BootstrapHomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-10 text-slate-900">
      <section className="w-full max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
          Pollos Distribuidor
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Frontend bootstrap ready
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
          The base router, query client, HTTP wrapper, and Tailwind pipeline are
          in place. Feature screens will be added later from their specs.
        </p>
      </section>
    </main>
  )
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<BootstrapHomePage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
