import type { ElementType } from 'react'
import { AlertTriangle, Ban, CheckCircle2, CreditCard, WalletCards } from 'lucide-react'
import type { Customer } from '../types'

function toMoney(value: string | number | null | undefined) {
  if (value === undefined || value === null) return '—'
  const amount = Number(value)
  return amount.toLocaleString('es-MX', { currency: 'MXN', style: 'currency' })
}

function sumKnown(values: Array<string | number | null | undefined>) {
  const knownValues = values.filter((value): value is string | number => value !== undefined && value !== null)
  if (knownValues.length === 0) return null
  return knownValues.reduce<number>((total, value) => total + Number(value), 0)
}

type MetricCardProps = { description: string; icon: ElementType; label: string; tone: 'dark' | 'green' | 'red' | 'slate' | 'blue'; value: string | number }

function MetricCard({ description, icon: Icon, label, tone, value }: MetricCardProps) {
  const dark = tone === 'dark'
  const toneClass = {
    blue: 'text-[var(--erp-info)] bg-[rgba(47,111,115,0.10)] border-[rgba(47,111,115,0.20)]',
    dark: 'text-[var(--erp-brand-gold-soft)] bg-white/10 border-white/10',
    green: 'text-[var(--erp-success)] bg-[rgba(63,123,65,0.10)] border-[rgba(63,123,65,0.20)]',
    red: 'text-[var(--erp-danger)] bg-[rgba(157,45,36,0.10)] border-[rgba(157,45,36,0.20)]',
    slate: 'text-[var(--erp-muted-foreground)] bg-[var(--erp-surface-muted)] border-[color:var(--erp-border)]',
  }[tone]

  return (
    <article className={`rounded-[1.4rem] border p-5 shadow-[var(--erp-shadow)] ${dark ? 'border-[var(--erp-charcoal)] bg-[var(--erp-charcoal)] text-white' : 'border-[color:var(--erp-border)] bg-white text-[var(--erp-foreground)]'}`}>
      <div className="flex items-start justify-between gap-4">
        <div><p className={`text-xs font-bold uppercase tracking-[0.18em] ${dark ? 'text-white/62' : 'text-[var(--erp-muted-foreground)]'}`}>{label}</p><strong className="mt-3 block text-2xl font-black tracking-[-0.04em] tabular-nums">{value}</strong></div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${toneClass}`}><Icon className="h-5 w-5" /></span>
      </div>
      <p className={`mt-3 text-xs ${dark ? 'text-white/62' : 'text-[var(--erp-muted-foreground)]'}`}>{description}</p>
    </article>
  )
}

export function CreditStatusSummary({ customers }: { customers: Customer[] }) {
  const active = customers.filter((customer) => customer.creditStatus === 'ACTIVE').length
  const blocked = customers.filter((customer) => customer.creditStatus === 'BLOCKED').length
  const suspended = customers.filter((customer) => customer.creditStatus === 'SUSPENDED').length
  const globalBalance = sumKnown(customers.map((customer) => customer.creditSummary?.globalBalance))
  const overdueBalance = sumKnown(customers.map((customer) => customer.creditSummary?.overdueAmount))

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      <MetricCard description="Clientes con línea vigente" icon={CheckCircle2} label="Activos" tone="dark" value={active} />
      <MetricCard description="Requieren seguimiento" icon={Ban} label="Bloqueados" tone="red" value={blocked} />
      <MetricCard description="Operación restringida" icon={AlertTriangle} label="Suspendidos" tone="slate" value={suspended} />
      <MetricCard description="Cartera acumulada" icon={WalletCards} label="Saldo global" tone="blue" value={toMoney(globalBalance)} />
      <MetricCard description="Cartera con atraso" icon={CreditCard} label="Vencido" tone="red" value={toMoney(overdueBalance)} />
    </section>
  )
}
