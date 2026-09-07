import { monthOfIsoDate } from '@/lib/dates'

/**
 * Fila de `budgets`, con los tipos anchos que devuelven los tipos generados de
 * Supabase. Se declara aquí en vez de usar `Tables<'budgets'>` para que esta
 * lógica sea comprobable sin depender del esquema aplicado, igual que hace el
 * resumen del dashboard.
 */
export interface BudgetRow {
  id: string
  category_id: string
  /** `null` = plantilla. Si no, primer día del mes que sobrescribe. */
  period_month: string | null
  /** Primer mes en que la plantilla entra en vigor, 'YYYY-MM-DD'. */
  effective_from: string
  amount_minor: number
}

export interface ResolvedBudget {
  budgetId: string
  categoryId: string
  amountMinor: number
  /** De dónde salió el monto. Lo necesita la interfaz para distinguirlos. */
  source: 'exception' | 'template'
}

/**
 * Presupuesto vigente para una categoría en un mes.
 *
 * El orden de resolución es:
 *   1. La excepción exacta de ese mes, si existe.
 *   2. Si no, la plantilla más reciente cuyo `effective_from` no sea posterior
 *      al mes consultado.
 *   3. Si no hay ninguna, `null`: esa categoría no tiene presupuesto ese mes.
 *
 * Por eso crear una versión nueva de plantilla vigente desde un mes posterior
 * no altera los meses ya cerrados: para ellos esa versión aún no aplicaba.
 *
 * Un `amount_minor` de 0 se devuelve tal cual, sin convertirlo en `null`: es
 * una decisión explícita de "no presupuestar esta categoría este mes", y
 * distinguirla de "nunca se configuró" le sirve a la interfaz. Quien traduce
 * el 0 a "sin presupuesto" es el cálculo de progreso.
 *
 * Las fechas 'YYYY-MM-DD' y las claves 'YYYY-MM' se comparan como texto: su
 * orden lexicográfico coincide con el cronológico.
 */
export function resolveBudget(
  budgets: BudgetRow[],
  categoryId: string,
  monthKey: string,
): ResolvedBudget | null {
  const forCategory = budgets.filter((budget) => budget.category_id === categoryId)

  const exception = forCategory.find(
    (budget) =>
      budget.period_month !== null && monthOfIsoDate(budget.period_month) === monthKey,
  )

  if (exception) {
    return {
      budgetId: exception.id,
      categoryId,
      amountMinor: exception.amount_minor,
      source: 'exception',
    }
  }

  let winner: BudgetRow | null = null

  for (const budget of forCategory) {
    if (budget.period_month !== null) continue
    if (monthOfIsoDate(budget.effective_from) > monthKey) continue

    if (winner === null || budget.effective_from > winner.effective_from) {
      winner = budget
    }
  }

  if (winner === null) return null

  return {
    budgetId: winner.id,
    categoryId,
    amountMinor: winner.amount_minor,
    source: 'template',
  }
}
