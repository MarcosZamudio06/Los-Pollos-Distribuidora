import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { orderStatusLabel, routeStatusLabel, settlementStatusLabel } from '../labels'
import type { DeliveryOrderStatus, DeliveryRouteStatus, RouteSettlementStatus } from '../types'

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-[var(--erp-background)] px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8">{children}</main>
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <section className="mx-auto grid max-w-7xl gap-5">{children}</section>
}

export function RouteHero({ action, eyebrow, subtitle, surface = 'charcoal', title }: { action?: ReactNode; eyebrow: string; subtitle: string; surface?: 'charcoal' | 'white'; title: string }) {
  const isWhiteSurface = surface === 'white'
  return (
    <header className={`relative overflow-hidden rounded-[2rem] border p-6 shadow-[var(--erp-shadow-elevated)] sm:p-7 ${isWhiteSurface ? 'border-[color:var(--erp-border)] bg-white text-[var(--erp-foreground)]' : 'border-black/10 bg-[var(--erp-charcoal)] text-white shadow-[0_24px_80px_rgba(17,24,21,0.18)]'}`}>
      <div className="absolute right-0 top-0 h-36 w-36 rounded-bl-full bg-[rgba(214,155,45,0.16)]" />
      <div className="absolute bottom-0 left-0 h-24 w-56 rounded-tr-full bg-[rgba(47,111,115,0.18)]" />
      <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${isWhiteSurface ? 'border-[rgba(214,155,45,0.28)] bg-[rgba(214,155,45,0.10)] text-[var(--erp-brand-gold-deep)]' : 'border-white/10 bg-white/5 text-[var(--erp-brand-gold-soft)]'}`}>
            <span className="h-2 w-2 rounded-full bg-[var(--erp-brand-gold-soft)]" aria-hidden="true" />
            {eyebrow}
          </div>
          <h1 className={`mt-4 max-w-4xl text-3xl font-black tracking-[-0.06em] sm:text-4xl ${isWhiteSurface ? 'text-[var(--erp-foreground)]' : 'text-white'}`}>{title}</h1>
          <p className={`mt-3 max-w-3xl text-sm leading-6 ${isWhiteSurface ? 'text-[var(--erp-muted-foreground)]' : 'text-white/72'}`}>{subtitle}</p>
        </div>
        {action}
      </div>
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[1.4rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] text-[var(--erp-foreground)] shadow-[var(--erp-shadow)] ${className}`}>{children}</section>
}

export function PrimaryButton({ children, disabled, onClick, type = 'button' }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] px-5 text-sm font-black text-[var(--erp-on-brand)] shadow-[0_10px_28px_rgba(182,42,34,0.16)] transition hover:bg-[var(--erp-brand-red-strong)] focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  )
}

export function SecondaryLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-white px-4 py-2 text-sm font-black text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)] focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)]" to={to}>
      {children}
    </Link>
  )
}

export function SecondaryButton({ children, disabled, onClick, type = 'button' }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-white px-4 py-2 text-sm font-black text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)] focus-visible:ring-4 focus-visible:ring-[var(--erp-ring)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`h-10 w-full rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3.5 text-sm text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[var(--erp-muted-foreground)]/70 focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:cursor-not-allowed disabled:bg-[var(--erp-surface-muted)] disabled:opacity-70 ${props.className ?? ''}`} />
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-10 w-full rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3.5 text-sm text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:cursor-not-allowed disabled:bg-[var(--erp-surface-muted)] disabled:opacity-70 ${props.className ?? ''}`} />
}

export function Field({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return (
    <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]">
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs font-semibold normal-case leading-5 tracking-normal text-[var(--erp-muted-foreground)]">{hint}</span>}
    </label>
  )
}

export function StatusMessage({ children, tone = 'info' }: { children: ReactNode; tone?: 'error' | 'info' | 'empty' | 'success' }) {
  const className = {
    empty: 'border-dashed border-[color:var(--erp-border)] bg-[var(--erp-surface)] text-[var(--erp-muted-foreground)]',
    error: 'border-[rgba(157,45,36,0.20)] bg-[rgba(157,45,36,0.08)] text-[var(--erp-danger)]',
    info: 'border-[rgba(47,111,115,0.20)] bg-[rgba(47,111,115,0.08)] text-[var(--erp-info)]',
    success: 'border-[rgba(63,123,65,0.20)] bg-[rgba(63,123,65,0.08)] text-[var(--erp-success)]',
  }[tone]
  return <p className={`rounded-2xl border p-4 text-sm font-bold ${className}`}>{children}</p>
}

export function RouteStatusBadge({ status }: { status: DeliveryRouteStatus }) {
  const tone = status === 'COMPLETED' ? 'border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]' : status === 'CANCELLED' ? 'border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.10)] text-[var(--erp-danger)]' : status === 'IN_PROGRESS' ? 'border-[rgba(47,111,115,0.25)] bg-[rgba(47,111,115,0.10)] text-[var(--erp-info)]' : 'border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] text-[var(--erp-brand-gold-deep)]'
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${tone}`}>{routeStatusLabel(status)}</span>
}

export function OrderStatusBadge({ status }: { status: DeliveryOrderStatus }) {
  const finalState = ['DELIVERED', 'NOT_DELIVERED', 'CANCELLED', 'PARTIALLY_REJECTED', 'RETURNED'].includes(status)
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${finalState ? 'border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]' : 'border-[rgba(214,155,45,0.30)] bg-[rgba(214,155,45,0.12)] text-[var(--erp-brand-gold-deep)]'}`}>{orderStatusLabel(status)}</span>
}

export function SettlementStatusBadge({ status }: { status: RouteSettlementStatus }) {
  const tone = status === 'CLOSED' ? 'border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]' : status === 'REVIEW_REQUIRED' ? 'border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.10)] text-[var(--erp-danger)]' : 'border-[rgba(47,111,115,0.25)] bg-[rgba(47,111,115,0.10)] text-[var(--erp-info)]'
  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${tone}`}>{settlementStatusLabel(status)}</span>
}
