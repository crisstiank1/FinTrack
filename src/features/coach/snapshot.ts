import { selectBudgetCategories } from '@/features/budgets/categories'
import { buildBudgetProgressList, buildGlobalBudgetAlert } from '@/features/budgets/progress'
import type { BudgetRow } from '@/features/budgets/resolution'
import { fetchAllPages } from '@/features/dashboard/api'
import { getCategoryDelta } from '@/features/dashboard/comparison'
import {
  buildCategoryBreakdown,
  buildDashboardSummary,
  hasBudgetThisMonth,
  type DashboardAccount,
  type DashboardCategory,
  type DashboardTransaction,
} from '@/features/dashboard/summary'
import { partitionByAccountCurrency, resolvePresentationCurrency } from '@/lib/currency'
import { monthRange } from '@/lib/dates'

import type { CoachSupabaseClient } from './context'
import type {
  CoachContextSnapshot,
  MetricChange,
  SnapshotBudget,
  SnapshotCategory,
  SnapshotCategoryDelta,
} from './contracts'
import type { CoachContextReady } from './responses'
import type { CoachIntent } from './scope'

/**
 * Serializador del snapshot: lo único que puede salir hacia el proveedor de IA.
 *
 * **No calcula nada por su cuenta.** Cada cifra sale de la misma función que la
 * pinta en pantalla —`buildDashboardSummary`, `buildCategoryBreakdown`,
 * `buildBudgetProgressList`, `getCategoryDelta`— con el mismo recorte de moneda.
 * Lo que hace aquí es elegir qué partes hacen falta para cada intención,
 * quitarles los identificadores y darles una clave corta que el modelo pueda
 * citar.
 *
 * Se divide en dos: `loadSnapshotData`, que lee, y `buildCoachSnapshot`, que es
 * pura. Las pruebas se concentran en la segunda, que es donde vive el riesgo de
 * que el Coach y la interfaz digan cifras distintas.
 */

/** Partes del snapshot. */
export type SnapshotSection = 'summary' | 'categories' | 'categoryDeltas' | 'budgets' | 'cashflow'

/**
 * Qué necesita cada intención. Principio de datos mínimos: una pregunta sobre
 * presupuestos no manda el reparto por categoría, y una pregunta de concepto no
 * manda nada.
 */
export const SECTIONS_BY_INTENT: Record<CoachIntent, readonly SnapshotSection[]> = {
  period_summary: ['summary', 'cashflow'],
  spending_by_category: ['summary', 'categories'],
  period_comparison: ['summary', 'categoryDeltas'],
  budget_status: ['budgets'],
  cashflow_analysis: ['summary', 'cashflow', 'categories'],
  spending_review: ['categories', 'categoryDeltas', 'budgets'],
  financial_concept: [],
  app_feature_help: [],
}

/** Intenciones que se responden sin leer un solo dato del usuario. */
export function intentNeedsData(intent: CoachIntent): boolean {
  return SECTIONS_BY_INTENT[intent].length > 0
}

export interface SnapshotCategoryRow extends DashboardCategory {
  is_archived: boolean
}

/** Filas ya leídas con el JWT del usuario. Ninguna trae descripción ni nombre de cuenta. */
export interface SnapshotData {
  primaryCurrency: string | null
  accounts: DashboardAccount[]
  transactions: DashboardTransaction[]
  categories: SnapshotCategoryRow[]
  budgets: BudgetRow[]
}

/** Topes de tamaño: el snapshot es un resumen, no un volcado. */
const MAX_CATEGORY_SLICES = 5
const MAX_CATEGORY_DELTAS = 5
const MAX_BUDGET_LINES = 8

/** Un decimal: suficiente para "28,4 %" y estable entre ejecuciones. */
function round1(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10
}

function metric(change: {
  currentMinor: number
  previousMinor: number
  deltaPercent: number | null
}): MetricChange {
  return {
    currentMinor: change.currentMinor,
    previousMinor: change.previousMinor,
    deltaPercent: round1(change.deltaPercent),
  }
}

export interface BuildCoachSnapshotInput {
  context: CoachContextReady
  data: SnapshotData
}

