import { describe, expect, it } from 'vitest'

import { buildDailyBalances, type BalanceTransaction } from './running-balance'

const accounts = [
  { id: 'acc-1', initial_balance_minor: 100_000 },
  { id: 'acc-2', initial_balance_minor: 50_000 },
]

function tx(overrides: Partial<BalanceTransaction>): BalanceTransaction {
  return {
    type: 'expense',
    transfer_direction: null,
    account_id: 'acc-1',
    amount_minor: 0,
    transaction_date: '2026-09-10',
    ...overrides,
  }
}

describe('buildDailyBalances', () => {
  it('acumula el saldo día a día desde los saldos iniciales', () => {
    const balances = buildDailyBalances(accounts, [
      tx({ type: 'income', amount_minor: 200_000, transaction_date: '2026-09-05' }),
      tx({ amount_minor: 50_000, transaction_date: '2026-09-10' }),
      tx({ amount_minor: 20_000, transaction_date: '2026-09-15' }),
    ])

    expect(balances.get('2026-09-05')).toBe(350_000)
    expect(balances.get('2026-09-10')).toBe(300_000)
    expect(balances.get('2026-09-15')).toBe(280_000)
  })

  it('suma varios movimientos del mismo día en un solo saldo', () => {
    const balances = buildDailyBalances(accounts, [
      tx({ type: 'income', amount_minor: 80_000, transaction_date: '2026-09-05' }),
      tx({ amount_minor: 30_000, transaction_date: '2026-09-05' }),
    ])

    expect(balances.size).toBe(1)
    expect(balances.get('2026-09-05')).toBe(200_000)
  })

  it('no depende del orden en que lleguen los movimientos', () => {
    const chronological = buildDailyBalances(accounts, [
      tx({ type: 'income', amount_minor: 200_000, transaction_date: '2026-09-05' }),
      tx({ amount_minor: 50_000, transaction_date: '2026-09-10' }),
    ])
    const reversed = buildDailyBalances(accounts, [
      tx({ amount_minor: 50_000, transaction_date: '2026-09-10' }),
      tx({ type: 'income', amount_minor: 200_000, transaction_date: '2026-09-05' }),
    ])

    expect([...reversed.entries()]).toEqual([...chronological.entries()])
  })

  it('las transferencias entre cuentas propias no alteran el saldo consolidado', () => {
    const balances = buildDailyBalances(accounts, [
      tx({
        type: 'transfer',
        transfer_direction: 'outgoing',
        account_id: 'acc-1',
        amount_minor: 40_000,
        transaction_date: '2026-09-08',
      }),
      tx({
        type: 'transfer',
        transfer_direction: 'incoming',
        account_id: 'acc-2',
        amount_minor: 40_000,
        transaction_date: '2026-09-08',
      }),
    ])

    expect(balances.get('2026-09-08')).toBe(150_000)
  })

  it('limita el saldo a la cuenta indicada', () => {
    const balances = buildDailyBalances(
      accounts,
      [
        tx({ amount_minor: 30_000, account_id: 'acc-1', transaction_date: '2026-09-08' }),
        tx({
          type: 'transfer',
          transfer_direction: 'incoming',
          account_id: 'acc-2',
          amount_minor: 40_000,
          transaction_date: '2026-09-08',
        }),
      ],
      'acc-2',
    )

    // Solo el saldo inicial de acc-2 más la transferencia recibida.
    expect(balances.get('2026-09-08')).toBe(90_000)
  })

  it('devuelve un mapa vacío sin movimientos', () => {
    expect(buildDailyBalances(accounts, []).size).toBe(0)
  })
})
