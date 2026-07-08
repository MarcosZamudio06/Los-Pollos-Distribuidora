import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition duration-200 focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-60',
  {
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
    variants: {
      size: {
        md: 'h-10',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-11 px-5 text-sm',
      },
      variant: {
        primary:
          'border-[var(--erp-brand-red)] bg-[var(--erp-brand-red)] text-[var(--erp-on-brand)] shadow-[0_10px_28px_rgba(182,42,34,0.16)] hover:bg-[var(--erp-brand-red-strong)] focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]',
        secondary:
          'border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] text-[var(--erp-foreground)] hover:border-[var(--erp-brand-red)] hover:text-[var(--erp-brand-red)] focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]',
        outline:
          'border-[color:var(--erp-border)] bg-transparent text-[var(--erp-foreground)] hover:border-[var(--erp-brand-gold)] hover:bg-[var(--erp-surface-muted)] focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]',
        ghost:
          'border-transparent bg-transparent text-[var(--erp-muted-foreground)] hover:bg-[var(--erp-surface-muted)] hover:text-[var(--erp-foreground)] focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]',
        destructive:
          'border-[var(--erp-danger)] bg-[var(--erp-danger)] text-[var(--erp-on-brand)] shadow-[0_10px_28px_rgba(157,45,36,0.16)] hover:bg-[var(--erp-brand-red-strong)] focus-visible:ring-4 focus-visible:ring-[var(--erp-brand-gold)]',
      },
    },
  },
)

export type ButtonVariant = VariantProps<typeof buttonVariants>['variant']
export type ButtonSize = VariantProps<typeof buttonVariants>['size']

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export function Button({
  className,
  size,
  type = 'button',
  variant,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ size, variant }), className)}
      type={type}
      {...props}
    />
  )
}
