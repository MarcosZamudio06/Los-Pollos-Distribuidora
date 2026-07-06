import type { ComponentPropsWithoutRef } from 'react'

export function Table({ className = '', ...props }: ComponentPropsWithoutRef<'table'>) {
  return <table className={`min-w-full border-separate border-spacing-0 text-left text-sm ${className}`} {...props} />
}

export function Th({ className = '', ...props }: ComponentPropsWithoutRef<'th'>) {
  return <th className={`border-b border-[#20211f]/10 px-4 py-3 text-xs font-black uppercase tracking-[0.16em] text-[#68645c] ${className}`} {...props} />
}

export function Td({ className = '', ...props }: ComponentPropsWithoutRef<'td'>) {
  return <td className={`border-b border-[#20211f]/8 px-4 py-3 align-top text-[#20211f] ${className}`} {...props} />
}
