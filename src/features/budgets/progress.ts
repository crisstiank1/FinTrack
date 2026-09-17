import { calculateNetSavings } from '@/lib/calculations'
import { monthOfIsoDate } from '@/lib/dates'

import { resolveBudget, type BudgetRow } from './resolution'

/**
 * Movimiento visto desde el presupuesto. Solo hacen falta cuatro columnas.
 */
export interface BudgetTransaction {
  type: string
  category_id: string | null
  amount_minor: number
  transaction_date: string
}

export type BudgetStatus =
  /** No hay presupuesto aplicable, o el vigente es 0. */
  | 'unbudgeted'
  /** Gasto dentro del presupuesto, 100 % exacto incluido. */
  | 'ok'
  /** Gasto por encima del presupuesto. */
  | 'over'

export interface BudgetProgress {
  categoryId: string
  /** `null` cuando no hay presupuesto aplicable o el vigente es 0. */
  budgetMinor: number | null
  spentMinor: number
  /** Presupuesto − gastado. Negativo si se superó. `null` sin presupuesto. */
  remainingMinor: number | null
  /** Proporción gastada (1 = 100%). `null` sin presupuesto: no se divide entre 0. */
  ratio: number | null
  status: BudgetStatus
  source: 'exception' | 'template' | null
}

/**
 * Gasto que consume presupuesto para una categoría en un mes.
 *
 * Solo cuentan los movimientos de tipo `expense`. Las transferencias quedan
 * fuera porque mover dinero entre cuentas propias no es gasto, y los ingresos
 * tampoco consumen presupuesto: filtrar por tipo excluye ambos de una vez.
 */
export function calculateBudgetableSpending(
  transactions: BudgetTransaction[],
  categoryId: string,
  monthKey: string,
): number {
  return transactions
    .filter(
      (transaction) =>
        transaction.type === 'expense' &&
        transaction.category_id === categoryId &&
        monthOfIsoDate(transaction.transaction_date) === monthKey,
    )
    .reduce((sum, transaction) => sum + transaction.amount_minor, 0)
}

/**
 * Estado de un presupuesto (M15). Dos posibilidades, sin avisos intermedios:
 *
 * - **`ok`** mientras el gasto no supere el presupuesto, **100 % exacto
 *   incluido**: gastar justo lo previsto es cumplirlo, no un riesgo.
 * - **`over`** solo cuando el gasto es estrictamente mayor. Es el único estado
 *   que genera alerta.
 *
 * Hasta M15 había avisos al 70 % y al 90 %; se retiraron porque avisaban de
 * presupuestos que se estaban cumpliendo. La comparación es entera, sin
 * porcentajes en coma flotante.
 */
export function classifyBudgetStatus(spentMinor: number, budgetMinor: number): BudgetStatus {
  if (budgetMinor <= 0) return 'unbudgeted'
  return spentMinor > budgetMinor ? 'over' : 'ok'
}

/** Progreso de una categoría en un mes. */
export function buildBudgetProgress(
  budgets: BudgetRow[],
  transactions: BudgetTransaction[],
  categoryId: string,
  monthKey: string,
): BudgetProgress {
  const resolved = resolveBudget(budgets, categoryId, monthKey)
  const spentMinor = calculateBudgetableSpending(transactions, categoryId, monthKey)

  // Un presupuesto de 0 es una decisión explícita de no presupuestar este mes,
  // así que a partir de aquí se comporta igual que la ausencia de presupuesto:
  // ni resta, ni tiene porcentaje, ni genera alerta de umbral.
  const hasBudget = resolved !== null && resolved.amountMinor > 0

  return {
    categoryId,
    budgetMinor: hasBudget ? resolved.amountMinor : null,
    spentMinor,
    remainingMinor: hasBudget ? resolved.amountMinor - spentMinor : null,
    ratio: hasBudget ? spentMinor / resolved.amountMinor : null,
    status: hasBudget ? classifyBudgetStatus(spentMinor, resolved.amountMinor) : 'unbudgeted',
    source: resolved?.source ?? null,
  }
}

/**
 * Progreso de varias categorías en un mes.
 *
 * Recibe la lista de categorías a evaluar en vez de deducirla de `budgets`:
 * así quien llama decide si incluir las archivadas (necesario para consultar
 * meses pasados) o solo las activas.
 */
export function buildBudgetProgressList(
  budgets: BudgetRow[],
  transactions: BudgetTransaction[],
  categoryIds: string[],
  monthKey: string,
): BudgetProgress[] {
  return categoryIds.map((categoryId) =>
    buildBudgetProgress(budgets, transactions, categoryId, monthKey),
  )
}

export interface GlobalBudgetAlert {
  kind: 'negative_net_savings'
  netSavingsMinor: number
}

/**
 * Alerta global del mes: se gastó más de lo que entró.
 *
 * "Ahorro neto negativo" y "gastos mayores que ingresos" son la misma
 * condición, porque el ahorro neto es exactamente ingresos − gastos. Se emite
 * una sola para no duplicar el mismo aviso con dos textos distintos.
 */
export function buildGlobalBudgetAlert(
  incomeMinor: number,
  expenseMinor: number,
): GlobalBudgetAlert | null {
  const netSavingsMinor = calculateNetSavings(incomeMinor, expenseMinor)

  if (netSavingsMinor >= 0) return null
  return { kind: 'negative_net_savings', netSavingsMinor }
}