export function buildCoachSnapshot({
  context,
  data,
}: BuildCoachSnapshotInput): CoachContextSnapshot {
  const sections = new Set(SECTIONS_BY_INTENT[context.intent])
  const { currency } = context
  const monthKey = context.period.monthKey

  const snapshot: CoachContextSnapshot = {
    version: 'v1',
    period: {
      label: context.period.label,
      startDate: context.period.start,
      endDate: context.period.end,
    },
    comparedTo: {
      label: context.comparedTo.label,
      startDate: context.comparedTo.start,
      endDate: context.comparedTo.end,
    },
    currency,
    exclusions: monthExclusions(data, monthKey, currency),
  }

  const dashboardScope = {
    accounts: data.accounts,
    transactions: data.transactions,
    monthKey,
    currencyCode: currency,
  }

  if (sections.has('summary') || sections.has('cashflow')) {
    const summary = buildDashboardSummary(dashboardScope)

    if (sections.has('summary')) {
      // El saldo consolidado se deja fuera a propósito: necesita el historial
      // completo desde el saldo inicial de cada cuenta, y aquí solo se leen los
      // dos meses comparados.
      snapshot.summary = {
        income: metric(summary.income),
        expense: metric(summary.expense),
        netSavings: metric(summary.netSavings),
        savingsRate: {
          current: round1(summary.savingsRate.current),
          previous: round1(summary.savingsRate.previous),
          deltaPoints: round1(summary.savingsRate.deltaPoints),
        },
      }
    }

    if (sections.has('cashflow')) {
      const incomeMinor = summary.income.currentMinor
      const expenseMinor = summary.expense.currentMinor

      snapshot.cashflow = {
        incomeMinor,
        expenseMinor,
        netSavingsMinor: summary.netSavings.currentMinor,
        alert: buildGlobalBudgetAlert(incomeMinor, expenseMinor)?.kind ?? null,
      }
    }
  }

  if (sections.has('categories')) {
    const slices = buildCategoryBreakdown(
      { ...dashboardScope, categories: data.categories },
      MAX_CATEGORY_SLICES,
    )

    snapshot.categories = indexed('c', slices, (slice): SnapshotCategory => ({
      name: slice.name,
      amount: slice.amountMinor,
      percentage: round1(slice.share * 100) ?? 0,
    }))
  }

  if (sections.has('categoryDeltas')) {
    const deltas = getCategoryDelta({ ...dashboardScope, categories: data.categories })
      // Las variaciones más grandes en valor absoluto, pero listadas de mayor
      // subida a mayor bajada, que es como se leen.
      .sort((a, b) => Math.abs(b.differenceAmount) - Math.abs(a.differenceAmount))
      .slice(0, MAX_CATEGORY_DELTAS)
      .sort((a, b) => b.differenceAmount - a.differenceAmount)
      .filter((delta) => delta.differenceAmount !== 0)

    snapshot.categoryDeltas = indexed('d', deltas, (delta): SnapshotCategoryDelta => ({
      name: delta.categoryName,
      current: delta.currentAmount,
      previous: delta.previousAmount,
      difference: delta.differenceAmount,
      differencePercent: round1(delta.differencePercent),
    }))
  }

  if (sections.has('budgets')) {
    const budgetsCurrency = resolvePresentationCurrency(data.primaryCurrency, data.accounts)
    snapshot.budgetsCurrency = budgetsCurrency

    if (budgetsCurrency === currency) {
      snapshot.budgets = buildBudgetSection(data, monthKey, currency)
    }
  }

  return snapshot
}

/**
 * Presupuestos del mes, con el mismo cálculo que `/budgets`.
 *
 * Mismas tres piezas que la pantalla: `selectBudgetCategories` para decidir qué
 * categorías entran, `partitionByAccountCurrency` para quedarse con el gasto de
 * la moneda de los presupuestos, y `buildBudgetProgressList` para el progreso.
 * Solo se envían las categorías con algo resuelto ese mes —un 0 deliberado
 * incluido—, primero las superadas.
 */
