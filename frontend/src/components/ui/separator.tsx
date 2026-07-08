import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type SeparatorProps = HTMLAttributes<HTMLDivElement> & {
  orientation?: 'horizontal' | 'vertical'
}

export function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) {
  return (
    <div
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-[color:var(--erp-border)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      role="separator"
      {...props}
    />
  )
}
