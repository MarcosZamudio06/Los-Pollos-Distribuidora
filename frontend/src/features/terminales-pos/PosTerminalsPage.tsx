import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, Copy, Link2, Monitor, Plus, Power, PowerOff, RefreshCw } from 'lucide-react'
import { apiClient } from '../../lib/api'
import { getPosDeviceIdentity } from '../../lib/deviceIdentity'
import { Button, Input, Select } from '../../components/ui'
import { useAuth } from '../auth'

type Envelope<T> = { data: T }
type Location = { id: string; name: string; code?: string | null; type: string; isActive: boolean }
type Terminal = {
  id: string
  operationalLocationId: string
  code: string
  name: string
  deviceId: string
  isActive: boolean
}

const usableLocationTypes = new Set(['BRANCH', 'MIXED', 'EXTERNAL_POINT_OF_SALE'])
const headers = (token?: string | null): Record<string, string> => token ? { authorization: `Bearer ${token}` } : {}

function locationName(terminal: Terminal, locations: Location[]) {
  return locations.find((location) => location.id === terminal.operationalLocationId)?.name ?? 'Sucursal no disponible'
}

export function PosTerminalsPage() {
  const { accessToken } = useAuth()
  const [identity] = useState(getPosDeviceIdentity)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState('active')
  const [locationId, setLocationId] = useState('')
  const [reassigning, setReassigning] = useState<Terminal | null>(null)
  const [replacementDeviceId, setReplacementDeviceId] = useState('')
  const [form, setForm] = useState({ operationalLocationId: '', code: '', name: '', deviceId: identity.id })

  const terminalCatalog = useQuery({
    queryKey: ['cash-terminals', accessToken],
    queryFn: async () => {
      const [terminalResponse, locationResponse] = await Promise.all([
        apiClient.get<Envelope<Terminal[]>>('/cash-terminals', { headers: headers(accessToken) }),
        apiClient.get<Envelope<{ items: Location[] }>>('/locations?isActive=true&limit=100', { headers: headers(accessToken) }),
      ])
      return { terminals: terminalResponse.data, locations: locationResponse.data.items.filter((location) => usableLocationTypes.has(location.type)) }
    },
  })
  const terminals = terminalCatalog.data?.terminals ?? []
  const locations = terminalCatalog.data?.locations ?? []
  const error = actionError || (terminalCatalog.error instanceof Error ? terminalCatalog.error.message : '')

  async function registerTerminal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.operationalLocationId || !form.code.trim() || !form.name.trim() || !form.deviceId.trim()) {
      setActionError('Completa sucursal, código, nombre e identidad del dispositivo.')
      return
    }
    setSaving(true)
    setActionError('')
    setNotice('')
    try {
      await apiClient.post<Envelope<Terminal>, typeof form>('/cash-terminals', { body: { ...form, code: form.code.trim(), name: form.name.trim(), deviceId: form.deviceId.trim() }, headers: headers(accessToken) })
      setForm({ operationalLocationId: '', code: '', name: '', deviceId: identity.id })
      setNotice('Terminal registrada y lista para abrir turnos en la sucursal asignada.')
      await terminalCatalog.refetch()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'No se pudo registrar la terminal.')
    } finally {
      setSaving(false)
    }
  }

  async function updateTerminal(terminal: Terminal, values: Partial<Pick<Terminal, 'deviceId' | 'isActive'>>) {
    setSaving(true)
    setActionError('')
    setNotice('')
    try {
      await apiClient.patch<Envelope<Terminal>, typeof values>(`/cash-terminals/${terminal.id}`, { body: values, headers: headers(accessToken) })
      setNotice(values.deviceId ? `La identidad de ${terminal.code} fue reasignada.` : `Terminal ${terminal.isActive ? 'desactivada' : 'activada'}.`)
      setReassigning(null)
      setReplacementDeviceId('')
      await terminalCatalog.refetch()
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'No se pudo actualizar la terminal.')
    } finally {
      setSaving(false)
    }
  }

  const visibleTerminals = terminals.filter((terminal) => {
    const matchesStatus = status === 'all' || (status === 'active' ? terminal.isActive : !terminal.isActive)
    return matchesStatus && (!locationId || terminal.operationalLocationId === locationId)
  })
  const currentTerminal = terminals.find((terminal) => terminal.deviceId === identity.id)

  return (
    <main className="min-h-full bg-[var(--erp-background)] p-4 text-[var(--erp-foreground)] sm:p-6 lg:p-8">
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="overflow-hidden rounded-[1.6rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow)]">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,.72fr)] lg:items-end">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[var(--erp-brand-red)]"><Monitor className="h-4 w-4" /> Infraestructura de caja</p>
              <h1 className="mt-4 text-3xl font-black tracking-[-.05em] sm:text-4xl">Terminales POS</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--erp-muted-foreground)]">Registra cada estación de cobro con una identidad única, su sucursal y un nombre que el equipo reconozca.</p>
            </div>
            <div className={`border-l-4 p-5 ${currentTerminal ? 'border-[var(--erp-success)] bg-[rgba(63,123,65,.07)]' : 'border-[var(--erp-brand-gold)] bg-[rgba(214,155,45,.11)]'}`}>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--erp-muted-foreground)]">Este navegador</p>
              <p className="mt-2 font-mono text-sm font-bold break-all text-[var(--erp-foreground)]">{identity.id}</p>
              <p className="mt-3 text-sm font-semibold">{currentTerminal ? `${currentTerminal.code} · ${currentTerminal.name}` : 'Sin terminal registrada'}</p>
            </div>
          </div>
          {identity.isNew && <div className="flex gap-3 border-t border-[rgba(180,122,16,.3)] bg-[rgba(214,155,45,.14)] px-6 py-4 text-sm text-[var(--erp-foreground)] sm:px-8" role="alert"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--erp-warning)]" /><p><strong>Identidad nueva detectada.</strong> Este navegador no conservó un ID previo. Si esta estación ya estaba registrada, reasigna su terminal antes de operar; borrar los datos del navegador genera una identidad diferente.</p></div>}
        </header>

        {error && <p className="rounded-xl border border-[rgba(157,45,36,.3)] bg-[rgba(157,45,36,.08)] p-4 text-sm font-semibold text-[var(--erp-danger)]" role="alert">{error}</p>}
        {notice && <p className="rounded-xl border border-[rgba(63,123,65,.3)] bg-[rgba(63,123,65,.09)] p-4 text-sm font-semibold text-[var(--erp-success)]" role="status">{notice}</p>}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.72fr)]">
          <div className="grid gap-5">
            <section className="rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-4 shadow-[var(--erp-shadow)]">
              <div className="grid gap-3 sm:grid-cols-3">
                <Select aria-label="Filtrar por sucursal" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">Todas las sucursales</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select>
                <Select aria-label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Activas</option><option value="inactive">Inactivas</option><option value="all">Todas</option></Select>
                <Button variant="secondary" onClick={() => void terminalCatalog.refetch()}><RefreshCw className="h-4 w-4" /> Actualizar</Button>
              </div>
            </section>

            <section className="overflow-hidden rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white shadow-[var(--erp-shadow)]">
              <div className="flex items-center justify-between border-b border-[color:var(--erp-border)] px-5 py-4"><div><h2 className="font-black">Estaciones registradas</h2><p className="mt-1 text-xs text-[var(--erp-muted-foreground)]">{visibleTerminals.length} de {terminals.length} terminales</p></div><span className="font-mono text-xs font-bold text-[var(--erp-muted-foreground)]">ID = identidad de operación</span></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-xs uppercase tracking-[.12em] text-[var(--erp-muted-foreground)]"><tr><th className="px-4 py-3 font-bold">Terminal</th><th className="px-4 py-3 font-bold">Sucursal</th><th className="px-4 py-3 font-bold">Identidad</th><th className="px-4 py-3 font-bold">Estado</th><th className="px-4 py-3 text-right font-bold">Acciones</th></tr></thead><tbody>
                {terminalCatalog.isLoading ? <tr><td className="p-8 text-center text-[var(--erp-muted-foreground)]" colSpan={5}>Cargando terminales...</td></tr> : visibleTerminals.length === 0 ? <tr><td className="p-8 text-center text-[var(--erp-muted-foreground)]" colSpan={5}>No hay terminales con estos filtros.</td></tr> : visibleTerminals.map((terminal) => <tr className="border-b border-[color:var(--erp-border)] last:border-0 hover:bg-[var(--erp-surface)]" key={terminal.id}><td className="px-4 py-4"><p className="font-mono text-xs font-bold text-[var(--erp-brand-red)]">{terminal.code}</p><p className="mt-1 font-bold">{terminal.name}</p></td><td className="px-4 py-4 font-medium">{locationName(terminal, locations)}</td><td className="max-w-52 px-4 py-4 font-mono text-xs text-[var(--erp-muted-foreground)]"><span className="block truncate" title={terminal.deviceId}>{terminal.deviceId}</span>{terminal.deviceId === identity.id && <span className="mt-1 inline-block font-sans font-bold text-[var(--erp-success)]">Este navegador</span>}</td><td className="px-4 py-4"><span className={terminal.isActive ? 'rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800' : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600'}>{terminal.isActive ? 'Activa' : 'Inactiva'}</span></td><td className="px-4 py-4"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => { setReassigning(terminal); setReplacementDeviceId('') }}><Link2 className="h-3.5 w-3.5" /> Reasignar</Button><Button aria-label={terminal.isActive ? `Desactivar ${terminal.name}` : `Activar ${terminal.name}`} size="sm" variant={terminal.isActive ? 'ghost' : 'secondary'} disabled={saving} onClick={() => void updateTerminal(terminal, { isActive: !terminal.isActive })}>{terminal.isActive ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}{terminal.isActive ? 'Desactivar' : 'Activar'}</Button></div></td></tr>)}</tbody></table></div>
            </section>
          </div>

          <form className="h-fit rounded-[1.4rem] border border-[color:var(--erp-border)] bg-white p-5 shadow-[var(--erp-shadow)]" noValidate onSubmit={registerTerminal}>
            <div className="flex items-center gap-3"><span className="rounded-xl bg-[rgba(182,42,34,.08)] p-2 text-[var(--erp-brand-red)]"><Plus className="h-5 w-5" /></span><div><h2 className="font-black">Registrar este dispositivo</h2><p className="text-xs text-[var(--erp-muted-foreground)]">La identidad se vincula a una sola terminal.</p></div></div>
            <div className="mt-5 grid gap-4"><label className="grid gap-1.5 text-sm font-semibold">Sucursal<Select required value={form.operationalLocationId} onChange={(event) => setForm({ ...form, operationalLocationId: event.target.value })}><option value="">Selecciona una sucursal</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}{location.code ? ` · ${location.code}` : ''}</option>)}</Select></label><label className="grid gap-1.5 text-sm font-semibold">Código de terminal<Input required maxLength={80} placeholder="Ej. CAJA-01" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-semibold">Nombre visible<Input required maxLength={200} placeholder="Ej. Mostrador principal" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="grid gap-1.5 text-sm font-semibold">ID del dispositivo<Input required className="font-mono text-xs" value={form.deviceId} onChange={(event) => setForm({ ...form, deviceId: event.target.value })} /></label></div>
            <Button className="mt-5 w-full" disabled={saving} type="submit"><Plus className="h-4 w-4" /> {saving ? 'Registrando...' : 'Registrar terminal'}</Button>
          </form>
        </section>
      </div>

      {reassigning && <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-labelledby="reassign-title"><section className="w-full max-w-md rounded-[1.5rem] border border-[var(--erp-brand-gold)] bg-white p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--erp-brand-red)]">Cambio de equipo</p><h2 className="mt-3 text-2xl font-black" id="reassign-title">Reasignar {reassigning.code}</h2><p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">La terminal conservará su código, nombre e historial. Solo cambiará la identidad del navegador que puede usarla.</p><label className="mt-5 grid gap-1.5 text-sm font-semibold">Nuevo ID de dispositivo<Input autoFocus className="font-mono text-xs" placeholder="Pega el ID del nuevo navegador" value={replacementDeviceId} onChange={(event) => setReplacementDeviceId(event.target.value)} /></label><Button className="mt-3 w-full" variant="outline" onClick={() => setReplacementDeviceId(identity.id)}><Copy className="h-4 w-4" /> Usar ID de este navegador</Button><div className="mt-5 flex justify-end gap-3"><Button variant="secondary" onClick={() => { setReassigning(null); setReplacementDeviceId('') }}>Cancelar</Button><Button disabled={saving || !replacementDeviceId.trim()} onClick={() => void updateTerminal(reassigning, { deviceId: replacementDeviceId.trim() })}><Link2 className="h-4 w-4" /> Reasignar</Button></div></section></div>}
    </main>
  )
}
