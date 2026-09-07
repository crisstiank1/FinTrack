import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartTooltip } from '@/components/charts/chart-tooltip'
import { useChartMotion } from '@/components/charts/use-chart-motion'
import { useChartTheme } from '@/components/charts/use-chart-theme'
import { formatAmount, formatCompactAmount } from '@/lib/currency'
import { formatMonthLabel } from '@/lib/dates'

import type { TrendPoint } from '../summary'

interface IncomeExpenseChartProps {
  trend: TrendPoint[]
  currencyCode: string
}

/**
 * Ingresos contra gastos de los últimos meses. Barras agrupadas en vez de
 * apiladas: la pregunta que responde es "¿gasté más de lo que entró?", y eso
 * se lee comparando alturas lado a lado.
 */
export function IncomeExpenseChart({ trend, currencyCode }: IncomeExpenseChartProps) {
  const theme = useChartTheme()
  const motion = useChartMotion()

  const monthKeyByLabel = useMemo(
    () => new Map(trend.map((point) => [point.label, point.monthKey])),
    [trend],
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <LegendItem color={theme.income} label="Ingresos" />
        <LegendItem color={theme.expense} label="Gastos" />
      </div>

      <div className="h-56 min-h-56" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barGap={4}>
            <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: theme.axis, fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fill: theme.axis, fontSize: 11 }}
              tickFormatter={(value: number) => formatCompactAmount(value)}
            />
            <Tooltip
              cursor={{ fill: theme.grid, fillOpacity: 0.35 }}
              content={
                <ChartTooltip
                  currencyCode={currencyCode}
                  formatLabel={(label) => {
                    const monthKey = monthKeyByLabel.get(label)
                    return monthKey ? formatMonthLabel(monthKey) : label
                  }}
                />
              }
            />
            <Bar
              dataKey="incomeMinor"
              name="Ingresos"
              fill={theme.income}
              radius={[4, 4, 0, 0]}
              {...motion}
            />
            <Bar
              dataKey="expenseMinor"
              name="Gastos"
              fill={theme.expense}
              radius={[4, 4, 0, 0]}
              {...motion}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Equivalente accesible del gráfico. */}
      <ul className="sr-only">
        {trend.map((point) => (
          <li key={point.monthKey}>
            {formatMonthLabel(point.monthKey)}: ingresos{' '}
            {formatAmount(point.incomeMinor, currencyCode)}, gastos{' '}
            {formatAmount(point.expenseMinor, currencyCode)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  )
}
