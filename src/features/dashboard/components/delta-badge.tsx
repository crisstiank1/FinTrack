import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'

import { cn } from '@/lib/utils'

interface DeltaBadgeProps {
  /** Variación contra el mes anterior. `null` cuando no hay base comparable. */
  value: number | null
  /** 'points' rotula puntos porcentuales (tasa de ahorro); 'percent', variación relativa. */
  unit?: 'percent' | 'points'
  /** Si crecer es deseable (ingresos, ahorro) o no (gastos). */
  higherIsBetter: boolean
  className?: string
}

const NEUTRAL_THRESHOLD = 0.05

/**
 * Comparación contra el mes anterior.
 *
 * El significado no depende solo del color: la flecha y el signo comunican la
 * dirección por sí solos, y un texto para lectores de pantalla aclara contra
 * qué se compara (docs/03-ui-ux.md: el color no puede ser el único indicador).
 */
export function DeltaBadge({
  value,
  unit = 'percent',
  higherIsBetter,
  className,
}: DeltaBadgeProps) {
  if (value === null) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
          className,
        )}
      >
        <Minus className="size-3" aria-hidden="true" />
        Sin base previa
      </span>
    )
  }

  const isFlat = Math.abs(value) < NEUTRAL_THRESHOLD
  const isUp = value > 0
  const isGood = isFlat ? null : isUp === higherIsBetter

  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight
  const formatted = new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 1,
    signDisplay: isFlat ? 'never' : 'always',
  }).format(isFlat ? 0 : value)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        isGood === null && 'bg-muted text-muted-foreground',
        isGood === true && 'bg-success/12 text-success',
        isGood === false && 'bg-danger/12 text-danger',
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {formatted}
      {unit === 'points' ? ' pp' : ' %'}
      <span className="sr-only"> respecto al mes anterior</span>
    </span>
  )
}
