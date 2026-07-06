import type { ComponentPropsWithoutRef } from 'react'

type AlertTone = 'info' | 'error' | 'warning'

const toneClasses: Record<AlertTone, string> = {
  error: 'border-[#d43f2f]/30 bg-[#fff0ee] text-[#7f231b]',
  info: 'border-[#39798b]/25 bg-[#e9f5f7] text-[#275969]',
  warning: 'border-[#f0b44c]/40 bg-[#fff6df] text-[#815512]',
}

export function Alert({ className = '', tone = 'info', ...props }: ComponentPropsWithoutRef<'aside'> & { tone?: AlertTone }) {
  return <aside className={`rounded-2xl border p-4 ${toneClasses[tone]} ${className}`} {...props} />
}
