import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import { budgetStatusTone, formatBudgetPercent } from '../labels'
import type { BudgetProgress } from '../progress'

interface BudgetProgressBarProps {
  progress: BudgetProgress
  categoryName: string
  currencyCode: string
}

const TONE_BAR: Record<string, string> = {
  ok: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  neutral: 'bg-muted-foreground',
}

const TONE_TEXT: Record<string, string> = {
  ok: 'text-foreground',
  warning: 'text-warning',
  danger: 'text-danger',
  neutral: 'text-muted-foreground',
}

/**
 * Progreso de una categoría en un mes.
 *
 * Sin presupuesto no se dibuja barra. Una barra al 0% junto a un gasto real
 * sugeriría "vas bien", que es lo contrario de lo que ocurre: no hay nada con
 * qué comparar. En su lugar se dice explícitamente que no hay presupuesto y se
 * muestra el gasto por separado.
 */
export function BudgetProgressBar({
  progress,
  categoryName,
  currencyCode,
}: BudgetProgressBarProps) {
  const spent = formatAmount(progress.spentMinor, currencyCode)

  if (progress.budgetMinor === null) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          Sin presupuesto este mes
          {/* `source` solo puede ser 'exception' aquí si el usuario fijó un 0
              deliberado para este mes: conviene distinguirlo de "nunca se
              configuró", porque se deshace de formas distintas. */}
          {progress.source === 'exception' && ' · excepción de este mes'}
        </p>
        <p className="text-sm text-foreground">
          Gastado: <span className="font-medium">{spent}</span>
        </p>
      </div>
    )
  }

  const budget = formatAmount(progress.budgetMinor, currencyCode)
  const ratio = progress.ratio ?? 0
  const tone = budgetStatusTone[progress.status]

  // El ancho y `aria-valuenow` se recortan a 100 porque una barra no puede
  // dibujar más que su propio carril y el rango declarado es 0-100. El
  // porcentaje real sí se muestra en texto, y `aria-valuetext` lo repite para
  // que quien use lector de pantalla no reciba solo el 100 recortado.
  const clamped = Math.min(Math.max(Math.round(ratio * 100), 0), 100)
  const isOver = progress.status === 'over'
  const difference = Math.abs(progress.remainingMinor ?? 0)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          <span className="font-medium text-foreground">{spent}</span> de {budget}
        </span>
        <span className={cn('font-medium tabular-nums', TONE_TEXT[tone])}>
          {formatBudgetPercent(ratio)}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={`Progreso de ${categoryName}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={
          isOver
            ? `Presupuesto superado: ${spent} gastados de ${budget}`
            : `${formatBudgetPercent(ratio)} de ${budget}`
        }
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', TONE_BAR[tone])}
          style={{ width: `${clamped}%` }}
        />
      </div>

      <p className={cn('text-xs', isOver ? 'text-danger' : 'text-muted-foreground')}>
        {isOver
          ? `Excedido por ${formatAmount(difference, currencyCode)}`
          : `Quedan ${formatAmount(difference, currencyCode)}`}
      </p>
    </div>
  )
}
