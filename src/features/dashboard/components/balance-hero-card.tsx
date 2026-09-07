import { useId, useMemo } from 'react'
import { Wallet } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartTooltip } from '@/components/charts/chart-tooltip'
import { useChartMotion } from '@/components/charts/use-chart-motion'
import { useChartTheme } from '@/components/charts/use-chart-theme'
import { formatAmount } from '@/lib/currency'
import { formatMonthLabel } from '@/lib/dates'
import { cn } from '@/lib/utils'

import { DeltaBadge } from './delta-badge'
import type { MetricComparison, TrendPoint } from '../summary'

interface BalanceHeroCardProps {
  balance: MetricComparison
  currencyCode: string
  /** 'Todas las cuentas' o el nombre de la cuenta filtrada. */
  scopeLabel: string
  /** 'Al 30 de septiembre de 2026'. */
  asOfLabel: string
  trend: TrendPoint[]
  className?: string
}

/**
 * Tarjeta principal del dashboard: rompe la retícula de KPIs idénticos y
 * concentra la cifra que el usuario viene a ver, con su tendencia de saldo.
 */
export function BalanceHeroCard({
  balance,
  currencyCode,
  scopeLabel,
  asOfLabel,
  trend,
  className,
}: BalanceHeroCardProps) {
  const theme = useChartTheme()
  const motion = useChartMotion()
  const labelId = useId()

  // El eje X muestra 'sep'; el tooltip merece 'septiembre 2026'.
  const monthKeyByLabel = useMemo(
    () => new Map(trend.map((point) => [point.label, point.monthKey])),
    [trend],
  )

  return (
    <section
      aria-labelledby={labelId}
      className={cn(
        'animate-card-in relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/8 to-transparent"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <h2 id={labelId} className="text-sm font-medium text-muted-foreground">
            Saldo consolidado
          </h2>
          <p className="text-xs text-muted-foreground">{scopeLabel}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Wallet className="size-5" aria-hidden="true" />
        </span>
      </div>

      <p className="relative mt-4 text-4xl font-semibold tabular-nums tracking-tight text-foreground">
        {formatAmount(balance.currentMinor, currencyCode)}
      </p>

      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        <DeltaBadge value={balance.deltaPercent} higherIsBetter />
        <span className="text-xs text-muted-foreground">{asOfLabel}</span>
      </div>

      <div className="relative mt-6 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Tendencia de saldo
        </p>

        <div className="mt-2 h-40 min-h-40" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            {/* Margen lateral suficiente para que la etiqueta del primer y del
                último mes quepan enteras; con 4px Recharts las ocultaba. */}
            <AreaChart data={trend} margin={{ top: 8, right: 14, bottom: 0, left: 14 }}>
              <defs>
                <linearGradient id="fintrack-balance-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.balance} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={theme.balance} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={theme.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={{ fill: theme.axis, fontSize: 12 }}
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                cursor={{ stroke: theme.grid, strokeWidth: 1 }}
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
              <Area
                type="monotone"
                dataKey="balanceMinor"
                name="Saldo"
                stroke={theme.balance}
                strokeWidth={2}
                fill="url(#fintrack-balance-fill)"
                dot={false}
                activeDot={{ r: 4 }}
                {...motion}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* El SVG es inaccesible por sí solo: esta lista da los mismos datos. */}
        <ul className="sr-only">
          {trend.map((point) => (
            <li key={point.monthKey}>
              {formatMonthLabel(point.monthKey)}: saldo al cierre{' '}
              {formatAmount(point.balanceMinor, currencyCode)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
