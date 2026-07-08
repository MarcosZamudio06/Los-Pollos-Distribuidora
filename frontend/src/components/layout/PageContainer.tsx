import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function PageContainer({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <main
      className={cn('min-h-full px-4 py-6 text-[var(--erp-foreground)] sm:px-6 lg:px-8', className)}
      {...props}
    />
  )
}
