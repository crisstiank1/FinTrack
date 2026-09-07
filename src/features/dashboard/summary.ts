import {
  calculateConsolidatedBalance,
  calculateMonthlyExpense,
  calculateMonthlyIncome,
  calculateNetSavings,
  calculateSavingsRate,
  type AccountForCalculation,
  type TransactionForCalculation,
} from '@/lib/calculations'
import {
  formatMonthShort,
  monthOfIsoDate,
  previousMonthKey,
  recentMonthKeys,
} from '@/lib/dates'

/** Subconjunto de columnas que el dashboard necesita de una cuenta. */
export interface DashboardAccount {
  id: string
  name: string
  currency_code: string
  initial_balance_minor: number
}

/** Subconjunto de columnas que el dashboard necesita de un movimiento. */
export interface DashboardTransaction {
  id: string
  type: string
  transfer_direction: string | null
  account_id: string
  category_id: string | null
  amount_minor: number
  transaction_date: string
  description: string
}

/** Subconjunto de columnas que el dashboard necesita de una categoría. */
export interface DashboardCategory {
  id: string
  name: string
  type: string
  color: string | null
  icon: string | null
}

export interface DashboardScope {
  accounts: DashboardAccount[]
  transactions: DashboardTransaction[]
  monthKey: string
  /** Si se indica, todo se limita a esa cuenta. */
  accountId?: string
}

/**
 * `type` y `transfer_direction` llegan como `string` desde los tipos generados
 * de Supabase, pero calculations.ts trabaja con uniones cerradas. Este adaptador
 * es el único punto donde se hace ese estrechamiento.
 */
function toCalculationInput(transaction: DashboardTransaction): TransactionForCalculation {
  return {
    type: transaction.type as TransactionForCalculation['type'],
    transfer_direction:
      transaction.transfer_direction as TransactionForCalculation['transfer_direction'],
    account_id: transaction.account_id,
    amount_minor: transaction.amount_minor,
  }
}

function toAccountInput(account: DashboardAccount): AccountForCalculation {
  return { id: account.id, initial_balance_minor: account.initial_balance_minor }
}

function scopeAccounts(accounts: DashboardAccount[], accountId?: string): DashboardAccount[] {
  return accountId ? accounts.filter((account) => account.id === accountId) : accounts
}

function scopeTransactions(
  transactions: DashboardTransaction[],
  accountId?: string,
): DashboardTransaction[] {
  return accountId
    ? transactions.filter((transaction) => transaction.account_id === accountId)
    : transactions
}

function inMonth(transactions: DashboardTransaction[], monthKey: string) {
  return transactions.filter(
    (transaction) => monthOfIsoDate(transaction.transaction_date) === monthKey,
  )
}

/**
 * Movimientos hasta el último día del mes indicado. Las claves 'YYYY-MM' se
 * comparan como texto: su orden lexicográfico coincide con el cronológico.
 */
function upToEndOfMonth(transactions: DashboardTransaction[], monthKey: string) {
  return transactions.filter(
    (transaction) => monthOfIsoDate(transaction.transaction_date) <= monthKey,
  )
}

/**
 * Variación porcentual contra el mes anterior.
 *
 * Devuelve `null` cuando la base es 0, porque "creció un ∞%" no informa nada.
 * El divisor va en valor absoluto para que el signo represente la dirección
 * real del cambio incluso partiendo de un ahorro neto negativo.
 */
function percentDelta(currentMinor: number, previousMinor: number): number | null {
  if (previousMinor === 0) return null
  return ((currentMinor - previousMinor) / Math.abs(previousMinor)) * 100
}

export interface MetricComparison {
  currentMinor: number
  previousMinor: number
  deltaPercent: number | null
}

export interface DashboardSummary {
  /** Saldo consolidado al cierre del mes seleccionado, contra el cierre del anterior. */
  balance: MetricComparison
  income: MetricComparison
  expense: MetricComparison
  netSavings: MetricComparison
  savingsRate: {
    current: number | null
    previous: number | null
    /** Diferencia en puntos porcentuales, no en porcentaje sobre porcentaje. */
    deltaPoints: number | null
  }
  /** Movimientos del mes seleccionado dentro del alcance actual. */
  monthTransactionCount: number
}

function comparison(currentMinor: number, previousMinor: number): MetricComparison {
  return {
    currentMinor,
    previousMinor,
    deltaPercent: percentDelta(currentMinor, previousMinor),
  }
}

