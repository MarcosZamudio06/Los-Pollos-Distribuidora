import type { CSSProperties, ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ChartConfig = Record<string, { color?: string; label?: ReactNode }>

type ChartContainerProps = ComponentPropsWithoutRef<'div'> & {
  config: ChartConfig
}

function toCssVariables(config: ChartConfig) {
  return Object.entries(config).reduce<Record<string, string>>((variables, [key, value]) => {
    if (value.color) {
      variables[`--color-${key}`] = value.color
    }

    return variables
  }, {})
}

export function ChartContainer({
  className,
  config,
  style,
  ...props
}: ChartContainerProps) {
  return (
    <div
      className={cn(
        'min-h-[180px] w-full text-[var(--erp-foreground)] [&_.recharts-cartesian-axis-tick_text]:fill-[var(--erp-muted-foreground)] [&_.recharts-cartesian-grid_line]:stroke-[color:var(--erp-border)]',
        className,
      )}
      style={{ ...toCssVariables(config), ...(style as CSSProperties) }}
      {...props}
    />
  )
}
