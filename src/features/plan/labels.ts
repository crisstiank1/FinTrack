import { formatAmount } from '@/lib/currency'

import type { AllocationGroup } from './calculations/allocation'
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
 * Filas que se miden contra el ingreso planeado y no contra un presupuesto:
 * los ingresos, y el restante, que es «por asignar» leído al revés.
 *
 * Está en un solo sitio porque la distinción tiene que valer para **todas** las
 * columnas de esas filas. Que el planeado dijera «Sin ingreso planeado» y la
 * diferencia «Sin presupuesto» hacía que una misma fila diera dos versiones de
 * la misma ausencia.
 */
const INCOME_MEASURED_ROWS: readonly PlanRowId[] = ['income', 'remaining']

function isIncomeMeasuredRow(rowId: PlanRowId): boolean {
  return INCOME_MEASURED_ROWS.includes(rowId)
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
  if (isIncomeMeasuredRow(rowId)) {
    return formatPlannedIncomeAmount(plannedMinor, currencyCode)
  }
  return formatPlannedAmount(plannedMinor, currencyCode)
}

/**
 * «Diferencia» de una fila del cuadro.
 *
 * `calculateDiff` devuelve `no_budget` siempre que no hay nada que comparar,
 * sin saber por qué falta. Aquí se nombra la causa real de cada fila: en
 * ingresos y restante lo que falta es el ingreso planeado, no un presupuesto.
 */
export function formatRowDiff(rowId: PlanRowId, diff: Diff, currencyCode: string): string {
  if (diff.status === 'no_budget' && isIncomeMeasuredRow(rowId)) return NO_PLANNED_INCOME_LABEL
  return formatDiff(diff, currencyCode)
}

/**
 * Tono del restante realmente ocurrido.
 *
 * Negativo significa que salió más dinero del que entró, contando los aportes:
 * es la señal más importante del mes y no debe leerse igual que un sobrante. El
 * signo sigue estando en el texto, así que el color solo acompaña
 * (docs/03-ui-ux.md).
 */
export function remainingTone(remainingActualMinor: number): PlanTone {
  return remainingActualMinor < 0 ? 'negative' : 'neutral'
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

/* -------------------------------------------------------------------------- */
/* Reparto 50/30/20                                                           */
/* -------------------------------------------------------------------------- */

/** Los cinco destinos del ingreso. El orden lo fija `ALLOCATION_GROUPS`. */
export const allocationGroupLabel: Record<AllocationGroup, string> = {
  needs: 'Necesidades',
  wants: 'Deseos',
  savings: 'Ahorro',
  investment: 'Inversión',
  debt: 'Deuda',
}

/**
 * Convención de signo por grupo.
 *
 * Necesidades, deseos y deuda son gasto: quedarse por debajo de lo asignado es
 * favorable. Ahorro e inversión son aportes: superar lo asignado lo es.
 */
export const allocationGroupDiffKind: Record<AllocationGroup, DiffRowKind> = {
  needs: 'expense_like',
  wants: 'expense_like',
  savings: 'income_like',
  investment: 'income_like',
  debt: 'expense_like',
}

/**
 * Gasto de categorías sin clasificar. **No es un grupo del reparto**: es una
 * fila aparte que nunca entra en la suma, porque asignarlo en silencio
 * falsearía el mes entero (docs/09-plan-mensual.md).
 */
export const UNCLASSIFIED_LABEL = 'Sin clasificar'

/** El mes no tiene porcentajes guardados. No es un error: es un mes sin plan. */
export const NO_ALLOCATION_LABEL = 'Sin reparto configurado'

/** Hay reparto, pero este grupo no tiene porcentaje propio. */
export const NO_PERCENT_LABEL = 'Sin definir'

/**
 * Nota fija del bloque. Explica la diferencia que más confunde de estas
 * plantillas: el reparto mide destinos del ingreso, no gastos.
 */
export const ALLOCATION_NOTE =
  'Los cinco grupos no suman los gastos totales: ahorro e inversión son transferencias registradas, no gastos.'

/** Aviso cuando hay gasto sin clasificar. Se explica, no se reparte. */
export const UNCLASSIFIED_NOTE =
  'Este gasto no entra en ningún grupo mientras su categoría no esté clasificada.'

const percentFormatter = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

/** Puntos base como porcentaje legible: 5000 → «50 %». */
export function formatBasisPoints(basisPoints: number | null): string {
  if (basisPoints === null) return NO_PERCENT_LABEL
  return `${percentFormatter.format(basisPoints / 100)} %`
}

/**
 * Importe asignado a un grupo.
 *
 * Sin importe hay dos causas distintas, y se dicen distinto: o el mes no tiene
 * reparto, o lo tiene pero no hay ingreso planeado que repartir. Nunca un `0`,
 * que fingiría un reparto que nadie configuró.
 */
export function formatAllocationPlanned(
  plannedMinor: number | null,
  hasAllocation: boolean,
  currencyCode: string,
): string {
  if (plannedMinor !== null) return formatAmount(plannedMinor, currencyCode)
  return hasAllocation ? NO_PLANNED_INCOME_LABEL : NO_ALLOCATION_LABEL
}

/** Diferencia de un grupo, nombrando la misma causa que su importe asignado. */
export function formatAllocationDiff(
  diff: Diff,
  hasAllocation: boolean,
  currencyCode: string,
): string {
  if (diff.status === 'no_budget') {
    return hasAllocation ? NO_PLANNED_INCOME_LABEL : NO_ALLOCATION_LABEL
  }
  return formatDiff(diff, currencyCode)
}

/**
 * Aviso cuando el reparto guardado trae un grupo fuera del contrato.
 *
 * `buildAllocationPercentages` los descarta para no enviarlos al cálculo, y
 * eso puede dejar la suma por debajo del 100 %: quien lo lee tiene derecho a
 * saberlo. `null` cuando no hay nada que avisar.
 */
export function ignoredAllocationGroupsNote(ignoredGroups: readonly string[]): string | null {
  if (ignoredGroups.length === 0) return null

  const listado = ignoredGroups.join(', ')
  return ignoredGroups.length === 1
    ? `El reparto guardado incluye un grupo que no existe (${listado}); se descarta, así que los porcentajes pueden no sumar 100 %.`
    : `El reparto guardado incluye grupos que no existen (${listado}); se descartan, así que los porcentajes pueden no sumar 100 %.`
}
