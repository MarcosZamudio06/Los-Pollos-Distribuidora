import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export type SkeletonProps = HTMLAttributes<HTMLDivElement>

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-xl bg-[linear-gradient(90deg,rgba(17,24,21,0.06)_0%,rgba(17,24,21,0.10)_50%,rgba(17,24,21,0.06)_100%)] bg-[length:200%_100%]',
        className,
      )}
      {...props}
    />
  )
}
