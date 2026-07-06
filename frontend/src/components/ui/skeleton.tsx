import type { ComponentPropsWithoutRef } from 'react'

export function Skeleton({ className = '', ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={`animate-pulse rounded-xl bg-[#20211f]/10 ${className}`} {...props} />
}
