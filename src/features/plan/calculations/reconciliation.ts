export interface PlanIncomeSourceInput {
  plannedMinor: number
}

export interface PlanLineAmountInput {
  plannedMinor: number
}

/** ingresoPlaneado: suma de las fuentes de ingreso planeadas del mes. */
export function sumPlannedIncome(sources: PlanIncomeSourceInput[]): number {
  return sources.reduce((sum, source) => sum + source.plannedMinor, 0)
}

/** ahorroPlan / inversionPlan: suma de `planned_minor` de las líneas del eje cuenta de un `kind` dado. */
export function sumPlannedLineAmounts(lines: PlanLineAmountInput[]): number {
  return lines.reduce((sum, line) => sum + line.plannedMinor, 0)
}

/**
 * presupuestoCategorias: suma de todos los presupuestos efectivos del mes,
 * tengan o no una línea descriptiva (docs/09-plan-mensual.md). Recibe los
 * montos ya resueltos por `resolveBudget` de `/budgets` — esta función no
 * conoce plantillas ni excepciones, solo suma lo que ya se resolvió. Una
 * categoría sin presupuesto efectivo simplemente no aparece en el mapa.
 */
export function sumEffectiveCategoryBudgets(budgetsByCategory: Record<string, number>): number {
  return Object.values(budgetsByCategory).reduce((sum, amount) => sum + amount, 0)
}

/** presupuestoFacturas / presupuestoVariables: presupuesto efectivo de las categorías con una línea de un tipo dado. */
export function sumBudgetsForCategories(
  budgetsByCategory: Record<string, number>,
  categoryIds: readonly string[],
): number {
  return categoryIds.reduce((sum, categoryId) => sum + (budgetsByCategory[categoryId] ?? 0), 0)
}

export interface BudgetReconciliation {
  billsMinor: number
  variablesMinor: number
  unlinkedMinor: number
}

/**
 * Reconciliación del presupuesto por categorías: desglosa
 * `presupuestoCategorias` en lo descrito por una línea `bill`, lo descrito
 * por una línea `variable`, y el resto sin línea. `unlinkedMinor` es siempre
 * `>= 0` porque U10 garantiza que los conjuntos de categorías de facturas y
 * variables son disjuntos, y ambos son subconjuntos de las categorías
 * presupuestadas (docs/09-plan-mensual.md). "Sin línea descriptiva" no es un
 * error: se muestra igual aunque valga 0.
 */
export function reconcileCategoryBudgets(
  totalCategoryBudgetMinor: number,
  billCategoryIds: readonly string[],
  variableCategoryIds: readonly string[],
  budgetsByCategory: Record<string, number>,
): BudgetReconciliation {
  const billsMinor = sumBudgetsForCategories(budgetsByCategory, billCategoryIds)
  const variablesMinor = sumBudgetsForCategories(budgetsByCategory, variableCategoryIds)

  return {
    billsMinor,
    variablesMinor,
    unlinkedMinor: totalCategoryBudgetMinor - billsMinor - variablesMinor,
  }
}

/**
 * Presupuesto de la categoría de una línea, con la forma de `BudgetProgress`
 * de `/budgets`. Solo se declaran los dos campos que separan la ausencia de
 * presupuesto de un 0 explícito.
 */
export interface LineBudgetInput {
  categoryId: string
  /** `null` sin presupuesto aplicable **o** con el vigente en 0. */
  budgetMinor: number | null
  /** `null` solo cuando `resolveBudget` no encontró ningún presupuesto. */
  source: string | null
}

/** Presupuesto de la categoría de una línea: positivo, 0 explícito o ausente. */
export type LineBudgetState = 'budgeted' | 'zero' | 'none'

/**
 * Estado del presupuesto de una línea, a partir de su progreso ya calculado.
 *
 * `buildBudgetProgress` codifica el 0 explícito como `budgetMinor === null`
 * con `source` conservado, y la ausencia como `source === null`. Esta es la
 * única lectura de esa codificación: la usan el panel de líneas, fila a fila, y
 * `buildBudgetCoverage`, en lote.
 *
 * Solo acepta progreso **ya disponible**. «Todavía cargando» no es un estado
 * del presupuesto sino de la pantalla, y se decide allí.
 */
export function classifyLineBudget(budget: LineBudgetInput): LineBudgetState {
  if (budget.budgetMinor !== null) return 'budgeted'
  if (budget.source !== null) return 'zero'
  return 'none'
}

export interface BudgetCoverageInput {
  /** Presupuesto efectivo del mes, sin los resueltos en 0 (`useEffectiveCategoryBudgets`). */
  budgetsByCategory: Record<string, number>
  billCategoryIds: readonly string[]
  variableCategoryIds: readonly string[]
  /** Progreso de las categorías con línea, de `usePlanLineProgress`. */
  lineBudgets: readonly LineBudgetInput[]
}

