import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { ChartTooltip } from '@/components/charts/chart-tooltip'
import { useChartMotion } from '@/components/charts/use-chart-motion'
import { formatAmount } from '@/lib/currency'

import type { CategorySlice } from '../summary'

interface CategoryDonutProps {
  slices: CategorySlice[]
  currencyCode: string
}

const percentFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

/**
 * Reparto del gasto del mes por categoría.
 *
 * La leyenda muestra nombre, monto y porcentaje de cada porción: es lo que
 * hace legible el gráfico sin depender del color ni de pasar el mouse, y a la
 * vez es su equivalente accesible.
 */
export function CategoryDonut({ slices, currencyCode }: CategoryDonutProps) {
  const motion = useChartMotion()
  const totalMinor = slices.reduce((sum, slice) => sum + slice.amountMinor, 0)

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="relative mx-auto h-44 w-44 shrink-0">
        <div className="absolute inset-0" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="amountMinor"
                nameKey="name"
                innerRadius="64%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="none"
                // Empieza arriba y avanza en sentido horario, así la porción
                // mayor (las rebanadas llegan ordenadas) queda a las 12.
                startAngle={90}
                endAngle={-270}
                {...motion}
              >
                {slices.map((slice) => (
                  <Cell key={slice.id} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip currencyCode={currencyCode} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-muted-foreground">Total</span>
          <span className="px-2 text-sm font-semibold tabular-nums text-foreground">
            {formatAmount(totalMinor, currencyCode)}
          </span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {slices.map((slice) => (
          <li key={slice.id} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate text-foreground">{slice.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {percentFormatter.format(slice.share * 100)} %
            </span>
            <span className="shrink-0 pl-2 font-medium tabular-nums text-foreground">
              {formatAmount(slice.amountMinor, currencyCode)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
