import { formatAmount } from '@/lib/currency'

import type { Diff, DiffRowKind } from './calculations/diff'

/**
 * Textos y tonos del Plan mensual.
 *
 * Aquí viven las reglas de presentación que `docs/09-plan-mensual.md` y
 * `docs/03-ui-ux.md` declaran no negociables, para que ningún componente las
 * reimplemente ni decida por su cuenta qué significa un `null`, un `0` o un
 * negativo. Los componentes llaman a estas funciones; no repiten literales.
 *
 * Solo contiene lo que se renderiza en esta entrega. Los estados de pago, el
 * reparto y la reconciliación traerán los suyos cuando existan.
 */

/** Sin presupuesto aplicable: la diferencia es nula, nunca `0`. */
export const NO_BUDGET_LABEL = 'Sin presupuesto'

/**
 * No hay ingreso planeado con el que comparar. Distinto de «Sobreasignado»:
 * sin referencia no hay exceso que declarar, aunque existan presupuestos en
 * `/budgets`, que viven al margen del plan del mes.
 */
export const NO_PLANNED_INCOME_LABEL = 'Sin ingreso planeado'

/** «Por asignar» negativo se dice en texto, nunca como un negativo desnudo. */
export const OVER_ALLOCATED_LABEL = 'Sobreasignado'

/** Nota fija bajo el resumen. No es un tooltip: se lee siempre. */
export const UNASSIGNED_NOTE = '«Por asignar» compara planes; no es dinero disponible.'

export type PlanTone = 'neutral' | 'positive' | 'negative'

/**
 * Importe planeado tal como se escribe.
 *
 * `null` significa que no hay nada que defina ese plan —ninguna fuente,
 * ninguna línea, ninguna categoría presupuestada— y se dice con palabras. Un
 * `0` es una decisión explícita del usuario y se conserva como `0`: convertirlo
 * en «Sin presupuesto» borraría esa decisión.
 */
export function formatPlannedAmount(plannedMinor: number | null, currencyCode: string): string {
  if (plannedMinor === null) return NO_BUDGET_LABEL
  return formatAmount(plannedMinor, currencyCode)
}

/**
 * Ingreso planeado, y todo lo que se deriva de él.
 *
 * Su ausencia no es «Sin presupuesto»: lo que falta es el ingreso con el que
 * comparar, no un presupuesto de gasto. Distinguirlo importa porque el
 * restante planeado **es** «por asignar», y este es el único sitio donde se
 * decide cómo se dice.
 */
export function formatPlannedIncomeAmount(
  plannedMinor: number | null,
  currencyCode: string,
): string {
  if (plannedMinor === null) return NO_PLANNED_INCOME_LABEL
  return formatAmount(plannedMinor, currencyCode)
}

export const diffStatusLabel: Record<Diff['status'], string> = {
  no_budget: NO_BUDGET_LABEL,
  on_target: 'En objetivo',
  favorable: 'Favorable',
  unfavorable: 'Desfavorable',
}

/** El color solo acompaña al texto; nunca es el único portador del sentido. */
export const diffStatusTone: Record<Diff['status'], PlanTone> = {
  no_budget: 'neutral',
  on_target: 'neutral',
  favorable: 'positive',
  unfavorable: 'negative',
}

/**
 * Diferencia completa: «Favorable por COP 20.000».
 *
 * La igualdad exacta es «En objetivo», ni favorable ni desfavorable, y sin
 * presupuesto se dice «Sin presupuesto» — en ninguno de los dos casos se
 * escribe una cantidad, porque no la hay.
 */
export function formatDiff(diff: Diff, currencyCode: string): string {
  if (diff.status === 'no_budget' || diff.status === 'on_target')
    return diffStatusLabel[diff.status]
  return `${diffStatusLabel[diff.status]} por ${formatAmount(diff.amountMinor, currencyCode)}`
}

export interface UnassignedLabel {
  text: string
  tone: PlanTone
}

/**
 * «Por asignar», con sus tres lecturas:
 *
 * - `null`: no hay ingreso planeado, así que no hay comparación válida.
 * - Negativo: se ha asignado más que el ingreso planeado, y se dice
 *   «Sobreasignado» con la magnitud en positivo.
 * - Cero o positivo: la cifra tal cual. Un `0` significa que el plan está
 *   completo, no que falte información.
 */
