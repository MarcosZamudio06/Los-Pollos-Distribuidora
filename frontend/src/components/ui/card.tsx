import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CardProps = ComponentPropsWithoutRef<'article'>

export function Card({ className, ...props }: CardProps) {
  return (
    <article
      className={cn(
        'rounded-[1.4rem] border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] text-[var(--erp-foreground)] shadow-[var(--erp-shadow)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('flex flex-col gap-2', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2
      className={cn(
        'text-lg font-semibold tracking-[-0.035em] text-[var(--erp-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: ComponentPropsWithoutRef<'p'>) {
  return (
    <p
      className={cn('text-sm leading-6 text-[var(--erp-muted-foreground)]', className)}
      {...props}
    />
  )
}

export function CardContent({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<'div'> & { children?: ReactNode }) {
  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  )
}
