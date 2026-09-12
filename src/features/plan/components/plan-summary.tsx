import { useId } from 'react'

import { formatAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'

import {
  formatPlannedAmount,
  formatPlannedIncomeAmount,
  formatUnassigned,
  planSummaryLabel,
  remainingTone,
  UNASSIGNED_NOTE,
  type PlanTone,
} from '../labels'

export interface PlanSummaryProps {
  currencyCode: string
  incomeActualMinor: number
  /** `null` cuando el mes no tiene ninguna fuente de ingreso planeada. */
  incomePlannedMinor: number | null
  expenseActualMinor: number
  expensePlannedMinor: number | null
  assignedMinor: number
  /** `null` cuando no hay ingreso planeado con el que comparar. */
  unassignedMinor: number | null
  remainingActualMinor: number
  remainingPlannedMinor: number | null
  savingsContributionsMinor: number
  savingsPlannedMinor: number | null
}

const TONE_STYLES: Record<PlanTone, string> = {
  neutral: 'text-foreground',
  positive: 'text-success',
  negative: 'text-danger',
}

interface SummaryCardProps {
  label: string
  /** Valor principal, ya formateado: la tarjeta no decide cómo se escribe. */
  value: string
  /** Contrapunto planeado/actual. «Planeado» y «Actual» nunca se funden. */
  caption: string
  tone: PlanTone
  /** Posición en la cuadrícula; escalona la animación de entrada. */
  index: number
}

function SummaryCard({ label, value, caption, tone, index }: SummaryCardProps) {
  const labelId = useId()

  return (
    <section
      aria-labelledby={labelId}
      className="animate-card-in flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <h3 id={labelId} className="text-sm font-medium text-muted-foreground">
        {label}
      </h3>
      <p className={cn('mt-3 text-2xl font-semibold tabular-nums', TONE_STYLES[tone])}>{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{caption}</p>
    </section>
  )
}

/**
 * Las seis cifras del mes.
 *
 * Cada tarjeta muestra lo real y, debajo, su contrapunto planeado: la regla es
 * no presentar nunca «Planeado» y «Actual» como una sola columna
 * (docs/03-ui-ux.md).
 *
 * Todo es de solo lectura. Las decisiones sobre qué significa un `null`, un
 * `0` o un negativo están en `labels.ts`, no aquí.
 */
export function PlanSummary({
  currencyCode,
  incomeActualMinor,
  incomePlannedMinor,
  expenseActualMinor,
  expensePlannedMinor,
  assignedMinor,
  unassignedMinor,
  remainingActualMinor,
  remainingPlannedMinor,
  savingsContributionsMinor,
  savingsPlannedMinor,
}: PlanSummaryProps) {
  const titleId = useId()
  const unassigned = formatUnassigned(unassignedMinor, currencyCode)

  /** Contrapunto planeado de un gasto o un aporte. */
  const planned = (plannedMinor: number | null) =>
    `Planeado: ${formatPlannedAmount(plannedMinor, currencyCode)}`

  /** Contrapunto de las cifras que se miden contra el ingreso planeado. */
  const plannedIncome = (plannedMinor: number | null) =>
    `Planeado: ${formatPlannedIncomeAmount(plannedMinor, currencyCode)}`

  return (
    <section aria-labelledby={titleId} className="mt-6">
      <h2 id={titleId} className="text-base font-semibold text-foreground">
        Resumen del mes
      </h2>

      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard
          index={0}
          label={planSummaryLabel.income}
          value={formatAmount(incomeActualMinor, currencyCode)}
          caption={plannedIncome(incomePlannedMinor)}
          tone="neutral"
        />
        <SummaryCard
          index={1}
          label={planSummaryLabel.expenses}
          value={formatAmount(expenseActualMinor, currencyCode)}
          caption={`Presupuestado: ${formatPlannedAmount(expensePlannedMinor, currencyCode)}`}
          tone="neutral"
        />
        <SummaryCard
          index={2}
          label={planSummaryLabel.assigned}
          value={formatAmount(assignedMinor, currencyCode)}
          caption={`Ingreso planeado: ${formatPlannedIncomeAmount(incomePlannedMinor, currencyCode)}`}
          tone="neutral"
        />
        <SummaryCard
          index={3}
          label={planSummaryLabel.unassigned}
          value={unassigned.text}
          caption={`Asignado: ${formatAmount(assignedMinor, currencyCode)}`}
          tone={unassigned.tone}
        />
        <SummaryCard
          index={4}
          label={planSummaryLabel.remaining}
          value={formatAmount(remainingActualMinor, currencyCode)}
          caption={plannedIncome(remainingPlannedMinor)}
          tone={remainingTone(remainingActualMinor)}
        />
        {/* «Aportes a ahorro», nunca «Total ahorrado»: es el flujo del mes, no
            el saldo acumulado de las cuentas de ahorro. */}
        <SummaryCard
          index={5}
          label={planSummaryLabel.savingsContributions}
          value={formatAmount(savingsContributionsMinor, currencyCode)}
          caption={planned(savingsPlannedMinor)}
          tone="neutral"
        />
      </div>

      {/* Nota fija, no un tooltip: se lee siempre (docs/03-ui-ux.md). */}
      <p className="mt-3 text-xs text-muted-foreground">{UNASSIGNED_NOTE}</p>
    </section>
  )
}
