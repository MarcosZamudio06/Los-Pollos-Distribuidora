import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '../../lib/utils'

export function ScrollArea({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('min-h-0 overflow-y-auto overscroll-contain', className)} {...props} />
}
