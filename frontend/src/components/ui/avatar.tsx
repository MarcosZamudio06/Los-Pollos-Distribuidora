import type { HTMLAttributes, ImgHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Avatar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-sm font-semibold text-[var(--erp-foreground)]',
        className,
      )}
      {...props}
    />
  )
}

export function AvatarImage({ className, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      className={cn('h-full w-full object-cover', className)}
      {...props}
    />
  )
}

export function AvatarFallback({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('flex h-full w-full items-center justify-center', className)}
      {...props}
    />
  )
}
