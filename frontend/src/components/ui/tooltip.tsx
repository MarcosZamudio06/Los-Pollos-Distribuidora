import { createContext, useContext, useMemo, useState, type HTMLAttributes, type PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type TooltipContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const TooltipContext = createContext<TooltipContextValue | null>(null)

function useTooltipContext() {
  const context = useContext(TooltipContext)

  if (!context) {
    throw new Error('Tooltip components must be used within Tooltip.')
  }

  return context
}

export function Tooltip({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false)
  const value = useMemo(() => ({ open, setOpen }), [open])

  return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>
}

export function TooltipTrigger({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  const { open, setOpen } = useTooltipContext()

  return (
    <span
      className={cn('inline-flex', className)}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      aria-describedby={open ? 'erp-tooltip-content' : undefined}
      {...props}
    >
      {children}
    </span>
  )
}

export function TooltipContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const { open } = useTooltipContext()

  if (!open) {
    return null
  }

  return (
    <div
      id="erp-tooltip-content"
      className={cn(
        'pointer-events-none absolute z-50 mt-2 max-w-xs rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-graphite)] px-3 py-2 text-xs font-medium text-white shadow-[0_18px_40px_rgba(17,24,21,0.18)]',
        className,
      )}
      role="tooltip"
      {...props}
    >
      {children}
    </div>
  )
}
