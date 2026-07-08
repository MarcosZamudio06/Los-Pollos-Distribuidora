import { Link, NavLink, useLocation } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { LogOut } from 'lucide-react'
import { Avatar, AvatarFallback, Badge, ScrollArea, Separator } from '../ui'
import { useAuth } from '../../features/auth'
import { cn } from '../../lib/utils'
import { getActiveSidebarItemKey, getRoleLabel, getSidebarNavForRole, type NavigationItem } from './roleNavigation'

type SidebarProps = {
  collapsed?: boolean
  onNavigate?: () => void
  variant?: 'desktop' | 'mobile'
}

const sectionLabels: Record<NavigationItem['section'], string> = {
  admin: 'Administración',
  commercial: 'Comercial',
  financial: 'Finanzas',
  operations: 'Operación',
}

function getInitials(name?: string | null) {
  if (!name) {
    return 'PD'
  }

  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}

function getGroupedNavigation(items: NavigationItem[]) {
  return items.reduce<Array<{ section: NavigationItem['section']; items: NavigationItem[] }>>((groups, item) => {
    const currentGroup = groups.find((group) => group.section === item.section)

    if (currentGroup) {
      currentGroup.items.push(item)
      return groups
    }

    return [...groups, { items: [item], section: item.section }]
  }, [])
}

export function Sidebar({ collapsed = false, onNavigate, variant = 'desktop' }: SidebarProps) {
  const { user } = useAuth()
  const location = useLocation()
  const shouldReduceMotion = useReducedMotion()
  const activeKey = getActiveSidebarItemKey(location.pathname)
  const navItems = getSidebarNavForRole(user?.role)
  const roleLabel = getRoleLabel(user?.role)
  const initials = getInitials(user?.name)
  const groupedNavigation = getGroupedNavigation(navItems)
  const isMobile = variant === 'mobile'
  const expanded = isMobile || !collapsed

  return (
    <motion.aside
      animate={isMobile ? { x: 0 } : { width: collapsed ? 88 : 288 }}
      aria-label="Navegación principal"
      className={cn(
        'relative flex h-dvh min-h-screen shrink-0 flex-col overflow-hidden border-r border-white/10 text-white shadow-[18px_0_60px_rgba(17,24,21,0.24)]',
        'bg-[linear-gradient(180deg,var(--erp-graphite)_0%,#181f1b_52%,var(--erp-charcoal)_100%)]',
        isMobile && 'w-72 max-w-[88vw]',
      )}
      data-sidebar-state={expanded ? 'expanded' : 'collapsed'}
      initial={false}
      transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: 'easeOut' }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_20%_10%,rgba(214,155,45,0.22),transparent_18rem)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(circle_at_82%_16%,rgba(182,42,34,0.16),transparent_18rem)]" />

      <div className={cn('relative flex items-start gap-3 px-4 py-5', !expanded && 'justify-center px-3')}>
        <Link
          aria-label="Ir al inicio"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-[var(--erp-surface)] text-sm font-black tracking-[-0.04em] text-[var(--erp-brand-red)] shadow-[0_14px_34px_rgba(0,0,0,0.22)] transition hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]"
          onClick={onNavigate}
          to="/"
        >
          EP
        </Link>

        {expanded && (
          <div className="min-w-0 flex-1 pt-1">
            <p className="truncate text-base font-black tracking-[-0.03em]">El Pollo</p>
            <p className="mt-1 truncate text-xs font-semibold uppercase tracking-[0.22em] text-[var(--erp-brand-gold-soft)]">
              Pollos Distribuidora
            </p>
          </div>
        )}
      </div>

      <div className="relative px-4">
        <Separator className="bg-white/10" />
      </div>

      {expanded && user && (
        <section className="relative mx-4 mt-4 rounded-2xl border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 border-white/10 bg-white/10 text-white">
              <AvatarFallback className="bg-transparent text-sm font-black text-white">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.name || 'Usuario activo'}</p>
              {user.email && <p className="mt-1 truncate text-xs text-white/62">{user.email}</p>}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone="gold" className="border-white/10 bg-white/10 text-[0.68rem] tracking-[0.16em] text-[var(--erp-brand-gold-soft)]">
              {roleLabel}
            </Badge>
            <span className="text-xs text-white/58">Sesión activa</span>
          </div>
        </section>
      )}

      <ScrollArea className={cn('relative mt-4 flex-1 px-3 pb-4', !expanded && 'px-2')}>
        <nav className="space-y-5" aria-label="Accesos por rol">
          {groupedNavigation.map((group) => (
            <div className="space-y-1.5" key={group.section}>
              {expanded && (
                <p className="px-3 text-[0.68rem] font-black uppercase tracking-[0.22em] text-white/38">
                  {sectionLabels[group.section]}
                </p>
              )}
              {group.items.map((item) => {
                const isActive = item.key === activeKey
                const Icon = item.icon

                return (
                  <NavLink
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-semibold transition focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]',
                      !expanded && 'justify-center px-2',
                      isActive
                        ? 'border-white/15 bg-[var(--erp-surface-elevated)] text-[var(--erp-foreground)] shadow-[0_12px_30px_rgba(0,0,0,0.16)]'
                        : 'border-transparent text-white/76 hover:-translate-y-0.5 hover:border-white/10 hover:bg-white/8 hover:text-white',
                    )}
                    key={item.key}
                    onClick={onNavigate}
                    title={!expanded ? item.label : undefined}
                    to={item.to}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition',
                        isActive ? 'bg-[var(--erp-brand-gold)] text-[var(--erp-charcoal)]' : 'bg-white/8 text-white/80 group-hover:bg-white/12 group-hover:text-white',
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    {expanded ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </ScrollArea>

      <div className={cn('relative mt-auto border-t border-white/10 p-4', !expanded && 'px-2')}>
        <NavLink
          aria-label="Cerrar sesión"
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_32px_rgba(157,45,36,0.28)] transition hover:bg-[var(--erp-brand-red-strong)] focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]',
            !expanded && 'px-2',
          )}
          onClick={onNavigate}
          to="/logout"
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {expanded ? <span>Cerrar sesión</span> : <span className="sr-only">Cerrar sesión</span>}
        </NavLink>
      </div>
    </motion.aside>
  )
}
