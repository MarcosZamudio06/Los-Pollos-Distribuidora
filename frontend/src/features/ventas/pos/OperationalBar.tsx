import type { ReactNode } from 'react'

type OperationalBarProps = {
  children: ReactNode
}

export function OperationalBar({ children }: OperationalBarProps) {
  return <header className="flex h-[52px] shrink-0 items-center border-b border-[var(--pos-steel)] px-3 text-xs" aria-label="Estado operativo del POS">{children}</header>
}