function buildBudgetSection(
  data: SnapshotData,
  monthKey: string,
  currency: string,
): Record<string, SnapshotBudget> {
  const categories = selectBudgetCategories(data.categories, data.budgets, monthKey)
  const nameById = new Map(categories.map((category) => [category.id, category.name]))

  const { included } = partitionByAccountCurrency(
    data.transactions.filter((transaction) => transaction.type === 'expense'),
    new Map(data.accounts.map((account) => [account.id, account.currency_code])),
    currency,
  )

  const lines = buildBudgetProgressList(
    data.budgets,
    included,
    categories.map((category) => category.id),
    monthKey,
  )
    .filter(hasBudgetThisMonth)
    .sort(
      (a, b) =>
        Number(b.status === 'over') - Number(a.status === 'over') ||
        (b.ratio ?? -1) - (a.ratio ?? -1),
    )
    .slice(0, MAX_BUDGET_LINES)

  return indexed('b', lines, (line): SnapshotBudget => ({
    name: nameById.get(line.categoryId) ?? 'Sin categoría',
    budget: line.budgetMinor,
    spent: line.spentMinor,
    remaining: line.remainingMinor,
    status: line.status,
  }))
}

/**
 * Ingresos y gastos del mes que quedan fuera por estar en otra moneda.
 *
 * Mismo criterio que el aviso del Plan y de `/budgets`: se cuentan, no se suman,
 * y las transferencias no entran porque nunca son ingreso ni gasto.
 */
function monthExclusions(data: SnapshotData, monthKey: string, currency: string) {
  const { exclusions } = partitionByAccountCurrency(
    data.transactions.filter(
      (transaction) =>
        transaction.type !== 'transfer' && transaction.transaction_date.slice(0, 7) === monthKey,
    ),
    new Map(data.accounts.map((account) => [account.id, account.currency_code])),
    currency,
  )

  return { count: exclusions.count, currencyCodes: exclusions.currencyCodes }
}

/** `[a, b]` → `{ c1: f(a), c2: f(b) }`. Las claves son lo que el modelo cita. */
function indexed<T, U>(
  prefix: string,
  items: readonly T[],
  map: (item: T) => U,
): Record<string, U> {
  const result: Record<string, U> = {}
  items.forEach((item, index) => {
    result[`${prefix}${index + 1}`] = map(item)
  })
  return result
}

/* -------------------------------------------------------------------------- */
/* Lectura                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Lee lo que el snapshot necesita, con el cliente del usuario.
 *
 * Las columnas se nombran una a una: ni `description`, ni `notes`, ni el nombre
 * de las cuentas llegan siquiera a la memoria de la función. No basta con no
 * enviarlos al proveedor; es mejor no tenerlos.
 *
 * Los movimientos se acotan al mes comparado y al analizado completo. El mes en
 * curso se lee hasta su último día, no hasta hoy, para que un movimiento con
 * fecha futura cuente igual que en el Dashboard.
 */
export async function loadSnapshotData(
  client: CoachSupabaseClient,
  userId: string,
  context: CoachContextReady,
): Promise<SnapshotData> {
  const sections = new Set(SECTIONS_BY_INTENT[context.intent])
  const monthEnd = monthRange(context.period.monthKey).end

  const [profile, accounts, categories, budgets, transactions] = await Promise.all([
    client.from('profiles').select('currency_code').eq('id', userId).maybeSingle(),
    client
      .from('accounts')
      // `type` lo exige el tipo del dashboard para separar tarjetas de crédito;
      // se queda en memoria y no entra en el snapshot.
      .select('id, type, currency_code, initial_balance_minor')
      .eq('user_id', userId),
    client
      .from('categories')
      .select('id, name, type, color, icon, is_archived')
      .eq('user_id', userId),
    sections.has('budgets')
      ? client
          .from('budgets')
          .select('id, category_id, period_month, effective_from, amount_minor')
          .eq('user_id', userId)
      : Promise.resolve({ data: [] as BudgetRow[], error: null }),
    fetchAllPages((from, to) =>
      client
        .from('transactions')
        .select(
          'id, type, transfer_direction, account_id, category_id, amount_minor, transaction_date',
        )
        .eq('user_id', userId)
        .gte('transaction_date', context.comparedTo.start)
        .lte('transaction_date', monthEnd)
        .order('transaction_date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to),
    ),
  ])

  const failed = [profile, accounts, categories, budgets].find((result) => result.error)
  if (failed) throw failed.error

  return {
    primaryCurrency: profile.data?.currency_code ?? null,
    // Los tipos del dashboard piden `name` y `description`; se rellenan vacíos
    // porque ninguna de las funciones que usa el snapshot los lee.
    accounts: (accounts.data ?? []).map((account) => ({ ...account, name: '' })),
    categories: categories.data ?? [],
    budgets: budgets.data ?? [],
    transactions: transactions.map((transaction) => ({ ...transaction, description: '' })),
  }
}
