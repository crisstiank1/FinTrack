import {
  calculateConsolidatedBalance,
  type AccountForCalculation,
  type TransactionForCalculation,
} from '@/lib/calculations'

/**
 * Una transferencia registrada, ya emparejada con el tipo de cuenta de cada
 * pata. Quien llama resuelve el emparejamiento por `transfer_group_id` y el
 * tipo de ambas cuentas antes de pasarlo aquí — esta función no lo recalcula
 * (docs/09-plan-mensual.md: "sin recalcular rangos ni relaciones dentro de
 * `calculations/`").
 */
export interface TransferContributionCandidate {
  amountMinor: number
  destinationAccountType: string
  sourceAccountType: string
}

/**
 * aportesAhorro / aportesInversion: suma de la pata entrante de
 * transferencias registradas hacia una cuenta del tipo objetivo, excluyendo
 * el caso en que origen y destino comparten tipo (docs/09-plan-mensual.md).
 * Contar solo la pata entrante es lo que impide sumar dos veces el mismo
 * movimiento, ya que una transferencia son dos filas.
 */
export function sumTransferContributions(
  candidates: TransferContributionCandidate[],
  targetAccountType: string,
): number {
  return candidates
    .filter(
      (candidate) =>
        candidate.destinationAccountType === targetAccountType &&
        candidate.sourceAccountType !== targetAccountType,
    )
    .reduce((sum, candidate) => sum + candidate.amountMinor, 0)
}

export interface AccountWithType extends AccountForCalculation {
  type: string
}

/**
 * saldoEnAhorro: saldo acumulado de las cuentas de un tipo dado. Es un stock,
 * no un flujo del mes. Reutiliza `calculateConsolidatedBalance` de
 * `@/lib/calculations` — la misma cuenta que ya usan `/accounts` y
 * `/dashboard` — restringida a las cuentas del tipo pedido, en vez de
 * reimplementar la aritmética de saldo.
 */
export function calculateBalanceForAccountType(
  accounts: AccountWithType[],
  transactions: TransactionForCalculation[],
  accountType: string,
): number {
  const filteredAccounts = accounts.filter((account) => account.type === accountType)
  return calculateConsolidatedBalance(filteredAccounts, transactions)
}
