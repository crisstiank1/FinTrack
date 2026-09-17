import type { BudgetProgress } from './progress'
import { resolveBudget, type BudgetRow } from './resolution'

/**
 * Categoría vista desde presupuestos. Se declara con los campos mínimos para
 * que esta selección sea comprobable sin depender del esquema, igual que hace
 * el resto de la lógica pura del feature.
 */
export interface BudgetCategory {
  id: string
  name: string
  type: string
  is_archived: boolean
}

/**
 * Categorías que debe listar la pantalla de presupuestos para un mes.
 *
 * Tres reglas, y las tres tienen consecuencias visibles:
 *
 * 1. **Solo gasto.** Las de ingreso no se presupuestan y la base de datos ya
 *    lo impide; listarlas sería ofrecer algo que va a fallar.
 * 2. **Todas las de gasto activas**, tengan presupuesto o no: sin ellas no
 *    habría desde dónde crear el primero.
 * 3. **Las archivadas solo si tienen presupuesto resoluble ese mes.** Sin esta
 *    excepción, consultar un mes pasado mostraría un progreso incompleto: el
 *    dinero se gastó en categorías que quizá se archivaron después. Y sin el
 *    filtro, la lista del mes actual se llenaría de categorías retiradas.
 *
 * El orden de entrada se conserva; `fetchCategories` ya ordena por archivadas,
 * tipo y nombre.
 */
export function selectBudgetCategories<T extends BudgetCategory>(
  categories: T[],
  budgets: BudgetRow[],
  monthKey: string,
): T[] {
  return categories.filter((category) => {
    if (category.type !== 'expense') return false
    if (!category.is_archived) return true

    return resolveBudget(budgets, category.id, monthKey) !== null
  })
}

/**
 * Prioridad de una categoría en la lista de `/budgets`:
 *
 * 0. **Con dinero asignado** en el mes: un presupuesto mayor que 0.
 * 1. **Con presupuesto explícito de 0**: es una decisión tomada, así que va antes
 *    que lo que nunca se presupuestó, pero no tiene dinero que vigilar.
 * 2. **Sin presupuesto** que resuelva el mes.
 *
 * `budgetMinor` es nulo tanto en 1 como en 2; los distingue `source`, presente
 * cuando algo resolvió el mes.
 */
export function budgetAssignmentRank(
  progress: Pick<BudgetProgress, 'budgetMinor' | 'source'>,
): number {
  if (progress.budgetMinor !== null && progress.budgetMinor > 0) return 0
  if (progress.source !== null) return 1
  return 2
}

/**
 * Ordena la lista por `budgetAssignmentRank`: lo que tiene dinero asignado arriba.
 * Dentro de cada grupo se conserva el orden de entrada —el de `fetchCategories`,
 * por archivadas, tipo y nombre—, porque la ordenación de JavaScript es estable.
 */
export function sortByBudgetAssignment<
  T extends { progress: Pick<BudgetProgress, 'budgetMinor' | 'source'> },
>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => budgetAssignmentRank(a.progress) - budgetAssignmentRank(b.progress),
  )
}
