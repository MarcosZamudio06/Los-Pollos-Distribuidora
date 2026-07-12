import { useEffect, useMemo, useState } from 'react'
import { Copy, Search, ShieldCheck, UserPlus } from 'lucide-react'
import { useAuth } from '../auth'
import { apiClient } from '../../lib/api'
import { Button, Input, Select } from '../../components/ui'

type Role = { id: string; name: string; description?: string | null }
type Location = { id: string; name: string; type: string; isActive: boolean }
type Employee = { id: string; controlNumber: string; name: string; email: string; phone: string; isActive: boolean; role: Role; operationalLocation: Location }
type ListData = { items: Employee[]; total: number; page: number; limit: number }
type Envelope<T> = { data: T }

const usableLocationTypes = new Set(['BRANCH', 'MIXED', 'EXTERNAL_POINT_OF_SALE'])

function authHeaders(token?: string | null): Record<string, string> { return token ? { authorization: `Bearer ${token}` } : {} }

export function EmployeesPage() {
  const { accessToken } = useAuth()
  const [employees, setEmployees] = useState<ListData>({ items: [], total: 0, page: 1, limit: 20 })
  const [roles, setRoles] = useState<Role[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [search, setSearch] = useState('')
  const [roleId, setRoleId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [status, setStatus] = useState('active')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [credentials, setCredentials] = useState<{ controlNumber: string; email: string; temporaryPassword: string } | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', roleId: '', operationalLocationId: '' })
  const headers = useMemo(() => authHeaders(accessToken), [accessToken])

  async function load() {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', status })
      if (search) params.set('search', search); if (roleId) params.set('roleId', roleId); if (locationId) params.set('operationalLocationId', locationId)
      const [listed, roleResponse, locationResponse] = await Promise.all([
        apiClient.get<Envelope<ListData>>(`/users?${params}`, { headers }),
        apiClient.get<Envelope<Role[]>>('/roles', { headers }),
        apiClient.get<Envelope<{ items: Location[] }>>('/locations?isActive=true&limit=100', { headers }),
      ])
      setEmployees(listed.data); setRoles(roleResponse.data); setLocations(locationResponse.data.items.filter((location) => usableLocationTypes.has(location.type)))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo cargar la administración de empleados.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [accessToken, roleId, locationId, status, page])
  useEffect(() => { setPage(1) }, [search, roleId, locationId, status])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setCreating(true); setError('')
    try {
      const response = await apiClient.post<Envelope<Employee & { temporaryPassword: string }>, typeof form>('/users', { body: form, headers })
      setCredentials(response.data); setForm({ name: '', email: '', phone: '', roleId: '', operationalLocationId: '' }); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo registrar el empleado.') }
    finally { setCreating(false) }
  }
  async function copyCredentials() { if (credentials) await navigator.clipboard.writeText(`Número de control: ${credentials.controlNumber}\nCorreo: ${credentials.email}\nContraseña temporal: ${credentials.temporaryPassword}`) }

  return <main className="min-h-full bg-[var(--erp-background)] p-4 text-[var(--erp-foreground)] sm:p-6 lg:p-8">
    <div className="mx-auto grid max-w-7xl gap-6">
      <header className="overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] bg-[var(--erp-charcoal)] p-6 text-white shadow-[var(--erp-shadow-elevated)] sm:p-8"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[var(--erp-brand-gold-soft)]"><ShieldCheck className="h-4 w-4"/> Control de acceso</p><h1 className="mt-4 text-3xl font-black tracking-[-.05em] sm:text-4xl">Administración de empleados</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Alta controlada de personal operativo con credenciales temporales de un solo uso.</p></div><div className="rounded-2xl border border-white/15 bg-white/5 px-5 py-4"><p className="text-xs uppercase tracking-[.16em] text-white/55">Personal registrado</p><p className="mt-1 text-3xl font-black text-[var(--erp-brand-gold-soft)]">{employees.total}</p></div></div></header>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.8fr)]">
        <div className="grid gap-5"><section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-4 shadow-[var(--erp-shadow)]"><div className="grid gap-3 md:grid-cols-4"><label className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--erp-muted-foreground)]"/><Input className="pl-9" placeholder="Buscar control, nombre, correo o teléfono" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load() }}/></label><Select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Todos los puntos de venta</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Select value={roleId} onChange={(event) => setRoleId(event.target.value)}><option value="">Todos los roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></Select><Button variant="secondary" onClick={() => void load()}>Aplicar filtros</Button></div></section>
          {error && <p role="alert" className="rounded-xl border border-[rgba(157,45,36,.3)] bg-[rgba(157,45,36,.08)] p-4 text-sm font-semibold text-[var(--erp-danger)]">{error}</p>}
          <section className="overflow-hidden rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow)]"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-xs uppercase tracking-[.12em] text-[var(--erp-muted-foreground)]"><tr>{['Control','Empleado','Teléfono','Punto de venta','Rol','Estado'].map((label) => <th className="px-4 py-3 font-bold" key={label}>{label}</th>)}</tr></thead><tbody>{loading ? <tr><td className="p-8 text-center text-[var(--erp-muted-foreground)]" colSpan={6}>Cargando empleados…</td></tr> : employees.items.length === 0 ? <tr><td className="p-8 text-center text-[var(--erp-muted-foreground)]" colSpan={6}>No hay empleados para estos filtros.</td></tr> : employees.items.map((employee) => <tr className="border-b border-[color:var(--erp-border)] last:border-0 hover:bg-[var(--erp-surface)]" key={employee.id}><td className="px-4 py-4 font-mono text-xs font-bold">{employee.controlNumber}</td><td className="px-4 py-4"><p className="font-bold">{employee.name}</p><p className="text-xs text-[var(--erp-muted-foreground)]">{employee.email}</p></td><td className="px-4 py-4">{employee.phone}</td><td className="px-4 py-4">{employee.operationalLocation.name}</td><td className="px-4 py-4">{employee.role.name}</td><td className="px-4 py-4"><span className={employee.isActive ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800' : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600'}>{employee.isActive ? 'Activo' : 'Inactivo'}</span></td></tr>)}</tbody></table></div><footer className="flex items-center justify-between border-t border-[color:var(--erp-border)] px-4 py-3 text-xs text-[var(--erp-muted-foreground)]"><span>Página {employees.page} de {Math.max(1, Math.ceil(employees.total / employees.limit))} · {employees.total} empleados</span><div className="flex gap-2"><Button size="sm" variant="secondary" disabled={loading || page <= 1} onClick={() => setPage((current) => current - 1)}>Anterior</Button><Button size="sm" variant="secondary" disabled={loading || page >= Math.ceil(employees.total / employees.limit)} onClick={() => setPage((current) => current + 1)}>Siguiente</Button></div></footer></section>
        </div>
        <form className="h-fit rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 shadow-[var(--erp-shadow)]" onSubmit={submit}><div className="flex items-center gap-3"><span className="rounded-xl bg-[rgba(182,42,34,.08)] p-2 text-[var(--erp-brand-red)]"><UserPlus className="h-5 w-5"/></span><div><h2 className="font-black">Registrar empleado</h2><p className="text-xs text-[var(--erp-muted-foreground)]">Se asigna una contraseña temporal segura.</p></div></div><div className="mt-5 grid gap-4">{[['name','Nombre completo','text'],['email','Correo electrónico','email'],['phone','Teléfono','tel']].map(([key,label,type]) => <label className="grid gap-1.5 text-sm font-semibold" key={key}>{label}<Input required type={type} value={form[key as keyof typeof form]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}/></label>)}<label className="grid gap-1.5 text-sm font-semibold">Rol<Select required value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}><option value="">Selecciona un rol</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</Select></label><label className="grid gap-1.5 text-sm font-semibold">Punto de venta<Select required value={form.operationalLocationId} onChange={(event) => setForm({ ...form, operationalLocationId: event.target.value })}><option value="">Selecciona un punto de venta</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select></label><Button disabled={creating} size="lg" type="submit">{creating ? 'Registrando…' : 'Registrar empleado'}</Button></div></form>
      </section>
    </div>
    {credentials && <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog"><section className="w-full max-w-md rounded-[1.5rem] border border-[var(--erp-brand-gold)] bg-white p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--erp-brand-red)]">Entrega única de credenciales</p><h2 className="mt-3 text-2xl font-black">Empleado registrado</h2><p className="mt-2 text-sm text-[var(--erp-muted-foreground)]">Guarda estos datos ahora. La contraseña no volverá a mostrarse y deberá cambiarse al iniciar sesión.</p><dl className="mt-5 grid gap-3 rounded-xl bg-[var(--erp-surface-muted)] p-4 text-sm"><div><dt className="text-xs text-[var(--erp-muted-foreground)]">Número de control</dt><dd className="font-mono font-bold">{credentials.controlNumber}</dd></div><div><dt className="text-xs text-[var(--erp-muted-foreground)]">Correo</dt><dd className="font-semibold">{credentials.email}</dd></div><div><dt className="text-xs text-[var(--erp-muted-foreground)]">Contraseña temporal</dt><dd className="font-mono font-bold break-all">{credentials.temporaryPassword}</dd></div></dl><div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => void copyCredentials()}><Copy className="h-4 w-4"/> Copiar</Button><Button onClick={() => setCredentials(null)}>Entendido</Button></div></section></div>}
  </main>
}
