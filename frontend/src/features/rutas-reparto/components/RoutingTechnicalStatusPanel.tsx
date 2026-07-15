import { Activity, Clock3, Database, HardDriveDownload, ServerCog, TriangleAlert } from 'lucide-react'
import type { RoutingTechnicalStatus } from '../types'
import { Card, StatusMessage } from './RouteUi'

type Props = { data?: RoutingTechnicalStatus; error: unknown; isLoading: boolean }

export function RoutingTechnicalStatusPanel({ data, error, isLoading }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] bg-[#1d2420] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-[#f0c56a]"><ServerCog className="h-4 w-4" />Infraestructura cartográfica</p>
          <h2 className="mt-1 text-xl font-black tracking-[-0.04em]">Estado técnico de rutas</h2>
        </div>
        {data && <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] ${data.status === 'operational' ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-200' : 'border-amber-300/30 bg-amber-400/10 text-amber-100'}`}><Activity className="h-3.5 w-3.5" />{data.status === 'operational' ? 'Operación estable' : 'Servicio degradado'}</span>}
      </div>
      <div className="p-5">
        {isLoading && <StatusMessage>Verificando servicios internos...</StatusMessage>}
        {Boolean(error) && <StatusMessage tone="error">No se pudo consultar el estado técnico. Las rutas históricas conservan su operación textual.</StatusMessage>}
        {data && (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.services.map((service) => (
                <div className="rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-4" key={service.name}>
                  <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 font-black"><Database className="h-4 w-4 text-[var(--erp-info)]" />{service.name}</span><span className={`h-2.5 w-2.5 rounded-full ${service.status === 'up' ? 'bg-emerald-500' : 'bg-[var(--erp-danger)]'}`} aria-label={service.status === 'up' ? 'Disponible' : 'No disponible'} /></div>
                  <p className="mt-3 text-2xl font-black tabular-nums">{service.latencyMs} ms</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--erp-muted-foreground)]">{service.status === 'up' ? 'Disponible' : 'Sin respuesta'}</p>
                </div>
              ))}
            </div>
            <div className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${data.dataset.renewalRecommended ? 'border-amber-300 bg-amber-50' : 'border-[color:var(--erp-border)] bg-white'}`}>
              <div><p className="flex items-center gap-2 font-black"><HardDriveDownload className="h-4 w-4 text-[var(--erp-brand-gold-deep)]" />Dataset {data.dataset.version}</p><p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Antigüedad: {data.dataset.ageDays == null ? 'sin fecha registrada' : `${data.dataset.ageDays} día(s)`}</p></div>
              <p className="flex items-center gap-2 text-sm font-bold text-[var(--erp-muted-foreground)]">{data.dataset.renewalRecommended ? <TriangleAlert className="h-4 w-4 text-amber-600" /> : <Clock3 className="h-4 w-4 text-[var(--erp-success)]" />}{data.dataset.renewalRecommended ? 'Renovación mensual requerida' : 'Dataset dentro de vigencia'}</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
