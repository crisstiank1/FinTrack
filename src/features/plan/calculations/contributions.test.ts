import { describe, expect, it } from 'vitest'

import {
  calculateBalanceForAccountType,
  sumTransferContributions,
  type AccountWithType,
  type TransferContributionCandidate,
} from './contributions'

describe('sumTransferContributions', () => {
  it('cuenta una transferencia de banco a ahorro como aporte', () => {
    const candidates: TransferContributionCandidate[] = [
      { amountMinor: 100_000, destinationAccountType: 'savings', sourceAccountType: 'checking' },
    ]

    expect(sumTransferContributions(candidates, 'savings')).toBe(100_000)
  })

  it('excluye una transferencia entre dos cuentas del mismo tipo (ahorro a ahorro)', () => {
    const candidates: TransferContributionCandidate[] = [
      { amountMinor: 50_000, destinationAccountType: 'savings', sourceAccountType: 'savings' },
    ]

    expect(sumTransferContributions(candidates, 'savings')).toBe(0)
  })

  it('no mezcla aportes de ahorro con los de inversión', () => {
    const candidates: TransferContributionCandidate[] = [
      { amountMinor: 100_000, destinationAccountType: 'savings', sourceAccountType: 'checking' },
      { amountMinor: 40_000, destinationAccountType: 'investment', sourceAccountType: 'checking' },
    ]

    expect(sumTransferContributions(candidates, 'savings')).toBe(100_000)
    expect(sumTransferContributions(candidates, 'investment')).toBe(40_000)
  })

  it('ignora una transferencia hacia una cuenta de otro tipo (ej. credit_card)', () => {
    const candidates: TransferContributionCandidate[] = [
      { amountMinor: 20_000, destinationAccountType: 'credit_card', sourceAccountType: 'checking' },
    ]

    expect(sumTransferContributions(candidates, 'savings')).toBe(0)
  })

  it('sin candidatos, el aporte es cero', () => {
    expect(sumTransferContributions([], 'savings')).toBe(0)
  })
})

describe('calculateBalanceForAccountType', () => {
  const accounts: AccountWithType[] = [
    { id: 'a1', type: 'savings', initial_balance_minor: 100_000 },
    { id: 'a2', type: 'checking', initial_balance_minor: 500_000 },
  ]

  it('solo suma el saldo de las cuentas del tipo pedido', () => {
    const transactions = [
      { type: 'income' as const, transfer_direction: null, account_id: 'a1', amount_minor: 20_000 },
      {
        type: 'expense' as const,
        transfer_direction: null,
        account_id: 'a2',
        amount_minor: 300_000,
      },
    ]

    expect(calculateBalanceForAccountType(accounts, transactions, 'savings')).toBe(120_000)
    expect(calculateBalanceForAccountType(accounts, transactions, 'checking')).toBe(200_000)
  })

  it('sin cuentas del tipo pedido, el saldo es cero', () => {
    expect(calculateBalanceForAccountType(accounts, [], 'investment')).toBe(0)
  })
})
