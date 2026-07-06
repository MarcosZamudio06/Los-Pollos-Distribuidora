import type { ComponentPropsWithoutRef } from 'react'

export function Input({ className = '', ...props }: ComponentPropsWithoutRef<'input'>) {
  return (
    <input
      className={`rounded-xl border border-[#20211f]/15 px-3 py-2.5 text-sm font-semibold text-[#20211f] transition placeholder:text-[#68645c]/70 focus:border-[#39798b] focus:outline-none focus:ring-4 focus:ring-[#39798b]/15 disabled:cursor-not-allowed disabled:bg-[#f5f3ee] disabled:opacity-70 ${className}`}
      {...props}
    />
  )
}
