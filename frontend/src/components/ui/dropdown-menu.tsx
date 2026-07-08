import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type HTMLAttributes, type MouseEvent, type PropsWithChildren } from 'react'
import { cn } from '@/lib/utils'

type DropdownMenuContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenuContext() {
  const context = useContext(DropdownMenuContext)

  if (!context) {
    throw new Error('DropdownMenu components must be used within DropdownMenu.')
  }

  return context
}

export function DropdownMenu({ children, className }: PropsWithChildren<{ className?: string }>) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const value = useMemo(() => ({ open, setOpen }), [open])

  return (
    <DropdownMenuContext.Provider value={value}>
      <div ref={rootRef} className={cn('relative inline-flex', className)} data-dropdown-menu={id}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

export function DropdownMenuTrigger({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  const { open, setOpen } = useDropdownMenuContext()

  return (
    <button
      aria-expanded={open}
      aria-haspopup="menu"
      className={cn(
        'inline-flex items-center justify-center rounded-xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] px-3 py-2 text-sm font-semibold text-[var(--erp-foreground)] shadow-[0_10px_28px_rgba(17,24,21,0.08)] transition hover:border-[rgba(47,111,115,0.36)] hover:text-[var(--erp-info)]',
        className,
      )}
      onClick={() => setOpen(!open)}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export function DropdownMenuContent({
  align = 'end',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }) {
  const { open } = useDropdownMenuContext()

  if (!open) {
    return null
  }

  return (
    <div
      className={cn(
        'absolute top-full z-50 mt-2 min-w-48 overflow-hidden rounded-2xl border border-[color:var(--erp-border)] bg-[var(--erp-surface-elevated)] p-1 shadow-[0_24px_70px_rgba(17,24,21,0.14)]',
        align === 'end' ? 'right-0' : 'left-0',
        className,
      )}
      role="menu"
      {...props}
    />
  )
}

export function DropdownMenuItem({
  children,
  className,
  onClick,
  ...props
}: HTMLAttributes<HTMLButtonElement>) {
  const { setOpen } = useDropdownMenuContext()

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event)
    setOpen(false)
  }

  return (
    <button
      className={cn(
        'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-[var(--erp-foreground)] transition hover:bg-[var(--erp-surface-muted)] hover:text-[var(--erp-info)]',
        className,
      )}
      onClick={handleClick}
      role="menuitem"
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export function DropdownMenuSeparator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('my-1 h-px bg-[color:var(--erp-border)]', className)} role="separator" {...props} />
}
