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
  /** Gasto por debajo del 70%. */
  | 'ok'
  | 'warning_70'
  | 'warning_90'
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
 * Umbral alcanzado por un presupuesto. Devuelve uno solo, el más alto, para no
 * emitir tres alertas por la misma categoría al superar el 90%.
 *
 * Las comparaciones se hacen con enteros (10·gasto contra 9·presupuesto) en
 * vez de con `gasto / presupuesto >= 0.9`, porque ni 0,9 ni 0,7 son exactos en
 * coma flotante y un gasto justo en el umbral podría clasificarse mal.
 */
export function classifyBudgetStatus(spentMinor: number, budgetMinor: number): BudgetStatus {
  if (budgetMinor <= 0) return 'unbudgeted'
  if (spentMinor > budgetMinor) return 'over'
  if (spentMinor * 10 >= budgetMinor * 9) return 'warning_90'
  if (spentMinor * 10 >= budgetMinor * 7) return 'warning_70'
  return 'ok'
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
