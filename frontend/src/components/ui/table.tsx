import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

export function Table({ className, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <table
      className={cn(
        'min-w-full border-separate border-spacing-0 text-left text-sm text-[var(--erp-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function Th({ className, ...props }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th
      className={cn(
        'border-b border-[color:var(--erp-border)] bg-[var(--erp-surface)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--erp-muted-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td
      className={cn(
        'border-b border-[color:var(--erp-border)] px-4 py-3 align-top text-[var(--erp-foreground)]',
        className,
      )}
      {...props}
    />
  )
}
