import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { orderStatusLabel, routeStatusLabel, settlementStatusLabel } from '../labels'
import type { DeliveryOrderStatus, DeliveryRouteStatus, RouteSettlementStatus } from '../types'

export function PageShell({ children }: { children: ReactNode }) {
  return <main className="min-h-screen bg-[#eef1ed] px-5 py-6 text-[#1d2420] sm:px-8 lg:px-10">{children}</main>
}

export function PageFrame({ children }: { children: ReactNode }) {
  return <section className="mx-auto grid max-w-7xl gap-5">{children}</section>
}

export function RouteHero({ action, eyebrow, subtitle, title }: { action?: ReactNode; eyebrow: string; subtitle: string; title: string }) {
  return (
    <header className="overflow-hidden border border-[#1d2420]/10 bg-[#1d2420] text-white shadow-[0_24px_70px_rgba(29,36,32,0.18)]">
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-end">
        <div className="relative">
          <div className="absolute -left-6 top-0 h-full w-1 bg-[#d69b2d]" aria-hidden="true" />
          <p className="text-xs font-black uppercase tracking-[0.24em] text-[#d69b2d]">{eyebrow}</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-black tracking-[-0.055em] sm:text-5xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/72">{subtitle}</p>
        </div>
        {action}
      </div>
    </header>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`border border-[#1d2420]/10 bg-white shadow-[0_16px_44px_rgba(29,36,32,0.07)] ${className}`}>{children}</section>
}

export function PrimaryButton({ children, disabled, onClick, type = 'button' }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      className="border border-[#d69b2d] bg-[#d69b2d] px-5 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#1d2420] transition hover:bg-[#e4b65c] focus:outline-none focus:ring-4 focus:ring-[#d69b2d]/30 disabled:cursor-not-allowed disabled:opacity-50"
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
    <Link className="border border-[#1d2420]/15 px-4 py-2 text-sm font-black text-[#1d2420] transition hover:border-[#8b2f2a] hover:text-[#8b2f2a] focus:outline-none focus:ring-4 focus:ring-[#d69b2d]/25" to={to}>
      {children}
    </Link>
  )
}

export function SecondaryButton({ children, disabled, onClick, type = 'button' }: { children: ReactNode; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      className="border border-[#1d2420]/15 bg-white px-4 py-2 text-sm font-black text-[#1d2420] transition hover:border-[#8b2f2a] hover:text-[#8b2f2a] focus:outline-none focus:ring-4 focus:ring-[#d69b2d]/25 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`border border-[#1d2420]/15 bg-white px-3 py-3 text-sm text-[#1d2420] outline-none transition focus:border-[#2f6f73] focus:ring-4 focus:ring-[#2f6f73]/15 ${props.className ?? ''}`} />
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`border border-[#1d2420]/15 bg-white px-3 py-3 text-sm text-[#1d2420] outline-none transition focus:border-[#2f6f73] focus:ring-4 focus:ring-[#2f6f73]/15 ${props.className ?? ''}`} />
}

export function Field({ children, hint, label }: { children: ReactNode; hint?: string; label: string }) {
  return (
    <label className="grid gap-2 text-sm font-black text-[#4f5a52]">
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs font-semibold leading-5 text-[#6f786f]">{hint}</span>}
    </label>
  )
}

export function StatusMessage({ children, tone = 'info' }: { children: ReactNode; tone?: 'error' | 'info' | 'empty' | 'success' }) {
  const className = {
    empty: 'border-dashed border-[#1d2420]/20 bg-white text-[#6f786f]',
    error: 'border-[#8b2f2a]/25 bg-[#8b2f2a]/8 text-[#8b2f2a]',
    info: 'border-[#2f6f73]/20 bg-[#2f6f73]/8 text-[#2f6f73]',
    success: 'border-[#3f7b41]/20 bg-[#3f7b41]/8 text-[#2f6730]',
  }[tone]
  return <p className={`border p-4 text-sm font-bold ${className}`}>{children}</p>
}

export function RouteStatusBadge({ status }: { status: DeliveryRouteStatus }) {
  const tone = status === 'COMPLETED' ? 'bg-[#3f7b41]/12 text-[#2f6730]' : status === 'CANCELLED' ? 'bg-[#8b2f2a]/12 text-[#8b2f2a]' : status === 'IN_PROGRESS' ? 'bg-[#2f6f73]/12 text-[#2f6f73]' : 'bg-[#d69b2d]/18 text-[#7a5718]'
  return <span className={`inline-flex px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${tone}`}>{routeStatusLabel(status)}</span>
}

export function OrderStatusBadge({ status }: { status: DeliveryOrderStatus }) {
  const finalState = ['DELIVERED', 'NOT_DELIVERED', 'CANCELLED', 'PARTIALLY_REJECTED', 'RETURNED'].includes(status)
  return <span className={`inline-flex px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${finalState ? 'bg-[#3f7b41]/12 text-[#2f6730]' : 'bg-[#d69b2d]/18 text-[#7a5718]'}`}>{orderStatusLabel(status)}</span>
}

export function SettlementStatusBadge({ status }: { status: RouteSettlementStatus }) {
  const tone = status === 'CLOSED' ? 'bg-[#3f7b41]/12 text-[#2f6730]' : status === 'REVIEW_REQUIRED' ? 'bg-[#8b2f2a]/12 text-[#8b2f2a]' : 'bg-[#2f6f73]/12 text-[#2f6f73]'
  return <span className={`inline-flex px-3 py-1 text-xs font-black uppercase tracking-[0.12em] ${tone}`}>{settlementStatusLabel(status)}</span>
}
