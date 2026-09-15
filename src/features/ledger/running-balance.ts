import { signedAmountMinor, type TransactionForCalculation } from '@/lib/calculations'

export interface BalanceAccount {
  id: string
  currency_code: string
  initial_balance_minor: number
}

/** Cuentas que abarca el saldo: las que cumplen a la vez cuenta y moneda. */
export interface BalanceScope {
  accountId?: string
  currencyCode?: string
}

function isInScope(account: { id: string; currency_code: string }, scope: BalanceScope): boolean {
  return (
    (!scope.accountId || account.id === scope.accountId) &&
    (!scope.currencyCode || account.currency_code === scope.currencyCode)
  )
}

/**
 * Se aceptan los tipos anchos (`string`) que devuelven los tipos generados de
 * Supabase y se estrechan aquí, igual que en el resumen del dashboard.
 */
export interface BalanceTransaction {
  type: string
  transfer_direction: string | null
  account_id: string
  amount_minor: number
  transaction_date: string
}

function toCalculationInput(transaction: BalanceTransaction): TransactionForCalculation {
  return {
    type: transaction.type as TransactionForCalculation['type'],
    transfer_direction:
      transaction.transfer_direction as TransactionForCalculation['transfer_direction'],
    account_id: transaction.account_id,
    amount_minor: transaction.amount_minor,
  }
}

/**
 * Moneda en la que se puede mostrar el saldo acumulado, o `null` si no hay una.
 *
 * El saldo suma cuentas: solo tiene sentido si todas las del alcance comparten
 * moneda. Con cuentas en varias monedas y sin filtro de cuenta ni de moneda
 * devuelve `null`, y la columna no muestra cifras en vez de sumar pesos con
 * dólares.
 */
export function runningBalanceCurrency(
  accounts: readonly { id: string; currency_code: string }[],
  scope: BalanceScope = {},
): string | null {
  const scoped = accounts.filter((account) => isInScope(account, scope))
  const currencies = new Set(scoped.map((account) => account.currency_code))
  return currencies.size === 1 ? [...currencies][0] : null
}

/**
 * Saldo acumulado al cierre de cada día con movimientos.
 *
 * Se acumula por día y no por fila porque el orden de dos movimientos dentro
 * de la misma fecha es arbitrario: `transaction_date` no guarda la hora, así
 * que un "saldo tras este movimiento" dependería del orden en que la consulta
 * devolvió las filas y cambiaría al reordenar la tabla. El saldo al cierre del
 * día es el mismo sin importar cómo se ordene.
 *
 * Requiere el historial completo: el saldo de un día arrastra todo lo anterior.
 */
export function buildDailyBalances(
  accounts: BalanceAccount[],
  transactions: BalanceTransaction[],
  scope: BalanceScope = {},
): Map<string, number> {
  const scopedAccounts = accounts.filter((account) => isInScope(account, scope))
  const scopedIds = new Set(scopedAccounts.map((account) => account.id))
  const isScoped = Boolean(scope.accountId || scope.currencyCode)
  const scoped = isScoped
    ? transactions.filter((transaction) => scopedIds.has(transaction.account_id))
    : transactions

  const deltaByDate = new Map<string, number>()
  for (const transaction of scoped) {
    const previous = deltaByDate.get(transaction.transaction_date) ?? 0
    deltaByDate.set(
      transaction.transaction_date,
      previous + signedAmountMinor(toCalculationInput(transaction)),
    )
  }

  let balance = scopedAccounts.reduce((sum, account) => sum + account.initial_balance_minor, 0)

  const balanceByDate = new Map<string, number>()
  // Las fechas 'YYYY-MM-DD' ordenan lexicográficamente igual que cronológicamente.
  for (const date of [...deltaByDate.keys()].sort()) {
    balance += deltaByDate.get(date) ?? 0
    balanceByDate.set(date, balance)
  }

  return balanceByDate
}
