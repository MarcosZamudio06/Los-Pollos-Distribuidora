import type { ComponentPropsWithoutRef } from 'react'

type BadgeTone = 'amber' | 'blue' | 'green' | 'red' | 'slate'

const toneClasses: Record<BadgeTone, string> = {
  amber: 'border-[#f0b44c]/40 bg-[#fff6df] text-[#815512]',
  blue: 'border-[#39798b]/30 bg-[#e9f5f7] text-[#275969]',
  green: 'border-[#4d7f4a]/30 bg-[#eef8ed] text-[#315f2e]',
  red: 'border-[#d43f2f]/30 bg-[#fff0ee] text-[#9d2d24]',
  slate: 'border-[#20211f]/15 bg-[#f1eee7] text-[#20211f]',
}

export function Badge({ className = '', tone = 'slate', ...props }: ComponentPropsWithoutRef<'span'> & { tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] ${toneClasses[tone]} ${className}`}
      {...props}
    />
  )
}
