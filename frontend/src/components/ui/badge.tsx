import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em]',
  {
    defaultVariants: {
      tone: 'slate',
    },
    variants: {
      tone: {
        slate:
          'border-[color:var(--erp-border)] bg-[var(--erp-surface-muted)] text-[var(--erp-foreground)]',
        amber:
          'border-[rgba(214,155,45,0.3)] bg-[rgba(214,155,45,0.12)] text-[var(--erp-brand-gold-deep)]',
        gold:
          'border-[rgba(214,155,45,0.3)] bg-[rgba(214,155,45,0.12)] text-[var(--erp-brand-gold-deep)]',
        red:
          'border-[rgba(157,45,36,0.25)] bg-[rgba(157,45,36,0.10)] text-[var(--erp-danger)]',
        green:
          'border-[rgba(63,123,65,0.25)] bg-[rgba(63,123,65,0.10)] text-[var(--erp-success)]',
        blue:
          'border-[rgba(47,111,115,0.25)] bg-[rgba(47,111,115,0.10)] text-[var(--erp-info)]',
      },
    },
  },
)

export type BadgeTone = VariantProps<typeof badgeVariants>['tone']

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}
