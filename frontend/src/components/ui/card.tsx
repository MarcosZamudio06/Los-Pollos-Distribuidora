import type { ComponentPropsWithoutRef, ReactNode } from 'react'

type CardProps = ComponentPropsWithoutRef<'article'>

export function Card({ className = '', ...props }: CardProps) {
  return (
    <article
      className={`rounded-[1.35rem] border border-[#20211f]/10 bg-white shadow-[0_18px_60px_rgba(32,33,31,0.07)] ${className}`}
      {...props}
    />
  )
}

export function CardHeader({ className = '', ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={`flex flex-col gap-2 ${className}`} {...props} />
}

export function CardTitle({ className = '', ...props }: ComponentPropsWithoutRef<'h2'>) {
  return <h2 className={`text-lg font-black tracking-[-0.035em] text-[#20211f] ${className}`} {...props} />
}

export function CardDescription({ className = '', ...props }: ComponentPropsWithoutRef<'p'>) {
  return <p className={`text-sm leading-6 text-[#68645c] ${className}`} {...props} />
}

export function CardContent({ className = '', children, ...props }: ComponentPropsWithoutRef<'div'> & { children?: ReactNode }) {
  return <div className={className} {...props}>{children}</div>
}
