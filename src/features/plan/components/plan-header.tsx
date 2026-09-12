import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { formatMonthLabel, shiftMonthKey } from '@/lib/dates'

interface PlanHeaderProps {
  monthKey: string
  onMonthChange: (monthKey: string) => void
  /** Moneda de presentación, ya resuelta por la página. */
  currencyCode: string
}

/**
 * Encabezado del Plan mensual: qué mes se está mirando y en qué moneda.
 *
 * El selector de mes es el **único control de datos** de toda la pantalla.
 * Ningún valor «Actual» se edita aquí ni en ninguna otra parte de `/plan`
 * (docs/09-plan-mensual.md).
 */
export function PlanHeader({ monthKey, onMonthChange, currencyCode }: PlanHeaderProps) {
  const previousMonth = shiftMonthKey(monthKey, -1)
  const nextMonth = shiftMonthKey(monthKey, 1)

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Plan mensual</h1>
        <p className="mt-0.5 text-sm text-muted-foreground first-letter:uppercase">
          {formatMonthLabel(monthKey)} · {currencyCode}
        </p>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onMonthChange(previousMonth)}
          aria-label={`Mes anterior: ${formatMonthLabel(previousMonth)}`}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>

        {/* Sin tope superior, a diferencia del dashboard: planificar un mes que
            todavía no ha llegado es justo para lo que existe esta pantalla. */}
        <input
          type="month"
          aria-label="Mes"
          value={monthKey}
          onChange={(event) => event.target.value && onMonthChange(event.target.value)}
          className="h-8 rounded-md bg-transparent px-2 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => onMonthChange(nextMonth)}
          aria-label={`Mes siguiente: ${formatMonthLabel(nextMonth)}`}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
