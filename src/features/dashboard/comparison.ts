import { monthOfIsoDate, previousMonthKey } from '@/lib/dates'

import {
  scopeTransactions,
  type DashboardAccount,
  type DashboardCategory,
  type DashboardTransaction,
} from './summary'

/**
 * Variación del gasto de una categoría entre dos meses.
 *
 * Es la única regla de dominio que FinTrack no tenía ya escrita: el dashboard
 * compara los totales del mes contra el anterior, pero no baja al detalle de
 * qué categoría explica la diferencia.
 *
 * Los importes son unidades mínimas enteras con exponente 0, como en el resto
 * de la aplicación: `COP 15.000` es `15000`, y nunca se dividen entre 100.
 */
export interface CategoryDelta {
  /** `'uncategorized'` para el gasto sin categoría, igual que el reparto del dashboard. */
  categoryId: string
  categoryName: string
  currentAmount: number
  previousAmount: number
  /** `currentAmount − previousAmount`. Positivo si el gasto subió. */
  differenceAmount: number
  /**
   * Variación porcentual respecto al mes anterior, o `null` cuando la base es
   * 0: "creció un ∞ %" no informa de nada. Mismo criterio que `percentDelta`
   * en el resumen del dashboard.
   */
  differencePercent: number | null
  currentTransactionCount: number
  previousTransactionCount: number
  /** Grupo del reparto del Plan, si quien llama lo aporta. */
  budgetGroup?: string | null
}

/** Clasificación de una categoría, tal como la guarda `category_classifications`. */
export interface CategoryClassificationRow {
  category_id: string
  budget_group: string
}

export interface CategoryDeltaScope {
  accounts: DashboardAccount[]
  transactions: DashboardTransaction[]
  categories: DashboardCategory[]
  /** Mes analizado, 'YYYY-MM'. */
  monthKey: string
  /** Mes con el que se compara. Por defecto, el inmediatamente anterior. */
  comparedToMonthKey?: string
  /**
   * Moneda del análisis. FinTrack no convierte divisas, así que comparar
   * categorías mezclando monedas daría una diferencia sin significado.
   */
  currencyCode?: string
  accountId?: string
  classifications?: CategoryClassificationRow[]
}

const UNCATEGORIZED_ID = 'uncategorized'
const UNCATEGORIZED_NAME = 'Sin categoría'

interface CategoryTotal {
  amountMinor: number
  transactionCount: number
}

/**
 * Gasto por categoría de un mes, sin recortar ni agrupar la cola.
 *
 * Solo `expense`: las transferencias no son gasto —mover dinero entre cuentas
 * propias no empobrece a nadie— y los ingresos tampoco. Filtrar por tipo deja
 * ambos fuera de una vez, igual que hace `buildCategoryBreakdown`.
 */
function totalsByCategory(
  transactions: DashboardTransaction[],
  monthKey: string,
): Map<string, CategoryTotal> {
  const totals = new Map<string, CategoryTotal>()

  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue
    if (monthOfIsoDate(transaction.transaction_date) !== monthKey) continue

    const key = transaction.category_id ?? UNCATEGORIZED_ID
    const current = totals.get(key) ?? { amountMinor: 0, transactionCount: 0 }

    totals.set(key, {
      amountMinor: current.amountMinor + transaction.amount_minor,
      transactionCount: current.transactionCount + 1,
    })
  }

  return totals
}

/**
 * Variación porcentual contra el mes anterior.
 *
 * El divisor va en valor absoluto por coherencia con `percentDelta` del
 * resumen; sobre gastos, que son sumas de importes positivos, no cambia nada.
 */
function percentDelta(currentMinor: number, previousMinor: number): number | null {
  if (previousMinor === 0) return null
  return ((currentMinor - previousMinor) / Math.abs(previousMinor)) * 100
}

/**
 * Compara el gasto por categoría de dos meses en una sola moneda.
 *
 * Qué resuelve: "¿por qué subieron mis gastos?". El resumen del dashboard dice
 * cuánto subió el total; esto dice qué categorías lo explican.
 *
 * Reglas:
 *
 * - **Una sola moneda por ejecución.** Se recorta con el mismo criterio que el
 *   resto del dashboard (`scopeTransactions`), no con el del Plan.
 * - **Solo gastos.** Transferencias e ingresos quedan fuera.
 * - **Una categoría presente en un solo mes cuenta como 0 en el otro**, y
 *   aparece igualmente: una categoría nueva que se come el presupuesto es
 *   justo lo que hay que ver.
 * - **Orden por `differenceAmount` descendente**: primero lo que más subió,
 *   al final lo que más bajó. Los empates se resuelven por nombre para que el
 *   resultado sea estable entre ejecuciones.
 * - No consulta Supabase ni toca descripciones de movimientos: recibe filas ya
 *   filtradas por usuario y devuelve agregados.
 */
export function getCategoryDelta({
  accounts,
  transactions,
  categories,
  monthKey,
  comparedToMonthKey,
  currencyCode,
  accountId,
  classifications,
}: CategoryDeltaScope): CategoryDelta[] {
  const baselineMonthKey = comparedToMonthKey ?? previousMonthKey(monthKey)
  const scoped = scopeTransactions(transactions, accounts, { accountId, currencyCode })

  const current = totalsByCategory(scoped, monthKey)
  const previous = totalsByCategory(scoped, baselineMonthKey)

  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const budgetGroupById = new Map(
    (classifications ?? []).map((row) => [row.category_id, row.budget_group]),
  )

  const empty: CategoryTotal = { amountMinor: 0, transactionCount: 0 }

  return [...new Set([...current.keys(), ...previous.keys()])]
    .map((categoryId) => {
      const now = current.get(categoryId) ?? empty
      const before = previous.get(categoryId) ?? empty

      const delta: CategoryDelta = {
        categoryId,
        categoryName:
          categoryId === UNCATEGORIZED_ID
            ? UNCATEGORIZED_NAME
            : (categoryById.get(categoryId)?.name ?? UNCATEGORIZED_NAME),
        currentAmount: now.amountMinor,
        previousAmount: before.amountMinor,
        differenceAmount: now.amountMinor - before.amountMinor,
        differencePercent: percentDelta(now.amountMinor, before.amountMinor),
        currentTransactionCount: now.transactionCount,
        previousTransactionCount: before.transactionCount,
      }

      const budgetGroup = budgetGroupById.get(categoryId)
      return budgetGroup === undefined ? delta : { ...delta, budgetGroup }
    })
    .sort(
      (a, b) =>
        b.differenceAmount - a.differenceAmount || a.categoryName.localeCompare(b.categoryName),
    )
}
