import { signedAmountMinor, type TransactionForCalculation } from '@/lib/calculations'

export interface BalanceAccount {
  id: string
  initial_balance_minor: number
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
  accountId?: string,
): Map<string, number> {
  const scopedAccounts = accountId ? accounts.filter((a) => a.id === accountId) : accounts
  const scoped = accountId
    ? transactions.filter((t) => t.account_id === accountId)
    : transactions

  const deltaByDate = new Map<string, number>()
  for (const transaction of scoped) {
    const previous = deltaByDate.get(transaction.transaction_date) ?? 0
    deltaByDate.set(
      transaction.transaction_date,
      previous + signedAmountMinor(toCalculationInput(transaction)),
    )
  }

  let balance = scopedAccounts.reduce(
    (sum, account) => sum + account.initial_balance_minor,
    0,
  )

  const balanceByDate = new Map<string, number>()
  // Las fechas 'YYYY-MM-DD' ordenan lexicográficamente igual que cronológicamente.
  for (const date of [...deltaByDate.keys()].sort()) {
    balance += deltaByDate.get(date) ?? 0
    balanceByDate.set(date, balance)
  }

  return balanceByDate
}
