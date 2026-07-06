import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from 'react'

export type ChartConfig = Record<string, { color?: string; label?: ReactNode }>

type ChartContainerProps = ComponentPropsWithoutRef<'div'> & {
  config: ChartConfig
}

function toCssVariables(config: ChartConfig) {
  return Object.entries(config).reduce<Record<string, string>>((variables, [key, value]) => {
    if (value.color) variables[`--color-${key}`] = value.color
    return variables
  }, {})
}

export function ChartContainer({ className = '', config, style, ...props }: ChartContainerProps) {
  return (
    <div
      className={`min-h-[180px] w-full text-[#20211f] [&_.recharts-cartesian-axis-tick_text]:fill-[#68645c] [&_.recharts-cartesian-grid_line]:stroke-[#20211f]/10 ${className}`}
      style={{ ...toCssVariables(config), ...style } as CSSProperties}
      {...props}
    />
  )
}