export function buildDashboardSummary({
  accounts,
  transactions,
  monthKey,
  accountId,
}: DashboardScope): DashboardSummary {
  const scopedAccounts = scopeAccounts(accounts, accountId).map(toAccountInput)
  const scoped = scopeTransactions(transactions, accountId)
  const earlierMonthKey = previousMonthKey(monthKey)

  const balanceAt = (key: string) =>
    calculateConsolidatedBalance(scopedAccounts, upToEndOfMonth(scoped, key).map(toCalculationInput))

  const current = inMonth(scoped, monthKey)
  const previous = inMonth(scoped, earlierMonthKey).map(toCalculationInput)
  const currentForCalculation = current.map(toCalculationInput)

  const incomeCurrent = calculateMonthlyIncome(currentForCalculation)
  const incomePrevious = calculateMonthlyIncome(previous)
  const expenseCurrent = calculateMonthlyExpense(currentForCalculation)
  const expensePrevious = calculateMonthlyExpense(previous)

  return {
    balance: comparison(balanceAt(monthKey), balanceAt(earlierMonthKey)),
    income: comparison(incomeCurrent, incomePrevious),
    expense: comparison(expenseCurrent, expensePrevious),
    netSavings: comparison(
      calculateNetSavings(incomeCurrent, expenseCurrent),
      calculateNetSavings(incomePrevious, expensePrevious),
    ),
    savingsRate: buildSavingsRate(
      calculateSavingsRate(incomeCurrent, expenseCurrent),
      calculateSavingsRate(incomePrevious, expensePrevious),
    ),
    monthTransactionCount: current.length,
  }
}

function buildSavingsRate(current: number | null, previous: number | null) {
  return {
    current,
    previous,
    deltaPoints: current === null || previous === null ? null : current - previous,
  }
}

export interface CategorySlice {
  id: string
  name: string
  color: string
  amountMinor: number
  /** Proporción sobre el gasto total del mes, entre 0 y 1. */
  share: number
}

/** Color de respaldo para categorías sin color propio y para el grupo "Otras". */
const FALLBACK_SLICE_COLOR = '#94A3B8'

/**
 * Gasto del mes agrupado por categoría, de mayor a menor.
 *
 * Un donut deja de ser legible pasadas ~6 porciones, así que las categorías
 * sobrantes se agrupan en "Otras categorías" en vez de dibujar 20 rebanadas
 * indistinguibles. Las transferencias quedan fuera: mover dinero entre cuentas
 * propias no es gasto.
 */
export function buildCategoryBreakdown(
  { transactions, categories, monthKey, accountId }: DashboardScope & {
    categories: DashboardCategory[]
  },
  maxSlices = 5,
): CategorySlice[] {
  const expenses = inMonth(scopeTransactions(transactions, accountId), monthKey).filter(
    (transaction) => transaction.type === 'expense',
  )

  const total = expenses.reduce((sum, transaction) => sum + transaction.amount_minor, 0)
  if (total === 0) return []

  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const totals = new Map<string, number>()

  for (const expense of expenses) {
    const key = expense.category_id ?? 'uncategorized'
    totals.set(key, (totals.get(key) ?? 0) + expense.amount_minor)
  }

  const ranked = [...totals.entries()]
    .map(([id, amountMinor]) => ({
      id,
      name: categoryById.get(id)?.name ?? 'Sin categoría',
      color: categoryById.get(id)?.color ?? FALLBACK_SLICE_COLOR,
      amountMinor,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor)

  const visible = ranked.length > maxSlices ? ranked.slice(0, maxSlices - 1) : ranked
  const rest = ranked.slice(visible.length)

  if (rest.length > 0) {
    visible.push({
      id: 'other',
      name: 'Otras categorías',
      color: FALLBACK_SLICE_COLOR,
      amountMinor: rest.reduce((sum, slice) => sum + slice.amountMinor, 0),
    })
  }

  return visible.map((slice) => ({ ...slice, share: slice.amountMinor / total }))
}

export interface TrendPoint {
  monthKey: string
  /** Etiqueta corta para el eje X ('sep'). */
  label: string
  incomeMinor: number
  expenseMinor: number
  /** Saldo consolidado al cierre de ese mes. */
  balanceMinor: number
}

/**
 * Serie de los últimos `months` meses terminando en el mes seleccionado.
 * Alimenta tanto el gráfico de ingresos vs gastos como la tendencia de saldo.
 */
export function buildMonthlyTrend(
  { accounts, transactions, monthKey, accountId }: DashboardScope,
  months = 6,
): TrendPoint[] {
  const scopedAccounts = scopeAccounts(accounts, accountId).map(toAccountInput)
  const scoped = scopeTransactions(transactions, accountId)

  return recentMonthKeys(monthKey, months).map((key) => {
    const monthTransactions = inMonth(scoped, key).map(toCalculationInput)

    return {
      monthKey: key,
      label: formatMonthShort(key),
      incomeMinor: calculateMonthlyIncome(monthTransactions),
      expenseMinor: calculateMonthlyExpense(monthTransactions),
      balanceMinor: calculateConsolidatedBalance(
        scopedAccounts,
        upToEndOfMonth(scoped, key).map(toCalculationInput),
      ),
    }
  })
}

/**
 * Movimientos más recientes del mes seleccionado. La consulta ya llega ordenada
 * por fecha descendente, pero se reordena para no depender de ese detalle.
 */
export function buildRecentTransactions(
  { transactions, monthKey, accountId }: DashboardScope,
  limit = 5,
): DashboardTransaction[] {
  return [...inMonth(scopeTransactions(transactions, accountId), monthKey)]
    .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
    .slice(0, limit)
}
