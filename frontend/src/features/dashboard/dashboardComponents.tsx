import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { ArrowUpRight, Clock3, Search, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Skeleton, Table, Td, Th, type BadgeTone } from '../../components/ui'
import { cn } from '../../lib/utils'

type Tone = 'amber' | 'blue' | 'green' | 'red' | 'slate'

const toneClasses: Record<Tone, { accent: string; icon: string; surface: string }> = {
  amber: {
    accent: 'bg-[var(--erp-brand-gold)]',
    icon: 'bg-[rgba(214,155,45,0.14)] text-[var(--erp-brand-gold-deep)]',
    surface: 'from-[rgba(214,155,45,0.16)] to-transparent',
  },
  blue: {
    accent: 'bg-[var(--erp-info)]',
    icon: 'bg-[rgba(47,111,115,0.12)] text-[var(--erp-info)]',
    surface: 'from-[rgba(47,111,115,0.12)] to-transparent',
  },
  green: {
    accent: 'bg-[var(--erp-success)]',
    icon: 'bg-[rgba(63,123,65,0.12)] text-[var(--erp-success)]',
    surface: 'from-[rgba(63,123,65,0.12)] to-transparent',
  },
  red: {
    accent: 'bg-[var(--erp-danger)]',
    icon: 'bg-[rgba(157,45,36,0.11)] text-[var(--erp-danger)]',
    surface: 'from-[rgba(157,45,36,0.12)] to-transparent',
  },
  slate: {
    accent: 'bg-[var(--erp-muted-foreground)]',
    icon: 'bg-[var(--erp-surface-muted)] text-[var(--erp-foreground)]',
    surface: 'from-[rgba(29,36,32,0.08)] to-transparent',
  },
}

export type KpiCardProps = {
  action?: { label: string; to: string }
  detail: string
  icon: LucideIcon
  label: string
  tone?: Tone
  value: string
}

export function KpiCard({ action, detail, icon: Icon, label, tone = 'blue', value }: KpiCardProps) {
  const classes = toneClasses[tone]

  return (
    <Card className="group relative overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[var(--erp-shadow-elevated)]">
      <div className={cn('absolute inset-x-0 top-0 h-1', classes.accent)} />
      <div className={cn('absolute inset-0 bg-gradient-to-br opacity-100', classes.surface)} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-muted-foreground)]">{label}</p>
          <p className="mt-3 text-3xl font-black tracking-[-0.06em] text-[var(--erp-foreground)]">{value}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--erp-muted-foreground)]">{detail}</p>
        </div>
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-2xl', classes.icon)}>
          <Icon aria-hidden="true" size={20} />
        </span>
      </div>
      {action && (
        <Link className="relative mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--erp-info)]" to={action.to}>
          {action.label}
          <ArrowUpRight aria-hidden="true" size={14} />
        </Link>
      )}
    </Card>
  )
}

export function FreshnessBar({ dataAsOf, freshnessSeconds, generatedAt, isStale }: { dataAsOf?: string | null; freshnessSeconds?: number | null; generatedAt?: string | null; isStale?: boolean | null }) {
  return (
    <div className="rounded-[1.2rem] border border-[color:var(--erp-border)] bg-white/78 p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className={cn('mt-1 grid size-9 place-items-center rounded-2xl', isStale ? toneClasses.amber.icon : toneClasses.green.icon)}>
            <Clock3 aria-hidden="true" size={18} />
          </span>
          <div>
            <p className="text-sm font-black text-[var(--erp-foreground)]">Actualización de datos</p>
            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Generado: {generatedAt} · Datos al: {dataAsOf}</p>
          </div>
        </div>
        <StatusBadge tone={isStale ? 'amber' : 'green'}>{isStale ? 'Revisar frescura' : `Frescura ${freshnessSeconds ?? 0}s`}</StatusBadge>
      </div>
    </div>
  )
}

export function StatusBadge({ children, tone = 'slate' }: { children: ReactNode; tone?: BadgeTone }) {
  return <Badge tone={tone}>{children}</Badge>
}

export function AlertRow({ action, description, severity = 'slate', title }: { action?: { label: string; to: string }; description: string; severity?: Tone; title: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-[color:var(--erp-border)] py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-2xl', toneClasses[severity].icon)}>
          <TriangleAlert aria-hidden="true" size={17} />
        </span>
        <div>
          <p className="text-sm font-black text-[var(--erp-foreground)]">{title}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--erp-muted-foreground)]">{description}</p>
        </div>
      </div>
      {action && (
        <Link className="text-sm font-bold text-[var(--erp-info)]" to={action.to}>
          {action.label}
        </Link>
      )}
    </div>
  )
}

export function DataPanel({ action, children, description, eyebrow, title }: { action?: { label: string; to: string }; children: ReactNode; description?: string; eyebrow?: string; title: string }) {
  return (
    <Card className="p-5 sm:p-6">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow && <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--erp-brand-gold-deep)]">{eyebrow}</p>}
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription className="mt-2">{description}</CardDescription>}
        </div>
        {action && (
          <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-4 py-2.5 text-sm font-semibold text-[var(--erp-foreground)] transition duration-200 hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)]" to={action.to}>
            {action.label}
          </Link>
        )}
      </CardHeader>
      <CardContent className="mt-5">{children}</CardContent>
    </Card>
  )
}

export function FilterPanel({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-[var(--erp-surface-muted)] text-[var(--erp-foreground)]">
            <Search aria-hidden="true" size={18} />
          </span>
          <div>
            <p className="text-sm font-black">Filtros operativos</p>
            <p className="mt-1 text-sm text-[var(--erp-muted-foreground)]">Ajusta el alcance sin cambiar contratos ni permisos.</p>
          </div>
        </div>
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_1fr_auto] lg:max-w-3xl">
          {children}
          <Button className="self-end" onClick={onClear} type="button" variant="secondary">Limpiar filtros</Button>
        </div>
      </div>
    </Card>
  )
}

export function EmptyState({ description, title = 'No hay datos para mostrar' }: { description: string; title?: string }) {
  return (
    <div className="rounded-[1.2rem] border border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] p-6 text-center">
      <ShieldCheck className="mx-auto text-[var(--erp-muted-foreground)]" size={28} />
      <p className="mt-3 font-black text-[var(--erp-foreground)]">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[var(--erp-muted-foreground)]">{description}</p>
    </div>
  )
}

export function LoadingState({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }, (_, index) => (
        <Card className="p-5" key={index}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-5 h-9 w-40" />
          <Skeleton className="mt-4 h-4 w-full" />
        </Card>
      ))}
    </div>
  )
}

export function CompactTable({ children, headers }: { children: ReactNode; headers: string[] }) {
  return (
    <div className="overflow-x-auto rounded-[1.1rem] border border-[color:var(--erp-border)]">
      <Table>
        <thead>
          <tr>{headers.map((header) => <Th key={header}>{header}</Th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </Table>
    </div>
  )
}

export function FieldLabel({ children, className, ...props }: ComponentPropsWithoutRef<'label'>) {
  return (
    <label className={cn('flex flex-col gap-1 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]', className)} {...props}>
      {children}
    </label>
  )
}

export { Input, Td }
