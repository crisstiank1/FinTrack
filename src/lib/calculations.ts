export interface TransactionForCalculation {
  type: 'income' | 'expense' | 'transfer'
  transfer_direction: 'incoming' | 'outgoing' | null
  account_id: string
  amount_minor: number
}

export interface AccountForCalculation {
  id: string
  initial_balance_minor: number
}

/**
 * Saldo de una cuenta: saldo inicial + ingresos - gastos + transferencias
 * recibidas - transferencias enviadas (docs/02-base-de-datos.md).
 */
export function calculateAccountBalance(
  initialBalanceMinor: number,
  transactions: TransactionForCalculation[],
  accountId: string,
): number {
  return transactions
    .filter((transaction) => transaction.account_id === accountId)
    .reduce((balance, transaction) => {
      if (transaction.type === 'income') return balance + transaction.amount_minor
      if (transaction.type === 'expense') return balance - transaction.amount_minor
      if (transaction.type === 'transfer') {
        return transaction.transfer_direction === 'incoming'
          ? balance + transaction.amount_minor
          : balance - transaction.amount_minor
      }
      return balance
    }, initialBalanceMinor)
}

/**
 * Saldo consolidado: suma de los saldos de todas las cuentas del usuario.
 * Las transferencias entre cuentas propias se cancelan entre sí (una cuenta
 * suma, la otra resta la misma cantidad), por lo que no alteran el total.
 */
export function calculateConsolidatedBalance(
  accounts: AccountForCalculation[],
  transactions: TransactionForCalculation[],
): number {
  return accounts.reduce(
    (total, account) =>
      total + calculateAccountBalance(account.initial_balance_minor, transactions, account.id),
    0,
  )
}

/** Suma de movimientos de tipo income. Las transferencias no cuentan. */
export function calculateMonthlyIncome(
  transactions: Pick<TransactionForCalculation, 'type' | 'amount_minor'>[],
): number {
  return transactions
    .filter((transaction) => transaction.type === 'income')
    .reduce((sum, transaction) => sum + transaction.amount_minor, 0)
}

/** Suma de movimientos de tipo expense. Las transferencias no cuentan. */
export function calculateMonthlyExpense(
  transactions: Pick<TransactionForCalculation, 'type' | 'amount_minor'>[],
): number {
  return transactions
    .filter((transaction) => transaction.type === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount_minor, 0)
}

/** Ahorro neto del período: ingresos - gastos. */
export function calculateNetSavings(incomeMinor: number, expenseMinor: number): number {
  return incomeMinor - expenseMinor
}

/**
 * Tasa de ahorro en porcentaje. Si los ingresos son 0, retorna null en vez
 * de NaN/Infinity (docs/02-base-de-datos.md).
 */
export function calculateSavingsRate(incomeMinor: number, expenseMinor: number): number | null {
  if (incomeMinor === 0) return null
  return ((incomeMinor - expenseMinor) / incomeMinor) * 100
}