export function formatUnassigned(
  unassignedMinor: number | null,
  currencyCode: string,
): UnassignedLabel {
  if (unassignedMinor === null) return { text: NO_PLANNED_INCOME_LABEL, tone: 'neutral' }

  if (unassignedMinor < 0) {
    return {
      text: `${OVER_ALLOCATED_LABEL} por ${formatAmount(-unassignedMinor, currencyCode)}`,
      tone: 'negative',
    }
  }

  return { text: formatAmount(unassignedMinor, currencyCode), tone: 'neutral' }
}

/** Las seis tarjetas del resumen de esta entrega. */
export type PlanSummaryCardId =
  'income' | 'expenses' | 'assigned' | 'unassigned' | 'remaining' | 'savingsContributions'

/**
 * `savingsContributions` es **«Aportes a ahorro»**, el flujo del mes.
 * Nunca «Total ahorrado»: ese nombre se confundiría con el saldo acumulado,
 * que es otra cifra distinta y no entra en esta pantalla
 * (docs/09-plan-mensual.md, «Las tres cifras de ahorro»).
 */
export const planSummaryLabel: Record<PlanSummaryCardId, string> = {
  income: 'Ingreso total',
  expenses: 'Total gastado',
  assigned: 'Presupuesto asignado',
  unassigned: 'Por asignar',
  remaining: 'Restante',
  savingsContributions: 'Aportes a ahorro',
}

/** Filas del cuadro Presupuesto vs. Actual en esta entrega. */
export type PlanRowId =
  | 'income'
  | 'expensesTotal'
  | 'bills'
  | 'variables'
  | 'unplanned'
  | 'savings'
  | 'investment'
  | 'debt'
  | 'remaining'

export const planRowLabel: Record<PlanRowId, string> = {
  income: 'Ingresos',
  expensesTotal: 'Gastos totales',
  bills: 'Facturas',
  variables: 'Gastos variables',
  unplanned: 'No planeado',
  savings: 'Ahorro',
  investment: 'Inversión',
  debt: 'Deuda',
  remaining: 'Restante',
}

/**
 * «Planeado» de una fila del cuadro.
 *
 * Ingresos y restante se miden contra el ingreso planeado; el resto, contra un
 * presupuesto. Cuando falta, cada uno lo dice a su manera.
 */
export function formatRowPlannedAmount(
  rowId: PlanRowId,
  plannedMinor: number | null,
  currencyCode: string,
): string {
  if (rowId === 'income' || rowId === 'remaining') {
    return formatPlannedIncomeAmount(plannedMinor, currencyCode)
  }
  return formatPlannedAmount(plannedMinor, currencyCode)
}

/**
 * Convención de signo de cada fila (docs/09-plan-mensual.md, «Diferencia»).
 *
 * En ingresos, ahorro e inversión, más real que planeado es favorable. En
 * gastos, facturas, variables y deuda, es al revés. El restante sigue la regla
 * de los ingresos: que sobre más de lo planeado es una buena noticia.
 */
export const planRowDiffKind: Record<PlanRowId, DiffRowKind> = {
  income: 'income_like',
  expensesTotal: 'expense_like',
  bills: 'expense_like',
  variables: 'expense_like',
  unplanned: 'expense_like',
  savings: 'income_like',
  investment: 'income_like',
  debt: 'expense_like',
  remaining: 'income_like',
}

/**
 * Los dos grupos del cuadro, y por qué están separados: las filas del desglose
 * suman Gastos totales; las indicadoras no forman parte de esa suma. La
 * separación es semántica, no decorativa.
 */
export type PlanRowGroupId = 'income' | 'breakdown' | 'indicators'

export const planRowGroupLabel: Record<PlanRowGroupId, string> = {
  income: 'Ingresos',
  breakdown: 'Desglose de gastos',
  indicators: 'Indicadores',
}

export const planRowGroupNote: Record<PlanRowGroupId, string | null> = {
  income: null,
  breakdown: 'Facturas, gastos variables y no planeado suman los gastos totales.',
  indicators: 'No forman parte de los gastos totales: se miden aparte.',
}
