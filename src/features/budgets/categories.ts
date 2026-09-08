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
