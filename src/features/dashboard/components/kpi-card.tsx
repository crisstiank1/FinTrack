import { useId } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { DeltaBadge } from './delta-badge'

type KpiTone = 'income' | 'expense' | 'savings'

interface KpiCardProps {
  label: string
  /** Valor ya formateado: la tarjeta no decide cómo se escribe una cifra. */
  value: string
  icon: LucideIcon
  tone: KpiTone
  delta: number | null
  deltaUnit?: 'percent' | 'points'
  higherIsBetter: boolean
  caption: string
  /** Posición en la cuadrícula; escalona la animación de entrada. */
  index: number
}

const TONE_STYLES: Record<KpiTone, { chip: string; value: string }> = {
  income: { chip: 'bg-success/12 text-success', value: 'text-success' },
  expense: { chip: 'bg-danger/12 text-danger', value: 'text-danger' },
  savings: { chip: 'bg-primary/12 text-primary', value: 'text-foreground' },
}

/**
 * Cada KPI es una región con nombre: así un lector de pantalla puede saltar
 * directamente a "Gastos del mes" en vez de recorrer la cuadrícula entera.
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
  delta,
  deltaUnit,
  higherIsBetter,
  caption,
  index,
}: KpiCardProps) {
  const labelId = useId()
  const styles = TONE_STYLES[tone]

  return (
    <section
      aria-labelledby={labelId}
      className="animate-card-in flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow duration-200 hover:shadow-md"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={labelId} className="text-sm font-medium text-muted-foreground">
          {label}
        </h2>
        <span
          className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', styles.chip)}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>

      <p className={cn('mt-3 text-2xl font-semibold tabular-nums', styles.value)}>{value}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <DeltaBadge value={delta} unit={deltaUnit} higherIsBetter={higherIsBetter} />
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
    </section>
  )
}
