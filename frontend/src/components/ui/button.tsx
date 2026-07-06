import type { ComponentPropsWithoutRef } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-[#9d2d24] bg-[#9d2d24] text-white hover:bg-[#84251e]',
  secondary: 'border-[#20211f]/15 bg-white text-[#20211f] hover:border-[#9d2d24] hover:text-[#9d2d24]',
  ghost: 'border-transparent bg-transparent text-[#39798b] hover:bg-[#39798b]/10',
}

export function Button({ className = '', type = 'button', variant = 'primary', ...props }: ComponentPropsWithoutRef<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-bold transition focus:outline-none focus:ring-4 focus:ring-[#f0b44c]/40 disabled:cursor-not-allowed disabled:opacity-60 ${variantClasses[variant]} ${className}`}
      type={type}
      {...props}
    />
  )
}
