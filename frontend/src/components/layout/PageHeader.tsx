import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

type PageHeaderProps = {
  actions?: ReactNode
  eyebrow?: string
  title: string
  description?: string
  className?: string
}

export function PageHeader({ actions, className, description, eyebrow, title }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'rounded-[1.75rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-5 shadow-[0_18px_60px_rgba(17,24,21,0.08)] md:p-6',
        className,
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[var(--erp-info)]">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-2 text-2xl font-black tracking-[-0.05em] text-[var(--erp-foreground)] md:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--erp-muted-foreground)]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
