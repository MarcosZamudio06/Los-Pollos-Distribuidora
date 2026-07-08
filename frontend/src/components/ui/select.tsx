import type { SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3.5 text-sm text-[var(--erp-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition focus:border-[rgba(47,111,115,0.42)] focus:ring-4 focus:ring-[rgba(47,111,115,0.12)] disabled:cursor-not-allowed disabled:bg-[var(--erp-surface-muted)] disabled:opacity-70',
        className,
      )}
      {...props}
    />
  )
}
