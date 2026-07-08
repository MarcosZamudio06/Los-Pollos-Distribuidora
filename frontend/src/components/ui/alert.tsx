import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const alertVariants = cva('rounded-2xl border p-4', {
  defaultVariants: {
    tone: 'info',
  },
  variants: {
    tone: {
      info: 'border-[rgba(47,111,115,0.18)] bg-[rgba(47,111,115,0.08)] text-[var(--erp-info)]',
      warning:
        'border-[rgba(180,122,16,0.2)] bg-[rgba(180,122,16,0.10)] text-[var(--erp-warning)]',
      error:
        'border-[rgba(157,45,36,0.22)] bg-[rgba(157,45,36,0.08)] text-[var(--erp-danger)]',
      success:
        'border-[rgba(63,123,65,0.18)] bg-[rgba(63,123,65,0.08)] text-[var(--erp-success)]',
    },
  },
})

export type AlertTone = VariantProps<typeof alertVariants>['tone']

export type AlertProps = HTMLAttributes<HTMLElement> & VariantProps<typeof alertVariants>

export function Alert({ className, tone, ...props }: AlertProps) {
  return <aside className={cn(alertVariants({ tone }), className)} {...props} />
}
