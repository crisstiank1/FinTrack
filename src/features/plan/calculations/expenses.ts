export { calculateMonthlyExpense as sumActualExpenses } from '@/lib/calculations'

/**
 * Movimiento visto desde el gasto del Plan mensual. Solo hacen falta tres
 * columnas. `type` queda acotado a los tres valores reales (en vez del
 * `string` genérico que expone `database.types.ts`) porque este archivo pasa
 * las transacciones directamente a `calculateMonthlyExpense` de
 * `@/lib/calculations`, que exige esa misma unión.
 */
export interface PlanExpenseTransaction {
  type: 'income' | 'expense' | 'transfer'
  category_id: string | null
  amount_minor: number
}

export interface ExpenseLineBreakdown {
  billsMinor: number
  variablesMinor: number
  unplannedMinor: number
}

/**
 * Desglose del gasto por línea de plan: facturas, variables y no planeado.
 * `unplannedMinor` se calcula como residuo (`total − facturas − variables`),
 * así que la identidad `facturas + variables + noPlaneado = gastoActual` se
 * cumple por construcción, no por coincidencia (docs/09-plan-mensual.md).
 *
 * U10 garantiza en la base de datos que una categoría no puede tener a la vez
 * una línea `bill` y una `variable` en el mismo mes. Si el llamador pasara
 * conjuntos solapados de todos modos, esta función clasifica cada movimiento
 * como `bill` antes que `variable`, solo como desempate defensivo: en datos
 * válidos esa rama nunca se alcanza.
 */
export function splitExpensesByPlanLine(
  transactions: PlanExpenseTransaction[],
  billCategoryIds: readonly string[],
  variableCategoryIds: readonly string[],
): ExpenseLineBreakdown {
  const bills = new Set(billCategoryIds)
  const variables = new Set(variableCategoryIds)

  let totalMinor = 0
  let billsMinor = 0
  let variablesMinor = 0

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    totalMinor += transaction.amount_minor

    if (transaction.category_id !== null && bills.has(transaction.category_id)) {
      billsMinor += transaction.amount_minor
    } else if (transaction.category_id !== null && variables.has(transaction.category_id)) {
      variablesMinor += transaction.amount_minor
    }
  }

  return { billsMinor, variablesMinor, unplannedMinor: totalMinor - billsMinor - variablesMinor }
}

export type ExpenseClassificationGroup = 'needs' | 'wants' | 'debt'

export interface ExpenseGroupBreakdown {
  needsMinor: number
  wantsMinor: number
  debtMinor: number
  /**
   * Gasto de categorías sin clasificar. No es un grupo del reparto: es una
   * fila propia, fuera de los tres grupos (docs/09-plan-mensual.md).
   */
  sinClasificarMinor: number
}

/**
 * Reparto del gasto por clasificación de categoría: needs / wants / debt y
 * sin clasificar. Partición distinta e independiente de
 * `splitExpensesByPlanLine` — ambas cubren el mismo gasto pero no se cruzan
 * ni se suman entre sí (docs/09-plan-mensual.md, "Las dos particiones del
 * gasto"). `debtMinor` de este resultado es `deudaActual`.
 */
export function groupExpensesByClassification(
  transactions: PlanExpenseTransaction[],
  classificationByCategory: Partial<Record<string, ExpenseClassificationGroup>>,
): ExpenseGroupBreakdown {
  const breakdown: ExpenseGroupBreakdown = {
    needsMinor: 0,
    wantsMinor: 0,
    debtMinor: 0,
    sinClasificarMinor: 0,
  }

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    const group = transaction.category_id
      ? classificationByCategory[transaction.category_id]
      : undefined

    if (group === 'needs') breakdown.needsMinor += transaction.amount_minor
    else if (group === 'wants') breakdown.wantsMinor += transaction.amount_minor
    else if (group === 'debt') breakdown.debtMinor += transaction.amount_minor
    else breakdown.sinClasificarMinor += transaction.amount_minor
  }

  return breakdown
}