export interface BudgetCoverage extends BudgetReconciliation {
  /** presupuestoCategorias. */
  totalMinor: number
  /** Presupuesto de las categorías descritas por una línea: facturas más variables. */
  coveredMinor: number
  /**
   * `false` cuando ninguna categoría tiene presupuesto efectivo este mes. Es
   * una ausencia, no un presupuesto de 0: la interfaz lo dice con palabras.
   */
  hasCategoryBudgets: boolean
  /** Categorías con presupuesto y sin línea. Su importe suma `unlinkedMinor`. */
  unlinkedCategoryIds: string[]
  /** Categorías de línea sin ningún presupuesto resuelto este mes. */
  lineCategoryIdsWithoutBudget: string[]
  /** Categorías de línea cuyo presupuesto vigente es un 0 explícito. */
  lineCategoryIdsWithZeroBudget: string[]
}

/**
 * Cobertura del presupuesto por líneas: la reconciliación del bloque de
 * `/plan`, con las categorías concretas detrás de cada cifra
 * (docs/09-plan-mensual.md, «Reconciliación del presupuesto»).
 *
 * Los importes salen de las funciones de arriba; aquí no se suma nada a mano.
 * Las identidades se cumplen por construcción:
 *
 * - `billsMinor + variablesMinor + unlinkedMinor = totalMinor`.
 * - `coveredMinor = billsMinor + variablesMinor`.
 * - El presupuesto de `unlinkedCategoryIds` suma `unlinkedMinor`.
 *
 * Una línea sin presupuesto no es inválida: describe el gasto de su categoría,
 * pero no suma a lo asignado. Se separan dos causas que la interfaz dice
 * distinto: no hay presupuesto (`source === null`), o el vigente es un 0
 * explícito (`source !== null` y `budgetMinor === null`, que es exactamente
 * como `buildBudgetProgress` codifica ese 0). Una línea cuyo progreso no llegó
 * se trata como sin presupuesto: no se afirma un 0 que nadie ha visto.
 *
 * El mapa de presupuestos manda sobre el progreso: es la misma fuente que el
 * total, así que una categoría presente en él cuenta como presupuestada.
 */
export function buildBudgetCoverage({
  budgetsByCategory,
  billCategoryIds,
  variableCategoryIds,
  lineBudgets,
}: BudgetCoverageInput): BudgetCoverage {
  const totalMinor = sumEffectiveCategoryBudgets(budgetsByCategory)
  const reconciliation = reconcileCategoryBudgets(
    totalMinor,
    billCategoryIds,
    variableCategoryIds,
    budgetsByCategory,
  )

  const lineCategoryIds = [...billCategoryIds, ...variableCategoryIds]
  const linked = new Set(lineCategoryIds)
  const budgetByLineCategory = new Map(lineBudgets.map((budget) => [budget.categoryId, budget]))

  const lineCategoryIdsWithoutBudget: string[] = []
  const lineCategoryIdsWithZeroBudget: string[] = []

  for (const categoryId of lineCategoryIds) {
    if (budgetsByCategory[categoryId] !== undefined) continue

    const budget = budgetByLineCategory.get(categoryId)
    if (budget && classifyLineBudget(budget) === 'zero') {
      lineCategoryIdsWithZeroBudget.push(categoryId)
    } else {
      lineCategoryIdsWithoutBudget.push(categoryId)
    }
  }

  const budgetedCategoryIds = Object.keys(budgetsByCategory)

  return {
    ...reconciliation,
    totalMinor,
    coveredMinor: sumBudgetsForCategories(budgetsByCategory, lineCategoryIds),
    hasCategoryBudgets: budgetedCategoryIds.length > 0,
    unlinkedCategoryIds: budgetedCategoryIds.filter((categoryId) => !linked.has(categoryId)),
    lineCategoryIdsWithoutBudget,
    lineCategoryIdsWithZeroBudget,
  }
}

export interface AllocationSummary {
  assignedMinor: number
  unassignedMinor: number
}

/**
 * asignado / porAsignar: cuánto del ingreso planeado ya tiene destino.
 * `porAsignar` compara planes, no es dinero disponible (docs/09-plan-mensual.md).
 */
export function summarizeAllocation(
  incomePlannedMinor: number,
  categoryBudgetMinor: number,
  savingsPlannedMinor: number,
  investmentPlannedMinor: number,
): AllocationSummary {
  const assignedMinor = categoryBudgetMinor + savingsPlannedMinor + investmentPlannedMinor
  return { assignedMinor, unassignedMinor: incomePlannedMinor - assignedMinor }
}
