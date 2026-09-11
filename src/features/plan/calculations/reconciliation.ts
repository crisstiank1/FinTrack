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
