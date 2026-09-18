import {
  calculateBalancesByCurrency,
  calculateConsolidatedBalance,
  calculateMonthlyExpense,
  calculateMonthlyIncome,
  calculateNetSavings,
  calculateSavingsRate,
  type AccountForCalculation,
  type TransactionForCalculation,
} from '@/lib/calculations'
import { sortCurrencyCodes } from '@/lib/currency'
import { formatMonthShort, monthOfIsoDate, previousMonthKey, recentMonthKeys } from '@/lib/dates'
import { SWATCHES } from '@/lib/palette'

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
  /**
   * Si se indica, solo cuentan las cuentas en esa moneda y sus movimientos.
   * FinTrack no convierte divisas: sumar cuentas de monedas distintas daría una
   * cifra sin sentido.
   */
  currencyCode?: string
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

function scopeAccounts(
  accounts: DashboardAccount[],
  { accountId, currencyCode }: Pick<DashboardScope, 'accountId' | 'currencyCode'>,
): DashboardAccount[] {
  return accounts.filter(
    (account) =>
      (!accountId || account.id === accountId) &&
      (!currencyCode || account.currency_code === currencyCode),
  )
}

/**
 * Movimientos de las cuentas del alcance. Sin filtros, todos.
 *
 * Se exporta para que la comparación entre meses (`comparison.ts`) recorte
 * exactamente igual que el resto del dashboard. La diferencia con
 * `partitionByAccountCurrency` importa: aquí un movimiento cuya cuenta no está
 * en la lista **queda fuera**, mientras que en el Plan y el Libro una cuenta
 * desconocida se queda dentro, en la moneda de la pantalla. Dos cálculos que
 * dijeran "gasto de septiembre en COP" con criterios distintos acabarían dando
 * cifras distintas.
 */
export function scopeTransactions(
  transactions: DashboardTransaction[],
  accounts: DashboardAccount[],
  filters: Pick<DashboardScope, 'accountId' | 'currencyCode'>,
): DashboardTransaction[] {
  if (!filters.accountId && !filters.currencyCode) return transactions

  const accountIds = new Set(scopeAccounts(accounts, filters).map((account) => account.id))
  return transactions.filter((transaction) => accountIds.has(transaction.account_id))
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
  currencyCode,
}: DashboardScope): DashboardSummary {
  const filters = { accountId, currencyCode }
  const scopedAccounts = scopeAccounts(accounts, filters).map(toAccountInput)
  const scoped = scopeTransactions(transactions, accounts, filters)
  const earlierMonthKey = previousMonthKey(monthKey)

  const balanceAt = (key: string) =>
    calculateConsolidatedBalance(
      scopedAccounts,
      upToEndOfMonth(scoped, key).map(toCalculationInput),
    )

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
  {
    accounts,
    transactions,
    categories,
    monthKey,
    accountId,
    currencyCode,
  }: DashboardScope & {
    categories: DashboardCategory[]
  },
  maxSlices = 5,
): CategorySlice[] {
  const scoped = scopeTransactions(transactions, accounts, { accountId, currencyCode })
  const expenses = inMonth(scoped, monthKey).filter((transaction) => transaction.type === 'expense')

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
      color: categoryById.get(id)?.color ?? null,
      amountMinor,
    }))
    .sort((a, b) => b.amountMinor - a.amountMinor)

  const visible = ranked.length > maxSlices ? ranked.slice(0, maxSlices - 1) : ranked
  const rest = ranked.slice(visible.length)

  // Las categorías sin color propio (por ejemplo, creadas antes de guardar
  // colores) reciben uno de la paleta según su posición, en vez de repetir
  // el mismo gris para todas y volver el donut ilegible.
  const paletted = visible.map((slice, index) => ({
    ...slice,
    color: slice.color ?? SWATCHES[index % SWATCHES.length],
  }))

  if (rest.length > 0) {
    paletted.push({
      id: 'other',
      name: 'Otras categorías',
      color: FALLBACK_SLICE_COLOR,
      amountMinor: rest.reduce((sum, slice) => sum + slice.amountMinor, 0),
    })
  }

  return paletted.map((slice) => ({ ...slice, share: slice.amountMinor / total }))
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
  { accounts, transactions, monthKey, accountId, currencyCode }: DashboardScope,
  months = 6,
): TrendPoint[] {
  const filters = { accountId, currencyCode }
  const scopedAccounts = scopeAccounts(accounts, filters).map(toAccountInput)
  const scoped = scopeTransactions(transactions, accounts, filters)

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

export interface CurrencyBalance {
  currencyCode: string
  balanceMinor: number
}

/**
 * Saldo al cierre del mes seleccionado de cada moneda en la que el usuario
 * tiene cuentas, dentro del alcance de cuenta. Ignora `currencyCode`: sirve
 * justamente para mostrar lo que queda fuera de la moneda de presentación.
 *
 * Va con la moneda principal primero y el resto en el orden fijo de monedas.
 */
export function buildCurrencyBalances(
  { accounts, transactions, monthKey, accountId }: DashboardScope,
  primaryCode?: string | null,
): CurrencyBalance[] {
  const scopedAccounts = scopeAccounts(accounts, { accountId })
  const scoped = scopeTransactions(transactions, accounts, { accountId })
  const balances = calculateBalancesByCurrency(
    scopedAccounts,
    upToEndOfMonth(scoped, monthKey).map(toCalculationInput),
  )

  return sortCurrencyCodes(balances.keys(), primaryCode).map((currencyCode) => ({
    currencyCode,
    balanceMinor: balances.get(currencyCode) ?? 0,
  }))
}

/**
 * Si el mes tiene un presupuesto asignado a la categoría, **incluido un 0
 * explícito**. `budgetMinor` es nulo tanto sin presupuesto como con 0; lo que
 * los distingue es `source`, presente cuando algo resolvió el mes. El panel de
 * presupuestos del dashboard solo muestra estas categorías.
 */
export function hasBudgetThisMonth(progress: { source: string | null }): boolean {
  return progress.source !== null
}
