import { Link, useLocation } from 'react-router-dom'
import { Circle, Menu, Search } from 'lucide-react'
import { Badge } from '../ui'
import { useAuth } from '../../features/auth'
import { getActiveNavigationItem, getQuickActionsForRole } from './roleNavigation'

type TopBarProps = {
  onMenuClick: () => void
  sidebarOpen: boolean
}

export function TopBar({ onMenuClick, sidebarOpen }: TopBarProps) {
  const { user } = useAuth()
  const location = useLocation()
  const activeItem = getActiveNavigationItem(location.pathname)
  const quickActions = getQuickActionsForRole(user?.role).slice(0, 2)

  return (
    <header className="erp-topbar sticky top-0 z-40 border-b border-[color:var(--erp-border)] shadow-[0_18px_45px_rgba(17,24,21,0.06)]">
      <div className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3 md:px-6">
        <button
          aria-expanded={sidebarOpen}
          aria-label="Abrir menú lateral"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] text-[var(--erp-foreground)] shadow-[0_12px_30px_rgba(17,24,21,0.10)] transition hover:-translate-y-0.5 hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)] focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
          onClick={onMenuClick}
          type="button"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--erp-muted-foreground)]">
              {activeItem.description}
            </p>
            <Badge tone="green" className="hidden border-[rgba(63,123,65,0.18)] bg-[rgba(63,123,65,0.08)] normal-case tracking-normal sm:inline-flex">
              <Circle aria-hidden="true" className="mr-1.5 h-2 w-2 fill-current" />
              Datos actualizados
            </Badge>
          </div>
          <h1 className="mt-1 truncate text-base font-black tracking-[-0.03em] text-[var(--erp-foreground)] md:text-lg">
            {activeItem.label}
          </h1>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {quickActions.map((item) => (
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 text-sm font-semibold text-[var(--erp-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:text-[var(--erp-brand-red)]"
              key={item.key}
              to={item.to}
            >
              <item.icon aria-hidden="true" className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </div>

        <button
          aria-label="Buscar en el ERP"
          className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] text-[var(--erp-muted-foreground)] transition hover:border-[var(--erp-brand-gold)] hover:text-[var(--erp-foreground)] focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)] sm:inline-flex"
          type="button"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
